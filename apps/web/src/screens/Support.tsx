import { useState } from "react";
import { CaretDown, EnvelopeSimple, Phone } from "@phosphor-icons/react";
import { SET } from "../data";
import { useT } from "../i18n";
import { useAuth, useDb } from "../store";
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
  const [open, setOpen] = useState<number | null>(0);
  const faq = t("faq").split("||").map((x) => x.split("|"));
  const recent = user ? [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : null;
  const isOpen = openNowJST();
  return (
    <>
      <div className="page step pb-8 lg:pb-10">
        <ScreenTag id="S-14" name="고객센터" refs="FN-30 · 설정 SUPPORT · API-14" />
        <h1 className="mb-4 text-[24px] font-bold">{t("supT")}</h1>

        <section className="relative card divide-y divide-line">
          <Anno n={1} t="연락처·운영 시간 (설정 SUPPORT): 10:00~17:00 (JST), 전화·이메일 바로 연결" />
          {[
            [t("hours"), t("hoursV")],
            [t("tel"), <span key="tel" className="num">{SET.SUPPORT_TEL}</span>],
            [t("mailL"), <span key="m" className="break-all">{SET.SUPPORT_MAIL}</span>],
          ].map(([k, v], i) => (
            <div key={i} className="flex gap-3 px-4 py-3.5 text-[14.5px]">
              <span className="w-24 flex-none font-semibold text-muted">{k}</span>
              <span className="min-w-0 flex-1 font-semibold">{v}</span>
            </div>
          ))}
        </section>
        {!isOpen && <p className="mt-2 text-[13px] font-semibold text-warn">{t("closedNow")}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a className="btn btn-primary" href={`tel:${SET.SUPPORT_TEL.replace(/-/g, "")}`}><Phone size={20} weight="fill" /> {t("call")}</a>
          <a className="btn btn-ghost" href={`mailto:${SET.SUPPORT_MAIL}${recent ? `?subject=${encodeURIComponent(recent.no)}` : ""}`}><EnvelopeSimple size={20} /> {t("mail")}</a>
        </div>

        <section className="relative mt-4 rounded-2xl bg-surface-2 p-4 text-[14px]">
          <Anno n={2} t="예약번호 안내 (M-210): 로그인 상태면 최근 예약번호 표시" />
          <p>{t("M-210")}</p>
          {recent && <p className="mt-1"><span className="text-muted">{t("recentNo")}</span> <b className="num">{recent.no}</b></p>}
        </section>

        <section className="relative mt-6">
          <Anno n={3} t="자주 묻는 질문 (문구 파일 FAQ): 버스 요금, 승하차 범위, 인원 미달, 변경·취소, 렌탈" />
          <h2 className="sec-title mb-3">{t("faqT")}</h2>
          <div className="card divide-y divide-line">
            {faq.map(([q, a], i) => (
              <div key={q}>
                <button className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                  <span className="flex-1 text-[14.5px] font-semibold">{q}</span>
                  <CaretDown size={16} className={`flex-none transition-transform ${open === i ? "rotate-180" : ""}`} />
                </button>
                <Collapse open={open === i}>
                  <p className="px-4 pb-4 text-[14px] leading-relaxed text-ink-2">{a}</p>
                </Collapse>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
