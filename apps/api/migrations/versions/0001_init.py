"""초기 스키마 (상세설계 v1.3 테이블 + [v2])

Revision ID: 0001
"""
from pathlib import Path

from alembic import op

revision = "0001"
down_revision = None

TABLES = ["notification", "booking_member", "booking_stop", "booking", "booking_seq", "seat_hold", "departure",
          "service_area", "hotel_option", "package_day", "package", "hotel", "golf_course"]


def upgrade() -> None:
    sql = (Path(__file__).parents[1] / "schema_0001.sql").read_text(encoding="utf-8")
    body = "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--"))
    for stmt in body.split(";"):
        if stmt.strip():
            op.execute(stmt)


def downgrade() -> None:
    for t in TABLES:
        op.execute(f"DROP TABLE IF EXISTS {t}")
