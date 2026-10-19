import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { CalendarBlank, CaretDown, MagnifyingGlass, MagnifyingGlassMinus, SlidersHorizontal, X } from "@phosphor-icons/react";
import { PKGS, SET } from "../data";
import { useT } from "../i18n";
import { DEFAULT_FILTERS, useDraft, useToast } from "../store";
import { fShort, type SearchFilters } from "../logic";
import { usePackageSearch } from "../api/usePackageSearch";
import { Anno, BottomBar, CardSkeleton, ErrorBanner, Q, ScreenTag, Sheet, StageTag, Steps, useStage } from "../components/ui";
import { DatePeopleSheet, PkgCard } from "../components/booking";

type FKey = keyof SearchFilters;
const OPTS: Record<FKey, string[]> = {
  nights: ["all", "0", "1", "2", "3"],
  zone: ["all", "CITY", "RESORT", "NONE"],
  rounds: ["all", "1", "2", "3"],
  sort: ["rec", "priceAsc", "depAsc"],
};

export default function List() {
  const { t, L } = useT();
  const nav = useNavigate();
  const stage = useStage();
  const toast = useToast((s) => s.show);
  const { q, date, people, filters, cmp, patch, choosePkg } = useDraft();
  const [open, setOpen] = useState<FKey | null>(null);
  const [sheet, setSheet] = useState(false);
  const { rows, ...load } = usePackageSearch({ q, date, people, filters }); // API-01 (VITE_USE_API=1) 또는 프로토타입 계산

  const optLabel = (k: FKey, v: string) =>
    k === "nights" ? (v === "all" ? t("nights_all") : v === "0" ? t("nights_0") : t("nights_n", { n: v })) : k === "zone" ? t(`zone_${v}` as "zone_all") : k === "rounds" ? (v === "all" ? t("rounds_all") : t("roundsN", { n: v })) : t(`sort_${v}` as "sort_rec");
  const title: Record<FKey, string> = { nights: t("fNights"), zone: t("fZone"), rounds: t("fRounds"), sort: t("sortT") };
  const setF = (p: Partial<SearchFilters>) => patch({ filters: { ...filters, ...p } });
  const toggleCmp = (id: number) => {
    if (cmp.includes(id)) patch({ cmp: cmp.filter((x) => x !== id) });
    else if (cmp.length >= 3) toast(t("M-112", { n: 3 }));
    else patch({ cmp: [...cmp, id] });
  };
  const anyFilter = (["nights", "zone", "rounds"] as const).some((k) => filters[k] !== "all");
  const anno: Record<FKey, [number, string]> = { nights: [4, "필터: 일정 (전체/당일/1박/2박/3박)"], zone: [5, "필터: 숙소 (시내 호텔/골프장 리조트/숙박 없음, hotel.zone)"], rounds: [6, "필터: 라운드 (1/2/3)"], sort: [7, "정렬 (추천순/낮은 가격순/빠른 출발순)"] };

  return (
    <div className="page wide">
      <ScreenTag id="S-02" name="패키지 목록" refs="FN-03, FN-04, FN-05 · L-03 · API-01 · T-03, T-04" />
      <div className="lg:max-w-[760px]"><Steps at={0} hasHotel /></div>

      <div className="grid gap-2.5 lg:grid-cols-[1fr_auto] lg:gap-3">
        {/* 2 검색창 */}
        <label className="relative block">
          <Anno n={2} t="검색창 (S-01과 같은 조건 공유, V-01)" />
          <span className="sr-only">{t("searchPh")}</span>
          <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-10 pr-10" placeholder={t("searchPh")} value={q} maxLength={SET.SEARCH_MAX} onChange={(e) => patch({ q: e.target.value })} />
          {q && <button className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted" onClick={() => patch({ q: "" })} aria-label={t("close")}><X size={16} /></button>}
        </label>
        {/* 3 조건 요약 바 */}
        <button className="relative flex min-h-[48px] items-center gap-2 rounded-xl bg-surface-2 px-4 text-left" onClick={() => setSheet(true)}>
          <Anno n={3} t="조건 요약 바 '출발일 · 인원 · 변경' → 날짜·인원 시트" />
          <CalendarBlank size={18} className="flex-none text-brand" />
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{date ? fShort(date, L) : t("dateAny")} · {t("peopleN", { n: people })}</span>
          <span className="link text-[14px]">{t("change")}</span>
        </button>
      </div>

      {/* 4~7 필터·정렬 */}
      <div className="-mx-4 mb-2 mt-3">
        <div className="hscroll px-4 py-2">
          <span className="grid h-9 w-7 place-items-center text-muted" aria-hidden="true"><SlidersHorizontal size={18} /></span>
          {(Object.keys(OPTS) as FKey[]).map((k) => {
            const on = k === "sort" ? filters.sort !== "rec" : filters[k] !== "all";
            return (
              <button key={k} className="fchip relative" data-on={on} onClick={() => setOpen(k)} aria-haspopup="dialog">
                <Anno n={anno[k][0]} t={anno[k][1]} />
                <span className="text-muted">{title[k]}</span> {optLabel(k, filters[k])}
                <CaretDown size={13} weight="bold" />
              </button>
            );
          })}
          {anyFilter && <button className="fchip border-dashed" onClick={() => patch({ filters: { ...DEFAULT_FILTERS, sort: filters.sort } })}>{t("resetFilters")}</button>}
        </div>
      </div>

      {/* 8 결과 수 */}
      <p className="relative mb-4 flex flex-wrap items-center gap-2 text-[13.5px] text-muted">
        <Anno n={8} t="결과 수 '패키지 n개 · 가격은 모두 버스·픽업 포함'" />
        {!load.loading && !load.error && t("resultCount", { n: rows.length })}
        <Q id="Q-08" t="가격·통화" />
      </p>

      {/* 12 유형 안내 (피드백 4) */}
      <details className="relative mb-4 rounded-2xl bg-surface-2 px-4 py-3 text-[13px]" open>
        <Anno n={12} t="패키지 유형 안내: n색 골프·체류형·당일 뜻을 한 줄씩 (접기 가능)" />
        <summary className="cursor-pointer font-bold text-ink">{t("typeGuideT")}</summary>
        <ul className="mt-2 grid gap-1.5 text-ink-2">
          {(["multi", "stay", "day"] as const).map((k) => (
            <li key={k}><b className="text-ink">{t(`type_${k}`)}</b> · {t(`typeLong_${k}`)}</li>
          ))}
        </ul>
      </details>

      {load.error && <ErrorBanner onRetry={load.retry} />}

      {load.loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</div>
      ) : load.error ? null : rows.length === 0 ? (
        <div className="relative grid place-items-center gap-3 rounded-[20px] border border-dashed border-line-strong px-6 py-14 text-center">
          <Anno n={11} t="결과 없음 (M-113)" />
          <MagnifyingGlassMinus size={40} className="text-muted" />
          <p className="max-w-[30ch] text-[15px] font-bold">{t("M-113")}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {(anyFilter || q) && <button className="btn btn-sm btn-ghost" onClick={() => patch({ q: "", filters: DEFAULT_FILTERS })}>{t("resetFilters")}</button>}
            <button className="btn btn-sm btn-primary" onClick={() => setSheet(true)}>{t("emptyBtn")}</button>
          </div>
        </div>
      ) : (
        <div className="relative grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Anno n={9} t="패키지 카드: 유형·이름·기간·라운드·호텔 여부·숙소 이름·위치·가장 빠른 출발일·잔여석·1인 가격~ (T-03)" />
          {rows.map(({ p, d, seats }, i) => (
            <div key={p.id} className="relative">
              {i === 0 && stage >= 2 && <span className="absolute bottom-4 right-4"><Anno n={10} t="비교 담기 (최대 3개, M-112)" /></span>}
              <PkgCard i={i} p={p} date={date} d={d} seats={seats} onOpen={() => { choosePkg(p.id); if (date) patch({ dep: date }); nav(`/golf/packages/${p.id}`); }} showCmp={stage >= 2} cmp={cmp.includes(p.id)} onCmp={() => toggleCmp(p.id)} />
            </div>
          ))}
        </div>
      )}

      {/* 10 비교함 */}
      <AnimatePresence>
        {stage >= 2 && cmp.length > 0 && (
          <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}>
            <BottomBar width="wide">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[14px] font-bold">{t("M-112", { n: cmp.length })} <StageTag s={2} /></p>
                <p className="truncate text-[12px] text-muted">{cmp.map((id) => PKGS.find((p) => p.id === id)?.name[L]).join(" · ")}</p>
              </div>
              <button className="btn btn-ghost btn-sm" disabled={cmp.length < 2} onClick={() => nav("/golf/compare")}>{t("cmpView")}</button>
            </BottomBar>
          </motion.div>
        )}
      </AnimatePresence>

      {(Object.keys(OPTS) as FKey[]).map((k) => (
        <Sheet key={k} open={open === k} onClose={() => setOpen(null)} title={title[k]}>
          <div className="grid gap-2" role="radiogroup" aria-label={title[k]}>
            {OPTS[k].map((v) => (
              <button key={v} role="radio" aria-checked={filters[k] === v} className="opt" onClick={() => { setF({ [k]: v } as Partial<SearchFilters>); setOpen(null); }}>
                <span className="radio" />
                <span className="font-semibold">{optLabel(k, v)}</span>
              </button>
            ))}
          </div>
        </Sheet>
      ))}
      <DatePeopleSheet open={sheet} onClose={() => setSheet(false)} date={date} people={people} onDone={(d, n) => { patch({ date: d, people: n }); setSheet(false); }} />
    </div>
  );
}
