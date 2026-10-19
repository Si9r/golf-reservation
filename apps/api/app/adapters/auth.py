"""메인 사이트 로그인 연동 (API-18, TBD-03 / 질문 Q-14: 방식 미정).
실제 연동이 정해지면 AuthProvider를 구현한 클래스를 추가하고 AUTH_PROVIDER로 고름."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

from fastapi import Request

from ..config import env


@dataclass
class Member:
    memberId: str
    nameLocal: str
    nameEn: str
    countryCode: str
    phone: str
    email: str



class AuthProvider(Protocol):
    def member_of(self, req: Request) -> Member | None: ...


_DEMO = {
    "M0001": ("이정훈", "LEE JUNGHOON", "+82", "10-1234-5678", "demo1@example.com"),
    "M0002": ("田中 太郎", "TANAKA TARO", "+81", "90-1234-5678", "demo2@example.com"),
}


class MockAuth:
    """목업: 'Authorization: Bearer demo:<회원ID>' 이면 그 회원으로 로그인한 것으로 봄 (개발·테스트 전용)"""

    def member_of(self, req: Request) -> Member | None:
        m = re.fullmatch(r"Bearer demo:(\w+)", req.headers.get("authorization", ""))
        if not m:
            return None
        mid = m.group(1)
        d = _DEMO.get(mid, ("데모 회원", "DEMO MEMBER", "+82", "10-0000-0000", f"{mid}@example.com"))
        return Member(mid, *d)


def _make() -> AuthProvider:
    if env.AUTH_PROVIDER == "mock":
        return MockAuth()
    raise RuntimeError(f"AUTH_PROVIDER={env.AUTH_PROVIDER} 는 아직 없습니다 (메인 사이트 로그인 연동 확정 후 구현)")


auth: AuthProvider = _make()
