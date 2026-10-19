"""DB 연결 (SQLAlchemy Core + SQL). 잠금·트랜잭션이 설계서(L-07, L-08)와 1:1로 보이도록 ORM 대신 SQL을 씀.
시각은 모두 UTC로 저장 (세션 time_zone = +00:00), 화면 표시는 JST."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Connection

from .config import env

engine = create_engine(env.DATABASE_URL, pool_pre_ping=True, pool_size=10, isolation_level="READ COMMITTED")


@event.listens_for(engine, "connect")
def _on_connect(dbapi_conn, _):
    with dbapi_conn.cursor() as c:
        c.execute("SET time_zone = '+00:00'")


def _plain(v: Any) -> Any:
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, datetime):
        return v.isoformat() + "Z"
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, timedelta):  # MySQL TIME → timedelta
        m = int(v.total_seconds()) // 60
        return f"{m // 60:02d}:{m % 60:02d}"
    if isinstance(v, time):
        return v.strftime("%H:%M")
    return v


def rows(c: Connection, sql: str, **args) -> list[dict]:
    return [{k: _plain(v) for k, v in r.items()} for r in c.execute(text(sql), args).mappings()]


def one(c: Connection, sql: str, **args) -> dict | None:
    r = rows(c, sql, **args)
    return r[0] if r else None


def run(c: Connection, sql: str, **args) -> int:
    return c.execute(text(sql), args).rowcount


@contextmanager
def tx() -> Iterator[Connection]:
    """트랜잭션. 안에서 오류가 나면 롤백"""
    with engine.begin() as c:
        yield c


@contextmanager
def conn() -> Iterator[Connection]:
    """조회용 (자동 커밋)"""
    with engine.connect() as c:
        yield c
        c.commit()
