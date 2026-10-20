# golf-reservation · 홋카이도 골프투어 (seigakusha project)

TRAVENDER 메인 사이트에 붙는 홋카이도 골프 버스 패키지 예약 서비스. 모바일 웹이 기본이고, PC 브라우저(폭 1024px 이상)에서는 넓은 배치로 보여 줌 (N-001).

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

## 서버 구조

백엔드는 **FastAPI + MySQL**, 화면은 **React**입니다. 서버 로직(DB 읽기·쓰기, 예약·잔여석·금액 계산)은 전부 FastAPI가 맡습니다.

```
개발할 때 (서버 2개)

  브라우저 ──▶ localhost:5173  Vite 개발 서버 (Node.js) ── 화면(React) 제공
                  │
                  └─ /api/... 요청은 그대로 넘김 (apps/web/vite.config.ts 의 proxy)
                        ▼
               localhost:8787  FastAPI (uvicorn) ── /api/golf/...
                        ▼
               localhost:3306  MySQL 8  (DB: golf, 테스트용 golf_test)
```

| | 하는 일 | 언어 | 위치 |
|---|---|---|---|
| FastAPI | API 제공, DB 처리, 업무 규칙 계산 | Python | `apps/api` |
| MySQL | 패키지·출발편·예약 저장 | — | 로컬 설치 또는 Docker |
| React | 사용자가 보는 화면. 브라우저에서 실행됨 | TypeScript | `apps/web`, `packages/shared` |
| Node.js | React 화면을 개발·빌드하는 **도구** | — | — |

### 왜 Node.js를 쓰나요

Node.js는 서버로 쓰지 않습니다. React(TypeScript) 코드는 브라우저가 바로 읽을 수 없어서,
HTML/JS로 바꿔 주는 도구(Vite)가 필요한데 그 도구가 Node.js 위에서 돌아갑니다.

- **개발할 때**: `npm run dev:web`이 Vite 개발 서버(5173)를 띄웁니다. 화면 코드를 고치면 브라우저에 바로 반영되고, `/api` 요청은 FastAPI(8787)로 넘겨 줍니다.
- **배포할 때**: `npm run build`로 만든 HTML/JS 파일(`apps/web/dist`)만 있으면 됩니다. 운영 환경에는 Node.js가 필요 없고 FastAPI + MySQL만 있으면 됩니다.

## 처음 실행하기 (Windows 기준)

필요한 것: **Python 3.11 이상**, **Node.js 20 이상**, **MySQL 8.0**.
아래 명령은 PowerShell 기준입니다. Mac/Linux는 [Mac / Linux](#mac--linux) 참고.

### 1. 프로그램 설치

```powershell
python --version                          # 3.11 이상인지 확인. 낮으면 아래로 설치
winget install --id Python.Python.3.12 -e --scope user
winget install --id OpenJS.NodeJS.LTS -e  # Node.js (npm 포함)
```

설치 후 **VS Code·터미널을 새로 열어야** `py`, `node`, `npm` 명령을 찾습니다.
`py -0`(설치된 Python 목록), `node -v`, `npm -v`로 확인하세요.

MySQL 8.0은 둘 중 하나로 준비합니다.

- **Docker가 있으면**: 저장소 루트에서 `docker compose up -d`. DB·사용자·테스트 DB까지 자동으로 만들어지므로 2번은 건너뜁니다.
- **로컬에 설치하면** ([MySQL Installer](https://dev.mysql.com/downloads/installer/)): Windows 서비스 `MySQL80`이 실행 중인지 확인하고 2번으로.

### 2. DB · 사용자 만들기 (로컬 MySQL만)

`.env.example`의 기본 연결 정보(`golf` / `golf`, DB `golf`)에 맞춰 만듭니다. root 비밀번호를 입력하는 창이 뜹니다.

```powershell
@'
CREATE DATABASE IF NOT EXISTS golf      CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS golf_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'golf'@'localhost' IDENTIFIED BY 'golf';
GRANT ALL ON golf.*      TO 'golf'@'localhost';
GRANT ALL ON golf_test.* TO 'golf'@'localhost';
'@ | mysql -u root -p
```

`mysql` 명령을 못 찾으면 `C:\Program Files\MySQL\MySQL Server 8.0\bin`을 PATH에 넣거나 MySQL Workbench에서 같은 SQL을 실행하세요.

### 3. 환경 설정 파일

```powershell
Copy-Item .env.example .env               # 저장소 루트에서. DB 정보가 다르면 DATABASE_URL 수정
```

### 4. API 서버 (FastAPI)

```powershell
cd apps/api
py -3.12 -m venv .venv                    # 가상환경 만들기 (처음 한 번)
.\.venv\Scripts\Activate.ps1              # 가상환경 켜기 (터미널을 열 때마다)
pip install -r requirements-dev.txt       # 패키지 설치 (처음 한 번, requirements 바뀌면 다시)
alembic upgrade head                      # 테이블 만들기
python -m seed.seed_demo                  # 데모 데이터 (프로토타입 예시 패키지 7개 + 출발편)
uvicorn app.main:app --reload --port 8787
```

- `Activate.ps1`이 "스크립트를 실행할 수 없습니다"로 막히면 한 번만: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
- 확인: http://localhost:8787/health → `{"ok":true}`, http://localhost:8787/api/golf/docs → API 문서 (바로 호출해 볼 수 있음)
- `http://localhost:8787/` 자체는 화면이 없어서 `Not Found`가 정상입니다.

### 5. 화면 (React)

**다른 터미널**을 열고 저장소 루트에서:

```powershell
npm install                               # 처음 한 번, package.json 바뀌면 다시
$env:VITE_USE_API="1"; npm run dev:web    # Mac/Linux: VITE_USE_API=1 npm run dev:web
```

`VITE_USE_API`를 빼면 화면은 API를 쓰지 않고 프로토타입처럼 브라우저 안 데이터로 동작합니다.
지도를 보려면 `apps/web/.env.local`에 `VITE_GOOGLE_MAPS_API_KEY=...`

### 6. 접속

메인 페이지: **http://localhost:5173** (자동으로 `#/golf` 홈 화면으로 이동)

| 화면 | 주소 (`http://localhost:5173` 뒤에) |
|---|---|
| 홈 | `/#/golf` |
| 패키지 목록 (지금 API로 동작, S-02) | `/#/golf/packages` |
| 패키지 상세 | `/#/golf/packages/:id` |
| 비교 | `/#/golf/compare` |
| 내 예약 | `/#/golf/my` |
| 고객 지원 | `/#/golf/support` |
| 로그인 | `/#/login` |

예약 단계 화면(`/#/golf/book/...`)은 상세 화면에서 예약을 진행하면 차례로 넘어갑니다. 전체 목록은 `apps/web/src/App.tsx`.

### 다음부터 실행할 때

터미널 두 개에서:

```powershell
# 1) API
cd apps/api; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8787
# 2) 화면 (저장소 루트)
$env:VITE_USE_API="1"; npm run dev:web
```

### Mac / Linux

순서는 같고 명령만 다릅니다: `cp .env.example .env`, `python3 -m venv .venv && source .venv/bin/activate`, `VITE_USE_API=1 npm run dev:web`.

### 자주 나는 오류

| 오류 | 원인 · 해결 |
|---|---|
| `requires-python >=3.11` / 문법 오류 | Python 버전이 낮음. `py -3.12 -m venv .venv`로 버전을 지정해 가상환경을 다시 만들기 |
| `Access denied for user 'golf'@'localhost'` | DB 사용자가 없음 → 2번 실행. 비밀번호를 바꿨으면 `.env`의 `DATABASE_URL` 수정 |
| `UnicodeDecodeError: 'cp949' codec ...` (alembic) | `alembic.ini`에 한글이 들어감. 한국어 Windows는 이 파일을 cp949로 읽으므로 **alembic.ini에는 영어(ASCII)만** 쓰기 |
| `Cannot find module @rollup/rollup-win32-x64-msvc` | `package-lock.json`에 Windows용 패키지가 빠짐(npm 버그). `node_modules`와 `package-lock.json`을 지우고 `npm install` 후 lock 파일 커밋 |
| `node` / `npm`을 찾을 수 없음 | Node 설치 전에 열린 터미널. VS Code·터미널을 새로 열기 |
| `[Errno 10048] ... 8787` | 이미 API 서버가 떠 있음. 기존 서버를 쓰거나 끄고 다시 실행 |

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
