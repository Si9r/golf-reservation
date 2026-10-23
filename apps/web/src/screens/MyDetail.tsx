import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowSquareOut, Bed, Bus, FileText, Flag, Headset, Printer, UsersThree } from "@phosphor-icons/react";
import { AREA_NAME, SET, courseOf, pkgOf } from "../data";
import { useT } from "../i18n";
import { useAuth, useDb, useToast, viewOf, type Booking } from "../store";
import { addDays, coursesOf, fDate, fDayLong, fShort, itinerary, judgeDate, optionOf, pickupWindow, stayHotel, todayISO, tripEnd, yen } from "../logic";
import { Anno, Q, ScreenTag, Sheet, gmapLink } from "../components/ui";
import { MapView, type MapMarker } from "../components/GoogleMap";
import { useDrive } from "../gmaps";
import { ItinList, Meter } from "./Detail";
import { LABEL_CLASS } from "./MyList";
import { validEn } from "./InfoForm";

export default function MyDetail() {
  const { no } = useParams();
  const { t, n, L } = useT();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const toast = useToast((s) => s.show);
  const { bookings, extra, update } = useDb();
  const b = bookings.find((x) => x.no === no);
  const [doc, setDoc] = useState(false);
  const [comps, setComps] = useState<string[] | null>(null);
  const bp = b ? pkgOf(b.pkgId) : null;
  const pickDrive = useDrive(b?.pick, bp ? coursesOf(bp)[0] : null);
  const markers = useMemo<MapMarker[]>(() => (b ? [...(b.pick ? [{ lat: b.pick.lat, lng: b.pick.lng, title: n(b.pick.name), kind: "pick" as const, glyph: L === "ko" ? "승" : "乗" }] : []), ...(b.drop && (b.drop.lat !== b.pick?.lat || b.drop.lng !== b.pick?.lng) ? [{ lat: b.drop.lat, lng: b.drop.lng, title: n(b.drop.name), kind: "drop" as const, glyph: L === "ko" ? "하" : "降" }] : [])] : []), [b, L]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`/golf/my/${no}`)}`} replace />;
  if (!b) return <div className="page step py-20 text-center"><p className="mb-4 font-bold">{t("notFound")}</p><button className="link" onClick={() => nav("/golf/my")}>{t("myBookings")}</button></div>;

  const p = pkgOf(b.pkgId)!;
  const v = viewOf(b, extra);
  const hotel = stayHotel(p, b.opt);
  const opt = optionOf(b.opt);
  const confirmedPickup = v.dep === "GO" || v.status === "DONE" ? b.pickupTime ?? pickupWindow(p, b.pick, pickDrive.drive?.min)?.exact ?? null : null;
  const itin = itinerary(p, b.opt, b.pick, b.drop, { confirmedPickup, pickTime: b.pickTime, dropTime: b.dropTime });
  const due = addDays(b.dep, -SET.COMPANION_DUE_DAYS);
  const alive = v.status === "CONFIRMED";
  const canEdit = alive && todayISO() <= due; // 명단 마감 전, 살아 있는 예약만 (E-DUE)
  const need = b.info.later || b.info.companions.length < b.people - 1;
  const draft = comps ?? Array.from({ length: b.people - 1 }, (_, i) => b.info.companions[i] ?? "");
  // 4 (팀 테스트 10/23): 모집 중 + 합계 < 20 → M-200 / 합계 ≥ 20, 판정 전 → M-129만 / 출발 확정 → M-201 (서버 departure_view state·full 과 같은 기준)
  const stateText = v.label === "OPEN" ? t("M-200", { d: fDayLong(judgeDate(b.dep), L) }) : v.label === "ENOUGH" ? t("M-129", { d: fDayLong(judgeDate(b.dep), L) }) : v.label === "GO" ? t("M-201") : v.label === "OP_CANCEL" ? t("M-202") : v.label === "USER_CANCEL" ? t("M-203") : t("M-204");
  const boxTone = v.label === "OP_CANCEL" ? "border-bad-line bg-bad-soft" : v.label === "GO" ? "border-ok-bg bg-ok-soft" : v.status === "CONFIRMED" ? "border-brand-line bg-brand-soft" : "border-line bg-surface-2";
  const setDemo = (k: "open" | "go" | "cancel" | "user" | "done") => {
    const patch: Partial<Booking> =
      k === "open" ? { status: "CONFIRMED", depStatus: "OPEN", cancelBy: undefined, refundStatus: undefined, pickupTime: undefined } :
      k === "go" ? { status: "CONFIRMED", depStatus: "GO", cancelBy: undefined, refundStatus: undefined, pickupTime: pickupWindow(p, b.pick, pickDrive.drive?.min)?.exact } :
      k === "cancel" ? { status: "OP_CANCEL", depStatus: "CANCEL", cancelBy: "OP", refundStatus: "REQUESTED", canceledAt: todayISO() } :
      k === "user" ? { status: "USER_CANCEL", depStatus: undefined, cancelBy: "USER", refundStatus: "REQUESTED", canceledAt: todayISO() } :
      { status: "DONE", depStatus: "DONE" };
    update(b.no, patch);
  };
  const demoOn = (k: string) => (k === "open" ? v.label === "OPEN" || v.label === "ENOUGH" : k === "go" ? v.label === "GO" : k === "cancel" ? v.label === "OP_CANCEL" : k === "user" ? v.label === "USER_CANCEL" : v.label === "DONE");

  return (
    <>
      <div className="page step pb-8 lg:pb-10">
        <ScreenTag id="S-13" name="예약 상세" refs="FN-20, FN-27, FN-29 · L-04, L-11 · API-12, API-13 · T-24" />
        <div className="mb-3 flex items-center gap-3">
          <button className="grid h-10 w-10 flex-none place-items-center rounded-full hover:bg-surface-2" onClick={() => nav("/golf/my")} aria-label={t("back")}><ArrowLeft size={20} weight="bold" /></button>
          <div className="min-w-0">
            <h1 className="text-[21px] font-bold">{t("bkT")}</h1>
            <p className="num truncate text-[13px] text-muted">{t("noLabel")} {b.no} · {n(p.name)}</p>
          </div>
        </div>

        {/* 1 상태 상자 */}
        <section className={`relative rounded-[20px] border-[1.5px] p-5 ${boxTone}`}>
          <Anno n={1} t="상태 상자: 상태명, 상태별 안내(M-200·M-129·M-201~204, 합계 20명 이상이면 M-129만), 현재 인원 / 최소 20명, 잔여석. 취소 예약은 취소 주체(cancel_by)·환불 상태(refund_status, M-208)" />
          <span className={`badge ${LABEL_CLASS[v.label]}`} style={v.label === "GO" ? { background: "var(--tag-stay)", color: "#fff" } : v.label === "OPEN" ? { background: "var(--brand)", color: "var(--brand-ink)" } : undefined}>{t(`lab_${v.label}`)}</span>
          <p className="mt-2 text-[15px] font-semibold leading-relaxed">{stateText}</p>
          {alive && v.label !== "GO" && (
            <div className="mt-3 grid gap-1.5">
              <Meter now={v.booked} add={0} />
              <div className="flex justify-between text-[12.5px] text-ink-2">
                <span className="num">{t("depNow", { b: v.booked })}</span>
                <span className="num">{SET.BUS_SEATS - v.booked > 0 ? t("seatsLeft", { s: SET.BUS_SEATS - v.booked }) : t("full")} · {t("judge", { d: fDayLong(judgeDate(b.dep), L) })}</span>
              </div>
            </div>
          )}
          {(v.status === "OP_CANCEL" || v.status === "USER_CANCEL") && (
            <dl className="mt-3 grid gap-1 border-t border-line pt-3 text-[13.5px]">
              <div className="flex gap-2"><dt className="w-20 flex-none text-muted">{t("cancelByL")}</dt><dd className="font-semibold">{t(`cancelBy_${v.cancelBy ?? "USER"}`)}</dd></div>
              {v.refund && <div className="flex gap-2"><dt className="w-20 flex-none text-muted">{L === "ko" ? "환불" : "返金"}</dt><dd>{t("M-208", { st: t(`refund_${v.refund}`) })}</dd></div>}
            </dl>
          )}
        </section>

        {/* 데모 (실서비스 제외): 판정 B-01·고객 취소 API-16·승차 시간 등록 API-17·완료 B-03 */}
        <div className="mt-3 grid gap-2 rounded-2xl border border-dashed p-3" style={{ borderColor: "var(--anno)" }}>
          <span className="text-[12.5px] font-bold" style={{ color: "var(--anno)" }}>{t("demoState")}</span>
          <div className="flex flex-wrap gap-1.5">
            {(["open", "go", "cancel", "user", "done"] as const).map((k) => (
              <button key={k} className="fchip" data-on={demoOn(k)} onClick={() => setDemo(k)}>{t(`demo_${k}`)}</button>
            ))}
          </div>
        </div>

        <button className="btn btn-ghost mt-4 w-full" onClick={() => setDoc(true)}><FileText size={20} /> {t("docBtn")}</button>

        {/* 2 승하차 */}
        <section className="relative mt-6">
          <Anno n={2} t="승하차 (booking_stop): 장소명 · 희망 시간(desired_time), 메모, 승차 시간(출발 확정 후 운영 등록 API-17, M-205), 하차일, 지도 앱 열기(I-03), 두 지점 지도" />
          <h2 className="sec-title mb-3 flex items-center gap-2"><Bus size={20} className="text-brand" />{t("busT")}</h2>
          <div className="card divide-y divide-line">
            {([["pick", b.pick], ["drop", b.drop]] as const).map(([k, pl]) => (
              <div key={k} className="flex items-start gap-3 px-4 py-3">
                <span className={`badge ${k === "pick" ? "brand" : "wait"}`}>{k === "pick" ? t("pick") : t("drop")}</span>
                <span className="min-w-0 flex-1 text-[14px]">
                  <b className="block">{pl ? n(pl.name) : "-"}{(k === "pick" ? b.pickTime : b.dropTime) && <span className="font-semibold text-brand"> · {t("wishAt", { t: (k === "pick" ? b.pickTime : b.dropTime)! })}</span>}</b>
                  {pl?.addr && <span className="block text-[12.5px] text-muted">{pl.addr}</span>}
                  {k === "pick" && b.pickMemo && <span className="block text-ink-2">{b.pickMemo}</span>}
                  <span className="text-[12.5px]">
                    {k === "pick" ? (confirmedPickup ? <b className="text-ok">{t("pickupConfirmed", { t: `${fShort(b.dep, L)} ${confirmedPickup}` })}</b> : <span className="text-muted">{t("M-205")}</span>) : <span className="text-muted">{t("dropDay", { d: fShort(tripEnd(p, b.dep), L) })}</span>}
                  </span>
                </span>
                {pl && <a className="link flex-none text-[13px]" href={gmapLink(pl.placeId ? n(pl.name) : `${pl.lat},${pl.lng}`, pl.placeId)} target="_blank" rel="noreferrer">{t("openApp")}</a>}
              </div>
            ))}
          </div>
          {markers.length > 0 && <MapView markers={markers} path={markers.length >= 2 ? markers : undefined} focusKey={b.no} zoom={15} label={t("busT")} className="mt-3 aspect-[16/9]" />}
          <p className="mt-1.5"><Q id="Q-23" t="승차 시간 확정 주체·시점" /></p>
        </section>

        {/* 3 일정표 */}
        <section className="relative mt-6">
          <Anno n={3} t="일정표 (L-11): 실제 날짜·장소가 들어간 일정, 모두 펼침 + 구간 이동 시간" />
          <h2 className="sec-title mb-3">{t("itin")}</h2>
          <div className="card divide-y divide-line">
            {itin.map((items, i) => (
              <div key={i} className="pt-3">
                <p className="px-4 pb-1 text-[13px] font-bold text-brand">{t("dayN", { i: i + 1 })} · <span className="num">{fShort(addDays(b.dep, i), L)}</span></p>
                <ItinList items={items} memo={i === 0 ? b.pickMemo : undefined} />
              </div>
            ))}
          </div>
        </section>

        {/* 골프장·호텔 (화면설계 v1.0 초안 S-13 #4·#5) */}
        <section className="relative mt-6">
          <h2 className="sec-title mb-3 flex items-center gap-2"><Flag size={20} className="text-brand" />{t("golfT")}</h2>
          <div className="grid gap-2">
            {p.days.map((r, i) => (r ? { r, c: courseOf(r.course), date: addDays(b.dep, i) } : null)).filter(Boolean).map((x, i) => (
              <div key={i} className="card flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <b className="block text-[14.5px]">{n(x!.c.name)}</b>
                  <p className="text-[12.5px] text-muted">{n(x!.c.addr)}</p>
                  <p className="num text-[13px] font-semibold">{fShort(x!.date, L)} · {t("tee", { t: x!.r.tee })}</p>
                </div>
                <a className="link flex-none text-[13px]" href={gmapLink(x!.c.name.ja, x!.c.placeId)} target="_blank" rel="noreferrer">{t("openApp")} <ArrowSquareOut size={13} className="inline" /></a>
              </div>
            ))}
          </div>
          {hotel && (
            <div className="card mt-2 flex items-start gap-3 p-4">
              <Bed size={20} className="mt-0.5 flex-none text-brand" />
              <div className="min-w-0 flex-1 text-[13.5px]">
                <b className="block text-[14.5px]">{n(hotel.name)}</b>
                <p className="text-ink-2">{t("nightsN", { n: p.nights })} · {fShort(b.dep, L)} ~ {fShort(tripEnd(p, b.dep), L)}</p>
                <p className="text-muted">{n(AREA_NAME[hotel.area])} · {t("checkin")} · {opt ? n(opt.sub) : n(hotel.room)}</p>
              </div>
            </div>
          )}
        </section>

        {/* 4 동반자 명단 */}
        {b.people > 1 && (
          <section className="relative mt-6">
            <Anno n={4} t="동반자 명단 (booking_member seq ≥ 2, V-24): 살아 있는 예약만, 출발 7일 전까지 수정 → API-13, M-206" />
            <h2 className="sec-title mb-1 flex items-center gap-2"><UsersThree size={20} className="text-brand" />{t("compT")} <Q id="Q-21" t="입력 마감 시점" /></h2>
            {alive && <p className="mb-3 text-[12.5px] text-muted">{t("compDue", { d: fShort(due, L) })}</p>}
            {canEdit && (need || comps) ? (
              <div className="card grid gap-2.5 p-4">
                {draft.map((c, i) => (
                  <label key={i} className="field">
                    <span className="text-[13px] font-semibold text-ink-2">{t("compN", { i: i + 1 })}</span>
                    <input className="input uppercase" placeholder="KIM MINJI" value={c} maxLength={60} onChange={(e) => { const x = [...draft]; x[i] = e.target.value.toUpperCase(); setComps(x); }} />
                  </label>
                ))}
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!draft.every((c) => validEn(c.trim()))}
                  onClick={() => {
                    update(b.no, { info: { ...b.info, later: false, companions: draft.map((c) => c.trim()) } });
                    setComps(null);
                    toast(t("M-206"));
                  }}
                >
                  {t("compSave")}
                </button>
                {!draft.every((c) => validEn(c.trim())) && <p className="help">{t("M-162")}</p>}
              </div>
            ) : (
              <div className="card p-4">
                {b.info.companions.length > 0 ? (
                  <>
                    <span className="badge ok mb-2">{t("compDone")}</span>
                    <ul className="num grid gap-1 text-[14px] sm:grid-cols-2">{b.info.companions.map((c, i) => <li key={i}>{i + 1}. {c}</li>)}</ul>
                    {canEdit && <button className="link mt-2 text-[13px]" onClick={() => setComps(draft)}>{t("change")}</button>}
                  </>
                ) : (
                  <p className="text-[13.5px] text-muted">{alive ? t("compLocked") : "-"}</p>
                )}
              </div>
            )}
          </section>
        )}

        {/* 5 변경·취소 안내 */}
        <section className="relative mt-6 rounded-2xl bg-surface-2 p-4">
          <Anno n={5} t="변경·취소 안내 (M-207): 사이트 내 변경·취소 없음, 고객센터로 → S-14 (T-24)" />
          <h2 className="mb-1 text-[15px] font-bold">{t("cancelT")}</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-2">{t("M-207")}</p>
          <button className="btn btn-primary mt-3 w-full" onClick={() => nav("/golf/support")}><Headset size={20} /> {t("supportBtn")}</button>
        </section>
      </div>

      <Sheet open={doc} onClose={() => setDoc(false)} title={t("docT")} wide footer={<button className="btn btn-ghost w-full" onClick={() => window.print()}><Printer size={18} /> {t("print")}</button>}>
        <div className="printable grid gap-3 text-[14px]">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <b className="tracking-[0.08em]">TRAVENDER</b>
            <span className="num text-[13px] text-muted">{b.createdAt}</span>
          </div>
          <h3 className="text-[18px] font-bold">{t("docT")}</h3>
          {[
            [t("noLabel"), b.no],
            [t("stateL"), t(`lab_${v.label}`)],
            [t("repT"), `${b.info.nameKo} (${b.info.nameEn}) · ${b.info.cc} ${b.info.phone} · ${b.info.email}`],
            [t("rowPkg"), n(p.name)],
            [t("rowDep"), `${fDate(b.dep, L)} ~ ${fDate(tripEnd(p, b.dep), L)}`],
            [t("rowPeople"), t("peopleN", { n: b.people })],
            [t("rowHotel"), hotel ? `${n(hotel.name)}${opt ? ` · ${n(opt.sub)}` : ""}` : t("noHotel")],
            [t("rowPick"), b.pick ? n(b.pick.name) : "-"],
            [t("rowDrop"), b.drop ? n(b.drop.name) : "-"],
            [t("totalL", { n: b.people }), `${yen(b.total)} (${t("busIncl")})`],
            [t("supT"), `${SET.SUPPORT_TEL} · 10:00~17:00`],
          ].map(([k, val]) => (
            <div key={k} className="grid grid-cols-[96px_1fr] gap-3 border-b border-line pb-2">
              <span className="font-semibold text-muted">{k}</span>
              <span className="font-semibold">{val}</span>
            </div>
          ))}
          <p className="text-[12.5px] text-muted">{t("M-150", { m: SET.MIN_DEPARTURE, d: fDayLong(judgeDate(b.dep), L) })}</p>
        </div>
      </Sheet>
    </>
  );
}
