"""기준 값 (상세설계 v1.3 '처리 로직' ①). 코드에 숫자를 직접 쓰지 않고 여기서 읽음.
예시 값은 YU PM 답변·팀 결정에 따라 바뀜 (TBD 번호는 상세설계 '확인·결정' 시트).
화면 쪽 같은 값: packages/shared/src/settings.ts (둘을 같이 고칠 것)"""

from .config import env

MAX_PEOPLE = 20  # F-011. 한 예약도 출발편 정원을 넘을 수 없음 (운영사 확정)
MIN_PEOPLE = 1
BUS_SEATS = 20  # 출발편 정원 = 버스 1대 (운영사 확정)
MIN_DEPARTURE = 15  # 최소 출발 인원 (F-043). 테스트용 15 (팀 결정 10/29, 운영 값은 20)
JUDGE_DAYS = 7  # 출발 n일 전 판정 (운영사 확정, TBD-05 / 질문 Q-17·Q-26). 동반자 명단 마감과 같은 날
HOLD_MINUTES = 10  # 결제 중 좌석 확보 (TBD-14)
# L-16 운영이 승차 시간을 등록하는 기한: 출발 확정(판정일, 출발 JUDGE_DAYS 일 전)부터 출발 n일 전까지 (운영사 10/29: 사정에 따라 달라 설정값으로.
# 손님이 출발 3일 전에는 승차 시간을 알도록 팀 결정 10/29). 쓰는 곳: API-17 (아직 틀만)
PICKUP_REGISTER_DUE_DAYS = 3
if not 0 <= PICKUP_REGISTER_DUE_DAYS < JUDGE_DAYS:  # 등록 기간(판정일 ~ 마감)이 있어야 함. 값을 잘못 바꾸면 서버가 켜질 때 바로 알림
    raise RuntimeError(f"PICKUP_REGISTER_DUE_DAYS({PICKUP_REGISTER_DUE_DAYS})는 0 이상, JUDGE_DAYS({JUDGE_DAYS})보다 작아야 합니다")
COMPANION_DUE_DAYS = 7  # 동반자 이름 수정 마감 (오타 수정용, 이름은 예약 때 모두 받음 — 팀 결정 10/23, TBD-09 / 질문 Q-21)
CLOSED_SEASON = {"from": "11-16", "to": "04-19"}  # 휴장기, 모든 골프장 공통 (운영사 확정, TBD-16 / 질문 Q-24)
SINGLE_ADD = 12000  # 1인실 추가 요금 1명당 (예시, 화면설계 v2). 패키지별 값이 있으면 그 값
NEAR_PLACE_M = 350  # L-06
# L-06 승하차 가능 범위: 중심(삿포로 TV탑 부근, 오도리 공원 동쪽 끝)에서 반경 5km (운영사 확정 10/29).
# 판정(rules.in_area)은 service_area.shape 를 읽음 → 이 값과 seed/demo_data.json · Alembic 0005 를 같게 (테스트가 확인).
# 화면 같은 값: packages/shared/src/settings.ts SERVICE_AREA (apps/web/src/data.ts ZONES_STRICT 가 그 값을 씀)
SERVICE_AREA = {"id": "SAPPORO", "lat": 43.0621, "lng": 141.3544, "r": 5000}
MEMO_MAX = 100  # V-11
SEARCH_MAX = 50  # V-01
DEPARTURE_MONTHS_AHEAD = 13  # B-04
HOLD_KEEP_AFTER_EXPIRE_MIN = 60  # B-02: 만료 후 이만큼 지난 확보만 삭제 (L-08 2) 용, 개발 결정)
JUDGE_TRIES = 3  # B-01: 출발편 하나의 판정이 오류로 끝나면 이만큼 다시 시도, 그래도 실패하면 운영자 알림
MAIL_TRIES = 3  # 안내 메일: 발송 실패(FAIL)는 이 횟수까지 다시 보냄 (B-09, 개발 결정)
ORDER_PENDING_ALERT_MIN = 60  # B-08 ③: 주문을 만든 뒤 이 시간 넘게 결제 대기(pending·authenticating)면 운영자 알림 1번 (v1.7, TBD-44 답에 따라 조정)
LATE_PAID_CHECK_HOURS = 48  # B-08 ④: 미결제(UNPAID)로 바뀐 예약의 주문을 이 시간까지 다시 확인 → 늦게 paid 면 자동 환불 (v1.7 L-21)
# 고객센터 (Q-13): 운영 시간은 운영사 답변 10:00~17:00. 전화번호·이메일은 .env 설정값 (SUPPORT_TEL, SUPPORT_EMAIL),
# 비어 있으면 운영사 임시값 (10/29, 화면 packages/shared SUPPORT 와 같은 값). 실제 번호를 받으면 .env 만 바꿈
SUPPORT = {"tel": env.SUPPORT_TEL or "00-0000-000", "email": env.SUPPORT_EMAIL or "golf@travender-hokkaido.com", "hours": "10:00-17:00"}
TERMS_URL = {
    "terms": "https://travender-hokkaido.com/terms",
    "privacy": "https://travender-hokkaido.com/privacy",
    "cancel": "https://travender-hokkaido.com/cancel",
}  # 예시
