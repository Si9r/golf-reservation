import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowCounterClockwise, HourglassMedium, WarningCircle } from "@phosphor-icons/react";
import { useT } from "../i18n";
import { useDb, useDraft } from "../store";
import { Anno, ScreenTag } from "../components/ui";
import { USE_API, api } from "../api/client";
import { refreshMonth, toBooking } from "../api/sync";

const RETRY_MS = 30_000; // 결제 대기(pending·authenticating)면 30초 간격으로
const RETRIES = 3; // 3번 더 확인하고, 그래도 대기면 '확인 중' 안내 (확정은 B-08 결제 확인 배치가 이어서)

type View = "checking" | "pending" | "unpaid" | "canceled";

// 결제 결과 (본 사이트 결제창에서 돌아오는 화면, return_url = #/golf/payment/return?no=예약번호).
// API-21 로 서버에 결과를 물음: 확정 → S-11 / 미결제 → 출발일 다시 고르기 / 대기 → 30초 × 3번 다시 확인 후 '확인 중'
export default function PayReturn() {
  const { t } = useT();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const no = sp.get("no") ?? "";
  const [view, setView] = useState<View>("checking");
  const tries = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const check = () => {
    window.clearTimeout(timer.current);
    setView("checking");
    api.payment(no)
      .then(async (r) => {
        if (r.status === "CONFIRMED") {
          const b = toBooking(await api.booking(no));
          useDb.getState().add(b); // 화면 저장소에도 서버 예약을 넣어 둠 (S-11·S-13 표시용)
          await refreshMonth(b.pkgId, b.dep.slice(0, 7));
          nav(`/golf/bookings/${no}/complete`, { replace: true }); // T-17
        } else if (r.status === "UNPAID") setView("unpaid");
        else if (r.status === "OP_CANCEL") setView("canceled"); // 결제 사이 운행 취소 → 서버가 전액 환불
        else again();
      })
      .catch(again); // 연동 오류도 대기와 같게 다시 확인 (로그인 만료 401 은 client.ts 가 로그인으로 보냄)
  };
  const again = () => {
    if (tries.current >= RETRIES) return setView("pending");
    tries.current += 1;
    timer.current = window.setTimeout(check, RETRY_MS);
  };
  useEffect(() => {
    if (USE_API && no) check();
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [no]);

  if (!USE_API || !no) return <Navigate to="/golf" replace />;
  const reselect = () => {
    const pkgId = useDraft.getState().pkgId;
    useDraft.setState({ pendingNo: null, holdUntil: null, holdPeople: 0, dep: null });
    nav(pkgId ? `/golf/packages/${pkgId}` : "/golf", { replace: true });
  };

  return (
    <div className="page step">
      <ScreenTag id="S-10R" name="결제 결과" refs="API-20, API-21 · B-08 · 본 사이트 결제 연동" />
      <section className="relative grid justify-items-center gap-3 pt-10 text-center" role={view === "checking" ? "status" : "alert"}>
        <Anno n={1} t="결제 결과 확인: CONFIRMED → S-11 / UNPAID → 미결제 안내 + 출발일 다시 고르기 / 대기 → 30초 간격 3번 다시 확인, 그래도 대기면 '확인 중' 안내" />
        {view === "checking" && (
          <>
            <motion.span className="h-10 w-10 rounded-full border-[3px] border-brand border-t-transparent" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
            <h1 className="text-[20px] font-bold">{t("payRetT")}</h1>
            <p className="text-[14px] text-muted">{t("payChecking")}</p>
          </>
        )}
        {view === "pending" && (
          <>
            <span className="grid h-[64px] w-[64px] place-items-center rounded-full bg-warn-soft text-warn"><HourglassMedium size={32} /></span>
            <h1 className="text-[22px] font-bold">{t("payPendingT")}</h1>
            <p className="max-w-[420px] text-[14px] leading-relaxed text-ink-2">{t("payPendingD")}</p>
          </>
        )}
        {(view === "unpaid" || view === "canceled") && (
          <>
            <span className="grid h-[64px] w-[64px] place-items-center rounded-full bg-bad-soft text-bad"><WarningCircle size={34} weight="fill" /></span>
            <h1 className="text-[22px] font-bold">{t(view === "unpaid" ? "payFailT" : "payRetT")}</h1>
            <p className="max-w-[420px] text-[14px] leading-relaxed text-ink-2">{t(view === "unpaid" ? "payFailD" : "payCanceledD")}</p>
          </>
        )}
      </section>

      {view !== "checking" && (
        <section className="relative mx-auto mt-8 grid max-w-[420px] gap-2">
          {view === "pending" && (
            <>
              <button className="btn btn-primary w-full" onClick={() => { tries.current = RETRIES; check(); }}><ArrowCounterClockwise size={18} /> {t("payRetry")}</button>
              <button className="btn btn-ghost w-full" onClick={() => nav("/golf/my", { replace: true })}>{t("myBookings")}</button>
            </>
          )}
          {view === "unpaid" && <button className="btn btn-primary w-full" onClick={reselect}>{t("expiredLink")}</button>}
          <button className="btn btn-ghost w-full" onClick={() => nav("/golf", { replace: true })}>{t("golfHomeBtn")}</button>
        </section>
      )}
    </div>
  );
}
