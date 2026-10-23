import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowSquareOut, Bed, Bus, CaretRight, Copy, FileText, Flag, Headset, Printer, UsersThree } from "@phosphor-icons/react";
import { AREA_NAME, SET, courseOf, pkgOf } from "../data";
import { useT } from "../i18n";
import { useApp, useAuth, useDb, useToast, viewOf, type Booking } from "../store";
import { addDays, coursesOf, fDate, fDayLong, fShort, itinerary, judgeDate, optionOf, pickupWindow, stayHotel, todayISO, tripEnd, yen } from "../logic";
import { Anno, Img, Q, ScreenTag, Sheet, gmapLink } from "../components/ui";
import { useDrive } from "../gmaps";
import { ItinList, Meter } from "./Detail";
import { PriceDetail } from "../components/booking";
import { joinEn, splitEn, upper, validPart } from "./InfoForm";
import { USE_API, api } from "../api/client";
import { toBooking, useApiVersion } from "../api/sync";

export default function MyDetail() {
  const { no } = useParams();
  const { t, n, L } = useT();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const toast = useToast((s) => s.show);
  const { bookings, extra, update } = useDb();
  const b = bookings.find((x) => x.no === no);
  const [doc, setDoc] = useState(false);
  const [comps, setComps] = useState<[string, string][] | null>(null); // 동반자 명단 수정 중 [성, 이름]
  const anno = useApp((s) => s.anno);
  const [apiState, setApiState] = useState<"idle" | "loading" | "missing">("idle");
  useApiVersion((s) => s.v);
  // API 모드: 예약 상세를 서버에서 (API-12). 남의 예약·없는 예약이면 E-FORBID / E-NOTFOUND
  useEffect(() => {
    if (!USE_API || !user || !no) return;
    setApiState("loading");
    api.booking(no)
      .then((x) => {
        const nb = toBooking(x);
        useDb.setState((st) => ({ bookings: [nb, ...st.bookings.filter((y) => y.no !== nb.no)] }));
        setApiState("idle");
      })
      .catch(() => setApiState("missing"));
  }, [no, user]);
  const bp = b ? pkgOf(b.pkgId) : null;
  const pickDrive = useDrive(b?.pick, bp ? coursesOf(bp)[0] : null);
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`/golf/my/${no}`)}`} replace />;
  if (USE_API && apiState === "loading" && !b) return <div className="page step py-20 text-center text-muted">…</div>;
  if (!b || (USE_API && apiState === "missing")) return <div className="page step py-20 text-center"><p className="mb-4 font-bold">{t("notFound")}</p><button className="link" onClick={() => nav("/golf/my")}>{t("myBookings")}</button></div>;

  const p = pkgOf(b.pkgId)!;
  const v = viewOf(b, extra);
  const hotel = stayHotel(p, b.opt);
  const opt = optionOf(b.opt);
  const confirmedPickup = v.dep === "GO" || v.status === "DONE" ? b.pickupTime ?? pickupWindow(p, b.pick, pickDrive.drive?.min)?.exact ?? null : null;
  const itin = itinerary(p, b.opt, b.pick, b.drop, { confirmedPickup, pickTime: b.pickTime, dropTime: b.dropTime }); // 13: 희망 승하차 시간
  const due = addDays(b.dep, -SET.COMPANION_DUE_DAYS);
  const alive = v.status === "CONFIRMED";
  const canEdit = alive && todayISO() <= due; // 명단 마감 전, 살아 있는 예약만 (E-DUE)
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

  const draft: [string, string][] = comps ?? Array.from({ length: b.people - 1 }, (_, i) => (b.info.companions[i] ? splitEn(b.info.companions[i]) : ["", ""]));
  const draftOk = draft.every((x) => x.every(validPart));
  const judge = fDayLong(judgeDate(b.dep), L); // 6: '10월 30일(금)에 …' 문장용
  const need = Math.max(0, SET.MIN_DEPARTURE - v.booked);
  // 1 상태 띠: 상태마다 제목 1개 + 설명 1문장 ('판정일' 대신 날짜 문장, 모집 중·인원 충족 문구가 겹치지 않게)
  const st =
    v.label === "OPEN" ? { tone: "warn", title: t("mdOpenT", { n: need }), desc: t("mdOpenD", { d: judge, m: SET.MIN_DEPARTURE }) } :
    v.label === "ENOUGH" ? { tone: "ok", title: t("mdEnoughT"), desc: t("mdEnoughD", { d: judge }) } :
    v.label === "GO" ? { tone: "brand", title: t("mdGoT"), desc: confirmedPickup ? t("mdGoD", { t: `${fShort(b.dep, L)} ${confirmedPickup}`, p: b.pick ? n(b.pick.name) : "-" }) : t("M-201") } :
    v.label === "OP_CANCEL" ? { tone: "bad", title: t("mdOpCancelT"), desc: t("M-202") } :
    v.label === "USER_CANCEL" ? { tone: "mute", title: t("mdUserCancelT"), desc: t("M-203") } :
    { tone: "mute", title: t("mdDoneT"), desc: t("M-204") };
  const TONE: Record<string, { box: string; ink: string }> = {
    warn: { box: "border-warn-line bg-warn-soft", ink: "text-warn" },
    ok: { box: "border-ok-bg bg-ok-soft", ink: "text-ok" },
    brand: { box: "border-brand-line bg-brand-soft", ink: "text-brand" },
    bad: { box: "border-bad-line bg-bad-soft", ink: "text-bad" },
    mute: { box: "border-line bg-surface-2", ink: "text-ink" },
  };
  const tone = TONE[st.tone];
  const copyNo = () => { navigator.clipboard?.writeText(b.no).then(() => toast(t("copied"))).catch(() => undefined); };
  const saveComps = async () => {
    const names = draft.map(joinEn);
    // API 모드: 동반자 명단을 서버에 저장 (API-13). 실패하면 화면 값은 그대로 두고 오류 안내
    if (USE_API) {
      try {
        await api.saveCompanions(b.no, names);
      } catch {
        toast(t("M-900"));
        return;
      }
    }
    update(b.no, { info: { ...b.info, later: false, companions: names } });
    setComps(null);
    toast(t("M-206"));
  };

  return (
    <>
      <div className="page step pb-8 lg:pb-10">
        <ScreenTag id="S-13" name="예약 상세" refs="FN-20, FN-27, FN-29 · L-04, L-11 · API-12, API-13 · T-24" />
        <div className="mb-3 flex items-center gap-3">
          <button className="grid h-10 w-10 flex-none place-items-center rounded-full hover:bg-surface-2" onClick={() => nav("/golf/my")} aria-label={t("back")}><ArrowLeft size={20} weight="bold" /></button>
          <h1 className="flex-1 text-[21px] font-bold">{t("bkT")}</h1>
          <button className="flex flex-none items-center gap-1 text-[13px] text-muted hover:text-ink" onClick={copyNo} aria-label={t("copyNo")}>
            <span className="num">{b.no}</span> <Copy size={15} />
          </button>
        </div>

        {/* 1 상태 띠 (PC: 왼쪽 문장 · 오른쪽 인원 막대) */}
        <section className={`relative grid gap-3 rounded-[20px] border-[1.5px] p-5 lg:grid-cols-[1fr_260px] lg:items-center lg:gap-6 ${tone.box}`}>
          <Anno n={1} t="상태 띠: 상태마다 제목 1개 + 설명 1문장 (모집 중 / 인원 다 모임·출발 확정 대기 / 출발 확정+승차 시간 / 운행 취소 / 고객 취소 / 완료), 살아 있는 예약은 인원 막대. 취소 예약은 취소 주체·환불 상태" />
          <div>
            <h2 className={`text-[17px] font-extrabold lg:text-[19px] ${tone.ink}`}>{st.title}</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-ink lg:text-[15px]">{st.desc}</p>
            {(v.status === "OP_CANCEL" || v.status === "USER_CANCEL") && (
              <dl className="mt-3 grid gap-1 border-t border-line pt-3 text-[13.5px]">
                <div className="flex gap-2"><dt className="w-20 flex-none text-muted">{t("cancelByL")}</dt><dd className="font-semibold">{t(`cancelBy_${v.cancelBy ?? "USER"}`)}</dd></div>
                {v.refund && <div className="flex gap-2"><dt className="w-20 flex-none text-muted">{L === "ko" ? "환불" : "返金"}</dt><dd>{t("M-208", { st: t(`refund_${v.refund}`) })}</dd></div>}
              </dl>
            )}
          </div>
          {alive && v.label !== "GO" && (
            <div className="grid gap-1.5">
              <Meter now={v.booked} add={0} />
              <span className={`num text-right text-[13px] font-semibold ${tone.ink}`}>{v.booked} / {SET.MIN_DEPARTURE}{L === "ko" ? "명" : "名"}</span>
            </div>
          )}
        </section>

        {/* 데모 (설계 패널을 켰을 때만): 판정 B-01·고객 취소 API-16·승차 시간 등록 API-17·완료 B-03 */}
        {anno && (
          <div className="mt-3 grid gap-2 rounded-2xl border border-dashed p-3" style={{ borderColor: "var(--anno)" }}>
            <span className="text-[12.5px] font-bold" style={{ color: "var(--anno)" }}>{t("demoState")}</span>
            <div className="flex flex-wrap gap-1.5">
              {(["open", "go", "cancel", "user", "done"] as const).map((k) => (
                <button key={k} className="fchip" data-on={demoOn(k)} onClick={() => setDemo(k)}>{t(`demo_${k}`)}</button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-6">
          <div className="grid gap-3">
            {/* 패키지 카드 */}
            <section className="card flex items-center gap-3 p-3">
              <div className="relative h-[60px] w-[78px] flex-none overflow-hidden rounded-xl"><Img src={p.photos[0]} alt={n(p.name)} className="absolute inset-0 h-full w-full" /></div>
              <div className="min-w-0 flex-1">
                <b className="line-clamp-2 text-[15px] font-extrabold leading-snug">{n(p.name)}</b>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
                  {fShort(b.dep, L)} ~ {fShort(tripEnd(p, b.dep), L)}
                  <span className="badge brand">{t("peopleN", { n: b.people })}</span>
                </p>
                <p className="truncate text-[12.5px] text-muted">{hotel ? `${n(hotel.name)} · ${opt && !opt.hotel ? n(opt.sub) : n(hotel.room)}` : opt?.none ? n(opt.name) : t("noHotel")}</p>
              </div>
            </section>

            {/* 2 버스 승하차 (지도 대신 지도 앱 링크, PC는 승차·하차 나란히) */}
            <section className="relative card overflow-hidden">
              <Anno n={2} t="승하차 (booking_stop): 장소명 · 희망 시간, 메모, 승차 시간(출발 확정 후 API-17, M-205), 하차일, 지도 앱 열기(I-03). 지도는 승하차 화면에서만" />
              <p className="flex items-center gap-1.5 border-b border-line px-4 py-2.5 text-[13px] font-semibold text-muted"><Bus size={16} /> {t("busT")} <Q id="Q-23" t="승차 시간 확정 주체·시점" /></p>
              <div className="grid divide-y divide-line lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                {([["pick", b.pick], ["drop", b.drop]] as const).map(([k, pl]) => (
                  <div key={k} className="flex items-start gap-3 px-4 py-3">
                    <span className={`badge ${k === "pick" ? "brand" : "wait"}`}>{k === "pick" ? t("pick") : t("drop")}</span>
                    <span className="min-w-0 flex-1 text-[14px]">
                      <b className="block">{pl ? n(pl.name) : "-"}</b>
                      {(k === "pick" ? b.pickTime : b.dropTime) && <span className="block text-[13px] font-semibold text-brand">{t("wishAt", { t: (k === "pick" ? b.pickTime : b.dropTime)! })}</span>}
                      {k === "pick" && b.pickMemo && <span className="block text-[13px] text-ink-2">{b.pickMemo}</span>}
                      <span className="block text-[12.5px]">
                        {k === "pick" ? (confirmedPickup ? <b className="text-ok">{t("pickupConfirmed", { t: `${fShort(b.dep, L)} ${confirmedPickup}` })}</b> : <span className="text-muted">{t("M-205")}</span>) : <span className="text-muted">{t("dropDay", { d: fShort(tripEnd(p, b.dep), L) })}</span>}
                      </span>
                      {pl && <a className="link mt-0.5 inline-flex items-center gap-1 text-[13px]" href={gmapLink(pl.placeId ? n(pl.name) : `${pl.lat},${pl.lng}`, pl.placeId)} target="_blank" rel="noreferrer">{t("openApp")} <ArrowSquareOut size={13} /></a>}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* 3 일정표 (항상 펼침) */}
            <section className="relative card overflow-hidden">
              <Anno n={3} t="일정표 (L-11): 실제 날짜·장소가 들어간 일정, 항상 펼침 + 구간 이동 시간" />
              <h2 className="px-4 py-3.5 text-[14.5px] font-bold">{t("mdItin", { n: itin.length })}</h2>
              <div className="pb-2">
                <div className="grid gap-1">
                  {itin.map((items, i) => (
                    <div key={i}>
                      <p className="px-4 pb-1 text-[13px] font-bold text-brand">{t("dayN", { i: i + 1 })} · <span className="num">{fShort(addDays(b.dep, i), L)}</span></p>
                      <ItinList items={items} memo={i === 0 ? b.pickMemo : undefined} />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 골프장·호텔 (항상 펼침) */}
            <section className="relative card overflow-hidden">
              <h2 className="flex items-center gap-1.5 px-4 py-3.5 text-[14.5px] font-bold"><Flag size={16} className="text-brand" />{t("mdGolfHotel")}</h2>
              <div>
                <div className="grid gap-2 px-4 pb-4">
                  {p.days.map((r, i) => (r ? { r, c: courseOf(r.course), date: addDays(b.dep, i) } : null)).filter(Boolean).map((x, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl bg-surface-2 p-3">
                      <div className="min-w-0 flex-1">
                        <b className="block text-[14px]">{n(x!.c.name)}</b>
                        <p className="text-[12.5px] text-muted">{n(x!.c.addr)}</p>
                        <p className="num text-[13px] font-semibold">{fShort(x!.date, L)} · {t("tee", { t: x!.r.tee })}</p>
                      </div>
                      <a className="link flex-none text-[13px]" href={gmapLink(x!.c.name.ja, x!.c.placeId)} target="_blank" rel="noreferrer">{t("openApp")} <ArrowSquareOut size={13} className="inline" /></a>
                    </div>
                  ))}
                  {hotel && (
                    <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-3">
                      <Bed size={20} className="mt-0.5 flex-none text-brand" />
                      <div className="min-w-0 flex-1 text-[13.5px]">
                        <b className="block text-[14px]">{n(hotel.name)}</b>
                        <p className="text-ink-2">{t("nightsN", { n: p.nights })} · {fShort(b.dep, L)} ~ {fShort(tripEnd(p, b.dep), L)}</p>
                        <p className="text-muted">{n(AREA_NAME[hotel.area])} · {t("checkin")} · {opt && !opt.hotel ? n(opt.sub) : n(hotel.room)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="grid gap-3 lg:sticky lg:top-24">
            {/* 4 동반자 명단 (손님이 할 일 → 오른쪽 위) */}
            {b.people > 1 && (
              <section className="relative card border-[1.5px] p-4" style={{ borderColor: canEdit ? "var(--brand)" : undefined }}>
                <Anno n={4} t="동반자 명단 (booking_member seq ≥ 2, V-24): 영문 성·이름, 살아 있는 예약만 출발 7일 전까지 수정 → API-13, M-206" />
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 text-[15px] font-bold"><UsersThree size={18} className="text-brand" />{t("compT")} <span className="text-[13px] font-normal text-muted">{t("peopleN", { n: b.people - 1 })}</span></h2>
                  {canEdit && !comps && b.info.companions.length > 0 && <button className="link text-[13.5px]" onClick={() => setComps(draft)}>{t("mdEdit")}</button>}
                </div>
                {canEdit && !comps && b.info.companions.length < b.people - 1 ? (
                  // 아직 명단이 없으면 입력칸을 바로 펼치지 않고 안내 + 버튼 하나 (오른쪽이 너무 길어지지 않게)
                  <div className="grid gap-2 rounded-xl bg-warn-soft p-3">
                    <p className="text-[13.5px] font-semibold text-warn">{t("mdCompNeed", { n: b.people - 1 - b.info.companions.length })}</p>
                    <button className="btn btn-primary btn-sm" onClick={() => setComps(draft)}>{t("mdCompInput")}</button>
                  </div>
                ) : canEdit && comps ? (
                  <div className="grid gap-2.5">
                    {draft.map((c, i) => (
                      <div key={i} className="field">
                        <span className="text-[13px] font-semibold text-ink-2">{t("compN", { i: i + 1 })}</span>
                        <div className="grid grid-cols-2 gap-2">
                          {[0, 1].map((k) => (
                            <input key={k} className="input uppercase" value={c[k]} maxLength={30} placeholder={t(k ? "enGivenPh" : "enSurPh")} aria-label={`${t("compN", { i: i + 1 })} ${t(k ? "enGiven" : "enSur")}`}
                              onChange={(e) => { const x = draft.map((y) => [...y] as [string, string]); x[i][k] = upper(e.target.value); setComps(x); }} />
                          ))}
                        </div>
                      </div>
                    ))}
                    {!draftOk && <p className="help">{t("M-162")}</p>}
                    <div className="flex gap-2">
                      {comps && b.info.companions.length > 0 && <button className="btn btn-ghost btn-sm flex-1" onClick={() => setComps(null)}>{t("cancel")}</button>}
                      <button className="btn btn-primary btn-sm flex-1" disabled={!draftOk} onClick={saveComps}>{t("compSave")}</button>
                    </div>
                  </div>
                ) : b.info.companions.length > 0 ? (
                  <ul className="num grid gap-1 text-[14px]">{b.info.companions.map((c, i) => <li key={i}>{i + 1}. {c}</li>)}</ul>
                ) : (
                  <p className="text-[13.5px] text-muted">{alive ? t("compLocked") : "-"}</p>
                )}
                {alive && <p className={`mt-2 text-[12.5px] ${canEdit ? "text-warn" : "text-muted"}`}>{t("compDue", { d: fShort(due, L) })}</p>}
              </section>
            )}

            {/* 결제 금액 */}
            <section className="card p-4">
              <p className="mb-2 text-[13px] font-bold text-brand">{t("mdPay")} · {t("peopleN", { n: b.people })}</p>
              <PriceDetail p={p} opt={b.opt} people={b.people} singles={b.singles ?? null} />
              <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-[14px] font-semibold">{t("totalL", { n: b.people })}</span>
                <span className="num text-[22px] font-extrabold text-brand">{yen(b.total)}</span>
              </div>
            </section>

            {/* 바로가기 목록: 확인서 · 고객센터 (버튼 2개를 나란히 두면 글자가 잘려서 한 줄씩). 승차 장소 지도는 승하차 칸의 링크로 */}
            <section className="relative card divide-y divide-line overflow-hidden">
              <Anno n={5} t="바로가기: 예약 확인서(인쇄·저장) / 고객센터(S-14, T-24) — 변경·취소는 고객센터로 (M-207)" />
              {[
                { icon: FileText, title: t("docBtn"), sub: t("mdDocSub"), on: () => setDoc(true) },
                { icon: Headset, title: t("mdSupT"), sub: t("mdSupSub"), on: () => nav("/golf/support") },
              ].map(({ icon: I, title, sub, on }) => (
                <button key={title} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2" onClick={on}>
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand-soft text-brand"><I size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14px]">{title}</b>
                    <span className="block truncate text-[12.5px] text-muted">{sub}</span>
                  </span>
                  <CaretRight size={16} className="flex-none text-muted" />
                </button>
              ))}
            </section>
            <p className="text-[12.5px] leading-relaxed text-muted">{t("M-207")}</p>
          </div>
        </div>
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
