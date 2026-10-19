import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Crown } from "@phosphor-icons/react";
import { hotelOf, pkgOf } from "../data";
import { useT } from "../i18n";
import { useDb, useDraft } from "../store";
import { coursesOf, firstAvailable, fShort, rounds, seatsLeft, yen } from "../logic";
import { Anno, Img, ScreenTag, StageTag, Steps } from "../components/ui";

export default function Compare() {
  const { t, n, L } = useT();
  const nav = useNavigate();
  const { cmp, date, people, patch, choosePkg } = useDraft();
  const extra = useDb((s) => s.extra);
  const pk = cmp.map(pkgOf).filter(Boolean) as NonNullable<ReturnType<typeof pkgOf>>[];
  useEffect(() => {
    if (pk.length < 2) nav("/golf/packages", { replace: true }); // 2개 미만이 되면 S-02로
  }, [pk.length, nav]);
  const early = pk.map((p) => firstAvailable(p, date, people, extra));
  const minPrice = Math.min(...pk.map((p) => p.price));
  const maxRounds = Math.max(...pk.map(rounds));
  const firstDep = early.filter(Boolean).sort()[0];
  const rows: { k: string; cells: { v: string; best?: boolean }[] }[] = [
    { k: t("cmpType"), cells: pk.map((p) => ({ v: t(`type_${p.type}`) })) },
    { k: t("cmpPeriod"), cells: pk.map((p) => ({ v: p.nights ? t("nightsDays", { n: p.nights, d: p.nights + 1 }) : t("dayTrip") })) },
    { k: t("cmpRounds"), cells: pk.map((p) => ({ v: t("roundsN", { n: rounds(p) }), best: rounds(p) === maxRounds })) },
    { k: t("cmpCourses"), cells: pk.map((p) => ({ v: coursesOf(p).map((c) => n(c.name)).join(", ") })) },
    { k: t("cmpHotel"), cells: pk.map((p) => ({ v: hotelOf(p.hotel) ? n(hotelOf(p.hotel)!.name) : t("noHotel") })) },
    { k: t("cmpPrice"), cells: pk.map((p) => ({ v: yen(p.price), best: p.price === minPrice })) },
    { k: t("cmpDep"), cells: early.map((d, i) => ({ v: d ? `${fShort(d, L)} · ${t("seatsLeft", { s: seatsLeft(pk[i].id, d, extra) })}` : "-", best: !!d && d === firstDep })) },
  ];
  const cols = `76px repeat(${pk.length}, minmax(0, 1fr))`;
  return (
    <div className="page step">
      <ScreenTag id="S-04" name="패키지 비교 (2단계)" refs="FN-05 · API-01 · T-05" />
      <div className="mb-1 flex items-center gap-3">
        <button className="grid h-10 w-10 flex-none place-items-center rounded-full hover:bg-surface-2" onClick={() => nav("/golf/packages")} aria-label={t("back")}><ArrowLeft size={20} weight="bold" /></button>
        <div className="flex-1"><Steps at={0} hasHotel /></div>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-[22px] font-bold">{t("cmpTitle")}</h1>
        <StageTag s={2} />
      </div>
      <div className="relative card p-3">
        <Anno n={1} t="비교 표: 열 = 패키지(최대 3), 행 = 유형·일정·라운드·골프장·호텔·1인 가격·출발일, 열의 '예약' → S-03 (T-05)" />
        <div className="grid gap-2" style={{ gridTemplateColumns: cols }}>
          <span />
          <AnimatePresence>
            {pk.map((p) => (
              <motion.div key={p.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="grid content-start gap-2">
                <div className="aspect-[4/3] overflow-hidden rounded-xl"><Img src={p.photos[0]} alt={n(p.name)} /></div>
                <b className="line-clamp-3 text-[13px] leading-snug [overflow-wrap:anywhere]">{n(p.name)}</b>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="mt-3 border-t border-line">
          {rows.map((r) => (
            <div key={r.k} className="grid items-start gap-2 border-b border-line py-3 last:border-0" style={{ gridTemplateColumns: cols }}>
              <span className="text-[12.5px] font-semibold text-muted">{r.k}</span>
              {r.cells.map((c, i) => (
                <span key={i} className={`text-[13px] leading-snug [overflow-wrap:anywhere] ${c.best && pk.length > 1 ? "font-extrabold text-brand" : "font-semibold"}`}>
                  {c.v}
                  {c.best && pk.length > 1 && <Crown size={13} weight="fill" className="ml-1 inline align-[-1px]" aria-label={t("best")} />}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-1 grid gap-2" style={{ gridTemplateColumns: cols }}>
          <span />
          {pk.map((p) => (
            <button key={p.id} className="link text-[13px] font-semibold text-muted underline" onClick={() => patch({ cmp: cmp.filter((x) => x !== p.id) })}>{t("remove")}</button>
          ))}
        </div>
        <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: cols }}>
          <span />
          {pk.map((p, i) => (
            <button key={p.id} className="btn btn-primary btn-sm px-2" onClick={() => { choosePkg(p.id); if (early[i] && date) patch({ dep: early[i] }); nav(`/golf/packages/${p.id}`); }}>{t("reserveShort")}</button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">{t("busInclFull")}</p>
    </div>
  );
}
