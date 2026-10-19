"""요청 모양 (상세설계 v1.3 'API'). 응답 모양은 packages/shared/src/api.ts 와 같음"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

People = Field(ge=1, le=30)  # V-02


class QuoteReq(BaseModel):
    departureId: str
    optionId: str | None = None
    people: int = People
    singles: int | None = Field(default=None, ge=0, le=30)


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
    singles: int | None = Field(default=None, ge=0, le=30)
    stops: list[StopIn] = Field(min_length=2, max_length=2)
    rep: RepIn
    companions: list[CompanionIn] = Field(default_factory=list, max_length=29)
    paymentId: str = Field(min_length=1, max_length=40)
    lang: Literal["ko", "ja"]


class CompanionsReq(BaseModel):
    companions: list[CompanionIn] = Field(max_length=29)


class CancelReq(BaseModel):
    cancelNote: str = Field(min_length=1, max_length=200)
