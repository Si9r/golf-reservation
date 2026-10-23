import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { CaretRight, Suitcase } from "@phosphor-icons/react";
import { SET } from "../data";
import { useT } from "../i18n";
import { useAuth, useDb, viewOf } from "../store";
import { fShort, judgeDate, tripEnd } from "../logic";
import { Anno, Img, ScreenTag } from "../components/ui";
import { USE_API } from "../api/client";
import { fetchMyBookings } from "../api/sync";

// 화면 라벨 → 배지 색
export const LABEL_CLASS: Record<string, string> = { OPEN: "wait", ENOUGH: "ok", GO: "ok", USER_CANCEL: "mute", OP_CANCEL: "bad", DONE: "mute" };

export default function MyList() {
  const { t, n, L } = useT();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const { bookings, extra } = useDb();
  const [tab, setTab] = useState<"up" | "past" | "cancel">("up");
  // API 모드: 내 예약을 서버에서 (API-11 → API-12). 브라우저 데모 예약은 쓰지 않음
  useEffect(() => {
    if (!USE_API || !user) return;
    fetchMyBookings().then((bs) => useDb.setState({ bookings: bs })).catch(() => undefined);
  }, [user]);
  const rows = useMemo(() => bookings.map((b) => ({ b, v: viewOf(b, extra) })), [bookings, extra]);
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent("/golf/my")}`} replace />; // E-AUTH → 메인 사이트 로그인
  const list = rows.filter((r) => r.v.tab === tab).sort((a, b) => (tab === "up" ? a.b.dep.localeCompare(b.b.dep) : b.b.dep.localeCompare(a.b.dep))); // 출발일 가까운 순
  return (
    <>
      <div className="page step pb-8 lg:pb-10">
        <ScreenTag id="S-12" name="예약 조회" refs="FN-26 · API-11 · T-21, T-22" />
        <h1 className="text-[24px] font-bold">{t("myBookings")}</h1>
        <p className="mb-4 text-[14px] text-muted">{t("mySub", { n: user.nameKo })}</p>
        <div className="relative mb-4 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
          <Anno n={1} t="탭: 예정(CONFIRMED) / 지난(DONE) / 취소(OP_CANCEL·USER_CANCEL), 탭마다 건수" />
          {(["up", "past", "cancel"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-[44px] rounded-lg px-1 text-[14px] font-bold ${tab === k ? "bg-surface text-brand shadow-sm" : "text-muted"}`}>
              {t(`tab_${k}`)} <span className="num">{rows.filter((r) => r.v.tab === k).length}</span>
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <div className="grid place-items-center gap-3 rounded-[20px] border border-dashed border-line-strong px-6 py-14 text-center">
            <Suitcase size={40} className="text-muted" />
            <p className="text-[16px] font-bold">{t("M-190")}</p>
            <button className="link" onClick={() => nav("/golf")}>{t("browse")}</button>
          </div>
        ) : (
          <div className="relative grid gap-3">
            <Anno n={2} t="예약 카드 (출발일 가까운 순): 상태, 패키지명, 출발일·인원, 예약번호 → S-13 (T-21)" />
            {list.map(({ b, v }, i) => (
              <motion.button key={b.no} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => nav(`/golf/my/${b.no}`)} className="card grid gap-2.5 p-3 text-left transition-colors hover:border-brand">
                <span className="flex items-center gap-3">
                  <span className="relative h-[56px] w-[72px] flex-none overflow-hidden rounded-xl"><Img src={v.p.photos[0]} alt={n(v.p.name)} className="absolute inset-0 h-full w-full" /></span>
                  <span className="min-w-0 flex-1">
                    <b className="line-clamp-2 block text-[15px] font-extrabold leading-snug">{n(v.p.name)}</b>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">{fShort(b.dep, L)} ~ {fShort(tripEnd(v.p, b.dep), L)} <span className="badge brand">{t("peopleN", { n: b.people })}</span></span>
                  </span>
                  <CaretRight size={18} className="flex-none text-muted" />
                </span>
                {/* 상태 띠: 예약 상세 맨 위와 같은 문장·색 */}
                {(() => {
                  const need = Math.max(0, SET.MIN_DEPARTURE - v.booked);
                  const [cls, txt] =
                    v.label === "OPEN" ? ["bg-warn-soft text-warn", t("mdOpenT", { n: need })] :
                    v.label === "ENOUGH" ? ["bg-ok-soft text-ok", t("mdEnoughT")] :
                    v.label === "GO" ? ["bg-brand-soft text-brand", t("mdGoT")] :
                    v.label === "OP_CANCEL" ? ["bg-bad-soft text-bad", t("mdOpCancelT")] :
                    v.label === "USER_CANCEL" ? ["bg-surface-2 text-ink-2", t("mdUserCancelT")] : ["bg-surface-2 text-ink-2", t("mdDoneT")];
                  return (
                    <span className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold ${cls}`}>
                      <span>{txt}</span>
                      {(v.label === "OPEN" || v.label === "ENOUGH") && <span className="num flex-none text-[12px] font-normal">{t("judge", { d: fShort(judgeDate(b.dep), L) })}</span>}
                    </span>
                  );
                })()}
                <span className="num px-1 text-[12px] text-muted">{t("noLabel")} {b.no}</span>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
