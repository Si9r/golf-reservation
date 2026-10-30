import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Bed, Bus, CaretDown, Info, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { pkgOf } from "../data";
import { SET } from "../data";
import { useT } from "../i18n";
import { useDb } from "../store";
import { addDays, depView, fDayLong, fShort, hasHotelStep, itinerary, judgeDate, optionOf, stayHotel, totalPrice, tripEnd, yen } from "../logic";
import { Anno, BottomBar, Collapse, Img, PriceBlock, Q, ScreenTag, Sheet, StepHead } from "../components/ui";
import { ItinList, Meter } from "./Detail";
import { PriceDetail } from "../components/booking";
import { useFlow } from "./flow";
import { USE_API, api, apiDepId, apiOptId } from "../api/client";
import { useDepartures } from "../api/sync";
import { useSeatGuard } from "../api/seatCheck";

export default function Review() {
  const { t, n, L } = useT();
  const nav = useNavigate();
  const extra = useDb((s) => s.extra);
  const bookings = useDb((s) => s.bookings);
  const [dupOpen, setDupOpen] = useState(false);
  const { d, p, redirect, user } = useFlow({ place: true });
  const [itinOpen, setItinOpen] = useState(false); // 5 일정표: 상세에서 이미 봤으니 접어 둠
  // API 모드: 출발편 현황(API-03), 서버 금액(API-07), 중복 예약 확인(API-11 ?departureId)
  useDepartures(d.pkgId ? [d.pkgId] : [], d.dep ? [d.dep.slice(0, 7)] : []);
  const [srv, setSrv] = useState<{ total: number; unit: number } | null>(null);
  const [apiDup, setApiDup] = useState<{ no: string; people: number } | null>(null); // API 모드 중복 예약 (기존 예약번호·인원)
  const guard = useSeatGuard();
  useEffect(() => {
    if (!USE_API || !d.pkgId || !d.dep) return;
    api.quote({ departureId: apiDepId(d.pkgId, d.dep), optionId: apiOptId(d.pkgId, d.opt), people: d.people, singles: d.singles })
      .then((q) => setSrv({ total: q.total, unit: q.unitPrice })).catch(() => setSrv(null));
  }, [d.pkgId, d.dep, d.opt, d.people, d.singles]);
  useEffect(() => {
    if (!USE_API || !user || !d.pkgId || !d.dep) return;
    api.myBookings(apiDepId(d.pkgId, d.dep)).then((r) => setApiDup(r.items[0] ? { no: r.items[0].no, people: r.items[0].people } : null)).catch(() => setApiDup(null));
  }, [user, d.pkgId, d.dep]);
  useEffect(() => {
    if (d.editReturn) d.patch({ editReturn: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (redirect) return <Navigate to={redirect} replace />;

  const dep = d.dep!;
  const opt = optionOf(d.opt);
  const hotel = stayHotel(p, d.opt);
  const price = totalPrice(p, d.opt, d.people, d.singles); // L-05 (+ 1인실 추가)
  const unit = srv?.unit ?? price.unit; // API 모드는 서버 계산값 (화면 계산은 믿지 않음, L-05)
  const total = srv?.total ?? price.total;
  const v = depView(p.id, dep, d.people, extra);
  const seatErr = v.state === "unavailable";
  const drop = d.dropSame ? d.pick : d.drop;
  const edit = (to: string) => {
    d.patch({ editReturn: true });
    nav(to); // T-28
  };
  const itin = itinerary(p, d.opt, d.pick, drop, { pickTime: d.pickTime, dropTime: d.dropTime }); // 13: 희망 승하차 시간
  const go = () => nav(user ? "/golf/book/info" : `/login?next=${encodeURIComponent("/golf/book/info")}`); // T-14
  // EV-28 ④ 중복 예약 확인 (M-152): 같은 회원 · 같은 패키지 · 같은 출발일의 유효 예약
  const dupB = USE_API ? apiDup : user ? bookings.find((b) => b.pkgId === p.id && b.dep === dep && b.status === "CONFIRMED") ?? null : null;
  const proceed = () => guard(() => (dupB ? setDupOpen(true) : go())); // B-01: 잔여석 다시 확인 후

  const need = Math.max(0, SET.MIN_DEPARTURE - v.sum); // 우리 인원까지 더해서 출발 확정까지 남은 인원
  const roomsTxt = price.rooms ? t(price.rooms.singles ? "roomsSum" : "roomsSum0", { t: price.rooms.twins, s: price.rooms.singles }) : null;
  const stayTitle = hotel ? n(hotel.name) : opt?.none ? n(opt.name) : t("noHotel");
  const staySub = hotel ? [opt && !opt.hotel ? n(opt.sub) : n(hotel.room), roomsTxt].filter(Boolean).join(" · ") : opt?.none ? n(opt.sub) : null;
  // 요약 카드 안 한 줄: 항목 이름 · 내용 · 변경
  const Row = ({ icon: I, title, to, children }: { icon: typeof Bed; title: string; to?: string; children: ReactNode }) => (
    <div className="flex gap-3 border-t border-line py-3.5 first:border-t-0">
      <span className="flex w-[64px] flex-none items-start gap-1 pt-0.5 text-[13px] font-bold text-muted"><I size={15} className="mt-0.5 flex-none" />{title}</span>
      <div className="min-w-0 flex-1 text-[14.5px]">{children}</div>
      {to && <button className="link flex-none self-start text-[13.5px]" onClick={() => edit(to)}>{t("change")}</button>}
    </div>
  );

  return (
    <div className="page step">
      <ScreenTag id="S-08" name="비용 확인" refs="FN-16~18, FN-32 · L-04, L-05, L-11 · API-07 · T-14, T-28" />
      <StepHead at={3} hasHotel={hasHotelStep(p)} onBack={() => nav("/golf/book/place")} />
      <h1 className="mb-4 text-[22px] font-bold">{t("s08T")}</h1>

      {seatErr && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border p-4" style={{ background: "var(--bad-soft)", borderColor: "var(--bad-line)" }}>
          <WarningCircle size={20} weight="fill" className="mt-0.5 flex-none text-bad" />
          <p className="flex-1 text-[14px] font-semibold text-bad">{t("M-120", { s: v.seats, n: d.people })}</p>
          <button className="btn btn-xs btn-ghost" onClick={() => edit(`/golf/packages/${p.id}`)}>{t("change")}</button>
        </div>
      )}

      {/* PC: 왼쪽 예약 내용 · 오른쪽 출발 조건·금액 (스크롤해도 보이게) / 휴대폰: 한 줄로 */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
        <div className="grid gap-3 lg:gap-4">
          {/* 1 예약 요약: 사진 위에 패키지·일정·인원, 아래에 숙박·승하차 줄 (줄마다 '변경') */}
          <section className="relative overflow-hidden rounded-[20px] bg-surface shadow-[var(--shadow)]">
            <Anno n={1} t="예약 내용 요약: 사진 카드(이름·일정·인원) + 숙박 / 승차 / 하차 줄별 '변경' → S-03/S-05/S-06 → S-08 복귀 (T-28)" />
            <div className="relative h-[180px] lg:h-[220px]">
              <Img src={p.photos[0]} alt={n(p.name)} className="absolute inset-0 h-full w-full" />
              <span className="absolute inset-0 bg-gradient-to-b from-transparent from-30% to-black/80" />
              <button className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[13px] font-bold text-[#14171f]" onClick={() => edit(`/golf/packages/${p.id}`)}>{t("change")}</button>
              <div className="absolute inset-x-4 bottom-3.5 grid gap-1 text-white">
                <b className="line-clamp-2 text-[19px] font-black leading-snug lg:text-[22px]">{n(p.name)}</b>
                <span className="num text-[14px]">{fShort(dep, L)}{p.nights ? ` ~ ${fShort(tripEnd(p, dep), L)}` : ""} · {t("peopleN", { n: d.people })}</span>
              </div>
            </div>
            <div className="px-4 py-1">
              {/* 2 숙박 */}
              <Row icon={Bed} title={t("rowHotel")} to={hasHotelStep(p) ? "/golf/book/hotel" : undefined}>
                <b className="block leading-snug">{stayTitle}</b>
                {staySub && <p className="text-[13px] text-ink-2">{staySub}</p>}
              </Row>
              {/* 3 버스 승하차 */}
              <Row icon={Bus} title={t("pick")} to="/golf/book/place">
                <b className="font-semibold">{n(d.pick!.name)}</b> · {t("wishAt", { t: d.pickTime! })}
                {d.pickMemo && <span className="block text-[12.5px] text-muted">{d.pickMemo}</span>}
              </Row>
              <Row icon={Bus} title={t("drop")} to="/golf/book/place">
                <b className="font-semibold">{drop ? n(drop.name) : "-"}</b>{d.dropSame && <span className="text-muted"> ({t("sameAsPick")})</span>}{d.dropTime ? ` · ${t("wishAt", { t: d.dropTime })}` : ""}
              </Row>
            </div>
          </section>

          {/* 5 일정표 (상세에서 이미 봤으니 접어 둠) */}
          <section className="relative card overflow-hidden rounded-[20px]">
            <Anno n={5} t="일정표 (L-11): 고른 날짜·승차·하차 장소가 들어간 일정 (기본 접힘) + 구간 이동 시간" />
            <button className="flex w-full items-center justify-between px-4 py-3.5 text-left" aria-expanded={itinOpen} onClick={() => setItinOpen(!itinOpen)}>
              <b className="text-[14.5px]">{t("rvItin", { n: itin.length })}</b>
              <CaretDown size={16} className={`transition-transform ${itinOpen ? "rotate-180" : ""}`} />
            </button>
            {/* 접혀 있어도 1일차 '버스 승차 → 첫 라운드'는 미리 보여 줌 */}
            {!itinOpen && (
              <div className="-mt-1 pb-2">
                <p className="px-4 pb-1 text-[13px] font-bold text-brand">{t("dayN", { i: 1 })} · {fShort(dep, L)}</p>
                <ItinList items={itin[0].slice(0, 2)} memo={d.pickMemo} />
              </div>
            )}
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
        </div>

        <div className="grid gap-3 lg:sticky lg:top-32">
          {/* 4 출발 조건 (최소 인원 안내 + 현황을 한 상자로, '판정일' 대신 문장) */}
          <section className="relative rounded-[20px] border-[1.5px] p-4 lg:p-5" style={{ background: "var(--warn-soft)", borderColor: "var(--warn-line)" }}>
            <Anno n={3} t="출발 조건 (M-150 + L-04 현황): 남은 인원·막대·확정 날짜와 미달 시 전액 환불을 한 상자로" />
            <h2 className="flex items-center gap-2 text-[16px] font-extrabold text-warn lg:text-[18px]"><UsersThree size={20} weight="fill" /> {need > 0 ? t("rvNeed", { n: need }) : t("rvFull", { m: SET.MIN_DEPARTURE })}</h2>
            <div className="my-2.5"><Meter now={v.booked} add={Math.min(d.people, v.seats)} /></div>
            <p className="text-[13px] text-ink-2 lg:text-[14px]">{t("M-121", { a: v.booked, b: d.people, t: v.sum, m: SET.MIN_DEPARTURE })}</p>
            <p className="mt-1.5 text-[13.5px] font-semibold leading-relaxed text-ink lg:text-[15px]">{t(need > 0 ? "rvRule" : "rvRuleFull", { d: fDayLong(judgeDate(dep), L), m: SET.MIN_DEPARTURE })}</p>
          </section>

          {/* 2 요금 (L-05) */}
          <section className="relative card rounded-[20px] border-[1.5px] p-4 shadow-[var(--shadow-lg)] lg:p-5" style={{ borderColor: "var(--brand)" }}>
            <Anno n={2} t="요금 (L-05): 패키지 × 인원, 호텔 옵션 × 인원, 1인실 추가 × 1인실 인원, 버스 '포함', 총액" />
            <p className="mb-2 text-[13px] font-bold text-brand lg:text-[14px]">{t("rvPayT")}</p>
            <PriceDetail p={p} opt={d.opt} people={d.people} singles={d.singles} />
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-[14px] font-semibold">{t("totalL", { n: d.people })} <Q id="Q-08" t="가격·통화 (JPY 가정)" /></span>
              <span className="num text-[24px] font-extrabold text-brand lg:text-[30px]">{yen(total)}</span>
            </div>
            <p className="mt-1 text-right text-[12px] text-muted">{t("unitL")} {yen(unit)}</p>
            {/* PC: 금액 바로 아래에 다음 버튼 (하단 바와 같은 동작) */}
            <button className="btn btn-primary mt-4 hidden w-full lg:flex" disabled={seatErr} onClick={proceed}>{user ? t("rvGoInfo") : t("rvGoLogin")}</button>
          </section>

          {/* 6 로그인 안내 */}
          {!user && (
            <p className="relative flex gap-2 rounded-2xl bg-brand-soft p-3 text-[13px] text-ink">
              <Anno n={6} t="로그인 안내 (M-151): 로그인 안 했을 때만" />
              <Info size={18} className="flex-none text-brand" />
              {t("M-151")}
            </p>
          )}
        </div>
      </div>

      <BottomBar pcHidden>
        <span className="absolute -top-3 left-3"><Anno n={7} t="하단: 로그인 안 했으면 '로그인하고 예약' → 메인 사이트 로그인 → S-09, 했으면 '정보 입력하기' → S-09. 잔여석 < 인원이면 비활성 (M-120), 같은 출발편 예약이 있으면 확인 창 (M-152)" /></span>
        <PriceBlock main={yen(total)} sub={`${t("totalL", { n: d.people })} · ${t("busIncl")}`} />
        <button className="btn btn-primary min-w-[140px]" disabled={seatErr} onClick={proceed}>{user ? t("rvGoInfo") : t("rvGoLogin")}</button>
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
