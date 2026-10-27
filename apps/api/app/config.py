"""환경 설정 (.env). 업무 기준 값은 app/settings.py"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]  # 저장소 루트


class Env(BaseSettings):
    model_config = SettingsConfigDict(env_file=(ROOT / ".env",), extra="ignore")

    DATABASE_URL: str = "mysql+pymysql://golf:golf@localhost:3306/golf?charset=utf8mb4"
    ADMIN_KEY: str = ""
    SITE_KEY: str = ""  # 본 사이트가 부르는 API(API-19) 키 (헤더 X-Site-Key). 비어 있으면 모두 거부
    # 본 사이트 연동 (adapters/partner.py): fake = 가짜 로그인·결제 (로컬·테스트) / partner = 실제 본 사이트
    PAYMENT_BACKEND: str = "fake"
    PARTNER_API_BASE: str = ""  # 본 사이트 Partner API 주소 (테스트 서버 주소 확정 대기)
    PARTNER_API_KEY: str = ""  # 환경 변수로만. 소스·채팅·이슈에 적지 않음
    PARTNER_TIMEOUT: float = 10
    LOGIN_URL: str = "/login"  # 본 사이트 로그인 (?next=<골프 화면 경로>)
    LOGOUT_URL: str = "/logout"  # 본 사이트 로그아웃
    # 결제를 마치고 돌아올 골프 결과 화면 (본 사이트 주문의 return_url, 절대 주소, {no} = 예약번호)
    PAYMENT_RETURN_URL: str = "http://localhost:8787/#/golf/payment/return?no={no}"
    OPS_EMAIL: str = ""  # 운영자 알림 메일 (환불 실패 등). 비면 기록(notification)·로그만
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
