"""본 사이트 결제·환불 (작업 지시 10/27 §5~§7, 질문 Q-15·Q-19). 결제 화면은 본 사이트, 이 서비스는 주문을 만들고 상태를 조회함.
호출은 adapters/partner.py (PAYMENT_BACKEND=fake | partner)"""
from __future__ import annotations

from ..config import env
from .partner import PartnerError, partner

MIN_AMOUNT = 100  # 본 사이트는 100엔 미만 주문을 거부 → 보내지 않음


def return_url(booking_no: str) -> str:
    """결제를 마치고(또는 그만두고) 돌아올 골프 결과 화면 (본 사이트에 절대 주소로 보냄)"""
    return env.PAYMENT_RETURN_URL.format(no=booking_no)


def create_order(*, reference: str, amount: int, title_ja: str, title_ko: str, user_id: str, departure_date: str, heads: int, return_url: str) -> dict:
    """POST /api/partner/orders. 같은 reference 로 이미 주문이 있으면(409 duplicate_reference) 응답 안의 기존 주문을 그대로 씀"""
    body = {"reference": reference, "amount": amount, "title": {"ja": title_ja, "ko": title_ko},  # [가정] title 다국어 객체, ja 필수
            "user_id": user_id, "return_url": return_url, "departure_date": departure_date, "heads": heads}
    try:
        return partner.create_order(body)
    except PartnerError as e:
        if e.status == 409 and e.code == "duplicate_reference" and isinstance(e.body.get("order"), dict):
            return e.body["order"]
        raise


def get_order(order_id: str) -> dict:
    """GET /api/partner/orders/{order_id}: status = paid | failed | expired | pending | authenticating | canceled"""
    return partner.get_order(order_id)


def cancel_order(order_id: str, reason: str) -> dict:
    """POST /api/partner/orders/{order_id}/cancel (환불). reason = operator_cancel | customer_cancel. paid 주문만, 전액만"""
    return partner.cancel_order(order_id, reason)
