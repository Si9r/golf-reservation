"""정기 실행 시간표 (팀 결정 11/05). 서버가 켜져 있는 동안 매분 0초에 확인해 때가 된 배치를 차례로 실행. 시각은 JST.
켜기: .env JOBS_ENABLED=1 (기본 꺼짐 → 로컬 개발·테스트에서는 돌지 않음). 손으로 돌리기는 그대로 python -m app.jobs B-01
서버를 여러 개 띄워도 DB 잠금(GET_LOCK)으로 동시에는 한 곳만 돎. 뒤이어 다른 곳이 돌아도 배치는 남은 일만 하므로 같은 일을 두 번 하지 않음"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from ..db import engine
from . import JOBS

log = logging.getLogger("golf.jobs")
JST = timezone(timedelta(hours=9))
LOCK = "golf_jobs"
LAST_RUN: dict = {"at": None, "jobs": []}  # API-24 상태 확인용: 이 서버가 마지막으로 정기 실행을 돈 시각(UTC)과 배치

# (설명, 그 분에 돌지, 배치). 같은 분에 여러 줄이 걸리면 위에서부터, 겹치는 배치는 한 번만
SCHEDULE = [
    ("매일 09:00", lambda t: (t.hour, t.minute) == (9, 0), ["B-08", "B-01", "B-03", "B-04"]),  # 판정 직전 결제 확인 → 출발 판정 → 여행 완료 → 출발편 만들기
    ("10분마다", lambda t: t.minute % 10 == 0, ["B-08"]),  # 결제 확인
    ("매시 30분", lambda t: t.minute == 30, ["B-07", "B-09"]),  # 환불 재시도 · 안내 메일 재발송
]


def due(t: datetime) -> list[str]:
    """t(JST) 분에 돌릴 배치, 실행 순서대로"""
    out: list[str] = []
    for _, when, ids in SCHEDULE:
        if when(t):
            out += [x for x in ids if x not in out]
    return out


def run_due(ids: list[str]) -> bool:
    """배치를 차례로. 하나가 오류여도 다음 배치는 계속. 다른 곳이 실행 중이면 건너뜀 (False)"""
    with engine.connect() as c:
        if not c.execute(text("SELECT GET_LOCK(:n, 0)"), {"n": LOCK}).scalar():
            log.info("jobs %s skipped: 다른 서버가 실행 중", ids)
            return False
        try:
            for x in ids:
                try:
                    log.info("job %s %s", x, JOBS[x]())
                except Exception:  # noqa: BLE001
                    log.exception("job %s failed", x)
        finally:
            c.execute(text("SELECT RELEASE_LOCK(:n)"), {"n": LOCK})
            LAST_RUN.update(at=datetime.now(timezone.utc).isoformat(timespec="seconds"), jobs=list(ids))
    return True


def _loop(stop: threading.Event) -> None:
    while True:
        now = datetime.now(JST)
        at = (now + timedelta(minutes=1)).replace(second=0, microsecond=0)
        if stop.wait((at - now).total_seconds()):
            return
        ids = due(at)
        if ids:
            run_due(ids)  # 오래 걸려 다음 분을 넘기면 그 분은 건너뜀 (다음 차례에 남은 일을 함)


def start() -> threading.Event:
    """서버가 켜질 때 (main.py). 돌려주는 Event 를 set 하면 멈춤"""
    stop = threading.Event()
    threading.Thread(target=_loop, args=(stop,), name="golf-jobs", daemon=True).start()
    log.info("jobs schedule on: %s", ", ".join(f"{d} {' '.join(ids)}" for d, _, ids in SCHEDULE))
    return stop
