import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { CreditCard, Info, Lock, Timer, WarningCircle } from "@phosphor-icons/react";
import { SET } from "../data";
import { useT } from "../i18n";
import { DESIGN_TOOLS, releaseHold, useApp, useAuth, useDb, useDraft, type Booking, type PayResult } from "../store";
import { addDays, bookingNo, depView, fDayLong, fShort, hasHotelStep, itinerary, judgeDate, optionOf, stayHotel, todayISO, totalPrice, tripEnd, yen } from "../logic";
import { Anno, BottomBar, Img, ScreenTag, StepHead } from "../components/ui";
import { ItinList } from "./Detail";
import { PriceDetail } from "../components/booking";
import { useFlow } from "./flow";
import { ApiError, USE_API, api, apiDepId, apiOptId } from "../api/client";

export default function Pay() {
  const { t, n, L } = useT();
  const nav = useNavigate();
  const { payResult, set: setApp } = useApp();
  const db = useDb();
  const user = useAuth((s) => s.user);
  const { d, p, redirect } = useFlow({ place: true, login: true, info: true });
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<null | "M-173" | "M-174">(null);
  const [left, setLeft] = useState(() => Math.max(0, (d.holdUntil ?? Date.now() + SET.HOLD_MINUTES * 60000) - Date.now()));
  const [srvTotal, setSrvTotal] = useState<number | null>(null);
  const [itinAll, setItinAll] = useState(false); // 휴대폰: 일정표 전체 펼치기
  useEffect(() => {
    if (!USE_API || !d.pkgId || !d.dep) return;
    api.quote({ departureId: apiDepId(d.pkgId, d.dep), optionId: apiOptId(d.pkgId, d.opt), people: d.people, singles: d.singles })
      .then((q) => setSrvTotal(q.total)).catch(() => setSrvTotal(null)); // API-07 서버 금액
  }, [d.pkgId, d.dep, d.opt, d.people, d.singles]);

  useEffect(() => {
    if (redirect) return;
    if (USE_API && !d.pendingNo) { nav("/golf/book/info", { replace: true }); return; } // 결제 대기 예약(API-10) 없이 들어오면 정보 입력으로
    if (!d.holdUntil) d.patch({ holdUntil: Date.now() + SET.HOLD_MINUTES * 60000, holdPeople: d.people });
    const tm = window.setInterval(() => {
      const until = useDraft.getState().holdUntil;
      setLeft(until ? Math.max(0, until - Date.now()) : 0); // 1초마다 갱신
    }, 1000);
    return () => window.clearInterval(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 결제 화면을 어떤 방법으로 떠나도(브라우저 뒤로 가기·메뉴·로고) 확보 해제 (API-09).
  // 새로고침·탭 닫기는 화면 안 이동이 아니므로 그대로 두고 10분 뒤 자동 해제. StrictMode 재실행에 풀리지 않게 주소로 판단
  useEffect(() => () => {
    window.setTimeout(() => { if (!window.location.hash.startsWith("#/golf/book/pay")) releaseHold(); }, 0);
  }, []);
  if (redirect) return <Navigate to={redirect} replace />;

  const price = totalPrice(p, d.opt, d.people, d.singles);
  const unit = price.unit;
  const total = srvTotal ?? price.total;
  const expired = left <= 0 && error !== "M-174";
  const mm = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  const reselect = () => {
    releaseHold();
    d.patch({ dep: null });
    nav(`/golf/packages/${p.id}`, { replace: true });
  };
  const back = () => {
    releaseHold(); // API-09 확보 해제
    nav("/golf/book/info");
  };

  const pay = () => {
    if (paying || expired) return;
    setPaying(true);
    setError(null);
    const result: PayResult = DESIGN_TOOLS ? payResult : "ok"; // 데모 결제 결과는 설계 도구를 켰을 때만
    if (USE_API) {
      // API-20 결제 시작: 서버가 본 사이트 주문을 만들고 결제창 주소를 줌 → 그 주소로 이동 (결과는 결제 결과 화면이 서버에 조회)
      api.checkout(d.pendingNo!)
        .then((r) => {
          if (!r.checkoutUrl) throw new Error("no checkout url");
          useDraft.setState({ pendingNo: null }); // 주문을 만들었으니 화면을 떠나도 그만두기(abandon)를 보내지 않음. 결과는 결제 결과 화면이 예약번호로 조회
          window.location.assign(r.checkoutUrl);
        })
        .catch((e) => {
          setPaying(false);
          const code = e instanceof ApiError ? e.body.error : "";
          if (code === "E-HOLD" || code === "E-CLOSED") { useDraft.setState({ pendingNo: null, holdUntil: 0 }); setLeft(0); } // 좌석 확보 만료 → 출발일 다시 고르기
          else setError("M-173"); // 본 사이트 연동 오류 등: 결제 화면에 머묾 (T-18)
        });
      return;
    }
    window.setTimeout(() => {
      setPaying(false);
      if (result === "fail") return setError("M-173"); // E-PAY, T-18
      if (result === "soldout" || depView(p.id, d.dep!, d.people, useDb.getState().extra).state === "unavailable") {
        releaseHold(); // L-08 3): 예약을 만들지 않고 전액 환불 (L-15), NO_SEAT 메일
        return setError("M-174");
      }
      const drop = d.dropSame ? d.pick : d.drop;
      const b: Booking = {
        no: bookingNo(d.dep!, useDb.getState().bookings.map((x) => x.no)), // L-09
        pkgId: p.id,
        dep: d.dep!,
        people: d.people,
        opt: d.opt,
        pick: d.pick,
        drop,
        pickMemo: d.pickMemo,
        pickTime: d.pickTime ?? undefined,
        dropTime: d.dropTime ?? undefined,
        unit,
        singles: price.rooms?.singles,
        total,
        currency: "JPY",
        info: d.info!,
        status: "CONFIRMED", // L-08 4): 출발 확정은 판정일(B-01)에만
        createdAt: todayISO(),
        lang: L,
      };
      db.add(b); // booking·booking_member·booking_stop 저장, departure.booked_count += 인원, seat_hold 삭제
      releaseHold();
      nav(`/golf/bookings/${b.no}/complete`, { replace: true }); // T-17
    }, 1400);
  };

  const opt = optionOf(d.opt);
  const hotel = stayHotel(p, d.opt);
  const info = d.info!;
  const drop = d.dropSame ? d.pick : d.drop;
  const payBtn = (cls: string) => (
    <button className={`btn btn-primary ${cls}`} disabled={paying || expired || error === "M-174"} onClick={pay} aria-busy={paying}>
      {paying ? (
        <>
          <motion.span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
          {t("paying")}
        </>
      ) : (
        t("payBtn", { p: yen(total) })
      )}
    </button>
  );

  return (
    <div className="page step">
      <ScreenTag id="S-10" name="결제" refs="FN-22, FN-23 · L-07, L-08, L-09 · API-08~10 · I-06 · T-17, T-18" />
      <StepHead at={5} hasHotel={hasHotelStep(p)} onBack={back} disabled={paying} />
      <h1 className="mb-4 text-[22px] font-bold">{t("payT")}</h1>

      {/* 1 남은 시간 (결제 후 자리 없음이면 잡아 둔 자리가 이미 풀렸으므로 숨김) */}
      {error !== "M-174" && <section className={`relative mb-4 flex items-center gap-3 rounded-2xl border-[1.5px] p-4 ${expired ? "border-bad-line bg-bad-soft" : "border-brand-line bg-brand-soft"}`} role={expired ? "alert" : undefined}>
        <Anno n={1} t="남은 시간 (seat_hold.expires_at, 10:00): 1초마다 갱신, 0이 되면 결제 버튼 비활성 + M-171 + 출발일 다시 고르기" />
        <Timer size={24} className={expired ? "text-bad" : "text-brand"} />
        {expired ? (
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-bad">{t("M-171")}</p>
            <button className="link mt-1 text-[14px]" onClick={reselect}>{t("expiredLink")}</button>
          </div>
        ) : (
          <p className="flex-1 text-[14.5px] font-semibold" aria-live="off">
            {t("M-170", { t: "\u0000" }).split("\u0000").map((s, i) => (i ? [<span key="t" className="num px-0.5 text-[18px] font-extrabold text-brand">{mm}</span>, s] : s))}
          </p>
        )}
      </section>}

      <AnimatePresence>
        {error && (
          <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border p-4" style={{ background: "var(--bad-soft)", borderColor: "var(--bad-line)" }}>
            <WarningCircle size={22} weight="fill" className="flex-none text-bad" />
            <div className="flex-1">
              <p className="text-[14.5px] font-bold text-bad">{t(error)}</p>
              {error === "M-174" && <button className="link mt-1 text-[14px]" onClick={reselect}>{t("expiredLink")}</button>}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* PC: 왼쪽 최종 확인 · 오른쪽 결제 금액과 버튼 (확인 화면과 같은 2칸) */}
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-6">
        <div className="grid gap-3">
          {/* 2 최종 확인: 선택 내용 + 입력한 예약자·동반자 (결제 전 오타 확인) */}
          <section className="relative card overflow-hidden">
            <Anno n={2} t="최종 확인: 패키지·날짜·인원·호텔·승하차 + 대표자·동반자 영문 이름 (결제 전 마지막 확인)" />
            <p className="border-b border-line px-4 py-2.5 text-[13px] font-semibold text-muted">{t("payCheckT")}</p>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="relative h-[54px] w-[70px] flex-none overflow-hidden rounded-xl"><Img src={p.photos[0]} alt={n(p.name)} className="absolute inset-0 h-full w-full" /></div>
              <div className="min-w-0 flex-1">
                <b className="line-clamp-2 text-[14.5px] font-extrabold leading-snug">{n(p.name)}</b>
                <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">{fShort(d.dep!, L)} ~ {fShort(tripEnd(p, d.dep!), L)} <span className="badge brand">{t("peopleN", { n: d.people })}</span></p>
              </div>
            </div>
            <dl className="grid gap-1.5 border-t border-line px-4 py-3 text-[13.5px]">
              <div className="flex gap-3"><dt className="w-16 flex-none text-muted">{t("rowHotel")}</dt><dd className="min-w-0">{hotel ? `${n(hotel.name)} · ${opt && !opt.hotel ? n(opt.sub) : n(hotel.room)}` : opt?.none ? n(opt.name) : t("noHotel")}</dd></div>
              <div className="flex gap-3"><dt className="w-16 flex-none text-muted">{t("pick")}</dt><dd className="min-w-0">{d.pick ? n(d.pick.name) : "-"} · {t("wishAt", { t: d.pickTime ?? "-" })}</dd></div>
              <div className="flex gap-3"><dt className="w-16 flex-none text-muted">{t("drop")}</dt><dd className="min-w-0">{drop ? n(drop.name) : "-"}{d.dropTime ? ` · ${t("wishAt", { t: d.dropTime })}` : ""}</dd></div>
            </dl>
            <dl className="grid gap-1.5 border-t border-line px-4 py-3 text-[13.5px]">
              <div className="flex gap-3"><dt className="w-16 flex-none text-muted">{t("payRep")}</dt><dd className="min-w-0"><b className="font-semibold">{info.nameEn}</b> ({info.nameKo})<span className="block whitespace-nowrap">{info.cc} {info.phone}</span><span className="block text-muted">{info.email}</span></dd></div>
              {info.companions.length > 0 && <div className="flex gap-3"><dt className="w-16 flex-none text-muted">{t("payComp")}</dt><dd className="min-w-0 font-semibold">{info.companions.join(", ")}</dd></div>}
            </dl>
            <button className="link block w-full border-t border-line px-4 py-2.5 text-left text-[13.5px]" onClick={back} disabled={paying}>{t("payEdit")}</button>
          </section>

          {/* 일정표: 마지막 확인이라 전체 일정을 펼쳐서 보여 줌 (승하차·골프·숙박 시간 흐름) */}
          <section className="relative card overflow-hidden">
            <Anno n={6} t="일정표 (L-11): 결제 전 마지막 확인이라 모든 일차를 펼친 상태, 고른 승하차 장소·호텔이 들어간 일정" />
            <p className="border-b border-line px-4 py-2.5 text-[13px] font-semibold text-muted">{t("itin")} · {fShort(d.dep!, L)} ~ {fShort(tripEnd(p, d.dep!), L)}</p>
            <div className="grid gap-1 pt-2">
              {itinerary(p, d.opt, d.pick, drop, { pickTime: d.pickTime, dropTime: d.dropTime }).map((items, i) => (
                <div key={i} className={!itinAll && i > 0 ? "hidden lg:block" : undefined}>
                  <p className="px-4 pb-1 text-[13px] font-bold text-brand">{t("dayN", { i: i + 1 })} · {fShort(addDays(d.dep!, i), L)}</p>
                  <ItinList items={i === 0 && !itinAll ? items.slice(0, 2) : items} memo={i === 0 ? d.pickMemo : undefined} />
                </div>
              ))}
            </div>
            {!itinAll && <button className="link w-full border-t border-line px-4 py-2.5 text-left text-[13.5px] lg:hidden" onClick={() => setItinAll(true)}>{t("payItinAll", { n: itinerary(p, d.opt, d.pick, drop, { pickTime: d.pickTime, dropTime: d.dropTime }).length })}</button>}
          </section>

          {/* 테스트용 결제 결과 (프로토타입만. API 모드는 서버의 가짜 본 사이트 PAYMENT_BACKEND=fake 가 결과를 정함) */}
          {!USE_API && DESIGN_TOOLS && (
            <div className="grid gap-2 rounded-2xl border border-dashed p-3" style={{ borderColor: "var(--anno)" }}>
              <span className="text-[12.5px] font-bold" style={{ color: "var(--anno)" }}>{t("demoPay")}</span>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
                {(["ok", "fail", "soldout"] as const).map((r) => (
                  <button key={r} aria-pressed={payResult === r} onClick={() => setApp({ payResult: r })} className={`min-h-[38px] rounded-lg px-1 text-[12.5px] font-bold ${payResult === r ? "bg-surface shadow-sm" : "text-muted"}`}>{t(r)}</button>
                ))}
              </div>
              <span className="text-[11.5px] text-muted">{user?.memberId}</span>
            </div>
          )}
        </div>

        <div className="grid gap-3 lg:sticky lg:top-24">
          {/* 4 결제 금액 (보라 테두리, 큰 총액) + PC 결제 버튼 */}
          <section className="relative card border-[1.5px] p-4 lg:p-5" style={{ borderColor: "var(--brand)" }}>
            <Anno n={4} t="결제 금액: 패키지 × 인원, 옵션, 1인실, 버스 포함, 총액 + 결제 버튼 (C-10 중복 탭 방지)" />
            <p className="mb-2 text-[13px] font-bold text-brand lg:text-[14px]">{t("payAmount", { n: d.people })}</p>
            <PriceDetail p={p} opt={d.opt} people={d.people} singles={d.singles} />
            <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-[14px] font-semibold">{t("totalL", { n: d.people })}</span>
              <span className="num text-[26px] font-extrabold text-brand lg:text-[32px]">{yen(total)}</span>
            </div>
            <p className="mt-1 text-right text-[12px] text-muted">{t("perPerson")} {yen(unit)}</p>
            {/* 3 결제 수단: 카드 하나뿐이라 고르는 칸 없이 결제 버튼 바로 위에 한 줄 */}
            <p className="relative mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
              <Anno n={3} t="결제 수단: 카드만, 메인 사이트 결제창으로 이동 (M-172, I-06)" />
              <CreditCard size={18} className="flex-none text-brand" />
              <span className="flex-1">{t("M-172")}</span>
              <Lock size={14} className="flex-none text-muted" />
            </p>
            {payBtn("mt-3 hidden w-full lg:flex")}
          </section>

          {/* 출발 조건 (확인 화면과 같은 문장) */}
          <section className="flex gap-2.5 rounded-2xl border border-warn-line bg-warn-soft p-4">
            <Info size={20} className="mt-0.5 flex-none text-warn" />
            {/* 20명이 이미 모였으면 다른 문구 (확인 화면과 같은 분기) */}
            <p className="text-[13.5px] leading-relaxed">{t(depView(p.id, d.dep!, d.people, db.extra).sum >= SET.MIN_DEPARTURE ? "rvRuleFull" : "rvRule", { d: fDayLong(judgeDate(d.dep!), L), m: SET.MIN_DEPARTURE })}</p>
          </section>
        </div>
      </div>

      <BottomBar pcHidden>
        <span className="absolute -top-3 left-3"><Anno n={5} t="결제 버튼 '¥총액 결제하기' (C-10 중복 탭 방지): 성공 → L-08 → S-11 (T-17) / 실패 → 그대로 (T-18, M-173) / 결제 후 자리 없음 → 자동 환불 (M-174)" /></span>
        {payBtn("w-full")}
      </BottomBar>
    </div>
  );
}
