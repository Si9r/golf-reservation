# 개발 안내

기준 문서: 요건 정의서 v1.1 · 기본설계서 v0.4 · 상세설계서 v1.3 · 화면설계서 v2 (2026-10-19)

## 1. 설계서 ID ↔ 코드 위치

서버 코드는 `apps/api/app/` 기준.

| 설계서 | 코드 | 상태 |
|---|---|---|
| 기준 값 (처리 로직 ①) | `settings.py` (화면 쪽 같은 값: `packages/shared/src/settings.ts`) | 완료 |
| 오류 코드 (API 시트 아래) | `errors.py` | 완료 |
| 테이블 | `apps/api/migrations/schema_0001.sql` (Alembic `0001_init`) + `versions/0002_capacity20_desired_time.py` + `versions/0003_payment_order.py` | 완료 ([v2] 표시 = 설계서와 다른 곳) |
| L-01 출발일 판단 | `rules.py` `is_sale_date` `is_bookable_date` | 완료 |
| L-02 잔여석 (정원 − 확정 − 결제 대기 − 주문 전 확보) | `rules.py` `seats_left`, `services/catalog.py` `DEP_SQL` `dep_seats` | 완료 |
| L-03 패키지 검색 | `services/catalog.py` `search_packages` | 완료 |
| L-04 출발 확정 현황 | `rules.py` `departure_view` | 완료 |
| L-05 금액 계산 (+ 객실 구성) | `rules.py` `quote` `rooms_of` | 완료 |
| L-06 승하차 범위 (반경 5km) | 값 `settings.py` `SERVICE_AREA` (화면 `packages/shared` 같은 값), 판정 `rules.py` `in_area`, `services/booking.py` `check_area` | 완료 (운영사 확정 10/29) |
| L-07 좌석 임시확보 / API-08·09 | `services/booking.py` `create_hold` | 완료 (10/27부터 화면은 쓰지 않음, 결제 대기 예약이 좌석을 잡음) |
| L-08 예약: 결제 대기 생성 / API-10 | `services/booking.py` `create_booking` (PENDING_PAYMENT, 좌석을 잡음), `abandon_pending` | 완료 |
| 본 사이트 연동 (로그인 세션·주문·조회·환불) | `adapters/partner.py` (`PAYMENT_BACKEND=fake\|partner`, 파일 맨 위 '가정' 목록), `adapters/auth.py`, `adapters/payment.py` | 완료 (**사양서 원본 받기 전 가정으로 구현**, 받으면 `partner.py`만 맞춤) |
| 결제 시작 / API-20 `POST /bookings/{no}/checkout` | `services/booking.py` `checkout` | 완료 |
| 결제 결과 확인 / API-21 `GET /bookings/{no}/payment` | `services/booking.py` `payment_status` → `apply_order` (출발편 잠금 후 다시 확인 → 두 번 불러도 확정 한 번) | 완료 |
| L-09 예약번호 | `rules.py` `booking_no` + `booking_seq` 테이블 | 완료 |
| L-10 출발 판정 / B-01 | `jobs/__init__.py` `judge_departures` | 완료 (재시도·운영 메일 TODO) |
| L-14 고객 취소 / API-16 | `services/booking.py` `cancel_by_user` (공통 처리 `_cancel_confirmed`) | 완료 (본 사이트 연동 API-19 전 임시·운영 예비용) |
| API-19 고객 취소·환불 결과 받기 (본 사이트 → 이 서비스) | `routes.py` `site_cancel`, `services/booking.py` `cancel_from_site` | 완료 (인증은 `X-Site-Key` 임시, 결제 연동 협의 때 확정) |
| L-15 환불 요청 | `services/booking.py` `refund_booking` → `adapters/payment.py` `cancel_order` (reason `operator_cancel` · `customer_cancel`, 실패 → `refund_status=FAIL` + 운영자 알림 `alert_ops`) | 완료 (전액 환불만) |
| L-16 승차 시간 등록 / API-17 | 등록 기한 `settings.py` `PICKUP_REGISTER_DUE_DAYS` (출발 3일 전까지) | 틀만 (기한은 운영사 10/29 설정값으로) |
| B-02 좌석 확보 정리 | `jobs` `cleanup_holds` | 완료 |
| B-03 여행 완료 | `jobs` `complete_trips` | 완료 |
| B-04 출발편 만들기 | `services/departures.py` `generate_departures` | 완료 |
| B-05 상품 가져오기 / API-15 | — | 틀만 (상품 데이터 받은 뒤) |
| B-06 명단 입력 요청 | — | 없앰 (동반자 이름을 예약 때 모두 받음, 팀 결정 10/23) |
| B-07 환불 재시도 | `jobs` `retry_refunds` (`refund_status=FAIL`인 취소 예약) | 완료 |
| B-08 결제 확인 (10분마다) | `jobs` `check_payments`: 주문 전 결제 대기 10분 지남 → UNPAID, 주문 후 결제 대기 → 본 사이트 조회 | 완료 |
| API-01 ~ 04, 06 ~ 14, 18 ~ 21 | `routes.py` | 동작 (`/api/golf/docs`에서 확인) |
| API-05 장소 검색 | — | 틀만 (지금은 화면이 Google을 직접 호출) |
| V-01 ~ V-24 입력 검사 | `schemas.py`(pydantic) + `services/booking.py` `_validate` | 서버 쪽 완료 |
| V-12 희망 승하차 시간 (형식 `V-12`, 범위 `V-12-range`) | `services/booking.py` `_validate` `stop_time_range`, 화면 `apps/web/src/logic.ts` `stopTimeRange` | 완료 |

## 2. 화면 연결 순서

화면(`apps/web`)은 팀 프로토타입을 옮겨 온 것입니다. `VITE_USE_API=1`이면 `apps/web/src/api/sync.ts`가 브라우저 계산 대신 서버 값을 쓰게 합니다 (팀원 병합 10/23).
API를 빼면(`VITE_USE_API` 없음) 지금처럼 브라우저 안 데이터로만 동작합니다.

**연결됨 (API 모드)**

| 화면 | API |
|---|---|
| S-01 홈·S-03 상세: 출발편·잔여석, 날짜 시트의 날짜별 패키지 수 | API-03, API-04 (`useDepartures`, `useCalendar`) |
| S-02 목록 | API-01 (`usePackageSearch`) |
| S-03·S-05·S-06·S-08 '다음': 잔여석 다시 확인 | API-03 (`api/seatCheck.ts`) |
| S-06 승하차 범위 | API-06 |
| S-08 금액·중복 예약 확인 | API-07, API-11 `?departureId=` |
| S-09 '다음': 결제 대기 예약 만들기 (좌석을 잡음) / S-10 뒤로 가기 때 그만두기 | API-10, `DELETE /bookings/{no}/pending` |
| S-10 결제: 본 사이트 주문 → 결제창 이동 | API-07, API-20 |
| 결제 결과 `#/golf/payment/return?no=` (`screens/PayReturn.tsx`): 30초 간격 3번 다시 확인 | API-21 |
| 로그인: 본 사이트 `user_session` 쿠키 → 401이면 응답의 `loginUrl`로 이동, 로그아웃은 본 사이트 `LOGOUT_URL` | API-18 `/me` (`api/client.ts`, `api/sync.ts` `loadMe`) |
| S-12 내 예약 / S-13 예약 상세·동반자 이름 수정 | API-11, API-12, API-13 |

**아직 브라우저 데이터 (남은 순서)**

1. 상품 내용 → API-02: 패키지 사진·일정·골프장·호텔(S-03), 호텔 옵션·객실(S-05), 홈 추천 카드·S-04 비교. 바꾼 뒤 `protoId`·`apiPkgId` 다리와 `data.ts`의 상품 데이터 삭제
2. S-06 장소 검색 → API-05 (Google 키·요금 정책 정한 뒤. 지금은 화면이 Google을 직접 호출)
3. 일정표(L-11)의 승차·호텔 출발 시각을 서버 계산과 맞추기 (희망 시간 범위는 10/26에 화면 ⊆ 서버로 맞춤. 일정표는 아직 화면 계산만)
4. 마지막에 설계 도구(설계 번호 표시 `Anno`, `ProtoPanel`, `Q` 태그) 제거

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
| `booking.payment_id` 중복 불가 (10/27 `order_id`로 이름 바꿈) | 같은 결제로 예약 두 번 만들기 방지 |
| `booking_member.country_code` 추가 | API-10 `rep.countryCode` 저장 자리 |
| B-02는 만료 **1시간 뒤** 확보를 지움 | 결제가 확보 만료 직후 끝나도 L-08 2)에서 확보 인원을 알 수 있게 |
| 옵션이 있는 패키지는 옵션 필수, 옵션 없는 패키지는 기본 호텔로 숙박 판단 | PKG-004처럼 옵션 없이 호텔이 있는 경우 |
| 결제 후 자리 없음(E-SOLDOUT)은 `notification`에 기록 못 함 | 예약번호가 없음. 로그로 남기고, 필요하면 별도 테이블 |
| 출발 판정일을 출발 3일 전 → **7일 전** (`JUDGE_DAYS = 7`, 서버·`packages/shared`·화면 `data.ts`). 판정일이 지나면 예약 받지 않음 | 운영사 확정 (2026-10-19) |
| 판정일(출발 7일 전)이 동반자 명단 입력 마감(`COMPANION_DUE_DAYS = 7`)과 **같은 날**이 됨. 마감 값은 그대로 둠 | 운영사 확정 (2026-10-19) 판정일 변경에 따른 결과. 판정 메일과 명단 마감 안내가 같은 날 나가는지 확인 필요 |
| 출발편 정원 30 → **20명** (`BUS_SEATS = 20`), 한 예약 인원 상한도 20 (`MAX_PEOPLE = 20`, API 인원 범위·동반자 수 상한도 이 값). 최소 출발 인원 20은 그대로라 20석이 다 차야 출발 | 운영사 확정 (2026-10-19) |
| 정원 = 최소 출발 인원이라 '인원 충족'이면 정원도 다 참 → 출발 현황에 `full` 추가(`rules.py` `departure_view`, API-03 `view.full`), 화면은 '잔여 0석' 대신 '정원이 다 찼어요 · 판정일에 출발 확정' / '출발 확정 · 마감' | 운영사 확정 (2026-10-19) 정원 변경에 따른 표시 정리 |
| Alembic `0002`: `departure.capacity` 기본값 20, `booking_stop.desired_time` 추가, 이미 만든 OPEN 출발편의 판정일을 7일 전으로·정원을 20으로 (확정 인원이 20을 넘는 출발편은 정원 유지). 데모 데이터 다른 그룹 인원은 0~17명(일부 18~20명) | 운영사 확정 (2026-10-19). `judge_date`·`capacity`는 출발편 행에 저장된 값이라 기존 출발편도 맞춰야 판정 배치(B-01)·상세 API가 새 규칙대로 동작 |
| 승하차 장소와 함께 **희망 시간**(승차는 필수, 하차는 선택, 30분 단위, 참고용)을 받음: `booking_stop.desired_time`, API-10 `stops[].desiredTime`, API-12 응답 `stops[].desiredTime`. 실제 시간(`pickup_time`)은 운영이 정해 메일로 안내 | 운영사 답변(10/19): '손님이 서비스 화면에서 승하차 희망 장소를 시간과 함께 입력'까지. 합승 버스 정차 순서를 짜려면 희망 시간이 필요. **승차 필수·하차 선택(하차 장소는 필수)은 팀 결정**(10/21): 실제 하차 시간은 도로 상황·합승 인원에 따라 바뀌어 약속할 수 없음 → **운영사 확정 (10/29)** |
| 희망 시간 범위: 승차 (첫날 티오프 − 2시간 30분, 06:00보다 이르면 06:00, 30분 올림) ~ (첫날 티오프 − 이동 − 30분, 30분 내림) / 하차 (마지막 라운드 티오프 + 5시간 + 이동, 30분 올림) ~ 21:00. 첫날 라운드가 없으면 첫 출발 시각 − 30분, 마지막 날 라운드가 없으면 11:00부터 (`NO_ROUND_DROP_FROM`, 화면 일정표의 체크아웃 후 하차와 같게). 서버는 지역별 대략값 표 `TRAVEL_MIN`(화면 `TRAVEL`과 같은 값), 화면은 Google 경로 시간이 있으면 그것을 씀 | **범위는 모두 팀이 정한 안** (운영사 답변은 '시간과 함께 입력'까지. '06:00부터'·'승차·하차 모두 필수'도 운영사 확정이 아니라 처음 세운 팀 안이었음). 승차 시작 '티오프 − 2시간 30분'은 팀 결정(10/20, 합승 버스가 여러 그룹을 태우는 시간을 고려)으로 S-06에 '골프장에서 기다릴 수 있음' 안내를 함께 표시하고 '예상 승차 시간' 줄은 없앰 → 운영사 확인 요청(질문표 3번). 라운드 없는 날 기준(11:00)은 개발 중 정한 값. Google 경로가 표보다 짧으면 화면에서 고른 시간을 서버가 `V-12-range`로 거절할 수 있음 → 화면 API 연결(S-06·S-10) 때 서버 계산으로 맞출 것 |
| 화면 상단: 본 사이트 헤더·푸터 흉내(로고·카테고리·골프 NEW·회원가입·햄버거 메뉴·푸터)를 없애고 서비스 자체 헤더(서비스명 `SERVICE_NAME` 'TRAVENDER Golf' 임시 · 언어 KO/JA · 로그인) + 주 메뉴(골프 홈·전체 패키지·예약 조회·고객센터). 푸터 없음 | 운영사 확정 (2026-10-19). 서비스 이름은 확정 전 |
| 고객 사정 취소·환불은 본 사이트가 처리하고 결과를 **API-19** `POST /api/golf/site/bookings/{no}/cancel`(헤더 `X-Site-Key` = `.env` `SITE_KEY`)로 받음. CONFIRMED → USER_CANCEL(인원 되돌림·메일), USER_CANCEL → 환불 상태만 갱신, OP_CANCEL·DONE → E-STATE. 우리 쪽에서 환불 API를 다시 부르지 않음. API-16은 임시·운영 예비용으로 남김 | 운영사 확정 (2026-10-19). 실제 인증 방식은 결제 연동 협의 때 |
| 예약 화면 동의 항목을 이용약관·개인정보·취소 규정 3개 → **취소 규정 · 합승 안내** 2개로 (`Info.agree = { cancel, shared }`). 이용약관·개인정보는 본 사이트 링크만 표시 (`data.ts` `TERMS_URL` = API-14 `terms.terms`) | 운영사 확정 (2026-10-19). 이용약관·개인정보는 본 사이트 회원가입 때 동의 |
| 예약번호(GT-출발일-일련번호, 본 사이트 결제와는 `booking.order_id`로 연결)·엔화(JPY)만 표시·휴장기 11/16~4/19 모든 골프장 공통·MySQL 유지는 지금 구현 그대로. 휴장기 주석 '예시' → '운영사 확정' | 운영사 확정 (2026-10-19) |
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
| 동반자 영문 이름(인원 − 1명)을 예약 때 **모두 필수**로: S-09 '나중에 입력' 없음(팀원 KIM-TAEYEON 화면), 서버 V-24도 인원 − 1명 모두·형식 검사(예약 API-10, 명단 저장 API-13) | 팀 결정 (2026-10-23, 팀원 브랜치 합칠 때) → **운영사 확정 (10/29)** |
| ~~영문 이름(V-21·V-24)에 단어 안 하이픈·아포스트로피 허용~~ → 10/29 **하이픈만** (아래 행). (이전: KIM MIN-JI, O'BRIEN SEAN 허용) 성과 이름 모두 필수·60자 이하는 그대로. 화면은 성·이름 두 칸 입력 후 '성 이름'으로 합침 | 팀 결정 (2026-10-23). 여권 이름에 쓰일 수 있어 화면(팀원)과 서버 규칙을 맞춤 |
| S-06 마무리: '뒤로'·진행 단계 기준을 `hasHotelStep(p)`로 (호텔이 정해진 패키지는 '뒤로'가 S-05, '호텔' 칸 건너뜀 표시 없음). '다음'에 잔여석 재확인 `useSeatGuard` (바뀌었으면 M-128 → S-03, API 모드는 `refreshMonth`). '희망 하차 시간 (선택)' 아래 안내 `dropTimeNote` ('도로 상황과 합승 인원에 따라 실제 하차 시간은 달라질 수 있어요') | 팀 결정 10/23 |
| 병합 후 쓰이지 않는 문구 키 삭제 (한·일): M-127·M-129·M-184·M-200, dupStop, later, proceed, minT, statusT, depRange, depLine, lineOpt, optCount, optFoot, golfT, hotelT, compDone, cancelT, supportBtn, mapPicked, mapPickedArea, depGo, stepSkip, mdCompNeed, mdCompInput. 설계서 메시지 대응: M-127 → `homeDateHint`, M-129 → `mdEnoughT`·`mdEnoughD`(S-13)·`depFull`(S-03), M-200 → `mdOpenT`·`mdOpenD`(S-13), M-184 → `compFixInfo`(S-11) | 팀 결정 10/23 (설계서 메시지 문구를 실제 화면 문장으로 맞출 것) |
| 동반자 영문 이름은 예약 때 모두 받고, '나중에 입력'과 관련 기능을 없앰: B-06 명단 입력 요청 메일·알림 종류 COMPANION은 만들지 않음(코드에 없었음), 화면 `Info.later` 삭제, S-11 안내를 '동반자 이름은 출발 7일 전까지 예약 상세에서 고칠 수 있어요'(`compFixInfo`)로 | 팀 결정 10/23 (나중에 받으면 마감까지 안 들어온 예약 처리가 복잡해짐). 운영사 확인은 따로 |
| 동반자 명단 수정(API-13, S-13)은 '오타 수정용'으로 남김: 마감 출발 7일 전(`COMPANION_DUE_DAYS`) 그대로, 인원 − 1명 모두 필수·빈 이름 저장 불가(서버·화면). S-13 제목 '동반자 이름 수정 (출발 7일 전까지)' | 팀 결정 10/23 |
| 탑승자 정보는 영문 이름만 받음: 대표자·동반자 모두 여권 영문 성·이름만 (대문자, 성·이름 각각 필수, 하이픈만 허용(10/29), 출발 7일 전까지 오타 수정). 여권 번호·생년월일·국적·여권 만료일은 받지 않음 — 화면·서버 검사·DB 어디에도 없음을 확인. S-09의 '필수 수집 항목' 확인 필요 표시(Q-21) 삭제. 대표자 한글 이름·연락처·이메일은 예약 연락용으로 그대로 | 운영사 확정 10/26 (구두) |
| 안내 메일은 이 서비스가 직접 보냄. 발송은 `adapters/mail.py` 한 곳: `MAIL_BACKEND=log`(기본, 기록만) / `smtp`(실제 발송, `MAIL_FROM`·`MAIL_FROM_NAME`·`SMTP_HOST`·`SMTP_PORT`·`SMTP_SECURITY`·`SMTP_USER`·`SMTP_PASSWORD`). 실패해도 예약은 되돌리지 않고 `notification`에 FAIL·오류 기록. 한국어 템플릿 4종(예약 확인 CONFIRM · 출발 확정 GO · 운행 취소 CANCEL · 고객 취소 USER_CANCEL)에 예약번호·패키지·출발일·인원·금액. 고객센터 전화·이메일은 `.env` `SUPPORT_TEL`·`SUPPORT_EMAIL`(비면 메일에 안 씀), 운영 시간 10:00~17:00 (`settings.SUPPORT`) | 운영사 확정 10/26 (구두). 보내는 주소는 TRAVENDER 홋카이도 도메인으로 새로 만들 예정이라 코드에 쓰지 않음. 일본어 메일은 아직 없음 (예약 언어 `booking.lang`으로 나눌 자리) |
| 희망 시간 범위를 화면에서 계산할 때 이동 시간 = Google 경로 시간과 대략값 표(`TRAVEL` = 서버 `TRAVEL_MIN`) 중 **큰 쪽** (`logic.ts` `travelOf`). 화면 범위가 항상 서버 검사 범위 안에 듦. 서버 `stop_time_range`는 일정이 없는 패키지면 기본 범위(06:00~21:00) | 버그 수정 10/26: Google 시간이 표보다 짧으면 화면에서 고른 승차 시간을 서버가 V-12-range로 거절해 결제 단계에서 예약이 실패할 수 있었음 (예: 티오프 12:00, Google 25분·표 40분 → 화면 11:00까지, 서버 10:30까지) |
| **결제 전에 예약을 만듦**: S-09 '다음'에서 `PENDING_PAYMENT`(결제 대기)로 저장하고 예약번호를 발급. 결제가 끝나면 `CONFIRMED`(+ `booked_count`), 실패·만료면 `UNPAID`(미결제). 두 상태는 S-12·S-13에 보이지 않음(CONFIRMED 이후만). 같은 회원이 새로 예약하면 주문 전 결제 대기는 UNPAID로. API-08·09 좌석 확보는 남아 있지만 화면은 쓰지 않음 | 본 사이트 결제 연동 작업 지시 (10/27): 본 사이트 주문에 `reference`(= 예약번호)가 필요 |
| **주문을 만든 뒤에는 결과가 나올 때까지 좌석 유지** (잔여석 = 정원 − 확정 − 결제 대기 − 주문 전 확보). 10분 만료는 주문 전 결제 대기·확보에만. 결제 확인 배치 B-08이 10분마다 본 사이트 주문을 다시 조회 | 작업 지시 (10/27). 카드 인증(authenticating)이 길어져도 결제된 손님의 자리가 없어지지 않게. **본 사이트 주문 만료 시간은 답 대기** |
| Alembic `0003`: `booking.status`에 `PENDING_PAYMENT`·`UNPAID` 추가, `payment_id` → `order_id`(중복 불가), `order_status`·`order_checked_at` 추가 | 작업 지시 (10/27) |
| 결제 후 출발편이 이미 운행 취소면 바로 OP_CANCEL + 전액 환불(`operator_cancel`). 운행 취소 환불은 주문별로 차례로, 한 건이 실패해도 계속(FAIL 기록 + 운영자 알림 → B-07 재시도). 운영자 알림은 `notification` `OPS_ALERT` + `.env` `OPS_EMAIL` | 작업 지시 (10/27) |
| **예약 확인 메일(CONFIRM)은 본 사이트가 보냄** → 이 서비스는 보내지 않음(템플릿은 남김). 출발 확정 GO·승차 시간 안내 PICKUP은 이 서비스가 보냄(PICKUP 템플릿만, 보내는 곳은 API-17과 함께). 운행 취소 CANCEL·고객 취소 USER_CANCEL은 담당이 정해질 때까지 그대로 보냄 | 작업 지시 (10/27). CANCEL·USER_CANCEL 보내는 쪽은 답 대기 |
| 결과 화면 재확인: 결제 대기(pending·authenticating)면 30초 간격 3번, 그래도 대기면 '결제를 확인하고 있어요' 안내(확정되면 예약 조회에 나옴) | 작업 지시 (10/27) |
| 승하차 가능 범위를 삿포로 중심(TV탑 부근 43.0621, 141.3544) 반경 **12km → 3km**로 (10/29 **5km**로 바뀜, 아래 행): 서버 `service_area`(Alembic `0004`, `seed/demo_data.json`), 화면 `data.ts` `ZONES_STRICT`. 삿포로역·오도리·스스키노·나카지마 공원까지 들어가고 마루야마(약 3.2km)·삿포로돔·신삿포로는 빠짐. 이미 있는 예약은 다시 검사하지 않음 | 팀 결정 (2026-10-27): 합승 버스 정차를 도심에 모아 승차 시간을 줄임. 운영사 확인은 질문표 10번 |
| **영문 이름은 하이픈만 허용**: 여권 표기 그대로, 이름 안 하이픈(-) 허용, 아포스트로피(') 불가, 하이픈으로 시작·끝 불가. 대문자·성·이름 각각 필수·합쳐서 60자 이하는 그대로. 대표자·동반자, 예약(API-10)·오타 수정(API-13, S-13) 모두 같은 규칙: 서버 `services/booking.py` `NAME_EN`, 화면 `screens/InfoForm.tsx` `V21`·`VPART`·`upper`. 안내 예시는 KIM MIN-JI. 이미 저장된 예약 데이터는 바꾸지 않음 | **운영사 답변 (2026-10-29)** |
| **승하차 범위 반경 5km**: 중심은 그대로 43.0621, 141.3544 (삿포로 TV탑 부근, 오도리 공원 동쪽 끝). 값은 `settings.py` `SERVICE_AREA` · `packages/shared` `SETTINGS.SERVICE_AREA`(화면 `data.ts` `ZONES_STRICT`가 읽음, 홈 안내 {r}도 이 값) · `service_area`(시드, 이미 만든 DB는 Alembic `0005`). 판정 함수 `in_area`·`inArea`는 숫자 없이 범위 데이터를 읽음. 시드 = 설정값을 테스트로 확인. 삿포로역·오도리·스스키노·마루야마공원역(3.2km) 안, 삿포로돔(6.9km)·신치토세공항(40km) 밖. 공항·리조트 호텔 같은 예외 장소는 아직 없음 | **운영사 답변 (2026-10-29)** |
| **승차 시간 등록 기한은 설정값** `PICKUP_REGISTER_DUE_DAYS = 3`: 출발 확정(판정일, 출발 7일 전)부터 **출발 3일 전까지** 등록 (`settings.py`·`packages/shared`). 판정 일수(`JUDGE_DAYS`)보다 작아야 하고, 아니면 서버가 켜질 때 오류. 지금 쓰는 곳은 없음: API-17은 틀만이고 예약 상세에 '안내 예정일' 계산이 없어 화면 문구는 늘리지 않음. 판정일이 주말에 걸리면 실제 작업일이 4~5일보다 짧을 수 있음 | **운영사 답변 (2026-10-29)**: 그때 사정에 따라 달라 값을 정하지 않음. '확정 후 7일 안'은 마감이 출발일과 같아져서, 손님이 출발 3일 전에는 알도록 **팀 결정 (10/29)**. 운영사에 알릴 것 |
| **고객센터 임시값**: 전화 00-0000-000, 이메일 golf@travender-hokkaido.com, 운영 시간 10:00~17:00. 서버 `settings.SUPPORT`(`.env` `SUPPORT_TEL`·`SUPPORT_EMAIL`이 있으면 그 값), 화면 `packages/shared` `SUPPORT`·`data.ts` `SUPPORT_TEL`·`SUPPORT_MAIL`. 화면 '예시 번호' 표시는 실제 번호를 받을 때까지 그대로. 메일 하단도 `settings.SUPPORT`를 읽어 임시값이 나옴 | **운영사 답변 (2026-10-29)** |
| 패키지 데이터 구조는 지금 항목으로 진행: 기본 정보(이름·박 수·출발 요일·판매 기간·1인 가격), 일정, 숙박·객실 옵션과 1인실 추가 요금, 출발편 정원, 소개(사진·설명·태그). 항목을 더할 때 고칠 곳은 아래 '패키지 항목을 더할 때' | **운영사 답변 (2026-10-29)** |

## 4. 답을 기다리는 것 (막히는 곳)

운영사에 보낸 질문표: [operator-questions-2026-10-26.md](operator-questions-2026-10-26.md) (13개). 번호는 질문표 번호. 15~19는 본 사이트 결제 연동(10/27)에서 생긴 질문 (질문표에 아직 없음).
10/29 운영사 답변으로 확정된 항목은 아래 '정리됨'으로 옮김.

| # | 질문 | 관련 코드 |
|---|---|---|
| 5 | 최소 출발 인원 (**운영사 확인 중**, 지금은 20명. 정원 20 = 최소 20이라 20석이 다 차야 출발) | `settings.py` `BUS_SEATS`·`MIN_DEPARTURE` (화면 `data.ts`·`packages/shared`), `rules.py` `departure_view` |
| 6 | 로그인 연동 자료 (**조교님과 상의 후 전달**). 지금은 작업 지시(10/27)대로 `user_session` 쿠키 → 본 사이트 `/api/partner/session` | `adapters/auth.py`, 화면 `api/sync.ts` `loadMe` |
| 13 | Google 지도 키·비용 (**조교님과 상의 후 전달**) | 화면 `apps/web/.env.local` `VITE_GOOGLE_MAPS_API_KEY`, `gmaps.ts` `MAP_ID`, API-05 (틀만) |
| 3 | 희망 승차 시간 범위: 첫 티오프 2시간 30분 전 ~ 티오프 − 이동 − 30분 (팀 결정 10/20). 10/29 답변에 없음 | 서버 `settings.py` `PICK_EARLIEST_BEFORE_TEE_MIN`·`PICK_MARGIN_MIN`, `services/booking.py` `stop_time_range` / 화면 `logic.ts` `stopTimeRange` |
| 7 | 결제·환불 연동 **Partner API 사양서 원본** (`docs/partner-api-golf.md`는 작업 지시만 있음): 키 헤더 이름·응답 모양·오류 본문 | `adapters/partner.py` 맨 위 '가정' 목록 |
| 14 | 리조트 패키지 승하차 범위·예외 장소 (10/29: 예외 장소는 지금 만들지 않음) | 아래 '리조트 패키지 승하차 범위' 참고 |
| 15 | 본 사이트 주문 만료 시간 (그동안 좌석 유지) | `adapters/partner.py` 주문 상태, `jobs` `check_payments` |
| 16 | 고객 취소 수수료 (지금은 전액 환불만) | `services/booking.py` `cancel_by_user` → `refund_booking("customer_cancel")` |
| 18 | API-19(본 사이트 → 고객 취소 결과)가 계속 필요한지 + 보안 방식 | `routes.py` `site_cancel` (`X-Site-Key` = `SITE_KEY`) |
| 19 | 본 사이트 테스트 서버 주소·API 키 | `.env` `PARTNER_API_BASE`·`PARTNER_API_KEY` → `PAYMENT_BACKEND=partner` |
| 11 | 안내 메일 보내는 주소 — **다른 팀원 담당** | `adapters/mail.py` |
| 17 | 운행 취소·고객 취소 메일(CANCEL·USER_CANCEL) 보내는 쪽 — **다른 팀원 담당** | `adapters/mail.py` |

### 패키지 항목을 더할 때 고칠 곳 (10/29, 코드는 그대로)

예: 패키지에 '태그'를 더한다면 아래를 차례로 고칩니다. 한 곳이라도 빠지면 서버와 화면 값이 어긋납니다.

1. **테이블**: Alembic 새 버전으로 `package`에 칸 추가 (`schema_0001.sql`은 처음 만들 때만). 여러 개 값(태그·사진 여러 장)이면 `package_tag (package_id, tag)`처럼 표를 따로. 시드 `seed/demo_data.json` `packages`에도 값
2. **상품 가져오기 검사**: API-15 / B-05 (`routes.py` `admin_import`, 지금 틀만). 운영 시트 칸 → 테이블 칸 대응과 필수·형식 검사를 여기에 추가
3. **API 응답**: `services/catalog.py` `PKG_SQL`(SELECT), `list_item`(목록·상세 공통), `get_package`(상세만). 검색에 쓰려면 `PKG_SQL`의 `search_text`, 거르기에 쓰려면 `search_packages`. 응답 타입 `packages/shared/src/api.ts` `PackageListItem`·`PackageDetailRes`
4. **화면**: 지금은 상품 내용이 아직 브라우저 데이터(`data.ts` `Pkg`·`PKGS`, 2장 '남은 순서' 1번)라 `Pkg` 타입·데이터와 쓰는 화면(`Detail.tsx` S-03, `List.tsx` 카드, `Compare.tsx` S-04)을 같이 고침. API-02 연결 후에는 응답 타입만 보면 됨
5. **문구**: 새 항목 이름·라벨은 `i18n.ts` 한국어·일본어

지금 구조와 다른 점 (항목은 확정됐지만 데이터 자리가 부족한 것):
- **태그**: 칸이 없음 (`search_kw` 영문 검색어, `is_recommended` 추천만). 위 1~4로 추가 필요
- **사진**: `photo_url` 한 장. 화면은 `photos[]` 여러 장 → 사진 표 또는 JSON 칸 필요
- **출발편 정원**: 지금은 모든 출발편이 `settings.BUS_SEATS`(20). 패키지별로 다르면 `package.capacity`를 두고 `services/departures.py` `generate_departures`가 그 값을 쓰게 (출발편 행에는 이미 `departure.capacity`가 있어 판정·잔여석은 그대로 동작)
- **판매 기간**: `season_from`·`season_to`(해마다 반복 MM-DD). 특정 연도 기간이 필요하면 칸 추가

### 리조트 패키지 승하차 범위 — 지금 구조와 바꾸는 방법 (구현 안 함)

- **지금**: 승하차 범위(`service_area`)는 패키지와 연결이 없는 공통 목록입니다. 서버 `services/booking.py` `_area_of`는 모든 범위를 차례로 검사하고, 화면도 같은 범위(`ZONES_STRICT`) 하나만 씁니다. 그래서 **리조트 패키지만 범위를 다르게 줄 수 없습니다.**
- **바꾸는 방법 (의견)**
  1. 패키지 ↔ 범위 연결 표 `package_service_area (package_id, area_id)`를 추가합니다. 연결이 없는 패키지는 지금처럼 공통 범위(SAPPORO)를 씁니다. 리조트 패키지는 리조트 주변 범위를 따로 `service_area`에 넣고 연결합니다.
  2. 범위 밖이어도 허용할 예외 장소(리조트 호텔, 공항 등)는 `package_allowed_place (package_id, name, lat, lng, place_id)`로 둡니다. 화면 S-06에 '이 패키지에서 고를 수 있는 장소'로 보여 줍니다.
  3. 서버 `_area_of(c, pt)` → `_area_of(c, pt, package_id)`로 바꿔 그 패키지에 연결된 범위와 예외 장소만 검사합니다(API-06에도 `packageId` 추가). 이동 시간 대략값 표 `TRAVEL_MIN`에도 리조트 범위 행을 추가합니다.
  4. 화면은 API-02(패키지 상세) 응답에 그 패키지의 범위·예외 장소를 넣어 받고, `ZONES_STRICT` 대신 그것을 씁니다. 상품 내용 API 연결(2장 1번)과 같이 하면 됩니다.

### 법무 확인

| 질문 | 관련 코드 |
|---|---|
| 한국 고객 개인정보를 일본 쪽에서 처리할 때 예약 화면에서 국외 이전 동의를 따로 받아야 하는지 | 화면 `screens/InfoForm.tsx` 동의 항목(지금 '취소 규정'·'합승 안내' 2개) |

### 정리됨 (더 묻지 않음)

| 항목 | 정리 내용 |
|---|---|
| 본 사이트 기술·DB 환경 (이전 Q-31·Q-32) | 답 받음: '테스트 서버에서 완성 후 본 서버로 이전', 'DB는 따로 정하지 않음, 현 상태 유지' → 지금 구성(FastAPI + MySQL) 유지, `.env` `APP_ENV`로 구분할 자리만 둠 |
| 같은 출발편 중복 예약 처리 | 팀이 정할 일: 지금처럼 확인 창 + '다른 일행으로 계속' (S-08, API-11 `?departureId=`) |
| 서비스 이름 | 이번 질문에서 뺌. 임시 이름 'TRAVENDER Golf'(`data.ts` `SERVICE_NAME`)를 그대로 씀 |
| 판정일과 동반자 명단 마감이 같은 날 | 명단 입력 요청 메일(B-06)을 없애 문제가 사라짐 (동반자 이름은 예약 때 모두 받음, 팀 결정 10/23) |
| API-19 실제 인증 방식 | 질문표 7번(결제·환불 연동)에 합침 |
| 1. 동반자 영문 이름 예약 때 모두 필수 | **운영사 확정 10/29** (3장) |
| 2. 영문 이름 규칙 | **운영사 확정 10/29**: 하이픈만 허용 (3장) |
| 4. 희망 하차 시간 선택 | **운영사 확정 10/29** (3장) |
| 8. 상품 데이터 형식 | **운영사 확정 10/29**: 지금 항목으로 진행 (4장 '패키지 항목을 더할 때') |
| 9. 승차 시간 등록 시점 | **운영사 10/29**: 설정값 `PICKUP_REGISTER_DUE_DAYS` = 출발 3일 전까지 (3장) |
| 10. 승하차 범위 | **운영사 확정 10/29**: 반경 5km (3장) |
| 12. 고객센터 연락처 | **운영사 10/29**: 임시값 (3장). 실제 번호 받으면 설정값만 바꿈 |
