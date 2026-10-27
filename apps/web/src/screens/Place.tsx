import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Airplane, Bed, Buildings, Bus, CheckCircle, Clock, GoogleLogo, MagnifyingGlass, MapPin, Train, WarningCircle, X } from "@phosphor-icons/react";
import { AREA_NAME, PLACES, SET, ZONES_STRICT, courseOf, serviceArea, type Place as P, type PlaceKind } from "../data";
import { useT } from "../i18n";
import { hasHotelStep, nearestKnown, norm, placeZone, stayHotel, stopTimeRange, zoneAt, type StopRange } from "../logic";
import { Anno, BottomBar, Q, ScreenTag, StepHead } from "../components/ui";
import { DriveChip, MapView, type MapMarker } from "../components/GoogleMap";
import { useDrive, useMaps, type LL } from "../gmaps";
import { useFlow } from "./flow";
import { useApp, type Draft } from "../store";
import { USE_API, api } from "../api/client";
import { useSeatGuard } from "../api/seatCheck";

const KIND_ICON: Record<PlaceKind, typeof Bed> = { hotel: Bed, station: Train, airport: Airplane, spot: Buildings, map: MapPin };
// 5 자주 고르는 곳 (설정 POPULAR_PLACES): 삿포로역·오도리·스스키노·TV타워 + 시내 밖 예시(공항·오타루). 데이터에 고정 → Google 요금 없음
const POPULAR = ["JR 삿포로역 남쪽 출구", "오도리공원", "스스키노역", "삿포로 TV타워 옆 버스정류장", "미쓰이가든호텔 삿포로", "신치토세공항 국제선 터미널", "오타루역"];
const STATION_TYPES = ["train_station", "subway_station", "transit_station", "bus_station", "light_rail_station"];

interface Suggestion {
  id: string;
  main: string;
  sub: string;
  inArea: boolean | null; // 검색 결과에 '시내 / 시내 밖' 표시 (API-05 inArea)
  station: boolean; // 역·정류장 (검색 결과 맨 위)
}

// Google 장소 이름은 한·일 둘 다 받아 둠 (한 언어로만 저장하면 언어를 바꿔도 처음 언어 이름이 나옴)
const fetchGoogle = async (id: string, L: "ko" | "ja") => {
  const { Place: GPlace } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
  const gp = new GPlace({ id, requestedLanguage: L });
  const other = new GPlace({ id, requestedLanguage: L === "ko" ? "ja" : "ko" });
  await Promise.all([gp.fetchFields({ fields: ["displayName", "location", "formattedAddress", "types"] }), other.fetchFields({ fields: ["displayName"] }).catch(() => undefined)]);
  return { gp, otherName: other.displayName ?? null };
};
const fromGoogle = (gp: google.maps.places.Place, fallbackName: string, L: "ko" | "ja", otherName: string | null): P => {
  const lat = gp.location!.lat();
  const lng = gp.location!.lng();
  const types = gp.types ?? [];
  const kind: PlaceKind = types.includes("airport") ? "airport" : types.some((x) => STATION_TYPES.includes(x)) ? "station" : types.includes("lodging") ? "hotel" : "spot";
  const name = gp.displayName || fallbackName;
  const name2 = otherName || name;
  return { name: L === "ko" ? { ko: name, ja: name2 } : { ko: name2, ja: name }, kind, area: zoneAt(lat, lng) ?? "OTHER", lat, lng, addr: gp.formattedAddress ?? undefined, placeId: gp.id };
};

export default function Place() {
  const { t, n, L } = useT();
  const nav = useNavigate();
  const anno = useApp((s) => s.anno);
  const { d, p, redirect } = useFlow();
  const { ready } = useMaps(L);
  const [tab, setTab] = useState<"pick" | "drop">(d.pick && !d.drop && !d.dropSame ? "drop" : "pick");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<{ place: P | null; at: LL; loading: boolean } | null>(null);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [sugLoading, setSugLoading] = useState(false);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const local = useMemo(() => {
    const k = norm(q);
    if (!k) return POPULAR.map((name) => PLACES.find((x) => x.name.ko === name)!).filter(Boolean);
    return PLACES.filter((x) => norm(x.name.ko + x.name.ja + AREA_NAME[x.area].ko + AREA_NAME[x.area].ja).includes(k)).sort((a, b) => Number(b.kind === "station") - Number(a.kind === "station")).slice(0, 4); // 역 먼저
  }, [q]);

  // 3 장소 검색: Google 장소 자동완성 (Places API New, I-02). origin 거리로 '시내 / 시내 밖' 표시
  useEffect(() => {
    const text = q.trim();
    if (!ready || text.length < 2) {
      setSugs([]);
      setSugLoading(false);
      return;
    }
    setSugLoading(true);
    let alive = true;
    const tm = window.setTimeout(async () => {
      try {
        const { AutocompleteSuggestion, AutocompleteSessionToken } = (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        token.current ??= new AutocompleteSessionToken();
        const c = ZONES_STRICT[0];
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          sessionToken: token.current,
          language: L,
          region: "jp",
          includedRegionCodes: ["jp"],
          locationBias: { center: { lat: 42.95, lng: 141.5 }, radius: 50000 },
          origin: { lat: c.lat, lng: c.lng },
        });
        if (!alive) return;
        setSugs(
          suggestions
            .map((s) => s.placePrediction)
            .filter((x): x is google.maps.places.PlacePrediction => !!x)
            .slice(0, 8)
            .map((x) => ({ id: x.placeId, main: x.mainText?.text ?? x.text.text, sub: x.secondaryText?.text ?? "", station: (x.types ?? []).some((y) => STATION_TYPES.includes(y)), inArea: serviceArea.wide || x.distanceMeters == null ? null : x.distanceMeters <= c.r })),
        );
      } catch {
        if (alive) setSugs([]);
      } finally {
        if (alive) setSugLoading(false);
      }
    }, 280);
    return () => {
      alive = false;
      window.clearTimeout(tm);
    };
  }, [q, ready, L]);

  const hotel = p ? stayHotel(p, d.opt) : null;
  const days = p ? p.days.filter(Boolean) : [];
  const firstCourse = days.length ? courseOf(days[0]!.course) : null;
  const lastRound = p ? p.days[p.days.length - 1] : null;
  const lastAt: { at: LL; name: string } | null = !p ? null : lastRound ? { at: courseOf(lastRound.course), name: n(courseOf(lastRound.course).name) } : hotel ? { at: hotel, name: n(hotel.name) } : firstCourse ? { at: firstCourse, name: n(firstCourse.name) } : null;
  // 희망 시간 범위 (V-12): 승차 → 첫날 골프장, 마지막 날 골프장 → 하차. 이동 시간은 Google 경로 결과, 없으면 TRAVEL 대략값
  const day1Course = p?.days[0] ? courseOf(p.days[0].course) : null;
  const lastDayRound = p ? p.days[p.days.length - 1] : null;
  const lastDayCourse = lastDayRound ? courseOf(lastDayRound.course) : null;
  const dropPlace = d.dropSame ? d.pick : d.drop;
  const guard = useSeatGuard(); // B-01: 다음으로 가기 전 잔여석 다시 확인 (S-03·S-05·S-08과 같음)
  const pickLeg = useDrive(d.pick, day1Course);
  const dropLeg = useDrive(lastDayCourse, dropPlace);
  const gmin = (x: typeof pickLeg) => (x.drive?.source === "google" ? x.drive.min : null);
  const pickRange = p ? stopTimeRange(p, "pick", d.pick, gmin(pickLeg)) : null;
  const dropRange = p ? stopTimeRange(p, "drop", dropPlace, gmin(dropLeg)) : null;
  // 장소·일정이 바뀌어 고른 시간이 범위 밖이 되면 선택을 지움 (경로 시간을 받는 중에는 기다림)
  const pickKey = pickRange ? pickRange.options.join() : "";
  const dropKey = dropRange ? dropRange.options.join() : "";
  useEffect(() => {
    if (pickLeg.loading || dropLeg.loading) return;
    const out: Partial<Draft> = {};
    if (d.pickTime && !pickRange?.options.includes(d.pickTime)) out.pickTime = null;
    if (d.dropTime && !dropRange?.options.includes(d.dropTime)) out.dropTime = null;
    if (Object.keys(out).length) d.patch(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickKey, dropKey, d.pickTime, d.dropTime, pickLeg.loading, dropLeg.loading]);

  const markers = useMemo<MapMarker[]>(() => {
    if (!p) return [];
    const out: MapMarker[] = [...new Map(days.map((r) => [r!.course, courseOf(r!.course)])).values()].map((c, i) => ({ lat: c.lat, lng: c.lng, title: n(c.name), kind: "golf" as const, glyph: String(i + 1) }));
    if (d.pick) out.push({ lat: d.pick.lat, lng: d.pick.lng, title: n(d.pick.name), kind: tab === "pick" ? "pick" : "other", glyph: L === "ko" ? "승" : "乗" });
    if (d.drop && !d.dropSame) out.push({ lat: d.drop.lat, lng: d.drop.lng, title: n(d.drop.name), kind: tab === "drop" ? "drop" : "other", glyph: L === "ko" ? "하" : "降" });
    if (preview) out.push({ lat: preview.at.lat, lng: preview.at.lng, title: preview.place ? n(preview.place.name) : t("poiLoading"), kind: preview.place && !placeZone(preview.place) ? "bad" : "preview" });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, d.pick, d.drop, d.dropSame, preview, tab, L]);
  // 피드백 1: 승차 → 골프장(라운드 순) → 하차를 점선으로 잇기
  const route = useMemo<LL[]>(() => {
    if (!p || !d.pick) return [];
    const out: LL[] = [{ lat: d.pick.lat, lng: d.pick.lng }];
    days.forEach((r) => {
      const c = courseOf(r!.course);
      const last = out[out.length - 1];
      if (last.lat !== c.lat || last.lng !== c.lng) out.push({ lat: c.lat, lng: c.lng });
    });
    const dr = d.dropSame ? d.pick : d.drop;
    if (dr) out.push({ lat: dr.lat, lng: dr.lng });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, d.pick, d.drop, d.dropSame]);

  // 모바일 승하차: 지도가 화면을 채우고, 목록·시간·요약은 아래에서 끌어올리는 시트 (PC는 위 목록 + 넓은 지도)
  const [isLg, setIsLg] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIsLg(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageH, setStageH] = useState(520);
  useEffect(() => {
    if (isLg) return;
    const fit = () => {
      const el = stageRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setStageH(Math.max(420, window.innerHeight - top - 76)); // 76 = 하단 '다음' 바
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [isLg]);
  const [sheet, setSheet] = useState<0 | 1 | 2>(1); // 0 접힘 · 1 중간 · 2 펼침
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const snaps = [140, Math.round(stageH * 0.46), stageH - 76]; // 접혀도 검색창은 보이고, 펼쳐도 위 승차/하차 탭은 보이게
  const sheetH = dragH ?? snaps[sheet];
  useEffect(() => { if (q) setSheet(2); }, [q]); // 검색하면 목록을 넓게
  useEffect(() => { if (preview) setSheet((x) => (x === 0 ? 1 : x)); }, [preview]); // 지도에서 고르면 카드가 보이게

  if (redirect) return <Navigate to={redirect} replace />;

  const hotelPlace: P | null = hotel ? { name: hotel.name, kind: "hotel", area: hotel.area, lat: hotel.lat, lng: hotel.lng } : null;
  const hotelOk = hotelPlace ? !!placeZone(hotelPlace) : false;
  const cur = tab === "pick" ? d.pick : d.dropSame ? d.pick : d.drop;

  // L-06 범위 검사 후 지정 (밖이면 지정하지 않고 M-141)
  const assign = (pl: P) => {
    if (!zoneAt(pl.lat, pl.lng)) {
      setPreview({ place: pl, at: pl, loading: false });
      return;
    }
    // API 모드: 서버도 범위를 다시 판정 (API-06, 화면 판정만 믿지 않음)
    if (USE_API) {
      api.checkPlace(pl.lat, pl.lng).then((r) => (r.inArea ? apply(pl) : setPreview({ place: pl, at: pl, loading: false }))).catch(() => apply(pl));
      return;
    }
    apply(pl);
  };
  const apply = (pl: P) => {
    setPreview(null);
    setQ("");
    setSugs([]);
    if (tab === "pick") {
      const moved = !d.pick || d.pick.lat !== pl.lat || d.pick.lng !== pl.lng;
      d.patch({ ...(d.dropSame ? { pick: pl, drop: pl } : { pick: pl }), ...(moved ? { pickMemo: "" } : {}) }); // 메모는 그 장소에 대한 설명이므로 장소가 바뀌면 비움
      if (!d.dropSame && !d.drop) setTab("drop");
    } else d.patch({ drop: pl });
  };
  // 이미 고른 Google 장소가 한 언어 이름뿐이면 (ko === ja) 지금 언어 이름을 받아 채움
  useEffect(() => {
    if (!ready) return;
    const fix = async (pl: P | null) => {
      if (!pl?.placeId || pl.name.ko !== pl.name.ja) return null;
      const { gp } = await fetchGoogle(pl.placeId, L).catch(() => ({ gp: null }));
      return gp?.displayName ? { ...pl, name: { ...pl.name, [L]: gp.displayName } } : null;
    };
    (async () => {
      const [pk, dr] = await Promise.all([fix(d.pick), d.dropSame ? null : fix(d.drop)]);
      if (pk) d.patch(d.dropSame ? { pick: pk, drop: pk } : { pick: pk });
      if (dr) d.patch({ drop: dr });
    })();
  }, [L, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // 지도에서 건물·가게(POI) 탭 → Place Details (프로토타입 추가: 상세설계 L-06 3) 확장)
  const onPoi = async (placeId: string, at: LL) => {
    setPreview({ place: null, at, loading: true });
    try {
      const { gp, otherName } = await fetchGoogle(placeId, L);
      setPreview({ place: fromGoogle(gp, t("poiPicked"), L, otherName), at, loading: false });
    } catch {
      onMapClick(at);
    }
  };
  // 빈 곳 탭 → 350m 안 알려진 장소가 있으면 그 이름, 없으면 '지도에서 고른 위치' (L-06 3)
  const onMapClick = (at: LL) => {
    const near = nearestKnown(at.lat, at.lng);
    if (near) {
      setPreview({ place: { ...near, kind: near.kind }, at: near, loading: false });
      return;
    }
    const z = zoneAt(at.lat, at.lng);
    // 피드백 3: 위도·경도 대신 지역 이름만 표시 (좌표는 내부에만 저장)
    const an = AREA_NAME[z ?? "OTHER"] ?? { ko: "시내 밖", ja: "市内外" };
    setPreview({ place: { name: { ko: `지도에서 고른 위치 · ${an.ko}`, ja: `地図で選んだ位置・${an.ja}` }, kind: "map", area: z ?? "OTHER", lat: at.lat, lng: at.lng }, at, loading: false });
  };
  const onSuggestion = async (s: Suggestion) => {
    setPreview({ place: null, at: preview?.at ?? { lat: 43.06, lng: 141.35 }, loading: true });
    try {
      const { gp, otherName } = await fetchGoogle(s.id, L);
      token.current = null; // 자동완성 세션 종료
      const pl = fromGoogle(gp, s.main, L, otherName);
      setPreview({ place: pl, at: pl, loading: false });
      setQ("");
      setSugs([]);
    } catch {
      setPreview(null);
    }
  };
  const toggleSame = (on: boolean) => {
    d.patch(on ? { dropSame: true, drop: d.pick } : { dropSame: false, drop: null });
    setTab(on ? "pick" : "drop");
    setPreview(null);
  };

  const done = !!d.pick && !!(d.dropSame ? d.pick : d.drop) && !!d.pickTime; // 희망 승차 시간은 필수, 하차 시간은 선택 (팀 결정 10/21)
  const back = () => nav(d.editReturn ? "/golf/book/review" : hasHotelStep(p) ? "/golf/book/hotel" : `/golf/packages/${p.id}`); // 숙박 있는 패키지는 옵션이 없어도 S-05로
  const pv = preview?.place;
  const pvOk = pv ? !!placeZone(pv) : false;
  const center = preview ? preview.at : cur ? { lat: cur.lat, lng: cur.lng } : null;
  // 검색 결과는 모두 5곳까지: 역(서비스 장소·Google) 최대 2곳을 맨 위, 나머지는 주변 장소. 이름이 같은 Google 결과는 뺌
  type Hit = { local: P; g?: undefined } | { g: Suggestion; local?: undefined };
  const gOnly = sugs.filter((g) => !local.some((x) => norm(x.name.ko) === norm(g.main) || norm(x.name.ja) === norm(g.main)));
  const hits: Hit[] = [...local.map((x) => ({ local: x })), ...gOnly.map((g) => ({ g }))];
  const isSt = (h: Hit) => (h.local ? h.local.kind === "station" : h.g!.station);
  const hitSt = hits.filter(isSt).slice(0, 2);
  const hitNear = hits.filter((h) => !isSt(h)).slice(0, 5 - hitSt.length);
  const noResult = q.trim().length >= 2 && !sugLoading && sugs.length === 0 && local.length === 0;
  const dropShown = d.dropSame ? d.pick : d.drop;
  const tabRange = tab === "pick" ? pickRange : dropRange;
  const tabTime = tab === "pick" ? d.pickTime : d.dropTime;
  const tabPlace = tab === "pick" ? d.pick : dropShown;
  const rangeText = (k: "pick" | "drop", r: StopRange | null) =>
    !r ? null : !r.options.length ? t("rangeNone") : k === "pick" && r.base?.kind === "tee" ? t("rangePickTee", { tee: r.base.tee, from: r.from, to: r.to }) : k === "drop" && r.base?.kind === "end" ? t("rangeDropEnd", { end: r.base.end, from: r.from }) : t("rangeAny", { from: r.from, to: r.to });
  const withTime = (name: string, time: string | null) => (time ? `${name} · ${t("wishAt", { t: time })}` : name);

  const tabsEl = (compact: boolean) => (
    <div className={`relative grid grid-cols-2 gap-1 rounded-xl p-1 ${compact ? "bg-surface/95 shadow-md backdrop-blur" : "mb-2 bg-surface-2"}`} role="tablist">
      <Anno n={1} t="승차/하차 탭: 각 탭에 지정한 장소명 또는 '아직 정하지 않았어요'" />
      {(["pick", "drop"] as const).map((k) => {
        const pl = k === "pick" ? d.pick : dropShown;
        return (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setPreview(null); }} className={`flex flex-col items-center justify-center rounded-lg px-2 leading-tight ${compact ? "min-h-[44px]" : "min-h-[52px]"} ${tab === k ? (compact ? "bg-brand-soft" : "bg-surface shadow-sm") : ""}`}>
            <span className={`flex items-center gap-1 text-[14px] font-bold ${tab === k ? "text-brand" : "text-muted"}`}>
              {k === "pick" ? t("tabPick") : t("tabDrop")}
              {pl && <CheckCircle size={15} weight="fill" className="text-ok" />}
            </span>
            <span className="max-w-full truncate text-[11.5px] text-muted">{k === "drop" && d.dropSame ? t("sameAsPick") : pl ? n(pl.name) : t("notSet")}</span>
          </button>
        );
      })}
    </div>
  );
  const sameEl = (
    <label className="relative flex min-h-[44px] items-center gap-3 text-[14.5px] font-semibold">
      <Anno n={2} t="하차도 승차와 같은 곳 (기본 체크): 체크하면 하차 = 승차" />
      <input type="checkbox" className="check" checked={d.dropSame} onChange={(e) => toggleSame(e.target.checked)} />
      {t("dropSame")}
    </label>
  );
  const timeEl = (
    <section className="relative card grid gap-2 p-4">
      <Anno n={10} t="희망 시간 (booking_stop.desired_time, V-12): 승차 필수 · 하차 선택, 30분 단위. 승차 첫날 티오프 − 2시간 30분(06:00 이후) ~ 첫날 티오프 − 이동 − 30분 + 합승 대기 안내 / 하차 마지막 라운드(티오프+5시간) + 이동 ~ 21:00. 범위 밖이 되면 선택 지움. 참고용" />
      <label className="field">
        <span className="label">{tab === "pick" ? t("wishPick") : t("wishDrop")}</span>
        {tabRange && <span className={`text-[13px] ${tabRange.options.length ? "text-ink-2" : "font-semibold text-bad"}`}>{rangeText(tab, tabRange)}</span>}
        <select className="input" value={tabTime ?? ""} disabled={!tabRange?.options.length} onChange={(e) => d.patch(tab === "pick" ? { pickTime: e.target.value || null } : { dropTime: e.target.value || null })}>
          <option value="">{!tabPlace ? t("wishPlaceFirst") : tab === "drop" ? t("wishSkip") : t("wishNone")}</option>
          {tabRange?.options.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      {tab === "pick" && pickRange?.base && pickRange.options.length > 0 && <p className="flex gap-1.5 text-[13px] text-ink-2"><Clock size={16} className="mt-0.5 flex-none text-brand" />{t("pickWait")}</p>}
      {tab === "drop" && <p className="flex gap-1.5 text-[13px] text-ink-2"><Clock size={16} className="mt-0.5 flex-none text-brand" />{t("dropTimeNote")}</p>}
      <p className="help">{t("wishNote")}</p>
    </section>
  );
  const searchEl = (
    <div className="relative">
      <Anno n={3} t="장소 검색 (Google Places I-02): 한·일·영, 결과에 '시내 / 시내 밖' 표시 (V-10, M-140, M-141)" />
      <label className="relative block">
        <span className="sr-only">{t("placeSearch")}</span>
        <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-10 pr-10" placeholder={t("placeSearch")} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => { if (!isLg) setSheet(2); }} />
        {q && <button className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted" onClick={() => setQ("")} aria-label={t("close")}><X size={16} /></button>}
      </label>
    </div>
  );
  const hitRow = (h: Hit) => {
    const I = h.local ? KIND_ICON[h.local.kind] : h.g!.station ? Train : MapPin;
    const ok = h.local ? !!placeZone(h.local) : h.g!.inArea;
    return (
      <li key={h.local ? h.local.name.ko : h.g!.id}>
        <button className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2" onClick={() => (h.local ? assign(h.local) : onSuggestion(h.g!))}>
          <span className={`grid h-9 w-9 flex-none place-items-center rounded-full ${isSt(h) ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-2"}`}><I size={18} /></span>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[14.5px]">{h.local ? n(h.local.name) : h.g!.main}</b>
            <span className="block truncate text-[12.5px] text-muted">{h.local ? `${t(`kind_${h.local.kind}`)} · ${n(AREA_NAME[h.local.area])}` : h.g!.sub}</span>
          </span>
          {ok !== null && <AreaBadge ok={ok} />}
        </button>
      </li>
    );
  };
  const resultsEl = noResult ? (
    <p className="rounded-xl bg-surface-2 p-4 text-[14px] text-muted">{t("M-140", { q: q.trim() })}</p>
  ) : (
    <div className={`card ${isLg ? "max-h-[340px] overflow-y-auto" : ""}`}> {/* 휴대폰은 아래 시트가 스크롤 (여기서 스크롤을 주면 높이가 0이 됨) */}
      {hitSt.length > 0 && <ul className="divide-y divide-line">{hitSt.map(hitRow)}</ul>}
      {hitSt.length > 0 && hitNear.length > 0 && <p className="border-t border-line px-4 pb-1 pt-2.5 text-[12px] font-bold text-muted">{t("nearPlaces")}</p>}
      {hitNear.length > 0 && <ul className="divide-y divide-line">{hitNear.map(hitRow)}</ul>}
      {(sugLoading || gOnly.length > 0) && <p className="flex items-center justify-end gap-1 border-t border-line px-4 py-1.5 text-[11px] text-muted"><GoogleLogo size={12} weight="bold" /> {t("gSuggest")}{sugLoading && ` · ${t("searching")}`}</p>}
    </div>
  );
  const chipsEl = (
    <div className="relative">
      <Anno n={5} t="자주 고르는 곳 (POPULAR_PLACES): 삿포로역·오도리·스스키노·TV타워 + 시내 밖 예시(공항·오타루)" />
      <p className="mb-1.5 text-[13px] font-bold text-muted">{t("popular")}</p>
      <div className="hscroll -mx-4 px-4 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {local.map((x) => {
          const I = KIND_ICON[x.kind];
          const z = placeZone(x);
          return (
            <button key={x.name.ko} className="fchip" onClick={() => assign(x)} style={z ? undefined : { color: "var(--bad)", borderColor: "var(--bad-line)" }}>
              <I size={15} /> {n(x.name)}{!z && ` · ${t("outArea")}`}
            </button>
          );
        })}
      </div>
    </div>
  );
  const hotelBtnEl = hotelPlace && hotelOk && (
    <div className="relative">
      <Anno n={4} t="숙박 호텔로 지정: 숙박 호텔이 있고 시내일 때만 표시" />
      <button className="btn btn-ghost btn-sm w-full lg:w-auto" onClick={() => assign(hotelPlace)}><Bed size={18} /> {t("useHotel", { h: n(hotelPlace.name) })}</button>
    </div>
  );
  const mapEl = (cls: string, greedy = false) => (
    <div className="relative h-full">
      <Anno n={6} t="지도 핀 지정 (Google Maps I-01): 범위를 초록 원으로, 건물·가게 탭, 빈 곳 탭은 350m 안 장소 이름 또는 '지도에서 고른 위치 · 지역명' (위도·경도는 표시하지 않음). 승차 → 골프장 → 하차를 점선으로 연결" />
      <MapView markers={markers} path={route} zones greedy={greedy} onPoi={onPoi} onMapClick={onMapClick} center={center} zoom={center ? 16 : 11} focusKey={center ? `${center.lat},${center.lng}` : "all"} label={t("mapHint")} className={cls} />
    </div>
  );
  const previewEl = preview && (
    <motion.div key={pv ? `${pv.lat},${pv.lng}` : "loading"} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`grid gap-2.5 rounded-2xl border-[1.5px] p-4 ${pv && !pvOk ? "border-bad-line bg-bad-soft" : "border-warn-line bg-surface"}`} role={pv && !pvOk ? "alert" : undefined}>
      {preview.loading || !pv ? (
        <div className="grid gap-2"><span className="text-[13px] text-muted">{t("poiLoading")}</span><div className="skel h-5 w-2/3" /><div className="skel h-4 w-1/2" /></div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-surface-2 text-ink-2">{(() => { const I = KIND_ICON[pv.kind]; return <I size={20} />; })()}</span>
            <div className="min-w-0 flex-1">
              <b className="block text-[15px] leading-snug">{n(pv.name)}</b>
              {pv.addr && <p className="text-[12.5px] text-muted">{pv.addr}</p>}
              <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">{t(`kind_${pv.kind}`)} <AreaBadge ok={pvOk} /></p>
            </div>
            <button className="grid h-9 w-9 flex-none place-items-center rounded-full text-muted hover:bg-surface-2" onClick={() => setPreview(null)} aria-label={t("close")}><X size={16} /></button>
          </div>
          {pvOk ? (
            <>
              {tab === "pick" && firstCourse && <DriveChip from={pv} to={firstCourse} label={t("legPick", { c: n(firstCourse.name) })} />}
              {tab === "drop" && lastAt && <DriveChip from={lastAt.at} to={pv} label={t("legDrop", { c: lastAt.name })} />}
              <button className="btn btn-primary btn-sm w-full" onClick={() => assign(pv)}>{tab === "pick" ? t("poiPick") : t("poiDrop")}</button>
            </>
          ) : (
            <p className="flex gap-2 text-[13.5px] font-semibold text-bad"><WarningCircle size={20} weight="fill" className="flex-none" />{t("M-141", { p: n(pv.name) })}</p>
          )}
        </>
      )}
    </motion.div>
  );
  const dropSameEl = <p className="rounded-2xl bg-surface-2 p-4 text-[14px] text-ink-2">{d.pick ? `${t("sameAsPick")} · ${n(d.pick.name)}` : t("notSet")}</p>;
  const summaryEl = (
    <section className="relative card divide-y divide-line">
      {(["pick", "drop"] as const).map((k) => {
        const pl = k === "pick" ? d.pick : dropShown;
        return (
          <button key={k} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left ${tab === k ? "bg-brand-soft/60" : ""}`} onClick={() => { setTab(k); setPreview(null); }}>
            <span className={`badge ${k === "pick" ? "brand" : "wait"} mt-0.5`}>{k === "pick" ? t("pick") : t("drop")}</span>
            <span className="min-w-0 flex-1">
              {pl ? (
                <>
                  <b className="block text-[14.5px] leading-snug">{n(pl.name)}{k === "drop" && d.dropSame && <span className="font-normal text-muted"> ({t("sameAsPick")})</span>}</b>
                  {(k === "pick" ? d.pickTime : d.dropTime) && <span className="block text-[13px] font-semibold text-brand">{t("wishAt", { t: (k === "pick" ? d.pickTime : d.dropTime)! })}</span>}
                  <span className="text-[12.5px] text-muted">{pl.addr ?? n(AREA_NAME[placeZone(pl) ?? pl.area])}</span>
                </>
              ) : (
                <span className="text-[14px] text-muted">{t("notSet")}</span>
              )}
            </span>
          </button>
        );
      })}
      {(d.pick || dropShown) && (
        <div className="grid gap-2 px-4 py-3.5">
          <p className="text-[13px] font-bold">{t("legT")}</p>
          <div className="flex flex-wrap gap-1.5">
            {d.pick && firstCourse && <DriveChip strong from={d.pick} to={firstCourse} label={t("legPick", { c: n(firstCourse.name) })} />}
            {dropShown && lastAt && <DriveChip strong from={lastAt.at} to={dropShown} label={t("legDrop", { c: lastAt.name })} />}
          </div>
          <p className="text-[12px] text-muted">{t("driveNote")}</p>
        </div>
      )}
      {d.pick && (
        <div className="relative grid gap-2 px-4 py-3.5">
          <Anno n={7} t="만날 위치 메모 (booking_stop.memo, V-11: 최대 100자)" />
          <label className="field">
            <span className="label text-[13px]">{t("memoL")}</span>
            <input className="input min-h-[44px]" placeholder={t("memoPh")} value={d.pickMemo} maxLength={SET.MEMO_MAX} onChange={(e) => d.patch({ pickMemo: e.target.value.slice(0, SET.MEMO_MAX) })} />
            <span className="help text-right num">{d.pickMemo.length}/{SET.MEMO_MAX}</span>
          </label>
        </div>
      )}
    </section>
  );
  const feeEl = (
    <section className="relative flex gap-3 rounded-2xl bg-surface-2 p-4">
      <Anno n={8} t="포함 요금 안내 (M-142) + 합승 버스 안내" />
      <Bus size={22} weight="duotone" className="mt-0.5 flex-none text-brand" />
      <div className="text-[13.5px]">
        <b className="block">{t("M-142")}</b>
        <span className="text-ink-2">{L === "ko" ? `버스 정원 ${SET.BUS_SEATS}명, 골프백 적재 가능. 합승 버스는 같은 출발편 그룹의 승차 장소를 차례로 들러요.` : `バス定員${SET.BUS_SEATS}名、ゴルフバッグ積載可。相乗りバスは同じ出発便の各グループの乗車場所を順に回ります。`}</span> <Q id="Q-23" t="합승 시 경유 방식" />
      </div>
    </section>
  );
  const bottomEl = (
    <BottomBar width={isLg ? "narrow" : "step"}>
      <span className="absolute -top-3 left-3"><Anno n={9} t="하단 다음: 승차·하차 장소와 희망 승차 시간이 지정되면 활성 (희망 하차 시간은 선택) → 잔여석 다시 확인(B-01) → S-08 (T-10) / 범위 밖 → 그대로 (T-31)" /></span>
      <div className="min-w-0 flex-1 text-[12.5px] leading-tight text-muted">
        <p className="truncate">{t("pick")} · {d.pick ? withTime(n(d.pick.name), d.pickTime) : "-"}</p>
        <p className="truncate">{t("drop")} · {dropShown ? withTime(n(dropShown.name), d.dropTime) : "-"}</p>
      </div>
      <button className="btn btn-primary min-w-[140px]" disabled={!done} onClick={() => guard(() => { if (d.dropSame) d.patch({ drop: d.pick }); nav("/golf/book/review"); })}>{d.editReturn ? t("editBack") : t("next")}</button>
    </BottomBar>
  );
  const head = (
    <>
      <ScreenTag id="S-06" name="승하차 장소 지정" refs="FN-12, FN-13 · L-06 · API-05, API-06 · V-10, V-11 · T-10, T-31" />
      <StepHead at={2} hasHotel={hasHotelStep(p)} onBack={back} />
    </>
  );

  // 모바일: 지도 전체 + 아래 시트 (손잡이를 끌거나 눌러 접힘 · 중간 · 펼침)
  if (!isLg) {
    const onDown = (e: React.PointerEvent) => { drag.current = { y: e.clientY, h: sheetH }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
    const onMove = (e: React.PointerEvent) => { if (drag.current) setDragH(Math.min(snaps[2], Math.max(snaps[0], drag.current.h + drag.current.y - e.clientY))); };
    const onUp = (e: React.PointerEvent) => {
      if (!drag.current) return;
      const moved = Math.abs(drag.current.y - e.clientY) > 6;
      const h = dragH ?? drag.current.h;
      drag.current = null;
      setDragH(null);
      if (!moved) { setSheet((x) => (x === 2 ? 0 : ((x + 1) as 1 | 2))); return; } // 누르기만 하면 다음 단계
      let best: 0 | 1 | 2 = 0;
      snaps.forEach((v, i) => { if (Math.abs(v - h) < Math.abs(snaps[best] - h)) best = i as 0 | 1 | 2; });
      setSheet(best);
    };
    return (
      <div className="page step">
        {head}
        <div ref={stageRef} className="relative -mx-4 overflow-hidden border-y border-line" style={{ height: stageH }}>
          <div className="absolute inset-0">{mapEl("h-full rounded-none", true)}</div>
          <div className="absolute inset-x-0 top-0 z-10 p-3">{tabsEl(true)}</div>
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-line bg-surface shadow-[0_-6px_20px_rgba(0,0,0,0.12)]" style={{ height: sheetH, transition: dragH === null ? "height .22s ease" : "none" }}>
            <button className="flex h-7 flex-none touch-none items-center justify-center" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} aria-label={L === "ko" ? "목록 크기 바꾸기" : "リストの大きさを変更"}>
              <span className="h-1.5 w-10 rounded-full bg-line-strong" />
            </button>
            {/* 검색창은 시트 맨 위 (지도를 가리지 않게, 엄지 닿는 곳) — 누르면 시트를 펼침 */}
            {!(tab === "drop" && d.dropSame) && <div className="flex-none px-4 pb-3">{searchEl}</div>}
            <div className="grid flex-1 content-start gap-3 overflow-y-auto px-4 pb-4">
              {previewEl}
              {tab === "drop" && d.dropSame ? dropSameEl : q ? resultsEl : chipsEl}
              {!q && hotelBtnEl}
              {sameEl}
              {timeEl}
              {summaryEl}
              {feeEl}
            </div>
          </div>
        </div>
        {bottomEl}
      </div>
    );
  }

  // PC: 위에 탭·시간·검색·자주 고르는 곳, 아래에 넓은 지도 (호텔 화면 지도와 같은 16:9)
  return (
    <div className="page step narrow">
      {head}
      <div className="step-body">
      <h1 className="text-[22px] font-bold leading-snug">{t("s06T")}</h1>
      <p className="mb-4 mt-1 text-[14px] text-muted">{t("s06S")}</p>
      {tabsEl(false)}
      <div className="mb-4">{sameEl}</div>
      <div className="mb-4">{timeEl}</div>
      {tab === "drop" && d.dropSame ? (
        <div className="mb-4">{dropSameEl}</div>
      ) : (
        <div className="grid gap-3">
          {searchEl}
          {q ? resultsEl : chipsEl}
          {hotelBtnEl}
          {mapEl("aspect-[16/9]")}
          <p className="-mt-1.5 text-[12.5px] text-muted">{t("mapHint")}</p>
          {previewEl}
        </div>
      )}
      <div className="mt-5">{summaryEl}</div>
      <div className="mt-4">{feeEl}</div>
      <p className="mt-2 text-[12px] text-muted">{!anno ? null : serviceArea.wide ? "SERVICE_AREA: 넓은 범위 (기타히로시마·치토세·공항 포함, 확인 필요)" : `SERVICE_AREA: 삿포로 중심 반경 ${ZONES_STRICT[0].r / 1000}km (팀 결정 10/27)`}</p>
      </div>
      {bottomEl}
    </div>
  );
}

function AreaBadge({ ok }: { ok: boolean }) {
  const { t } = useT();
  return <span className={`badge flex-none ${ok ? "ok" : "bad"}`}>{ok ? t("inArea") : t("outArea")}</span>;
}
