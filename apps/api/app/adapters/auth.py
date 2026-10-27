"""본 사이트 로그인 연동 (API-18, 질문 Q-14 · 작업 지시 10/27 §8).
골프 요청의 user_session 쿠키 값을 본 사이트 GET /api/partner/session 에 X-User-Session 헤더로 보내 회원 정보를 받음.
404 no_session 이면 로그인 안 됨 → 회원이 필요한 API는 401 + 로그인 주소(/login?next=<골프 화면 경로>).
골프 쪽 회원가입·로그인·로그아웃 화면은 만들지 않음 (로그아웃은 본 사이트 LOGOUT_URL).
PAYMENT_BACKEND=fake 이면 가짜 본 사이트(adapters/partner.py FakePartner)를 부르고, 개발 화면이 쓰는 'Authorization: Bearer demo:<회원ID>' 도 세션으로 받음"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import quote

from fastapi import Request

from ..config import env
from .partner import partner

SESSION_COOKIE = "user_session"


@dataclass
class Member:
    memberId: str
    nameLocal: str  # 본 사이트 회원 이름
    nameEn: str  # 영문 이름은 골프 화면에서 직접 입력 → 여기서는 비움
    countryCode: str
    phone: str
    email: str


def _session_value(req: Request) -> str | None:
    v = req.cookies.get(SESSION_COOKIE)
    if v:
        return v
    if env.PAYMENT_BACKEND.lower() == "fake":  # 개발 화면(VITE_USE_API=1)의 가짜 로그인 토큰
        m = re.fullmatch(r"Bearer (demo:\w+)", req.headers.get("authorization", ""))
        if m:
            return m.group(1)
    return None


def member_of(req: Request) -> Member | None:
    """로그인한 회원. 같은 요청 안에서는 본 사이트 세션 조회를 한 번만 함 (request.state 에 저장)"""
    if hasattr(req.state, "member"):
        return req.state.member
    m = None
    sv = _session_value(req)
    if sv:
        s = partner.session(sv)  # 본 사이트 오류(PartnerError)는 그대로 올림 → E-PARTNER
        if s:
            m = Member(str(s.get("user_id", "")), s.get("name") or "", "", "", s.get("phone") or "", s.get("email") or "")
    req.state.member = m
    return m


def login_url(req: Request) -> str:
    """로그인 뒤 돌아올 골프 화면 경로(next). 화면이 X-Return-To 헤더로 지금 경로를 보냄. 바깥 주소로는 보내지 않음"""
    nxt = req.headers.get("x-return-to") or "/golf"
    if not nxt.startswith("/") or nxt.startswith("//"):
        nxt = "/golf"
    if env.PAYMENT_BACKEND.lower() == "fake":  # 개발용: 골프 화면 안의 가짜 로그인 화면 (#/login?next=<화면 경로>)
        route = nxt.split("#", 1)[1] if "#" in nxt else nxt
        return "/#/login?next=" + quote(route if route.startswith("/") else "/golf", safe="")
    return f"{env.LOGIN_URL}?next={quote(nxt, safe='')}"
