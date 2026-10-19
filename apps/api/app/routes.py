"""API 경로 (상세설계 v1.3 'API' 시트). 모두 /api/golf 아래"""
from __future__ import annotations

from dataclasses import asdict
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Query, Request, Response

from . import settings as S
from .adapters.auth import Member, auth
from .config import env
from .db import conn, one, rows
from .errors import fail
from .schemas import BookingReq, CancelReq, CompanionsReq, HoldReq, PlacePoint, QuoteReq
from .services import booking as B
from .services.catalog import get_package, search_packages
from .services.departures import calendar, list_departures

router = APIRouter(prefix="/api/golf")
PeopleQ = Annotated[int, Query(ge=S.MIN_PEOPLE, le=S.MAX_PEOPLE)]
DateQ = Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")]
MonthQ = Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


def member(req: Request) -> Member:
    return auth.member_of(req) or fail("E-AUTH")


def admin(x_admin_key: Annotated[str | None, Header()] = None) -> None:
    if not env.ADMIN_KEY or x_admin_key != env.ADMIN_KEY:
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


# API-10 예약 확정 (L-08)
@router.post("/bookings", status_code=201)
def bookings_create(b: BookingReq, m: Me):
    return B.create_booking(m, b.model_dump())


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


# API-18 로그인 회원 정보 (TBD-03)
@router.get("/me")
def me(m: Me):
    return asdict(m)


# ---- 운영 API (운영 키 X-Admin-Key) ----
# API-15 상품 가져오기 (B-05): 운영 시트 형식이 정해지면 구현
@router.post("/admin/import", dependencies=[Depends(admin)])
def admin_import():
    fail("E-STATE")


# API-16 고객 취소 (L-14)
@router.post("/admin/bookings/{no}/cancel", dependencies=[Depends(admin)])
def admin_cancel(no: str, b: CancelReq):
    return B.cancel_by_user(no, b.cancelNote)


# API-17 승차 시간 등록 (L-16): 승차 시간 확정 주체(Q-23) 정해지면 구현
@router.put("/admin/departures/{dep_id}/stops", dependencies=[Depends(admin)])
def admin_stops(dep_id: str):
    fail("E-STATE")
