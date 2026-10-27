"""견적(L-05) · 좌석 임시확보(L-07) · 예약 확정(L-08, L-09) · 조회 · 동반자 · 고객 취소(L-14, API-16, API-19)"""
from __future__ import annotations

import json
import re

from sqlalchemy.engine import Connection

from .. import clock
from .. import settings as S
from ..adapters.auth import Member
from ..adapters.mail import alert_ops, notify
from ..adapters import payment
from ..adapters.partner import ORDER_CANCELED, ORDER_FINAL_FAIL, ORDER_PAID, PartnerError
from ..db import conn, one, rows, run, tx
from ..errors import fail
from ..rules import add_days, booking_no, booking_tab, in_area, is_bookable_date, quote
from .catalog import DEP_SQL, dep_seats, sale_rule, stay_info

# V-21·V-24 영문 이름: 성과 이름을 모두 (영문 대문자 단어 2개 이상, 단어 사이 공백 1칸, 단어 안 하이픈·아포스트로피 허용, 60자 이하).
# 소문자는 대문자로 바꿔 검사 (팀 테스트 10/23). 화면 apps/web/src/screens/InfoForm.tsx V21 과 같음
NAME_EN = re.compile(r"[A-Z]+(?:['-][A-Z]+)*(?: [A-Z]+(?:['-][A-Z]+)*)+")
NAME_EN_MAX = 60
# 손님에게 보이는 예약 (S-12·S-13, API-11·12·13): 결제 대기(PENDING_PAYMENT)·미결제(UNPAID)는 보이지 않음
VISIBLE = ("CONFIRMED", "USER_CANCEL", "OP_CANCEL", "DONE")
VISIBLE_SQL = "('" + "','".join(VISIBLE) + "')"
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


def valid_en(name: str) -> bool:
    s = name.strip().upper()
    return len(s) <= NAME_EN_MAX and NAME_EN.fullmatch(s) is not None


def _validate(req: dict, people: int) -> None:
    """입력 검사 V-20~V-24 (화면 검사와 같은 규칙을 서버에서 다시)"""
    f: list[dict] = []
    r = req["rep"]
    if not r["nameLocal"].strip() or len(r["nameLocal"].strip()) > 30:
        f.append({"field": "rep.nameLocal", "rule": "V-20"})
    if not valid_en(r["nameEn"]):
        f.append({"field": "rep.nameEn", "rule": "V-21"})
    if not re.fullmatch(r"[\d\s-]{8,}", r["phone"]):
        f.append({"field": "rep.phone", "rule": "V-22"})
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", r["email"]):
        f.append({"field": "rep.email", "rule": "V-23"})
    # V-24 동반자 영문 이름: 인원 − 1명 모두 필수 (팀 결정 10/23, 팀원 S-09 화면과 같게. 운영사 확인 필요)
    if len(req["companions"]) != people - 1:
        f.append({"field": "companions", "rule": "V-24"})
    for i, x in enumerate(req["companions"]):
        if not valid_en(x["nameEn"]):
            f.append({"field": f"companions.{i}.nameEn", "rule": "V-24"})
    for k in ("PICK", "DROP"):
        if sum(1 for s in req["stops"] if s["kind"] == k) != 1:
            f.append({"field": "stops", "rule": f"one-{k}"})
    for i, s in enumerate(req["stops"]):
        if len(s.get("memo") or "") > S.MEMO_MAX:
            f.append({"field": f"stops.{i}.memo", "rule": "V-11"})
        t = s.get("desiredTime") or ""
        if s["kind"] == "DROP" and not t:
            continue  # V-12 희망 하차 시간은 선택
        if not HHMM.fullmatch(t) or _min(t) % S.STOP_TIME_STEP_MIN:  # V-12 희망 시간: 승차 필수, 30분 단위
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
    if not days:  # 일정이 없는 패키지(데이터 오류)는 기본 범위로 (500 방지)
        return lo, hi
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
    """L-08 (API-10, 본 사이트 결제 연동 10/27): 결제 전에 예약을 결제 대기(PENDING_PAYMENT)로 만들고 예약번호 발급.
    입력 검사 → 출발편 잠금 → 같은 회원의 주문 전 결제 대기는 미결제로 → 잔여석 확인 → 예약·승하차·탑승자 저장.
    좌석은 이 예약이 잡음 (주문 전 HOLD_MINUTES 분, 주문 후는 결과가 나올 때까지). 금액은 서버 계산값 (화면 값 안 씀)"""
    people = req["people"]
    with conn() as c:
        _validate(req, people)
        stops = []
        for s in req["stops"]:
            area = _area_of(c, s) or fail("E-AREA", [{"field": f"stops.{s['kind']}", "rule": "L-06"}])
            stops.append({**s, "areaId": area})
        days = _days_of_dep(c, req["departureId"])
        out = []
        for i, s in enumerate(stops):  # V-12 범위: 패키지 일정으로 정한 범위 안인지 (하차 시간을 안 넣었으면 건너뜀)
            if not s.get("desiredTime"):
                continue
            lo, hi = stop_time_range(days, s["kind"], s["areaId"])
            if not lo <= _min(s["desiredTime"]) <= hi:
                out.append({"field": f"stops.{i}.desiredTime", "rule": "V-12-range"})
        if out:
            fail("E-VALID", out)
        q = make_quote(c, req["departureId"], req.get("optionId"), people, req.get("singles"))

    with tx() as c:
        p = _pkg_of_dep(c, req["departureId"]) or fail("E-NOTFOUND")
        _lock_departure(c, req["departureId"])
        # 같은 회원이 다시 만드는 경우: 주문 전 결제 대기는 미결제로 (좌석 풀림). 주문을 만든 예약은 결제가 진행 중일 수 있어 그대로
        run(c, "UPDATE booking SET status = 'UNPAID' WHERE member_id = :m AND status = 'PENDING_PAYMENT' AND order_id IS NULL", m=m.memberId)
        d = one(c, DEP_SQL + " WHERE d.id = :id", id=req["departureId"])
        if not is_bookable_date(sale_rule(p), d["dep_date"], clock.today(), d["status"]):
            fail("E-CLOSED")
        if dep_seats(d) < people:
            fail("E-SEAT")
        run(c, "INSERT INTO booking_seq (dep_date, last_no) VALUES (:d, LAST_INSERT_ID(1)) "
               "ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)", d=d["dep_date"])
        seq = one(c, "SELECT LAST_INSERT_ID() n")["n"]
        no = booking_no(d["dep_date"], int(seq))
        run(c, """INSERT INTO booking (no, member_id, departure_id, hotel_option_id, people, single_count, unit_price, total_price, status, lang)
                  VALUES (:no, :m, :d, :o, :n, :s, :u, :t, 'PENDING_PAYMENT', :lang)""",
            no=no, m=m.memberId, d=d["id"], o=req.get("optionId"), n=people, s=(q["rooms"] or {}).get("singles", 0),
            u=q["unitPrice"], t=q["total"], lang=req["lang"])
        for s in stops:
            run(c, """INSERT INTO booking_stop (booking_no, kind, place_name, place_id, address, lat, lng, area_id, memo, desired_time)
                      VALUES (:no, :k, :n, :pid, :a, :lat, :lng, :area, :memo, :dt)""",
                no=no, k=s["kind"], n=s["placeName"], pid=s.get("placeId"), a=s.get("address"), lat=s["lat"], lng=s["lng"], area=s["areaId"],
                memo=s.get("memo"), dt=s.get("desiredTime") or None)
        r = req["rep"]
        run(c, """INSERT INTO booking_member (booking_no, seq, is_rep, name_ko, name_en, country_code, phone, email)
                  VALUES (:no, 1, 1, :nl, :ne, :cc, :ph, :em)""",
            no=no, nl=r["nameLocal"].strip(), ne=r["nameEn"].strip().upper(), cc=r["countryCode"], ph=r["phone"], em=r["email"])
        comps = req["companions"]
        for i in range(people - 1):
            run(c, "INSERT INTO booking_member (booking_no, seq, name_en) VALUES (:no, :s, :n)", no=no, s=i + 2, n=comps[i]["nameEn"].strip().upper())
        exp = one(c, f"SELECT created_at + INTERVAL {S.HOLD_MINUTES} MINUTE e FROM booking WHERE no = :no", no=no)["e"]
    return {"bookingNo": no, "status": "PENDING_PAYMENT", "total": q["total"], "expiresAt": exp}


def _my_booking(c: Connection, m: Member, no: str, lock: bool = False) -> dict:
    b = one(c, "SELECT * FROM booking WHERE no = :no" + (" FOR UPDATE" if lock else ""), no=no) or fail("E-NOTFOUND")
    if b["member_id"] != m.memberId:
        fail("E-FORBID")
    return b


def _orderless_expired(c: Connection, no: str) -> bool:
    r = one(c, f"SELECT created_at < UTC_TIMESTAMP(3) - INTERVAL {S.HOLD_MINUTES} MINUTE x FROM booking WHERE no = :no", no=no)
    return bool(r and r["x"])


def abandon_pending(m: Member, no: str) -> None:
    """결제 대기 예약을 손님이 그만둠 (S-10 뒤로 가기 등): 주문 전이면 미결제로 바꿔 좌석을 바로 풂. 주문 후는 결제가 진행 중일 수 있어 그대로"""
    with tx() as c:
        b = _my_booking(c, m, no, lock=True)
        if b["status"] == "PENDING_PAYMENT" and not b["order_id"]:
            run(c, "UPDATE booking SET status = 'UNPAID' WHERE no = :no", no=no)


def checkout(m: Member, no: str) -> dict:
    """API-20 결제 시작: 본 사이트 주문 생성 (POST /api/partner/orders) → order_id 저장 → checkout_url 을 화면에.
    같은 예약으로 두 번 눌러도 주문은 하나 (본 사이트 409 duplicate_reference → 응답의 기존 주문 사용)"""
    with tx() as c:
        b = _my_booking(c, m, no, lock=True)
        if b["status"] != "PENDING_PAYMENT":
            fail("E-STATE")
        if not b["order_id"]:
            if _orderless_expired(c, no):  # 주문 전 좌석 확보(10분)가 지남 → 미결제, 좌석 풀림
                run(c, "UPDATE booking SET status = 'UNPAID' WHERE no = :no", no=no)
                expired = True
            else:
                expired = False
                p = _pkg_of_dep(c, b["departure_id"])
                d = one(c, "SELECT dep_date, status FROM departure WHERE id = :id", id=b["departure_id"])
                if not is_bookable_date(sale_rule(p), d["dep_date"], clock.today(), d["status"]):  # 그 사이 판정일이 지남
                    run(c, "UPDATE booking SET status = 'UNPAID' WHERE no = :no", no=no)
                    expired = None
        else:
            expired = False
        info = one(c, """SELECT p.name_ja, p.name_ko, d.dep_date FROM departure d JOIN package p ON p.id = d.package_id WHERE d.id = :id""", id=b["departure_id"])
    if expired:
        fail("E-HOLD")
    if expired is None:
        fail("E-CLOSED")
    amount = int(b["total_price"])  # 서버가 계산해 저장한 총액만 보냄 (본 사이트는 검증 없이 그대로 청구)
    if amount < payment.MIN_AMOUNT:
        fail("E-VALID", [{"field": "amount", "rule": "min-100"}])
    o = payment.create_order(reference=no, amount=amount, title_ja=f"{info['name_ja']} {info['dep_date']}", title_ko=f"{info['name_ko']} {info['dep_date']}",
                             user_id=m.memberId, departure_date=info["dep_date"], heads=int(b["people"]), return_url=payment.return_url(no))
    with tx() as c:
        run(c, """UPDATE booking SET order_id = COALESCE(order_id, :o), order_status = :st, order_checked_at = UTC_TIMESTAMP(3)
                  WHERE no = :no""", o=o["order_id"], st=o.get("status"), no=no)
    final = apply_order(no, o) if o.get("status") in (ORDER_PAID, *ORDER_FINAL_FAIL) else "PENDING_PAYMENT"
    return {"bookingNo": no, "orderId": o["order_id"], "checkoutUrl": o.get("checkout_url"), "status": final}


def payment_status(m: Member, no: str) -> dict:
    """API-21 결제 결과 확인 (결과 화면이 부름): return_url 도착만으로 성공 처리하지 않고 본 사이트 주문 상태를 조회해 반영"""
    with conn() as c:
        b = _my_booking(c, m, no)
    st, ost = b["status"], b["order_status"]
    if st == "PENDING_PAYMENT" and b["order_id"]:
        o = payment.get_order(b["order_id"])
        ost = o.get("status")
        st = apply_order(no, o)
    return {"bookingNo": no, "status": st, "orderStatus": ost}


def apply_order(no: str, order: dict) -> str:
    """본 사이트 주문 상태를 예약에 반영. 여러 번(결과 화면·배치 동시) 불려도 한 번만: 출발편 행 잠금 → 예약 잠금 → 상태 다시 확인.
    paid → CONFIRMED + 확정 인원 += 인원 (판정이 끝나 운행 취소된 출발편이면 OP_CANCEL 후 바로 환불)
    failed·expired → UNPAID (좌석 풀림) / pending·authenticating → 결제 대기 유지 (좌석 유지)"""
    st = order.get("status")
    late_refund = False
    with tx() as c:
        dep_id = (one(c, "SELECT departure_id FROM booking WHERE no = :no", no=no) or fail("E-NOTFOUND"))["departure_id"]
        run(c, "SELECT id FROM departure WHERE id = :id FOR UPDATE", id=dep_id)
        b = one(c, "SELECT status, people, order_id FROM booking WHERE no = :no FOR UPDATE", no=no)
        run(c, "UPDATE booking SET order_status = :st, order_checked_at = UTC_TIMESTAMP(3) WHERE no = :no", st=st, no=no)
        if b["status"] != "PENDING_PAYMENT":
            return b["status"]  # 이미 반영됨
        if st == ORDER_PAID:
            d = one(c, "SELECT status FROM departure WHERE id = :id", id=dep_id)
            if d["status"] in ("OPEN", "GO"):
                run(c, "UPDATE booking SET status = 'CONFIRMED' WHERE no = :no", no=no)
                run(c, "UPDATE departure SET booked_count = booked_count + :n WHERE id = :id", n=b["people"], id=dep_id)
                # 예약 확정(결제 완료) 메일은 본 사이트가 보냄 → 골프 CONFIRM 메일은 보내지 않음 (템플릿은 adapters/mail.py 에 남김)
                return "CONFIRMED"
            # 판정이 끝나 운행 취소(·완료)된 출발편: 판정은 확정 예약만 세므로 이 예약은 출발할 수 없음 → 운행 취소 + 바로 환불
            run(c, "UPDATE booking SET status = 'OP_CANCEL', cancel_by = 'OP', canceled_at = UTC_TIMESTAMP(3) WHERE no = :no", no=no)
            late_refund = True
        elif st in ORDER_FINAL_FAIL:
            run(c, "UPDATE booking SET status = 'UNPAID' WHERE no = :no", no=no)
            return "UNPAID"
        else:
            return "PENDING_PAYMENT"
    if late_refund:
        refund_booking(no, "operator_cancel")
    return "OP_CANCEL"


def list_bookings(m: Member, departure_id: str | None = None) -> list[dict]:
    """API-11: 내 예약 목록. departureId를 주면 그 출발편의 살아 있는 예약만 (중복 예약 확인, EV-28 ④). tab = S-12 탭 분류 (booking_tab)"""
    with conn() as c:
        rs = rows(c, f"""SELECT b.no, p.id package_id, p.name_ko, p.name_ja, d.dep_date, b.people, b.total_price, b.status, d.status dstatus
                         FROM booking b JOIN departure d ON d.id = b.departure_id JOIN package p ON p.id = d.package_id
                         WHERE b.member_id = :m AND b.status IN {VISIBLE_SQL} {"AND b.departure_id = :d AND b.status = 'CONFIRMED'" if departure_id else ""}
                         ORDER BY d.dep_date DESC, b.no""", m=m.memberId, d=departure_id)
    return [{"no": r["no"], "packageId": r["package_id"], "packageName": {"ko": r["name_ko"], "ja": r["name_ja"]}, "depDate": r["dep_date"],
             "people": r["people"], "total": r["total_price"], "status": r["status"], "tab": booking_tab(r["status"]), "departureStatus": r["dstatus"]} for r in rs]


def get_booking(m: Member, no: str) -> dict:
    """API-12: 예약 상세 (본인만)"""
    with conn() as c:
        b = one(c, "SELECT * FROM booking WHERE no = :no", no=no) or fail("E-NOTFOUND")
        if b["status"] not in VISIBLE:  # 결제 대기·미결제는 손님 상세에 없음 (결제 결과는 /payment)
            fail("E-NOTFOUND")
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
    """API-13: 동반자 이름 수정 (오타 수정용, 팀 결정 10/23). 이름은 예약(API-10) 때 모두 받음.
    마감(출발 COMPANION_DUE_DAYS일 전) 전 CONFIRMED만, 인원 − 1명 모두 필수 (빈 이름으로 저장 불가)"""
    with tx() as c:
        b = one(c, """SELECT b.member_id, b.status, b.people, d.dep_date FROM booking b JOIN departure d ON d.id = b.departure_id
                      WHERE b.no = :no FOR UPDATE""", no=no) or fail("E-NOTFOUND")
        if b["member_id"] != m.memberId:
            fail("E-FORBID")
        if b["status"] != "CONFIRMED" or clock.today() > add_days(b["dep_date"], -S.COMPANION_DUE_DAYS):
            fail("E-DUE")
        if len(companions) != b["people"] - 1 or any(not valid_en(x["nameEn"]) for x in companions):  # V-24: 모두 필수
            fail("E-VALID", [{"field": "companions", "rule": "V-24"}])
        for i in range(b["people"] - 1):
            name = (companions[i]["nameEn"].strip().upper() or None) if i < len(companions) else None
            run(c, "UPDATE booking_member SET name_en = :n WHERE booking_no = :no AND seq = :s", n=name, no=no, s=i + 2)
    return {"saved": len(companions)}


def refund_booking(no: str, reason: str) -> str:
    """L-15 환불: 본 사이트 POST /api/partner/orders/{order_id}/cancel (reason = operator_cancel | customer_cancel).
    paid 주문만·전액만. 409 refused · 502 등 실패 → refund_status = FAIL + 운영자 알림 (B-07 환불 재시도가 다시 시도).
    돌려주는 값: refund_status (DONE · REQUESTED · FAIL) 또는 주문이 없으면 None"""
    with conn() as c:
        b = one(c, "SELECT order_id FROM booking WHERE no = :no", no=no)
    if not b or not b["order_id"]:
        return None
    try:
        r = payment.cancel_order(b["order_id"], reason)
    except PartnerError as e:
        with tx() as c:
            run(c, "UPDATE booking SET refund_status = 'FAIL' WHERE no = :no", no=no)
            alert_ops(c, no, f"환불 실패 ({reason}): 본 사이트 {e.status} {e.code}. 환불 재시도 배치(B-07)가 다시 시도")
        return "FAIL"
    st = "DONE" if r.get("status") == ORDER_CANCELED else "REQUESTED"
    with tx() as c:
        run(c, """UPDATE booking SET refund_status = :st, refund_id = COALESCE(refund_id, :rid), order_status = :os, order_checked_at = UTC_TIMESTAMP(3)
                  WHERE no = :no""", st=st, rid=r.get("refund_id") or b["order_id"], os=r.get("status"), no=no)
    return st


def _booking_for_cancel(c: Connection, no: str) -> dict:
    return one(c, "SELECT status, departure_id, people, order_id, total_price FROM booking WHERE no = :no FOR UPDATE", no=no) or fail("E-NOTFOUND")


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
    # L-15 환불: 본 사이트 customer_cancel (지금은 전액 환불만 가능, 고객 취소 수수료는 확인 대기)
    rs = refund_booking(no, "customer_cancel")
    with tx() as c:
        rep = one(c, "SELECT email FROM booking_member WHERE booking_no=:no AND seq=1", no=no)
        if rep:
            notify(c, no, rep["email"], "USER_CANCEL")
    return {"status": "USER_CANCEL", "refundStatus": rs}


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
