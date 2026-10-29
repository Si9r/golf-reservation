import { useState } from "react";
import { CaretDown, CaretRight, Clock, Copy, EnvelopeSimple, Headset, Phone } from "@phosphor-icons/react";
import { SET } from "../data";
import { useT } from "../i18n";
import { useAuth, useDb, useToast } from "../store";
import { Anno, Collapse, ScreenTag } from "../components/ui";

// 일본 시간 기준 운영 중인지 (설정 SUPPORT.hours 10:00-17:00)
const openNowJST = () => {
  const d = new Date(Date.now() + 9 * 3600000);
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  const [a, b] = SET.SUPPORT_HOURS.split("-").map((x) => Number(x.slice(0, 2)));
  return h >= a && h < b;
};

export default function Support() {
  const { t } = useT();
  const user = useAuth((s) => s.user);
  const bookings = useDb((s) => s.bookings);
  const toast = useToast((s) => s.show);
  const [open, setOpen] = useState<number | null>(0);
  const faq = t("faq").split("||").map((x) => x.split("|"));
  const recent = user ? [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : null;
  const isOpen = openNowJST();
  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
    } catch {
      /* 클립보드 권한이 없으면 무시 */
    }
    toast(t("copied"));
  };

  // 연락 방법 카드 (전화 · 이메일): 카드 전체를 누르면 바로 연결
  const contact = (
    <section className="relative grid gap-3">
      <Anno n={1} t="연락처·운영 시간 (설정 SUPPORT): 10:00~17:00 (JST), 전화·이메일 바로 연결" />
      <a href={`tel:${SET.SUPPORT_TEL.replace(/-/g, "")}`} className="group flex items-center gap-4 rounded-[20px] bg-surface p-4 shadow-[var(--shadow)] transition-shadow hover:shadow-[var(--shadow-lg)] lg:p-5">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand text-brand-ink"><Phone size={24} weight="fill" /></span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[13px] font-bold text-muted">{t("tel")}</span>
          <b className="num text-[20px] font-black tracking-tight">{SET.SUPPORT_TEL}</b>
          <span className="text-[13px] text-muted">{t("hoursV")}</span>
        </span>
        <span className="hidden items-center gap-1 text-[14px] font-bold text-brand sm:flex lg:hidden">{t("call")} <CaretRight size={14} weight="bold" /></span>
      </a>
      <a href={`mailto:${SET.SUPPORT_MAIL}${recent ? `?subject=${encodeURIComponent(recent.no)}` : ""}`} className="group flex items-center gap-4 rounded-[20px] bg-surface p-4 shadow-[var(--shadow)] transition-shadow hover:shadow-[var(--shadow-lg)] lg:p-5">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand-soft text-brand"><EnvelopeSimple size={24} weight="fill" /></span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-[13px] font-bold text-muted">{t("mailL")}</span>
          <b className="break-all text-[16px] font-bold">{SET.SUPPORT_MAIL}</b>
        </span>
        <span className="hidden items-center gap-1 text-[14px] font-bold text-brand sm:flex lg:hidden">{t("mail")} <CaretRight size={14} weight="bold" /></span>
      </a>
      {!isOpen && <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] font-semibold text-warn">{t("closedNow")}</p>}
    </section>
  );

  // 예약번호 안내 (최근 예약번호 + 복사)
  const bookingNote = (
    <section className="relative grid gap-2 rounded-[20px] bg-surface-2 p-4 text-[14px] lg:p-5">
      <Anno n={2} t="예약번호 안내 (M-210): 로그인 상태면 최근 예약번호 표시" />
      <p className="font-semibold">{t("M-210")}</p>
      {recent && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3.5 py-2.5">
          <span className="grid"><span className="text-[12px] text-muted">{t("recentNo")}</span><b className="num text-[16px]">{recent.no}</b></span>
          <button className="btn btn-xs btn-ghost" onClick={() => copy(recent.no)}><Copy size={14} /> {t("copy")}</button>
        </div>
      )}
    </section>
  );

  return (
    <div className="page step pb-8 lg:pb-10">
      <ScreenTag id="S-14" name="고객센터" refs="FN-30 · 설정 SUPPORT · API-14" />

      {/* 머리: 제목 + 지금 운영 중인지 */}
      <header className="relative mb-5 overflow-hidden rounded-[24px] bg-[#1a1d24] p-5 text-white lg:mb-7 lg:p-8">
        <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand/40 blur-3xl" />
        <span className="relative flex items-center gap-2">
          <Headset size={22} weight="fill" className="text-[#b9a4ff]" />
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${isOpen ? "bg-ok-bg/20 text-[#6ee7b7]" : "bg-white/10 text-[#c9cdd6]"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? "bg-[#34d399]" : "bg-[#8a93a6]"}`} />{t(isOpen ? "supOpen" : "supClosed")}
          </span>
        </span>
        <h1 className="relative mt-3 text-[26px] font-black lg:text-[34px]">{t("supT")}</h1>
        <p className="relative mt-1 flex items-center gap-1.5 text-[14px] text-[#c9cdd6]"><Clock size={16} />{t("hours")} {t("hoursV")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        {/* 휴대폰: 연락처 먼저 / PC: 오른쪽 고정 */}
        <div className="grid gap-3 lg:sticky lg:top-36 lg:col-start-2 lg:row-start-1">
          {contact}
          {bookingNote}
        </div>

        <section className="relative lg:col-start-1 lg:row-start-1">
          <Anno n={3} t="자주 묻는 질문 (문구 파일 FAQ): 버스 요금, 승하차 범위, 인원 미달, 변경·취소, 렌탈" />
          <h2 className="mb-3 text-[20px] font-black lg:text-[22px]">{t("faqT")}</h2>
          <div className="grid gap-2">
            {faq.map(([q, a], i) => (
              <div key={q} className={`overflow-hidden rounded-2xl bg-surface transition-shadow ${open === i ? "shadow-[var(--shadow)] ring-1 ring-brand-line" : ""}`}>
                <button className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                  <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-[13px] font-black ${open === i ? "bg-brand text-brand-ink" : "bg-brand-soft text-brand"}`}>Q</span>
                  <span className="flex-1 text-[15px] font-bold">{q}</span>
                  <CaretDown size={16} className={`flex-none text-muted transition-transform ${open === i ? "rotate-180" : ""}`} />
                </button>
                <Collapse open={open === i}>
                  <p className="px-4 pb-4 pl-[56px] text-[14px] leading-relaxed text-ink-2">{a}</p>
                </Collapse>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
