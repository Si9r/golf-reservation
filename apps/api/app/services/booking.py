"""견적(L-05) · 좌석 임시확보(L-07) · 예약 확정(L-08, L-09) · 조회 · 동반자 · 고객 취소(L-14, API-16, API-19)"""
from __future__ import annotations

import json
import re

from sqlalchemy.engine import Connection

from .. import clock
from .. import settings as S
from ..adapters.auth import Member
from ..adapters.mail import notify
from ..adapters.payment import payment
from ..db import conn, one, rows, run, tx
from ..errors import fail
from ..rules import add_days, booking_no, in_area, is_bookable_date, quote
from .catalog import DEP_SQL, dep_seats, sale_rule, stay_info

NAME_EN = re.compile(r"[A-Z][A-Z ]{1,59}")
HHMM = re.compile(r"([01]\d|2[0-3]):[0-5]\d")


def _pkg_of_dep(c: Connection, dep_id: str) -> dict | None:
    return one(c, """SELECT p.id, p.nights, p.base_price, p.single_add, p.default_hotel_id, p.dep_weekdays, p.season_from, p.season_to
                     FROM package p JOIN departure d ON d.package_id = p.id WHERE d.id = :id""", id=dep_id)


def make_quote(c: Connection, departure_id: str, option_id: str | None, people: int, singles: int | None = None) -> dict:
    """L-05 (API-07). 금액은 항상 서버에서 다시 계산"""
    p = _pkg_of_dep(c, departure_id) or fail("E-NOTFOUND")
    st = stay_info(c, p, option_id) or fail("E-VALID", [{"field": "optionId", "rule": "package-option"}])
    return quote(p["base_price"], st["priceDiff"], people, st["hasStay"], singles, p["single_add"])


def _lock_departure(c: Connection, dep_id: str) -> dict | None:
    # 같은 출발편 처리를 줄 세움. READ COMMITTED라 잠금 뒤 읽는 확보 인원은 최신 값
    run(c, "SELECT id FROM departure WHERE id = :id FOR UPDATE", id=dep_id)
    return one(c, DEP_SQL + " WHERE d.id = :id", id=dep_id)


def create_hold(m: Member, departure_id: str, people: int) -> dict:
    """L-07 (API-08): 출발편 잠금 → 예약 가능일·잔여석 → 같은 회원의 이전 확보 삭제 → 확보 생성"""
    with tx() as c:
        p = _pkg_of_dep(c, departure_id) or fail("E-NOTFOUND")
        d = _lock_departure(c, departure_id)
        run(c, "DELETE FROM seat_hold WHERE member_id = :m", m=m.memberId)
        d = one(c, DEP_SQL + " WHERE d.id = :id", id=departure_id)
        if not is_bookable_date(sale_rule(p), d["dep_date"], clock.today(), d["status"]):
            fail("E-CLOSED")
        if dep_seats(d) < people:
            fail("E-SEAT")
        hid = c.exec_driver_sql(
            "INSERT INTO seat_hold (departure_id, member_id, people, expires_at) VALUES (%s, %s, %s, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL %s MINUTE))",
            (departure_id, m.memberId, people, S.HOLD_MINUTES)).lastrowid
        h = one(c, "SELECT id, expires_at FROM seat_hold WHERE id = :id", id=hid)
    return {"holdId": h["id"], "expiresAt": h["expires_at"]}


def release_hold(m: Member, hold_id: int) -> None:
    with tx() as c:
        run(c, "DELETE FROM seat_hold WHERE id = :id AND member_id = :m", id=hold_id, m=m.memberId)


def _validate(req: dict, people: int) -> None:
    """입력 검사 V-20~V-24 (화면 검사와 같은 규칙을 서버에서 다시)"""
    f: list[dict] = []
    r = req["rep"]
    if not r["nameLocal"].strip() or len(r["nameLocal"].strip()) > 30:
        f.append({"field": "rep.nameLocal", "rule": "V-20"})
    if not NAME_EN.fullmatch(r["nameEn"].strip().upper()):
        f.append({"field": "rep.nameEn", "rule": "V-21"})
    if not re.fullmatch(r"[\d\s-]{8,}", r["phone"]):
        f.append({"field": "rep.phone", "rule": "V-22"})
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", r["email"]):
        f.append({"field": "rep.email", "rule": "V-23"})
    if len(req["companions"]) > people - 1:
        f.append({"field": "companions", "rule": "V-24"})
    for i, x in enumerate(req["companions"]):
        if x["nameEn"] and not NAME_EN.fullmatch(x["nameEn"].strip().upper()):
            f.append({"field": f"companions.{i}.nameEn", "rule": "V-24"})
    for k in ("PICK", "DROP"):
        if sum(1 for s in req["stops"] if s["kind"] == k) != 1:
            f.append({"field": "stops", "rule": f"one-{k}"})
    for i, s in enumerate(req["stops"]):
        if len(s.get("memo") or "") > S.MEMO_MAX:
            f.append({"field": f"stops.{i}.memo", "rule": "V-11"})
        t = s.get("desiredTime") or ""
        if not HHMM.fullmatch(t) or _min(t) % S.STOP_TIME_STEP_MIN:  # V-12 희망 시간: 승차·하차 모두 필수, 30분 단위
            f.append({"field": f"stops.{i}.desiredTime", "rule": "V-12"})
    if f:
        fail("E-VALID", f)


def _area_of(c: Connection, pt: dict) -> str | None:
    """L-06: 좌표가 들어가는 승하차 범위 ID"""
    for a in rows(c, "SELECT id, shape FROM service_area"):
        shape = a["shape"] if isinstance(a["shape"], dict) else json.loads(a["shape"])
        if in_area(pt, shape):
            return a["id"]
    return None


def check_area(c: Connection, lat: float, lng: float) -> dict:
    return {"inArea": _area_of(c, {"lat": lat, "lng": lng}) is not None}


def _min(t: str) -> int:
    h, m = t.split(":")[:2]
    return int(h) * 60 + int(m)


def _travel(area_id: str, course_area: str | None) -> int:
    return S.TRAVEL_MIN.get(area_id, {}).get(course_area or "", S.TRAVEL_DEFAULT_MIN)


def stop_time_range(days: list[dict], kind: str, area_id: str) -> tuple[int, int]:
    """V-12 희망 승하차 시간으로 고를 수 있는 범위 (0시부터 분, 양 끝 포함, 30분 단위).
    화면 apps/web/src/logic.ts stopTimeRange 와 같은 계산 (화면은 Google 경로 시간이 있으면 그것을 씀).
    days: package_day 를 day_no 순으로 (tee_time · depart_time · course_area). area_id: 승하차 장소의 service_area.id
    - 승차(첫날): (첫날 티오프 − 2시간 30분, 06:00보다 이르면 06:00) ~ (첫날 티오프 − 이동 − 30분 여유)를 30분 단위로 내림.
      첫날 라운드가 없으면 06:00 ~ 첫 출발 시각 − 30분
    - 하차(마지막 날): (마지막 라운드 티오프 + 5시간 + 이동)을 30분 단위로 올림 ~ 21:00. 라운드가 없으면 NO_ROUND_DROP_FROM
    이동 시간은 지역별 대략값 표(settings.TRAVEL_MIN). 시작이 끝보다 늦으면 고를 수 있는 시간이 없음"""
    lo, hi, step = _min(S.STOP_TIME_FIRST), _min(S.STOP_TIME_LAST), S.STOP_TIME_STEP_MIN
    if kind == "PICK":
        d = days[0]
        if d["tee_time"]:
            lo = max(lo, -(-(_min(d["tee_time"]) - S.PICK_EARLIEST_BEFORE_TEE_MIN) // step) * step)
            to = _min(d["tee_time"]) - _travel(area_id, d["course_area"]) - S.PICK_MARGIN_MIN
        elif d["depart_time"]:
            to = _min(d["depart_time"]) - S.PICK_MARGIN_MIN
        else:
            to = hi
        return lo, min(hi, to // step * step)
    d = days[-1]
    frm = _min(d["tee_time"]) + S.ROUND_HOURS * 60 + _travel(area_id, d["course_area"]) if d["tee_time"] else _min(S.NO_ROUND_DROP_FROM)
    return max(lo, -(-frm // step) * step), hi


def _days_of_dep(c: Connection, dep_id: str) -> list[dict]:
    return rows(c, """SELECT pd.day_no, pd.tee_time, pd.depart_time, gc.area course_area
                      FROM departure d JOIN package_day pd ON pd.package_id = d.package_id
                      LEFT JOIN golf_course gc ON gc.id = pd.course_id
                      WHERE d.id = :id ORDER BY pd.day_no""", id=dep_id)


def create_booking(m: Member, req: dict) -> dict:
    """L-08 (API-10): 결제 확인 → 출발편 잠금 → 확보 확인 → 예약 저장 → 확인서 메일"""
    with conn() as c:
        hold = one(c, "SELECT id, departure_id, people, member_id FROM seat_hold WHERE id = :id", id=req["holdId"])
        if not hold or hold["member_id"] != m.memberId:
            fail("E-HOLD")
        people = hold["people"]
        _validate(req, people)
        stops = []
        for s in req["stops"]:
            area = _area_of(c, s) or fail("E-AREA", [{"field": f"stops.{s['kind']}", "rule": "L-06"}])
            stops.append({**s, "areaId": area})
        days = _days_of_dep(c, hold["departure_id"])
        out = []
        for i, s in enumerate(stops):  # V-12 범위: 패키지 일정으로 정한 범위 안인지
            lo, hi = stop_time_range(days, s["kind"], s["areaId"])
            if not lo <= _min(s["desiredTime"]) <= hi:
                out.append({"field": f"stops.{i}.desiredTime", "rule": "V-12-range"})
        if out:
            fail("E-VALID", out)
        q = make_quote(c, hold["departure_id"], req.get("optionId"), people, req.get("singles"))

    # 1) 결제 확인 (메인 사이트)
    pay = payment.verify(req["paymentId"], q["total"])
    if not pay.ok:
        fail("E-PAY")
    if pay.amount != q["total"]:
        payment.cancel(req["paymentId"], "amount-mismatch")
        fail("E-AMOUNT")

    # 2)~3) 트랜잭션
    with tx() as c:
        if one(c, "SELECT no FROM booking WHERE payment_id = :p", p=req["paymentId"]):
            fail("E-STATE")  # 같은 결제로 두 번 예약 방지
        d = _lock_departure(c, hold["departure_id"])
        alive = one(c, "SELECT expires_at > UTC_TIMESTAMP(3) alive FROM seat_hold WHERE id = :id", id=hold["id"])
        # 확보가 살아 있으면 그 자리, 만료됐으면 지금 남은 자리로 판단 (만료된 확보는 잔여석 계산에서 이미 빠짐)
        sold_out = not (alive and alive["alive"]) and dep_seats(d) < people
        if not sold_out:
            run(c, "INSERT INTO booking_seq (dep_date, last_no) VALUES (:d, LAST_INSERT_ID(1)) "
                   "ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)", d=d["dep_date"])
            seq = one(c, "SELECT LAST_INSERT_ID() n")["n"]
            no = booking_no(d["dep_date"], int(seq))
            run(c, """INSERT INTO booking (no, member_id, departure_id, hotel_option_id, people, single_count, unit_price, total_price, status, payment_id, lang)
                      VALUES (:no, :m, :d, :o, :n, :s, :u, :t, 'CONFIRMED', :pay, :lang)""",
                no=no, m=m.memberId, d=d["id"], o=req.get("optionId"), n=people, s=(q["rooms"] or {}).get("singles", 0),
                u=q["unitPrice"], t=q["total"], pay=req["paymentId"], lang=req["lang"])
            for s in stops:
                run(c, """INSERT INTO booking_stop (booking_no, kind, place_name, place_id, address, lat, lng, area_id, memo, desired_time)
                          VALUES (:no, :k, :n, :pid, :a, :lat, :lng, :area, :memo, :dt)""",
                    no=no, k=s["kind"], n=s["placeName"], pid=s.get("placeId"), a=s.get("address"), lat=s["lat"], lng=s["lng"], area=s["areaId"],
                    memo=s.get("memo"), dt=s["desiredTime"])
            r = req["rep"]
            run(c, """INSERT INTO booking_member (booking_no, seq, is_rep, name_ko, name_en, country_code, phone, email)
                      VALUES (:no, 1, 1, :nl, :ne, :cc, :ph, :em)""",
                no=no, nl=r["nameLocal"].strip(), ne=r["nameEn"].strip().upper(), cc=r["countryCode"], ph=r["phone"], em=r["email"])
            comps = req["companions"]
            for i in range(people - 1):
                name = (comps[i]["nameEn"].strip().upper() or None) if i < len(comps) else None
                run(c, "INSERT INTO booking_member (booking_no, seq, name_en) VALUES (:no, :s, :n)", no=no, s=i + 2, n=name)
            run(c, "UPDATE departure SET booked_count = booked_count + :n WHERE id = :id", n=people, id=d["id"])
            run(c, "DELETE FROM seat_hold WHERE id = :id", id=hold["id"])

    if sold_out:
        # L-08 3): 예약을 만들지 않고 전액 환불 + NO_SEAT 안내 (예약번호가 없어 notification 대신 로그)
        payment.refund(req["paymentId"], q["total"], "no-seat")
        fail("E-SOLDOUT")
    with tx() as c:
        notify(c, no, req["rep"]["email"], "CONFIRM", lang=req["lang"])
    return {"bookingNo": no, "status": "CONFIRMED"}


def list_bookings(m: Member, departure_id: str | None = None) -> list[dict]:
    """API-11: 내 예약 목록. departureId를 주면 그 출발편의 살아 있는 예약만 (중복 예약 확인, EV-28 ④)"""
    with conn() as c:
        rs = rows(c, f"""SELECT b.no, p.id package_id, p.name_ko, p.name_ja, d.dep_date, b.people, b.total_price, b.status, d.status dstatus
                         FROM booking b JOIN departure d ON d.id = b.departure_id JOIN package p ON p.id = d.package_id
                         WHERE b.member_id = :m {"AND b.departure_id = :d AND b.status = 'CONFIRMED'" if departure_id else ""}
                         ORDER BY d.dep_date DESC, b.no""", m=m.memberId, d=departure_id)
    return [{"no": r["no"], "packageId": r["package_id"], "packageName": {"ko": r["name_ko"], "ja": r["name_ja"]}, "depDate": r["dep_date"],
             "people": r["people"], "total": r["total_price"], "status": r["status"], "departureStatus": r["dstatus"]} for r in rs]


def get_booking(m: Member, no: str) -> dict:
    """API-12: 예약 상세 (본인만)"""
    with conn() as c:
        b = one(c, "SELECT * FROM booking WHERE no = :no", no=no) or fail("E-NOTFOUND")
        if b["member_id"] != m.memberId:
            fail("E-FORBID")
        d = one(c, DEP_SQL + " WHERE d.id = :id", id=b["departure_id"])
        stops = rows(c, """SELECT kind, place_name placeName, place_id placeId, address, lat, lng, memo, desired_time desiredTime,
                                  stop_order stopOrder, pickup_time pickupTime
                           FROM booking_stop WHERE booking_no = :no ORDER BY kind DESC""", no=no)
        members = rows(c, """SELECT seq, is_rep isRep, name_ko nameLocal, name_en nameEn, country_code countryCode, phone, email
                             FROM booking_member WHERE booking_no = :no ORDER BY seq""", no=no)
    return {
        "no": no, "packageId": d["package_id"], "status": b["status"], "people": b["people"], "singles": b["single_count"],
        "unitPrice": b["unit_price"], "total": b["total_price"], "currency": b["currency"], "optionId": b["hotel_option_id"],
        "lang": b["lang"], "createdAt": b["created_at"], "refundStatus": b["refund_status"],
        "departure": {"id": d["id"], "date": d["dep_date"], "booked": d["booked_count"], "minPeople": d["min_people"],
                      "seatsLeft": dep_seats(d), "status": d["status"], "judgeDate": d["judge_date"]},
        "companionDue": add_days(d["dep_date"], -S.COMPANION_DUE_DAYS),
        "stops": stops, "members": [{**x, "isRep": bool(x["isRep"])} for x in members],
    }


def save_companions(m: Member, no: str, companions: list[dict]) -> dict:
    """API-13: 동반자 명단 저장 (마감 전, CONFIRMED만)"""
    with tx() as c:
        b = one(c, """SELECT b.member_id, b.status, b.people, d.dep_date FROM booking b JOIN departure d ON d.id = b.departure_id
                      WHERE b.no = :no FOR UPDATE""", no=no) or fail("E-NOTFOUND")
        if b["member_id"] != m.memberId:
            fail("E-FORBID")
        if b["status"] != "CONFIRMED" or clock.today() > add_days(b["dep_date"], -S.COMPANION_DUE_DAYS):
            fail("E-DUE")
        if len(companions) > b["people"] - 1 or any(x["nameEn"] and not NAME_EN.fullmatch(x["nameEn"].strip().upper()) for x in companions):
            fail("E-VALID", [{"field": "companions", "rule": "V-24"}])
        for i in range(b["people"] - 1):
            name = (companions[i]["nameEn"].strip().upper() or None) if i < len(companions) else None
            run(c, "UPDATE booking_member SET name_en = :n WHERE booking_no = :no AND seq = :s", n=name, no=no, s=i + 2)
    return {"saved": len(companions)}


def _booking_for_cancel(c: Connection, no: str) -> dict:
    return one(c, "SELECT status, departure_id, people, payment_id, total_price FROM booking WHERE no = :no FOR UPDATE", no=no) or fail("E-NOTFOUND")


def _cancel_confirmed(c: Connection, no: str, b: dict, note: str | None) -> None:
    """L-14: CONFIRMED 예약을 고객 취소로. 출발편 잠금 → 예약 상태·취소 정보 → 출발편 인원 되돌림 (API-16, API-19 공통)"""
    _lock_departure(c, b["departure_id"])
    run(c, "UPDATE booking SET status='USER_CANCEL', cancel_by='USER', cancel_note=:n, canceled_at=UTC_TIMESTAMP(3) WHERE no=:no",
        n=note[:200] if note else None, no=no)
    run(c, "UPDATE departure SET booked_count = booked_count - :p WHERE id = :id", p=b["people"], id=b["departure_id"])


def cancel_by_user(no: str, note: str) -> dict:
    """L-14 (API-16): 고객 취소 — 고객센터 담당자가 호출. 본 사이트 연동(API-19) 전 임시·운영 예비용"""
    with tx() as c:
        b = _booking_for_cancel(c, no)
        if b["status"] != "CONFIRMED":
            fail("E-STATE")
        _cancel_confirmed(c, no, b, note)
    # L-15 환불 요청 (금액·수수료는 메인 사이트 규정 → 결제 전액을 넘기고 메인 사이트가 계산한다고 가정, 확인 필요)
    rf = payment.refund(b["payment_id"], b["total_price"], "user-cancel")
    with tx() as c:
        run(c, "UPDATE booking SET refund_id=:r, refund_status='REQUESTED' WHERE no=:no", r=rf, no=no)
        rep = one(c, "SELECT email FROM booking_member WHERE booking_no=:no AND seq=1", no=no)
        if rep:
            notify(c, no, rep["email"], "USER_CANCEL")
    return {"status": "USER_CANCEL", "refundStatus": "REQUESTED"}


def cancel_from_site(no: str, refund_id: str, refund_status: str, note: str | None) -> dict:
    """API-19: 본 사이트가 처리한 고객 취소·환불 결과를 받음. 환불은 본 사이트가 이미 했으므로 payment.refund 를 부르지 않음
    - CONFIRMED: 고객 취소(L-14) + 환불 정보 저장 + USER_CANCEL 메일
    - USER_CANCEL: 환불 진행 상황(refund_id · refund_status)만 갱신
    - OP_CANCEL(운행 취소) · DONE(여행 완료): E-STATE"""
    with tx() as c:
        b = _booking_for_cancel(c, no)
        if b["status"] not in ("CONFIRMED", "USER_CANCEL"):
            fail("E-STATE")
        first = b["status"] == "CONFIRMED"
        if first:
            _cancel_confirmed(c, no, b, note)
        run(c, "UPDATE booking SET refund_id=:r, refund_status=:s WHERE no=:no", r=refund_id, s=refund_status, no=no)
        rep = one(c, "SELECT email FROM booking_member WHERE booking_no=:no AND seq=1", no=no) if first else None
        if rep:
            notify(c, no, rep["email"], "USER_CANCEL")
    return {"status": "USER_CANCEL", "refundStatus": refund_status}
