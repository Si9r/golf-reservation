"""통합 테스트는 실제 MySQL(golf_test)에 붙음. TEST_DATABASE_URL 로 바꿀 수 있음"""
import os

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "mysql+pymysql://golf:golf@localhost:3306/golf_test?charset=utf8mb4")
os.environ["FIXED_TODAY"] = "2026-10-19"
os.environ["ADMIN_KEY"] = "test-admin"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from pathlib import Path  # noqa: E402
from sqlalchemy import text  # noqa: E402

API = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session", autouse=True)
def database():
    from app.db import engine

    with engine.begin() as c:  # 테스트 DB 비우기
        c.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        for (t,) in c.execute(text("SHOW TABLES")).all():
            c.execute(text(f"DROP TABLE `{t}`"))
        c.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
    cfg = Config(str(API / "alembic.ini"))
    cfg.set_main_option("script_location", str(API / "migrations"))
    command.upgrade(cfg, "head")
    from seed.seed_demo import seed_demo

    seed_demo(fake_booked=False)
    yield


@pytest.fixture()
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def reset():
    from app import clock
    from app.db import tx, run

    clock.set_today("2026-10-19")
    with tx() as c:
        run(c, "DELETE FROM seat_hold")
    yield
