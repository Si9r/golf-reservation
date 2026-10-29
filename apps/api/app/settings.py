"""기준 값 (상세설계 v1.3 '처리 로직' ①). 코드에 숫자를 직접 쓰지 않고 여기서 읽음.
예시 값은 YU PM 답변·팀 결정에 따라 바뀜 (TBD 번호는 상세설계 '확인·결정' 시트).
화면 쪽 같은 값: packages/shared/src/settings.ts (둘을 같이 고칠 것)"""

from .config import env

MAX_PEOPLE = 20  # F-011. 한 예약도 출발편 정원을 넘을 수 없음 (운영사 확정)
MIN_PEOPLE = 1
BUS_SEATS = 20  # 출발편 정원 = 버스 1대 (운영사 확정)
MIN_DEPARTURE = 20  # 최소 출발 인원 (F-043)
JUDGE_DAYS = 7  # 출발 n일 전 판정 (운영사 확정, TBD-05 / 질문 Q-17·Q-26). 동반자 명단 마감과 같은 날
HOLD_MINUTES = 10  # 결제 중 좌석 확보 (TBD-14)
COMPANION_DUE_DAYS = 7  # 동반자 이름 수정 마감 (오타 수정용, 이름은 예약 때 모두 받음 — 팀 결정 10/23, TBD-09 / 질문 Q-21)
CLOSED_SEASON = {"from": "11-16", "to": "04-19"}  # 휴장기, 모든 골프장 공통 (운영사 확정, TBD-16 / 질문 Q-24)
SINGLE_ADD = 12000  # 1인실 추가 요금 1명당 (예시, 화면설계 v2). 패키지별 값이 있으면 그 값
NEAR_PLACE_M = 350  # L-06
MEMO_MAX = 100  # V-11
SEARCH_MAX = 50  # V-01
DEPARTURE_MONTHS_AHEAD = 13  # B-04
# 희망 승하차 시간 (V-12, 운영사 확정). 고를 수 있는 범위는 services/booking.py stop_time_range
STOP_TIME_FIRST = "06:00"  # 가장 이른 승차·하차
STOP_TIME_LAST = "21:00"  # 가장 늦은 승차·하차
STOP_TIME_STEP_MIN = 30  # 30분 단위
PICK_MARGIN_MIN = 30  # 승차: 첫 티오프 − 이동 시간 − 이 여유 (가장 늦은 승차)
PICK_EARLIEST_BEFORE_TEE_MIN = 150  # 승차: 첫 티오프 − 2시간 30분부터 (가장 이른 승차, 12:30 티오프 → 10:00). 합승이라 일찍 타면 골프장에서 대기
ROUND_HOURS = 5  # 라운드 종료 예정 = 티오프 + 5시간
NO_ROUND_DROP_FROM = "11:00"  # 마지막 날 라운드가 없을 때 하차 기준 (체크아웃 후, 화면 일정표와 같음)
# 승하차 지역(service_area.id) → 골프장 지역(golf_course.area) 이동 시간(분) 대략값. 서버에는 지도 API가 없어 이 표로 계산.
# 화면 apps/web/src/data.ts TRAVEL 과 같은 값 (둘을 같이 고칠 것). 표에 없으면 TRAVEL_DEFAULT_MIN
TRAVEL_MIN = {
    "SAPPORO": {"SAPPORO": 40, "KITAHIROSHIMA": 40, "ENIWA": 40, "CHITOSE": 60, "TOMAKOMAI": 70},
    "KITAHIROSHIMA": {"SAPPORO": 40, "KITAHIROSHIMA": 15, "ENIWA": 20, "CHITOSE": 30, "TOMAKOMAI": 45},
    "CHITOSE": {"SAPPORO": 60, "KITAHIROSHIMA": 30, "ENIWA": 25, "CHITOSE": 20, "TOMAKOMAI": 25},
}
TRAVEL_DEFAULT_MIN = 60
HOLD_KEEP_AFTER_EXPIRE_MIN = 60  # B-02: 만료 후 이만큼 지난 확보만 삭제 (L-08 2) 용, 개발 결정)
JUDGE_TRIES = 3  # B-01: 출발편 하나의 판정이 오류로 끝나면 이만큼 다시 시도, 그래도 실패하면 운영자 알림
MAIL_TRIES = 3  # 안내 메일: 발송 실패(FAIL)는 이 횟수까지 다시 보냄 (B-09, 개발 결정)
# 고객센터 (Q-13): 운영 시간은 운영사 답변 10:00~17:00. 전화번호·이메일은 확정 전이라 .env 설정값 (SUPPORT_TEL, SUPPORT_EMAIL)
SUPPORT = {"tel": env.SUPPORT_TEL, "email": env.SUPPORT_EMAIL, "hours": "10:00-17:00"}
TERMS_URL = {
    "terms": "https://travender-hokkaido.com/terms",
    "privacy": "https://travender-hokkaido.com/privacy",
    "cancel": "https://travender-hokkaido.com/cancel",
}  # 예시
