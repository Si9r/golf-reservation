import random
import string
import threading

from fastapi.testclient import TestClient

from app import clock
from app.db import one, run, tx
from app.jobs import cleanup_holds, judge_departures

A = {"authorization": "Bearer demo:M0001"}
B = {"authorization": "Bearer demo:M0002"}
ADMIN = {"x-admin-key": "test-admin"}
SITE = {"x-site-key": "test-site"}
DEP = "PKG-001-20261030"  # 금요일, 판정일 10-23 = 출발 7일 전 (오늘 10-19 기준 예약 가능)
SAPPORO = {"lat": 43.0675, "lng": 141.3508}
U = "/api/golf"


def body(hold_id, **over):
    b = {"holdId": hold_id, "optionId": "PKG-001-mitsui", "lang": "ko",
         "paymentId": "PAY-" + "".join(random.choices(string.ascii_lowercase, k=10)),
         # PKG-001 희망 시간 범위: 승차 10:00~11:00 (첫날 12:30 티오프 − 2시간 30분 ~ 12:30 − 삿포로→기타히로시마 40분 − 30분), 하차 11:00~21:00 (마지막 날 라운드 없음)
         "stops": [{"kind": "PICK", "placeName": "JR 삿포로역 남쪽 출구", **SAPPORO, "memo": "남쪽 출구 앞", "desiredTime": "10:30"},
                   {"kind": "DROP", "placeName": "JR 삿포로역 남쪽 출구", **SAPPORO, "desiredTime": "15:00"}],
         "rep": {"nameLocal": "이정훈", "nameEn": "lee junghoon", "countryCode": "+82", "phone": "10-1234-5678", "email": "a@example.com"},
         "companions": []}
    b.update(over)
    return b


def set_booked(dep, n):
    with tx() as c:
        run(c, "UPDATE departure SET booked_count = :n, status = 'OPEN' WHERE id = :id", n=n, id=dep)


def db1(sql, **a):
    with tx() as c:
        return one(c, sql, **a)


def hold(client, dep=DEP, people=2, h=A):
    r = client.post(U + "/holds", json={"departureId": dep, "people": people}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["holdId"]


# ---------- 조회 ----------
def test_list_by_date(client):  # API-01
    r = client.get(U + "/packages", params={"people": 3, "date": "2026-10-30"})
    assert r.status_code == 200
    assert "PKG-001" in [x["id"] for x in r.json()["items"]]


def test_closed_season_empty(client):
    assert client.get(U + "/packages", params={"people": 2, "date": "2026-12-01"}).json()["total"] == 0


def test_people_out_of_range(client):
    r = client.get(U + "/packages", params={"people": 21})  # 정원 20
    assert r.status_code == 400 and r.json()["error"] == "E-VALID" and r.json()["message"] == "M-160"


def test_package_not_found(client):
    assert client.get(U + "/packages/NOPE").json()["error"] == "E-NOTFOUND"


def test_package_detail_and_departures(client):  # API-02, 03
    d = client.get(U + "/packages/PKG-001").json()
    assert d["rounds"] == 2 and d["days"][0]["teeTime"] == "12:30" and len(d["options"]) == 5
    items = client.get(U + "/packages/PKG-001/departures", params={"month": "2026-10", "people": 2}).json()["items"]
    assert next(x for x in items if x["date"] == "2026-10-30")["selectable"] is True
    assert next(x for x in items if x["date"] == "2026-10-23")["selectable"] is False  # 판정일 10-16 지남


def test_calendar(client):  # API-04
    items = client.get(U + "/departures/calendar", params={"month": "2026-10", "people": 2}).json()["items"]
    assert len(items) == 31 and next(x for x in items if x["date"] == "2026-10-30")["count"] >= 1


def test_quote_odd_people(client):  # API-07
    r = client.post(U + "/quotes", json={"departureId": DEP, "optionId": "PKG-001-keio", "people": 3}).json()
    assert r["rooms"] == {"singles": 1, "twins": 1}
    assert r["total"] == (69800 + 6000) * 3 + 12000


def test_quote_no_hotel(client):
    r = client.post(U + "/quotes", json={"departureId": DEP, "optionId": "PKG-001-none", "people": 3}).json()
    assert r["rooms"] is None and r["total"] == (69800 - 9000) * 3


def test_area_check(client):  # API-06
    assert client.post(U + "/places/check", json={"lat": 43.1979, "lng": 140.9937}).json()["inArea"] is False


# ---------- 예약 흐름 (L-07, L-08) ----------
def test_hold_requires_login(client):
    assert client.post(U + "/holds", json={"departureId": DEP, "people": 2}).status_code == 401


def test_booking_flow(client):
    set_booked(DEP, 10)
    hid = hold(client, people=3)
    r = client.post(U + "/bookings", json=body(hid), headers=A)
    assert r.status_code == 201, r.text
    no = r.json()["bookingNo"]
    assert no.startswith("GT-261030-")
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=DEP)["n"] == 13
    assert len(client.get(U + "/bookings", params={"departureId": DEP}, headers=A).json()["items"]) == 1  # 중복 확인 (EV-28 ④)
    det = client.get(U + f"/bookings/{no}", headers=A).json()
    assert det["people"] == 3 and det["singles"] == 1 and det["total"] == 69800 * 3 + 12000
    assert det["members"][0]["nameEn"] == "LEE JUNGHOON"
    assert client.get(U + f"/bookings/{no}", headers=B).json()["error"] == "E-FORBID"
    assert db1("SELECT kind, result FROM notification WHERE booking_no = :no", no=no) == {"kind": "CONFIRM", "result": "OK"}


def test_booking_numbers_increase(client):  # L-09
    set_booked(DEP, 0)
    nos = [client.post(U + "/bookings", json=body(hold(client)), headers=A).json()["bookingNo"] for _ in range(2)]
    assert int(nos[1][-4:]) == int(nos[0][-4:]) + 1


def test_concurrent_holds_one_wins():
    """남은 3석을 두 사람이 동시에 2석씩 잡으면 한 명만 성공 (E-SEAT)"""
    from app.main import app

    set_booked(DEP, 17)  # 정원 20
    barrier, out = threading.Barrier(2), []

    def go(h):
        with TestClient(app) as c:
            barrier.wait()
            out.append(c.post(U + "/holds", json={"departureId": DEP, "people": 2}, headers=h))

    ts = [threading.Thread(target=go, args=(h,)) for h in (A, B)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert sorted(r.status_code for r in out) == [201, 409]
    assert next(r for r in out if r.status_code == 409).json()["error"] == "E-SEAT"


def test_closed_after_judge_date(client):
    clock.set_today("2026-10-23")  # DEP 판정일 당일
    assert client.post(U + "/holds", json={"departureId": DEP, "people": 2}, headers=A).json()["error"] == "E-CLOSED"


def test_area_and_validation_errors(client):
    set_booked(DEP, 0)
    hid = hold(client)
    bad = body(hid, stops=[{"kind": "PICK", "placeName": "오타루역", "lat": 43.1979, "lng": 140.9937, "desiredTime": "10:30"},
                           {"kind": "DROP", "placeName": "삿포로역", **SAPPORO, "desiredTime": "15:00"}])
    assert client.post(U + "/bookings", json=bad, headers=A).json()["error"] == "E-AREA"
    v = client.post(U + "/bookings", json=body(hid, rep={"nameLocal": "", "nameEn": "이정훈", "countryCode": "+82", "phone": "1", "email": "x"}), headers=A).json()
    assert v["error"] == "E-VALID"
    assert [f["rule"] for f in v["fields"]] == ["V-20", "V-21", "V-22", "V-23"]


def stops_with(pick=None, drop=None):
    st = body(0)["stops"]
    for s, t in zip(st, (pick, drop)):
        if t is None:
            s.pop("desiredTime")
        else:
            s["desiredTime"] = t
    return st


def test_desired_time_required(client):  # V-12
    set_booked(DEP, 0)
    hid = hold(client)
    r = client.post(U + "/bookings", json=body(hid, stops=stops_with(pick="10:30")), headers=A).json()
    assert r["error"] == "E-VALID" and r["fields"] == [{"field": "stops.1.desiredTime", "rule": "V-12"}]
    r = client.post(U + "/bookings", json=body(hid, stops=stops_with(drop="15:00")), headers=A).json()
    assert r["fields"] == [{"field": "stops.0.desiredTime", "rule": "V-12"}]
    r = client.post(U + "/bookings", json=body(hid, stops=stops_with(pick="10:15", drop="15:00")), headers=A).json()  # 30분 단위 아님
    assert r["fields"] == [{"field": "stops.0.desiredTime", "rule": "V-12"}]


def test_desired_time_range(client):  # V-12-range: 첫날 티오프(12:30) 이후 승차, 범위 끝(11:00) 넘김, 티오프 2시간 30분 전(10:00)보다 이름
    set_booked(DEP, 0)
    hid = hold(client)
    for t in ("13:00", "11:30", "09:30", "06:00"):
        r = client.post(U + "/bookings", json=body(hid, stops=stops_with(pick=t, drop="15:00")), headers=A).json()
        assert r["error"] == "E-VALID" and r["fields"] == [{"field": "stops.0.desiredTime", "rule": "V-12-range"}]
    r = client.post(U + "/bookings", json=body(hid, stops=stops_with(pick="10:00", drop="21:30")), headers=A).json()
    assert r["fields"] == [{"field": "stops.1.desiredTime", "rule": "V-12-range"}]


def test_desired_time_saved(client):
    set_booked(DEP, 0)
    r = client.post(U + "/bookings", json=body(hold(client), stops=stops_with(pick="10:00", drop="11:00")), headers=A)  # 범위 시작
    assert r.status_code == 201, r.text
    stops = client.get(U + f"/bookings/{r.json()['bookingNo']}", headers=A).json()["stops"]
    assert {s["kind"]: s["desiredTime"] for s in stops} == {"PICK": "10:00", "DROP": "11:00"}


def test_stop_time_range():  # 서버 계산 (화면 logic.ts stopTimeRange 와 같은 규칙)
    from app.services.booking import stop_time_range

    day = lambda tee=None, area=None, dep=None: {"tee_time": tee, "depart_time": dep, "course_area": area}  # noqa: E731
    days = [day("12:30", "KITAHIROSHIMA"), day("08:30", "SAPPORO")]
    assert stop_time_range(days, "PICK", "SAPPORO") == (10 * 60, 11 * 60)  # 12:30 − 2시간 30분 = 10:00 ~ 12:30 − 40 − 30 = 11:20 → 11:00
    assert stop_time_range([day("12:15", "KITAHIROSHIMA")], "PICK", "SAPPORO") == (10 * 60, 11 * 60)  # 09:45 → 올림 10:00, 11:05 → 내림 11:00
    assert stop_time_range(days, "DROP", "SAPPORO") == (14 * 60 + 30, 21 * 60)  # 08:30 + 5시간 + 40 = 14:10 → 올림 14:30
    no_round = [day("07:30", "TOMAKOMAI"), day()]
    assert stop_time_range(no_round, "PICK", "SAPPORO") == (6 * 60, 5 * 60 + 30)  # 시작 05:00 → 06:00, 끝 07:30 − 70 − 30 = 05:50 → 고를 시간 없음
    assert stop_time_range([day(dep="09:00"), day()], "PICK", "SAPPORO") == (6 * 60, 8 * 60 + 30)  # 첫날 라운드 없음: 06:00 ~ 출발 − 30분
    assert stop_time_range(no_round, "DROP", "SAPPORO") == (11 * 60, 21 * 60)  # 마지막 날 라운드 없음 → 11:00


def test_payment_fail_and_amount(client):
    hid = hold(client)
    assert client.post(U + "/bookings", json=body(hid, paymentId="PAY-FAIL-1"), headers=A).json()["error"] == "E-PAY"
    assert client.post(U + "/bookings", json=body(hid, paymentId="PAY-AMT-1"), headers=A).json()["error"] == "E-AMOUNT"


def test_expired_hold(client):
    """확보 만료 후 결제: 자리 있으면 확정, 없으면 E-SOLDOUT(환불)"""
    set_booked(DEP, 10)
    hid = hold(client)
    with tx() as c:
        run(c, "UPDATE seat_hold SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE")
    assert client.post(U + "/bookings", json=body(hid), headers=A).status_code == 201
    hid2 = hold(client)
    with tx() as c:
        run(c, "UPDATE seat_hold SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE")
    set_booked(DEP, 19)  # 그 사이 자리가 참 (정원 20, 남은 1석 < 2명)
    assert client.post(U + "/bookings", json=body(hid2), headers=A).json()["error"] == "E-SOLDOUT"


# ---------- 배치 · 운영 ----------
def test_judge(client):
    """B-01: 20명 이상 GO, 미달은 운행 취소 + 환불 요청 (판정일 = 출발 7일 전)"""
    go, no = "PKG-001-20261027", "PKG-001-20261103"  # 판정일 10-20, 10-27
    set_booked(go, 18)
    set_booked(no, 0)
    for d in (go, no):
        assert client.post(U + "/bookings", json=body(hold(client, d)), headers=A).status_code == 201
    clock.set_today("2026-10-27")  # 두 출발편 모두 판정일이 됨
    judge_departures()
    assert db1("SELECT status FROM departure WHERE id = :id", id=go)["status"] == "GO"
    assert db1("SELECT status FROM departure WHERE id = :id", id=no)["status"] == "CANCEL"
    assert db1("SELECT status, cancel_by, refund_status FROM booking WHERE departure_id = :id", id=no) == \
        {"status": "OP_CANCEL", "cancel_by": "OP", "refund_status": "REQUESTED"}


def test_admin_cancel(client):  # API-16
    dep = "PKG-001-20261106"
    set_booked(dep, 5)
    no = client.post(U + "/bookings", json=body(hold(client, dep, 4)), headers=A).json()["bookingNo"]
    assert client.post(U + f"/admin/bookings/{no}/cancel", json={"cancelNote": "고객 요청"}).status_code == 401
    r = client.post(U + f"/admin/bookings/{no}/cancel", json={"cancelNote": "고객 요청"}, headers=ADMIN)
    assert r.json() == {"status": "USER_CANCEL", "refundStatus": "REQUESTED"}
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=dep)["n"] == 5
    assert client.post(U + f"/admin/bookings/{no}/cancel", json={"cancelNote": "x"}, headers=ADMIN).json()["error"] == "E-STATE"


def test_cleanup_holds():  # B-02
    with tx() as c:
        run(c, """INSERT INTO seat_hold (departure_id, member_id, people, expires_at) VALUES
                  (:d, 'X', 1, UTC_TIMESTAMP(3) - INTERVAL 2 HOUR), (:d, 'Y', 1, UTC_TIMESTAMP(3) - INTERVAL 5 MINUTE)""", d=DEP)
    assert cleanup_holds() == 1


# ---------- API-19 본 사이트 고객 취소·환불 결과 ----------
SITE_DEP = "PKG-001-20261110"  # 판정일 11-03 (판정 테스트 영향 없음)


def site_cancel(client, no, h=SITE, **b):
    return client.post(U + f"/site/bookings/{no}/cancel", json={"refundId": "RF-SITE-1", "refundStatus": "REQUESTED", **b}, headers=h)


def test_site_cancel_requires_key(client):
    assert site_cancel(client, "GT-261110-0001", h={}).status_code == 401
    r = site_cancel(client, "GT-261110-0001", h={"x-site-key": "wrong"})
    assert r.status_code == 401 and r.json()["error"] == "E-AUTH"


def test_site_cancel_confirmed(client):
    set_booked(SITE_DEP, 5)
    no = client.post(U + "/bookings", json=body(hold(client, SITE_DEP, 3)), headers=A).json()["bookingNo"]
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=SITE_DEP)["n"] == 8
    r = site_cancel(client, no, note="고객 사정")
    assert r.status_code == 200 and r.json() == {"status": "USER_CANCEL", "refundStatus": "REQUESTED"}
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=SITE_DEP)["n"] == 5
    assert db1("SELECT status, cancel_by, cancel_note, refund_id, refund_status, canceled_at IS NOT NULL canceled FROM booking WHERE no = :no", no=no) == \
        {"status": "USER_CANCEL", "cancel_by": "USER", "cancel_note": "고객 사정", "refund_id": "RF-SITE-1", "refund_status": "REQUESTED", "canceled": 1}
    assert db1("SELECT result FROM notification WHERE booking_no = :no AND kind = 'USER_CANCEL'", no=no) == {"result": "OK"}


def test_site_cancel_refund_update(client):
    set_booked(SITE_DEP, 5)
    no = client.post(U + "/bookings", json=body(hold(client, SITE_DEP, 2)), headers=A).json()["bookingNo"]
    site_cancel(client, no)
    r = site_cancel(client, no, refundId="RF-SITE-2", refundStatus="DONE")
    assert r.json() == {"status": "USER_CANCEL", "refundStatus": "DONE"}
    assert db1("SELECT refund_id, refund_status FROM booking WHERE no = :no", no=no) == {"refund_id": "RF-SITE-2", "refund_status": "DONE"}
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=SITE_DEP)["n"] == 5  # 인원은 한 번만 되돌림
    assert db1("SELECT COUNT(*) n FROM notification WHERE booking_no = :no AND kind = 'USER_CANCEL'", no=no)["n"] == 1


def test_site_cancel_op_cancel_state(client):
    set_booked(SITE_DEP, 5)
    no = client.post(U + "/bookings", json=body(hold(client, SITE_DEP, 2)), headers=A).json()["bookingNo"]
    with tx() as c:
        run(c, "UPDATE booking SET status = 'OP_CANCEL', cancel_by = 'OP' WHERE no = :no", no=no)
    r = site_cancel(client, no)
    assert r.status_code == 409 and r.json()["error"] == "E-STATE"
    assert site_cancel(client, "GT-000000-9999").json()["error"] == "E-NOTFOUND"
