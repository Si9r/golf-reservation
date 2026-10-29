import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { CalendarCheck, Check, Copy, EnvelopeSimple, UsersThree } from "@phosphor-icons/react";
import { pkgOf } from "../data";
import { useT } from "../i18n";
import { fullReset, useDb, useToast } from "../store";
import { fDayLong, fShort, judgeDate, stayHotel, tripEnd, yen } from "../logic";
import { Anno, Img, Q, ScreenTag } from "../components/ui";

export default function Done() {
  const { no } = useParams();
  const { t, n, L } = useT();
  const nav = useNavigate();
  const toast = useToast((s) => s.show);
  const reduce = useReducedMotion();
  const b = useDb((s) => s.bookings.find((x) => x.no === no));
  useEffect(() => {
    fullReset(); // 진행 중이던 예약 내용(세션)은 이 화면에서 초기화
  }, []);
  if (!b) return <Navigate to="/golf/my" replace />;
  const p = pkgOf(b.pkgId)!;
  const hotel = stayHotel(p, b.opt);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(b.no);
    } catch {
      /* 클립보드 권한이 없으면 무시 */
    }
    toast(t("copied"));
  };
  const nexts = [
    { icon: EnvelopeSimple, text: t("M-181", { e: b.info.email }) },
    { icon: CalendarCheck, text: t("M-182", { d: fDayLong(judgeDate(b.dep), L) }) },
    ...(b.people > 1 ? [{ icon: UsersThree, text: t("compFixInfo") }] : []), // 동반자 이름은 예약 때 모두 받음 → 고칠 수 있는 기간만 안내 (팀 결정 10/23)
  ];
  const dates = p.nights ? `${fShort(b.dep, L)} – ${fShort(tripEnd(p, b.dep), L)}` : fShort(b.dep, L);
  return (
    <div className="page step">
      <ScreenTag id="S-11" name="예약 완료" refs="FN-24, FN-25 · API-12 · T-19" />

      {/* 1 완료 띠: 사진 위 체크 · 완료 메시지(M-180) · 출발일, 예약번호 + 복사 */}
      <section className="relative -mx-4 -mt-4 h-[260px] overflow-hidden bg-[#1d2b22] lg:mx-0 lg:mt-0 lg:rounded-[24px]">
        <Anno n={1} t="완료 메시지(M-180)·예약번호 + 복사 버튼" />
        <Img src={p.photos[0]} alt={n(p.name)} className="absolute inset-0 h-full w-full" />
        <span className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/80 lg:bg-gradient-to-r lg:from-black/80 lg:via-black/40 lg:to-black/10" />
        <div className="absolute inset-x-5 bottom-6 flex flex-col gap-2.5 text-white lg:inset-x-10 lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:flex-row lg:items-center lg:gap-5">
          <motion.span className="grid h-[52px] w-[52px] flex-none place-items-center rounded-full bg-ok-bg text-white lg:h-16 lg:w-16" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
            <Check size={30} weight="bold" />
          </motion.span>
          <div className="grid gap-1">
            <h1 className="text-[26px] font-black lg:text-[34px]">{t("M-180")}</h1>
            <p className="num text-[15px] lg:text-[17px]">{t("doneDep", { d: fDayLong(b.dep, L) })}</p>
          </div>
          <div className="hidden rounded-2xl bg-white/15 px-5 py-3.5 text-right backdrop-blur lg:ml-auto lg:block">
            <span className="block text-[12px] opacity-85">{t("noLabel")}</span>
            <b className="num text-[20px] tracking-[0.04em]">{b.no}</b>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-4 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-7">
        <div className="grid gap-4">
          {/* 예약번호 (휴대폰. PC는 사진 띠 오른쪽) + 복사 */}
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-surface p-4 lg:p-5">
            <span className="text-[13px] font-bold text-muted">{t("noLabel")}</span>
            <span className="flex items-center gap-2">
              <b className="num text-[18px] tracking-[0.04em]">{b.no}</b>
              <button className="btn btn-xs btn-ghost" onClick={copy}><Copy size={14} /> {t("copy")}</button>
            </span>
          </div>

          {/* 3 다음 안내: 번호 단계 (확인서 메일 → 판정일 → 동반자 이름 수정 기간) */}
          <section className="relative rounded-[20px] bg-surface p-5 lg:p-7">
            <Anno n={3} t="다음 안내: 확인서 발송 주소(M-181), 판정일(M-182), 승차 시간 안내 예정(M-183), 동반자 이름 수정 안내(출발 7일 전까지 예약 상세에서)" />
            <h2 className="mb-4 text-[17px] font-black lg:text-[18px]">{t("doneNextT")}</h2>
            <ol className="grid">
              {nexts.map(({ icon: I, text }, i) => (
                <li key={text} className="flex gap-3.5">
                  <span className="flex flex-col items-center">
                    <span className={`grid h-8 w-8 flex-none place-items-center rounded-full ${i === 0 ? "bg-ok-bg text-white" : "bg-brand-soft text-brand"}`}><I size={17} /></span>
                    {i < nexts.length - 1 && <span className="w-0.5 flex-1 bg-line" />}
                  </span>
                  <p className="pb-5 pt-1 text-[14.5px] leading-relaxed">{text}</p>
                </li>
              ))}
            </ol>
            <p className="text-[13px]"><Q id="Q-17" t="판정 시점" /></p>
          </section>
        </div>

        {/* 2 예약 요약 + 4 버튼 (PC: 오른쪽 고정) */}
        <aside className="relative grid overflow-hidden rounded-[20px] bg-surface shadow-[var(--shadow-lg)] lg:sticky lg:top-36">
          <Anno n={2} t="예약 요약: 패키지, 출발일·인원, 승하차·숙소, 총액" />
          <div className="relative h-[160px] lg:h-[180px]"><Img src={p.photos[0]} alt={n(p.name)} className="absolute inset-0 h-full w-full" /></div>
          <div className="grid gap-4 p-5">
            <div>
              <b className="line-clamp-2 text-[18px] font-black leading-snug">{n(p.name)}</b>
              <span className="num text-[14px] text-muted">{dates} · {t("peopleN", { n: b.people })}</span>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2.5 text-[14px]">
              <span className="text-muted">{t("pick")}</span><span className="min-w-0">{b.pick ? n(b.pick.name) : "-"}{b.pickTime ? ` · ${t("wishAt", { t: b.pickTime })}` : ""}</span>
              <span className="text-muted">{t("drop")}</span><span className="min-w-0">{b.drop ? n(b.drop.name) : "-"}</span>
              <span className="text-muted">{t("rowHotel")}</span><span className="min-w-0">{hotel ? n(hotel.name) : t("noHotel")}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-[14px] text-muted">{t("totalL", { n: b.people })} · {t("busIncl")}</span>
              <b className="num text-[24px] font-black">{yen(b.total)}</b>
            </div>
            <div className="relative grid gap-2">
              <Anno n={4} t="버튼: 예약 상세 보기 → S-13 (T-19) / 골프 홈 → S-01" />
              <button className="btn btn-primary w-full" onClick={() => nav(`/golf/my/${b.no}`, { replace: true })}>{t("detail")}</button>
              <button className="btn btn-ghost w-full" onClick={() => nav("/golf", { replace: true })}>{t("golfHomeBtn")}</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
