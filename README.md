# golf-reservation · 홋카이도 골프투어 (seigakusha project)

TRAVENDER 메인 사이트에 붙는 홋카이도 골프 버스 패키지 예약 서비스. 모바일 웹 (PC에서도 같은 화면, N-001).

설계 문서(요건 정의서 v1.1 · 기본설계서 v0.4 · 상세설계서 v1.3 · 화면설계서 v2)를 기준으로 만든 **개발 뼈대**입니다.
설계서 ID(API-xx, L-xx, B-xx, V-xx, M-xxx)를 코드 주석에 그대로 적어 두었으니 설계서와 같이 보세요.

## 구성

```
apps/
  api/      API 서버 (Node.js · TypeScript · Fastify · PostgreSQL)
    db/migrations/   테이블 (상세설계 '테이블' 시트)
    src/routes/      API-01 ~ API-18
    src/services/    처리 로직 L-xx
    src/jobs/        정기 실행 B-xx
    src/adapters/    메인 사이트 로그인 · 결제 · 메일 (지금은 가짜 연결)
  web/      화면 (React · Vite). 팀 프로토타입을 옮겨 온 것
packages/
  shared/   서버와 화면이 같이 쓰는 기준 값 · 코드 · 규칙 · API 타입
docs/
  DEVELOPMENT.md   설계서 ID ↔ 코드 위치, 진행 상황, 남은 일, 개발 중 결정
```

## 실행

필요한 것: Node.js 20 이상, PostgreSQL 16 (Docker가 있으면 `docker compose up -d`로 띄움)

```bash
cp .env.example .env
npm install
docker compose up -d          # PostgreSQL (이미 있으면 생략, .env의 DATABASE_URL 확인)
npm run db:migrate            # 테이블 만들기
npm run db:seed               # 데모 데이터 (프로토타입 예시 패키지 7개 + 출발편)
npm run dev:api               # API  http://localhost:8787/api/golf/packages?people=2
VITE_USE_API=1 npm run dev:web  # 화면 http://localhost:5173  (목록 S-02가 API로 동작)
```

`VITE_USE_API`를 빼면 화면은 프로토타입처럼 브라우저 안 데이터로 동작합니다.
지도를 보려면 `apps/web/.env.local`에 `VITE_GOOGLE_MAPS_API_KEY=...`

## 테스트

```bash
npm test        # 규칙 단위 테스트 + 실제 PostgreSQL로 API 통합 테스트 (golf_test DB 필요)
```

통합 테스트는 `postgres://golf:golf@localhost:5432/golf_test`를 비우고 다시 만듭니다 (`TEST_DATABASE_URL`로 변경).
좌석 동시 확보, 결제 실패·금액 불일치, 확보 만료 후 결제, 출발 판정, 고객 취소까지 확인합니다.

## 로그인 · 결제 (가짜 연결)

메인 사이트 연동 방식이 정해지기 전(TBD-03)이라 가짜로 동작합니다.

- 로그인: 요청 헤더 `Authorization: Bearer demo:M0001`
- 결제: 결제 ID가 `PAY-FAIL…`이면 실패, `PAY-AMT…`이면 금액 불일치, 그 외는 성공
- 메일: 콘솔에 출력하고 `notification` 테이블에 기록

정해지면 `apps/api/src/adapters/`에 실제 어댑터를 추가하고 `.env`의 `AUTH_PROVIDER` 등으로 바꿉니다.
