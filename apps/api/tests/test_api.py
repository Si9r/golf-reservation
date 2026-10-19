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
DEP = "PKG-001-20261023"  # 금요일, 판정일 10-20 (오늘 10-19 기준 예약 가능)
SAPPORO = {"lat": 43.0675, "lng": 141.3508}
U = "/api/golf"


def body(hold_id, **over):
    b = {"holdId": hold_id, "optionId": "PKG-001-mitsui", "lang": "ko",
         "paymentId": "PAY-" + "".join(random.choices(string.ascii_lowercase, k=10)),
         "stops": [{"kind": "PICK", "placeName": "JR 삿포로역 남쪽 출구", **SAPPORO, "memo": "남쪽 출구 앞"},
                   {"kind": "DROP", "placeName": "JR 삿포로역 남쪽 출구", **SAPPORO}],
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
    r = client.get(U + "/packages", params={"people": 3, "date": "2026-10-23"})
    assert r.status_code == 200
    assert "PKG-001" in [x["id"] for x in r.json()["items"]]


def test_closed_season_empty(client):
    assert client.get(U + "/packages", params={"people": 2, "date": "2026-12-01"}).json()["total"] == 0


def test_people_out_of_range(client):
    r = client.get(U + "/packages", params={"people": 31})
    assert r.status_code == 400 and r.json()["error"] == "E-VALID" and r.json()["message"] == "M-160"


def test_package_not_found(client):
    assert client.get(U + "/packages/NOPE").json()["error"] == "E-NOTFOUND"


def test_package_detail_and_departures(client):  # API-02, 03
    d = client.get(U + "/packages/PKG-001").json()
    assert d["rounds"] == 2 and d["days"][0]["teeTime"] == "12:30" and len(d["options"]) == 5
    items = client.get(U + "/packages/PKG-001/departures", params={"month": "2026-10", "people": 2}).json()["items"]
    assert next(x for x in items if x["date"] == "2026-10-23")["selectable"] is True
    assert next(x for x in items if x["date"] == "2026-10-20")["selectable"] is False  # 판정일 지남


def test_calendar(client):  # API-04
    items = client.get(U + "/departures/calendar", params={"month": "2026-10", "people": 2}).json()["items"]
    assert len(items) == 31 and next(x for x in items if x["date"] == "2026-10-23")["count"] >= 1


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
    assert no.startswith("GT-261023-")
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

    set_booked(DEP, 27)
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
    clock.set_today("2026-10-20")
    assert client.post(U + "/holds", json={"departureId": DEP, "people": 2}, headers=A).json()["error"] == "E-CLOSED"


def test_area_and_validation_errors(client):
    set_booked(DEP, 0)
    hid = hold(client)
    bad = body(hid, stops=[{"kind": "PICK", "placeName": "오타루역", "lat": 43.1979, "lng": 140.9937}, {"kind": "DROP", "placeName": "삿포로역", **SAPPORO}])
    assert client.post(U + "/bookings", json=bad, headers=A).json()["error"] == "E-AREA"
    v = client.post(U + "/bookings", json=body(hid, rep={"nameLocal": "", "nameEn": "이정훈", "countryCode": "+82", "phone": "1", "email": "x"}), headers=A).json()
    assert v["error"] == "E-VALID"
    assert [f["rule"] for f in v["fields"]] == ["V-20", "V-21", "V-22", "V-23"]


def test_payment_fail_and_amount(client):
    hid = hold(client)
    assert client.post(U + "/bookings", json=body(hid, paymentId="PAY-FAIL-1"), headers=A).json()["error"] == "E-PAY"
    assert client.post(U + "/bookings", json=body(hid, paymentId="PAY-AMT-1"), headers=A).json()["error"] == "E-AMOUNT"


def test_expired_hold(client):
    """확보 만료 후 결제: 자리 있으면 확정, 없으면 E-SOLDOUT(환불)"""
    set_booked(DEP, 20)
    hid = hold(client)
    with tx() as c:
        run(c, "UPDATE seat_hold SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE")
    assert client.post(U + "/bookings", json=body(hid), headers=A).status_code == 201
    hid2 = hold(client)
    with tx() as c:
        run(c, "UPDATE seat_hold SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE")
    set_booked(DEP, 29)  # 그 사이 자리가 참
    assert client.post(U + "/bookings", json=body(hid2), headers=A).json()["error"] == "E-SOLDOUT"


# ---------- 배치 · 운영 ----------
def test_judge(client):
    """B-01: 20명 이상 GO, 미달은 운행 취소 + 환불 요청"""
    go, no = "PKG-001-20261027", "PKG-001-20261030"
    set_booked(go, 18)
    set_booked(no, 0)
    for d in (go, no):
        assert client.post(U + "/bookings", json=body(hold(client, d)), headers=A).status_code == 201
    clock.set_today("2026-10-27")
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
