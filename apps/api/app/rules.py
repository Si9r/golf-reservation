"""처리 로직 L-xx 중 DB 없이 계산되는 규칙 (상세설계 v1.3 '처리 로직' ②).
화면 미리 보기용 같은 규칙: packages/shared/src/rules.ts. 최종 판단은 항상 이 서버 쪽."""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Literal, TypedDict

from . import settings as S

WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]


def add_days(d: str, n: int) -> str:
    return (date.fromisoformat(d) + timedelta(days=n)).isoformat()


def dow(d: str) -> int:  # 0=일
    return (date.fromisoformat(d).weekday() + 1) % 7


def add_months(ym: str, n: int) -> str:
    y, m = int(ym[:4]), int(ym[5:7]) - 1 + n
    return f"{y + m // 12}-{m % 12 + 1:02d}"


def dates_in_month(ym: str) -> list[str]:
    first = date.fromisoformat(ym + "-01")
    nxt = date.fromisoformat(add_months(ym, 1) + "-01")
    return [(first + timedelta(days=i)).isoformat() for i in range((nxt - first).days)]


def parse_weekdays(s: str) -> list[int]:
    return [WEEKDAYS.index(x.strip().upper()) for x in s.split(",") if x.strip().upper() in WEEKDAYS]


def in_closed_season(d: str, cs: dict = S.CLOSED_SEASON) -> bool:
    md, f, t = d[5:], cs["from"], cs["to"]
    return f <= md <= t if f <= t else (md >= f or md <= t)


def judge_date(dep: str, judge_days: int = S.JUDGE_DAYS) -> str:
    return add_days(dep, -judge_days)


class SaleRule(TypedDict):
    dep_weekdays: str  # 'MON,THU'
    season_from: str  # 'MM-DD'
    season_to: str


def is_sale_date(p: SaleRule, d: str) -> bool:
    """B-04 출발편을 만들 날: 요일 + 판매 기간 + 휴장기 밖"""
    return dow(d) in parse_weekdays(p["dep_weekdays"]) and p["season_from"] <= d[5:] <= p["season_to"] and not in_closed_season(d)


def is_bookable_date(p: SaleRule, d: str, today: str, status: str = "OPEN") -> bool:
    """L-01 출발일 판단: 판매일 + 판정일이 오늘 이후 + 출발편 OPEN/GO"""
    return is_sale_date(p, d) and judge_date(d) > today and status in ("OPEN", "GO")


def seats_left(capacity: int, booked: int, held: int) -> int:
    """L-02 잔여석 = 정원 − 확정 인원 − 만료 안 된 임시확보 인원"""
    return max(0, capacity - booked - held)


DepState = Literal["unavailable", "go", "enough", "need"]
_MSG = {"unavailable": "M-120", "go": "M-123", "enough": "M-125", "need": "M-122"}


def departure_view(booked: int, seats: int, status: str, people: int, min_people: int = S.MIN_DEPARTURE) -> dict:
    """L-04 출발 확정 현황. 판정 전 20명 이상은 상태가 아니라 표시 '인원 충족'.
    정원 20 = 최소 출발 인원 20이라 '인원 충족'이면 정원도 다 참 → full 로 알려 '잔여 0석' 대신 '마감'으로 표시"""
    total = booked + people
    state: DepState = "unavailable" if people > seats else "go" if status == "GO" else "enough" if total >= min_people else "need"
    after = max(0, seats - people)
    return {"booked": booked, "sum": total, "seats": seats, "need": max(0, min_people - total), "seatsAfter": after,
            "full": state != "unavailable" and after == 0, "state": state, "msg": _MSG[state]}


def booking_tab(status: str) -> str:
    """S-12 예약 조회 탭: 예정 = 예약 확정, 지난 = 여행 완료, 취소 = 고객 취소 + 운행 취소 (팀 테스트 10/23)"""
    return {"CONFIRMED": "up", "DONE": "past"}.get(status, "cancel")


def rooms_of(people: int, singles: int | None = None) -> dict:
    """객실 구성 (화면설계 v2): 2인 1실 기본, 1인실 인원은 인원과 홀짝이 같음"""
    s = people % 2 if singles is None else singles
    s = max(people % 2, min(people, s))
    if (people - s) % 2:
        s = min(people, s + 1)
    return {"singles": s, "twins": (people - s) // 2}


def quote(base_price: int, price_diff: int, people: int, has_stay: bool, singles: int | None = None, single_add: int | None = None) -> dict:
    """L-05 금액: 1인 요금 × 인원 + 1인실 추가 × 1인실 인원 (숙박 있을 때만)"""
    unit = base_price + price_diff
    rooms = rooms_of(people, singles) if has_stay else None
    each = S.SINGLE_ADD if single_add is None else single_add
    single_total = rooms["singles"] * each if rooms else 0
    return {"unitPrice": unit, "optionDiff": price_diff, "people": people, "rooms": rooms, "singleAddEach": each, "singleTotal": single_total, "total": unit * people + single_total, "currency": "JPY"}


def booking_no(dep: str, seq: int) -> str:
    """L-09 GT-YYMMDD-NNNN (YYMMDD = 출발일)"""
    return f"GT-{dep[2:4]}{dep[5:7]}{dep[8:10]}-{seq:04d}"


def distance_m(a: dict, b: dict) -> float:
    r, rad = 6371000, math.pi / 180
    dlat, dlng = (b["lat"] - a["lat"]) * rad, (b["lng"] - a["lng"]) * rad
    h = math.sin(dlat / 2) ** 2 + math.cos(a["lat"] * rad) * math.cos(b["lat"] * rad) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def in_area(p: dict, shape: dict) -> bool:
    """L-06 승하차 범위 (원 {type:circle,lat,lng,r} 또는 다각형 {type:polygon,points:[[lat,lng],...]}).
    지금은 원 하나 (settings.SERVICE_AREA, 반경 5km, 운영사 확정 10/29). 범위 값은 service_area 데이터에 있고 이 함수에는 숫자가 없음"""
    if shape["type"] == "circle":
        return distance_m(p, shape) <= shape["r"]
    pts, inside, j = shape["points"], False, len(shape["points"]) - 1
    for i in range(len(pts)):
        (yi, xi), (yj, xj) = pts[i], pts[j]
        if (yi > p["lat"]) != (yj > p["lat"]) and p["lng"] < (xj - xi) * (p["lat"] - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside
