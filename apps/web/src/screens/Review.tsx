import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CaretDown, Info, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { pkgOf } from "../data";
import { SET } from "../data";
import { useT } from "../i18n";
import { useDb } from "../store";
import { addDays, depView, fDayLong, fShort, hasHotelStep, itinerary, judgeDate, optionOf, stayHotel, totalPrice, tripEnd, yen } from "../logic";
import { useSeatGuard } from "../api/seatCheck";
import { Anno, BottomBar, Collapse, PriceBlock, Q, ScreenTag, Sheet, Steps } from "../components/ui";
import { DepStateText, ItinList, Meter } from "./Detail";
import { useFlow } from "./flow";

export default function Review() {
  const { t, n, L } = useT();
  const nav = useNavigate();
  const extra = useDb((s) => s.extra);
  const bookings = useDb((s) => s.bookings);
  const [dupOpen, setDupOpen] = useState(false);
  const { d, p, redirect, user } = useFlow({ place: true });
  const [itinOpen, setItinOpen] = useState(true); // 5 일정표: 펼침
  const guard = useSeatGuard();
  useEffect(() => {
    if (d.editReturn) d.patch({ editReturn: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (redirect) return <Navigate to={redirect} replace />;

  const dep = d.dep!;
  const opt = optionOf(d.opt);
  const hotel = stayHotel(p, d.opt);
  const price = totalPrice(p, d.opt, d.people, d.singles); // L-05 (+ 1인실 추가)
  const unit = price.unit;
  const total = price.total;
  const v = depView(p.id, dep, d.people, extra);
  const seatErr = v.state === "unavailable";
  const drop = d.dropSame ? d.pick : d.drop;
  const edit = (to: string) => {
    d.patch({ editReturn: true });
    nav(to); // T-28
  };
  const rows: { k: string; v: string; to?: string }[] = [
    { k: t("rowPkg"), v: n(p.name), to: `/golf/packages/${p.id}` },
    { k: t("rowDep"), v: t("depRange", { a: fShort(dep, L), n: p.nights ? t("nightsDays", { n: p.nights, d: p.nights + 1 }) : t("dayTrip") }), to: `/golf/packages/${p.id}` },
    { k: t("rowPeople"), v: t("peopleN", { n: d.people }), to: `/golf/packages/${p.id}` },
    { k: t("rowHotel"), v: hotel ? `${n(hotel.name)}${opt ? ` · ${n(opt.sub)}` : ""}` : opt?.none ? `${n(opt.name)} · ${n(opt.sub)}` : t("noHotel"), to: hasHotelStep(p) ? "/golf/book/hotel" : undefined },
    ...(price.rooms ? [{ k: t("rowRooms"), v: t(price.rooms.singles ? "roomsSum" : "roomsSum0", { t: price.rooms.twins, s: price.rooms.singles }), to: "/golf/book/hotel" }] : []),
    { k: t("rowPick"), v: `${n(d.pick!.name)} · ${t("wishAt", { t: d.pickTime! })}` + (d.pickMemo ? ` · ${d.pickMemo}` : ""), to: "/golf/book/place" },
    { k: t("rowDrop"), v: drop ? n(drop.name) + (d.dropSame ? ` (${t("sameAsPick")})` : "") + (d.dropTime ? ` · ${t("wishAt", { t: d.dropTime })}` : "") : "-", to: "/golf/book/place" },
  ];
  const itin = itinerary(p, d.opt, d.pick, drop, { pickTime: d.pickTime, dropTime: d.dropTime });
  const go = () => nav(user ? "/golf/book/info" : `/login?next=${encodeURIComponent("/golf/book/info")}`); // T-14
  // EV-28 ④ 중복 예약 확인 (M-152): 같은 회원 · 같은 패키지 · 같은 출발일의 유효 예약
  const dupB = user ? bookings.find((b) => b.pkgId === p.id && b.dep === dep && b.status === "CONFIRMED") : undefined;
  const proceed = () => guard(() => (dupB ? setDupOpen(true) : go())); // B-01: 잔여석 다시 확인 후

  return (
    <div className="page step">
      <ScreenTag id="S-08" name="비용 확인" refs="FN-16~18, FN-32 · L-04, L-05, L-11 · API-07 · T-14, T-28" />
      <Steps at={3} hasHotel={hasHotelStep(p)} />
      <h1 className="mb-4 text-[22px] font-bold">{t("s08T")}</h1>

      {seatErr && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border p-4" style={{ background: "var(--bad-soft)", borderColor: "var(--bad-line)" }}>
          <WarningCircle size={20} weight="fill" className="mt-0.5 flex-none text-bad" />
          <p className="flex-1 text-[14px] font-semibold text-bad">{t("M-120", { s: v.seats, n: d.people })}</p>
          <button className="btn btn-xs btn-ghost" onClick={() => edit(`/golf/packages/${p.id}`)}>{t("change")}</button>
        </div>
      )}

      {/* 1 예약 내용 요약 */}
      <section className="relative card divide-y divide-line">
        <Anno n={1} t="예약 내용 요약 (패키지·출발일·인원·호텔·승차·하차 + 희망 시간) + 항목별 '변경' → S-03/S-05/S-06 → S-08 복귀 (T-28)" />
        {rows.map((r) => (
          <div key={r.k} className="flex items-start gap-3 px-4 py-3">
            <span className="w-14 flex-none pt-px text-[13px] font-semibold text-muted">{r.k}</span>
            <span className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug">{r.v}</span>
            {r.to ? <button className="link flex-none text-[13.5px]" onClick={() => edit(r.to!)}>{t("change")}</button> : <span className="w-8" />}
          </div>
        ))}
      </section>

      {/* 2 요금 (L-05) */}
      <section className="relative mt-4 card p-5">
        <Anno n={2} t="요금 (L-05): 1인 요금, 패키지 × 인원, 호텔 옵션 × 인원, 1인실 추가 × 1인실 인원, 버스 '포함', 총액" />
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-muted">{t("unitL")}</span>
          <Q id="Q-08" t="가격·통화 (JPY 가정)" />
        </div>
        <p className="num mt-1 text-[32px] font-extrabold leading-tight tracking-tight">{yen(unit)}</p>
        <ul className="mt-3 grid gap-1.5 border-t border-line pt-3 text-[13.5px]">
          <li className="flex justify-between gap-3"><span className="text-ink-2">{t("lineBase", { p: yen(p.price), n: d.people })}</span><span className="num font-semibold">{yen(p.price * d.people)}</span></li>
          {opt && opt.add !== 0 && <li className="flex justify-between gap-3"><span className="text-ink-2">{t("lineOpt", { p: yen(opt.add), n: d.people })}</span><span className="num font-semibold">{yen(opt.add * d.people)}</span></li>}
          {price.singleAdd > 0 && <li className="flex justify-between gap-3"><span className="text-ink-2">{t("lineSingle", { p: yen(SET.SINGLE_ADD), n: price.rooms!.singles })}</span><span className="num font-semibold">{yen(price.singleAdd)}</span></li>}
          <li className="flex justify-between gap-3"><span className="text-ink-2">{t("lineBus")}</span><span className="font-semibold text-ok">{t("included")}</span></li>
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-[14px] font-semibold text-ink-2">{t("totalL", { n: d.people })}</span>
          <span className="num text-[20px] font-extrabold">{yen(total)}</span>
        </div>
      </section>

      {/* 3 최소 출발 인원 안내 */}
      <section className="relative mt-4 rounded-2xl border-[1.5px] p-4" style={{ background: "var(--warn-soft)", borderColor: "var(--warn-line)" }}>
        <Anno n={3} t="최소 출발 인원 안내 (M-150, departure.judge_date)" />
        <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-warn"><UsersThree size={20} weight="fill" /> {t("minT")}</h2>
        <p className="text-[14px] leading-relaxed text-ink">{t("M-150", { m: SET.MIN_DEPARTURE, d: fDayLong(judgeDate(dep), L) })}</p>
      </section>

      {/* 4 출발 확정 현황 */}
      {(
        <section className="relative mt-4 card p-4">
          <Anno n={4} t="출발 확정 현황 (1단계, L-04, M-121~123·M-125)" />
          <h2 className="mb-2 flex items-center gap-2 text-[14.5px] font-bold">{t("statusT")}</h2>
          <p className="mb-2 text-[13px] text-ink-2">{t("M-121", { a: v.booked, b: d.people, t: v.sum, m: SET.MIN_DEPARTURE })}</p>
          <Meter now={v.booked} add={Math.min(d.people, v.seats)} />
          <div className="mt-2"><DepStateText v={v} dep={dep} /></div>
        </section>
      )}

      {/* 5 일정표 */}
      <section className="relative mt-4 card overflow-hidden">
        <Anno n={5} t="일정표 (L-11): 고른 날짜·승차·하차 장소가 들어간 일정 (펼침) + 구간 이동 시간" />
        <button className="flex w-full items-center justify-between px-4 py-3.5 text-left" aria-expanded={itinOpen} onClick={() => setItinOpen(!itinOpen)}>
          <b className="text-[14.5px]">{t("itin")} · {fShort(dep, L)} ~ {fShort(tripEnd(p, dep), L)}</b>
          <CaretDown size={16} className={`transition-transform ${itinOpen ? "rotate-180" : ""}`} />
        </button>
        <Collapse open={itinOpen}>
          <div className="grid gap-1">
            {itin.map((items, i) => (
              <div key={i}>
                <p className="px-4 pb-1 text-[13px] font-bold text-brand">{t("dayN", { i: i + 1 })} · {fShort(addDays(dep, i), L)}</p>
                <ItinList items={items} memo={i === 0 ? d.pickMemo : undefined} />
              </div>
            ))}
          </div>
        </Collapse>
      </section>

      {/* 6 로그인 안내 */}
      {!user && (
        <p className="relative mt-4 flex gap-2 rounded-2xl bg-brand-soft p-4 text-[14px] text-ink">
          <Anno n={6} t="로그인 안내 (M-151): 로그인 안 했을 때만" />
          <Info size={20} className="flex-none text-brand" />
          {t("M-151")}
        </p>
      )}

      <BottomBar>
        <span className="absolute -top-3 left-3"><Anno n={7} t="하단 예약 진행: 잔여석 < 인원이면 비활성 (M-120), 같은 출발편 예약이 이미 있으면 확인 창 (M-152), 로그인 → S-09 / 미로그인 → 메인 사이트 로그인 → S-09 (T-14)" /></span>
        <PriceBlock main={yen(total)} sub={`${t("totalL", { n: d.people })} · ${t("busIncl")}`} />
        <button className="btn btn-primary min-w-[140px]" disabled={seatErr} onClick={proceed}>{t("proceed")}</button>
      </BottomBar>

      <Sheet
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        title={t("dupT")}
        footer={
          <div className="grid gap-2">
            {dupB && <button className="btn btn-ghost" onClick={() => { setDupOpen(false); nav(`/golf/my/${dupB.no}`); }}>{t("dupView")}</button>}
            <button className="btn btn-primary" onClick={() => { setDupOpen(false); go(); }}>{t("dupGo")}</button>
            <button className="btn btn-sm text-muted" onClick={() => setDupOpen(false)}>{t("close")}</button>
          </div>
        }
      >
        <div className="relative grid gap-3 text-[15px] leading-relaxed">
          <Anno n={8} t="중복 예약 확인 (EV-28 ④, M-152): 기존 예약번호·인원, 버튼 3개 — 기존 예약 보기(S-13) / 다른 일행으로 계속(S-09) / 닫기 (T-2 팀 결정 대기)" />
          {dupB && <p className="num rounded-xl bg-surface-2 px-4 py-3 font-bold">{t("dupInfo", { no: dupB.no, n: dupB.people })}</p>}
          {t("M-152", { d: fShort(dep, L), p: n(pkgOf(p.id)!.name) }).split(/(?<=\D[.。])\s*/).filter(Boolean).map((x) => <p key={x}>{x}</p>)}
        </div>
      </Sheet>
    </div>
  );
}
