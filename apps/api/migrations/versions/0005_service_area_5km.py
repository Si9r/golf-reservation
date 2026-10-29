"""승하차 가능 범위: 반경 3km → 5km (운영사 확정 10/29). 중심은 그대로 (43.0621, 141.3544, 삿포로 TV탑 부근)

이미 만든 DB의 service_area 를 settings.SERVICE_AREA 와 같게 (새 DB는 seed/demo_data.json). 이미 있는 예약의 승하차 장소는 다시 검사하지 않음

Revision ID: 0005
"""
from alembic import op

revision = "0005"
down_revision = "0004"


def upgrade() -> None:
    op.execute("UPDATE service_area SET shape = JSON_SET(shape, '$.r', 5000) WHERE id = 'SAPPORO' AND JSON_UNQUOTE(JSON_EXTRACT(shape, '$.type')) = 'circle'")


def downgrade() -> None:
    op.execute("UPDATE service_area SET shape = JSON_SET(shape, '$.r', 3000) WHERE id = 'SAPPORO' AND JSON_UNQUOTE(JSON_EXTRACT(shape, '$.type')) = 'circle'")
