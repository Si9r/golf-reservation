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
5. S-06 승하차 → API-06 (API-05는 Google 키 정책 정한 뒤). 희망 시간 범위는 서버 `stop_time_range`와 같은 값이 되게 맞춤 (지금 화면은 Google 경로 시간을 써서 서버의 대략값 표와 다를 수 있음 → 서버가 `V-12-range`로 거절할 수 있음)
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
| 승하차 장소와 함께 **희망 시간**(승차는 필수, 하차는 선택, 30분 단위, 참고용)을 받음: `booking_stop.desired_time`, API-10 `stops[].desiredTime`, API-12 응답 `stops[].desiredTime`. 실제 시간(`pickup_time`)은 운영이 정해 메일로 안내 | 운영사 확정 (2026-10-19). 합승 버스 정차 순서를 짜려면 모든 그룹의 희망 시간이 필요. 하차 시간을 선택으로 바꾼 것은 팀 결정 (2026-10-21, 하차 희망 시간은 어디까지나 참고라 없어도 예약 가능하게) → 운영사 확인 필요 |
| 희망 시간 범위: 승차 (첫날 티오프 − 2시간 30분, 06:00보다 이르면 06:00, 30분 올림) ~ (첫날 티오프 − 이동 − 30분, 30분 내림) / 하차 (마지막 라운드 티오프 + 5시간 + 이동, 30분 올림) ~ 21:00. 첫날 라운드가 없으면 첫 출발 시각 − 30분, 마지막 날 라운드가 없으면 11:00부터 (`NO_ROUND_DROP_FROM`, 화면 일정표의 체크아웃 후 하차와 같게). 서버는 지역별 대략값 표 `TRAVEL_MIN`(화면 `TRAVEL`과 같은 값), 화면은 Google 경로 시간이 있으면 그것을 씀 | 운영사 확정 (2026-10-19). 승차 시작 '티오프 − 2시간 30분'은 팀 결정(2026-10-20, 합승 버스가 여러 그룹을 태우는 시간을 고려, 운영사 확정값 06:00보다 좁힘 → 운영사 확인 필요)으로 S-06에 '골프장에서 기다릴 수 있음' 안내를 함께 표시하고 '예상 승차 시간' 줄은 없앰. 라운드 없는 날 기준(11:00)은 개발 중 정한 값. Google 경로가 표보다 짧으면 화면에서 고른 시간을 서버가 `V-12-range`로 거절할 수 있음 → 화면 API 연결(S-06·S-10) 때 서버 계산으로 맞출 것 |
| 화면 상단: 본 사이트 헤더·푸터 흉내(로고·카테고리·골프 NEW·회원가입·햄버거 메뉴·푸터)를 없애고 서비스 자체 헤더(서비스명 `SERVICE_NAME` 'TRAVENDER Golf' 임시 · 언어 KO/JA · 로그인) + 주 메뉴(골프 홈·전체 패키지·예약 조회·고객센터). 푸터 없음 | 운영사 확정 (2026-10-19). 서비스 이름은 확정 전 |
| 고객 사정 취소·환불은 본 사이트가 처리하고 결과를 **API-19** `POST /api/golf/site/bookings/{no}/cancel`(헤더 `X-Site-Key` = `.env` `SITE_KEY`)로 받음. CONFIRMED → USER_CANCEL(인원 되돌림·메일), USER_CANCEL → 환불 상태만 갱신, OP_CANCEL·DONE → E-STATE. 우리 쪽에서 환불 API를 다시 부르지 않음. API-16은 임시·운영 예비용으로 남김 | 운영사 확정 (2026-10-19). 실제 인증 방식은 결제 연동 협의 때 |
| 예약 화면 동의 항목을 이용약관·개인정보·취소 규정 3개 → **취소 규정 · 합승 안내** 2개로 (`Info.agree = { cancel, shared }`). 이용약관·개인정보는 본 사이트 링크만 표시 (`data.ts` `TERMS_URL` = API-14 `terms.terms`) | 운영사 확정 (2026-10-19). 이용약관·개인정보는 본 사이트 회원가입 때 동의 |
| 예약번호(GT-출발일-일련번호, 본 사이트 결제와는 `booking.payment_id`로 연결)·엔화(JPY)만 표시·휴장기 11/16~4/19 모든 골프장 공통·MySQL 유지는 지금 구현 그대로. 휴장기 주석 '예시' → '운영사 확정' | 운영사 확정 (2026-10-19) |
| 테스트 서버에서 완성한 뒤 본 서버로 옮김: `.env.example`에 `APP_ENV=test` (test \| production)만 추가, 동작 차이는 아직 없음 | 운영사 확정 (2026-10-19) |
| N-001 변경: 모바일 화면이 기본이고, 화면 폭 **1024px 이상**(PC 브라우저)에서는 PC 배치를 씀 — 헤더·본문 1200px, 홈 2단, 목록 3열, 상세는 오른쪽에 예약 패널, 예약 단계·내 예약·고객센터는 가운데 760px, 팝업은 가운데. 768~1023px(태블릿 세로 등)은 모바일과 같은 1열. `apps/web/src/index.css`에서 PC 배치를 끄던 설정(`--breakpoint-lg: 9999px`)을 지움 | 팀 결정 (2026-10-20). PC 배치를 끈 채로는 본문만 1200px로 늘어나 입력칸·버튼이 화면 가득 퍼져 PC에서 쓰기 불편했음. 프로토타입에 있던 PC 배치를 다시 켬 → 화면설계서 반응형 규칙에 반영 필요 |
| B-01: 예약 단계에서 다음 화면으로 넘어갈 때 잔여석·판정일을 다시 확인 (S-03 '이 패키지 예약', S-05 '다음', S-08 '예약 진행'). 바뀌었으면 M-128 안내 후 S-03 출발일 선택으로 (출발일을 비움). 확인은 `apps/web/src/api/seatCheck.ts` `recheckSeat` 하나 — `VITE_USE_API=1`이면 API-03 `selectable`, 아니면 프로토타입 계산. S-06 '다음'(Place.tsx)은 담당 팀원이 `useSeatGuard`를 붙일 예정 | 팀 테스트 10/23 (상세를 보는 사이 자리가 차도 정보 입력에서야 알게 됨) |
| B-03: 숙박이 있는 패키지(박 수 ≥ 1, 기본 호텔 있음)는 호텔 옵션이 없어도 S-05를 보여 줌 (`logic.ts` `hasHotelStep`). 옵션 자리에 '이 패키지의 숙박 호텔' 카드(선택 불가) + 객실 구성. 당일 패키지만 건너뜀. 진행 단계(C-04) 건너뜀 표시·S-08 '객실'·'호텔' 변경도 이 기준. 서버 L-05는 이미 기본 호텔로 숙박 판단 (테스트 `test_quote_fixed_hotel_odd_people`) | 팀 테스트 10/23 (홀수 인원 1인실 추가 요금이 모르게 붙고, 객실을 바꿀 화면이 없었음) |
| V-21·V-24 영문 이름은 성과 이름 모두: 영문 대문자 단어 2개 이상·단어 사이 공백 1칸·60자 이하 (`^[A-Z]+( [A-Z]+)+$`, 소문자는 대문자로). 서버 `NAME_EN`·`valid_en`(예약·동반자 저장), 화면 S-09·S-13 `validEn`. M-162 문구·placeholder 'KIM MINJI' | 팀 테스트 10/23 + 운영사 답변 (대표자·동반자 모두 영문 풀네임 필수) |
| S-13 상태 문구: 모집 중 + 합계 < 20 → M-200 / 합계 ≥ 20, 판정 전 → M-129만 / 출발 확정 → M-201 (서버 `departure_view` state·full 과 같은 기준) | 팀 테스트 10/23 (정원이 찼는데 '출발 인원을 모으고 있어요'가 같이 나옴) |
| S-12 탭 분류를 한 함수로: 예정 = CONFIRMED, 지난 = DONE, 취소 = USER_CANCEL·OP_CANCEL (화면 `store.ts` `tabOf`, 서버 `rules.py` `booking_tab`, API-11 응답 `tab`) | 팀 테스트 10/23. 지금 코드로는 재현되지 않았음 (S-13 데모 '고객 취소' → 취소 탭 정상) — 분류 규칙을 한곳에 모으고 서버 테스트 추가 |
| 손님 화면에서 '판정일 / 判定日'을 쓰지 않고 날짜 문장으로 ('10월 23일(금)에 출발 여부가 정해져요', `logic.ts` `fDayLong`). M-125·M-129·M-150·M-182·M-200·depFull·judge·취소 규정 문구·FAQ. 설계 주석·Anno·서버 이름(judge_date)은 그대로 | 팀 테스트 10/23 (손님은 '판정일'을 잘 모름) |
| 날짜 시트: 휴장기(11/16~4/19) 날짜에 '휴장', 판정일이 지나 고를 수 없는 날에 '마감', 휴장기에 걸친 달(11~4월)은 달력 위에 안내 한 줄 | 팀 테스트 10/23 (11월·4월 날짜가 왜 막혀 있는지 알 수 없었음) |
| S-08 중복 예약 확인 창: 기존 예약번호·인원 표시, 본문 15px·문장별 문단, 버튼 3개 '기존 예약 보기'(S-13) / '다른 일행으로 계속'(S-09) / '닫기' | 팀 테스트 10/23 (창이 작고 설계의 '기존 예약 보기'가 없었음) |
| S-03 잔여석 이름: 출발일 목록 '남은 자리 n석'(지금), 출발 현황 '예약하면 남는 자리 n석'(우리 인원을 넣은 뒤). 계산은 그대로 | 팀 테스트 10/23 (결제 중 임시확보가 있을 때 두 숫자가 달라 헷갈림) |
| 패키지 카드 높이 맞춤 (목록·홈): 사진 16:9 고정, 이름 2줄·숙소 1줄 말줄임, 가격 줄은 카드 아래 | 팀 테스트 10/23 (375px에서 카드 크기가 제각각) |
| M-174 문구: 환불 대신 '예약이 되지 않았고 결제는 자동으로 취소'. 서버 처리(전액 환불 요청)는 그대로 | 팀 테스트 10/23 |
| B-02 일정표(`logic.ts` `itinerary`): 2일차부터 승차·호텔 출발 = 그날 티오프 − 이동 − 30분(`PICK_MARGIN_MIN`), 30분 단위 내림. 이동은 받아 둔 Google 경로 시간(`gmaps.ts` `cachedDriveMin`), 없으면 `TRAVEL`. 첫날 승차·마지막 날 하차는 손님 희망 시간이 있으면 '희망 HH:MM' | 팀 테스트 10/23 ('호텔 없이' 승차가 티오프 1시간 전·호텔 출발이 50분 전 고정이라 늦거나 빠듯했고, 하차가 희망 시간과 달랐음). Google 시간은 다른 곳에서 한 번 받아 둔 뒤부터 반영 |

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
| 승차 희망 시간 시작을 '첫 티오프 − 2시간 30분'으로 해도 되는지 (운영사 확정값은 06:00부터, 팀 결정으로 좁힘) | `settings.py` `PICK_EARLIEST_BEFORE_TEE_MIN` (화면 `data.ts`·`packages/shared` 같은 값) |
| 서비스 이름 (지금 'TRAVENDER Golf'는 임시) | `apps/web/src/data.ts` `SERVICE_NAME` |
| API-19 본 사이트 → 이 서비스 호출의 실제 인증 방식 (결제 연동 협의 때) | `routes.py` `site` (지금은 `X-Site-Key` 공유 키 비교) |
| 판정일과 동반자 명단 마감이 같은 날(출발 7일 전) → 판정 결과 메일과 명단 마감 안내를 같은 날 보내도 되는지 | B-01 판정 메일, B-06 명단 입력 요청 (미착수) |
