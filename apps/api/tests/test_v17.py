"""상세설계 v1.7 보완 (11/09): 늦은 결제 · 취소된 주문 · 오래 걸리는 주문 · 판정 실패 기록 · 작업 기록 · 상태 확인 · 운영 키 · 인원 제약"""
import pytest
from sqlalchemy.exc import DBAPIError

from app import clock
from app.db import rows, run, tx
from app.jobs import check_payments, judge_departures, retry_refunds

from test_api import A, ADMIN, DEP, U, body, book_confirmed, db1, fake, pay, seats_of, set_booked, site_cancel


def audits(target, action):
    with tx() as c:
        return [(r["actor"], r["action"], r["result"]) for r in rows(
            c, "SELECT actor, action, result FROM audit_log WHERE target = :t AND action = :a ORDER BY id", t=target, a=action)]


def order_of(no):
    return db1("SELECT order_id o FROM booking WHERE no = :no", no=no)["o"]


def new_pending(client, dep=DEP, people=2):
    r = client.post(U + "/bookings", json=body((dep, people)), headers=A)
    assert r.status_code == 201, r.text
    return r.json()["bookingNo"]


def make_unpaid(no):
    """주문을 만든 사이 결제 대기가 끝난 상황 (10분 만료 · 뒤로 가기 · 같은 회원의 새 예약)"""
    with tx() as c:
        run(c, "UPDATE booking SET status = 'UNPAID' WHERE no = :no", no=no)


def test_canceled_order_releases_seats(client):  # 본 사이트가 주문을 취소(canceled)해도 실패·만료처럼 미결제 → 좌석 풀림
    set_booked(DEP, 16)
    no = new_pending(client, DEP, 4)
    assert pay(client, no, "authenticating")["status"] == "PENDING_PAYMENT" and seats_of(client, DEP) == 0
    fake().set_status(order_of(no), "canceled")
    assert check_payments()["unpaid"] == 1
    assert db1("SELECT status FROM booking WHERE no = :no", no=no)["status"] == "UNPAID" and seats_of(client, DEP) == 4


def test_late_paid_refunds_once(client):  # 미결제 뒤 paid → 확정하지 않고 자동 환불 + 운영자 알림 + 작업 기록, 몇 번 확인해도 환불은 한 번
    set_booked(DEP, 10)
    no = new_pending(client)
    assert pay(client, no, "pending")["status"] == "PENDING_PAYMENT"
    make_unpaid(no)
    oid = order_of(no)
    fake().set_status(oid, "paid")
    assert client.get(U + f"/bookings/{no}/payment", headers=A).json()["status"] == "UNPAID"  # 결과 화면: 확정 안 함
    assert db1("SELECT status, refund_status FROM booking WHERE no = :no", no=no) == {"status": "UNPAID", "refund_status": "DONE"}
    assert db1("SELECT booked_count n FROM departure WHERE id = :id", id=DEP)["n"] == 10  # 확정 인원 그대로
    check_payments()
    client.get(U + f"/bookings/{no}/payment", headers=A)
    assert [c for c in fake().calls if c[0] == "cancel_order" and c[1] == oid] == [("cancel_order", oid, "operator_cancel")]  # 환불은 한 번
    assert db1("SELECT error FROM notification WHERE booking_no = :no AND kind = 'OPS_ALERT'", no=no)["error"].startswith("미결제 처리 뒤 결제 완료")
    assert audits(no, "LATE_PAID") == [("API-21", "LATE_PAID", "OK")]


def test_late_paid_found_by_batch_and_retried(client):  # 결과 화면에 안 돌아와도 B-08이 찾아 환불, 환불이 실패하면 B-07이 다시
    set_booked(DEP, 0)
    no = new_pending(client)
    pay(client, no, "authenticating")
    make_unpaid(no)
    oid = order_of(no)
    fake().set_status(oid, "paid")
    fake().fail_cancel[oid] = (502, "bad_gateway")
    assert check_payments()["late_paid"] == 1
    assert db1("SELECT refund_status FROM booking WHERE no = :no", no=no)["refund_status"] == "FAIL"
    assert audits(no, "LATE_PAID") == [("BATCH:B-08", "LATE_PAID", "OK")]
    del fake().fail_cancel[oid]
    retry_refunds()
    assert db1("SELECT status, refund_status FROM booking WHERE no = :no", no=no) == {"status": "UNPAID", "refund_status": "DONE"}
    assert ("BATCH:B-07", "REFUND", "OK") in audits(no, "REFUND")


def test_checkout_race_gives_no_checkout_url(client, monkeypatch):  # 주문을 만드는 사이 결제 대기가 끝나면 결제창 주소를 주지 않음 (E-HOLD), 주문 번호는 남김
    from app.adapters import payment

    set_booked(DEP, 0)
    no = new_pending(client)
    real = payment.create_order

    def slow_create(**kw):
        o = real(**kw)
        make_unpaid(no)  # 주문을 만드는 동안 B-08이 10분 만료로 미결제 처리
        return o

    monkeypatch.setattr(payment, "create_order", slow_create)
    fake().next_status = "pending"
    r = client.post(U + f"/bookings/{no}/checkout", headers=A).json()
    assert r["error"] == "E-HOLD" and "checkoutUrl" not in r
    assert order_of(no) is not None  # 그래도 결제되면 늦은 결제로 찾아 환불할 수 있게


def test_checkout_after_confirmed_goes_to_result(client, monkeypatch):  # 두 번째 '결제하기' 중에 결제가 끝나 확정되면 E-HOLD 가 아니라 결과 화면으로
    from app.adapters import payment

    set_booked(DEP, 0)
    no = new_pending(client)
    assert pay(client, no, "pending")["status"] == "PENDING_PAYMENT"
    real = payment.create_order

    def confirm_meanwhile(**kw):
        o = real(**kw)  # 같은 예약번호 → 기존 주문
        fake().set_status(o["order_id"], "paid")
        client.get(U + f"/bookings/{no}/payment", headers=A)  # 그 사이 결과 화면이 확정
        return o

    monkeypatch.setattr(payment, "create_order", confirm_meanwhile)
    r = client.post(U + f"/bookings/{no}/checkout", headers=A).json()
    assert r["status"] == "CONFIRMED" and r["checkoutUrl"].endswith(f"#/golf/payment/return?no={no}")


def test_late_paid_when_order_paid_at_checkout(client, monkeypatch):  # 주문이 만들어지자마자 paid 인데 예약은 이미 미결제 → E-HOLD, B-08 이 찾아 환불
    from app.adapters import payment

    set_booked(DEP, 0)
    no = new_pending(client)
    real = payment.create_order

    def paid_but_expired(**kw):
        o = real(**kw)
        make_unpaid(no)
        return o

    monkeypatch.setattr(payment, "create_order", paid_but_expired)
    fake().next_status = "paid"
    assert client.post(U + f"/bookings/{no}/checkout", headers=A).json()["error"] == "E-HOLD"
    assert check_payments()["late_paid"] == 1
    assert db1("SELECT status, refund_status FROM booking WHERE no = :no", no=no) == {"status": "UNPAID", "refund_status": "DONE"}


def test_key_with_non_ascii_401(client):  # 키 헤더에 영문 밖 글자가 와도 500 이 아니라 401
    r = client.post(U + "/admin/bookings/GT-X/cancel", json={"cancelNote": "x"}, headers={"x-admin-key": "caf\xe9".encode("latin-1")})
    assert r.status_code == 401


def test_pending_order_alert_once(client):  # 주문 후 60분 넘게 결제 대기 → 운영자 알림 한 번 (좌석은 계속 잡음)
    set_booked(DEP, 0)
    no = new_pending(client)
    pay(client, no, "authenticating")
    with tx() as c:
        run(c, "UPDATE booking SET created_at = UTC_TIMESTAMP(3) - INTERVAL 61 MINUTE WHERE no = :no", no=no)
    assert check_payments()["alerted"] >= 1
    assert check_payments()["alerted"] == 0  # 같은 예약에 두 번 보내지 않음
    assert db1("SELECT COUNT(*) n FROM notification WHERE booking_no = :no AND kind = 'OPS_ALERT'", no=no)["n"] == 1
    assert db1("SELECT status FROM booking WHERE no = :no", no=no)["status"] == "PENDING_PAYMENT"


def test_judge_failure_recorded_with_departure(client, monkeypatch):  # 출발 판정 실패 알림도 notification 에 출발편으로 남김 (예약번호 없음)
    import app.jobs as J

    dep = "PKG-001-20261106"  # 판정일 10-30
    set_booked(dep, 0)
    real = J._judge_one

    def boom(d):
        if d == dep:
            raise RuntimeError("db gone")
        return real(d)

    monkeypatch.setattr(J, "_judge_one", boom)
    clock.set_today("2026-10-30")
    judge_departures()
    r = db1("SELECT booking_no, kind, error, body FROM notification WHERE departure_id = :d ORDER BY id DESC LIMIT 1", d=dep)
    assert r["booking_no"] is None and r["kind"] == "OPS_ALERT" and r["error"].startswith("출발 판정 실패")
    assert dep in r["body"] and "db gone" in r["body"]


def test_audit_log_admin_site_judge(client):  # 작업 기록 L-24: 운영 키 취소(성공·거절), 본 사이트 취소, 출발 판정
    dep = "PKG-001-20261110"  # 판정일 11-03
    set_booked(dep, 0)
    no = book_confirmed(client, dep, 2)
    assert client.post(U + f"/admin/bookings/{no}/cancel", json={"cancelNote": "고객 요청"}, headers=ADMIN).status_code == 200
    assert client.post(U + f"/admin/bookings/{no}/cancel", json={"cancelNote": "x"}, headers=ADMIN).json()["error"] == "E-STATE"
    assert audits(no, "ADMIN_CANCEL") == [("ADMIN", "ADMIN_CANCEL", "OK"), ("ADMIN", "ADMIN_CANCEL", "FAIL")]
    no2 = book_confirmed(client, dep, 2)
    assert site_cancel(client, no2).status_code == 200
    assert audits(no2, "SITE_CANCEL") == [("SITE", "SITE_CANCEL", "OK")]
    detail = str(db1("SELECT detail FROM audit_log WHERE target = :t", t=no2)["detail"])
    assert "이정훈" not in detail and "a@example.com" not in detail  # 개인정보는 넣지 않음
    before = len(audits(dep, "JUDGE"))  # 앞 테스트가 같은 출발편을 판정했을 수 있음
    clock.set_today("2026-11-03")
    judge_departures()
    after = audits(dep, "JUDGE")
    assert len(after) == before + 1 and after[-1] == ("BATCH:B-01", "JUDGE", "OK")


def test_admin_key_wrong_401(client):  # 운영 키가 틀리면 401 (비교는 compare_digest)
    r = client.post(U + "/admin/bookings/GT-X/cancel", json={"cancelNote": "x"}, headers={"x-admin-key": "wrong"})
    assert r.status_code == 401


def test_health(client):  # API-24 상태 확인: DB 연결·정기 실행·버전, 개인정보 없음
    r = client.get(U + "/health")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok" and j["db"] == "ok" and j["jobsEnabled"] is False and "version" in j


def test_people_check_20():  # DB 제약도 한 예약 1~20명 (Alembic 0007)
    with pytest.raises(DBAPIError):
        with tx() as c:
            run(c, """INSERT INTO booking (no, member_id, departure_id, people, single_count, unit_price, total_price, status, lang)
                      VALUES ('GT-TEST-21', 'M', :d, 21, 0, 1, 21, 'CONFIRMED', 'ko')""", d=DEP)


def test_support_fallback(client):  # 고객센터 전화·이메일이 .env 에 없으면 운영사 임시값 (화면·메일 같은 값)
    s = client.get(U + "/settings/public").json()["support"]
    assert s["tel"] and s["email"] and s["hours"] == "10:00-17:00"
