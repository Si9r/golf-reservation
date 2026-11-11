"""고객 취소를 누가 처리했는지 구분: booking.cancel_by 에 SITE 추가 (11/11)

- SITE = 본 사이트에서 손님이 취소하고 본 사이트가 환불한 예약 (API-19). 환불 책임이 본 사이트라 B-07 환불 재시도가 다시 요청하지 않음
- USER = 이 서비스(API-16, 고객센터)가 고객 취소하고 환불을 요청한 예약 → 실패하면 B-07 이 다시 요청
- 이미 있는 API-19 취소 예약은 작업 기록(audit_log SITE_CANCEL)으로 찾아 SITE 로

Revision ID: 0008
"""
from alembic import op

revision = "0008"
down_revision = "0007"


def upgrade() -> None:
    op.execute("ALTER TABLE booking DROP CHECK booking_cancel_by_chk")
    op.execute("ALTER TABLE booking ADD CONSTRAINT booking_cancel_by_chk CHECK (cancel_by IN ('USER','OP','SYSTEM','SITE'))")
    op.execute("""UPDATE booking SET cancel_by = 'SITE' WHERE status = 'USER_CANCEL'
                  AND no IN (SELECT target FROM audit_log WHERE action = 'SITE_CANCEL' AND result = 'OK')""")


def downgrade() -> None:
    op.execute("UPDATE booking SET cancel_by = 'USER' WHERE cancel_by = 'SITE'")
    op.execute("ALTER TABLE booking DROP CHECK booking_cancel_by_chk")
    op.execute("ALTER TABLE booking ADD CONSTRAINT booking_cancel_by_chk CHECK (cancel_by IN ('USER','OP','SYSTEM'))")
