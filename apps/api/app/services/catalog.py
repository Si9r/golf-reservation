"""상품 조회 + L-03 패키지 검색"""
from __future__ import annotations

import re
import unicodedata

from sqlalchemy.engine import Connection

from .. import clock
from .. import settings as S
from ..db import one, rows
from ..rules import add_months, is_bookable_date, seats_left

PKG_SQL = """
  SELECT p.*, h.name_ko h_name_ko, h.name_ja h_name_ja, h.near_ko h_near_ko, h.near_ja h_near_ja, h.zone h_zone,
    (SELECT COUNT(*) FROM package_day d WHERE d.package_id = p.id AND d.course_id IS NOT NULL) rounds,
    CONCAT_WS(' ', p.name_ko, p.name_ja, p.search_kw, h.name_ko, h.name_ja, h.name_en, h.area,
      (SELECT GROUP_CONCAT(CONCAT_WS(' ', c.name_ko, c.name_ja, c.name_en, c.area) SEPARATOR ' ')
         FROM package_day d JOIN golf_course c ON c.id = d.course_id WHERE d.package_id = p.id)) search_text
  FROM package p LEFT JOIN hotel h ON h.id = p.default_hotel_id
  WHERE p.published = 1"""

# 출발편 + 살아 있는 임시확보 인원(held) + 결제 대기 예약 인원(pending) (L-02)
# 잔여석 = 정원 − 확정 인원(booked_count) − 결제 대기 − 주문 전 좌석 확보
# 결제 대기(PENDING_PAYMENT): 본 사이트 주문을 만든 예약은 결과(paid/failed/expired)가 나올 때까지 좌석 유지 (3D 인증으로 10분을 넘길 수 있음),
#                             주문 전 예약은 만든 지 HOLD_MINUTES 분까지만 (그 뒤는 B-08이 UNPAID로)
DEP_SQL = f"""SELECT d.*, COALESCE((SELECT SUM(s.people) FROM seat_hold s
  WHERE s.departure_id = d.id AND s.expires_at > UTC_TIMESTAMP(3)), 0) held,
  COALESCE((SELECT SUM(b.people) FROM booking b WHERE b.departure_id = d.id AND b.status = 'PENDING_PAYMENT'
    AND (b.order_id IS NOT NULL OR b.created_at > UTC_TIMESTAMP(3) - INTERVAL {S.HOLD_MINUTES} MINUTE)), 0) pending
  FROM departure d"""


def dep_seats(d: dict) -> int:
    return seats_left(d["capacity"], d["booked_count"], int(d["held"]) + int(d.get("pending") or 0))


def sale_rule(p: dict) -> dict:
    return {"dep_weekdays": p["dep_weekdays"], "season_from": p["season_from"], "season_to": p["season_to"]}


def _norm(s: str) -> str:
    return re.sub(r"[\s·・\-]", "", unicodedata.normalize("NFKC", s or "").lower())


def list_item(p: dict, nxt: dict | None) -> dict:
    hotel = None
    if p.get("h_zone"):
        hotel = {"name": {"ko": p["h_name_ko"], "ja": p["h_name_ja"]},
                 "near": {"ko": p["h_near_ko"], "ja": p["h_near_ja"] or p["h_near_ko"]} if p["h_near_ko"] else None,
                 "zone": p["h_zone"]}
    return {"id": p["id"], "name": {"ko": p["name_ko"], "ja": p["name_ja"]}, "type": p["type"], "nights": p["nights"],
            "rounds": int(p["rounds"]), "hotel": hotel, "basePrice": p["base_price"], "photoUrl": p["photo_url"],
            "recommended": bool(p["is_recommended"]), "nextDeparture": nxt}


def search_packages(c: Connection, *, people: int, q: str | None = None, date: str | None = None,
                    nights: str | None = None, zone: str | None = None, rounds: str | None = None, sort: str | None = None) -> dict:
    """L-03: 검색어 → 출발 가능(L-01)·잔여석 ≥ 인원 → 필터 → 정렬"""
    today = clock.today()
    pkgs = rows(c, PKG_SQL + " ORDER BY p.id")
    qq = _norm((q or "")[: S.SEARCH_MAX])
    until = add_months(today[:7], S.DEPARTURE_MONTHS_AHEAD + 1) + "-01"
    sql = DEP_SQL + " WHERE d.dep_date > :t AND d.dep_date < :u" + (" AND d.dep_date = :d" if date else "") + " ORDER BY d.dep_date"
    by_pkg: dict[str, list[dict]] = {}
    for d in rows(c, sql, t=today, u=until, d=date):
        by_pkg.setdefault(d["package_id"], []).append(d)

    out = []
    for p in pkgs:
        if qq and qq not in _norm(p["search_text"]):
            continue
        d = next((x for x in by_pkg.get(p["id"], []) if is_bookable_date(sale_rule(p), x["dep_date"], today, x["status"]) and dep_seats(x) >= people), None)
        if not d:
            continue
        if nights not in (None, "all") and p["nights"] != int(nights):
            continue
        if zone not in (None, "all") and (p["h_zone"] or "NONE") != zone:
            continue
        if rounds not in (None, "all") and int(p["rounds"]) != int(rounds):
            continue
        out.append((p, d))
    s = sort or "rec"
    key = {"priceAsc": lambda x: (x[0]["base_price"], x[0]["id"]),
           "depAsc": lambda x: (x[1]["dep_date"], x[0]["id"])}.get(s, lambda x: (-int(x[0]["is_recommended"]), x[0]["id"]))
    out.sort(key=key)
    items = [list_item(p, {"date": d["dep_date"], "seatsLeft": dep_seats(d)}) for p, d in out]
    return {"items": items, "total": len(items)}


def get_package(c: Connection, pid: str) -> dict | None:
    p = one(c, PKG_SQL + " AND p.id = :id", id=pid)
    if not p:
        return None
    days = rows(c, """SELECT d.day_no, d.tee_time, d.depart_time, d.overnight, c.id c_id, c.name_ko, c.name_ja, c.area, c.lat, c.lng, c.holes, c.caddie
                       FROM package_day d LEFT JOIN golf_course c ON c.id = d.course_id WHERE d.package_id = :id ORDER BY d.day_no""", id=pid)
    opts = rows(c, "SELECT id, code, hotel_id, room_type, price_diff, is_default FROM hotel_option WHERE package_id = :id ORDER BY sort, id", id=pid)
    nxt = one(c, DEP_SQL + " WHERE d.package_id = :id AND d.judge_date > :t AND d.status IN ('OPEN','GO') ORDER BY d.dep_date LIMIT 1", id=pid, t=clock.today())
    return {
        **list_item(p, {"date": nxt["dep_date"], "seatsLeft": dep_seats(nxt)} if nxt else None),
        "desc": {"ko": p["desc_ko"], "ja": p["desc_ja"] or ""} if p["desc_ko"] else None,
        "includes": {"ko": p["includes_ko"], "ja": p["includes_ja"] or ""} if p["includes_ko"] else None,
        "depWeekdays": p["dep_weekdays"],
        "singleAdd": p["single_add"] if p["single_add"] is not None else S.SINGLE_ADD,
        "days": [{"dayNo": d["day_no"], "teeTime": d["tee_time"], "departTime": d["depart_time"], "overnight": bool(d["overnight"]),
                  "course": {"id": d["c_id"], "name": {"ko": d["name_ko"], "ja": d["name_ja"]}, "area": d["area"], "lat": d["lat"], "lng": d["lng"],
                             "holes": d["holes"], "caddie": bool(d["caddie"])} if d["c_id"] else None} for d in days],
        "options": [{"id": o["id"], "code": o["code"], "hotelId": o["hotel_id"], "roomType": o["room_type"], "priceDiff": o["price_diff"],
                     "isDefault": bool(o["is_default"])} for o in opts],
    }


def stay_info(c: Connection, pkg: dict, option_id: str | None) -> dict | None:
    """선택한 옵션으로 숙박이 있는지 (객실 구성·1인실 요금 대상). 패키지에 맞지 않는 옵션이면 None"""
    if option_id:
        o = one(c, "SELECT id, hotel_id, price_diff FROM hotel_option WHERE id = :o AND package_id = :p", o=option_id, p=pkg["id"])
        if not o:
            return None
        return {"optionId": o["id"], "priceDiff": o["price_diff"], "hasStay": pkg["nights"] > 0 and bool(o["hotel_id"])}
    n = one(c, "SELECT COUNT(*) n FROM hotel_option WHERE package_id = :p", p=pkg["id"])
    if n and n["n"] > 0:
        return None  # 옵션이 있는 패키지는 옵션 필수
    return {"optionId": None, "priceDiff": 0, "hasStay": pkg["nights"] > 0 and bool(pkg["default_hotel_id"])}
