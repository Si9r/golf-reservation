import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Bus, CalendarBlank, CaretRight, MagnifyingGlass, MapPinLine, Sparkle, UsersThree, X } from "@phosphor-icons/react";
import { AREA_NAME, COURSES, PHOTOS, SET } from "../data";
import { useT } from "../i18n";
import { fullReset, useDb, useDraft } from "../store";
import { fShort, searchPkgs, todayISO, upcomingDepartures, yen } from "../logic";
import { Anno, Img, Q, ScreenTag, StageTag, useStage } from "../components/ui";
import { DatePeopleSheet, TypeBadge } from "../components/booking";
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
    { icon: Bus, t: t("guide1T") },
    { icon: MapPinLine, t: t("guide2T") },
    { icon: UsersThree, t: t("guide3T") },
  ];
  const openPkg = (id: number, dep?: string) => {
    choosePkg(id);
    if (dep) patch({ dep });
    nav(`/golf/packages/${id}`); // T-03
  };
  // 골프장 사진 칸: 누르면 그 골프장 이름으로 검색한 목록 (S-02)
  const openCourse = (name: string) => {
    patch({ q: name });
    nav("/golf/packages");
  };
  const dday = (d: string) => {
    const x = Math.round((Date.parse(d) - Date.parse(todayISO())) / 864e5);
    return x > 0 ? `D-${x}` : "D-DAY";
  };

  return (
    <>
      <div className="lg:px-6 lg:pt-6">

        {/* 1 큰 사진 + 제목 */}
        <section className="relative h-[440px] overflow-hidden bg-[#1d2b22] lg:mx-auto lg:h-[560px] lg:max-w-[1280px] lg:rounded-[28px]">
          <Img className="absolute inset-0" src={PHOTOS.swingCloud} alt={L === "ko" ? "구름 아래 페어웨이에서 스윙하는 골퍼" : "雲の下のフェアウェイでスイングするゴルファー"} eager />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,14,20,0.35) 0%, rgba(10,14,20,0) 30%, rgba(10,14,20,0.1) 55%, rgba(10,14,20,0.78) 100%)" }} />
          <motion.div className="absolute inset-x-5 bottom-20 text-white lg:inset-x-12 lg:bottom-28" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
            <p className="mb-2.5 text-[12px] font-bold tracking-[0.14em]">{t("heroKicker")}</p>
            <h1 className="whitespace-pre-line text-[32px] font-black leading-[1.22] tracking-tight lg:text-[56px]">{t("s01Title")}</h1>
          </motion.div>
        </section>

        <div className="page wide pt-0! pb-6!">
          <ScreenTag id="S-01" name="홈" refs="FN-01, FN-02, FN-13 · L-03 · API-01, API-04 · T-01, T-03" />
          {/* 2~5 조건 입력: 사진 위에 겹친 카드, PC는 한 줄 */}
          <motion.div
            className="relative z-[1] -mt-14 grid gap-2.5 rounded-[22px] bg-surface p-3 lg:mx-auto lg:-mt-16 lg:max-w-[1100px] lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center lg:gap-3 lg:p-4"
            style={{ boxShadow: "var(--shadow-lg)", border: "1px solid var(--line)" }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* 검색: 출발일·인원 칸과 같은 모양 (위에 작은 이름표) */}
            <label className="relative flex min-h-[56px] flex-col justify-center rounded-[14px] bg-surface-2 px-3.5 pr-11">
              <Anno n={2} t="검색창 (V-01): 골프장·지역·호텔 이름 한·일·영 부분 일치, 결과 수 즉시 갱신" />
              <span className="flex items-center gap-1 text-[11.5px] font-bold text-muted"><MagnifyingGlass size={13} className="text-brand" />{t("searchL")}</span>
              <input className="w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-muted" placeholder={t("searchPh")} aria-label={t("searchPh")} value={q} maxLength={SET.SEARCH_MAX} onChange={(e) => patch({ q: e.target.value })} />
              {q && <button className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface" onClick={() => patch({ q: "" })} aria-label={t("close")}><X size={16} /></button>}
            </label>
            {/* 3·4 출발일·인원: 두 칸 (휴대폰 2열, PC는 검색창 옆). 누르면 날짜·인원 시트 */}
            <div className="grid grid-cols-2 gap-2.5 lg:contents">
              <div className="relative">
                <Anno n={3} t="출발일 (필수, CK-01): 날짜·인원 시트, 날짜마다 출발 패키지 수, 11/16~4/19 휴장 (M-110). 미선택이면 homeDateHint" />
                <button type="button" onClick={() => setSheet(true)} className="flex min-h-[56px] w-full flex-col justify-center rounded-[14px] bg-surface-2 px-3.5 text-left">
                  <span className="flex items-center gap-1 text-[11.5px] font-bold text-muted"><CalendarBlank size={13} className="text-brand" />{t("dateL")}</span>
                  <span className={`num text-[15px] leading-snug ${date ? "font-bold" : "text-muted"}`}>{date ? fShort(date, L) : t("datePh")}</span>
                </button>
                {date && (
                  <button type="button" aria-label={t("clearSel")} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface" onClick={() => patch({ date: null })}><X size={15} /></button>
                )}
              </div>
              <div className="relative">
                <Anno n={4} t="인원 (V-02): 1~20명, 날짜·인원 시트에서 바꿈, 바꾸면 결과 수 즉시 갱신" />
                <button type="button" onClick={() => setSheet(true)} className="flex min-h-[56px] w-full flex-col justify-center rounded-[14px] bg-surface-2 px-3.5 text-left">
                  <span className="flex items-center gap-1 text-[11.5px] font-bold text-muted"><UsersThree size={13} className="text-brand" />{t("people")}</span>
                  <span className="num text-[15px] font-bold">{t("peopleN", { n: people })}</span>
                </button>
              </div>
            </div>
            <div className="relative grid gap-2">
              <Anno n={5} t="조건 결과 수 + 패키지 보기 (T-01): 출발일을 고르기 전에는 비활성 + homeDateHint, 0개여도 이동" />
              {date && <p className="text-center text-[13.5px] font-semibold text-ink-2 lg:hidden" aria-live="polite">{t("M-111", { n: results.length })}</p>}
              <button className="btn btn-primary min-h-[56px] w-full lg:min-w-[160px]" disabled={!date} onClick={() => nav("/golf/packages")}>{t("seeBtn")}</button>
            </div>
            {date && <p className="hidden text-center text-[13.5px] font-semibold text-ink-2 lg:col-span-4 lg:block" aria-live="polite">{t("M-111", { n: results.length })}</p>}
          </motion.div>

          {/* 6 이용 안내: 세 줄을 한 띠로 모음 (시안), PC는 가로 세 칸 + 구분선 */}
          <section className="relative mx-auto mt-5 lg:mt-7 lg:max-w-[1100px]" aria-label={L === "ko" ? "이용 안내" : "ご利用案内"}>
            <Anno n={6} t="이용 안내 3칸 (버스·픽업 포함 / 승하차 시내 어디든 / 최소 인원)" />
            <ul className="grid divide-y divide-line rounded-[18px] bg-surface px-4 shadow-[var(--shadow)] lg:grid-cols-3 lg:divide-x lg:divide-y-0 lg:px-0 lg:py-1">
              {guides.map(({ icon: I, t: tt }, i) => (
                <li key={i} className="flex items-center gap-3 py-3.5 text-[14px] font-bold text-ink-2 lg:justify-center lg:py-4">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand-soft text-brand"><I size={19} weight="bold" /></span>
                  <span className="whitespace-normal">{tt.replace(/\n/g, " ")}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* AI 추천 입구 (3단계, F-072) */}
          {stage >= 3 && (
            <section className="relative mt-6">
              <Anno n="AI" t="AI 추천 입구 (3단계, F-072): 프로토타입 추가 항목" />
              <button onClick={() => setAi(true)} className="flex w-full items-center gap-3.5 rounded-[18px] bg-[#14171f] px-[18px] py-4 text-left text-white transition-opacity hover:opacity-95 lg:px-6 lg:py-5">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand text-white"><Sparkle size={24} weight="fill" /></span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex items-center gap-2"><b className="text-[17px]">{t("aiT")}</b><StageTag s={3} /></span>
                  <span className="text-[13px] text-[#c9cdd8]">{t("aiSub")}</span>
                </span>
                <CaretRight size={22} />
              </button>
            </section>
          )}

          {/* 7 추천 / 조건에 맞는 패키지: 사진 크게 */}
          {stage >= 2 && (
            <section className="relative mt-10">
              <Anno n={7} t="추천 패키지 3개 → 검색어·날짜가 있으면 '조건에 맞는 패키지' 최대 7개" />
              <div className="mb-3.5 flex items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 text-[22px] font-black tracking-tight">{conditioned ? t("recMatch") : t("recT")} <StageTag s={2} />{conditioned && <span className="text-[13px] font-normal text-muted">{results.length}</span>}</h2>
                <button className="link text-[14px]" onClick={() => nav("/golf/packages")}>{t("seeAllL")}</button>
              </div>
              {cards.length === 0 ? (
                <p className="rounded-2xl bg-surface-2 p-5 text-[14px] text-muted">{t("M-113")}</p>
              ) : (
                <div className="hscroll -mx-4 gap-3 px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0">
                  {cards.map((r, i) => (
                    <motion.button key={r.p.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.05 }} onClick={() => openPkg(r.p.id, date ?? undefined)} className="group grid w-[290px] flex-none gap-2.5 text-left lg:w-auto">
                      <span className="relative block h-[230px] overflow-hidden rounded-[18px] lg:h-[260px]">
                        <Img src={r.p.photos[0]} alt={n(r.p.name)} className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" />
                        <span className="absolute left-3 top-3"><TypeBadge p={r.p} /></span>
                        {r.d && <span className="num absolute bottom-3 left-3 rounded-[10px] bg-[rgba(20,23,31,0.78)] px-2.5 py-1.5 text-[13px] font-bold text-white">{t("onDate", { d: fShort(r.d, L) })} · {t("seatsBadge", { s: r.seats ?? 0 })}</span>}
                      </span>
                      <span className="grid gap-1 px-0.5">
                        <b className="line-clamp-2 text-[17px] font-bold leading-snug">{n(r.p.name)}</b>
                        <span className="flex items-baseline gap-1.5"><b className="num text-[21px] font-black">{yen(r.p.price)}~</b><span className="text-[12px] text-muted">{t("perPerson")} · {t("busIncl")}</span></span>
                      </span>
                    </motion.button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 골프장 사진 칸 (리디자인 추가): 골프장 이름으로 검색 */}
          {stage >= 2 && (
            <section className="relative mt-11">
              <Anno n="C" t="골프장 사진 칸 (리디자인 추가): 누르면 그 골프장 이름으로 검색한 패키지 목록 (S-02)" />
              <h2 className="mb-3.5 text-[22px] font-black tracking-tight">{t("whereT")}</h2>
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
                {COURSES.slice(0, 4).map((c) => (
                  <button key={c.id} onClick={() => openCourse(n(c.name))} className="group relative h-[210px] overflow-hidden rounded-2xl text-left lg:h-[300px]">
                    <Img src={c.photo} alt={n(c.name)} className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.04]" />
                    <span className="absolute inset-x-0 bottom-0 grid gap-0.5 bg-gradient-to-b from-transparent to-black/85 px-3 pb-3 pt-10 text-white">
                      <span className="text-[11px] font-bold opacity-90">{n(AREA_NAME[c.area])}</span>
                      <b className="text-[15px] leading-snug">{n(c.name)}</b>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 8 곧 출발하는 투어 (2단계) */}
          {stage >= 2 && <section className="relative mt-11">
            <Anno n={8} t="곧 출발하는 투어 6개 (2단계): 출발일·패키지명·잔여석·인원 충족 → S-03 (출발일 선택된 상태)" />
            <h2 className="mb-3.5 flex items-center gap-2 text-[22px] font-black tracking-tight">{t("soonT")} <StageTag s={2} /></h2>
            <div className="grid gap-2.5 lg:grid-cols-3 lg:gap-3">
              {soon.map(({ p, d, seats, enough }) => (
                <button key={`${p.id}-${d}`} onClick={() => openPkg(p.id, d)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 text-left transition-colors hover:border-brand">
                  <span className="relative h-[72px] w-[72px] flex-none overflow-hidden rounded-xl"><Img src={p.photos[0]} alt="" className="absolute inset-0 h-full w-full" /></span>
                  {/* 이름은 두 줄까지 (잘리지 않게 잔여석은 날짜 줄로) */}
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="flex flex-wrap items-baseline gap-x-2"><b className="num text-[17px] font-black text-brand">{dday(d)}</b><span className="num text-[14px] font-bold">{fShort(d, L)}</span><span className="text-[12.5px] font-bold text-ink-2">{t("seatsLeft", { s: seats })}</span></span>
                    <span className="line-clamp-2 text-[14px] font-bold leading-snug">{n(p.name)}</span>
                    {enough && <span className="badge ok w-fit">{t("enough")}</span>}
                  </span>
                </button>
              ))}
            </div>
          </section>}

          <div className="mt-6 flex flex-wrap gap-2"><Q id="Q-02" t="패키지 상세 구성" /><Q id="Q-08" t="가격·통화" /></div>
        </div>
      </div>
      <DatePeopleSheet open={sheet} onClose={() => setSheet(false)} date={date} people={people} onDone={(d, n2) => { patch({ date: d, people: n2 }); setSheet(false); }} />
      <AiSheet open={ai} onClose={() => setAi(false)} />
    </>
  );
}
