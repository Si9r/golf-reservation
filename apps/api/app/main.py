"""실행: uvicorn app.main:app --reload --port 8787  (apps/api 폴더에서)"""
import logging

from fastapi import FastAPI

from . import errors
from .routes import router

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="홋카이도 골프투어 API", version="0.1.0", docs_url="/api/golf/docs", openapi_url="/api/golf/openapi.json")
errors.install(app)
app.include_router(router)


@app.get("/health")
def health():
    return {"ok": True}
