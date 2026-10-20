# 개발 안내

기준 문서: 요건 정의서 v1.1 · 기본설계서 v0.4 · 상세설계서 v1.3 · 화면설계서 v2 (2026-10-19)

## 1. 설계서 ID ↔ 코드 위치

서버 코드는 `apps/api/app/` 기준.

| 설계서 | 코드 | 상태 |
|---|---|---|
| 기준 값 (처리 로직 ①) | `settings.py` (화면 쪽 같은 값: `packages/shared/src/settings.ts`) | 완료 |
| 오류 코드 (API 시트 아래) | `errors.py` | 완료 |
| 테이블 | `apps/api/migrations/schema_0001.sql` (Alembic `0001_init`) + `versions/0002_capacity20_desired_time.py` | 완료 ([v2] 표시 = 설계서와 다른 곳) |
| L-01 출발일 판단 | `rules.py` `is_sale_date` `is_bookable_date` | 완료 |
| L-02 잔여석 | `rules.py` `seats_left`, `services/catalog.py` `DEP_SQL` | 완료 |
| L-03 패키지 검색 | `services/catalog.py` `search_packages` | 완료 |
| L-04 출발 확정 현황 | `rules.py` `departure_view` | 완료 |
| L-05 금액 계산 (+ 객실 구성) | `rules.py` `quote` `rooms_of` | 완료 |
| L-06 승하차 범위 | `rules.py` `in_area`, `services/booking.py` `check_area` | 완료 (범위 기준 T-1 대기) |
| L-07 좌석 임시확보 | `services/booking.py` `create_hold` | 완료 |
| L-08 예약 확정 | `services/booking.py` `create_booking` | 완료 |
| L-09 예약번호 | `rules.py` `booking_no` + `booking_seq` 테이블 | 완료 |
| L-10 출발 판정 / B-01 | `jobs/__init__.py` `judge_departures` | 완료 (재시도·운영 메일 TODO) |
| L-14 고객 취소 / API-16 | `services/booking.py` `cancel_by_user` (공통 처리 `_cancel_confirmed`) | 완료 (본 사이트 연동 API-19 전 임시·운영 예비용) |
| API-19 고객 취소·환불 결과 받기 (본 사이트 → 이 서비스) | `routes.py` `site_cancel`, `services/booking.py` `cancel_from_site` | 완료 (인증은 `X-Site-Key` 임시, 결제 연동 협의 때 확정) |
| L-15 환불 요청 | `adapters/payment.py` `refund` | 가짜 연결 |
| L-16 승차 시간 등록 / API-17 | — | 틀만 (Q-23 답변 대기) |
| B-02 좌석 확보 정리 | `jobs` `cleanup_holds` | 완료 |
| B-03 여행 완료 | `jobs` `complete_trips` | 완료 |
| B-04 출발편 만들기 | `services/departures.py` `generate_departures` | 완료 |
| B-05 상품 가져오기 / API-15 | — | 틀만 (상품 데이터 받은 뒤) |
| B-06 명단 입력 요청, B-07 환불 확인 | — | 미착수 |
| API-01 ~ 04, 06 ~ 14, 18, 19 | `routes.py` | 동작 (`/api/golf/docs`에서 확인) |
| API-05 장소 검색 | — | 틀만 (지금은 화면이 Google을 직접 호출) |
| V-01 ~ V-24 입력 검사 | `schemas.py`(pydantic) + `services/booking.py` `_validate` | 서버 쪽 완료 |
| V-12 희망 승하차 시간 (형식 `V-12`, 범위 `V-12-range`) | `services/booking.py` `_validate` `stop_time_range`, 화면 `apps/web/src/logic.ts` `stopTimeRange` | 완료 |

## 2. 화면 연결 순서

화면(`apps/web`)은 팀 프로토타입을 그대로 옮겨 왔고, 지금은 **S-02 목록만 API로** 동작합니다 (`VITE_USE_API=1`).
나머지는 아래 순서로 하나씩 바꾸면 됩니다. 바꿀 때마다 프로토타입의 브라우저 계산(`logic.ts`, `store.ts`의 가짜 DB)을 걷어 냅니다.

1. S-01 날짜 시트 → API-04
2. S-03 상세·출발일 → API-02, API-03 (사진·태그도 API 응답으로 바꾸고 `protoId` 다리 삭제)
3. S-05 호텔 옵션·객실 구성, S-08 금액 → API-07
4. S-08 중복 예약 확인 → API-11 `?departureId=`
5. S-06 승하차 → API-06 (API-05는 Google 키 정책 정한 뒤)
6. S-09 → S-10 → S-11 → API-08, API-10 (결제는 메인 사이트 화면, 연동 방식 확정 후)
7. S-12, S-13 → API-11, API-12, API-13
8. 마지막에 설계 도구(설계 번호 표시 `Anno`, `ProtoPanel`, `Q` 태그) 제거

## 3. 개발 중 정한 것 (설계서 반영 필요)

| 내용 | 이유 |
|---|---|
| 기술: FastAPI + SQLAlchemy(Core, SQL 직접 작성) + Alembic + MySQL 8 | 팀이 써 온 구성. 메인 사이트 기술은 질문 Q-31·Q-32 답변 대기 |
| ORM 대신 SQL을 직접 씀 | 잠금(SELECT … FOR UPDATE)·트랜잭션 순서가 설계서 L-07·L-08과 1:1로 보이게 |
| 트랜잭션 격리 수준 READ COMMITTED | 출발편 잠금 뒤 읽는 확보 인원이 항상 최신 값이 되도록 (MySQL 기본 REPEATABLE READ면 오래된 값을 볼 수 있음) |
| 시각은 UTC로 저장, 날짜(출발일 등)는 JST 달력 날짜 | 서버 위치와 무관하게 같은 결과 |
| 예약번호 일련번호는 `booking_seq` 테이블로 발급 | 동시에 예약해도 번호가 겹치지 않게 (MySQL에는 PostgreSQL의 advisory lock이 없음) |
| `package.season_from/to`는 `char(5)` 'MM-DD' | 해마다 반복되는 기간이라 date가 맞지 않음 |
| `booking.single_count`, `package.single_add` 추가, `hotel_option.room_type`에서 single 삭제 | 화면설계 v2 객실 구성 (홀수 인원) |
| `service_area.polygon` → `shape` (원 또는 다각형) | 프로토타입은 원, 실서비스는 다각형. 범위 기준은 T-1 |
| `booking.payment_id` 중복 불가 | 같은 결제로 예약 두 번 만들기 방지 |
| `booking_member.country_code` 추가 | API-10 `rep.countryCode` 저장 자리 |
| B-02는 만료 **1시간 뒤** 확보를 지움 | 결제가 확보 만료 직후 끝나도 L-08 2)에서 확보 인원을 알 수 있게 |
| 옵션이 있는 패키지는 옵션 필수, 옵션 없는 패키지는 기본 호텔로 숙박 판단 | PKG-004처럼 옵션 없이 호텔이 있는 경우 |
| 결제 후 자리 없음(E-SOLDOUT)은 `notification`에 기록 못 함 | 예약번호가 없음. 로그로 남기고, 필요하면 별도 테이블 |
| 출발 판정일을 출발 3일 전 → **7일 전** (`JUDGE_DAYS = 7`, 서버·`packages/shared`·화면 `data.ts`). 판정일이 지나면 예약 받지 않음 | 운영사 확정 (2026-10-19) |
| 판정일(출발 7일 전)이 동반자 명단 입력 마감(`COMPANION_DUE_DAYS = 7`)과 **같은 날**이 됨. 마감 값은 그대로 둠 | 운영사 확정 (2026-10-19) 판정일 변경에 따른 결과. 판정 메일과 명단 마감 안내가 같은 날 나가는지 확인 필요 |
| 출발편 정원 30 → **20명** (`BUS_SEATS = 20`), 한 예약 인원 상한도 20 (`MAX_PEOPLE = 20`, API 인원 범위·동반자 수 상한도 이 값). 최소 출발 인원 20은 그대로라 20석이 다 차야 출발 | 운영사 확정 (2026-10-19) |
| 정원 = 최소 출발 인원이라 '인원 충족'이면 정원도 다 참 → 출발 현황에 `full` 추가(`rules.py` `departure_view`, API-03 `view.full`), 화면은 '잔여 0석' 대신 '정원이 다 찼어요 · 판정일에 출발 확정' / '출발 확정 · 마감' | 운영사 확정 (2026-10-19) 정원 변경에 따른 표시 정리 |
| Alembic `0002`: `departure.capacity` 기본값 20, `booking_stop.desired_time` 추가, 이미 만든 OPEN 출발편의 판정일을 7일 전으로·정원을 20으로 (확정 인원이 20을 넘는 출발편은 정원 유지). 데모 데이터 다른 그룹 인원은 0~17명(일부 18~20명) | 운영사 확정 (2026-10-19). `judge_date`·`capacity`는 출발편 행에 저장된 값이라 기존 출발편도 맞춰야 판정 배치(B-01)·상세 API가 새 규칙대로 동작 |
| 승하차 장소와 함께 **희망 시간**(승차·하차 모두 필수, 30분 단위, 참고용)을 받음: `booking_stop.desired_time`, API-10 `stops[].desiredTime`, API-12 응답 `stops[].desiredTime`. 실제 시간(`pickup_time`)은 운영이 정해 메일로 안내 | 운영사 확정 (2026-10-19). 합승 버스 정차 순서를 짜려면 모든 그룹의 희망 시간이 필요 |
| 희망 시간 범위: 승차 (첫날 티오프 − 2시간 30분, 06:00보다 이르면 06:00, 30분 올림) ~ (첫날 티오프 − 이동 − 30분, 30분 내림) / 하차 (마지막 라운드 티오프 + 5시간 + 이동, 30분 올림) ~ 21:00. 첫날 라운드가 없으면 첫 출발 시각 − 30분, 마지막 날 라운드가 없으면 11:00부터 (`NO_ROUND_DROP_FROM`, 화면 일정표의 체크아웃 후 하차와 같게). 서버는 지역별 대략값 표 `TRAVEL_MIN`(화면 `TRAVEL`과 같은 값), 화면은 Google 경로 시간이 있으면 그것을 씀 | 운영사 확정 (2026-10-19). 승차 시작 '티오프 − 2시간 30분'은 팀 결정(2026-10-20, 합승 버스가 여러 그룹을 태우는 시간을 고려, 운영사 확정값 06:00보다 좁힘 → 운영사 확인 필요)으로 S-06에 '골프장에서 기다릴 수 있음' 안내를 함께 표시하고 '예상 승차 시간' 줄은 없앰. 라운드 없는 날 기준(11:00)은 개발 중 정한 값. Google 경로가 표보다 짧으면 화면에서 고른 시간을 서버가 `V-12-range`로 거절할 수 있음 → 화면 API 연결(S-06·S-10) 때 서버 계산으로 맞출 것 |
| 화면 상단: 본 사이트 헤더·푸터 흉내(로고·카테고리·골프 NEW·회원가입·햄버거 메뉴·푸터)를 없애고 서비스 자체 헤더(서비스명 `SERVICE_NAME` 'TRAVENDER Golf' 임시 · 언어 KO/JA · 로그인) + 주 메뉴(골프 홈·전체 패키지·예약 조회·고객센터). 푸터 없음 | 운영사 확정 (2026-10-19). 서비스 이름은 확정 전 |
| 고객 사정 취소·환불은 본 사이트가 처리하고 결과를 **API-19** `POST /api/golf/site/bookings/{no}/cancel`(헤더 `X-Site-Key` = `.env` `SITE_KEY`)로 받음. CONFIRMED → USER_CANCEL(인원 되돌림·메일), USER_CANCEL → 환불 상태만 갱신, OP_CANCEL·DONE → E-STATE. 우리 쪽에서 환불 API를 다시 부르지 않음. API-16은 임시·운영 예비용으로 남김 | 운영사 확정 (2026-10-19). 실제 인증 방식은 결제 연동 협의 때 |
| 예약 화면 동의 항목을 이용약관·개인정보·취소 규정 3개 → **취소 규정 · 합승 안내** 2개로 (`Info.agree = { cancel, shared }`). 이용약관·개인정보는 본 사이트 링크만 표시 (`data.ts` `TERMS_URL` = API-14 `terms.terms`) | 운영사 확정 (2026-10-19). 이용약관·개인정보는 본 사이트 회원가입 때 동의 |
| 예약번호(GT-출발일-일련번호, 본 사이트 결제와는 `booking.payment_id`로 연결)·엔화(JPY)만 표시·휴장기 11/16~4/19 모든 골프장 공통·MySQL 유지는 지금 구현 그대로. 휴장기 주석 '예시' → '운영사 확정' | 운영사 확정 (2026-10-19) |
| 테스트 서버에서 완성한 뒤 본 서버로 옮김: `.env.example`에 `APP_ENV=test` (test \| production)만 추가, 동작 차이는 아직 없음 | 운영사 확정 (2026-10-19) |

## 4. 답을 기다리는 것 (막히는 곳)

| 질문 | 막히는 코드 |
|---|---|
| Q-14 메인 사이트 로그인 연동 방식 | `adapters/auth.py` |
| Q-15 메인 사이트 결제·환불 API | `adapters/payment.py` |
| 상품 데이터 (형식·1인실 요금) | API-15 가져오기, `package.single_add` |
| Q-23 승차 시간 확정 주체 | API-17 |
| T-1 승하차 범위 기준 | `service_area` 데이터 |
| T-2 중복 예약 처리 방식 | S-08 확인 창 (API-11은 준비됨) |
| Q-31·Q-32 메인 사이트 기술·DB | 서버 언어·DB를 바꿀지 (로그인·결제 연결은 `adapters/`만 바꾸면 되게 분리해 둠) |
