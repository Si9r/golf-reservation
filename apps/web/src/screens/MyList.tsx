import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { CaretRight, Headset, Suitcase } from "@phosphor-icons/react";
import { SET } from "../data";
import { useT } from "../i18n";
import { useAuth, useDb, viewOf, type Booking } from "../store";
import { fShort, judgeDate, stayHotel, todayISO, tripEnd, yen } from "../logic";
import { Anno, Img, ScreenTag } from "../components/ui";
import { USE_API } from "../api/client";
import { fetchMyBookings } from "../api/sync";

// 화면 라벨 → 배지 색
export const LABEL_CLASS: Record<string, string> = { OPEN: "wait", ENOUGH: "ok", GO: "ok", USER_CANCEL: "mute", OP_CANCEL: "bad", DONE: "mute" };
// 라벨 → 상태 띠·배지·날짜 칸 색 (예약 상세 맨 위와 같은 색)
const TONE: Record<string, { band: string; chip: string; date: string }> = {
  OPEN: { band: "bg-warn-soft text-warn", chip: "bg-warn-soft text-warn", date: "bg-brand-soft text-brand" },
  ENOUGH: { band: "bg-ok-soft text-ok", chip: "bg-ok-soft text-ok", date: "bg-brand-soft text-brand" },
  GO: { band: "bg-brand-soft text-brand", chip: "bg-brand-soft text-brand", date: "bg-brand text-brand-ink" },
  OP_CANCEL: { band: "bg-bad-soft text-bad", chip: "bg-bad-soft text-bad", date: "bg-bad-soft text-bad" },
  USER_CANCEL: { band: "bg-surface-2 text-ink-2", chip: "bg-surface-2 text-ink-2", date: "bg-surface-2 text-ink-2" },
  DONE: { band: "bg-surface-2 text-ink-2", chip: "bg-surface-2 text-ink-2", date: "bg-surface-2 text-ink-2" },
};
type Row = { b: Booking; v: ReturnType<typeof viewOf> };

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
  const count = (k: typeof tab) => rows.filter((r) => r.v.tab === k).length;
  const open = (b: Booking) => nav(`/golf/my/${b.no}`);

  // 공통 계산: D-day, 상태 문장·모집 막대, 승차·일정·숙소 표시
  const dday = (b: Booking) => {
    const d = Math.round((Date.parse(b.dep) - Date.parse(todayISO())) / 864e5);
    return d > 0 ? `D-${d}` : d === 0 ? "D-DAY" : "";
  };
  const status = ({ b, v }: Row) => {
    const need = Math.max(0, SET.MIN_DEPARTURE - v.booked);
    const txt = v.label === "OPEN" ? t("mdOpenT", { n: need }) : v.label === "ENOUGH" ? t("mdEnoughT") : v.label === "GO" ? t("mdGoT")
      : v.label === "OP_CANCEL" ? t("mdOpCancelT") : v.label === "USER_CANCEL" ? t("mdUserCancelT") : t("mdDoneT");
    const recruiting = v.label === "OPEN" || v.label === "ENOUGH";
    return { txt, sub: recruiting ? t("judge", { d: fShort(judgeDate(b.dep), L) }) : "", bar: recruiting ? Math.min(100, Math.round((v.booked / SET.MIN_DEPARTURE) * 100)) : null };
  };
  const pickTxt = (b: Booking) => (b.pick ? `${n(b.pick.name)} · ${b.pickupTime ?? t("wishAt", { t: b.pickTime ?? "-" })}` : "-");
  const dates = ({ b, v }: Row) => (v.p.nights ? `${fShort(b.dep, L)} – ${fShort(tripEnd(v.p, b.dep), L)}` : fShort(b.dep, L));
  const hotelTxt = ({ b, v }: Row) => {
    const h = stayHotel(v.p, b.opt);
    return h ? n(h.name) : t("noHotel");
  };
  const count15 = (r: Row) => `${r.v.booked} / ${SET.MIN_DEPARTURE}${t("peopleUnit")}`;
  const Bar = ({ pct }: { pct: number }) => (
    <span className="block h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></span>
  );

  const tabs = (
    <div className="relative flex gap-2 lg:gap-1 lg:rounded-xl lg:bg-surface-2 lg:p-1" role="tablist">
      <Anno n={1} t="탭: 예정(CONFIRMED) / 지난(DONE) / 취소(OP_CANCEL·USER_CANCEL), 탭마다 건수" />
      {(["up", "past", "cancel"] as const).map((k) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
          className={`min-h-[40px] rounded-full px-4 text-[14px] font-bold lg:rounded-lg ${tab === k ? "bg-ink text-surface lg:bg-surface lg:text-ink lg:shadow-sm" : "border border-line-strong bg-surface text-ink-2 lg:border-0 lg:bg-transparent lg:text-muted"}`}>
          {t(`tab_${k}`)} <span className="num opacity-70">{count(k)}</span>
        </button>
      ))}
    </div>
  );
  const empty = (
    <div className="grid place-items-center gap-3 rounded-[20px] border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <Suitcase size={40} className="text-muted" />
      <p className="text-[16px] font-bold">{t("M-190")}</p>
      <button className="link" onClick={() => nav("/golf")}>{t("browse")}</button>
    </div>
  );

  // 예약 목록: 호텔·패키지 예약 내역처럼 모든 예약을 같은 카드로 (위: 예약번호·예약일·상태 / 가운데: 사진·내용 / 오른쪽: 금액·버튼). 10/29
  const card = (r: Row, i: number) => {
    const s = status(r), tone = TONE[r.v.label];
    return (
      <motion.article key={r.b.no} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="overflow-hidden rounded-[18px] bg-surface shadow-[var(--shadow)]">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 lg:px-6">
          <span className="num flex min-w-0 flex-wrap gap-x-3 text-[13px] text-muted">
            <span>{t("noLabel")} <b className="text-ink">{r.b.no}</b></span>
            <span>{t("bookedOn")} {fShort(r.b.createdAt.slice(0, 10), L)}</span>
          </span>
          <span className={`flex-none rounded-lg px-2.5 py-1 text-[12px] font-bold ${tone.chip}`}>{t(`lab_${r.v.label}`)}</span>
        </header>
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-4 p-4 lg:grid-cols-[168px_minmax(0,1fr)_200px] lg:gap-6 lg:p-6">
          <button onClick={() => open(r.b)} className="relative h-[88px] overflow-hidden rounded-xl lg:h-[120px]" aria-label={n(r.v.p.name)}><Img src={r.v.p.photos[0]} alt={n(r.v.p.name)} className="absolute inset-0 h-full w-full" /></button>
          <div className="grid min-w-0 content-start gap-1.5">
            <button onClick={() => open(r.b)} className="text-left text-[16px] font-black leading-snug hover:text-brand lg:text-[18px]">
              {dday(r.b) && <span className="num mr-1.5 align-middle text-[12px] font-black text-brand">{dday(r.b)}</span>}{n(r.v.p.name)}
            </button>
            <span className="num text-[13.5px] text-ink-2">{dates(r)} · {t("peopleN", { n: r.b.people })}</span>
            <span className="hidden text-[13.5px] text-ink-2 lg:block"><span className="text-muted">{t("pick")}</span> {pickTxt(r.b)} · <span className="text-muted">{t("rowHotel")}</span> {hotelTxt(r)}</span>
            {s.bar !== null ? (
              <span className="mt-1 grid max-w-[420px] gap-1">
                <span className="flex justify-between gap-2 text-[12.5px]"><b className={tone.chip.split(" ")[1]}>{s.txt}</b><span className="num flex-none whitespace-nowrap font-bold">{count15(r)}</span></span>
                <Bar pct={s.bar} />
              </span>
            ) : <span className={`text-[13px] font-bold ${tone.chip.split(" ")[1]}`}>{s.txt}</span>}
          </div>
          <div className="col-span-2 flex items-center justify-between gap-3 border-t border-line pt-4 lg:col-span-1 lg:flex-col lg:items-stretch lg:justify-center lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <span className="grid lg:text-right"><span className="text-[12.5px] text-muted">{t("totalL", { n: r.b.people })}</span><b className="num text-[20px] font-black">{yen(r.b.total)}</b></span>
            <button className="btn btn-primary btn-sm lg:w-full" onClick={() => open(r.b)}>{t("detail")}</button>
          </div>
        </div>
      </motion.article>
    );
  };
  const listEl = <div className="grid gap-3 lg:gap-4">{list.length === 0 ? empty : list.map(card)}</div>;
  // 아래 바로가기: 고객센터 · 패키지 둘러보기
  const quick = (
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <button onClick={() => nav("/golf/support")} className="flex items-center gap-4 rounded-[18px] bg-surface-2 p-4 text-left hover:bg-surface hover:shadow-[var(--shadow)] lg:p-5">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-surface text-brand"><Headset size={22} /></span>
        <span className="grid flex-1 gap-0.5"><b className="text-[15px]">{t("support")}</b><span className="num text-[13px] text-muted">{SET.SUPPORT_TEL} · {t("hoursV")}</span></span>
        <CaretRight size={18} className="text-muted" />
      </button>
      <button onClick={() => nav("/golf/packages")} className="flex items-center gap-4 rounded-[18px] bg-surface-2 p-4 text-left hover:bg-surface hover:shadow-[var(--shadow)] lg:p-5">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-surface text-brand"><Suitcase size={22} /></span>
        <span className="grid flex-1 gap-0.5"><b className="text-[15px]">{t("browse")}</b><span className="text-[13px] text-muted">{t("allPkgs")}</span></span>
        <CaretRight size={18} className="text-muted" />
      </button>
    </div>
  );

  return (
    <div className="page step pb-8 lg:max-w-[1240px]! lg:pb-10">
      <ScreenTag id="S-12" name="예약 조회" refs="FN-26 · API-11 · T-21, T-22" />
      {/* PC: 왼쪽 메뉴 없이 넓게 (위 골프 탭과 겹쳐서 뺌, 10/29) */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 lg:mb-6">
        <div>
          <h1 className="text-[24px] font-bold lg:text-[30px] lg:font-black">{t("myBookings")}</h1>
          <p className="text-[14px] text-muted lg:text-[15px]">{t("mySub", { n: user.nameKo })}</p>
        </div>
        {tabs}
      </div>
      {listEl}
      {quick}
    </div>
  );
}
