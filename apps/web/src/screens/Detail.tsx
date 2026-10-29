import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowSquareOut, Bed, Bus, CaretDown, CheckCircle, Flag, Info, MapPin, MinusCircle, Star, Sun, Warning } from "@phosphor-icons/react";
import { AREA_NAME, SET, hotelOf, pkgOf, type Pkg } from "../data";
import { useT } from "../i18n";
import { useDb, useDraft } from "../store";
import { useDepartures } from "../api/sync";
import { addDays, coursesOf, departuresIn, depView, dowNames, fDate, fDayLong, fMonth, fMonthShort, fShort, hasHotelStep, itinerary, judgeDate, monthInSeason, monthsAhead, optionOf, prevAt, todayISO, tripEnd, yen, yenDiff, ymOf, type ItinItem } from "../logic";
import { Anno, BottomBar, Collapse, ErrorBanner, gmapLink, Img, PeopleInput, PriceBlock, Q, ScreenTag, StepHead, useFakeLoad } from "../components/ui";
import { PkgTags, TypeBadge } from "../components/booking";
import { LegRow, MapView, type MapMarker } from "../components/GoogleMap";
import { takeSeatNotice, useSeatGuard } from "../api/seatCheck";

export const ICON: Record<ItinItem["kind"], typeof Bus> = { bus: Bus, golf: Flag, hotel: Bed, drop: MapPin, free: Sun };

export default function Detail() {
  const { id } = useParams();
  const p = pkgOf(Number(id));
  if (!p) return <Navigate to="/golf/packages" replace />;
  return <DetailInner key={p.id} p={p} />;
}

function DetailInner({ p }: { p: Pkg }) {
  const { t, n, L, list } = useT();
  const nav = useNavigate();
  const d = useDraft();
  const extra = useDb((s) => s.extra);
  const load = useFakeLoad(`pkg-${p.id}`, 450);
  const apiV = useDepartures([p.id], monthsAhead().filter(monthInSeason)); // API 모드: 출발편·잔여석을 서버에서 (API-03)

  useEffect(() => {
    if (d.pkgId !== p.id) d.choosePkg(p.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);
  const dep = d.pkgId === p.id ? d.dep : null;

  // 4 월 탭: 시즌 달만. 처음에는 고른 출발일(또는 S-01 날짜)의 달, 없으면 가장 빠른 달
  const months = useMemo(() => monthsAhead().filter((m) => monthInSeason(m) && departuresIn(p, m).length > 0), [p, apiV]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstOk = months.find((m) => departuresIn(p, m).some((x) => depView(p.id, x, d.people, extra).state !== "unavailable")) ?? months[0];
  const [ym, setYm] = useState(dep ? ymOf(dep) : d.date && months.includes(ymOf(d.date)) ? ymOf(d.date) : firstOk);
  useEffect(() => {
    if (!dep && d.date && departuresIn(p, ymOf(d.date)).includes(d.date) && depView(p.id, d.date, d.people, extra).state !== "unavailable") d.patch({ dep: d.date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const deps = months.length ? departuresIn(p, ym) : [];
  const v = dep ? depView(p.id, dep, d.people, extra) : null;
  const seatErr = v && v.state === "unavailable" ? t("M-120", { s: v.seats, n: d.people }) : null;
  const canGo = !!dep && !seatErr;
  const hotel = hotelOf(p.hotel);
  const courses = coursesOf(p);
  const itin = itinerary(p, p.opts[0] ?? null, null, null);
  const [openDays, setOpenDays] = useState<boolean[]>(() => itin.map((_, i) => i === 0)); // 1일차만 펼침
  // 지도 핀마다 무엇인지: 골프장은 라운드하는 일차, 호텔은 숙박 (호텔 옵션 화면 지도는 없애고 위치는 여기서만 보여 줌)
  const dayRole = (cid: number) => {
    const ds = p.days.map((r, i) => (r?.course === cid ? i + 1 : 0)).filter(Boolean);
    const txt = ds.length > 1 && ds[ds.length - 1] - ds[0] === ds.length - 1 ? `${ds[0]}~${ds[ds.length - 1]}` : ds.join("·");
    return L === "ko" ? `${txt}일차` : `${txt}日目`;
  };
  const places = [
    ...courses.map((c, i) => ({ key: `c${c.id}`, label: n(c.name), role: dayRole(c.id), q: c.name.ja, placeId: c.placeId as string | undefined, lat: c.lat, lng: c.lng, kind: "golf" as const, glyph: String(i + 1) })),
    ...(hotel ? [{ key: "h", label: n(hotel.name), role: L === "ko" ? "숙박" : "宿泊", q: hotel.name.ja.replace(/（例）|\(例\)/, ""), placeId: undefined, lat: hotel.lat, lng: hotel.lng, kind: "hotel" as const, glyph: "H" }] : []),
  ];
  const [mapKey, setMapKey] = useState<string>("all"); // 9 위치 지도: 처음엔 전체(골프장·호텔 핀 모두), 버튼을 누르면 그곳으로
  const mapPlace = mapKey === "all" ? null : places.find((x) => x.key === mapKey) ?? null;
  const markers = useMemo<MapMarker[]>(() => places.map((x) => ({ lat: x.lat, lng: x.lng, title: `${x.label} · ${x.role}`, kind: x.kind, glyph: x.glyph })), [p.id, hotel?.id, L]); // eslint-disable-line react-hooks/exhaustive-deps
  const reserveRef = useRef<HTMLDivElement>(null);
  const guard = useSeatGuard();
  // B-01: 다음 단계에서 잔여석이 바뀐 것을 알고 돌아온 경우 (M-128). 출발일을 다시 고르면 사라짐
  const [seatNotice] = useState(() => takeSeatNotice(p.id));
  const seatChanged = seatNotice && !dep;
  useEffect(() => {
    if (seatChanged) window.setTimeout(() => reserveRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = () => {
    if (!canGo) {
      reserveRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // B-01: 넘어가기 전에 잔여석·판정일을 다시 확인 (api/seatCheck.ts)
    guard(() => {
      if (d.editReturn) nav("/golf/book/review"); // T-28
      else nav(hasHotelStep(p) ? "/golf/book/hotel" : "/golf/book/place"); // T-06 / T-07 (숙박 있는 패키지는 옵션이 없어도 S-05)
    });
  };
  const btnLabel = d.editReturn ? t("editBack") : dep ? t("reserve") : t("pickDepFirst");

  const reserve = (
    <div ref={reserveRef} className="relative grid gap-4">
      <div className="hidden items-end justify-between lg:flex">
        <div>
          <p className="text-[12.5px] text-muted">{t("perPerson")} · {t("busIncl")}</p>
          <p className="num text-[26px] font-extrabold leading-tight">{yen(p.price)}~</p>
        </div>
        <Q id="Q-08" t="가격·통화" />
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="sec-title">{t("depSelect")}</h2>
        <span className="text-[12.5px] text-muted">{t("depMeta")}</span>
      </div>
      <p className="-mt-2 flex items-center gap-1.5 text-[13px] text-ink-2">
        <Info size={16} className="flex-none text-brand" />
        {t("weekdays", { w: p.wd.map((x) => dowNames(L)[x]).join("·") })}
      </p>
      {/* 3 인원 (출발일 목록과 같은 칸) */}
      <PeopleInput label={t("people")} value={d.people} onChange={(x) => d.patch({ people: x })} anno={<Anno n={3} t="인원 (V-02): 바꾸면 고를 수 있는 날짜가 바로 바뀜" />} />
      {/* 4 월 탭 + 출발일 목록 */}
      <div className="relative grid gap-2.5">
        <Anno n={4} t="월 탭 + 출발일 목록 (L-01·L-02·L-04): 현재 n명 / 최소 20명, 잔여석, 20명 이상 '인원 충족', 잔여석 < 인원이면 선택 불가 (T-29)" />
        <div className="hscroll -mx-1 px-1" role="tablist" aria-label={t("depSelect")}>
          {months.map((m) => (
            <button key={m} role="tab" aria-selected={ym === m} onClick={() => setYm(m)} className="fchip" data-on={ym === m}>
              {m.slice(0, 4) === todayISO().slice(0, 4) ? fMonthShort(m, L) : fMonth(m, L)}
            </button>
          ))}
        </div>
        {seatChanged && <p className="err rounded-xl p-3" role="alert" style={{ background: "var(--bad-soft)" }}>{t("M-128")}</p>}
        <div className="grid gap-2" role="radiogroup" aria-label={t("depSelect")}>
          {deps.length === 0 && <p className="rounded-xl bg-surface-2 p-4 text-[14px] text-muted">{t("depNone", { m: fMonthShort(ym, L) })}</p>}
          {deps.map((x) => {
            const dv = depView(p.id, x, d.people, extra);
            const full = dv.seats === 0;
            const off = dv.state === "unavailable";
            const enough = dv.booked >= SET.MIN_DEPARTURE;
            return (
              <button key={x} role="radio" aria-checked={dep === x} disabled={off} className="opt" onClick={() => d.patch({ dep: x })}>
                <span className="radio" />
                <span className="min-w-0 flex-1">
                  <b className="num block text-[15px]">{fShort(x, L)}</b>
                  <span className={`block text-[12.5px] ${enough && !off ? "font-semibold text-ok" : "text-muted"}`}>
                    {full ? t("depEnough", { b: dv.booked }) : off ? t("depShort", { n: d.people }) : enough ? t("depEnough", { b: dv.booked }) : t("depNow", { b: dv.booked })}
                  </span>
                </span>
                <span className={`num text-[13px] font-semibold ${off ? "text-muted" : "text-ink-2"}`}>{full ? t("full") : t("seatsNow", { s: dv.seats })}</span>
              </button>
            );
          })}
        </div>
        {seatErr && <p className="err" role="alert">{seatErr}</p>}
      </div>
      {/* 5 출발 확정 막대 */}
      {dep && v && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="relative grid gap-2 rounded-2xl bg-surface-2 p-4">
          <Anno n={5} t="출발 확정 현황 (1단계, L-04): M-121 + 막대 + 상태 문구 M-122 / M-125 / M-123" />
          <p className="num text-[14px] font-bold">{fDate(dep, L)} ~ {fShort(tripEnd(p, dep), L)}</p>
          {(
            <>
              <div className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="text-ink-2">{t("M-121", { a: v.booked, b: d.people, t: v.sum, m: SET.MIN_DEPARTURE })}</span>
              </div>
              <Meter now={v.booked} add={Math.min(d.people, v.seats)} />
              <DepStateText v={v} dep={dep} />
            </>
          )}
        </motion.div>
      )}
      <button className="btn btn-primary hidden w-full lg:inline-flex" disabled={!canGo} onClick={go}>{btnLabel}</button>
    </div>
  );

  return (
    <div className="page wide">
      <ScreenTag id="S-03" name="패키지 상세" refs="FN-06~08, FN-11, FN-18 · L-01·02·04·11 · API-02, API-03 · T-06, T-07, T-28, T-29" />
      <StepHead at={0} hasHotel={hasHotelStep(p)} onBack={() => (d.editReturn ? nav("/golf/book/review") : nav("/golf/packages"))} className="lg:-mt-1" />
      {load.error && <ErrorBanner onRetry={load.retry} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
        <div className="grid gap-5 lg:col-start-1 lg:row-start-1">
          <Gallery p={p} loading={load.loading} />
          {/* 1 유형·이름·태그·설명 */}
          <section className="relative grid gap-2.5">
            <Anno n={1} t="사진·유형(n색/체류형/당일) + 유형 설명 한 줄·이름·태그(기간·라운드·호텔)·설명" />
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge p={p} />
              <span className="text-[12.5px] text-muted">{t(`typeDesc_${p.type}`)}</span>
            </div>
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">{t(`typeLong_${p.type}`)}</p>
            <h1 className="text-[23px] font-bold leading-snug tracking-tight lg:text-[30px]">{n(p.name)}</h1>
            <PkgTags p={p} />
            <p className="text-[14.5px] leading-relaxed text-ink-2">{n(p.short)}</p>
          </section>
          {/* 2 포함 사항 */}
          <section className="relative soft grid gap-3 p-4 sm:grid-cols-2">
            <Anno n={2} t="포함 사항 (package.includes) + 불포함 항목" />
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold">{t("incl")} <Q id="Q-02" t="패키지 데이터 항목" /></h2>
              <ul className="grid gap-1.5 text-[14px]">
                <li className="flex gap-2"><CheckCircle size={18} weight="fill" className="mt-0.5 flex-none text-brand" /><b>{t("inclBus")}</b></li>
                {p.extra.map((e) => <li key={e.ko} className="flex gap-2 text-ink-2"><CheckCircle size={18} weight="fill" className="mt-0.5 flex-none text-brand" />{n(e)}</li>)}
              </ul>
            </div>
            <div>
              <h2 className="mb-2 text-[15px] font-bold">{t("excl")}</h2>
              <ul className="grid gap-1.5 text-[14px] text-ink-2">
                {p.excl.map((e) => <li key={e.ko} className="flex gap-2"><MinusCircle size={18} className="mt-0.5 flex-none text-muted" />{n(e)}</li>)}
              </ul>
            </div>
          </section>
        </div>

        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="lg:sticky lg:top-[112px] lg:rounded-[20px] lg:border lg:border-line lg:bg-surface lg:p-5">{reserve}</div>
        </aside>

        <div className="grid gap-8 lg:col-start-1 lg:row-start-2">
          {/* 6 일정표 */}
          <section className="relative">
            <Anno n={6} t="일정표 (L-11): 1일차만 펼침, 모두 펼치기, 날짜 고르면 일자 표시, 승차 시간은 출발 확정 후 안내" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="sec-title">{t("itin")}</h2>
              <button className="link text-[13.5px]" onClick={() => setOpenDays(itin.map(() => !openDays.every(Boolean)))}>{openDays.every(Boolean) ? t("closeAll") : t("openAll")}</button>
            </div>
            <div className="grid gap-2">
              {itin.map((items, i) => (
                <div key={i} className="card overflow-hidden">
                  <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left" aria-expanded={openDays[i]} onClick={() => setOpenDays(openDays.map((o, j) => (j === i ? !o : o)))}>
                    <b className="text-[15px]">{t("dayN", { i: i + 1 })}</b>
                    {dep && <span className="num text-[13px] font-semibold text-brand">{fShort(addDays(dep, i), L)}</span>}
                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{items.filter((x) => x.kind === "golf").map((x) => x.title[L].split(/ · |・/)[0]).join(", ") || items[0]?.title[L]}</span>
                    <CaretDown size={16} className={`transition-transform ${openDays[i] ? "rotate-180" : ""}`} />
                  </button>
                  <Collapse open={openDays[i]}>
                    <ItinList items={items} />
                  </Collapse>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-muted">{t("driveNote")}</p>
          </section>

          {/* 7 골프장 정보 */}
          <section className="relative">
            <Anno n={7} t="골프장 정보: 이름, 홀 수, 캐디, 평점, 지역, 구글 지도 링크 (I-03)" />
            <h2 className="sec-title mb-3">{t("courseInfo")}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {courses.map((c) => (
                <div key={c.id} className="card flex flex-col overflow-hidden">
                  {/* 사진은 칸 높이에 맞춰 채우고(원본 비율 무시), 소개 칸이 남는 높이를 채워 옆 카드와 칸을 맞춤 */}
                  <div className="flex h-[112px] items-stretch">
                    <div className="relative w-[104px] flex-none"><Img src={c.photo} alt={n(c.name)} className="absolute inset-0 h-full w-full" /></div>
                    <div className="min-w-0 flex-1 p-3">
                      <b className="block text-[14.5px] leading-snug">{n(c.name)}</b>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
                        <span>{n(AREA_NAME[c.area])}</span>
                        <span>{t("holes", { n: c.holes })}</span>
                        <span>{c.caddie ? t("caddie") : t("self")}</span>
                        <span className="inline-flex items-center gap-0.5"><Star size={12} weight="fill" className="text-[#F59E0B]" /><span className="num">{c.rating.toFixed(1)}</span></span>
                      </span>
                      <a className="link mt-1.5 inline-flex items-center gap-1 text-[12.5px]" href={gmapLink(c.name.ja, c.placeId)} target="_blank" rel="noreferrer">{t("openGmap")} <ArrowSquareOut size={13} /></a>
                    </div>
                  </div>
                  <p className="flex-1 border-t border-line px-3 py-2.5 text-[13px] text-ink-2">{n(c.intro)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 8 숙박 호텔 */}
          {hotel && (
            <section className="relative">
              <Anno n={8} t="숙박 호텔: 이름, 객실, 평점, 위치(역에서 몇 분), TRAVENDER 호텔 페이지 링크, 옵션 수 안내" />
              <h2 className="sec-title mb-3">{t("hotelInfo")}</h2>
              <div className="card grid gap-1.5 p-4">
                <b className="flex flex-wrap items-center gap-2 text-[15px]">
                  {n(hotel.name)}
                  {p.opts.length > 1 && <span className="badge brand">{t("defaultHotel")}</span>}
                </b>
                <p className="text-[13px] text-muted">
                  {t("roomType")} {n(hotel.room)} · {n(hotel.near)}
                  {hotel.rating && <> · ★ <span className="num">{hotel.rating}</span></>}
                </p>
                {hotel.zone === "CITY" && <a className="link inline-flex items-center gap-1 text-[13px]" href="https://travender-hokkaido.com/hotels" target="_blank" rel="noreferrer">{t("hotelPage")} <ArrowSquareOut size={13} /></a>}
                {!p.opts.length && <p className="text-[13px] text-ink-2">{t("hotelFixed")}</p>}
                {/* 기본 호텔 외에 다음 단계(호텔 옵션)에서 바꿀 수 있는 것: 다른 호텔·객실 업그레이드·호텔 없이 + 1인 가격 차이 */}
                {p.opts.length > 1 && (
                  <div className="mt-1 rounded-xl bg-surface-2 p-3">
                    <p className="text-[13px] font-semibold text-brand">{t("optChangeT")}</p>
                    <ul className="mt-1.5 grid gap-1 text-[13px] text-ink-2">
                      {p.opts.slice(1).map((id) => {
                        const o = optionOf(id)!;
                        const oh = o.hotel ? hotelOf(o.hotel) : null;
                        const label = oh ? n(oh.name) : `${n(o.name)} · ${n(o.sub)}`;
                        return (
                          <li key={id} className="flex justify-between gap-3">
                            <span className="min-w-0">· {label}</span>
                            <span className={`num flex-none font-semibold ${o.add < 0 ? "text-ok" : "text-ink"}`}>{o.add === 0 ? t("sameP") : yenDiff(o.add)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 9 위치 지도 */}
          <section className="relative">
            <Anno n={9} t="위치 지도 (I-01): 첫 골프장, 골프장·호텔 탭을 바꾸면 핀 이동" />
            <h2 className="sec-title mb-3">{t("mapT")}</h2>
            <div className="hscroll mb-3">
              <button className="fchip" data-on={mapKey === "all"} onClick={() => setMapKey("all")}>{L === "ko" ? "전체 보기" : "全体を表示"}</button>
              {places.map((x) => (
                <button key={x.key} className="fchip" data-on={mapKey === x.key} onClick={() => setMapKey(x.key)}>
                  <span className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold text-white" style={{ background: x.kind === "golf" ? "var(--tag-stay)" : "var(--tag-multi)" }}>{x.glyph}</span>
                  {x.label}
                  <span className="text-[12px] font-normal text-muted">· {x.role}</span>
                </button>
              ))}
            </div>
            <MapView markers={markers} center={mapPlace ? { lat: mapPlace.lat, lng: mapPlace.lng } : null} zoom={13} focusKey={mapKey} label={t("mapT")} className="aspect-[16/10] lg:aspect-video" />
            {mapPlace && (<a className="link mt-2 inline-flex items-center gap-1 text-[13px]" href={gmapLink(mapPlace.q, mapPlace.placeId)} target="_blank" rel="noreferrer">{mapPlace.label} · {t("openGmap")} <ArrowSquareOut size={14} /></a>)}
          </section>

          {/* 10 렌탈 안내·예약 전 확인 */}
          <section className="relative grid gap-3">
            <Anno n={10} t="렌탈 안내(M-124)·예약 전 확인: 최소 20명, 시내만 승하차, 그룹당 1곳, 변경·취소는 고객센터" />
            <div className="rounded-2xl border border-warn-line bg-warn-soft p-4">
              <b className="mb-1.5 flex items-center gap-2 text-[14.5px] text-warn"><Warning size={18} weight="fill" /> {t("checksT")}</b>
              <ul className="grid list-disc gap-1 pl-5 text-[13.5px] text-ink-2">{list("checks").map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </section>
        </div>
      </div>

      {/* 11 하단 예약 버튼 (모바일) */}
      <div className="lg:hidden">
        <BottomBar>
          <span className="absolute -top-3 left-3"><Anno n={11} t="하단 예약 버튼: 출발일 선택 + 잔여석 ≥ 인원일 때만 '이 패키지 예약', S-08에서 왔으면 '변경 완료 · 확인으로'" /></span>
          <PriceBlock main={`${yen(p.price)}~`} sub={dep ? `${fShort(dep, L)} · ${t("peopleN", { n: d.people })} · ${t("busIncl")}` : `${t("perPerson")} · ${t("busIncl")}`} />
          <button className="btn btn-primary min-w-[150px]" disabled={!canGo} onClick={go}>{btnLabel}</button>
        </BottomBar>
      </div>
    </div>
  );
}

// L-04 상태 문구 (판정 전에는 20명 이상이어도 '인원 충족', 출발 확정은 판정일 B-01).
// 남은 자리가 0이면 '잔여 0석' 대신 '정원이 다 찼어요' / '마감'으로
export function DepStateText({ v, dep, go, showErr }: { v: ReturnType<typeof depView>; dep: string; go?: boolean; showErr?: boolean }) {
  const { t, L } = useT();
  if (v.state === "unavailable") return showErr ? <p className="err text-[12.5px]">{t("M-120", { s: v.seats, n: v.sum - v.booked })}</p> : null;
  if (go) return <p className="text-[12.5px] font-semibold text-ok">{v.seatsAfter ? t("M-123", { s: v.seatsAfter }) : t("goFull")}</p>;
  // 최소 인원이 모였으면 '인원 충족'·'정원이 다 찼어요', 아니면 한 줄 '{판정일}까지 n명 더 모이면 출발' (팀 결정 10/29)
  if (v.state === "enough") return <p className="text-[12.5px] font-semibold text-ok">{v.seatsAfter ? t("M-125", { d: fDayLong(judgeDate(dep), L) }) : t("depFull", { m: SET.BUS_SEATS, d: fDayLong(judgeDate(dep), L) })}</p>;
  return <p className="text-[12.5px] font-semibold text-ink-2">{t("needBy", { d: fDayLong(judgeDate(dep), L), n: v.need })}</p>;
}

// 일정 목록 (구간 이동 시간 포함)
export function ItinList({ items, memo }: { items: ItinItem[]; memo?: string }) {
  const { t, L } = useT();
  return (
    <ol className="grid gap-0 px-4 pb-4">
      {items.map((it, j) => {
        const I = ICON[it.kind];
        return (
          <Fragment key={j}>
            {j > 0 && <LegRow from={prevAt(items, j)} to={it.at} />}
            <li className="relative grid grid-cols-[52px_28px_1fr] gap-2 pb-3 last:pb-0">
              <span className={`num pt-0.5 text-right text-[13px] font-bold leading-tight ${it.tbd ? "text-muted" : "text-brand"}`}>
                {it.wish && <span className="block text-[10.5px] font-semibold text-muted">{t("wish")}</span>}
                {it.time ?? (it.tbd ? t("tbd") : "")}
              </span>
              <span className="relative flex justify-center">
                <span className="z-[1] grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-brand"><I size={15} weight="bold" /></span>
              </span>
              <span className="min-w-0 pt-0.5">
                <b className="block text-[14px] leading-snug">{it.title[L]}{it.kind === "bus" && j === 0 && memo ? ` (${memo})` : ""}</b>
                {it.note && <span className="block text-[12.5px] text-muted">{it.note[L]}</span>}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

export function Meter({ now, add }: { now: number; add: number }) {
  const pct = (x: number) => `${Math.min(100, (x / SET.BUS_SEATS) * 100)}%`;
  return (
    <div className="meter" role="img" aria-label={`${now + add}/${SET.BUS_SEATS}`}>
      <motion.div className="fill" initial={{ width: 0 }} animate={{ width: pct(now) }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
      <motion.div className="add" initial={false} animate={{ left: pct(now), width: pct(Math.min(add, SET.BUS_SEATS - now)) }} transition={{ duration: 0.5 }} />
      <div className="goal" style={{ left: `min(${pct(SET.MIN_DEPARTURE)}, calc(100% - 2px))` }} />
    </div>
  );
}

function Gallery({ p, loading }: { p: Pkg; loading: boolean }) {
  const { t, n } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setIdx(Number((e.target as HTMLElement).dataset.i))), { root, threshold: 0.6 });
    root.querySelectorAll("[data-i]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [p.id, loading]);
  if (loading) return <div className="skel -mx-4 aspect-[4/3] rounded-none lg:mx-0 lg:aspect-[16/9] lg:rounded-[20px]" />;
  return (
    <div className="relative -mx-4 lg:mx-0">
      <div ref={ref} className="hscroll gap-0 lg:rounded-[20px]" aria-roledescription="carousel">
        {p.photos.map((src, i) => (
          <div key={src} data-i={i} className="aspect-[4/3] w-full lg:aspect-[16/9]">
            <Img src={src} alt={`${n(p.name)} ${t("photoN", { i: i + 1 })}`} eager={i === 0} />
          </div>
        ))}
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden="true">
        {p.photos.map((_, i) => <span key={i} className={`h-1.5 rounded-full bg-white transition-all ${i === idx ? "w-5 opacity-100" : "w-1.5 opacity-60"}`} />)}
      </div>
    </div>
  );
}
