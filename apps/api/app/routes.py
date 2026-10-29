"""API 경로 (상세설계 v1.3 'API' 시트). 모두 /api/golf 아래"""
from __future__ import annotations

import secrets
from dataclasses import asdict
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Query, Request, Response

from . import settings as S
from .adapters.auth import Member, login_url, member_of
from .config import env
from .db import conn, one, rows
from .errors import fail
from .schemas import BookingReq, CancelReq, CompanionsReq, HoldReq, PlacePoint, QuoteReq, SiteCancelReq
from .services import booking as B
from .services.catalog import get_package, search_packages
from .services.departures import calendar, list_departures

router = APIRouter(prefix="/api/golf")
PeopleQ = Annotated[int, Query(ge=S.MIN_PEOPLE, le=S.MAX_PEOPLE)]
DateQ = Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")]
MonthQ = Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


def member(req: Request) -> Member:
    """회원이 필요한 API: 로그인 안 됨 → 401 + 로그인 주소 (화면은 그 주소로 이동, 로그인 뒤 next 로 돌아옴)"""
    return member_of(req) or fail("E-AUTH", extra={"loginUrl": login_url(req)})


def admin(x_admin_key: Annotated[str | None, Header()] = None) -> None:
    if not env.ADMIN_KEY or x_admin_key != env.ADMIN_KEY:
        fail("E-AUTH")


def site(x_site_key: Annotated[str | None, Header()] = None) -> None:
    # TODO: 본 사이트 → 이 서비스 호출의 실제 인증 방식(서명·IP 제한 등)은 결제 연동 협의 때 정함. 지금은 공유 키 비교
    if not env.SITE_KEY or not x_site_key or not secrets.compare_digest(x_site_key, env.SITE_KEY):
        fail("E-AUTH")


Me = Annotated[Member, Depends(member)]


# API-01 패키지 목록 (L-03)
@router.get("/packages")
def packages(people: PeopleQ, q: Annotated[str | None, Query(max_length=S.SEARCH_MAX)] = None, date: DateQ = None,
             nights: str | None = None, zone: str | None = None, rounds: str | None = None,
             sort: Literal["rec", "priceAsc", "depAsc"] | None = None):
    with conn() as c:
        return search_packages(c, people=people, q=q, date=date, nights=nights, zone=zone, rounds=rounds, sort=sort)


# API-02 패키지 상세
@router.get("/packages/{pid}")
def package(pid: str):
    with conn() as c:
        return get_package(c, pid) or fail("E-NOTFOUND")


# API-03 출발일 목록 (L-01, L-02, L-04)
@router.get("/packages/{pid}/departures")
def departures(pid: str, month: MonthQ, people: PeopleQ):
    with conn() as c:
        p = one(c, "SELECT * FROM package WHERE id = :id AND published = 1", id=pid) or fail("E-NOTFOUND")
        return {"items": list_departures(c, p, month, people)}


# API-04 날짜별 출발 패키지 수
@router.get("/departures/calendar")
def departures_calendar(month: MonthQ, people: PeopleQ):
    with conn() as c:
        return calendar(c, month, people)


# API-05 장소 검색: Google Places 서버 호출 + 범위 표시. 키·요금 정책 확정 전이라 지금은 화면이 직접 호출 (TODO)
@router.get("/places")
def places():
    fail("E-STATE")


# API-06 범위 안인지 (L-06)
@router.post("/places/check")
def places_check(b: PlacePoint):
    with conn() as c:
        return B.check_area(c, b.lat, b.lng)


# API-07 금액 계산 (L-05)
@router.post("/quotes")
def quotes(b: QuoteReq):
    with conn() as c:
        return B.make_quote(c, b.departureId, b.optionId, b.people, b.singles)


# API-08 / 09 좌석 임시확보 (L-07)
@router.post("/holds", status_code=201)
def holds(b: HoldReq, m: Me):
    return B.create_hold(m, b.departureId, b.people)


@router.delete("/holds/{hold_id}", status_code=204)
def holds_delete(hold_id: int, m: Me):
    B.release_hold(m, hold_id)
    return Response(status_code=204)


# API-10 예약 만들기 (L-08): 결제 대기(PENDING_PAYMENT)로 저장, 예약번호 발급, 좌석 잡음 (본 사이트 결제 연동 10/27)
@router.post("/bookings", status_code=201)
def bookings_create(b: BookingReq, m: Me):
    return B.create_booking(m, b.model_dump())


# 결제 대기 예약 그만두기 (S-10 뒤로 가기): 주문 전이면 미결제로 바꿔 좌석을 바로 풂
@router.delete("/bookings/{no}/pending", status_code=204)
def bookings_abandon(no: str, m: Me):
    B.abandon_pending(m, no)
    return Response(status_code=204)


# API-20 결제 시작: 본 사이트 주문 생성 → checkout_url (화면이 그 주소로 이동)
@router.post("/bookings/{no}/checkout")
def bookings_checkout(no: str, m: Me):
    return B.checkout(m, no)


# API-21 결제 결과 확인 (결과 화면): 본 사이트 주문 상태를 조회해 확정 · 미결제 · 결제 대기
@router.get("/bookings/{no}/payment")
def bookings_payment(no: str, m: Me):
    return B.payment_status(m, no)


# API-11 내 예약 목록 / API-12 상세 / API-13 동반자 명단
@router.get("/bookings")
def bookings(m: Me, departureId: str | None = None):
    return {"items": B.list_bookings(m, departureId)}


@router.get("/bookings/{no}")
def booking_detail(no: str, m: Me):
    return B.get_booking(m, no)


@router.put("/bookings/{no}/companions")
def companions(no: str, b: CompanionsReq, m: Me):
    return B.save_companions(m, no, [x.model_dump() for x in b.companions])


# API-14 공개 설정
@router.get("/settings/public")
def settings_public():
    with conn() as c:
        areas = rows(c, "SELECT id, name_ko nameKo, name_ja nameJa, shape FROM service_area")
    return {"support": S.SUPPORT, "terms": S.TERMS_URL, "minDeparture": S.MIN_DEPARTURE, "maxPeople": S.MAX_PEOPLE,
            "holdMinutes": S.HOLD_MINUTES, "closedSeason": S.CLOSED_SEASON, "singleAdd": S.SINGLE_ADD, "serviceAreas": areas}


# API-18 로그인 회원 정보: 본 사이트 세션의 이름·이메일·전화 (영문 이름은 골프 화면에서 입력).
# logoutUrl = 본 사이트 로그아웃 (partner 모드만. fake 모드는 null → 화면의 데모 로그아웃)
@router.get("/me")
def me(m: Me):
    return {**asdict(m), "logoutUrl": env.LOGOUT_URL if env.PAYMENT_BACKEND.lower() == "partner" else None}


# ---- 운영 API (운영 키 X-Admin-Key) ----
# API-15 상품 가져오기 (B-05): 운영 시트 형식이 정해지면 구현
@router.post("/admin/import", dependencies=[Depends(admin)])
def admin_import():
    fail("E-STATE")


# API-16 고객 취소 (L-14). 본 사이트 연동(API-19) 전 임시·운영 예비용 (고객센터가 운영 키로 취소, 환불도 이쪽에서 요청)
@router.post("/admin/bookings/{no}/cancel", dependencies=[Depends(admin)])
def admin_cancel(no: str, b: CancelReq):
    return B.cancel_by_user(no, b.cancelNote)


# API-17 승차 시간 등록 (L-16): 승차 시간 확정 주체(Q-23) 정해지면 구현.
# 정차 순서(stop_order)·실제 시간(pickup_time)은 손님 희망 시간(booking_stop.desired_time)을 참고해 정함.
# 등록 기간: 출발 확정(판정일)부터 출발 settings.PICKUP_REGISTER_DUE_DAYS 일 전까지 (10/29). 구현할 때 기한 안내·기한 지난 출발편 운영 알림에 씀
@router.put("/admin/departures/{dep_id}/stops", dependencies=[Depends(admin)])
def admin_stops(dep_id: str):
    fail("E-STATE")


# ---- 본 사이트 → 이 서비스 (키 X-Site-Key) ----
# API-19 고객 취소·환불 결과 받기: 고객 사정 취소·환불은 본 사이트가 처리하고 결과를 알려 줌 (L-14)
@router.post("/site/bookings/{no}/cancel", dependencies=[Depends(site)])
def site_cancel(no: str, b: SiteCancelReq):
    return B.cancel_from_site(no, b.refundId, b.refundStatus, b.note)
