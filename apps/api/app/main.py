"""실행: uvicorn app.main:app --reload --port 8787  (apps/api 폴더에서)"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import errors
from .config import env
from .routes import router

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("golf")

PRODUCTION = env.APP_ENV.lower() == "production"
EXAMPLE_KEYS = ("change-me",)  # .env.example 에 적힌 예시 키 (모두가 아는 값)


def check_production(e) -> None:
    """운영 서버 점검 (TBD-38): 위험한 설정이면 서버를 켜지 않음.
    - 가짜 결제·가짜 로그인(fake): 누구나 결제 없이 예약할 수 있음
    - 운영 키·본 사이트 키가 예시값(change-me): 누구나 고객 취소·환불을 부를 수 있음. 비워 두면 그 API는 모두 거부 (운영 기능을 안 쓰면 비워 둠)"""
    if e.PAYMENT_BACKEND.lower() != "partner":
        raise RuntimeError("APP_ENV=production 에서는 PAYMENT_BACKEND=partner 여야 합니다 (fake = 가짜 결제·가짜 로그인)")
    if e.FIXED_TODAY != "":
        raise RuntimeError("APP_ENV=production 에서는 FIXED_TODAY 를 비워야 합니다")
    for name in ("ADMIN_KEY", "SITE_KEY"):
        if getattr(e, name) in EXAMPLE_KEYS:
            raise RuntimeError(f"APP_ENV=production 에서는 {name} 를 예시값으로 둘 수 없습니다 (쓰지 않으면 비워 두세요)")
    if not e.JOBS_ENABLED:
        log.warning("APP_ENV=production 인데 JOBS_ENABLED=0: 결제 확인·출발 판정·환불 재시도가 자동으로 돌지 않습니다")


if PRODUCTION:
    check_production(env)


@asynccontextmanager
async def lifespan(_: FastAPI):
    stop = None
    if env.JOBS_ENABLED:  # 정기 실행 (10분마다 결제 확인, 09:00 출발 판정 등)
        from .jobs.schedule import start

        stop = start()
    yield
    if stop:
        stop.set()


# API 문서 페이지는 개발·테스트 서버에서만 (운영 서버에서는 경로 자체가 없음: 내부 기능 목록 노출 방지)
app = FastAPI(title="홋카이도 골프투어 API", version="0.1.0",
              docs_url=None if PRODUCTION else "/api/golf/docs", openapi_url=None if PRODUCTION else "/api/golf/openapi.json",
              redoc_url=None, lifespan=lifespan)
errors.install(app)
app.include_router(router)
if env.PAYMENT_BACKEND.lower() == "fake":  # 가짜 결제창은 fake 모드에서만 (partner 모드에는 경로 자체가 없음)
    from .fake_checkout import router as fake_checkout

    app.include_router(fake_checkout)


@app.get("/health")
def health():
    return {"ok": True}


# ---- 화면 (apps/web 빌드 결과) ----
# 저장소 루트에서 npm run build 로 만든 apps/web/dist 를 이 서버가 그대로 내보냄 → http://localhost:8787 에서 메인 화면.
# 화면 주소는 #/golf 방식이라 index.html 하나와 assets 만 있으면 됨. 빌드가 없으면 안내 페이지 (서버를 켠 뒤 빌드해도 바로 반영)
WEB_DIST = Path(__file__).resolve().parents[2] / "web" / "dist"
NO_BUILD = """<!doctype html><meta charset="utf-8"><title>화면 빌드 없음</title>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 16px;line-height:1.7">
<h1 style="font-size:20px">화면 빌드가 아직 없어요</h1>
<p>저장소 루트에서 화면을 빌드한 뒤 이 페이지를 새로고침하세요.</p>
<pre style="background:#f1f3f6;padding:12px;border-radius:8px">$env:VITE_USE_API="1"; npm run build</pre>
<p>화면을 고치면서 볼 때는 개발 서버(<code>npm run dev:web</code> → http://localhost:5173)를 쓰세요. API 문서: <a href="/api/golf/docs">/api/golf/docs</a></p>"""


@app.get("/", include_in_schema=False)
def web_index():
    index = WEB_DIST / "index.html"
    if not index.is_file():
        return HTMLResponse(NO_BUILD)
    return FileResponse(index, headers={"Cache-Control": "no-cache"})  # 다시 빌드하면 바로 새 화면


app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets", check_dir=False), name="web-assets")
