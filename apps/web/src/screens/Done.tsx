import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { CalendarCheck, Check, Copy, EnvelopeSimple, UsersThree } from "@phosphor-icons/react";
import { pkgOf } from "../data";
import { useT } from "../i18n";
import { fullReset, useDb, useToast } from "../store";
import { fDate, fDayLong, judgeDate, yen } from "../logic";
import { Anno, Q, ScreenTag } from "../components/ui";

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
  return (
    <div className="page step">
      <ScreenTag id="S-11" name="예약 완료" refs="FN-24, FN-25 · API-12 · T-19" />
      <section className="relative grid justify-items-center gap-3 pt-6 text-center">
        <Anno n={1} t="완료 메시지(M-180)·예약번호 + 복사 버튼" />
        <motion.span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-brand text-brand-ink" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
          <Check size={36} weight="bold" />
        </motion.span>
        <h1 className="text-[24px] font-bold">{t("M-180")}</h1>
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] text-muted">{t("noLabel")}</span>
          <b className="num text-[20px]">{b.no}</b>
          <button className="btn btn-xs btn-ghost" onClick={copy}><Copy size={14} /> {t("copy")}</button>
        </div>
      </section>

      <section className="relative mt-6 card divide-y divide-line">
        <Anno n={2} t="예약 요약: 패키지, 출발일·인원, 총액" />
        {[
          [t("rowPkg"), n(p.name)],
          [t("rowDep"), `${fDate(b.dep, L)} · ${t("peopleN", { n: b.people })}`],
          [t("totalL", { n: b.people }), `${yen(b.total)} · ${t("busIncl")}`],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3 px-4 py-3 text-[14px]">
            <span className="w-24 flex-none font-semibold text-muted">{k}</span>
            <span className="num min-w-0 flex-1 font-semibold">{v}</span>
          </div>
        ))}
      </section>

      <section className="relative mt-4 grid gap-2.5 rounded-2xl bg-surface-2 p-4 text-[14px]">
        <Anno n={3} t="다음 안내: 확인서 발송 주소(M-181), 판정일(M-182), 승차 시간 안내 예정(M-183), 동반자 이름 수정 안내(출발 7일 전까지 예약 상세에서)" />
        {nexts.map(({ icon: I, text }) => (
          <p key={text} className="flex gap-2"><I size={20} className="mt-0.5 flex-none text-brand" />{text}</p>
        ))}
        <p><Q id="Q-17" t="판정 시점" /></p>
      </section>

      <section className="relative mt-6 grid gap-2">
        <Anno n={4} t="버튼: 예약 상세 보기 → S-13 (T-19) / 골프 홈 → S-01" />
        <button className="btn btn-primary w-full" onClick={() => nav(`/golf/my/${b.no}`, { replace: true })}>{t("detail")}</button>
        <button className="btn btn-ghost w-full" onClick={() => nav("/golf", { replace: true })}>{t("golfHomeBtn")}</button>
      </section>
    </div>
  );
}
