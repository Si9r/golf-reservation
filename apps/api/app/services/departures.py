"""출발편: B-04 만들기, API-03 월별 목록, API-04 날짜별 패키지 수"""
from __future__ import annotations

from sqlalchemy.engine import Connection

from .. import clock
from .. import settings as S
from ..db import rows, run
from ..rules import add_months, dates_in_month, departure_view, is_bookable_date, is_sale_date, judge_date
from .catalog import DEP_SQL, dep_seats, sale_rule


def departure_id(pkg_id: str, d: str) -> str:
    return f"{pkg_id}-{d.replace('-', '')}"


def generate_departures(c: Connection, months: int = S.DEPARTURE_MONTHS_AHEAD) -> int:
    """B-04: 판매 중 패키지마다 앞으로 n개월 출발편 생성. 이미 있으면 유지 (예약 있는 출발편은 지우지 않음)"""
    today = clock.today()
    made = 0
    for p in rows(c, "SELECT id, dep_weekdays, season_from, season_to FROM package WHERE published = 1"):
        for i in range(months + 1):
            for d in dates_in_month(add_months(today[:7], i)):
                if d > today and is_sale_date(sale_rule(p), d):
                    made += run(c, """INSERT IGNORE INTO departure (id, package_id, dep_date, capacity, min_people, judge_date)
                                      VALUES (:id, :p, :d, :cap, :min, :j)""",
                                id=departure_id(p["id"], d), p=p["id"], d=d, cap=S.BUS_SEATS, min=S.MIN_DEPARTURE, j=judge_date(d))
    return made


def _item(p: dict, d: dict, people: int, today: str) -> dict:
    seats = dep_seats(d)
    v = departure_view(d["booked_count"], seats, d["status"], people, d["min_people"])
    return {"id": d["id"], "date": d["dep_date"], "booked": d["booked_count"], "minPeople": d["min_people"], "seatsLeft": seats,
            "status": d["status"], "judgeDate": d["judge_date"],
            "selectable": is_bookable_date(sale_rule(p), d["dep_date"], today, d["status"]) and seats >= people,
            "view": {"state": v["state"], "msg": v["msg"], "need": v["need"]}}


def list_departures(c: Connection, pkg: dict, month: str, people: int) -> list[dict]:
    """API-03"""
    today = clock.today()
    ds = rows(c, DEP_SQL + " WHERE d.package_id = :p AND d.dep_date >= :a AND d.dep_date < :b ORDER BY d.dep_date",
              p=pkg["id"], a=month + "-01", b=add_months(month, 1) + "-01")
    return [_item(pkg, d, people, today) for d in ds if d["dep_date"] > today]


def calendar(c: Connection, month: str, people: int) -> dict:
    """API-04: 날짜별 '그날 출발 가능하고 잔여석 ≥ 인원' 패키지 수"""
    today = clock.today()
    ds = rows(c, f"""SELECT x.*, p.dep_weekdays, p.season_from, p.season_to FROM ({DEP_SQL}) x
                     JOIN package p ON p.id = x.package_id AND p.published = 1
                     WHERE x.dep_date >= :a AND x.dep_date < :b""", a=month + "-01", b=add_months(month, 1) + "-01")
    count: dict[str, int] = {}
    for d in ds:
        if is_bookable_date(sale_rule(d), d["dep_date"], today, d["status"]) and dep_seats(d) >= people:
            count[d["dep_date"]] = count.get(d["dep_date"], 0) + 1
    return {"items": [{"date": x, "count": count.get(x, 0)} for x in dates_in_month(month)]}
