"""안내 메일 발송 — 이 서비스가 직접 보냄 (운영사 확정 10/26, 질문 Q-30). 메일 보내는 곳은 여기 한 곳.
- MAIL_BACKEND=log (기본): 실제로 보내지 않고 로그만 남김
- MAIL_BACKEND=smtp: SMTP로 실제 발송 (보내는 주소 MAIL_FROM 은 TRAVENDER 홋카이도 도메인으로 새로 만들 예정 → .env 설정값)
발송 결과는 notification 테이블에 OK / FAIL 로 기록. 실패해도 예약 처리는 되돌리지 않음

누가 보내나 (본 사이트 결제 연동 10/27)
- 예약 확정(결제 완료) CONFIRM: 본 사이트가 보냄 → 골프는 보내지 않음 (apply_order 에서 부르지 않음, 템플릿은 남김)
- 출발 확정 GO · 승차 시간 PICKUP: 골프가 보냄 (PICKUP 은 승차 시간 등록 API-17 이 구현되면 그곳에서 부름)
- 운행 취소 CANCEL · 고객 취소 USER_CANCEL: 누가 보낼지 확인 중 → 지금은 골프가 그대로 보냄"""
from __future__ import annotations

import logging
import smtplib
from datetime import date
from email.message import EmailMessage
from email.utils import formataddr
from typing import Protocol

from sqlalchemy.engine import Connection

from .. import settings as S
from ..config import env
from ..db import one, run

log = logging.getLogger("golf.mail")


class MailBackend(Protocol):
    def send(self, to: str, subject: str, body: str) -> None: ...


class LogMail:
    """실제로 보내지 않고 기록만 (개발·테스트 기본값)"""

    def send(self, to: str, subject: str, body: str) -> None:
        log.info("[mail] → %s | %s\n%s", to, subject, body)


class SmtpMail:
    """SMTP 발송. SMTP_SECURITY: starttls (기본, 587) | ssl (465) | none"""

    def send(self, to: str, subject: str, body: str) -> None:
        if not env.MAIL_FROM:
            raise RuntimeError("MAIL_FROM 이 비어 있음 (.env)")
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = formataddr((env.MAIL_FROM_NAME, env.MAIL_FROM)) if env.MAIL_FROM_NAME else env.MAIL_FROM
        msg["To"] = to
        msg.set_content(body)
        sec = env.SMTP_SECURITY.lower()
        cls = smtplib.SMTP_SSL if sec == "ssl" else smtplib.SMTP
        with cls(env.SMTP_HOST, env.SMTP_PORT, timeout=15) as s:
            if sec == "starttls":
                s.starttls()
            if env.SMTP_USER:
                s.login(env.SMTP_USER, env.SMTP_PASSWORD)
            s.send_message(msg)


def make_backend() -> MailBackend:
    return SmtpMail() if env.MAIL_BACKEND.lower() == "smtp" else LogMail()


mail: MailBackend = make_backend()


# ---------- 템플릿 (한국어) ----------
def _yen(n: int) -> str:
    return f"¥{n:,}"


def _day(d: str) -> str:
    """'2026-10-30' → '2026년 10월 30일(금)'"""
    x = date.fromisoformat(d)
    return f"{x.year}년 {x.month}월 {x.day}일({'월화수목금토일'[x.weekday()]})"


def _footer() -> str:
    sup = S.SUPPORT
    lines = ["", "문의: TRAVENDER 골프 고객센터"]
    if sup.get("tel"):
        lines.append(f"전화 {sup['tel']}")
    if sup.get("email"):
        lines.append(f"이메일 {sup['email']}")
    lines.append(f"운영 시간 {sup['hours']} (일본 시간)")
    lines.append("문의하실 때 예약번호를 알려 주세요.")
    return "\n".join(lines)


def _summary(b: dict) -> str:
    return "\n".join([
        f"예약번호: {b['no']}",
        f"패키지: {b['package_name']}",
        f"출발일: {_day(b['dep_date'])}",
        f"인원: {b['people']}명",
        f"결제 금액: {_yen(b['total'])} (버스·픽업·송영 포함)",
    ])


def render(kind: str, b: dict) -> tuple[str, str]:
    """메일 제목·본문. b: no · package_name · dep_date · people · total · judge_date · name (PICKUP 은 pickup_time · pick_place 도)"""
    hello = f"{b['name']} 님, 안녕하세요. TRAVENDER 홋카이도 골프입니다." if b.get("name") else "안녕하세요. TRAVENDER 홋카이도 골프입니다."
    if kind == "CONFIRM":
        subject = f"[TRAVENDER 골프] 예약이 확정되었습니다 ({b['no']})"
        lines = [hello, "", "결제가 완료되어 예약이 확정되었습니다.", "", _summary(b), "",
                 "다른 그룹과 함께 타는 합승 버스입니다. "
                 f"{_day(b['judge_date'])}에 같은 출발편 인원이 {S.MIN_DEPARTURE}명 이상이면 출발이 확정되고, "
                 "모이지 않으면 운행이 취소되며 결제 금액은 전액 환불됩니다. 결과는 이메일로 알려 드립니다.",
                 "실제 승차 시간은 출발이 확정된 뒤 안내해 드립니다.",
                 f"동반자 영문 이름은 출발 {S.COMPANION_DUE_DAYS}일 전까지 예약 상세에서 고칠 수 있습니다."]
    elif kind == "GO":
        subject = f"[TRAVENDER 골프] 출발이 확정되었습니다 ({b['no']})"
        lines = [hello, "", f"같은 출발편 인원이 {S.MIN_DEPARTURE}명 이상 모여 출발이 확정되었습니다.", "", _summary(b), "",
                 "실제 승차 시간과 장소는 따로 안내해 드립니다. 예약 상세에서도 확인할 수 있습니다."]
    elif kind == "CANCEL":
        subject = f"[TRAVENDER 골프] 운행이 취소되었습니다 ({b['no']})"
        lines = [hello, "", f"죄송합니다. 출발 {S.JUDGE_DAYS}일 전까지 같은 출발편 인원이 {S.MIN_DEPARTURE}명에 이르지 않아 운행이 취소되었습니다.",
                 "", _summary(b), "",
                 f"결제하신 금액 {_yen(b['total'])}은 전액 환불됩니다. 환불은 결제하신 수단으로 처리되며, "
                 "카드사에 따라 반영까지 시간이 걸릴 수 있습니다."]
    elif kind == "PICKUP":
        subject = f"[TRAVENDER 골프] 승차 시간 안내 ({b['no']})"
        lines = [hello, "", "출발일의 승차 시간과 장소를 알려 드립니다.", "",
                 f"승차: {_day(b['dep_date'])} {b.get('pickup_time') or '-'}", f"장소: {b.get('pick_place') or '-'}", "", _summary(b), "",
                 "합승 버스는 여러 그룹을 차례로 태우므로 승차 시간 5분 전까지 장소에 와 주세요. "
                 "도로 상황에 따라 버스가 조금 늦을 수 있습니다."]
    elif kind == "USER_CANCEL":
        subject = f"[TRAVENDER 골프] 예약 취소가 처리되었습니다 ({b['no']})"
        lines = [hello, "", "요청하신 예약 취소가 처리되었습니다.", "", _summary(b), "",
                 "환불 금액과 진행 상황은 TRAVENDER 본 사이트의 취소·환불 규정에 따라 처리되며, 본 사이트에서 확인할 수 있습니다."]
    else:
        raise ValueError(f"알 수 없는 메일 종류: {kind}")
    return subject, "\n".join(lines) + "\n" + _footer()


def _booking_info(c: Connection, booking_no: str) -> dict:
    r = one(c, """SELECT b.no, b.people, b.total_price total, d.dep_date, d.judge_date, p.name_ko package_name, m.name_ko name,
                         s.pickup_time, s.place_name pick_place
                  FROM booking b JOIN departure d ON d.id = b.departure_id JOIN package p ON p.id = d.package_id
                  LEFT JOIN booking_member m ON m.booking_no = b.no AND m.seq = 1
                  LEFT JOIN booking_stop s ON s.booking_no = b.no AND s.kind = 'PICK'
                  WHERE b.no = :no""", no=booking_no)
    if not r:
        raise LookupError(f"예약 없음 {booking_no}")
    return r


def notify(c: Connection, booking_no: str, to: str, kind: str, **_: object) -> None:
    """kind(CONFIRM · GO · CANCEL · USER_CANCEL) 메일을 만들어 보내고 notification 에 기록. 실패해도 예약 처리는 되돌리지 않음"""
    try:
        subject, body = render(kind, _booking_info(c, booking_no))
        mail.send(to, subject, body)
        run(c, "INSERT INTO notification (booking_no, kind, result) VALUES (:no, :k, 'OK')", no=booking_no, k=kind)
    except Exception as e:  # noqa: BLE001
        log.warning("mail failed %s %s: %s", booking_no, kind, e)
        run(c, "INSERT INTO notification (booking_no, kind, result, error) VALUES (:no, :k, 'FAIL', :e)", no=booking_no, k=kind, e=str(e)[:200])


def alert_ops(c: Connection, booking_no: str, text: str) -> None:
    """운영자 알림 (환불 실패 등): notification 에 OPS_ALERT 로 남기고 OPS_EMAIL 이 있으면 메일. 실패해도 처리는 계속"""
    log.warning("[ops] %s %s", booking_no, text)
    try:
        if env.OPS_EMAIL:
            mail.send(env.OPS_EMAIL, f"[TRAVENDER 골프 운영 알림] {booking_no}", text)
        run(c, "INSERT INTO notification (booking_no, kind, result, error) VALUES (:no, 'OPS_ALERT', 'OK', :e)", no=booking_no, e=text[:200])
    except Exception as e:  # noqa: BLE001
        run(c, "INSERT INTO notification (booking_no, kind, result, error) VALUES (:no, 'OPS_ALERT', 'FAIL', :e)", no=booking_no, e=f"{text} / {e}"[:200])
