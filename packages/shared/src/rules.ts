// 처리 로직 L-xx 중 DB 없이 계산되는 규칙 (상세설계 v1.3). 화면 미리 보기용 — 최종 판단은 서버 apps/api/app/rules.py
// 서버와 같은 규칙을 화면에서 미리 보여 줄 때 씀. 금액·인원은 항상 서버에서 다시 계산.
import { SETTINGS } from "./settings";
import { addDays, dow, parseWeekdays } from "./dates";
import type { DepartureStatus } from "./codes";

const md = (d: string) => d.slice(5);
/** 휴장기 안인지 (CLOSED_SEASON, 연말을 넘는 범위 지원) */
export const inClosedSeason = (d: string, cs: { from: string; to: string } = SETTINGS.CLOSED_SEASON) =>
  cs.from <= cs.to ? md(d) >= cs.from && md(d) <= cs.to : md(d) >= cs.from || md(d) <= cs.to;

export const judgeDate = (dep: string, judgeDays: number = SETTINGS.JUDGE_DAYS) => addDays(dep, -judgeDays);

export interface SaleRule {
  depWeekdays: string; // 'MON,THU'
  seasonFrom: string; // 'MM-DD'
  seasonTo: string;
}
/** B-04 출발편을 만들 날인지: 요일 + 판매 기간 + 휴장기 밖 */
export const isSaleDate = (p: SaleRule, d: string) =>
  parseWeekdays(p.depWeekdays).includes(dow(d)) && md(d) >= p.seasonFrom && md(d) <= p.seasonTo && !inClosedSeason(d);

/** L-01 출발일 판단: 판매일 + 판정일이 오늘 이후 + 출발편 OPEN/GO */
export const isBookableDate = (p: SaleRule, d: string, today: string, status: DepartureStatus = "OPEN") =>
  isSaleDate(p, d) && judgeDate(d) > today && (status === "OPEN" || status === "GO");

/** L-02 잔여석 = 정원 − 확정 인원 − 만료 안 된 임시확보 인원 */
export const seatsLeft = (capacity: number, bookedCount: number, heldPeople: number) => Math.max(0, capacity - bookedCount - heldPeople);

export type DepState = "unavailable" | "go" | "enough" | "need";
/** L-04 출발 확정 현황. 판정 전 20명 이상은 상태가 아니라 표시 '인원 충족'.
 * 정원 20 = 최소 출발 인원 20이라 '인원 충족'이면 정원도 다 참 → full 로 '잔여 0석' 대신 '마감' 표시 */
export const departureView = (o: { bookedCount: number; seats: number; status: DepartureStatus; people: number; minPeople?: number }) => {
  const min = o.minPeople ?? SETTINGS.MIN_DEPARTURE;
  const sum = o.bookedCount + o.people;
  const state: DepState = o.people > o.seats ? "unavailable" : o.status === "GO" ? "go" : sum >= min ? "enough" : "need";
  const msg = { unavailable: "M-120", go: "M-123", enough: "M-125", need: "M-122" }[state];
  const seatsAfter = Math.max(0, o.seats - o.people);
  return { booked: o.bookedCount, sum, seats: o.seats, need: Math.max(0, min - sum), seatsAfter, full: state !== "unavailable" && seatsAfter === 0, state, msg };
};

/** 객실 구성 (화면설계 v2 피드백 5): 2인 1실 기본, 1인실 인원은 인원과 홀짝이 같음 */
export const roomsOf = (people: number, singles?: number | null) => {
  let s = singles ?? people % 2;
  s = Math.max(people % 2, Math.min(people, s));
  if ((people - s) % 2) s = Math.min(people, s + 1);
  return { singles: s, twins: (people - s) / 2 };
};

/** L-05 금액 계산. 숙박 없는 선택(당일·호텔 없이)은 객실 구성·1인실 요금 없음 */
export const quote = (o: { basePrice: number; priceDiff: number; people: number; hasStay: boolean; singles?: number | null; singleAdd?: number | null }) => {
  const unitPrice = o.basePrice + o.priceDiff;
  const rooms = o.hasStay ? roomsOf(o.people, o.singles) : null;
  const singleAddEach = o.singleAdd ?? SETTINGS.SINGLE_ADD;
  const singleTotal = rooms ? rooms.singles * singleAddEach : 0;
  return { unitPrice, optionDiff: o.priceDiff, base: unitPrice * o.people, rooms, singleAddEach, singleTotal, total: unitPrice * o.people + singleTotal, currency: "JPY" as const };
};

/** L-09 예약번호 GT-YYMMDD-NNNN (YYMMDD = 출발일, NNNN = 그날 일련번호) */
export const bookingNo = (dep: string, seq: number) => `GT-${dep.slice(2, 4)}${dep.slice(5, 7)}${dep.slice(8, 10)}-${String(seq).padStart(4, "0")}`;

/** 두 좌표 거리 (m) */
export const distanceM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
export type AreaShape = { type: "circle"; lat: number; lng: number; r: number } | { type: "polygon"; points: [number, number][] }; // points: [lat, lng]
/** L-06 승하차 범위 검사 (프로토타입: 원, 실서비스: 다각형). 범위 기준은 팀 논의 T-1 */
export const inArea = (p: { lat: number; lng: number }, a: AreaShape) => {
  if (a.type === "circle") return distanceM(p, a) <= a.r;
  let inside = false;
  const pts = a.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [yi, xi] = pts[i], [yj, xj] = pts[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
