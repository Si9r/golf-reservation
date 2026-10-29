"""안내 메일 발송 — 이 서비스가 직접 보냄 (운영사 확정 10/26, 질문 Q-30). 메일 보내는 곳은 여기 한 곳.
- MAIL_BACKEND=log (기본): 실제로 보내지 않고 로그만 남김
- MAIL_BACKEND=smtp: SMTP로 실제 발송. 보내는 주소는 모든 메일이 MAIL_FROM = golf-test@resend.dev (config 기본값, 테스트용 Resend, 10/29 지시)
- 테스트 메일: python -m app.mail_samples <받는 주소> (모든 종류를 한 번씩)
발송 결과는 notification 테이블에 OK / FAIL 로 기록. 실패해도 예약 처리는 되돌리지 않음

누가 보내나 (본 사이트 결제 연동 10/27)
- 예약 확정(결제 완료) CONFIRM: 본 사이트가 보냄 → 골프는 보내지 않음 (apply_order 에서 부르지 않음, 템플릿은 남김)
- 출발 확정 GO · 승차 시간 PICKUP: 골프가 보냄 (PICKUP 은 승차 시간 등록 API-17 이 구현되면 그곳에서 부름)
- 운행 취소 CANCEL · 고객 취소 USER_CANCEL: 누가 보낼지 확인 중 → 지금은 골프가 그대로 보냄

어디서 보내나
- GO · CANCEL · USER_CANCEL: services/booking.py send_due_mails 가 '보내야 하는데 아직 못 보낸' 예약을 골라 보냄
  (B-01 판정 직후, 판정 뒤 결제가 끝난 예약(apply_order), B-09 메일 재발송). 고객 취소는 API-16·API-19 가 바로 보내고 실패분만 B-09
- 운영자 알림 OPS_ALERT: 환불 실패(services/booking.py refund_booking) · 출발 판정 실패(jobs judge_departures)"""
from __future__ import annotations

import logging
import smtplib
from datetime import date, datetime, timedelta, timezone
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
    """kind(CONFIRM · GO · CANCEL · PICKUP · USER_CANCEL) 메일을 만들어 보내고 notification 에 기록. 실패해도 예약 처리는 되돌리지 않음"""
    try:
        subject, body = render(kind, _booking_info(c, booking_no))
        mail.send(to, subject, body)
        run(c, "INSERT INTO notification (booking_no, kind, result) VALUES (:no, :k, 'OK')", no=booking_no, k=kind)
    except Exception as e:  # noqa: BLE001
        log.warning("mail failed %s %s: %s", booking_no, kind, e)
        run(c, "INSERT INTO notification (booking_no, kind, result, error) VALUES (:no, :k, 'FAIL', :e)", no=booking_no, k=kind, e=str(e)[:200])


# ---------- 운영자 알림 (OPS_ALERT) ----------
BOOKING_STATUS_KO = {"PENDING_PAYMENT": "결제 대기", "UNPAID": "미결제", "CONFIRMED": "예약 확정", "USER_CANCEL": "고객 취소",
                     "OP_CANCEL": "운행 취소", "DONE": "여행 완료"}
DEP_STATUS_KO = {"OPEN": "모집 중", "GO": "출발 확정", "CANCEL": "운행 취소", "DONE": "여행 완료"}
REFUND_STATUS_KO = {"REQUESTED": "요청함 (처리 중)", "DONE": "완료", "FAIL": "실패"}


def _now_jst() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=9)).strftime("%Y-%m-%d %H:%M")


def _ops_booking(c: Connection, booking_no: str) -> dict | None:
    """알림에 담을 예약·고객(대표자)·본 사이트 주문 정보"""
    return one(c, """SELECT b.no, b.status, b.people, b.total_price total, b.member_id, b.order_id, b.order_status, b.refund_status, b.refund_id,
                            d.id dep_id, d.dep_date, d.status dep_status, p.name_ko package_name,
                            m.name_ko name, m.name_en, m.country_code cc, m.phone, m.email
                     FROM booking b JOIN departure d ON d.id = b.departure_id JOIN package p ON p.id = d.package_id
                     LEFT JOIN booking_member m ON m.booking_no = b.no AND m.seq = 1
                     WHERE b.no = :no""", no=booking_no)


def _ops_departure(c: Connection, dep_id: str) -> dict | None:
    """알림에 담을 출발편 정보"""
    return one(c, """SELECT d.id dep_id, d.dep_date, d.judge_date, d.status dep_status, d.booked_count booked, d.min_people, p.name_ko package_name,
                            (SELECT COUNT(*) FROM booking b WHERE b.departure_id = d.id AND b.status = 'CONFIRMED') confirmed
                     FROM departure d JOIN package p ON p.id = d.package_id WHERE d.id = :id""", id=dep_id)


def render_ops(title: str, detail: str, action: str = "", b: dict | None = None, dep: dict | None = None, at: str | None = None,
               ref: str | None = None) -> tuple[str, str]:
    """운영자 알림 제목·본문. b: 예약 (_ops_booking 형식), dep: 출발편 (_ops_departure 형식), at: 발생 시각 (기본 지금, 일본 시간),
    ref: 정보를 못 찾았을 때 제목에 쓸 예약번호·출발편 ID"""
    ref = b["no"] if b else dep["dep_id"] if dep else ref or "-"
    who = f" · {b['name']} 님" if b and b.get("name") else ""
    subject = f"[TRAVENDER 골프 운영 알림] {title} · {ref}{who}"
    lines = [f"■ {title}", f"발생 시각: {at or _now_jst()} (일본 시간)", "", "■ 무슨 일이 있었나", detail]
    if b:
        tel = " ".join(x for x in (b.get("cc"), b.get("phone")) if x)
        refund = REFUND_STATUS_KO.get(b.get("refund_status") or "", "-") + (f" (환불 ID {b['refund_id']})" if b.get("refund_id") else "")
        lines += ["", "■ 고객 (예약 대표자)",
                  f"이름: {b.get('name') or '-'} ({b.get('name_en') or '-'})",
                  f"이메일: {b.get('email') or '-'}",
                  f"전화: {tel or '-'}",
                  f"본 사이트 회원 ID: {b['member_id']}",
                  "", "■ 예약",
                  f"예약번호: {b['no']} ({BOOKING_STATUS_KO.get(b['status'], b['status'])})",
                  f"패키지: {b['package_name']}",
                  f"출발일: {_day(b['dep_date'])} · 출발편 {b['dep_id']} ({DEP_STATUS_KO.get(b['dep_status'], b['dep_status'])})",
                  f"인원·결제 금액: {b['people']}명 · {_yen(b['total'])}",
                  f"본 사이트 주문: {b.get('order_id') or '-'} (주문 상태 {b.get('order_status') or '-'})",
                  f"환불: {refund}"]
    if dep:
        lines += ["", "■ 출발편",
                  f"출발편: {dep['dep_id']} · {dep['package_name']}",
                  f"출발일: {_day(dep['dep_date'])} (판정일 {_day(dep['judge_date'])})",
                  f"상태: {DEP_STATUS_KO.get(dep['dep_status'], dep['dep_status'])}",
                  f"확정 인원: {dep['booked']}명 / 최소 출발 {dep['min_people']}명 (확정 예약 {dep['confirmed']}건)"]
    if action:
        lines += ["", "■ 해야 할 일", action]
    return subject, "\n".join(lines) + "\n"


def _try(fn, *a):  # noqa: ANN001  알림에 덧붙일 정보: 조회가 실패해도 알림은 보냄
    try:
        return fn(*a)
    except Exception as e:  # noqa: BLE001
        log.warning("ops info lookup failed %s: %s", a[1:], e)
        return None


def alert_ops(c: Connection, booking_no: str | None, title: str, detail: str, action: str = "", about: str | None = None) -> None:
    """운영자 알림 (환불 실패 · 출발 판정 실패): notification 에 OPS_ALERT 로 남기고(error = '제목: 내용') OPS_EMAIL 이 있으면 메일. 실패해도 처리는 계속.
    메일에는 예약이면 고객(대표자)·예약·본 사이트 주문·환불 상태, 출발편이면 출발편 상태·인원을 함께 담음.
    예약이 아닌 일(출발 판정 실패 등)은 booking_no 없이 about(출발편 ID)으로 부름 → notification 에는 못 남기고(예약번호 필수) 로그·메일만"""
    ref = booking_no or about or "-"
    text = f"{title}: {detail}"
    log.warning("[ops] %s %s", ref, text)
    try:
        if env.OPS_EMAIL:
            b = _try(_ops_booking, c, booking_no) if booking_no else None
            dep = _try(_ops_departure, c, about) if about and not booking_no else None
            mail.send(env.OPS_EMAIL, *render_ops(title, detail, action, b, dep, ref=ref))
        if booking_no:
            run(c, "INSERT INTO notification (booking_no, kind, result, error) VALUES (:no, 'OPS_ALERT', 'OK', :e)", no=booking_no, e=text[:200])
    except Exception as e:  # noqa: BLE001
        log.warning("ops mail failed %s: %s", ref, e)
        if booking_no:
            run(c, "INSERT INTO notification (booking_no, kind, result, error) VALUES (:no, 'OPS_ALERT', 'FAIL', :e)", no=booking_no, e=f"{text} / {e}"[:200])
