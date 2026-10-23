"""실행: uvicorn app.main:app --reload --port 8787  (apps/api 폴더에서)"""
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import errors
from .routes import router

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="홋카이도 골프투어 API", version="0.1.0", docs_url="/api/golf/docs", openapi_url="/api/golf/openapi.json")
errors.install(app)
app.include_router(router)


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
