"""오늘 날짜 (JST). 테스트·데모는 FIXED_TODAY로 고정"""
from datetime import datetime, timedelta, timezone

from .config import env

_fixed = env.FIXED_TODAY


def today() -> str:
    if _fixed:
        return _fixed
    return (datetime.now(timezone.utc) + timedelta(hours=9)).date().isoformat()


def set_today(d: str) -> None:  # 테스트용
    global _fixed
    _fixed = d
