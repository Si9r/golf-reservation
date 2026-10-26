"""환경 설정 (.env). 업무 기준 값은 app/settings.py"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]  # 저장소 루트


class Env(BaseSettings):
    model_config = SettingsConfigDict(env_file=(ROOT / ".env",), extra="ignore")

    DATABASE_URL: str = "mysql+pymysql://golf:golf@localhost:3306/golf?charset=utf8mb4"
    ADMIN_KEY: str = ""
    SITE_KEY: str = ""  # 본 사이트가 부르는 API(API-19) 키 (헤더 X-Site-Key). 비어 있으면 모두 거부
    AUTH_PROVIDER: str = "mock"
    PAYMENT_PROVIDER: str = "mock"
    # 안내 메일 (adapters/mail.py). log = 보내지 않고 기록만 / smtp = 실제 발송
    MAIL_BACKEND: str = "log"
    MAIL_FROM: str = ""  # 보내는 주소 (TRAVENDER 홋카이도 도메인으로 새로 만들 예정, 확정 대기)
    MAIL_FROM_NAME: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_SECURITY: str = "starttls"  # starttls | ssl | none
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    # 고객센터 연락처 (메일·화면 표시, 확정 대기). 운영 시간은 settings.SUPPORT
    SUPPORT_TEL: str = ""
    SUPPORT_EMAIL: str = ""
    FIXED_TODAY: str = ""  # 테스트·데모용 오늘 날짜 고정 (YYYY-MM-DD)


env = Env()
