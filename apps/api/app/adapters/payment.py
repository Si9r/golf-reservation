"""메인 사이트 결제·환불 연동 (L-08 1), L-15 / 질문 Q-15). 결제 화면은 메인 사이트, 이 서비스는 결제 ID로 확인만 함."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..config import env


@dataclass
class PaymentCheck:
    ok: bool
    amount: int
    currency: str = "JPY"


class PaymentProvider(Protocol):
    def verify(self, payment_id: str, expected_amount: int) -> PaymentCheck: ...
    def cancel(self, payment_id: str, reason: str) -> None: ...  # 금액 불일치 등 결제 자체 취소
    def refund(self, payment_id: str, amount: int, reason: str) -> str: ...  # L-15, 환불 ID 반환


class MockPayment:
    """목업: 'PAY-FAIL…' = 결제 실패, 'PAY-AMT…' = 금액 다름, 그 외 = 기대 금액대로 성공"""

    def verify(self, payment_id: str, expected_amount: int) -> PaymentCheck:
        if payment_id.startswith("PAY-FAIL"):
            return PaymentCheck(False, 0)
        if payment_id.startswith("PAY-AMT"):
            return PaymentCheck(True, expected_amount - 1)
        return PaymentCheck(True, expected_amount)

    def cancel(self, payment_id: str, reason: str) -> None:
        pass

    def refund(self, payment_id: str, amount: int, reason: str) -> str:
        return f"RF-{payment_id}"


def _make() -> PaymentProvider:
    if env.PAYMENT_PROVIDER == "mock":
        return MockPayment()
    raise RuntimeError(f"PAYMENT_PROVIDER={env.PAYMENT_PROVIDER} 는 아직 없습니다 (메인 사이트 결제 API 확정 후 구현)")


payment: PaymentProvider = _make()
