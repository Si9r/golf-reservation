from app.rules import booking_no, booking_tab, departure_view, in_area, in_closed_season, is_bookable_date, is_sale_date, quote, rooms_of, seats_left

PKG = {"dep_weekdays": "TUE,FRI", "season_from": "04-20", "season_to": "11-15"}


def test_closed_season():  # 휴장기 11/16~4/19
    assert in_closed_season("2026-11-16") and in_closed_season("2027-04-19")
    assert not in_closed_season("2027-04-20") and not in_closed_season("2026-11-15")


def test_bookable_date():  # L-01
    assert is_sale_date(PKG, "2026-10-23") and not is_sale_date(PKG, "2026-10-22")
    # 판정일 = 출발 7일 전. 10-30 출발 → 판정일 10-23
    assert is_bookable_date(PKG, "2026-10-30", "2026-10-19")
    assert is_bookable_date(PKG, "2026-10-30", "2026-10-22")
    assert not is_bookable_date(PKG, "2026-10-30", "2026-10-23")  # 판정일 당일
    assert not is_bookable_date(PKG, "2026-10-23", "2026-10-19")  # 판정일 10-16 지남
    assert not is_bookable_date(PKG, "2026-10-30", "2026-10-19", "CANCEL")


def test_seats_and_view():  # L-02, L-04
    assert seats_left(20, 12, 4) == 4  # 정원 20
    assert departure_view(18, 2, "OPEN", 2) == {"booked": 18, "sum": 20, "seats": 2, "need": 0, "seatsAfter": 0, "full": True, "state": "enough", "msg": "M-125"}
    assert departure_view(10, 10, "OPEN", 2)["need"] == 8 and departure_view(10, 10, "OPEN", 2)["full"] is False
    assert departure_view(15, 5, "OPEN", 6)["state"] == "unavailable" and departure_view(15, 5, "OPEN", 6)["full"] is False
    assert departure_view(18, 2, "GO", 1)["state"] == "go"


def test_rooms_and_quote():  # L-05 객실 구성
    assert rooms_of(3) == {"singles": 1, "twins": 1}
    assert rooms_of(4) == {"singles": 0, "twins": 2}
    assert rooms_of(4, 1) == {"singles": 2, "twins": 1}
    assert quote(69800, 6000, 3, True, single_add=12000)["total"] == 75800 * 3 + 12000
    assert quote(16900, 0, 3, False)["total"] == 16900 * 3


def test_area_and_no():  # L-06, L-09
    circle = {"type": "circle", "lat": 43.0621, "lng": 141.3544, "r": 12000}
    assert in_area({"lat": 43.0675, "lng": 141.3508}, circle)
    assert not in_area({"lat": 43.1979, "lng": 140.9937}, circle)
    sq = {"type": "polygon", "points": [[43, 141.3], [43.1, 141.3], [43.1, 141.4], [43, 141.4]]}
    assert in_area({"lat": 43.05, "lng": 141.35}, sq) and not in_area({"lat": 43.2, "lng": 141.35}, sq)
    assert booking_no("2026-10-23", 7) == "GT-261023-0007"


def test_booking_tab():  # S-12 탭 (팀 테스트 10/23)
    assert [booking_tab(s) for s in ("CONFIRMED", "DONE", "USER_CANCEL", "OP_CANCEL")] == ["up", "past", "cancel", "cancel"]


def test_name_en_full_name():  # V-21·V-24: 성과 이름 모두
    from app.services.booking import valid_en

    assert valid_en("KIM MINJI") and valid_en("kim minji") and valid_en(" LEE JUNG HOON ") and valid_en("KIM MIN-JI") and valid_en("O'BRIEN SEAN")
    assert not valid_en("KIM") and not valid_en("KIM  MINJI") and not valid_en("KIM-MINJI") and not valid_en("KIM -MINJI") and not valid_en("A " * 30 + "B")
