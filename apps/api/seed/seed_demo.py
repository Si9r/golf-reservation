"""데모 데이터 넣기 (apps/api 폴더에서 python -m seed.seed_demo).
프로토타입의 예시 패키지·골프장·호텔 (운영 데이터 아님. 실데이터는 API-15 가져오기).
출발편은 B-04로 만들고, 화면 확인용으로 다른 그룹 예약 인원(booked_count)을 예시 값으로 채움"""
from __future__ import annotations

import json
from pathlib import Path

from app import settings as S
from app.db import run, tx
from app.services.departures import generate_departures

DATA = json.loads((Path(__file__).parent / "demo_data.json").read_text(encoding="utf-8"))
TABLES = [("golf_course", "courses"), ("hotel", "hotels"), ("package", "packages"), ("package_day", "days"),
          ("hotel_option", "options"), ("service_area", "areas")]


def seed_demo(fake_booked: bool = True) -> int:
    with tx() as c:
        for table, key in TABLES:
            for r in DATA[key]:
                r = {k: (json.dumps(v) if k == "shape" else v) for k, v in r.items()}
                cols = list(r)
                run(c, f"INSERT IGNORE INTO {table} ({','.join(cols)}) VALUES ({','.join(':' + k for k in cols)})", **r)
        made = generate_departures(c)
        if fake_booked:  # 예약이 없는 출발편에만 예시 인원 (0~17명, 일부는 18~20명으로 거의 마감). 정원도 지금 기준(BUS_SEATS)으로
            run(c, """UPDATE departure d SET capacity = :cap, booked_count = IF(CRC32(id) % 9 = 0, 18 + (CRC32(id) DIV 9) % 3, CRC32(id) % 18)
                      WHERE NOT EXISTS (SELECT 1 FROM booking b WHERE b.departure_id = d.id)""", cap=S.BUS_SEATS)
    return made


if __name__ == "__main__":
    print("departures made:", seed_demo())
