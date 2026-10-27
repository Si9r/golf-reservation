"""본 사이트 결제 연동 (작업 지시 10/27): 결제 전에 예약을 먼저 만듦

- booking.status 에 PENDING_PAYMENT(결제 대기: 예약번호 발급, 좌석 잡힘)·UNPAID(미결제: 결제 실패·만료, 좌석 풀림) 추가.
  PENDING_PAYMENT 가 15자라 status 칸을 VARCHAR(16)으로
- booking.payment_id → order_id (본 사이트 주문 ID, 중복 불가 유지), order_status(본 사이트 주문 상태 그대로)·order_checked_at(마지막 조회 시각) 추가
- 결제 대기 예약 조회용 status 인덱스

Revision ID: 0003
"""
from alembic import op

revision = "0003"
down_revision = "0002"


def upgrade() -> None:
    op.execute("ALTER TABLE booking DROP CHECK booking_status_chk")
    op.execute("ALTER TABLE booking MODIFY status VARCHAR(16) NOT NULL")
    op.execute("ALTER TABLE booking ADD CONSTRAINT booking_status_chk CHECK (status IN ('PENDING_PAYMENT','UNPAID','CONFIRMED','USER_CANCEL','OP_CANCEL','DONE'))")
    op.execute("ALTER TABLE booking RENAME COLUMN payment_id TO order_id")
    op.execute("ALTER TABLE booking RENAME INDEX booking_payment_uq TO booking_order_uq")
    op.execute("ALTER TABLE booking ADD COLUMN order_status VARCHAR(20) NULL COMMENT '본 사이트 주문 상태 그대로' AFTER order_id")
    op.execute("ALTER TABLE booking ADD COLUMN order_checked_at DATETIME(3) NULL COMMENT '본 사이트 주문 상태를 마지막으로 조회한 시각' AFTER order_status")
    op.execute("ALTER TABLE booking ADD KEY booking_status_idx (status)")


def downgrade() -> None:
    op.execute("DELETE FROM booking WHERE status IN ('PENDING_PAYMENT','UNPAID')")
    op.execute("ALTER TABLE booking DROP KEY booking_status_idx")
    op.execute("ALTER TABLE booking DROP COLUMN order_checked_at")
    op.execute("ALTER TABLE booking DROP COLUMN order_status")
    op.execute("ALTER TABLE booking RENAME INDEX booking_order_uq TO booking_payment_uq")
    op.execute("ALTER TABLE booking RENAME COLUMN order_id TO payment_id")
    op.execute("ALTER TABLE booking DROP CHECK booking_status_chk")
    op.execute("ALTER TABLE booking ADD CONSTRAINT booking_status_chk CHECK (status IN ('CONFIRMED','USER_CANCEL','OP_CANCEL','DONE'))")
    op.execute("ALTER TABLE booking MODIFY status VARCHAR(12) NOT NULL")
