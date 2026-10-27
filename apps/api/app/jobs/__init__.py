"""정기 실행 B-xx (상세설계 '처리 로직' ③). 스케줄러(cron 등)는 배포 환경에서 정함 → python -m app.jobs B-01"""
from __future__ import annotations

import logging

from .. import clock
from .. import settings as S
from ..adapters.mail import notify
from ..adapters import payment
from ..adapters.partner import PartnerError
from ..db import one, rows, run, tx
from ..services.booking import apply_order, refund_booking
from ..services.departures import generate_departures

log = logging.getLogger("golf.jobs")


def judge_departures() -> dict:
    """B-01 / L-10 출발 판정: 판정일이 오늘(또는 지난) OPEN 출발편을 1건씩 트랜잭션으로"""
    today = clock.today()
    with tx() as c:
        targets = [r["id"] for r in rows(c, "SELECT id FROM departure WHERE status = 'OPEN' AND judge_date <= :t ORDER BY judge_date, id", t=today)]
    out = {"go": 0, "cancel": 0, "failed": 0}
    for dep_id in targets:
        try:
            with tx() as c:
                d = one(c, "SELECT booked_count, min_people, status FROM departure WHERE id = :id FOR UPDATE", id=dep_id)
                if d["status"] != "OPEN":
                    continue
                go = d["booked_count"] >= d["min_people"]
                run(c, "UPDATE departure SET status = :s, judged_at = UTC_TIMESTAMP(3) WHERE id = :id", s="GO" if go else "CANCEL", id=dep_id)
                if not go:
                    run(c, "UPDATE booking SET status='OP_CANCEL', cancel_by='OP', canceled_at=UTC_TIMESTAMP(3) WHERE departure_id=:id AND status='CONFIRMED'", id=dep_id)
                run(c, "DELETE FROM seat_hold WHERE departure_id = :id", id=dep_id)  # 판정 후 예약 받지 않음
            with tx() as c:
                bs = rows(c, """SELECT b.no, m.email FROM booking b JOIN booking_member m ON m.booking_no = b.no AND m.seq = 1
                                WHERE b.departure_id = :id AND b.status = :st ORDER BY b.no""", id=dep_id, st="CONFIRMED" if go else "OP_CANCEL")
            for b in bs:  # 운행 취소 환불은 주문별로 차례로. 한 건이 실패해도(FAIL 기록 + 운영자 알림) 다음 건은 계속
                if not go:
                    refund_booking(b["no"], "operator_cancel")
                with tx() as c:
                    notify(c, b["no"], b["email"], "GO" if go else "CANCEL")
            out["go" if go else "cancel"] += 1
        except Exception:  # noqa: BLE001  TODO: 재시도 3회 후 운영 메일 (B-01)
            out["failed"] += 1
            log.exception("judge failed %s", dep_id)
    return out


def cleanup_holds() -> int:
    """B-02 좌석 확보 정리. 만료 후 1시간은 남겨 둠 (결제가 만료 직후 끝나도 L-08 2)에서 확보 인원을 알 수 있게, 개발 결정)"""
    with tx() as c:
        return run(c, "DELETE FROM seat_hold WHERE expires_at < UTC_TIMESTAMP(3) - INTERVAL :m MINUTE", m=S.HOLD_KEEP_AFTER_EXPIRE_MIN)


def complete_trips() -> int:
    """B-03 여행 완료"""
    with tx() as c:
        ids = [r["id"] for r in rows(c, """SELECT d.id FROM departure d JOIN package p ON p.id = d.package_id
                                         WHERE d.status = 'GO' AND DATE_ADD(d.dep_date, INTERVAL p.nights DAY) < :t FOR UPDATE""", t=clock.today())]
        for i in ids:
            run(c, "UPDATE departure SET status = 'DONE' WHERE id = :id", id=i)
            run(c, "UPDATE booking SET status = 'DONE' WHERE departure_id = :id AND status = 'CONFIRMED'", id=i)
    return len(ids)


def make_departures() -> int:
    """B-04 출발편 만들기"""
    with tx() as c:
        return generate_departures(c)


def check_payments() -> dict:
    """B-08 결제 확인 (10분마다): 결제 대기 예약을 정리
    - 주문 전 결제 대기가 HOLD_MINUTES 분 지남 → UNPAID (좌석 풀림)
    - 주문 후 결제 대기 → 본 사이트 주문 상태를 다시 조회해 반영 (paid 확정, failed·expired 미결제, pending·authenticating 그대로)"""
    out = {"expired": 0, "confirmed": 0, "unpaid": 0, "waiting": 0, "error": 0}
    with tx() as c:
        out["expired"] = run(c, f"""UPDATE booking SET status = 'UNPAID' WHERE status = 'PENDING_PAYMENT' AND order_id IS NULL
                                    AND created_at < UTC_TIMESTAMP(3) - INTERVAL {S.HOLD_MINUTES} MINUTE""")
        targets = rows(c, "SELECT no, order_id FROM booking WHERE status = 'PENDING_PAYMENT' AND order_id IS NOT NULL ORDER BY created_at")
    for t in targets:
        try:
            st = apply_order(t["no"], payment.get_order(t["order_id"]))
        except PartnerError as e:  # 한 건이 실패해도 다음 건은 계속 (다음 주기에 다시)
            log.warning("payment check failed %s %s %s", t["no"], e.status, e.code)
            out["error"] += 1
            continue
        out[{"CONFIRMED": "confirmed", "UNPAID": "unpaid", "PENDING_PAYMENT": "waiting"}.get(st, "confirmed")] += 1
    return out


def retry_refunds() -> dict:
    """B-07 환불 재시도: 환불 실패(refund_status = FAIL)한 운행 취소·고객 취소 예약을 본 사이트에 다시 환불 요청.
    주문별로 차례로, 한 건이 또 실패해도(FAIL 유지 + 운영자 알림) 다음 건은 계속"""
    with tx() as c:
        targets = rows(c, """SELECT no, status FROM booking WHERE refund_status = 'FAIL' AND status IN ('OP_CANCEL', 'USER_CANCEL')
                             AND order_id IS NOT NULL ORDER BY canceled_at, no""")
    out = {"done": 0, "fail": 0}
    for t in targets:
        st = refund_booking(t["no"], "operator_cancel" if t["status"] == "OP_CANCEL" else "customer_cancel")
        out["fail" if st == "FAIL" else "done"] += 1
    return out


JOBS = {"B-01": judge_departures, "B-02": cleanup_holds, "B-03": complete_trips, "B-04": make_departures,
        "B-07": retry_refunds, "B-08": check_payments}
