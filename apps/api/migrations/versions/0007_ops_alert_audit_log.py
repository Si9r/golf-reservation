"""운영자 알림·운영 작업 기록 (상세설계 v1.7 L-22·L-24, 11/09)

- notification: booking_no NULL 허용 + departure_id + body
  출발 판정 실패처럼 예약이 없는 운영자 알림(OPS_ALERT)도 남김. error 는 200자라 알림 전체 내용은 body 에
- audit_log: 운영 키(ADMIN)·본 사이트 키(SITE)·배치(BATCH:B-xx)가 데이터를 바꿀 때 한 줄. 개인정보는 넣지 않음
- booking.people CHECK 1~30 → 1~20 (정원·한 예약 최대 20명, 운영사 확정 10/19)

Revision ID: 0007
"""
from alembic import op

revision = "0007"
down_revision = "0006"


def upgrade() -> None:
    op.execute("ALTER TABLE notification MODIFY booking_no VARCHAR(20) NULL")
    op.execute("ALTER TABLE notification ADD COLUMN departure_id VARCHAR(30) NULL AFTER booking_no")
    op.execute("ALTER TABLE notification ADD COLUMN body TEXT NULL AFTER error")
    op.execute("ALTER TABLE notification ADD KEY notification_dep_idx (departure_id)")
    op.execute("ALTER TABLE notification ADD CONSTRAINT notification_dep_fk FOREIGN KEY (departure_id) REFERENCES departure(id)")
    op.execute("""CREATE TABLE audit_log (
      id      BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
      at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      actor   VARCHAR(20) NOT NULL,
      action  VARCHAR(20) NOT NULL,
      target  VARCHAR(60) NULL,
      detail  JSON        NULL,
      result  VARCHAR(10) NOT NULL,
      KEY audit_at_idx (at),
      KEY audit_target_idx (target),
      CONSTRAINT audit_result_chk CHECK (result IN ('OK','FAIL'))
    )""")
    op.execute("ALTER TABLE booking DROP CHECK booking_people_chk")
    op.execute("ALTER TABLE booking ADD CONSTRAINT booking_people_chk CHECK (people BETWEEN 1 AND 20)")


def downgrade() -> None:
    op.execute("ALTER TABLE booking DROP CHECK booking_people_chk")
    op.execute("ALTER TABLE booking ADD CONSTRAINT booking_people_chk CHECK (people BETWEEN 1 AND 30)")
    op.execute("DROP TABLE audit_log")
    op.execute("ALTER TABLE notification DROP FOREIGN KEY notification_dep_fk")
    op.execute("ALTER TABLE notification DROP KEY notification_dep_idx")
    op.execute("ALTER TABLE notification DROP COLUMN body")
    op.execute("ALTER TABLE notification DROP COLUMN departure_id")
    op.execute("DELETE FROM notification WHERE booking_no IS NULL")
    op.execute("ALTER TABLE notification MODIFY booking_no VARCHAR(20) NOT NULL")
