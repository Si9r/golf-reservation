import { Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowSquareOut, Bed, Minus, Plus, Star } from "@phosphor-icons/react";
import { SET, type Hotel, type Pkg } from "../data";
import { useT } from "../i18n";
import { coursesOf, fShort, hasHotelStep, optionOf, roomsOf, stayHotel, totalPrice, yen, yenDiff } from "../logic";
import { Anno, BottomBar, PriceBlock, Q, ScreenTag, Steps } from "../components/ui";
import { DriveChip, MapView } from "../components/GoogleMap";
import { useFlow } from "./flow";
import { useSeatGuard } from "../api/seatCheck";

export default function HotelOption() {
  const { t, n, L } = useT();
  const nav = useNavigate();
  const { d, p, redirect } = useFlow();
  const guard = useSeatGuard();
  if (redirect) return <Navigate to={redirect} replace />;
  if (!hasHotelStep(p)) return <Navigate to="/golf/book/place" replace />; // 당일 패키지만 건너뜀 (팀 테스트 10/23 B-03)
  const fixed = p.opts.length === 0; // 호텔 옵션이 없는(호텔이 정해진) 패키지: 호텔은 보여 주기만, 객실 구성은 고를 수 있게
  const opt = d.opt ?? p.opts[0] ?? null;
  const hotel = stayHotel(p, opt);
  const price = totalPrice(p, opt, d.people, d.singles);
  const rooms = roomsOf(d.people, d.singles);
  const setSingles = (s: number) => d.patch({ singles: roomsOf(d.people, s).singles });
  const back = () => nav(d.editReturn ? "/golf/book/review" : `/golf/packages/${p.id}`);
  const next = () => guard(() => nav(d.editReturn ? "/golf/book/review" : "/golf/book/place")); // T-08, B-01 잔여석 다시 확인
  return (
    <div className="page step">
      <ScreenTag id="S-05" name="호텔 옵션 선택" refs="FN-09, FN-11 · API-02 · T-08, T-28" />
      <div className="mb-1 flex items-center gap-3">
        <button className="grid h-10 w-10 flex-none place-items-center rounded-full hover:bg-surface-2" onClick={back} aria-label={t("back")}><ArrowLeft size={20} weight="bold" /></button>
        <div className="flex-1"><Steps at={1} hasHotel /></div>
      </div>
      <section className="relative mb-5">
        <Anno n="S-05" t="제목·선택 요약 (패키지·출발일·인원)" />
        <h1 className="text-[22px] font-bold leading-snug">{t("s05T")}</h1>
        <p className="mt-1 text-[14px] text-muted">{n(p.name)} · {fShort(d.dep!, L)} {L === "ko" ? "출발" : "出発"} · {t("peopleN", { n: d.people })}</p>
      </section>
      {fixed && hotel && (
        <section className="relative grid gap-2.5">
          <Anno n={1} t="호텔이 정해진 패키지 (옵션 없음): '이 패키지의 숙박 호텔' 카드(호텔명·객실 타입·위치·지도), 선택할 수 없음 (팀 테스트 10/23 B-03)" />
          <h2 className="flex items-center gap-2 text-[15px] font-bold">{t("fixedHotelT")} <span className="chip gray">{t("fixedBadge")}</span></h2>
          <p className="text-[13px] text-muted">{t("fixedHotelNote")}</p>
          <HotelCard p={p} hotel={hotel} />
        </section>
      )}
      {!fixed && <section className="relative grid gap-2.5" role="radiogroup" aria-label={t("s05T")}>
        <Anno n={1} t="옵션 목록 (단일 선택, hotel_option): 호텔명·객실·평점·위치·가격 차이(기본/+/−), '숙박 없음'도 옵션 (M-130)" />
        {p.opts.map((id, i) => {
          const o = optionOf(id)!;
          const h = stayHotel(p, id);
          return (
            <button key={id} role="radio" aria-checked={opt === id} className="opt items-start py-4" onClick={() => d.patch({ opt: id })}>
              <span className="radio mt-0.5" />
              <span className="min-w-0 flex-1">
                <b className="block text-[15.5px]">{n(o.name)}{!o.hotel && !o.none && h ? <span className="font-normal text-ink-2"> · {n(h.name)}</span> : null}</b>
                <span className="block text-[13px] text-muted">{n(o.sub)}</span>
                {h?.rating && o.hotel && (
                  <span className="mt-1 flex items-center gap-1 text-[12.5px] text-ink-2"><Star size={12} weight="fill" className="text-[#F59E0B]" /><span className="num">{h.rating}</span> · {n(h.near)}</span>
                )}
              </span>
              <span className={`num flex-none text-[14px] font-bold ${o.add === 0 || i === 0 ? "text-ink-2" : o.add > 0 ? "text-ink" : "text-ok"}`}>{i === 0 && o.add === 0 ? t("base") : yenDiff(o.add)}</span>
            </button>
          );
        })}
        <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">{t("M-130")} <Q id="Q-02" t="옵션 구성·1인실 요금 (패키지 데이터)" /></p>
      </section>}
      {/* 4 객실 구성 (피드백 5) */}
      {hotel && (
        <section className="relative mt-5 card p-4">
          <Anno n={4} t="객실 구성: 2인 1실 기본, 홀수 인원이면 1명은 1인실 자동. 1인실 인원 ± (2명 단위, 인원과 홀짝 같음), 1인실 추가 요금 × 1인실 인원 (M-131)" />
          <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold"><Bed size={18} className="text-brand" /> {t("roomsT")}</h2>
          <p className="text-[13.5px] font-semibold">{t("peopleN", { n: d.people })} → {t(rooms.singles ? "roomsSum" : "roomsSum0", { t: rooms.twins, s: rooms.singles })}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[13.5px] text-ink-2">{t("singlesL")}</span>
            <div className="flex items-center gap-2">
              <button className="grid h-9 w-9 place-items-center rounded-full border border-line-strong disabled:opacity-40" aria-label="-" disabled={rooms.singles - 2 < d.people % 2} onClick={() => setSingles(rooms.singles - 2)}><Minus size={16} weight="bold" /></button>
              <b className="num w-10 text-center text-[16px]">{rooms.singles}</b>
              <button className="grid h-9 w-9 place-items-center rounded-full border border-line-strong disabled:opacity-40" aria-label="+" disabled={rooms.singles + 2 > d.people} onClick={() => setSingles(rooms.singles + 2)}><Plus size={16} weight="bold" /></button>
            </div>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{t("M-131", { p: yen(SET.SINGLE_ADD) })}</p>
        </section>
      )}
      {!fixed && (
        <section className="relative mt-5">
          <Anno n={2} t="선택 호텔 지도 (I-01) + TRAVENDER 호텔 페이지 링크 + 호텔 → 골프장 이동 시간" />
          <AnimatePresence mode="wait">
            {hotel ? (
              <motion.div key={hotel.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <HotelCard p={p} hotel={hotel} />
              </motion.div>
            ) : (
              <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-2xl bg-surface-2 p-4 text-[14px] text-ink-2">{t("noHotelNote")}</motion.p>
            )}
          </AnimatePresence>
        </section>
      )}
      <BottomBar>
        <span className="absolute -top-3 left-3"><Anno n={3} t="하단: 총액(1인실 추가 포함) + 다음: 항상 활성 (기본 옵션 선택됨) → S-06 (T-08) / 변경 중 → S-08" /></span>
        <PriceBlock main={yen(price.total)} sub={`${t("totalL", { n: d.people })}${price.singleAdd ? ` · ${t("lineSingle", { p: yen(SET.SINGLE_ADD), n: rooms.singles })}` : ""}`} />
        <button className="btn btn-primary min-w-[140px]" onClick={next}>{d.editReturn ? t("editBack") : t("next")}</button>
      </BottomBar>
    </div>
  );
}

// 호텔 카드: 지도 + 호텔명·객실 타입·위치 + 골프장까지 이동 시간 + TRAVENDER 호텔 페이지
function HotelCard({ p, hotel }: { p: Pkg; hotel: Hotel }) {
  const { t, n } = useT();
  return (
    <div className="card overflow-hidden">
      <MapView
        markers={[{ lat: hotel.lat, lng: hotel.lng, title: n(hotel.name), kind: "hotel", glyph: "H" }, ...coursesOf(p).map((c, i) => ({ lat: c.lat, lng: c.lng, title: n(c.name), kind: "golf" as const, glyph: String(i + 1) }))]}
        focusKey={hotel.id}
        label={n(hotel.name)}
        className="aspect-[16/9] rounded-none"
      />
      <div className="grid gap-1 p-4">
        <b className="text-[15px]">{n(hotel.name)}</b>
        <p className="text-[13px] text-muted">{n(hotel.room)} · {n(hotel.near)}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {coursesOf(p).map((c, i) => (
            <DriveChip key={c.id} from={hotel} to={c} label={`${i + 1}. ${n(c.name)}`} />
          ))}
        </div>
        {hotel.area === "SAPPORO" && (
          <a className="link mt-1 inline-flex items-center gap-1 text-[13px]" href="https://travender-hokkaido.com/hotels" target="_blank" rel="noreferrer">{t("hotelPage")} <ArrowSquareOut size={14} /></a>
        )}
      </div>
    </div>
  );
}
