from app.rules import booking_no, departure_view, in_area, in_closed_season, is_bookable_date, is_sale_date, quote, rooms_of, seats_left

PKG = {"dep_weekdays": "TUE,FRI", "season_from": "04-20", "season_to": "11-15"}


def test_closed_season():  # 휴장기 11/16~4/19
    assert in_closed_season("2026-11-16") and in_closed_season("2027-04-19")
    assert not in_closed_season("2027-04-20") and not in_closed_season("2026-11-15")


def test_bookable_date():  # L-01
    assert is_sale_date(PKG, "2026-10-23") and not is_sale_date(PKG, "2026-10-22")
    assert is_bookable_date(PKG, "2026-10-23", "2026-10-19")
    assert not is_bookable_date(PKG, "2026-10-23", "2026-10-20")  # 판정일 당일
    assert not is_bookable_date(PKG, "2026-10-23", "2026-10-19", "CANCEL")


def test_seats_and_view():  # L-02, L-04
    assert seats_left(30, 20, 4) == 6
    assert departure_view(18, 12, "OPEN", 2)["state"] == "enough"
    assert departure_view(10, 20, "OPEN", 2)["need"] == 8
    assert departure_view(25, 5, "OPEN", 6)["state"] == "unavailable"
    assert departure_view(22, 8, "GO", 2)["state"] == "go"


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
