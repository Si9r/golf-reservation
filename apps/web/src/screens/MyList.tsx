import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { CaretRight, Suitcase } from "@phosphor-icons/react";
import { useT } from "../i18n";
import { useAuth, useDb, viewOf } from "../store";
import { fShort } from "../logic";
import { Anno, ScreenTag } from "../components/ui";

// 화면 라벨 → 배지 색
export const LABEL_CLASS: Record<string, string> = { OPEN: "wait", ENOUGH: "ok", GO: "ok", USER_CANCEL: "mute", OP_CANCEL: "bad", DONE: "mute" };

export default function MyList() {
  const { t, n, L } = useT();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const { bookings, extra } = useDb();
  const [tab, setTab] = useState<"up" | "past" | "cancel">("up");
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
              <motion.button key={b.no} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => nav(`/golf/my/${b.no}`)} className="card flex items-center gap-3 p-4 text-left transition-colors hover:border-brand">
                <span className="min-w-0 flex-1">
                  <span className={`badge ${LABEL_CLASS[v.label]}`} style={v.label === "GO" ? { background: "var(--tag-stay)", color: "#fff" } : undefined}>{t(`lab_${v.label}`)}</span>
                  <b className="mt-2 block text-[15.5px] leading-snug">{n(v.p.name)}</b>
                  <span className="block text-[13.5px] text-ink-2">{t("depLine", { d: fShort(b.dep, L), n: b.people })}</span>
                  <span className="num block text-[12.5px] text-muted">{t("noLabel")} {b.no}</span>
                </span>
                <CaretRight size={18} className="text-muted" />
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
