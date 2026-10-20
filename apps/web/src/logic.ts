import { AREA_NAME, COURSES, HOTELS, OPTIONS, PKGS, PLACES, SET, TRAVEL, activeZones, courseOf, hotelOf, type Area, type Lang, type Pkg, type Place, type Zone } from "./data";

// ---------- 날짜 ----------
const pad = (n: number) => String(n).padStart(2, "0");
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const dow = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
export const ymOf = (d: string) => d.slice(0, 7);
export const addMonths = (ym: string, n: number) => {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${pad(((m % 12) + 12) % 12 + 1)}`;
};
export const daysInMonth = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

const DOW: Record<Lang, string[]> = { ko: ["일", "월", "화", "수", "목", "금", "토"], ja: ["日", "月", "火", "水", "木", "金", "土"] };
export const dowName = (d: string, L: Lang) => DOW[L][dow(d)];
export const dowNames = (L: Lang) => DOW[L];
// C-08: 한국어 2026.11.03 (화) / 일본어 2026年11月3日(火)
export const fDate = (d: string, L: Lang) =>
  L === "ko" ? `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8)} (${dowName(d, L)})` : `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月${Number(d.slice(8))}日(${dowName(d, L)})`;
export const fShort = (d: string, L: Lang) =>
  L === "ko" ? `${Number(d.slice(5, 7))}.${Number(d.slice(8))} (${dowName(d, L)})` : `${Number(d.slice(5, 7))}/${Number(d.slice(8))}(${dowName(d, L)})`;
export const fMonth = (ym: string, L: Lang) => (L === "ko" ? `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월` : `${ym.slice(0, 4)}年${Number(ym.slice(5))}月`);
export const fMonthShort = (ym: string, L: Lang) => (L === "ko" ? `${Number(ym.slice(5))}월` : `${Number(ym.slice(5))}月`);

export const yen = (n: number) => (n < 0 ? "−" : "") + "¥" + Math.abs(Math.round(n)).toLocaleString("ja-JP");
export const yenDiff = (n: number) => (n > 0 ? "+" : "") + yen(n);

// ---------- 시즌·출발일 ----------
// 판매 시즌 안 + 휴장기(CLOSED_SEASON 11-16~04-19) 밖
export const inClosed = (d: string) => d.slice(5) >= SET.CLOSED_FROM || d.slice(5) <= SET.CLOSED_TO;
export const inSeason = (d: string) => d.slice(5) >= SET.SEASON_FROM && d.slice(5) <= SET.SEASON_TO && !inClosed(d);
export const monthInSeason = (ym: string) => {
  const m = Number(ym.slice(5));
  return m >= 4 && m <= 11;
};
// 오늘이 속한 달부터 13개월 (겨울 휴장 달 포함, 화면에서 비활성)
export const monthsAhead = (n = 14) => {
  const out: string[] = [];
  let ym = ymOf(todayISO());
  for (let i = 0; i < n; i++) {
    out.push(ym);
    ym = addMonths(ym, 1);
  }
  return out;
};
export const judgeDate = (dep: string) => addDays(dep, -SET.JUDGE_DAYS);
// L-01 출발일 판단: 출발 요일 + 판매 시즌 안·휴장기 밖 + 판정일(출발 − JUDGE_DAYS)이 오늘 이후
export const isDeparture = (p: Pkg, d: string) => p.wd.includes(dow(d)) && inSeason(d) && judgeDate(d) > todayISO();
export const departuresIn = (p: Pkg, ym: string) => {
  const out: string[] = [];
  const n = daysInMonth(ym);
  for (let i = 1; i <= n; i++) {
    const d = `${ym}-${pad(i)}`;
    if (isDeparture(p, d)) out.push(d);
  }
  return out;
};
export const tripEnd = (p: Pkg, dep: string) => addDays(dep, p.nights);
export const rounds = (p: Pkg) => p.days.filter(Boolean).length;
export const isNColor = (p: Pkg) => new Set(p.days.filter(Boolean).map((r) => r!.course)).size > 1;

// ---------- 좌석 (같은 패키지·같은 출발일 = 하나의 운행편) ----------
const hash = (s: string) => {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
// 다른 그룹의 예약 인원 (예시 데이터, 결정적)
export const baseBooked = (pkgId: number, d: string) => {
  const h = hash(`${pkgId}|${d}`);
  if ((h >> 7) % 9 === 0) return 18 + (h % 3); // 거의 마감 (18~20명, 정원 20)
  return h % 18; // 0~17명 (서버 seed_demo 와 같은 범위)
};
export type Extra = Record<string, number>;
export const booked = (pkgId: number, d: string, extra: Extra) => Math.min(SET.BUS_SEATS, baseBooked(pkgId, d) + (extra[`${pkgId}|${d}`] ?? 0));
export const seatsLeft = (pkgId: number, d: string, extra: Extra) => SET.BUS_SEATS - booked(pkgId, d, extra);

// 가장 빠른 예약 가능 출발일 (date가 있으면 그날만, L-03)
export const firstAvailable = (pkg: Pkg, date: string | null, people: number, extra: Extra) => {
  if (date) return isDeparture(pkg, date) && seatsLeft(pkg.id, date, extra) >= people ? date : null;
  for (const ym of monthsAhead()) {
    const d = departuresIn(pkg, ym).find((x) => seatsLeft(pkg.id, x, extra) >= people);
    if (d) return d;
  }
  return null;
};

// L-04 출발 확정 현황 (판정 전: 20명 이상이어도 '인원 충족'으로만 표시, 출발 확정은 판정일에)
export type DepState = "unavailable" | "enough" | "need";
export const depView = (pkgId: number, d: string, people: number, extra: Extra) => {
  const b = booked(pkgId, d, extra);
  const seats = SET.BUS_SEATS - b;
  const sum = b + people;
  const state: DepState = people > seats ? "unavailable" : sum >= SET.MIN_DEPARTURE ? "enough" : "need";
  return { booked: b, seats, sum, state, need: Math.max(0, SET.MIN_DEPARTURE - sum), seatsAfter: Math.max(0, seats - people) };
};

// ---------- L-03 패키지 검색 ----------
export interface SearchFilters {
  nights: "all" | "0" | "1" | "2" | "3";
  zone: "all" | "CITY" | "RESORT" | "NONE";
  rounds: "all" | "1" | "2" | "3";
  sort: "rec" | "priceAsc" | "depAsc";
}
export const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[\s·・\-]/g, "");
export const matches = (p: Pkg, q: string) => !q.trim() || norm(searchText(p)).includes(norm(q.trim().slice(0, SET.SEARCH_MAX)));
export const zoneOfPkg = (p: Pkg) => (p.hotel ? hotelOf(p.hotel)!.zone : "NONE");
export const searchPkgs = (o: { q: string; date: string | null; people: number; filters?: SearchFilters; extra: Extra }) => {
  const f = o.filters;
  const rows = PKGS.filter((p) => matches(p, o.q))
    .map((p) => ({ p, d: firstAvailable(p, o.date, o.people, o.extra) }))
    .filter((x) => x.d)
    .filter(({ p }) => !f || ((f.nights === "all" || p.nights === Number(f.nights)) && (f.zone === "all" || zoneOfPkg(p) === f.zone) && (f.rounds === "all" || rounds(p) === Number(f.rounds))))
    .map((x) => ({ ...x, d: x.d!, seats: seatsLeft(x.p.id, x.d!, o.extra) }));
  const s = f?.sort ?? "rec";
  rows.sort((a, b) => (s === "priceAsc" ? a.p.price - b.p.price : s === "depAsc" ? a.d.localeCompare(b.d) || a.p.id - b.p.id : Number(!!b.p.rec) - Number(!!a.p.rec) || a.p.id - b.p.id));
  return rows;
};

// 곧 출발하는 투어 (S-01 #8): 모든 패키지의 예약 가능한 출발일을 가까운 순으로
export const upcomingDepartures = (people: number, extra: Extra, n = 6) => {
  const out: { p: Pkg; d: string; seats: number; enough: boolean }[] = [];
  for (const ym of monthsAhead().slice(0, 14)) {
    for (const p of PKGS) for (const d of departuresIn(p, ym)) {
      const v = depView(p.id, d, people, extra);
      if (v.state !== "unavailable") out.push({ p, d, seats: v.seats, enough: v.booked >= SET.MIN_DEPARTURE });
    }
    if (out.length >= n) break;
  }
  return out.sort((a, b) => a.d.localeCompare(b.d) || a.p.id - b.p.id).slice(0, n);
};

// 날짜별 출발 패키지 수 (날짜·인원 시트, API-04)
export const pkgCountOn = (d: string, people: number, extra: Extra) => PKGS.filter((p) => isDeparture(p, d) && seatsLeft(p.id, d, extra) >= people).length;

// ---------- 가격 ----------
export const optionOf = (id: string | null | undefined) => (id ? OPTIONS[id] ?? null : null);
export const unitPrice = (p: Pkg, optId: string | null) => p.price + (optionOf(optId)?.add ?? 0);
// 객실 구성 (피드백 5): 2인실 기준, 1인실 인원은 인원과 홀짝이 같아야 함 (홀수 인원이면 최소 1명)
export const roomsOf = (people: number, singles: number | null) => {
  let s = singles ?? people % 2;
  s = Math.max(people % 2, Math.min(people, s));
  if ((people - s) % 2) s = Math.min(people, s + 1);
  return { singles: s, twins: (people - s) / 2 };
};
// 총액 (L-05): 1인 요금 × 인원 + 1인실 추가 요금 × 1인실 인원 (숙박 있을 때만)
export const totalPrice = (p: Pkg, optId: string | null, people: number, singles: number | null) => {
  const hasStay = !!stayHotel(p, optId);
  const r = roomsOf(people, singles);
  const singleAdd = hasStay ? r.singles * SET.SINGLE_ADD : 0;
  return { unit: unitPrice(p, optId), base: unitPrice(p, optId) * people, singleAdd, total: unitPrice(p, optId) * people + singleAdd, rooms: hasStay ? r : null };
};
export const stayHotel = (p: Pkg, optId: string | null) => {
  const o = optionOf(optId);
  if (o?.none) return null;
  return hotelOf(o?.hotel ?? p.hotel);
};

// ---------- 장소 ----------
const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
// L-06 승하차 범위 검사 (SERVICE_AREA)
export const zoneAt = (lat: number, lng: number): Zone | null => activeZones().find((z) => dist(z, { lat, lng }) <= z.r)?.zone ?? null;
export const distM = dist;
// 지도 탭 위치 350m 안에 알려진 장소가 있으면 그 이름 (L-06 3)
export const nearestKnown = (lat: number, lng: number): Place | null => {
  const cand: Place[] = [...PLACES, ...COURSES.map((c) => ({ name: c.name, kind: "spot" as const, area: c.area, lat: c.lat, lng: c.lng, placeId: c.placeId }))];
  let best: Place | null = null;
  let bd = SET.NEAR_PLACE_M;
  for (const c of cand) {
    const d = dist(c, { lat, lng });
    if (d <= bd) {
      bd = d;
      best = c;
    }
  }
  return best;
};
export const placeZone = (p: Place | null) => (p ? zoneAt(p.lat, p.lng) : null);
export const areaLabel = (a: Area, L: Lang) => AREA_NAME[a][L];

// ---------- 희망 승하차 시간 (V-12) ----------
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fmtMin = (x: number) => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
const travelOf = (z: Zone, area: Area, driveMin?: number | null) => driveMin ?? TRAVEL[z][area] ?? 60;
export interface StopRange {
  from: string;
  to: string;
  options: string[]; // 고를 수 있는 시간 (30분 단위). 비어 있으면 일정상 고를 수 없음
  base: { kind: "tee"; tee: string } | { kind: "end"; end: string } | null; // 범위 안내 문구용 (첫날 티오프 / 마지막 라운드 종료 예정)
}
// 고를 수 있는 희망 시간 범위. 서버 services/booking.py stop_time_range 와 같은 계산
// 승차(첫날): (첫날 티오프 − 2시간 30분, 06:00보다 이르면 06:00)을 올림 ~ (첫날 티오프 − 이동 − 30분)을 내림
// 하차(마지막 날): (마지막 라운드 티오프 + 5시간 + 이동)을 올림 ~ 21:00
// driveMin: Google 경로 시간(분). 없으면 TRAVEL 대략값 (서버도 TRAVEL 대략값으로 검사)
export const stopTimeRange = (p: Pkg, kind: "pick" | "drop", place: Place | null, driveMin?: number | null): StopRange | null => {
  const z = placeZone(place);
  if (!z) return null;
  const step = SET.STOP_TIME_STEP_MIN;
  let lo = toMin(SET.STOP_TIME_FIRST);
  let hi = toMin(SET.STOP_TIME_LAST);
  let base: StopRange["base"] = null;
  if (kind === "pick") {
    const r = p.days[0]; // 첫날 라운드가 없으면 (프로토타입 데이터에는 첫 출발 시각이 없어) 끝은 21:00
    if (r) {
      lo = Math.max(lo, Math.ceil((toMin(r.tee) - SET.PICK_EARLIEST_BEFORE_TEE_MIN) / step) * step);
      hi = Math.min(hi, Math.floor((toMin(r.tee) - travelOf(z, courseOf(r.course).area, driveMin) - SET.PICK_MARGIN_MIN) / step) * step);
      base = { kind: "tee", tee: r.tee };
    }
  } else {
    const r = p.days[p.days.length - 1];
    const end = r ? toMin(r.tee) + SET.ROUND_HOURS * 60 : null;
    lo = Math.max(lo, Math.ceil(((end ?? toMin(SET.NO_ROUND_DROP_FROM)) + (r ? travelOf(z, courseOf(r.course).area, driveMin) : 0)) / step) * step);
    if (end !== null) base = { kind: "end", end: fmtMin(end) };
  }
  const options: string[] = [];
  for (let x = lo; x <= hi; x += step) options.push(fmtMin(x));
  return { from: fmtMin(lo), to: fmtMin(hi), options, base };
};

// 예상 승차 시간 = 첫 티오프 − 체크인 30분 − 이동 − 여유 10분 (F-063, 확정은 출발 확정 후)
export const pickupWindow = (p: Pkg, pick: Place | null, driveMin?: number | null) => {
  const z = placeZone(pick);
  const first = p.days.find(Boolean);
  if (!z || !first) return null;
  const c = courseOf(first.course);
  const travel = driveMin ?? TRAVEL[z][c.area] ?? 60; // Google 경로 시간이 있으면 그것을 사용
  const [h, m] = first.tee.split(":").map(Number);
  const t = h * 60 + m - 30 - travel - 10;
  const r = (x: number) => Math.floor(x / 5) * 5;
  const f = (x: number) => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
  return { from: f(r(t - 10)), to: f(r(t + 10)), exact: f(r(t)) };
};

// ---------- 일정표 ----------
export type ItinKind = "bus" | "golf" | "hotel" | "drop" | "free";
export interface ItinItem {
  kind: ItinKind;
  at?: { lat: number; lng: number }; // 이 항목의 위치 (구간 이동 시간 계산용)
  time?: string;
  title: { ko: string; ja: string };
  note?: { ko: string; ja: string };
  course?: number;
  tbd?: boolean; // 시간은 출발 확정 후 안내 (L-11)
}
// L-11 일정표 만들기. 승차 시간은 출발 확정 후 운영이 등록(API-17)한 값만 표시
export const itinerary = (p: Pkg, optId: string | null, pick: Place | null, drop: Place | null, confirmedPickup?: string | null) => {
  const h = stayHotel(p, optId);
  const hAt = h ? { lat: h.lat, lng: h.lng } : undefined;
  const pAt = pick ? { lat: pick.lat, lng: pick.lng } : undefined;
  const dAt = drop ? { lat: drop.lat, lng: drop.lng } : undefined;
  const pickName = pick ? pick.name : { ko: "지정한 승차 장소", ja: "指定した乗車場所" };
  const dropName = drop ? drop.name : { ko: "지정한 하차 장소", ja: "指定した降車場所" };
  const last = p.days.length - 1;
  return p.days.map((r, i) => {
    const items: ItinItem[] = [];
    if (i === 0) items.push({ kind: "bus", at: pAt, time: confirmedPickup ?? undefined, tbd: !confirmedPickup, title: { ko: `버스 승차 · ${pickName.ko}`, ja: `バス乗車・${pickName.ja}` }, note: { ko: "확정 승차 시간은 출발 확정 후 이메일로 안내", ja: "確定乗車時刻は催行決定後にメールでご案内" } });
    else if (h && !h.onsite) items.push({ kind: "bus", at: hAt, time: r ? addMin(r.tee, -50) : "09:00", title: { ko: `${h.name.ko} 출발`, ja: `${h.name.ja} 出発` } });
    else if (!h && i > 0) items.push({ kind: "bus", at: pAt, time: r ? addMin(r.tee, -60) : "09:00", title: { ko: `버스 승차 · ${pickName.ko}`, ja: `バス乗車・${pickName.ja}` } });
    if (r) {
      const c = courseOf(r.course);
      items.push({ kind: "golf", at: { lat: c.lat, lng: c.lng }, time: r.tee, title: { ko: `${c.name.ko} · 18홀`, ja: `${c.name.ja}・18ホール` }, note: { ko: `${c.caddie ? "캐디 동반" : "셀프"} · ${c.holes}홀 코스 · 렌탈은 골프장 현장 문의`, ja: `${c.caddie ? "キャディ付き" : "セルフ"}・${c.holes}ホール・レンタルはゴルフ場に直接お問い合わせ` }, course: c.id });
    } else {
      items.push({ kind: "free", title: { ko: "자유 일정 · 체크아웃", ja: "自由行動・チェックアウト" } });
    }
    if (i < last && h) items.push({ kind: "hotel", at: hAt, time: r?.back, title: { ko: `숙박 · ${h.name.ko}`, ja: `宿泊・${h.name.ja}` }, note: { ko: "체크인 15:00 이후 · 조식 포함", ja: "チェックイン15:00以降・朝食付き" } });
    if (i < last && !h) items.push({ kind: "drop", at: dAt, time: r?.back, title: { ko: `버스 하차 · ${dropName.ko}`, ja: `バス降車・${dropName.ja}` }, note: { ko: "숙박은 직접 준비 (호텔 없이 옵션)", ja: "宿泊はご自身で手配（ホテルなし）" } });
    if (i === last) items.push({ kind: "drop", at: dAt, time: r ? r.back : "11:00", title: { ko: `버스 하차 · ${dropName.ko}`, ja: `バス降車・${dropName.ja}` } });
    return items;
  });
};
const addMin = (t: string, n: number) => {
  const [h, m] = t.split(":").map(Number);
  const x = h * 60 + m + n;
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
};

export const coursesOf = (p: Pkg) => [...new Set(p.days.filter(Boolean).map((r) => r!.course))].map(courseOf);
// 검색 대상: 패키지명·골프장·지역·호텔 (한·일·영)
export function searchText(p: Pkg) {
  const h = hotelOf(p.hotel);
  return [p.name.ko, p.name.ja, p.kw, ...coursesOf(p).flatMap((c) => [c.name.ko, c.name.ja, c.en, AREA_NAME[c.area].ko, AREA_NAME[c.area].ja]), h?.name.ko ?? "", h?.name.ja ?? "", h?.en ?? "", h ? AREA_NAME[h.area].ko + AREA_NAME[h.area].ja : ""].join(" ");
}

// L-09 예약번호 GT-YYMMDD-NNNN (YYMMDD = 출발일, NNNN = 그날 일련번호)
export const bookingNo = (dep: string, existing: string[]) => {
  const head = `GT-${dep.slice(2, 4)}${dep.slice(5, 7)}${dep.slice(8, 10)}-`;
  let n = existing.filter((x) => x.startsWith(head)).length + 1;
  while (existing.includes(head + String(n).padStart(4, "0"))) n++;
  return head + String(n).padStart(4, "0");
};

export const HOTEL_LIST = HOTELS;
export const COURSE_LIST = COURSES;

// 일정표에서 j번째 항목 바로 앞의 위치 있는 항목 (자유 일정처럼 위치 없는 항목은 건너뜀)
export const prevAt = (items: ItinItem[], j: number) => {
  for (let i = j - 1; i >= 0; i--) if (items[i].at) return items[i].at;
  return undefined;
};
