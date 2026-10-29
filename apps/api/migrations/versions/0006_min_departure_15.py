"""최소 출발 인원: 20 → 15 (테스트용, 팀 결정 10/29). 운영 값으로 되돌릴 때는 downgrade

새 출발편은 settings.MIN_DEPARTURE 로 만들고, 이미 만든 모집 중(OPEN) 출발편의 min_people 도 같게. 판정이 끝난 출발편은 그대로

Revision ID: 0006
"""
from alembic import op

revision = "0006"
down_revision = "0005"


def upgrade() -> None:
    op.execute("ALTER TABLE departure ALTER COLUMN min_people SET DEFAULT 15")
    op.execute("UPDATE departure SET min_people = 15 WHERE status = 'OPEN'")


def downgrade() -> None:
    op.execute("ALTER TABLE departure ALTER COLUMN min_people SET DEFAULT 20")
    op.execute("UPDATE departure SET min_people = 20 WHERE status = 'OPEN'")
