"""요청 모양 (상세설계 v1.3 'API'). 응답 모양은 packages/shared/src/api.ts 와 같음"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from . import settings as S

People = Field(ge=S.MIN_PEOPLE, le=S.MAX_PEOPLE)  # V-02


class QuoteReq(BaseModel):
    departureId: str
    optionId: str | None = None
    people: int = People
    singles: int | None = Field(default=None, ge=0, le=S.MAX_PEOPLE)


class HoldReq(BaseModel):
    departureId: str
    people: int = People


class PlacePoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class StopIn(PlacePoint):
    kind: Literal["PICK", "DROP"]
    placeName: str = Field(min_length=1, max_length=100)
    placeId: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=200)
    memo: str | None = None
    desiredTime: str | None = None  # 'HH:MM' 희망 시간. 필수·형식·범위 검사는 V-12 (services/booking.py)


class RepIn(BaseModel):
    nameLocal: str
    nameEn: str
    countryCode: str = Field(max_length=6)
    phone: str
    email: str


class CompanionIn(BaseModel):
    nameEn: str = ""


class BookingReq(BaseModel):
    holdId: int
    optionId: str | None = None
    singles: int | None = Field(default=None, ge=0, le=S.MAX_PEOPLE)
    stops: list[StopIn] = Field(min_length=2, max_length=2)
    rep: RepIn
    companions: list[CompanionIn] = Field(default_factory=list, max_length=S.MAX_PEOPLE - 1)
    paymentId: str = Field(min_length=1, max_length=40)
    lang: Literal["ko", "ja"]


class CompanionsReq(BaseModel):
    companions: list[CompanionIn] = Field(max_length=S.MAX_PEOPLE - 1)


class CancelReq(BaseModel):
    cancelNote: str = Field(min_length=1, max_length=200)


class SiteCancelReq(BaseModel):
    """API-19: 본 사이트가 처리한 고객 취소·환불 결과"""
    refundId: str = Field(min_length=1, max_length=40)
    refundStatus: Literal["REQUESTED", "DONE", "FAIL"]
    note: str | None = Field(default=None, max_length=200)
