"""L-24 운영 작업 기록 (상세설계 v1.7, Alembic 0007 audit_log).
운영 키(ADMIN)·본 사이트 키(SITE)·배치(BATCH:B-xx)가 데이터를 바꿀 때 한 줄. 개인정보(이름·연락처·이메일)는 넣지 않음.
- audit: 본 처리와 같은 트랜잭션에 넣음 (본 처리가 되돌려지면 기록도 같이)
- audit_fail: 거절·실패한 요청은 본 처리 트랜잭션이 되돌려지므로 따로 커밋해 남김"""
from __future__ import annotations

import json
import logging

from sqlalchemy.engine import Connection

from .db import run, tx

log = logging.getLogger("golf.audit")

# 코드·상태 ① audit_log.action
ACTIONS = ("IMPORT", "ADMIN_CANCEL", "PICKUP_SET", "SITE_CANCEL", "MANIFEST", "JUDGE", "REFUND", "LATE_PAID", "PII_PURGE")


def audit(c: Connection, actor: str, action: str, target: str | None, detail: dict | None = None, result: str = "OK") -> None:
    if action not in ACTIONS:
        raise ValueError(f"알 수 없는 audit action: {action}")
    run(c, "INSERT INTO audit_log (actor, action, target, detail, result) VALUES (:a, :ac, :t, :d, :r)",
        a=actor[:20], ac=action, t=(target or None) and target[:60], d=json.dumps(detail, ensure_ascii=False, default=str) if detail else None, r=result)


def audit_fail(actor: str, action: str, target: str | None, detail: dict | None = None) -> None:
    """실패 기록은 따로 커밋. 기록이 실패해도 원래 오류를 가리지 않게 로그만 남김"""
    try:
        with tx() as c:
            audit(c, actor, action, target, detail, "FAIL")
    except Exception as e:  # noqa: BLE001
        log.warning("audit fail record failed %s %s: %s", action, target, e)
