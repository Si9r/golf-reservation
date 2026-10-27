import threading

from fastapi.testclient import TestClient

from app import clock
from app.db import one, run, tx
from app.jobs import check_payments, cleanup_holds, judge_departures, retry_refunds

A = {"authorization": "Bearer demo:M0001"}
B = {"authorization": "Bearer demo:M0002"}
ADMIN = {"x-admin-key": "test-admin"}
SITE = {"x-site-key": "test-site"}
DEP = "PKG-001-20261030"  # 금요일, 판정일 10-23 = 출발 7일 전 (오늘 10-19 기준 예약 가능)
SAPPORO = {"lat": 43.0675, "lng": 141.3508}
U = "/api/golf"


COMP = ["PARK SEOYEON", "CHOI YUNA", "KANG DOHYUN", "LIM SEOJIN", "YOON JIHO", "HAN SOYEON"]


def body(t=None, **over):
    """API-10 예약 만들기 요청. t = hold() 가 돌려준 (출발편, 인원)"""
    dep, people = t or (DEP, 2)
    b = {"departureId": dep, "people": people, "optionId": "PKG-001-mitsui", "lang": "ko",
         # PKG-001 희망 시간 범위: 승차 10:00~11:00 (첫날 12:30 티오프 − 2시간 30분 ~ 12:30 − 삿포로→기타히로시마 40분 − 30분), 하차 11:00~21:00 (마지막 날 라운드 없음)
         "stops": [{"kind": "PICK", "placeName": "JR 삿포로역 남쪽 출구", **SAPPORO, "memo": "남쪽 출구 앞", "desiredTime": "10:30"},
                   {"kind": "DROP", "placeName": "JR 삿포로역 남쪽 출구", **SAPPORO, "desiredTime": "15:00"}],
         "rep": {"nameLocal": "이정훈", "nameEn": "lee junghoon", "countryCode": "+82", "phone": "10-1234-5678", "email": "a@example.com"},
         "companions": [{"nameEn": x} for x in COMP[: people - 1]]}
    b.update(over)
    return b


def set_booked(dep, n):
    with tx() as c:
        run(c, "UPDATE departure SET booked_count = :n, status = 'OPEN' WHERE id = :id", n=n, id=dep)


def db1(sql, **a):
    with tx() as c:
        return one(c, sql, **a)


def hold(client, dep=DEP, people=2, h=A):
    """예약 요청에 넣을 (출발편, 인원). 결제 연동 뒤로는 좌석 확보 대신 API-10 이 결제 대기 예약으로 좌석을 잡음"""
    return (dep, people)


def fake():
    from app.adapters.partner import partner

    return partner


def pay(client, no, status="paid", h=A):
    """API-20 주문 생성(가짜 본 사이트가 status 로 만듦) → API-21 결과 확인"""
    fake().next_status = status
    r = client.post(U + f"/bookings/{no}/checkout", headers=h)
    assert r.status_code == 200, r.text
    return client.get(U + f"/bookings/{no}/payment", headers=h).json()


def book_confirmed(client, dep=DEP, people=2, h=A, **over):
    """결제 대기 예약 → 주문 → paid → 예약 확정. 예약번호를 돌려줌"""
    r = client.post(U + "/bookings", json=body((dep, people), **over), headers=h)
    assert r.status_code == 201, r.text
    no = r.json()["bookingNo"]
    assert pay(client, no, h=h)["status"] == "CONFIRMED"
    return no


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


def test_booking_flow(client):  # 결제 대기 → 주문 → paid → 확정 (확정 인원 증가, 예약 확정 메일은 본 사이트가 보내므로 골프는 안 보냄)
    set_booked(DEP, 10)
    r = client.post(U + "/bookings", json=body((DEP, 3)), headers=A)
    assert r.status_code == 201, r.text
    no = r.json()["bookingNo"]
    assert no.startswith("GT-261030-") and r.json()["status"] == "PENDING_PAYMENT" and r.json()["total"] == 69800 * 3 + 12000
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=DEP)["n"] == 10  # 결제 전에는 확정 인원 그대로
    assert pay(client, no) == {"bookingNo": no, "status": "CONFIRMED", "orderStatus": "paid"}
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=DEP)["n"] == 13
    assert len(client.get(U + "/bookings", params={"departureId": DEP}, headers=A).json()["items"]) == 1  # 중복 확인 (EV-28 ④)
    det = client.get(U + f"/bookings/{no}", headers=A).json()
    assert det["people"] == 3 and det["singles"] == 1 and det["total"] == 69800 * 3 + 12000
    assert det["members"][0]["nameEn"] == "LEE JUNGHOON"
    assert client.get(U + f"/bookings/{no}", headers=B).json()["error"] == "E-FORBID"
    assert db1("SELECT COUNT(*) n FROM notification WHERE booking_no = :no AND kind = 'CONFIRM'", no=no)["n"] == 0


def test_booking_numbers_increase(client):  # L-09
    set_booked(DEP, 0)
    nos = [client.post(U + "/bookings", json=body(hold(client)), headers=h).json()["bookingNo"] for h in (A, B)]
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
    assert client.post(U + "/bookings", json=body(), headers=A).json()["error"] == "E-CLOSED"


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
    st = body()["stops"]
    for s, t in zip(st, (pick, drop)):
        if t is None:
            s.pop("desiredTime")
        else:
            s["desiredTime"] = t
    return st


def test_desired_time_required(client):  # V-12: 승차 희망 시간은 필수, 형식·30분 단위 검사는 하차에도
    set_booked(DEP, 0)
    hid = hold(client)
    r = client.post(U + "/bookings", json=body(hid, stops=stops_with(drop="15:00")), headers=A).json()
    assert r["error"] == "E-VALID" and r["fields"] == [{"field": "stops.0.desiredTime", "rule": "V-12"}]
    r = client.post(U + "/bookings", json=body(hid, stops=stops_with(pick="10:15", drop="15:00")), headers=A).json()  # 30분 단위 아님
    assert r["fields"] == [{"field": "stops.0.desiredTime", "rule": "V-12"}]
    r = client.post(U + "/bookings", json=body(hid, stops=stops_with(pick="10:30", drop="15:15")), headers=A).json()
    assert r["fields"] == [{"field": "stops.1.desiredTime", "rule": "V-12"}]


def test_drop_time_optional(client):  # 희망 하차 시간은 선택: 없어도 예약되고 상세에는 null
    set_booked(DEP, 0)
    no = book_confirmed(client, stops=stops_with(pick="10:30"))
    stops = client.get(U + f"/bookings/{no}", headers=A).json()["stops"]
    assert {s["kind"]: s["desiredTime"] for s in stops} == {"PICK": "10:30", "DROP": None}


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
    no = book_confirmed(client, stops=stops_with(pick="10:00", drop="11:00"))  # 범위 시작
    stops = client.get(U + f"/bookings/{no}", headers=A).json()["stops"]
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
    assert stop_time_range([], "PICK", "SAPPORO") == (6 * 60, 21 * 60)  # 일정이 없는 패키지(데이터 오류)도 500 대신 기본 범위
    assert stop_time_range(no_round, "DROP", "SAPPORO") == (11 * 60, 21 * 60)  # 마지막 날 라운드 없음 → 11:00


def test_payment_failed_or_expired_releases_seats(client):  # failed · expired → UNPAID, 좌석 해제
    set_booked(DEP, 16)
    for st in ("failed", "expired"):
        no = client.post(U + "/bookings", json=body((DEP, 4)), headers=A).json()["bookingNo"]
        assert seats_of(client, DEP) == 0  # 결제 대기 4명이 남은 4석을 잡음
        assert pay(client, no, st) == {"bookingNo": no, "status": "UNPAID", "orderStatus": st}
        assert seats_of(client, DEP) == 4 and db1("SELECT booked_count n FROM departure WHERE id = :id", id=DEP)["n"] == 16
        assert client.get(U + f"/bookings/{no}", headers=A).json()["error"] == "E-NOTFOUND"  # 손님 상세에 안 보임


def test_orderless_pending_expires(client):  # 주문 전 결제 대기는 10분 뒤 만료 (checkout E-HOLD, 배치가 UNPAID)
    set_booked(DEP, 0)
    no = client.post(U + "/bookings", json=body(), headers=A).json()["bookingNo"]
    with tx() as c:
        run(c, "UPDATE booking SET created_at = UTC_TIMESTAMP(3) - INTERVAL 11 MINUTE WHERE no = :no", no=no)
    assert client.post(U + f"/bookings/{no}/checkout", headers=A).json()["error"] == "E-HOLD"
    assert db1("SELECT status FROM booking WHERE no = :no", no=no)["status"] == "UNPAID"
    no2 = client.post(U + "/bookings", json=body(), headers=A).json()["bookingNo"]
    with tx() as c:
        run(c, "UPDATE booking SET created_at = UTC_TIMESTAMP(3) - INTERVAL 11 MINUTE WHERE no = :no", no=no2)
    assert check_payments()["expired"] == 1 and db1("SELECT status FROM booking WHERE no = :no", no=no2)["status"] == "UNPAID"


def test_abandon_pending(client):  # 결제 화면에서 뒤로: 주문 전이면 바로 UNPAID (좌석 풀림)
    set_booked(DEP, 18)
    no = client.post(U + "/bookings", json=body(), headers=A).json()["bookingNo"]
    assert seats_of(client, DEP) == 0
    assert client.delete(U + f"/bookings/{no}/pending", headers=A).status_code == 204
    assert seats_of(client, DEP) == 2 and db1("SELECT status FROM booking WHERE no = :no", no=no)["status"] == "UNPAID"
    assert client.delete(U + f"/bookings/{no}/pending", headers=B).json()["error"] == "E-FORBID"


# ---------- 배치 · 운영 ----------
def test_judge(client):
    """B-01: 20명 이상 GO, 미달은 운행 취소 + 환불 요청 (판정일 = 출발 7일 전)"""
    go, no = "PKG-001-20261027", "PKG-001-20261103"  # 판정일 10-20, 10-27
    set_booked(go, 18)
    set_booked(no, 0)
    for d in (go, no):
        book_confirmed(client, d)
    clock.set_today("2026-10-27")  # 두 출발편 모두 판정일이 됨
    judge_departures()
    assert db1("SELECT status FROM departure WHERE id = :id", id=go)["status"] == "GO"
    assert db1("SELECT status FROM departure WHERE id = :id", id=no)["status"] == "CANCEL"
    assert db1("SELECT status, cancel_by, refund_status, order_status FROM booking WHERE departure_id = :id", id=no) == \
        {"status": "OP_CANCEL", "cancel_by": "OP", "refund_status": "DONE", "order_status": "canceled"}  # 본 사이트 operator_cancel 환불


def test_admin_cancel(client):  # API-16
    dep = "PKG-001-20261106"
    set_booked(dep, 5)
    no = book_confirmed(client, dep, 4)
    assert client.post(U + f"/admin/bookings/{no}/cancel", json={"cancelNote": "고객 요청"}).status_code == 401
    r = client.post(U + f"/admin/bookings/{no}/cancel", json={"cancelNote": "고객 요청"}, headers=ADMIN)
    assert r.json() == {"status": "USER_CANCEL", "refundStatus": "DONE"}  # 본 사이트 customer_cancel 환불
    assert ("cancel_order", db1("SELECT order_id o FROM booking WHERE no = :no", no=no)["o"], "customer_cancel") in fake().calls
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
    no = book_confirmed(client, SITE_DEP, 3)
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=SITE_DEP)["n"] == 8
    r = site_cancel(client, no, note="고객 사정")
    assert r.status_code == 200 and r.json() == {"status": "USER_CANCEL", "refundStatus": "REQUESTED"}
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=SITE_DEP)["n"] == 5
    assert db1("SELECT status, cancel_by, cancel_note, refund_id, refund_status, canceled_at IS NOT NULL canceled FROM booking WHERE no = :no", no=no) == \
        {"status": "USER_CANCEL", "cancel_by": "USER", "cancel_note": "고객 사정", "refund_id": "RF-SITE-1", "refund_status": "REQUESTED", "canceled": 1}
    assert db1("SELECT result FROM notification WHERE booking_no = :no AND kind = 'USER_CANCEL'", no=no) == {"result": "OK"}


def test_site_cancel_refund_update(client):
    set_booked(SITE_DEP, 5)
    no = book_confirmed(client, SITE_DEP, 2)
    site_cancel(client, no)
    r = site_cancel(client, no, refundId="RF-SITE-2", refundStatus="DONE")
    assert r.json() == {"status": "USER_CANCEL", "refundStatus": "DONE"}
    assert db1("SELECT refund_id, refund_status FROM booking WHERE no = :no", no=no) == {"refund_id": "RF-SITE-2", "refund_status": "DONE"}
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=SITE_DEP)["n"] == 5  # 인원은 한 번만 되돌림
    assert db1("SELECT COUNT(*) n FROM notification WHERE booking_no = :no AND kind = 'USER_CANCEL'", no=no)["n"] == 1


def test_site_cancel_op_cancel_state(client):
    set_booked(SITE_DEP, 5)
    no = book_confirmed(client, SITE_DEP, 2)
    with tx() as c:
        run(c, "UPDATE booking SET status = 'OP_CANCEL', cancel_by = 'OP' WHERE no = :no", no=no)
    r = site_cancel(client, no)
    assert r.status_code == 409 and r.json()["error"] == "E-STATE"
    assert site_cancel(client, "GT-000000-9999").json()["error"] == "E-NOTFOUND"


# ---------- 팀 테스트 10/23 ----------
def test_name_en_requires_full_name(client):  # V-21 대표자 · V-24 동반자: 'KIM' 거절, 'KIM MINJI' 통과
    set_booked(SITE_DEP, 0)
    hid = hold(client, SITE_DEP, 2)
    rep = {"nameLocal": "김민지", "nameEn": "KIM", "countryCode": "+82", "phone": "10-1234-5678", "email": "a@example.com"}
    r = client.post(U + "/bookings", json=body(hid, rep=rep, companions=[{"nameEn": "PARK"}]), headers=A).json()
    assert r["error"] == "E-VALID" and [f["rule"] for f in r["fields"]] == ["V-21", "V-24"]
    r = client.post(U + "/bookings", json=body(hid, rep={**rep, "nameEn": "kim minji"}, companions=[{"nameEn": "PARK SEOYEON"}]), headers=A)
    assert r.status_code == 201, r.text
    no = r.json()["bookingNo"]
    assert pay(client, no)["status"] == "CONFIRMED"
    assert client.get(U + f"/bookings/{no}", headers=A).json()["members"][0]["nameEn"] == "KIM MINJI"
    assert client.put(U + f"/bookings/{no}/companions", json={"companions": [{"nameEn": "PARK"}]}, headers=A).json()["error"] == "E-VALID"
    assert client.put(U + f"/bookings/{no}/companions", json={"companions": [{"nameEn": "O'BRIEN MIN-JI"}]}, headers=A).status_code == 200  # 하이픈·아포스트로피 허용
    assert client.put(U + f"/bookings/{no}/companions", json={"companions": []}, headers=A).json()["error"] == "E-VALID"  # 동반자 이름은 모두 필수


def test_companions_required(client):  # V-24: 동반자 이름이 인원 − 1명보다 적으면 거절
    set_booked(SITE_DEP, 0)
    hid = hold(client, SITE_DEP, 3)
    r = client.post(U + "/bookings", json=body(hid, companions=[{"nameEn": "PARK SEOYEON"}]), headers=A).json()
    assert r["error"] == "E-VALID" and {"field": "companions", "rule": "V-24"} in r["fields"]


def test_booking_list_tab(client):  # S-12 탭: 고객 취소 → cancel
    set_booked(SITE_DEP, 0)
    no = book_confirmed(client, SITE_DEP, 2)
    tab = lambda: next(x["tab"] for x in client.get(U + "/bookings", headers=A).json()["items"] if x["no"] == no)  # noqa: E731
    assert tab() == "up"
    site_cancel(client, no)
    assert tab() == "cancel"


def test_quote_fixed_hotel_odd_people(client):  # B-03: 옵션 없는(호텔이 정해진) 패키지도 기본 호텔로 숙박 → 홀수 인원 1인실 추가 요금
    pkg = client.get(U + "/packages/PKG-004").json()
    assert pkg["options"] == [] and pkg["nights"] >= 1 and pkg["hotel"] is not None
    dep = db1("SELECT id FROM departure WHERE package_id = 'PKG-004' ORDER BY dep_date LIMIT 1")["id"]
    q = client.post(U + "/quotes", json={"departureId": dep, "people": 3}).json()
    assert q["rooms"] == {"singles": 1, "twins": 1} and q["total"] == pkg["basePrice"] * 3 + pkg["singleAdd"]
    q = client.post(U + "/quotes", json={"departureId": dep, "people": 3, "singles": 3}).json()  # S-05에서 1인실 인원을 바꾸면
    assert q["rooms"] == {"singles": 3, "twins": 0} and q["total"] == pkg["basePrice"] * 3 + pkg["singleAdd"] * 3


def test_companions_fix_no_empty(client):  # API-13 동반자 이름 수정(오타 수정용): 빈 이름은 저장 불가, 인원 − 1명 모두 필수
    set_booked(SITE_DEP, 0)
    no = book_confirmed(client, SITE_DEP, 3)
    put = lambda names: client.put(U + f"/bookings/{no}/companions", json={"companions": [{"nameEn": x} for x in names]}, headers=A)  # noqa: E731
    r = put(["PARK SEOYEON", ""]).json()
    assert r["error"] == "E-VALID" and r["fields"] == [{"field": "companions", "rule": "V-24"}]
    assert put(["PARK SEOYEON"]).json()["error"] == "E-VALID"
    assert put(["PARK SEOYEON", "CHOI YUNA"]).status_code == 200
    assert [m["nameEn"] for m in client.get(U + f"/bookings/{no}", headers=A).json()["members"][1:]] == ["PARK SEOYEON", "CHOI YUNA"]


# ---------- 안내 메일 (운영사 확정 10/26: 이 서비스가 직접 보냄) ----------
def test_mail_templates():  # 4종 제목·본문에 예약번호·패키지·출발일·인원·금액
    from app.adapters.mail import render

    b = {"no": "GT-261030-0001", "package_name": "삿포로 시내 숙박 2박 3일", "dep_date": "2026-10-30", "judge_date": "2026-10-23",
         "people": 3, "total": 221400, "name": "이정훈"}
    for kind in ("CONFIRM", "GO", "CANCEL", "USER_CANCEL"):
        subject, body = render(kind, b)
        assert "GT-261030-0001" in subject
        for x in ("GT-261030-0001", "삿포로 시내 숙박 2박 3일", "2026년 10월 30일(금)", "3명", "¥221,400", "10:00-17:00"):
            assert x in body, (kind, x)
    assert "전액 환불" in render("CANCEL", b)[1] and "2026년 10월 23일(금)" in render("CONFIRM", b)[1]
    s, body_ = render("PICKUP", {**b, "pickup_time": "10:20", "pick_place": "JR 삿포로역 남쪽 출구"})  # 승차 시간 안내 (골프가 보냄)
    assert "승차 시간 안내" in s and "2026년 10월 30일(금) 10:20" in body_ and "JR 삿포로역 남쪽 출구" in body_


def test_mail_failure_keeps_booking(client, monkeypatch):  # 발송 실패해도 예약은 그대로, 기록은 FAIL
    from app.adapters import mail as M

    class Boom:
        def send(self, to, subject, body):
            raise OSError("smtp down")

    monkeypatch.setattr(M, "mail", Boom())
    set_booked(SITE_DEP, 0)
    no = book_confirmed(client, SITE_DEP, 2)
    r = client.post(U + f"/admin/bookings/{no}/cancel", json={"cancelNote": "고객 요청"}, headers=ADMIN)
    assert r.status_code == 200 and db1("SELECT status FROM booking WHERE no = :no", no=no)["status"] == "USER_CANCEL"
    assert db1("SELECT result, error FROM notification WHERE booking_no = :no AND kind = 'USER_CANCEL'", no=no) == {"result": "FAIL", "error": "smtp down"}


def test_mail_smtp_backend(client, monkeypatch):  # MAIL_BACKEND=smtp: 보내는 주소·이름·제목으로 실제 발송 (SMTP 는 가짜로 바꿔 확인)
    import smtplib

    from app.adapters import mail as M
    from app.config import env

    sent = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            sent.append(("connect", host, port))

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self):
            sent.append(("starttls",))

        def login(self, u, pw):
            sent.append(("login", u))

        def send_message(self, msg):
            sent.append(("msg", msg))

    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    for k, v in {"MAIL_FROM": "golf@example.jp", "MAIL_FROM_NAME": "TRAVENDER 골프", "SMTP_HOST": "smtp.example.jp", "SMTP_USER": "u"}.items():
        monkeypatch.setattr(env, k, v)
    monkeypatch.setattr(M, "mail", M.SmtpMail())
    set_booked(SITE_DEP, 0)
    no = book_confirmed(client, SITE_DEP, 2)
    client.post(U + f"/admin/bookings/{no}/cancel", json={"cancelNote": "고객 요청"}, headers=ADMIN)
    msg = next(x[1] for x in sent if x[0] == "msg")
    assert ("connect", "smtp.example.jp", 587) in sent and ("starttls",) in sent and ("login", "u") in sent
    assert "golf@example.jp" in msg["From"] and msg["To"] == "a@example.com" and no in msg["Subject"]
    assert db1("SELECT result FROM notification WHERE booking_no = :no AND kind = 'USER_CANCEL'", no=no)["result"] == "OK"


# ---------- 본 사이트 로그인 연동 (PAYMENT_BACKEND=fake) ----------
def test_login_required_returns_login_url(client):  # 세션 없음 → 401 + 로그인 주소 (돌아올 화면 경로 포함)
    r = client.get(U + "/me", headers={"x-return-to": "/#/golf/book/info"})
    assert r.status_code == 401 and r.json()["error"] == "E-AUTH"
    assert r.json()["loginUrl"] == "/#/login?next=%2Fgolf%2Fbook%2Finfo"
    r = client.get(U + "/me", headers={"x-return-to": "https://evil.example/x"})  # 바깥 주소는 next 로 쓰지 않음
    assert r.json()["loginUrl"] == "/#/login?next=%2Fgolf"


def test_login_partner_mode_url(client, monkeypatch):  # partner 모드: 본 사이트 /login?next=<골프 화면 경로>
    from app.config import env

    monkeypatch.setattr(env, "PAYMENT_BACKEND", "partner")
    r = client.get(U + "/me", headers={"x-return-to": "/#/golf/my"})
    assert r.status_code == 401 and r.json()["loginUrl"] == "/login?next=%2F%23%2Fgolf%2Fmy"


def test_session_cookie_and_once_per_request(client):  # user_session 쿠키 → 본 사이트 세션 조회는 요청당 한 번, /me 는 이름·이메일·전화
    from app.adapters.partner import partner

    partner.calls.clear()
    client.cookies.set("user_session", "demo:M0002")
    try:
        r = client.get(U + "/me")
    finally:
        client.cookies.clear()
    assert r.status_code == 200
    assert {k: r.json()[k] for k in ("memberId", "nameLocal", "nameEn", "email", "phone", "logoutUrl")} == \
        {"memberId": "M0002", "nameLocal": "田中 太郎", "nameEn": "", "email": "demo2@example.com", "phone": "+81 90-1234-5678", "logoutUrl": None}
    assert [c for c in partner.calls if c[0] == "session"] == [("session", "demo:M0002")]


# ---------- 결제 대기·미결제 (본 사이트 결제 연동 2단계) ----------
def seats_of(client, dep):
    d = dep.split("-")[-1]
    items = client.get(U + f"/packages/{dep[:7]}/departures", params={"month": f"{d[:4]}-{d[4:6]}", "people": 1}).json()["items"]
    return next(x["seatsLeft"] for x in items if x["id"] == dep)


def test_seats_count_pending_payment(client):  # 잔여석 = 정원 − 확정 − 결제 대기(주문 후는 계속, 주문 전은 10분까지) − 확보
    dep = "PKG-001-20261113"
    set_booked(dep, 10)
    base = seats_of(client, dep)
    assert base == 10
    with tx() as c:
        run(c, """INSERT INTO booking (no, member_id, departure_id, people, unit_price, total_price, status, order_id, lang, created_at) VALUES
                  ('GT-261113-9001', 'M0001', :d, 3, 1, 3, 'PENDING_PAYMENT', 'ORD-X1', 'ko', UTC_TIMESTAMP(3) - INTERVAL 2 HOUR),
                  ('GT-261113-9002', 'M0001', :d, 2, 1, 2, 'PENDING_PAYMENT', NULL, 'ko', UTC_TIMESTAMP(3)),
                  ('GT-261113-9003', 'M0001', :d, 4, 1, 4, 'PENDING_PAYMENT', NULL, 'ko', UTC_TIMESTAMP(3) - INTERVAL 11 MINUTE),
                  ('GT-261113-9004', 'M0001', :d, 5, 1, 5, 'UNPAID', 'ORD-X4', 'ko', UTC_TIMESTAMP(3))""", d=dep)
    try:
        assert seats_of(client, dep) == 10 - 3 - 2  # 주문 후 대기 3 (2시간 지나도) + 주문 전 대기 2 (10분 안). 주문 전 11분 지난 4·미결제 5는 안 셈
        items = client.get(U + "/bookings", headers=A).json()["items"]
        assert not [x for x in items if x["no"].startswith("GT-261113-9")]  # 손님 목록에 안 보임
        assert client.get(U + "/bookings/GT-261113-9001", headers=A).json()["error"] == "E-NOTFOUND"  # 손님 상세에도 안 보임
    finally:
        with tx() as c:
            run(c, "DELETE FROM booking WHERE no LIKE 'GT-261113-9%'")


# ---------- 본 사이트 주문·결과 확인 (결제 연동 3·4단계, PAYMENT_BACKEND=fake) ----------
def test_checkout_order_body(client):  # 주문에는 서버가 계산한 금액·일본어 제목·인원·출발일·돌아올 주소
    set_booked(DEP, 0)
    r = client.post(U + "/bookings", json=body((DEP, 3)), headers=A).json()
    seen = {}
    orig = fake().create_order
    fake().create_order = lambda b: seen.update(b) or orig(b)
    try:
        co = client.post(U + f"/bookings/{r['bookingNo']}/checkout", headers=A).json()
    finally:
        del fake().create_order
    assert seen["reference"] == r["bookingNo"] and seen["amount"] == r["total"] == 69800 * 3 + 12000 and seen["heads"] == 3
    assert seen["title"]["ja"] == "札幌市内泊 2泊3日・2ラウンド 2026-10-30" and seen["departure_date"] == "2026-10-30" and seen["user_id"] == "M0001"
    assert seen["return_url"].endswith(f"/golf/payment/return?no={r['bookingNo']}") and co["checkoutUrl"] == seen["return_url"]
    assert db1("SELECT order_id, order_status FROM booking WHERE no = :no", no=r["bookingNo"]) == {"order_id": co["orderId"], "order_status": "paid"}


def test_checkout_amount_min_100(client):  # 100엔 미만은 본 사이트에 보내지 않고 오류
    set_booked(DEP, 0)
    no = client.post(U + "/bookings", json=body(), headers=A).json()["bookingNo"]
    with tx() as c:
        run(c, "UPDATE booking SET total_price = 99 WHERE no = :no", no=no)
    r = client.post(U + f"/bookings/{no}/checkout", headers=A).json()
    assert r["error"] == "E-VALID" and r["fields"] == [{"field": "amount", "rule": "min-100"}]
    assert not [c for c in fake().calls if c[0] == "create_order"]


def test_authenticating_keeps_seat_then_batch_confirms(client):  # authenticating 은 실패 아님: 결제 대기·좌석 유지 → 배치가 paid 로 확정
    set_booked(DEP, 17)
    no = client.post(U + "/bookings", json=body((DEP, 3)), headers=A).json()["bookingNo"]
    assert pay(client, no, "authenticating") == {"bookingNo": no, "status": "PENDING_PAYMENT", "orderStatus": "authenticating"}
    with tx() as c:  # 3D 인증으로 10분이 넘어도 주문 후 좌석은 유지
        run(c, "UPDATE booking SET created_at = UTC_TIMESTAMP(3) - INTERVAL 30 MINUTE WHERE no = :no", no=no)
    assert seats_of(client, DEP) == 0 and check_payments()["waiting"] == 1
    fake().set_status(db1("SELECT order_id o FROM booking WHERE no = :no", no=no)["o"], "paid")
    assert check_payments()["confirmed"] == 1
    assert db1("SELECT status FROM booking WHERE no = :no", no=no)["status"] == "CONFIRMED"
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=DEP)["n"] == 20


def test_checkout_twice_uses_existing_order(client):  # 같은 예약으로 주문을 두 번 → 409 duplicate_reference → 기존 주문, 주문은 하나
    set_booked(DEP, 0)
    no = client.post(U + "/bookings", json=body(), headers=A).json()["bookingNo"]
    fake().next_status = "pending"
    a = client.post(U + f"/bookings/{no}/checkout", headers=A).json()
    b = client.post(U + f"/bookings/{no}/checkout", headers=A).json()
    assert a["orderId"] == b["orderId"] and a["checkoutUrl"] == b["checkoutUrl"] and len(fake().orders) == 1
    assert [c[0] for c in fake().calls].count("create_order") == 2  # 두 번째는 본 사이트가 409 로 기존 주문을 돌려줌


def test_confirm_only_once(client):  # 확정 처리를 여러 번(결과 화면·배치, 동시 포함) 불러도 확정 인원은 한 번만 증가
    from app.main import app

    set_booked(DEP, 10)
    no = client.post(U + "/bookings", json=body((DEP, 2)), headers=A).json()["bookingNo"]
    assert pay(client, no, "authenticating")["status"] == "PENDING_PAYMENT"
    fake().set_status(db1("SELECT order_id o FROM booking WHERE no = :no", no=no)["o"], "paid")
    barrier, out = threading.Barrier(3), []

    def screen():
        with TestClient(app) as c:
            barrier.wait()
            out.append(c.get(U + f"/bookings/{no}/payment", headers=A).json()["status"])

    def batch():
        barrier.wait()
        check_payments()
        out.append("batch")

    ts = [threading.Thread(target=f) for f in (screen, screen, batch)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert client.get(U + f"/bookings/{no}/payment", headers=A).json()["status"] == "CONFIRMED"
    assert sorted(out) == ["CONFIRMED", "CONFIRMED", "batch"]
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=DEP)["n"] == 12


def test_paid_after_departure_canceled_refunds(client):  # 판정 뒤 운행 취소된 출발편의 예약이 나중에 paid → 바로 operator_cancel 환불
    dep = "PKG-001-20261103"  # 판정일 10-27
    set_booked(dep, 0)
    no = client.post(U + "/bookings", json=body((dep, 2)), headers=A).json()["bookingNo"]
    assert pay(client, no, "authenticating")["status"] == "PENDING_PAYMENT"
    clock.set_today("2026-10-27")
    judge_departures()  # 확정 예약만 셈 → 0명 → 운행 취소
    assert db1("SELECT status FROM departure WHERE id = :id", id=dep)["status"] == "CANCEL"
    oid = db1("SELECT order_id o FROM booking WHERE no = :no", no=no)["o"]
    fake().set_status(oid, "paid")
    check_payments()
    assert db1("SELECT status, cancel_by, refund_status FROM booking WHERE no = :no", no=no) == {"status": "OP_CANCEL", "cancel_by": "OP", "refund_status": "DONE"}
    assert ("cancel_order", oid, "operator_cancel") in fake().calls and db1("SELECT booked_count n FROM departure WHERE id = :id", id=dep)["n"] == 0


# ---------- 본 사이트 환불 (결제 연동 5단계) ----------
def test_operator_cancel_refunds_continue_after_failure(client):  # 운행 취소 환불은 차례로, 중간 한 건이 실패해도 나머지 진행, 실패 건 FAIL → B-07 재시도
    dep = "PKG-001-20261103"  # 판정일 10-27
    set_booked(dep, 0)
    nos = [book_confirmed(client, dep, 2, h=h) for h in (A, B, A)]
    oids = [db1("SELECT order_id o FROM booking WHERE no = :no", no=n)["o"] for n in nos]
    fake().fail_cancel[oids[1]] = (502, "bad_gateway")
    clock.set_today("2026-10-27")
    judge_departures()
    st = {n: db1("SELECT status, refund_status FROM booking WHERE no = :no", no=n) for n in nos}
    assert [st[n]["refund_status"] for n in nos] == ["DONE", "FAIL", "DONE"] and all(v["status"] == "OP_CANCEL" for v in st.values())
    assert [c[1] for c in fake().calls if c[0] == "cancel_order" and c[1] in oids] == oids  # 주문별로 차례로 (다른 출발편 판정분은 제외)
    assert db1("SELECT COUNT(*) n FROM notification WHERE booking_no = :no AND kind = 'OPS_ALERT'", no=nos[1])["n"] == 1  # 운영자 알림
    assert db1("SELECT COUNT(*) n FROM notification WHERE booking_no = :no AND kind = 'CANCEL'", no=nos[1])["n"] == 1  # 손님 메일은 계속
    del fake().fail_cancel[oids[1]]
    assert retry_refunds()["done"] >= 1  # (앞 테스트가 남긴 다른 FAIL 건도 함께 다시 시도함)
    assert db1("SELECT refund_status, order_status FROM booking WHERE no = :no", no=nos[1]) == {"refund_status": "DONE", "order_status": "canceled"}


def test_partner_wrong_key_401(client, monkeypatch):  # 본 사이트가 잘못된 키로 401 → 골프는 502 E-PARTNER (예약은 결제 대기 그대로)
    from app.config import env

    set_booked(DEP, 0)
    no = client.post(U + "/bookings", json=body(), headers=A).json()["bookingNo"]
    fake().api_key = "right-key"
    monkeypatch.setattr(env, "PARTNER_API_KEY", "wrong-key")
    r = client.post(U + f"/bookings/{no}/checkout", headers=A)
    assert r.status_code == 502 and r.json()["error"] == "E-PARTNER" and r.json()["partnerError"] == "unauthorized"
    assert db1("SELECT status, order_id FROM booking WHERE no = :no", no=no) == {"status": "PENDING_PAYMENT", "order_id": None}


def test_refund_unpaid_order_refused(client):  # 미결제 주문 환불 → 본 사이트 409 refused → refund_status FAIL + 운영자 알림 (취소는 그대로 처리)
    set_booked(SITE_DEP, 0)
    no = book_confirmed(client, SITE_DEP, 2)
    fake().set_status(db1("SELECT order_id o FROM booking WHERE no = :no", no=no)["o"], "pending")  # 본 사이트에서 아직 paid 가 아닌 주문
    r = client.post(U + f"/admin/bookings/{no}/cancel", json={"cancelNote": "고객 요청"}, headers=ADMIN).json()
    assert r == {"status": "USER_CANCEL", "refundStatus": "FAIL"}
    assert db1("SELECT error FROM notification WHERE booking_no = :no AND kind = 'OPS_ALERT'", no=no)["error"].startswith("환불 실패 (customer_cancel): 본 사이트 409 refused")
