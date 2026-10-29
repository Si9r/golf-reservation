import { useEffect, useState } from "react";
import { Bed, CaretLeft, CaretRight, Check, Plus, Question, Snowflake } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { PKGS, SET, hotelOf, type Pkg } from "../data";
import { useT } from "../i18n";
import { useDb } from "../store";
import {
  addMonths, daysInMonth, dow, dowNames, fMonth, fShort, inClosed, inSeason, judgeDate, monthInSeason, monthsAhead, optionOf, pkgCountOn, roomsOf, rounds, stayHotel, todayISO, totalPrice, ymOf, yen, yenDiff,
} from "../logic";
import { Anno, Img, PeopleInput, Sheet } from "./ui";
import { useCalendar } from "../api/sync";

// ---------- 달력 ----------
export function Calendar({ ym, onMonth, minYm, maxYm, cell, selected, onPick }: {
  ym: string;
  onMonth: (ym: string) => void;
  minYm: string;
  maxYm: string;
  cell: (d: string) => { disabled: boolean; sub?: string; dot?: boolean };
  selected?: string | null;
  onPick: (d: string) => void;
}) {
  const { t, L } = useT();
  const first = dow(`${ym}-01`);
  const n = daysInMonth(ym);
  const today = todayISO();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30" disabled={ym <= minYm} onClick={() => onMonth(addMonths(ym, -1))} aria-label={t("prevM")}>
          <CaretLeft size={18} weight="bold" />
        </button>
        <p className="text-[15.5px] font-bold">{fMonth(ym, L)}</p>
        <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30" disabled={ym >= maxYm} onClick={() => onMonth(addMonths(ym, 1))} aria-label={t("nextM")}>
          <CaretRight size={18} weight="bold" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[12px] font-semibold text-muted">
        {dowNames(L).map((d, i) => (
          <span key={d} className={`py-1 ${i === 0 ? "text-bad" : ""}`}>{d}</span>
        ))}
      </div>
      {!monthInSeason(ym) ? (
        <div className="grid h-[240px] place-items-center rounded-2xl bg-surface-2 text-center text-[14px] text-muted">
          <span className="flex flex-col items-center gap-2"><Snowflake size={28} /> {t("winter")}</span>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: n }, (_, i) => {
            const d = `${ym}-${String(i + 1).padStart(2, "0")}`;
            const c = cell(d);
            const sel = selected === d;
            return (
              <button
                key={d}
                disabled={c.disabled}
                onClick={() => onPick(d)}
                aria-pressed={sel}
                aria-label={`${fShort(d, L)} ${c.sub ?? ""}`}
                className={`relative mx-auto flex h-[54px] w-full max-w-[52px] flex-col items-center justify-center rounded-xl leading-tight transition-colors ${sel ? "bg-brand text-brand-ink" : c.disabled ? "text-line-strong" : "hover:bg-brand-soft"}`}
              >
                <span className={`num text-[15px] font-bold ${d === today && !sel ? "underline decoration-2 underline-offset-4" : ""}`}>{i + 1}</span>
                {c.sub && <span className={`num text-[10.5px] font-semibold ${sel ? "text-brand-ink" : "text-muted"}`}>{c.sub}</span>}
                {c.dot && <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${sel ? "bg-brand-ink" : "bg-ok-bg"}`} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- 날짜·인원 시트 (S-01 #3, S-02 #3, API-04): 날짜마다 그날 출발 가능한 패키지 수, 11/16~4/19 휴장 ----------
export function DatePeopleSheet({ open, onClose, date, people, onDone }: { open: boolean; onClose: () => void; date: string | null; people: number; onDone: (date: string | null, people: number) => void }) {
  const { t } = useT();
  const extra = useDb((s) => s.extra);
  const months = monthsAhead();
  const first = months.find(monthInSeason)!;
  const [d, setD] = useState<string | null>(date);
  const [n, setN] = useState(people);
  const [ym, setYm] = useState(date ? ymOf(date) : first);
  useCalendar(ym, n); // API 모드: 날짜별 패키지 수를 서버에서 (API-04)
  useEffect(() => {
    if (open) {
      setD(date);
      setN(people);
      setYm(date ? ymOf(date) : first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const count = d ? pkgCountOn(d, n, extra) : null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("dateSheetT")}
      footer={
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <button className="btn btn-ghost" disabled={!d} onClick={() => setD(null)}>{t("clearSel")}</button>
          <button className="btn btn-primary" onClick={() => onDone(d, n)}>{t("apply")}</button>
        </div>
      }
    >
      <div className="relative">
        <Anno n="S-01 #3" t="출발일 선택 (필수): 날짜 칸에 그날 출발 가능한 패키지 수, 휴장기(11/16~4/19) 날짜는 '휴장', 판정일이 지나 고를 수 없는 날은 '마감' (M-110)" />
        {/* 7 (팀 테스트 10/23): 휴장기에 걸친 달은 왜 막혀 있는지 한 줄 안내 */}
        {[11, 12, 1, 2, 3, 4].includes(Number(ym.slice(5))) && (
          <p className="mb-2 flex items-start gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-ink-2"><Snowflake size={16} className="mt-0.5 flex-none text-brand" />{t("closedNote")}</p>
        )}
        <Calendar
          ym={ym}
          onMonth={setYm}
          minYm={months[0]}
          maxYm={months[months.length - 1]}
          selected={d}
          onPick={(x) => setD(d === x ? null : x)}
          cell={(x) => {
            if (inClosed(x)) return { disabled: true, sub: t("closedDay") }; // 휴장기
            const c = pkgCountOn(x, n, extra);
            if (c) return { disabled: false, sub: String(c) };
            // 출발 요일·시즌인 날인데 판정일(출발 7일 전)이 지나 고를 수 없으면 '마감'
            const today = todayISO();
            const passed = x > today && judgeDate(x) <= today && PKGS.some((p) => p.wd.includes(dow(x)) && inSeason(x));
            return { disabled: true, sub: passed ? t("closedDep") : undefined };
          }}
        />
        {count !== null && <p className="mt-2 text-[13.5px] font-bold text-brand">{t("M-111", { n: count })}</p>}
      </div>
      <div className="mt-4">
        <PeopleInput label={t("people")} value={n} onChange={setN} anno={<Anno n="S-01 #4" t="인원 (V-02, 1~20명)" />} />
      </div>
    </Sheet>
  );
}

export const dateLabel = (d: string | null, L: "ko" | "ja") => (d ? fShort(d, L) : "");

// ---------- 패키지 카드 (S-02 #9) ----------
// seats: 카드에서 출발일의 잔여석 배지 (수와 상관없이 항상, 팀 결정 10/29)
export function PkgTags({ p, seats }: { p: Pkg; seats?: number }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="chip">{p.nights ? t("nightsDays", { n: p.nights, d: p.nights + 1 }) : t("dayTrip")}</span>
      <span className="chip">{t("roundsN", { n: rounds(p) })}</span>
      <span className={`chip ${p.hotel ? "" : "gray"}`}>{p.hotel ? t("withHotel") : t("noHotel")}</span>
      {seats !== undefined && <span className="badge brand">{t("seatsBadge", { s: seats })}</span>}
    </div>
  );
}
export function TypeBadge({ p, onPhoto }: { p: Pkg; onPhoto?: boolean }) {
  const { t } = useT();
  const bg = p.type === "multi" ? "var(--tag-multi)" : p.type === "stay" ? "var(--tag-stay)" : "var(--tag-day)";
  return (
    <span className={`badge ${onPhoto ? "absolute left-3 top-3" : ""}`} style={{ background: bg, color: "#fff" }}>
      {t(`type_${p.type}`)}
    </span>
  );
}

// 카드 사진 위 유형 이름 + ? : 누르면 유형 설명 (휴대폰에서도 되게 누르기, 다른 곳을 누르면 닫힘)
function TypeHelp({ p }: { p: Pkg }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute left-3 top-3 z-[2] max-w-[calc(100%-24px)]">
      <span className="flex items-center gap-1">
        <TypeBadge p={p} />
        <button type="button" className="grid h-6 w-6 place-items-center rounded-full bg-black/45 text-white" aria-label={t("typeGuideT")} aria-expanded={open} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)}>
          <Question size={14} weight="bold" />
        </button>
      </span>
      {open && <p role="note" className="mt-1.5 rounded-xl bg-surface p-2.5 text-[12.5px] leading-relaxed text-ink-2" style={{ boxShadow: "var(--shadow)" }}>{t(`typeLong_${p.type}`)}</p>}
    </div>
  );
}

export function PkgCard({ p, date, d, seats, onOpen, cmp, onCmp, showCmp, i = 0 }: { p: Pkg; date?: string | null; d: string | null; seats?: number; onOpen: () => void; cmp?: boolean; onCmp?: () => void; showCmp?: boolean; i?: number }) {
  const { t, n, L } = useT();
  const h = hotelOf(p.hotel);
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(i, 6) * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="card group relative flex h-full flex-col overflow-hidden"
      style={{ boxShadow: "var(--shadow)" }}
    >
      {/* 10 (팀 테스트 10/23): 카드 높이 맞춤 — 사진 비율 고정, 이름 2줄·숙소 1줄 말줄임, 가격 줄은 카드 아래 */}
      <button onClick={onOpen} className="flex w-full flex-1 flex-col text-left">
        <div className="relative aspect-[16/10] w-full flex-none overflow-hidden">
          <Img src={p.photos[0]} alt={n(p.name)} className="transition-transform duration-500 group-hover:scale-[1.04]" />
        </div>
        <div className="grid gap-2 p-4 pb-2">
          <h3 className="line-clamp-2 min-h-[2.75em] text-[17px] font-extrabold leading-snug">{n(p.name)}</h3>
          <PkgTags p={p} seats={d ? seats ?? 0 : undefined} />
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
            <Bed size={15} className="flex-none text-muted" />
            <span className="min-w-0">{h ? `${n(h.name)} · ${n(h.near)}` : t("noHotel")}</span>
          </p>
          <p className="text-[13px] text-muted">{d ? (date ? t("onDate", { d: fShort(d, L) }) : t("earliest", { d: fShort(d, L) })) : "-"}</p>
        </div>
      </button>
      <TypeHelp p={p} />
      <div className="mt-auto flex items-end justify-between gap-2 px-4 pb-4">
        <button onClick={onOpen} className="text-left">
          <span className="text-[12px] text-muted">{t("perPerson")} · {t("busIncl")}</span>
          <span className="num block text-[20px] font-extrabold leading-tight">{yen(p.price)}~</span>
        </button>
        {showCmp && (
          <button onClick={onCmp} aria-pressed={cmp} className={`btn btn-xs border-[1.5px] ${cmp ? "border-brand bg-brand-soft text-brand" : "border-dashed border-line-strong bg-surface text-ink-2"}`}>
            {cmp ? <Check size={14} weight="bold" /> : <Plus size={14} weight="bold" />}
            {cmp ? t("cmpAdded") : t("cmpAdd")}
          </button>
        )}
      </div>
    </motion.article>
  );
}

// ---------- 요금 내역 (확인 S-08 · 결제 S-10 공통): 0엔 항목까지 모두 보여 줌 ----------
export function PriceDetail({ p, opt, people, singles }: { p: Pkg; opt: string | null; people: number; singles: number | null }) {
  const { t, n } = useT();
  const o = optionOf(opt);
  const h = stayHotel(p, opt);
  const price = totalPrice(p, opt, people, singles);
  const r = price.rooms ?? (h ? roomsOf(people, singles) : null);
  const add = o?.add ?? 0;
  const Row = ({ k, sub, v, ok }: { k: string; sub?: (string | null | undefined)[]; v: string; ok?: boolean }) => (
    <li className="flex justify-between gap-3">
      <span className="min-w-0 text-ink-2">{k}{sub?.filter(Boolean).map((s, i) => <span key={i} className="block text-[12px] text-muted">{s}</span>)}</span>
      <span className={`num flex-none font-semibold ${ok ? "text-ok" : ""}`}>{v}</span>
    </li>
  );
  const incl = [t("pdGolf", { r: rounds(p) }), p.nights ? t("pdStay", { n: p.nights }) : null].filter(Boolean).join(" · ");
  // 호텔 줄: 호텔·객실·방 구성은 설명 한 줄, 금액은 합계만 (1인 차액은 설명 둘째 줄). 1인실이 없으면 객실 줄은 숨김
  const stay = h ? [n(h.name), o && !o.hotel ? n(o.sub) : n(h.room), r ? t("roomsSum0", { t: r.twins }) : null].filter(Boolean).join(" · ") : o ? n(o.sub) : null;
  return (
    <ul className="grid gap-2 text-[13.5px] lg:text-[14px]">
      <Row k={t("lineBase", { p: yen(p.price), n: people })} sub={[t("pdIncl", { s: incl })]} v={yen(p.price * people)} />
      {/* 숙박 없는 당일 패키지는 호텔 줄을 빼요 (¥0 줄 없음) */}
      {(h || p.opts.length > 0 || add) ? (
        <Row k={t("rowHotel")}
             sub={[stay, add ? `${t("perPerson")} ${yenDiff(add)} × ${people}` : null]}
             v={add ? yenDiff(add * people) : h ? t("included") : yen(0)} />
      ) : null}
      {r?.singles ? <Row k={t("rowSingle")} sub={[t("lineSingle", { p: yen(SET.SINGLE_ADD), n: r.singles })]} v={yen(r.singles * SET.SINGLE_ADD)} /> : null}
      <Row k={t("lineBus")} sub={[t("pdBusSub")]} v={t("included")} ok />
    </ul>
  );
}
