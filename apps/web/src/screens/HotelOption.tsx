import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowSquareOut, Bed, CaretDown, Minus, Plus, Star } from "@phosphor-icons/react";
import { SET } from "../data";
import { useT } from "../i18n";
import { coursesOf, distM, fShort, optionOf, roomsOf, stayHotel, totalPrice, yen, yenDiff } from "../logic";
import { Anno, BottomBar, gmapLink, PriceBlock, Q, ScreenTag, StepHead } from "../components/ui";
import { DriveChip, MapView } from "../components/GoogleMap";
import { useFlow } from "./flow";

export default function HotelOption() {
  const { t, n, L } = useT();
  const nav = useNavigate();
  const { d, p, redirect } = useFlow();
  const [folded, setFolded] = useState(false); // 고른 옵션을 한 번 더 누르면 접힘
  if (redirect) return <Navigate to={redirect} replace />;
  if (!p.opts.length) return <Navigate to="/golf/book/place" replace />;
  const opt = d.opt ?? p.opts[0];
  const hotel = stayHotel(p, opt);
  const price = totalPrice(p, opt, d.people, d.singles);
  const rooms = roomsOf(d.people, d.singles);
  const setSingles = (s: number) => d.patch({ singles: roomsOf(d.people, s).singles });
  const back = () => nav(d.editReturn ? "/golf/book/review" : `/golf/packages/${p.id}`);
  const next = () => nav(d.editReturn ? "/golf/book/review" : "/golf/book/place"); // T-08
  return (
    <div className="page step narrow">
      <ScreenTag id="S-05" name="호텔 옵션 선택" refs="FN-09, FN-11 · API-02 · T-08, T-28" />
      <StepHead at={1} hasHotel onBack={back} />
      <div className="step-body">
      <section className="relative mb-5">
        <Anno n="S-05" t="제목·선택 요약 (패키지·출발일·인원)" />
        <h1 className="text-[22px] font-bold leading-snug">{t("s05T")}</h1>
        <p className="mt-1 text-[14px] text-muted">{n(p.name)} · {fShort(d.dep!, L)} {L === "ko" ? "출발" : "出発"} · {t("peopleN", { n: d.people })}</p>
      </section>
      <section className="relative grid gap-2.5" role="radiogroup" aria-label={t("s05T")}>
        <Anno n={1} t="옵션 목록 (단일 선택, hotel_option): 호텔명·객실·평점·위치·가격 차이(기본/+/−), '숙박 없음'도 옵션 (M-130)" />
        {p.opts.map((id, i) => {
          const o = optionOf(id)!;
          const h = stayHotel(p, id);
          const sel = opt === id;
          const canOpen = !!h && !o.none;
          const show = sel && canOpen && !folded; // 고른 옵션만 펼침 (처음엔 기본 옵션이 펼친 상태). 고른 카드를 다시 누르면 접기·펼치기
          return (
            <div key={id} className={`overflow-hidden rounded-xl border-[1.5px] transition-colors ${sel ? "border-brand bg-brand-soft" : "border-line-strong bg-surface"}`}>
              <button
                role="radio"
                aria-checked={sel}
                className="flex w-full items-start gap-3 px-4 py-4 text-left"
                aria-expanded={canOpen ? show : undefined}
                onClick={(e) => {
                  if (sel) { setFolded((x) => !x); return; }
                  d.patch({ opt: id });
                  setFolded(false);
                  const box = e.currentTarget.parentElement;
                  window.setTimeout(() => box?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 320); // 펼쳐진 내용이 화면 밖이면 아래로 따라 내려감
                }}
              >
                <span className="radio mt-0.5" />
                <span className="min-w-0 flex-1">
                  <b className="block text-[15.5px]">{n(o.name)}{!o.hotel && !o.none && h ? <span className="font-normal text-ink-2"> · {n(h.name)}</span> : null}</b>
                  <span className="block text-[13px] text-muted">{n(o.sub)}</span>
                  {h?.rating && o.hotel && (
                    <span className="mt-1 flex items-center gap-1 text-[12.5px] text-ink-2"><Star size={12} weight="fill" className="text-[#F59E0B]" /><span className="num">{h.rating}</span> · {n(h.near)}</span>
                  )}
                </span>
                <span className="flex flex-none flex-col items-end gap-1.5">
                  <span className={`num flex-none text-[14px] font-bold ${o.add === 0 || i === 0 ? "text-ink-2" : o.add > 0 ? "text-ink" : "text-ok"}`}>{i === 0 && o.add === 0 ? t("base") : yenDiff(o.add)}</span>
                  {canOpen && <CaretDown size={16} weight="bold" className={`text-muted transition-transform duration-300 ${show ? "rotate-180" : ""}`} aria-hidden />}
                </span>
              </button>
              {/* 펼침: 높이 0 → 내용 높이로 부드럽게 (grid-template-rows 0fr → 1fr) */}
              <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: show ? "1fr" : "0fr" }}>
                <div className="min-h-0 overflow-hidden">
                  {h && !o.none && (
                    <div className="px-4 pb-4">
                      <div className="overflow-hidden rounded-xl border border-line bg-surface">
                        {sel && (
                          <MapView
                            markers={[{ lat: h.lat, lng: h.lng, title: n(h.name), kind: "hotel", glyph: "H" }, ...coursesOf(p).map((c, k) => ({ lat: c.lat, lng: c.lng, title: n(c.name), kind: "golf" as const, glyph: String(k + 1) }))]}
                            focusKey={`${id}-map`}
                            center={{ lat: h.lat, lng: h.lng }} // 호텔을 가운데로. 확대는 가장 먼 골프장까지 보이게
                            zoom={(() => { const far = Math.max(0, ...coursesOf(p).map((c) => distM(h, c))); return far > 30000 ? 9 : far > 15000 ? 10 : far > 7000 ? 11 : 12; })()}
                            label={n(h.name)}
                            className="aspect-[16/9] rounded-none"
                          />
                        )}
                        <div className="grid gap-1 p-4">
                          <b className="text-[15px]">{n(h.name)}</b>
                          <p className="text-[13px] text-muted">{!o.hotel && !o.none ? n(o.sub) : n(h.room)} · {n(h.near)}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {coursesOf(p).map((c, k) => (
                              <DriveChip key={c.id} from={h} to={c} label={`${k + 1}. ${n(c.name)}`} />
                            ))}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                            <a className="link inline-flex items-center gap-1 text-[13px]" href={gmapLink(h.en ?? n(h.name))} target="_blank" rel="noreferrer">{t("openApp")} <ArrowSquareOut size={14} /></a>
                            {h.area === "SAPPORO" && <a className="link inline-flex items-center gap-1 text-[13px]" href="https://travender-hokkaido.com/hotels" target="_blank" rel="noreferrer">{t("hotelPage")} <ArrowSquareOut size={14} /></a>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">{t("M-130")} <Q id="Q-02" t="옵션 구성·1인실 요금 (패키지 데이터)" /></p>
      </section>
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
      {!hotel && <p className="mt-5 rounded-2xl bg-surface-2 p-4 text-[14px] text-ink-2">{t("noHotelNote")}</p>}
      </div>
      <BottomBar width="narrow">
        <span className="absolute -top-3 left-3"><Anno n={3} t="하단: 총액(1인실 추가 포함) + 다음: 항상 활성 (기본 옵션 선택됨) → S-06 (T-08) / 변경 중 → S-08" /></span>
        <PriceBlock main={yen(price.total)} sub={`${t("totalL", { n: d.people })}${price.singleAdd ? ` · ${t("lineSingle", { p: yen(SET.SINGLE_ADD), n: rooms.singles })}` : ""}`} />
        <button className="btn btn-primary min-w-[140px]" onClick={next}>{d.editReturn ? t("editBack") : t("next")}</button>
      </BottomBar>
    </div>
  );
}
