import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { CalendarBlank, CaretDown, MagnifyingGlass, MagnifyingGlassMinus, SlidersHorizontal, X } from "@phosphor-icons/react";
import { PKGS, SET } from "../data";
import { useT, dot } from "../i18n";
import { DEFAULT_FILTERS, useDraft, useToast } from "../store";
import { fShort, type SearchFilters } from "../logic";
import { usePackageSearch } from "../api/usePackageSearch";
import { BottomBar, CardSkeleton, ErrorBanner, Sheet } from "../components/ui";
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
  const toast = useToast((s) => s.show);
  const { q, date, people, peopleSet, filters, cmp, patch, choosePkg } = useDraft();
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

  return (
    <div className="page wide">

      <div className="grid gap-2.5 lg:grid-cols-[1fr_auto] lg:gap-3">
        {/* 2 검색창 */}
        <label className="relative block">
          <span className="sr-only">{t("searchPh")}</span>
          <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-10 pr-10" placeholder={t("searchPh")} value={q} maxLength={SET.SEARCH_MAX} onChange={(e) => patch({ q: e.target.value })} />
          {q && <button className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted" onClick={() => patch({ q: "" })} aria-label={t("close")}><X size={16} /></button>}
        </label>
        {/* 3 조건 요약 바 */}
        <button className="relative flex min-h-[48px] items-center gap-2 rounded-xl bg-surface-2 px-4 text-left" onClick={() => setSheet(true)}>
          <CalendarBlank size={18} className="flex-none text-brand" />
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{date ? fShort(date, L) : t("dateAny")}{dot()}{peopleSet ? t("peopleN", { n: people }) : t("peopleAny")}</span>
          <span className="link text-[14px]">{t("change")}</span>
        </button>
      </div>

      {/* 4~6 필터 (정렬은 결과 수 옆) */}
      <div className="-mx-4 mb-2 mt-3">
        <div className="hscroll px-4 py-2">
          <span className="grid h-9 w-7 place-items-center text-muted" aria-hidden="true"><SlidersHorizontal size={18} /></span>
          {(["nights", "zone", "rounds"] as const).map((k) => (
            <button key={k} className="fchip relative" data-on={filters[k] !== "all"} onClick={() => setOpen(k)} aria-haspopup="dialog">
              <span className="whitespace-pre"><span className="text-muted">{title[k]}{t("fColon")}</span>{optLabel(k, filters[k])}</span>
              <CaretDown size={13} weight="bold" />
            </button>
          ))}
          {anyFilter && <button className="fchip border-dashed" onClick={() => patch({ filters: { ...DEFAULT_FILTERS, sort: filters.sort } })}>{t("resetFilters")}</button>}
        </div>
      </div>

      {/* 8 결과 수 · 7 정렬 */}
      <div className="relative mb-4 flex items-center gap-2">
        {!load.loading && !load.error && <h1 className="text-[18px] font-black tracking-tight lg:text-[22px]">{t("resultCount", { n: rows.length })}</h1>}
        <button className="fchip relative ml-auto flex-none" data-on={filters.sort !== "rec"} onClick={() => setOpen("sort")} aria-haspopup="dialog">
          <span className="whitespace-pre"><span className="text-muted">{title.sort}{t("fColon")}</span>{optLabel("sort", filters.sort)}</span>
          <CaretDown size={13} weight="bold" />
        </button>
      </div>

      {load.error && <ErrorBanner onRetry={load.retry} />}

      {load.loading ? (
        <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</div>
      ) : load.error ? null : rows.length === 0 ? (
        <div className="relative grid place-items-center gap-3 rounded-[20px] border border-dashed border-line-strong px-6 py-14 text-center">
          <MagnifyingGlassMinus size={40} className="text-muted" />
          <p className="max-w-[30ch] text-[15px] font-bold">{t("M-113")}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {(anyFilter || q) && <button className="btn btn-sm btn-ghost" onClick={() => patch({ q: "", filters: DEFAULT_FILTERS })}>{t("resetFilters")}</button>}
            <button className="btn btn-sm btn-primary" onClick={() => setSheet(true)}>{t("emptyBtn")}</button>
          </div>
        </div>
      ) : (
        <div className="relative grid gap-4 lg:grid-cols-3">
          {rows.map(({ p, d, seats }, i) => (
            <div key={p.id} className="relative">
              <PkgCard i={i} p={p} date={date} d={d} seats={seats} onOpen={() => { choosePkg(p.id); if (date) patch({ dep: date }); nav(`/golf/packages/${p.id}`); }} showCmp cmp={cmp.includes(p.id)} onCmp={() => toggleCmp(p.id)} />
            </div>
          ))}
        </div>
      )}

      {/* 10 비교함 */}
      <AnimatePresence>
        {cmp.length > 0 && (
          <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}>
            <BottomBar width="wide">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[14px] font-bold">{t("M-112", { n: cmp.length })}</p>
                <p className="truncate text-[12px] text-muted">{cmp.map((id) => PKGS.find((p) => p.id === id)?.name[L]).join(dot())}</p>
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
      <DatePeopleSheet open={sheet} onClose={() => setSheet(false)} date={date} people={people} peopleSet={peopleSet} onDone={(d, n, set) => { patch({ date: d, people: n, peopleSet: set }); setSheet(false); }} />
    </div>
  );
}
