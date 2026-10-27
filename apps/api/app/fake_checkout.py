"""가짜 결제창 (PAYMENT_BACKEND=fake 에서만, 로컬 개발·화면 확인용).
실제 본 사이트 결제창 자리: S-10 결제 → 이 페이지 → 결과를 고르면 주문 상태를 바꾸고 return_url(결제 결과 화면)로 돌아감.
돌아가는 주소는 return_url 의 경로·# 부분만 써서 지금 보고 있는 서버(8787 또는 Vite 5173)에 그대로 머묾"""
from __future__ import annotations

from html import escape
from urllib.parse import parse_qs, urlsplit

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from .adapters.partner import ORDER_AUTH, ORDER_EXPIRED, ORDER_FAILED, ORDER_PAID, partner
from .errors import fail

router = APIRouter(prefix="/api/golf/dev", include_in_schema=False)

CHOICES = [  # (상태, 버튼, 설명)
    (ORDER_PAID, "결제 성공", "paid → 예약 확정 (S-11)"),
    (ORDER_FAILED, "결제 실패", "failed → 미결제, 좌석 풀림"),
    (ORDER_EXPIRED, "시간 만료", "expired → 미결제, 좌석 풀림"),
    (ORDER_AUTH, "카드 인증 중", "authenticating → 결과 화면이 30초 간격 3번 다시 확인 후 '확인 중'"),
]


def _order(order_id: str) -> tuple[dict, dict]:
    o, m = getattr(partner, "orders", {}).get(order_id), getattr(partner, "meta", {}).get(order_id)
    if not o or not m:
        fail("E-NOTFOUND")
    return o, m


def _back(return_url: str) -> str:
    u = urlsplit(return_url)
    return (u.path or "/") + (f"?{u.query}" if u.query else "") + (f"#{u.fragment}" if u.fragment else "")


@router.get("/fake-checkout/{order_id}", response_class=HTMLResponse)
def page(order_id: str):
    o, m = _order(order_id)
    btns = "".join(
        f'<button name="status" value="{st}"{" class=primary" if st == ORDER_PAID else ""}><b>{label}</b><small>{desc}</small></button>'
        for st, label, desc in CHOICES)
    return f"""<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>가짜 결제창</title>
<style>
body{{font-family:system-ui,sans-serif;background:#f1f3f6;margin:0;padding:16px;color:#1b1d22}}
main{{max-width:440px;margin:24px auto;background:#fff;border-radius:16px;padding:20px;box-shadow:0 4px 20px #0001}}
.tag{{display:inline-block;background:#fff3cd;color:#8a5a00;font-size:12px;font-weight:700;border-radius:6px;padding:3px 8px}}
h1{{font-size:20px;margin:10px 0 4px}} dl{{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:14px;margin:16px 0}}
dt{{color:#6b7280}} dd{{margin:0;font-weight:600;word-break:break-all}} .amt{{font-size:24px;color:#5b3df5}}
form{{display:grid;gap:8px}} button{{display:grid;gap:2px;text-align:left;font:inherit;padding:12px 14px;border:1.5px solid #d6d9e0;border-radius:12px;background:#fff;cursor:pointer}}
button.primary{{border-color:#5b3df5;background:#f3f0ff}} small{{color:#6b7280;font-size:12.5px}} p{{font-size:13px;color:#6b7280;line-height:1.6}}
</style>
<main>
<span class="tag">개발용 · PAYMENT_BACKEND=fake</span>
<h1>가짜 결제창</h1>
<p>실제 TRAVENDER 결제창 자리예요. 결과를 고르면 주문 상태를 바꾸고 골프 결제 결과 화면으로 돌아가요. 주문 목록: <a href="../fake-checkout">/api/golf/dev/fake-checkout</a></p>
<dl><dt>상품</dt><dd>{escape(m["title"])}</dd><dt>예약번호</dt><dd>{escape(o["reference"])}</dd>
<dt>주문</dt><dd>{escape(order_id)} ({escape(o["status"])})</dd><dt>금액</dt><dd class="amt">¥{o["amount"]:,}</dd></dl>
<form method="post">{btns}</form>
</main></html>"""


@router.get("/fake-checkout", response_class=HTMLResponse)
def index():
    """가짜 본 사이트의 주문 목록 (서버를 다시 켜면 비워짐). '카드 인증 중'으로 둔 주문을 나중에 성공·실패로 바꿀 때"""
    items = "".join(f'<li><a href="fake-checkout/{escape(oid)}">{escape(o["reference"])}</a> · {escape(oid)} · <b>{escape(o["status"])}</b></li>'
                    for oid, o in reversed(list(getattr(partner, "orders", {}).items())))
    return f"""<!doctype html><meta charset="utf-8"><title>가짜 결제 주문</title>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.8">
<h1 style="font-size:20px">가짜 본 사이트 주문 (개발용)</h1><ul>{items or "<li>주문 없음</li>"}</ul>
<p style="color:#6b7280;font-size:13px">상태를 바꾼 뒤 결제 결과 화면의 '다시 확인' 또는 결제 확인 배치(B-08)가 반영해요.</p>"""


@router.post("/fake-checkout/{order_id}")
async def choose(order_id: str, req: Request):
    o, m = _order(order_id)
    st = parse_qs((await req.body()).decode()).get("status", [""])[0]
    if st not in {c[0] for c in CHOICES}:
        fail("E-VALID")
    partner.set_status(order_id, st)
    return RedirectResponse(_back(m["return_url"]), status_code=303)
