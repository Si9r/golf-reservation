"""메일 발송 (이 서비스가 보냄, Q-18 결정 / 질문 Q-30). 결과는 notification 테이블에 기록"""
from __future__ import annotations

import logging

from sqlalchemy.engine import Connection

from ..config import env
from ..db import run

log = logging.getLogger("golf.mail")


class ConsoleMail:
    def send(self, to: str, kind: str, data: dict) -> None:
        log.info("[mail] %s → %s %s", kind, to, data)


mail = ConsoleMail() if env.MAIL_PROVIDER == "console" else ConsoleMail()  # TODO: 실제 발송 어댑터 (SES 등)


def notify(c: Connection, booking_no: str, to: str, kind: str, **data) -> None:
    """메일을 보내고 notification에 기록. 실패해도 예약 처리는 되돌리지 않음"""
    try:
        mail.send(to, kind, {"bookingNo": booking_no, **data})
        run(c, "INSERT INTO notification (booking_no, kind, result) VALUES (:no, :k, 'OK')", no=booking_no, k=kind)
    except Exception as e:  # noqa: BLE001
        run(c, "INSERT INTO notification (booking_no, kind, result, error) VALUES (:no, :k, 'FAIL', :e)", no=booking_no, k=kind, e=str(e)[:200])
