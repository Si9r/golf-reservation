# golf-reservation · 홋카이도 골프투어 (seigakusha project)

TRAVENDER 메인 사이트에 붙는 홋카이도 골프 버스 패키지 예약 서비스. 모바일 웹 (PC에서도 같은 화면, N-001).

설계 문서(요건 정의서 v1.1 · 기본설계서 v0.4 · 상세설계서 v1.3 · 화면설계서 v2)를 기준으로 만든 **개발 뼈대**입니다.
설계서 ID(API-xx, L-xx, B-xx, V-xx, M-xxx)를 코드 주석에 그대로 적어 두었으니 설계서와 같이 보세요.

## 구성

```
apps/
  api/      API 서버 (Python · FastAPI · SQLAlchemy · MySQL 8)
    migrations/      테이블 (Alembic, 상세설계 '테이블' 시트)
    app/routes.py    API-01 ~ API-18
    app/services/    처리 로직 L-xx
    app/rules.py     DB 없이 계산되는 규칙 (출발일·잔여석·금액·범위)
    app/jobs/        정기 실행 B-xx
    app/adapters/    메인 사이트 로그인 · 결제 · 메일 (지금은 가짜 연결)
    tests/           pytest (실제 MySQL로 통합 테스트)
  web/      화면 (React · Vite · TypeScript). 팀 프로토타입을 옮겨 온 것
packages/
  shared/   화면이 쓰는 기준 값 · 규칙(미리 보기용) · API 응답 타입
docs/
  DEVELOPMENT.md   설계서 ID ↔ 코드 위치, 진행 상황, 남은 일, 개발 중 결정
```

## 실행

필요한 것: Python 3.11 이상, Node.js 20 이상, MySQL 8.0 (Docker가 있으면 `docker compose up -d`로 띄움)

```bash
cp .env.example .env
docker compose up -d                    # MySQL (이미 있으면 생략, .env의 DATABASE_URL 확인)

# API 서버
cd apps/api
pip install -r requirements-dev.txt     # 가상환경 권장: python -m venv .venv && source .venv/bin/activate
alembic upgrade head                    # 테이블 만들기
python -m seed.seed_demo                # 데모 데이터 (프로토타입 예시 패키지 7개 + 출발편)
uvicorn app.main:app --reload --port 8787
#   → http://localhost:8787/api/golf/docs  (API 문서, 바로 호출해 볼 수 있음)

# 화면 (다른 터미널, 저장소 루트에서)
npm install
VITE_USE_API=1 npm run dev:web          # http://localhost:5173  (목록 S-02가 API로 동작)
```

`VITE_USE_API`를 빼면 화면은 프로토타입처럼 브라우저 안 데이터로 동작합니다.
지도를 보려면 `apps/web/.env.local`에 `VITE_GOOGLE_MAPS_API_KEY=...`

배치(B-xx)는 `apps/api`에서 `python -m app.jobs B-01` 처럼 실행합니다 (B-01 출발 판정, B-02 좌석 확보 정리, B-03 여행 완료, B-04 출발편 만들기).

## 테스트

```bash
cd apps/api && pytest     # 규칙 단위 테스트 + 실제 MySQL(golf_test)로 API 통합 테스트
npm test                  # 화면 쪽 규칙 (packages/shared)
```

통합 테스트는 `golf_test` DB의 테이블을 모두 지우고 다시 만듭니다 (`TEST_DATABASE_URL`로 변경).
좌석 동시 확보, 결제 실패·금액 불일치, 확보 만료 후 결제, 출발 판정, 고객 취소까지 확인합니다.

## 로그인 · 결제 (가짜 연결)

메인 사이트 연동 방식이 정해지기 전(질문 Q-14·Q-15)이라 가짜로 동작합니다.

- 로그인: 요청 헤더 `Authorization: Bearer demo:M0001`
- 결제: 결제 ID가 `PAY-FAIL…`이면 실패, `PAY-AMT…`이면 금액 불일치, 그 외는 성공
- 메일: 로그로 출력하고 `notification` 테이블에 기록

정해지면 `apps/api/app/adapters/`에 실제 연결을 추가하고 `.env`의 `AUTH_PROVIDER` 등으로 바꿉니다.
