"""운영사 확정 (2026-10-19): 출발편 정원 20 · 판정일 출발 7일 전 · 희망 승하차 시간

- departure.capacity 기본값 30 → 20
- booking_stop.desired_time 추가 (손님 희망 시간, 참고용). pickup_time 은 운영이 확정한 시간이라 따로 둠.
  NULL 허용 (기존 예약, 하차 희망 시간은 선택). 새 예약의 승차 희망 시간은 API에서 필수 검사(V-12)
- 이미 만든 OPEN 출발편도 새 규칙으로: 판정일 = 출발 7일 전, 정원 20 (확정 인원이 20을 넘는 출발편은 정원을 그대로 둠)

Revision ID: 0002
"""
from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade() -> None:
    op.execute("ALTER TABLE departure ALTER COLUMN capacity SET DEFAULT 20")
    op.execute("ALTER TABLE booking_stop ADD COLUMN desired_time TIME NULL COMMENT '손님 희망 승하차 시간 (참고용, V-12)' AFTER memo")
    op.execute("UPDATE departure SET judge_date = DATE_SUB(dep_date, INTERVAL 7 DAY) WHERE status = 'OPEN'")
    op.execute("UPDATE departure SET capacity = 20 WHERE status = 'OPEN' AND booked_count <= 20")


def downgrade() -> None:
    op.execute("UPDATE departure SET capacity = 30 WHERE status = 'OPEN' AND capacity = 20")
    op.execute("UPDATE departure SET judge_date = DATE_SUB(dep_date, INTERVAL 3 DAY) WHERE status = 'OPEN'")
    op.execute("ALTER TABLE booking_stop DROP COLUMN desired_time")
    op.execute("ALTER TABLE departure ALTER COLUMN capacity SET DEFAULT 30")
