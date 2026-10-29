import math

from app.rules import distance_m, booking_no, booking_tab, departure_view, in_area, in_closed_season, is_bookable_date, is_sale_date, quote, rooms_of, seats_left

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


SAPPORO_PLACES = {  # 실제 장소 → 반경 5km 안 여부 (중심 43.0621, 141.3544 에서 직선거리)
    "JR 삿포로역 남쪽 출구": ((43.0675, 141.3508), True),  # 0.67km
    "오도리공원": ((43.0596, 141.3485), True),  # 0.55km
    "스스키노역": ((43.0554, 141.3532), True),  # 0.75km
    "마루야마공원역": ((43.0543, 141.3165), True),  # 3.2km
    "삿포로돔": ((43.0151, 141.4096), False),  # 6.9km
    "신치토세공항 국제선 터미널": ((42.788, 141.681), False),  # 40.5km
}


def test_service_area_5km():  # L-06 승하차 범위 반경 5km (운영사 확정 10/29)
    import json
    from pathlib import Path

    from app import settings as S

    a = S.SERVICE_AREA
    assert a["r"] == 5000
    circle = {"type": "circle", "lat": a["lat"], "lng": a["lng"], "r": a["r"]}
    km_lat = 1 / 111.195  # 위도 1km
    km_lng = km_lat / math.cos(math.radians(a["lat"]))  # 이 위도에서 경도 1km
    for d_lat, d_lng in ((km_lat, 0), (0, km_lng), (-km_lat, 0), (0, -km_lng)):  # 북·동·남·서
        inside = {"lat": a["lat"] + d_lat * 4.9, "lng": a["lng"] + d_lng * 4.9}
        outside = {"lat": a["lat"] + d_lat * 5.1, "lng": a["lng"] + d_lng * 5.1}
        assert 4890 < distance_m(inside, a) < 4910 and in_area(inside, circle)
        assert 5090 < distance_m(outside, a) < 5110 and not in_area(outside, circle)
    for name, ((lat, lng), want) in SAPPORO_PLACES.items():
        assert in_area({"lat": lat, "lng": lng}, circle) is want, name
    # 시드 데이터도 같은 값 (새 DB). 이미 만든 DB는 Alembic 0005
    seed = json.loads((Path(__file__).resolve().parents[1] / "seed" / "demo_data.json").read_text(encoding="utf-8"))
    assert next(x["shape"] for x in seed["areas"] if x["id"] == a["id"]) == circle


def test_area_and_no():  # L-06, L-09
    sq = {"type": "polygon", "points": [[43, 141.3], [43.1, 141.3], [43.1, 141.4], [43, 141.4]]}
    assert in_area({"lat": 43.05, "lng": 141.35}, sq) and not in_area({"lat": 43.2, "lng": 141.35}, sq)
    assert booking_no("2026-10-23", 7) == "GT-261023-0007"


def test_booking_tab():  # S-12 탭 (팀 테스트 10/23)
    assert [booking_tab(s) for s in ("CONFIRMED", "DONE", "USER_CANCEL", "OP_CANCEL")] == ["up", "past", "cancel", "cancel"]


def test_name_en_full_name():  # V-21·V-24: 성과 이름 모두
    from app.services.booking import valid_en

    assert valid_en("KIM MINJI") and valid_en("kim minji") and valid_en(" LEE JUNG HOON ") and valid_en("KIM MIN-JI")
    # 하이픈만 허용 (운영사 확정 10/29): 아포스트로피, 하이픈으로 시작·끝은 거절
    assert not valid_en("O'BRIEN SEAN") and not valid_en("-KIM MINJI") and not valid_en("KIM MINJI-") and not valid_en("KIM -MINJI") and not valid_en("KIM MIN-")
    assert not valid_en("KIM") and not valid_en("KIM  MINJI") and not valid_en("KIM-MINJI") and not valid_en("KIM -MINJI") and not valid_en("A " * 30 + "B")
