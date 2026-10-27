"""승하차 가능 범위: 삿포로 중심 반경 12km → 3km (팀 결정 10/27, 운영사 확인 질문표 10번)

이미 만든 DB의 service_area 도 맞춤 (새 DB는 seed/demo_data.json 이 3km). 이미 있는 예약의 승하차 장소는 다시 검사하지 않음

Revision ID: 0004
"""
from alembic import op

revision = "0004"
down_revision = "0003"


def upgrade() -> None:
    op.execute("UPDATE service_area SET shape = JSON_SET(shape, '$.r', 3000) WHERE id = 'SAPPORO' AND JSON_UNQUOTE(JSON_EXTRACT(shape, '$.type')) = 'circle'")


def downgrade() -> None:
    op.execute("UPDATE service_area SET shape = JSON_SET(shape, '$.r', 12000) WHERE id = 'SAPPORO' AND JSON_UNQUOTE(JSON_EXTRACT(shape, '$.type')) = 'circle'")
