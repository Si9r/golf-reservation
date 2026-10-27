"""TRAVENDER 본 사이트 Partner API 호출 (로그인 세션 · 주문 · 환불). 본 사이트 API는 이 서버에서만 부름 (브라우저 직접 호출 없음).
PAYMENT_BACKEND=fake  : 가짜 본 사이트 (로컬 개발·테스트). 메모리에 세션·주문을 둠
PAYMENT_BACKEND=partner: 실제 본 사이트 (PARTNER_API_BASE, PARTNER_API_KEY)

==================== 가정 (사양서 docs/partner-api-golf.md 원본 §5~§8을 받으면 여기만 맞출 것) ====================
받은 문서는 '작업 지시'뿐이라 아래는 추정. 경로·쿠키·헤더 X-User-Session·주문 필드 이름·상태 값·오류 코드 이름은 작업 지시에 있는 대로.
- [가정] API 키 헤더: X-Api-Key: <PARTNER_API_KEY>
- [가정] 요청·응답 본문은 JSON, 필드 이름은 snake_case
- [가정] 오류 응답: {"error": "<코드>"} (예: no_session, duplicate_reference, refused, unauthorized)
- [가정] GET /api/partner/session 200 응답: {"user_id", "name", "email", "phone"}
- [가정] POST /api/partner/orders 요청 title: {"ja": "...", "ko": "..."} (ja 필수), departure_date: "YYYY-MM-DD", return_url: 절대 주소
- [가정] 주문 응답 (생성·조회 공통): {"order_id", "status", "checkout_url", "reference", "amount"}
- [가정] 409 duplicate_reference 응답: {"error": "duplicate_reference", "order": {주문 응답과 같은 모양}}
- [가정] POST /api/partner/orders/{order_id}/cancel 요청 {"reason"}, 200 응답: {"order_id", "status": "canceled"}
=================================================================================================================="""
from __future__ import annotations

import json
import logging
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Protocol

from ..config import env

log = logging.getLogger("golf.partner")

ORDER_PAID, ORDER_FAILED, ORDER_EXPIRED, ORDER_PENDING, ORDER_AUTH, ORDER_CANCELED = "paid", "failed", "expired", "pending", "authenticating", "canceled"
ORDER_FINAL_FAIL = (ORDER_FAILED, ORDER_EXPIRED)
ORDER_WAITING = (ORDER_PENDING, ORDER_AUTH)


class PartnerError(Exception):
    """본 사이트가 오류로 응답 (status: HTTP 상태, code: 오류 코드, body: 응답 본문). 연결 실패는 status=502"""

    def __init__(self, status: int, code: str, body: dict | None = None):
        super().__init__(f"{status} {code}")
        self.status, self.code, self.body = status, code, body or {}


class Partner(Protocol):
    def session(self, user_session: str) -> dict | None: ...  # 로그인 안 됨(404 no_session) → None
    def create_order(self, body: dict) -> dict: ...
    def get_order(self, order_id: str) -> dict: ...
    def cancel_order(self, order_id: str, reason: str) -> dict: ...


class HttpPartner:
    """실제 본 사이트 호출 (표준 라이브러리 urllib, 의존성 추가 없음)"""

    def _call(self, method: str, path: str, body: dict | None = None, headers: dict | None = None) -> dict:
        if not env.PARTNER_API_BASE or not env.PARTNER_API_KEY:
            raise PartnerError(502, "not_configured")
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(env.PARTNER_API_BASE.rstrip("/") + path, data=data, method=method)
        req.add_header("X-Api-Key", env.PARTNER_API_KEY)  # [가정] 키 헤더 이름
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=env.PARTNER_TIMEOUT) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            try:
                b = json.loads(e.read() or b"{}")
            except ValueError:
                b = {}
            raise PartnerError(e.code, str(b.get("error", "http_error")), b) from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise PartnerError(502, "unreachable", {"detail": str(e)[:200]}) from None

    def session(self, user_session: str) -> dict | None:
        try:
            return self._call("GET", "/api/partner/session", headers={"X-User-Session": user_session})
        except PartnerError as e:
            if e.status == 404 and e.code == "no_session":
                return None
            raise

    def create_order(self, body: dict) -> dict:
        return self._call("POST", "/api/partner/orders", body)

    def get_order(self, order_id: str) -> dict:
        return self._call("GET", f"/api/partner/orders/{order_id}")

    def cancel_order(self, order_id: str, reason: str) -> dict:
        return self._call("POST", f"/api/partner/orders/{order_id}/cancel", {"reason": reason})


# ---------- 가짜 본 사이트 (fake) ----------
_DEMO_USERS = {
    "M0001": {"user_id": "M0001", "name": "이정훈", "email": "demo1@example.com", "phone": "+82 10-1234-5678"},
    "M0002": {"user_id": "M0002", "name": "田中 太郎", "email": "demo2@example.com", "phone": "+81 90-1234-5678"},
}


@dataclass
class FakePartner:
    """로컬 개발·테스트용 본 사이트. 세션 'demo:<회원ID>' 를 로그인으로 봄.
    주문은 만들 때 next_status(기본 paid) 상태가 되고, checkout_url 은 return_url 그대로 (결제창을 거치지 않고 바로 결과 화면).
    테스트는 next_status · set_status · fail_cancel · api_key 로 본 사이트 응답을 흉내 냄"""

    next_status: str = ORDER_PAID
    api_key: str | None = None  # 값이 있으면 env.PARTNER_API_KEY 와 비교해 다르면 401 unauthorized
    orders: dict = field(default_factory=dict)  # order_id → order
    by_ref: dict = field(default_factory=dict)  # reference → order_id
    fail_cancel: dict = field(default_factory=dict)  # order_id → (status, code) 환불 호출을 실패시킴
    calls: list = field(default_factory=list)  # (메서드, 인자) 기록
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def reset(self) -> None:
        with self._lock:
            self.next_status, self.api_key = ORDER_PAID, None
            self.orders.clear(), self.by_ref.clear(), self.fail_cancel.clear(), self.calls.clear()

    def _key(self) -> None:
        if self.api_key is not None and env.PARTNER_API_KEY != self.api_key:
            raise PartnerError(401, "unauthorized")

    def session(self, user_session: str) -> dict | None:
        self._key()
        self.calls.append(("session", user_session))
        if not user_session.startswith("demo:"):
            return None
        mid = user_session[5:]
        return _DEMO_USERS.get(mid, {"user_id": mid, "name": "데모 회원", "email": f"{mid}@example.com", "phone": ""})

    def create_order(self, body: dict) -> dict:
        self._key()
        with self._lock:
            self.calls.append(("create_order", body["reference"]))
            if body["amount"] < 100:
                raise PartnerError(400, "invalid_amount")
            if body["reference"] in self.by_ref:
                raise PartnerError(409, "duplicate_reference", {"error": "duplicate_reference", "order": dict(self.orders[self.by_ref[body["reference"]]])})
            oid = f"ORD-{len(self.orders) + 1:05d}"
            o = {"order_id": oid, "status": self.next_status, "checkout_url": body["return_url"], "reference": body["reference"], "amount": body["amount"]}
            self.orders[oid], self.by_ref[body["reference"]] = o, oid
            return dict(o)

    def get_order(self, order_id: str) -> dict:
        self._key()
        self.calls.append(("get_order", order_id))
        if order_id not in self.orders:
            raise PartnerError(404, "not_found")
        return dict(self.orders[order_id])

    def set_status(self, order_id: str, status: str) -> None:
        self.orders[order_id]["status"] = status

    def cancel_order(self, order_id: str, reason: str) -> dict:
        self._key()
        self.calls.append(("cancel_order", order_id, reason))
        if order_id in self.fail_cancel:
            st, code = self.fail_cancel[order_id]
            raise PartnerError(st, code)
        o = self.orders.get(order_id)
        if not o:
            raise PartnerError(404, "not_found")
        if o["status"] != ORDER_PAID:  # paid 주문만 환불
            raise PartnerError(409, "refused")
        o["status"] = ORDER_CANCELED
        return {"order_id": order_id, "status": ORDER_CANCELED}


def _make() -> Partner:
    b = env.PAYMENT_BACKEND.lower()
    if b == "fake":
        return FakePartner()
    if b == "partner":
        return HttpPartner()
    raise RuntimeError(f"PAYMENT_BACKEND={env.PAYMENT_BACKEND} 는 fake | partner 만 됩니다")


partner: Partner = _make()
