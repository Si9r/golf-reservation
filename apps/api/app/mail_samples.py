"""테스트 메일: 이 서비스가 보내는 모든 메일 종류를 예시 예약으로 한 번씩 보냄 (DB·notification 기록 없음).
사용법 (apps/api 폴더에서): python -m app.mail_samples <받는 주소>
.env MAIL_BACKEND=smtp 이면 실제 발송 (보내는 주소 MAIL_FROM), log 면 로그만"""
from __future__ import annotations

import logging
import sys

from .adapters import mail as M
from .config import env

SAMPLE = {"no": "GT-261113-0001", "package_name": "삿포로 시내 숙박 2박 3일", "dep_date": "2026-11-13", "judge_date": "2026-11-06",
          "people": 3, "total": 221400, "name": "이정훈", "pickup_time": "10:20", "pick_place": "JR 삿포로역 남쪽 출구"}
KINDS = ("CONFIRM", "GO", "CANCEL", "PICKUP", "USER_CANCEL")  # CONFIRM 은 지금 본 사이트가 보내지만 템플릿 확인용으로 함께


# 운영자 알림 예시 (실제 알림과 같은 render_ops 로 만듦): 환불 실패 · 출발 판정 실패
OPS_BOOKING = {"no": SAMPLE["no"], "status": "OP_CANCEL", "people": 3, "total": 221400, "member_id": "M0001", "order_id": "ORD-20261106-0001",
               "order_status": "paid", "refund_status": "FAIL", "refund_id": None, "dep_id": "PKG-001-20261113", "dep_date": SAMPLE["dep_date"],
               "dep_status": "CANCEL", "package_name": SAMPLE["package_name"], "name": "이정훈", "name_en": "LEE JUNGHOON", "cc": "+82",
               "phone": "10-1234-5678", "email": "jh.lee@example.com"}
OPS_DEPARTURE = {"dep_id": "PKG-001-20261113", "dep_date": SAMPLE["dep_date"], "judge_date": SAMPLE["judge_date"], "dep_status": "OPEN",
                 "booked": 14, "min_people": 20, "confirmed": 5, "package_name": SAMPLE["package_name"]}


def samples() -> list[tuple[str, str, str]]:
    """(종류, 제목, 본문): 손님 안내 5종 + 운영자 알림 2종 (예시 값)"""
    from .services.booking import REFUND_HINT, REFUND_REASON_KO

    out = [(k, *M.render(k, SAMPLE)) for k in KINDS]
    order = OPS_BOOKING["order_id"]
    out.append(("OPS_REFUND", *M.render_ops(
        "환불 실패 (operator_cancel)",
        f"본 사이트 502 bad_gateway. {REFUND_REASON_KO['operator_cancel']}을 본 사이트 주문 {order}에 요청했지만 처리되지 않았습니다. {REFUND_HINT['bad_gateway']}",
        "환불 재시도 배치(B-07)가 자동으로 다시 요청합니다. 같은 알림이 계속 오면 본 사이트 관리 화면에서 "
        f"주문 {order}의 결제·환불 상태를 확인하고, 필요하면 고객에게 연락해 주세요. 고객이 문의하면 예약번호로 찾을 수 있습니다.",
        b=OPS_BOOKING)))
    out.append(("OPS_JUDGE", *M.render_ops(
        "출발 판정 실패",
        f"출발편 {OPS_DEPARTURE['dep_id']}의 출발 판정(B-01)을 3회 시도했지만 모두 오류로 끝났습니다. "
        "오류: OperationalError: (2013, 'Lost connection to MySQL server')",
        "아래 출발편 상태가 '모집 중'이면 판정이 되지 않은 것이고, '운행 취소'면 판정은 됐지만 환불·안내 메일이 덜 끝난 것입니다. "
        "서버 로그(golf.jobs)에서 원인을 확인한 뒤 B-01 을 다시 실행해 주세요 (apps/api 에서 python -m app.jobs B-01).",
        dep=OPS_DEPARTURE)))
    return out


def send_samples(to: str) -> list[tuple[str, str]]:
    """모든 종류를 to 로 한 번씩 (7통). 돌려주는 값: (종류, OK | 오류)"""
    result = []
    for kind, subject, body in samples():
        try:
            M.mail.send(to, f"[테스트] {subject}", body)
            result.append((kind, "OK"))
        except Exception as e:  # noqa: BLE001  한 종류가 실패해도 나머지는 보냄
            result.append((kind, f"{type(e).__name__}: {e}"))
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    if len(sys.argv) != 2 or "@" not in sys.argv[1]:
        sys.exit("받는 주소를 적어 주세요: python -m app.mail_samples someone@example.com")
    print(f"backend={env.MAIL_BACKEND} from={env.MAIL_FROM} smtp={env.SMTP_HOST or '-'}:{env.SMTP_PORT}")
    res = send_samples(sys.argv[1])
    for kind, r in res:
        print(f"{kind:12} {r}")
    sys.exit(0 if all(r == "OK" for _, r in res) else 1)
