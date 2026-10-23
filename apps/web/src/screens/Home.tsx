import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Bus, CalendarBlank, CaretDown, CaretRight, MagnifyingGlass, MapPinLine, Sparkle, UsersThree, X } from "@phosphor-icons/react";
import { PHOTOS, SET, ZONES_STRICT } from "../data";
import { useT } from "../i18n";
import { fullReset, useDb, useDraft } from "../store";
import { fShort, searchPkgs, upcomingDepartures } from "../logic";
import { Anno, Img, PeopleInput, Q, ScreenTag, StageTag, useStage } from "../components/ui";
import { DatePeopleSheet, PkgCard, TypeBadge } from "../components/booking";
import { AiSheet } from "./AiSheet";
import { knownPkgIds, useDepartures } from "../api/sync";
import { monthInSeason, monthsAhead } from "../logic";

export default function Home() {
  const { t, n, L } = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const stage = useStage();
  const { q, date, people, patch, choosePkg } = useDraft();
  const extra = useDb((s) => s.extra);
  const apiV = useDepartures(knownPkgIds, monthsAhead().filter(monthInSeason)); // API 모드: 추천·곧 출발 카드의 출발일·잔여석을 서버 값으로 (API-03). 안 받은 달은 프로토타입 계산으로 떨어지므로 판매 달 전부
  const [sheet, setSheet] = useState(false);
  const [ai, setAi] = useState(false);
  // 로고 → 확인 창 '처음으로'(M-101): 홈이 열린 뒤 진행 중 예약을 비움 (L-13)
  useEffect(() => {
    if ((loc.state as { reset?: boolean } | null)?.reset) {
      fullReset();
      nav("/golf", { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.key]);

  // L-03: 검색어·날짜·인원으로 결과 수 즉시 갱신 (필터는 S-02에서)
  const results = useMemo(() => searchPkgs({ q, date, people, extra }), [q, date, people, extra, apiV]);
  const conditioned = !!q.trim() || !!date;
  const cards = conditioned ? results.slice(0, 7) : searchPkgs({ q: "", date: null, people, extra }).filter((r) => r.p.rec).slice(0, 3);
  const soon = useMemo(() => upcomingDepartures(people, extra, 6), [people, extra, apiV]);

  const guides = [
    { icon: Bus, t: t("guide1T"), s: t("guide1S") },
    { icon: MapPinLine, t: t("guide2T"), s: t("guide2S", { r: Math.round(ZONES_STRICT[0].r / 1000) }) }, // 반경은 승하차 범위 설정값 (T-1 확정되면 자동 반영)
    { icon: UsersThree, t: t("guide3T"), s: t("guide3S") },
  ];
  const openPkg = (id: number, dep?: string) => {
    choosePkg(id);
    if (dep) patch({ dep });
    nav(`/golf/packages/${id}`); // T-03
  };

  return (
    <>
      <div className="page wide flush-top pb-6 lg:pb-6 lg:pt-6">
        <div className="pt-4 lg:pt-0"><ScreenTag id="S-01" name="홈" refs="FN-01, FN-02, FN-13 · L-03 · API-01, API-04 · T-01, T-03" /></div>
        <section className="relative -mx-4 lg:mx-0 lg:grid lg:grid-cols-[1.15fr_1fr] lg:items-stretch lg:gap-8">
          <div className="relative h-[250px] overflow-hidden lg:h-auto lg:min-h-[500px] lg:rounded-[24px]">
            <Img className="absolute inset-0" src={PHOTOS.aerialTrees} alt={L === "ko" ? "숲으로 둘러싸인 홋카이도 골프장" : "森に囲まれた北海道のゴルフ場"} eager />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(17,19,26,0.05) 20%, rgba(17,19,26,0.72) 100%)" }} />
            <motion.div className="absolute inset-x-0 bottom-0 p-5 pb-12 text-white lg:p-10" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
              <h1 className="whitespace-pre-line text-[27px] font-bold leading-[1.25] tracking-tight lg:whitespace-normal lg:text-[44px]">{t("s01Title")}</h1>
              <p className="mt-2 max-w-[38ch] text-[14.5px] leading-relaxed text-white/85 lg:max-w-none lg:text-[16px]">{t("s01Sub")}</p>
            </motion.div>
          </div>

          {/* 조건 입력 */}
          <motion.div
            className="relative z-[1] mx-4 -mt-8 grid content-start gap-3.5 rounded-[20px] bg-surface p-5 lg:mx-0 lg:mt-0 lg:self-center lg:p-7"
            style={{ boxShadow: "var(--shadow-lg)", border: "1px solid var(--line)" }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <label className="relative block">
              <Anno n={2} t="검색창 (V-01): 골프장·지역·호텔 이름 한·일·영 부분 일치, 결과 수 즉시 갱신" />
              <span className="sr-only">{t("searchPh")}</span>
              <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-10 pr-10" placeholder={t("searchPh")} value={q} maxLength={SET.SEARCH_MAX} onChange={(e) => patch({ q: e.target.value })} />
              {q && <button className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted" onClick={() => patch({ q: "" })} aria-label={t("close")}><X size={16} /></button>}
            </label>
            <div className="field relative">
              <Anno n={3} t="출발일 (필수, CK-01): 날짜·인원 시트, 날짜마다 출발 패키지 수, 11/16~4/19 휴장 (M-110). 미선택이면 M-127" />
              <span className="label" id="date-l">{t("dateL")}</span>
              <div className="relative">
                <button type="button" aria-labelledby="date-l" onClick={() => setSheet(true)} className="input flex items-center gap-2 pr-11 text-left">
                  <CalendarBlank size={20} className="text-brand" />
                  <span className={`flex-1 ${date ? "font-semibold" : "text-muted"}`}>{date ? fShort(date, L) : t("datePh")}</span>
                  {!date && <CaretDown size={16} className="text-muted" />}
                </button>
                {date && (
                  <button type="button" aria-label={t("clearSel")} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-2" onClick={() => patch({ date: null })}><X size={15} /></button>
                )}
              </div>
            </div>
            <PeopleInput label={t("people")} value={people} onChange={(v) => patch({ people: v })} anno={<Anno n={4} t="인원 (V-02): 1~20명, 바꾸면 결과 수 즉시 갱신" />} />
            <div className="relative grid gap-2">
              <Anno n={5} t="조건 결과 수 + 패키지 보기 (T-01): 출발일을 고르기 전에는 비활성 + M-127, 0개여도 이동" />
              <p className="text-center text-[13.5px] font-semibold text-ink-2" aria-live="polite">{date ? t("M-111", { n: results.length }) : <span className="font-normal text-muted">{t("homeDateHint")}</span>}</p>
              <button className="btn btn-primary w-full" disabled={!date} onClick={() => nav("/golf/packages")}>{t("seeBtn")}</button>
            </div>
          </motion.div>
        </section>

        {/* 6 이용 안내 */}
        <section className="relative mt-8" aria-label={L === "ko" ? "이용 안내" : "ご利用案内"}>
          <Anno n={6} t="이용 안내 3칸 (버스·픽업 포함 / 승하차 시내 어디든 / 최소 20명)" />
          <div className="grid grid-cols-3 gap-2 lg:gap-6">
            {guides.map(({ icon: I, t: tt, s }, i) => (
              <div key={i} className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:gap-4 lg:text-left">
                <span className="mb-2 grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand-soft text-brand lg:mb-0"><I size={24} weight="duotone" /></span>
                <span>
                  <b className="block whitespace-pre-line text-[13.5px] leading-snug lg:whitespace-normal lg:text-[15px]">{tt}</b>
                  <span className="mt-1 hidden text-[13px] leading-relaxed text-muted lg:block">{s}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 7 추천 / 조건에 맞는 패키지 */}
        {stage >= 2 && (
          <section className="relative mt-10">
            <Anno n={7} t="추천 패키지 3개 → 검색어·날짜가 있으면 '조건에 맞는 패키지' 최대 7개" />
            <div className="mb-3 flex items-center gap-2">
              <h2 className="sec-title">{conditioned ? t("recMatch") : t("recT")}</h2>
              <StageTag s={2} />
              {conditioned && <span className="text-[13px] text-muted">{results.length}</span>}
            </div>
            {cards.length === 0 ? (
              <p className="rounded-2xl bg-surface-2 p-5 text-[14px] text-muted">{t("M-113")}</p>
            ) : (
              <div className="hscroll -mx-4 px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0">
                {cards.map((r, i) => (
                  <div key={r.p.id} className="w-[78%] max-w-[320px] lg:w-auto lg:max-w-none">
                    <PkgCard i={i} p={r.p} date={date} d={r.d} seats={r.seats} onOpen={() => openPkg(r.p.id, date ?? undefined)} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 8 곧 출발하는 투어 (2단계) */}
        {stage >= 2 && <section className="relative mt-10">
          <Anno n={8} t="곧 출발하는 투어 6개 (2단계): 출발일·패키지명·잔여석·인원 충족 → S-03 (출발일 선택된 상태)" />
          <h2 className="sec-title flex items-center gap-2">{t("soonT")} <StageTag s={2} /></h2>
          <p className="mb-3 text-[13px] text-muted">{t("soonSub")}</p>
          <div className="hscroll -mx-4 px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-3 lg:overflow-visible lg:px-0">
            {soon.map(({ p, d, seats, enough }) => (
              <button key={`${p.id}-${d}`} onClick={() => openPkg(p.id, d)} className="card flex w-[240px] flex-col gap-2 p-4 text-left transition-colors hover:border-brand lg:w-auto">
                <span className="flex items-center justify-between gap-2">
                  <b className="num text-[17px]">{fShort(d, L)}</b>
                  <TypeBadge p={p} />
                </span>
                <span className="line-clamp-2 text-[14px] font-semibold leading-snug">{n(p.name)}</span>
                <span className="flex items-center gap-2 text-[12.5px]">
                  <span className="text-muted">{t("seatsLeft", { s: seats })}</span>
                  {enough && <span className="badge ok">{t("enough")}</span>}
                  <CaretRight size={14} className="ml-auto text-muted" />
                </span>
              </button>
            ))}
          </div>
        </section>}

        {/* AI 추천 입구 (3단계, 프로토타입 추가) */}
        {stage >= 3 && (
          <section className="relative mt-8">
            <Anno n="AI" t="AI 추천 입구 (3단계, F-072): 프로토타입 추가 항목" />
            <button onClick={() => setAi(true)} className="flex w-full items-center gap-4 rounded-[20px] border-[1.5px] border-dashed border-brand-line bg-brand-soft p-4 text-left transition-colors hover:border-brand lg:p-6">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-brand text-brand-ink"><Sparkle size={24} weight="fill" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><b className="text-[15.5px]">{t("aiT")}</b><StageTag s={3} /></span>
                <span className="block text-[13px] text-ink-2">{t("aiS")}</span>
              </span>
              <CaretRight size={18} className="text-brand" />
            </button>
          </section>
        )}
        <div className="mt-6 flex flex-wrap gap-2"><Q id="Q-02" t="패키지 상세 구성" /><Q id="Q-08" t="가격·통화" /></div>
      </div>
      <DatePeopleSheet open={sheet} onClose={() => setSheet(false)} date={date} people={people} onDone={(d, n2) => { patch({ date: d, people: n2 }); setSheet(false); }} />
      <AiSheet open={ai} onClose={() => setAi(false)} />
    </>
  );
}
