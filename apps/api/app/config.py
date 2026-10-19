"""환경 설정 (.env). 업무 기준 값은 app/settings.py"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]  # 저장소 루트


class Env(BaseSettings):
    model_config = SettingsConfigDict(env_file=(ROOT / ".env",), extra="ignore")

    DATABASE_URL: str = "mysql+pymysql://golf:golf@localhost:3306/golf?charset=utf8mb4"
    ADMIN_KEY: str = ""
    AUTH_PROVIDER: str = "mock"
    PAYMENT_PROVIDER: str = "mock"
    MAIL_PROVIDER: str = "console"
    FIXED_TODAY: str = ""  # 테스트·데모용 오늘 날짜 고정 (YYYY-MM-DD)


env = Env()
