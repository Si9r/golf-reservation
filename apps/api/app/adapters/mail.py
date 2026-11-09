"""안내 메일 발송 — 이 서비스가 직접 보냄 (운영사 확정 10/26, 질문 Q-30). 메일 보내는 곳은 여기 한 곳.
- MAIL_BACKEND=log (기본): 실제로 보내지 않고 로그만 남김
- MAIL_BACKEND=smtp: SMTP로 실제 발송. 보내는 주소는 모든 메일이 MAIL_FROM = golf-test@resend.dev (config 기본값, 테스트용 Resend, 10/29 지시)
- 테스트 메일: python -m app.mail_samples <받는 주소> [ja] (모든 종류를 한 번씩)
발송 결과는 notification 테이블에 OK / FAIL 로 기록. 실패해도 예약 처리는 되돌리지 않음
손님 안내는 예약할 때 쓴 언어(booking.lang)로 보냄. 운영자 알림은 한국어만

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


# ---------- 템플릿 (상세설계 v1.7 '메일 템플릿' 시트, 11/09) ----------
# 손님 메일: 예약 언어(booking.lang)로 1통, 텍스트. 제목·본문 구성·변수 형식은 v1.7 ①·③·④·⑤ 그대로.
# CONFIRM 은 본 사이트가 보내 v1.7 에 없음 → 템플릿 확인용으로만 남김 (같은 형식으로 맞춤)
ROOM_KO = {"std": "스탠다드 트윈", "dlx": "디럭스 트윈"}
ROOM_JA = {"std": "スタンダードツイン", "dlx": "デラックスツイン"}
REFUND_KO = {"REQUESTED": "환불 요청", "DONE": "환불 완료", "FAIL": "환불 실패"}
REFUND_JA = {"REQUESTED": "返金手続き中", "DONE": "返金済み", "FAIL": "返金失敗"}


def _yen(n: int) -> str:
    return f"¥{n:,}"


def _day(d) -> str:
    """{depDate} 한국어: '2027-06-15' → '2027년 6월 15일(화)'"""
    x = d if isinstance(d, date) else date.fromisoformat(str(d))
    return f"{x.year}년 {x.month}월 {x.day}일({'월화수목금토일'[x.weekday()]})"


def _day_ja(d) -> str:
    """{depDate} 日本語: '2027-06-15' → '2027年6月15日（火）'"""
    x = d if isinstance(d, date) else date.fromisoformat(str(d))
    return f"{x.year}年{x.month}月{x.day}日（{'月火水木金土日'[x.weekday()]}）"


def _hm(t) -> str | None:
    """승차 시각 (DB TIME 은 timedelta) → 'HH:MM'"""
    if t is None or t == "":
        return None
    if isinstance(t, timedelta):
        m = int(t.total_seconds()) // 60
        return f"{m // 60:02d}:{m % 60:02d}"
    return str(t)[:5]


def _web(path: str) -> str:
    """화면 주소: 결제 결과 주소(PAYMENT_RETURN_URL)의 '#' 앞을 사이트 주소로 씀 → {detailUrl} 등"""
    base = env.PAYMENT_RETURN_URL.split("#", 1)[0]
    return f"{base}#{path}"


def _map(b: dict) -> str | None:
    if b.get("pick_lat") is None or b.get("pick_lng") is None:
        return None
    return f"https://www.google.com/maps/search/?api=1&query={b['pick_lat']},{b['pick_lng']}"


def _support() -> str:
    """{support} 한국어: '전화 · 이메일 · 10:00~17:00 (일본 시간)'"""
    s = S.SUPPORT
    parts = [x for x in (s.get("tel") and f"전화 {s['tel']}", s.get("email") and f"이메일 {s['email']}") if x]
    return " · ".join(parts + [f"{s['hours'].replace('-', '~')} (일본 시간)"])


def _support_ja() -> str:
    s = S.SUPPORT
    parts = [x for x in (s.get("tel") and f"電話 {s['tel']}", s.get("email") and f"メール {s['email']}") if x]
    return "・".join(parts + [f"{s['hours'].replace('-', '〜')}（日本時間）"])


def _rooms(b: dict) -> str | None:
    """객실 구성 (2인실 n실 · 1인실 m실). 숙박이 없으면 None"""
    if not b.get("hotel_name"):
        return None
    singles = int(b.get("singles") or 0)
    twins = (int(b["people"]) - singles) // 2
    return twins, singles


def _hotel_line(b: dict) -> str | None:
    r = _rooms(b)
    if not r:
        return None
    twins, singles = r
    room = ROOM_KO.get(b.get("room_type") or "", "")
    parts = [f"{b['hotel_name']}" + (f" ({room})" if room else ""), f"2인실 {twins}실"] + ([f"1인실 {singles}실"] if singles else [])
    return " · ".join(parts)


def _hotel_line_ja(b: dict) -> str | None:
    r = _rooms(b)
    if not r:
        return None
    twins, singles = r
    room = ROOM_JA.get(b.get("room_type") or "", "")
    parts = [f"{b['hotel_name']}" + (f"（{room}）" if room else ""), f"ツイン{twins}室"] + ([f"シングル{singles}室"] if singles else [])
    return "・".join(parts)


def _summary(b: dict, pick: bool = True) -> list[str]:
    """■ 예약 내용 (v1.7 ④): 예약번호·패키지·출발일·인원·호텔·승차·요청 사항"""
    out = ["■ 예약 내용", f"예약번호   {b['no']}", f"패키지     {b['package_name']}", f"출발일     {_day(b['dep_date'])}   인원 {b['people']}명"]
    if h := _hotel_line(b):
        out.append(f"호텔       {h}")
    if pick and b.get("pick_place"):
        out.append(f"승차       {b['pick_place']}")
    if pick and b.get("memo"):
        out.append(f"요청 사항  {b['memo']}")
    out.append(f"결제 금액  {_yen(b['total'])} (버스·픽업 포함)")
    return out


def _summary_ja(b: dict, pick: bool = True) -> list[str]:
    out = ["■ ご予約内容", f"予約番号   {b['no']}", f"パッケージ {b['package_name']}", f"出発日     {_day_ja(b['dep_date'])}  人数 {b['people']}名様"]
    if h := _hotel_line_ja(b):
        out.append(f"ホテル     {h}")
    if pick and b.get("pick_place"):
        out.append(f"乗車       {b['pick_place']}")
    if pick and b.get("memo"):
        out.append(f"ご要望     {b['memo']}")
    out.append(f"お支払い金額 {_yen(b['total'])}（送迎バス込み）")
    return out


def render(kind: str, b: dict) -> tuple[str, str]:
    """손님 메일 제목·본문 (한국어). b: no · package_name · dep_date · people · total · name, 있으면 hotel_name · room_type · singles ·
    pick_place · memo · pickup_time · pick_lat · pick_lng · stop_order · refund_status · judge_date"""
    who = f"{b['name']} 님, " if b.get("name") else ""
    tail = [f"예약 상세: {_web('/golf/my/' + b['no'])}", f"고객센터: {_support()}", "문의하실 때 예약번호를 알려 주세요."]
    if kind == "GO":
        subject = f"[TRAVENDER 골프] 출발이 확정되었습니다 · {_day(b['dep_date'])} {b['package_name']}"
        t = _hm(b.get("pickup_time"))
        pickup = (f"{t} · {b.get('pick_place') or '-'}" if t else
                  f"승차 순서와 시간은 출발 {S.PICKUP_REGISTER_DUE_DAYS}일 전까지 메일로 다시 안내해 드립니다.")
        due = date.fromisoformat(str(b["dep_date"])) - timedelta(days=S.COMPANION_DUE_DAYS)
        lines = [f"{who}예약하신 골프투어의 출발이 확정되었습니다.", "", *_summary(b), "", "■ 승차 시간", pickup, "",
                 f"동반자 영문 이름은 {_day(due)}까지 예약 상세에서 고칠 수 있습니다.", *tail]
    elif kind == "CANCEL":
        subject = f"[TRAVENDER 골프] 운행 취소와 환불 안내 ({b['no']})"
        lines = [f"{who}죄송합니다. 같은 출발편 인원이 최소 출발 인원({S.MIN_DEPARTURE}명)에 이르지 않아 운행이 취소되었습니다.", "",
                 *_summary(b, pick=False), "", "■ 환불",
                 f"결제하신 {_yen(b['total'])}은 전액 환불됩니다. 카드사에 따라 반영까지 시간이 걸릴 수 있습니다.", "",
                 f"다른 출발일 보기: {_web('/golf/packages')}", f"고객센터: {_support()}", "문의하실 때 예약번호를 알려 주세요."]
    elif kind == "PICKUP":
        subject = f"[TRAVENDER 골프] 승차 시간 안내 · {_day(b['dep_date'])}"
        order = f" (정차 순서 {b['stop_order']})" if b.get("stop_order") else ""
        lines = [f"{who}출발일의 승차 시간을 알려 드립니다.", "", "■ 승차",
                 f"{_day(b['dep_date'])} {_hm(b.get('pickup_time')) or '-'} · {b.get('pick_place') or '-'}{order}"]
        if m := _map(b):
            lines.append(f"지도: {m}")
        if b.get("changed"):
            lines.append("앞서 안내해 드린 시간 대신 이 시간으로 봐 주세요.")
        lines += ["합승 버스는 여러 그룹을 차례로 태우므로 승차 시간 5분 전까지 와 주세요.", "", *_summary(b, pick=False), "", *tail]
    elif kind == "USER_CANCEL":
        subject = f"[TRAVENDER 골프] 예약 취소 확인 ({b['no']})"
        rs = REFUND_KO.get(b.get("refund_status") or "", "-")
        lines = [f"{who}요청하신 예약 취소가 처리되었습니다.", "", *_summary(b, pick=False), "", "■ 환불",
                 f"환불 상태: {rs} (금액과 시기는 TRAVENDER 본 사이트 취소 규정에 따릅니다)", "", *tail]
    elif kind == "CONFIRM":  # 본 사이트가 보냄. 템플릿 확인용
        subject = f"[TRAVENDER 골프] 예약이 확정되었습니다 ({b['no']})"
        judge = _day(b["judge_date"]) if b.get("judge_date") else "-"
        lines = [f"{who}결제가 완료되어 예약이 확정되었습니다.", "", *_summary(b), "",
                 f"다른 그룹과 함께 타는 합승 버스입니다. {judge}에 같은 출발편 인원이 {S.MIN_DEPARTURE}명 이상이면 출발이 확정되고, "
                 "모이지 않으면 운행이 취소되며 전액 환불됩니다.", "", *tail]
    else:
        raise ValueError(f"알 수 없는 메일 종류: {kind}")
    return subject, "\n".join(lines) + "\n"


def render_ja(kind: str, b: dict) -> tuple[str, str]:
    """render 의 일본어판 (같은 값을 받음, v1.7 ⑤)"""
    who = f"{b['name']} 様\n\n" if b.get("name") else ""
    tail = [f"予約詳細：{_web('/golf/my/' + b['no'])}", f"カスタマーセンター：{_support_ja()}", "お問い合わせの際は予約番号をお知らせください。"]
    if kind == "GO":
        subject = f"【TRAVENDER Golf】催行決定のお知らせ・{_day_ja(b['dep_date'])} {b['package_name']}"
        t = _hm(b.get("pickup_time"))
        pickup = f"{t}・{b.get('pick_place') or '-'}" if t else f"乗車順と時刻は出発{S.PICKUP_REGISTER_DUE_DAYS}日前までにメールでご案内いたします。"
        due = date.fromisoformat(str(b["dep_date"])) - timedelta(days=S.COMPANION_DUE_DAYS)
        lines = [f"{who}ご予約のゴルフツアーの催行が決定しました。", "", *_summary_ja(b), "", "■ 乗車時刻", pickup, "",
                 f"同行者のローマ字氏名は{_day_ja(due)}まで予約詳細から修正できます。", *tail]
    elif kind == "CANCEL":
        subject = f"【TRAVENDER Golf】催行中止および返金のご案内（{b['no']}）"
        lines = [f"{who}誠に申し訳ございません。同じ出発便の人数が最少催行人員（{S.MIN_DEPARTURE}名）に達しなかったため、催行中止となりました。", "",
                 *_summary_ja(b, pick=False), "", "■ 返金",
                 f"お支払いいただいた{_yen(b['total'])}は全額返金いたします。カード会社によっては反映まで時間がかかる場合があります。", "",
                 f"ほかの出発日を見る：{_web('/golf/packages')}", f"カスタマーセンター：{_support_ja()}", "お問い合わせの際は予約番号をお知らせください。"]
    elif kind == "PICKUP":
        subject = f"【TRAVENDER Golf】乗車時刻のご案内・{_day_ja(b['dep_date'])}"
        order = f"（停車順 {b['stop_order']}）" if b.get("stop_order") else ""
        lines = [f"{who}出発日の乗車時刻をお知らせします。", "", "■ 乗車",
                 f"{_day_ja(b['dep_date'])} {_hm(b.get('pickup_time')) or '-'}・{b.get('pick_place') or '-'}{order}"]
        if m := _map(b):
            lines.append(f"地図：{m}")
        if b.get("changed"):
            lines.append("先にご案内した時刻ではなく、この時刻をご確認ください。")
        lines += ["送迎バスは複数のグループを順にお迎えしますので、乗車時刻の5分前までにお越しください。", "", *_summary_ja(b, pick=False), "", *tail]
    elif kind == "USER_CANCEL":
        subject = f"【TRAVENDER Golf】ご予約取消のご確認（{b['no']}）"
        rs = REFUND_JA.get(b.get("refund_status") or "", "-")
        lines = [f"{who}ご依頼いただいたご予約の取消が完了しました。", "", *_summary_ja(b, pick=False), "", "■ 返金",
                 f"返金状況：{rs}（金額と時期は TRAVENDER 本サイトのキャンセル規定に従います）", "", *tail]
    elif kind == "CONFIRM":  # 본 사이트가 보냄. 템플릿 확인용
        subject = f"【TRAVENDER Golf】ご予約確定のお知らせ（{b['no']}）"
        judge = _day_ja(b["judge_date"]) if b.get("judge_date") else "-"
        lines = [f"{who}お支払いが完了し、ご予約が確定しました。", "", *_summary_ja(b), "",
                 f"他のグループと同じ送迎バスをご利用いただきます。{judge}時点で同じ出発便の人数が{S.MIN_DEPARTURE}名以上の場合は催行決定となり、"
                 "達しない場合は催行中止となり、全額返金いたします。", "", *tail]
    else:
        raise ValueError(f"알 수 없는 메일 종류: {kind}")
    return subject, "\n".join(lines) + "\n"


def _booking_info(c: Connection, booking_no: str) -> dict:
    r = one(c, """SELECT b.no, b.lang, b.people, b.single_count singles, b.total_price total, b.refund_status, d.dep_date, d.judge_date,
                         IF(b.lang = 'ja', p.name_ja, p.name_ko) package_name, m.name_ko name,
                         s.pickup_time, s.place_name pick_place, s.memo, s.lat pick_lat, s.lng pick_lng, s.stop_order,
                         IF(b.lang = 'ja', h.name_ja, h.name_ko) hotel_name, o.room_type
                  FROM booking b JOIN departure d ON d.id = b.departure_id JOIN package p ON p.id = d.package_id
                  LEFT JOIN hotel_option o ON o.id = b.hotel_option_id
                  LEFT JOIN hotel h ON h.id = IF(o.id IS NULL, p.default_hotel_id, o.hotel_id)
                  LEFT JOIN booking_member m ON m.booking_no = b.no AND m.seq = 1
                  LEFT JOIN booking_stop s ON s.booking_no = b.no AND s.kind = 'PICK'
                  WHERE b.no = :no""", no=booking_no)
    if not r:
        raise LookupError(f"예약 없음 {booking_no}")
    return r


def notify(c: Connection, booking_no: str, to: str, kind: str, **_: object) -> None:
    """kind(CONFIRM · GO · CANCEL · PICKUP · USER_CANCEL) 메일을 만들어 보내고 notification 에 기록. 실패해도 예약 처리는 되돌리지 않음"""
    try:
        info = _booking_info(c, booking_no)
        subject, body = (render_ja if info["lang"] == "ja" else render)(kind, info)  # 예약할 때 쓴 언어로 보냄
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


OPS_KINDS = (("환불 실패", "환불 실패"), ("출발 판정 실패", "판정 실패"), ("미결제 처리 뒤 결제 완료", "늦은 결제 환불"), ("주문 결제 대기", "결제 확인 지연"))


def _ops_kind(title: str) -> str:
    """알림 제목 → v1.7 운영자 알림 종류 (환불 실패 · 판정 실패 · 늦은 결제 환불 · 결제 확인 지연)"""
    return next((k for prefix, k in OPS_KINDS if title.startswith(prefix)), title)


def render_ops(title: str, detail: str, action: str = "", b: dict | None = None, dep: dict | None = None, at: str | None = None,
               ref: str | None = None) -> tuple[str, str]:
    """운영자 알림 제목·본문. b: 예약 (_ops_booking 형식), dep: 출발편 (_ops_departure 형식), at: 발생 시각 (기본 지금, 일본 시간),
    ref: 정보를 못 찾았을 때 제목에 쓸 예약번호·출발편 ID"""
    ref = b["no"] if b else dep["dep_id"] if dep else ref or "-"
    subject = f"[골프 예약][{_ops_kind(title)}] {ref}"  # v1.7 메일 템플릿 ②: '[골프 예약][종류] 대상'
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
    """L-22 운영자 알림 (환불 실패 · 출발 판정 실패 · 늦은 결제 · 오래 걸리는 주문): notification 에 OPS_ALERT 로 남기고 OPS_EMAIL 이 있으면 메일.
    실패해도 처리는 계속. 메일에는 예약이면 고객(대표자)·예약·본 사이트 주문·환불 상태, 출발편이면 출발편 상태·인원을 함께 담음.
    예약이 아닌 일(출발 판정 실패 등)은 booking_no 없이 about(출발편 ID)으로 부름 → notification.departure_id 로 남김 (v1.7, Alembic 0007).
    notification.error = '제목: 내용' 앞 200자, body = 알림 제목·본문 전체"""
    ref = booking_no or about or "-"
    text = f"{title}: {detail}"
    log.warning("[ops] %s %s", ref, text)
    b = _try(_ops_booking, c, booking_no) if booking_no else None
    dep = _try(_ops_departure, c, about) if about and not booking_no else None
    subject, body = render_ops(title, detail, action, b, dep, ref=ref)
    dep_id = None if booking_no else (about if dep else None)  # 없는 출발편 ID 는 FK 오류가 나므로 비움
    sql = "INSERT INTO notification (booking_no, departure_id, kind, result, error, body) VALUES (:no, :dep, 'OPS_ALERT', :r, :e, :b)"
    try:
        if env.OPS_EMAIL:
            mail.send(env.OPS_EMAIL, subject, body)
        run(c, sql, no=booking_no, dep=dep_id, r="OK", e=text[:200], b=f"{subject}\n\n{body}")
    except Exception as e:  # noqa: BLE001
        log.warning("ops mail failed %s: %s", ref, e)
        run(c, sql, no=booking_no, dep=dep_id, r="FAIL", e=f"{text} / {e}"[:200], b=f"{subject}\n\n{body}")
