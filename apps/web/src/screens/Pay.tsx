import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CreditCard, Info, Lock, Timer, WarningCircle } from "@phosphor-icons/react";
import { SET } from "../data";
import { useT } from "../i18n";
import { releaseHold, useApp, useAuth, useDb, useDraft, type Booking, type PayResult } from "../store";
import { bookingNo, depView, fDate, fShort, judgeDate, todayISO, totalPrice, yen } from "../logic";
import { Anno, BottomBar, ScreenTag, Steps } from "../components/ui";
import { useFlow } from "./flow";

export default function Pay() {
  const { t, n, L } = useT();
  const nav = useNavigate();
  const { payResult, set: setApp } = useApp();
  const db = useDb();
  const user = useAuth((s) => s.user);
  const { d, p, redirect } = useFlow({ place: true, login: true, info: true });
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<null | "M-173" | "M-174">(null);
  const [left, setLeft] = useState(() => Math.max(0, (d.holdUntil ?? Date.now() + SET.HOLD_MINUTES * 60000) - Date.now()));

  useEffect(() => {
    if (redirect) return;
    if (!d.holdUntil) d.patch({ holdUntil: Date.now() + SET.HOLD_MINUTES * 60000, holdPeople: d.people });
    const tm = window.setInterval(() => {
      const until = useDraft.getState().holdUntil;
      setLeft(until ? Math.max(0, until - Date.now()) : 0); // 1초마다 갱신
    }, 1000);
    return () => window.clearInterval(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (redirect) return <Navigate to={redirect} replace />;

  const price = totalPrice(p, d.opt, d.people, d.singles);
  const unit = price.unit;
  const total = price.total;
  const expired = left <= 0 && error !== "M-174";
  const mm = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  const reselect = () => {
    releaseHold();
    d.patch({ dep: null });
    nav(`/golf/packages/${p.id}`, { replace: true });
  };
  const back = () => {
    releaseHold(); // API-09 확보 해제
    nav("/golf/book/info");
  };

  const pay = () => {
    if (paying || expired) return;
    setPaying(true);
    setError(null);
    const result: PayResult = payResult;
    window.setTimeout(() => {
      setPaying(false);
      if (result === "fail") return setError("M-173"); // E-PAY, T-18
      if (result === "soldout" || depView(p.id, d.dep!, d.people, useDb.getState().extra).state === "unavailable") {
        releaseHold(); // L-08 3): 예약을 만들지 않고 전액 환불 (L-15), NO_SEAT 메일
        return setError("M-174");
      }
      const drop = d.dropSame ? d.pick : d.drop;
      const b: Booking = {
        no: bookingNo(d.dep!, useDb.getState().bookings.map((x) => x.no)), // L-09
        pkgId: p.id,
        dep: d.dep!,
        people: d.people,
        opt: d.opt,
        pick: d.pick,
        drop,
        pickMemo: d.pickMemo,
        pickTime: d.pickTime ?? undefined,
        dropTime: d.dropTime ?? undefined,
        unit,
        singles: price.rooms?.singles,
        total,
        currency: "JPY",
        info: d.info!,
        status: "CONFIRMED", // L-08 4): 출발 확정은 판정일(B-01)에만
        createdAt: todayISO(),
        lang: L,
      };
      db.add(b); // booking·booking_member·booking_stop 저장, departure.booked_count += 인원, seat_hold 삭제
      releaseHold();
      nav(`/golf/bookings/${b.no}/complete`, { replace: true }); // T-17
    }, 1400);
  };

  return (
    <div className="page step">
      <ScreenTag id="S-10" name="결제" refs="FN-22, FN-23 · L-07, L-08, L-09 · API-08~10 · I-06 · T-17, T-18" />
      <div className="mb-1 flex items-center gap-3">
        <button className="grid h-10 w-10 flex-none place-items-center rounded-full hover:bg-surface-2" onClick={back} aria-label={t("back")} disabled={paying}><ArrowLeft size={20} weight="bold" /></button>
        <div className="flex-1"><Steps at={5} hasHotel={p.opts.length > 0} /></div>
      </div>

      {/* 1 남은 시간 (결제 후 자리 없음이면 잡아 둔 자리가 이미 풀렸으므로 숨김) */}
      {error !== "M-174" && <section className={`relative mb-4 flex items-center gap-3 rounded-2xl border-[1.5px] p-4 ${expired ? "border-bad-line bg-bad-soft" : "border-brand-line bg-brand-soft"}`} role={expired ? "alert" : undefined}>
        <Anno n={1} t="남은 시간 (seat_hold.expires_at, 10:00): 1초마다 갱신, 0이 되면 결제 버튼 비활성 + M-171 + 출발일 다시 고르기" />
        <Timer size={24} className={expired ? "text-bad" : "text-brand"} />
        {expired ? (
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-bad">{t("M-171")}</p>
            <button className="link mt-1 text-[14px]" onClick={reselect}>{t("expiredLink")}</button>
          </div>
        ) : (
          <p className="flex-1 text-[14.5px] font-semibold" aria-live="off">
            {t("M-170", { t: "\u0000" }).split("\u0000").map((s, i) => (i ? [<span key="t" className="num px-0.5 text-[18px] font-extrabold text-brand">{mm}</span>, s] : s))}
          </p>
        )}
      </section>}

      {/* 2 결제 요약 */}
      <section className="relative rounded-[20px] bg-surface-2 p-5">
        <Anno n={2} t="결제 요약: 패키지, 출발일·인원, 총액" />
        <p className="text-[13.5px] font-semibold text-muted">{t("payAmount", { n: d.people })}</p>
        <p className="num mt-1 text-[34px] font-extrabold leading-tight tracking-tight">{yen(total)}</p>
        <p className="mt-1 text-[13.5px] text-ink-2">{n(p.name)}</p>
        <p className="num text-[13px] text-muted">{fShort(d.dep!, L)} · {t("peopleN", { n: d.people })} · {t("perPerson")} {yen(unit)}</p>
      </section>

      {/* 3 결제 수단 */}
      <section className="relative mt-5">
        <Anno n={3} t="결제 수단: 카드만, 메인 사이트 결제창으로 이동 (M-172, I-06)" />
        <h2 className="mb-2 text-[16px] font-bold">{t("payMethod")}</h2>
        <div className="opt" role="radio" aria-checked="true">
          <span className="radio" />
          <CreditCard size={22} className="text-brand" />
          <b className="flex-1 text-[15.5px]">{t("card")}</b>
          <span className="text-[12px] text-muted">TRAVENDER</span>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[13px] text-muted"><Lock size={15} className="mt-0.5 flex-none" />{t("M-172")}</p>
      </section>

      <section className="mt-4 flex gap-2.5 rounded-2xl border border-line p-4">
        <Info size={20} className="mt-0.5 flex-none text-brand" />
        <p className="text-[14px] leading-relaxed">{t("M-150", { m: SET.MIN_DEPARTURE, d: fDate(judgeDate(d.dep!), L) })}</p>
      </section>

      <AnimatePresence>
        {error && (
          <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border p-4" style={{ background: "var(--bad-soft)", borderColor: "var(--bad-line)" }}>
            <WarningCircle size={22} weight="fill" className="flex-none text-bad" />
            <div className="flex-1">
              <p className="text-[14.5px] font-bold text-bad">{t(error)}</p>
              {error === "M-174" && <button className="link mt-1 text-[14px]" onClick={reselect}>{t("expiredLink")}</button>}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* 데모 전용 (실서비스 제외) */}
      <div className="mt-6 grid gap-2 rounded-2xl border border-dashed p-3" style={{ borderColor: "var(--anno)" }}>
        <span className="text-[12.5px] font-bold" style={{ color: "var(--anno)" }}>{t("demoPay")}</span>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {(["ok", "fail", "soldout"] as const).map((r) => (
            <button key={r} aria-pressed={payResult === r} onClick={() => setApp({ payResult: r })} className={`min-h-[38px] rounded-lg px-1 text-[12.5px] font-bold ${payResult === r ? "bg-surface shadow-sm" : "text-muted"}`}>{t(r)}</button>
          ))}
        </div>
        <span className="text-[11.5px] text-muted">{user?.memberId}</span>
      </div>

      <BottomBar>
        <span className="absolute -top-3 left-3"><Anno n={4} t="결제 버튼 '¥총액 결제하기' (C-10 중복 탭 방지): 성공 → L-08 → S-11 (T-17) / 실패 → 그대로 (T-18, M-173) / 결제 후 자리 없음 → 자동 환불 (M-174)" /></span>
        <button className="btn btn-primary w-full" disabled={paying || expired || error === "M-174"} onClick={pay} aria-busy={paying}>
          {paying ? (
            <>
              <motion.span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
              {t("paying")}
            </>
          ) : (
            t("payBtn", { p: yen(total) })
          )}
        </button>
      </BottomBar>
    </div>
  );
}
