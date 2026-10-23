// API 모드(VITE_USE_API=1)에서 화면의 브라우저 계산을 서버 값으로 바꾸는 다리.
// logic.ts의 출발일·잔여석 함수가 이 캐시를 먼저 보고, 없으면 프로토타입 계산을 씀.
// 화면이 API 응답만 쓰도록 바뀌면 이 파일과 logic.ts의 해당 분기를 지움 (docs/DEVELOPMENT.md 2장)
import { useEffect } from "react";
import { create } from "zustand";
import type { DepartureItem } from "@golf/shared";
import { PKGS, type Place } from "../data";
import type { Booking } from "../store";
import { USE_API, api, apiPkgId, optCode, protoId, setToken, type ApiBooking } from "./client";

const deps = new Map<string, DepartureItem>(); // key: `${protoPkgId}|${date}`
const loaded = new Set<string>(); // key: `${protoPkgId}|${ym}`
const cal = new Map<string, Record<string, number>>(); // key: `${ym}|${people}`
const pending = new Set<string>();

export const useApiVersion = create<{ v: number; bump: () => void }>((set) => ({ v: 0, bump: () => set((s) => ({ v: s.v + 1 })) }));
const bump = () => useApiVersion.getState().bump();

export const depFromApi = (pkgId: number, date: string) => (USE_API && loaded.has(`${pkgId}|${date.slice(0, 7)}`) ? deps.get(`${pkgId}|${date}`) ?? null : undefined);
export const monthLoaded = (pkgId: number, ym: string) => USE_API && loaded.has(`${pkgId}|${ym}`);
export const calendarCount = (ym: string, people: number, date: string) => (USE_API ? cal.get(`${ym}|${people}`)?.[date] : undefined);

async function loadMonth(pkgId: number, ym: string, force = false) {
  const k = `${pkgId}|${ym}`;
  if ((loaded.has(k) && !force) || pending.has(k)) return;
  pending.add(k);
  try {
    const r = await api.departures(apiPkgId(pkgId), ym, 1); // 잔여석·인원은 인원과 무관. 선택 가능 여부는 화면이 계산
    for (const it of r.items) deps.set(`${pkgId}|${it.date}`, it);
    loaded.add(k);
  } finally {
    pending.delete(k);
  }
}
/** 출발편을 다시 받아 옴 (예약·좌석 확보 뒤) */
export async function refreshMonth(pkgId: number, ym: string) {
  loaded.delete(`${pkgId}|${ym}`);
  await loadMonth(pkgId, ym).catch(() => undefined);
  bump();
}

/** 화면이 보여 줄 패키지·달의 출발편을 미리 받아 둠 (API-03) */
export function useDepartures(pkgIds: number[], yms: string[]) {
  const v = useApiVersion((s) => s.v);
  const key = pkgIds.join(",") + "/" + yms.join(",");
  useEffect(() => {
    if (!USE_API) return;
    // 화면에 들어올 때와 탭으로 돌아올 때마다 다시 받음 (다른 사람의 예약·좌석 확보 반영). 받는 동안은 이전 값 표시
    const load = () => {
      const all = pkgIds.flatMap((p) => yms.map((m) => [p, m] as const));
      Promise.allSettled(all.map(([p, m]) => loadMonth(p, m, true))).then(bump);
    };
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** 날짜 시트의 날짜별 출발 패키지 수 (API-04) */
export function useCalendar(ym: string, people: number) {
  const v = useApiVersion((s) => s.v);
  useEffect(() => {
    if (!USE_API || cal.has(`${ym}|${people}`)) return;
    api.calendar(ym, people).then((r) => {
      cal.set(`${ym}|${people}`, Object.fromEntries(r.items.map((x) => [x.date, x.count])));
      bump();
    }).catch(() => undefined);
  }, [ym, people]);
  return v;
}

// ---------- 로그인 토큰 (가짜 연결: Bearer demo:M0001) ----------
export const DEMO_MEMBER = "M0001";
export const syncToken = (loggedIn: boolean) => setToken(USE_API && loggedIn ? `demo:${DEMO_MEMBER}` : null);

// ---------- 예약: 서버 응답 → 화면의 Booking 모양 ----------
const placeOf = (s: ApiBooking["stops"][number] | undefined): Place | null =>
  s ? { name: { ko: s.placeName, ja: s.placeName }, kind: "spot", area: "SAPPORO", lat: Number(s.lat), lng: Number(s.lng), placeId: s.placeId ?? undefined, addr: s.address ?? undefined } as Place : null;

export function toBooking(b: ApiBooking): Booking {
  const pick = b.stops.find((s) => s.kind === "PICK");
  const drop = b.stops.find((s) => s.kind === "DROP");
  const rep = b.members.find((m) => m.isRep) ?? b.members[0];
  const comps = b.members.filter((m) => !m.isRep).map((m) => m.nameEn ?? "").filter(Boolean);
  const pkgId = protoId(b.packageId);
  // 출발편 현황을 캐시에 넣어 두면 viewOf()의 인원 계산이 서버 값을 씀
  deps.set(`${pkgId}|${b.departure.date}`, { id: b.departure.id, date: b.departure.date, booked: b.departure.booked, minPeople: b.departure.minPeople, seatsLeft: b.departure.seatsLeft, status: b.departure.status, judgeDate: b.departure.judgeDate, selectable: true, view: { state: "need", msg: "", need: 0, full: b.departure.booked >= b.departure.minPeople } });
  loaded.add(`${pkgId}|${b.departure.date.slice(0, 7)}`);
  return {
    no: b.no, pkgId, dep: b.departure.date, people: b.people, opt: optCode(b.optionId), pick: placeOf(pick), drop: placeOf(drop),
    pickMemo: pick?.memo ?? "", unit: b.unitPrice, singles: b.singles ?? undefined, total: b.total, currency: "JPY",
    info: { nameKo: rep?.nameLocal ?? "", nameEn: rep?.nameEn ?? "", cc: rep?.countryCode ?? "+82", phone: rep?.phone ?? "", email: rep?.email ?? "", companions: comps, later: comps.length === 0, agree: { cancel: true, shared: true } },
    status: b.status as Booking["status"], depStatus: b.departure.status as Booking["depStatus"], pickupTime: pick?.pickupTime ?? undefined, pickTime: pick?.desiredTime?.slice(0, 5) ?? undefined, dropTime: drop?.desiredTime?.slice(0, 5) ?? undefined,
    refundStatus: b.refundStatus ?? undefined, createdAt: String(b.createdAt).slice(0, 10), lang: b.lang,
  };
}

/** 내 예약을 서버에서 받아 화면 저장소(useDb)에 채움 (API-11 + API-12) */
export async function fetchMyBookings(): Promise<Booking[]> {
  const list = await api.myBookings();
  const full = await Promise.all(list.items.map((x) => api.booking(x.no)));
  bump();
  return full.map(toBooking);
}

export const knownPkgIds = PKGS.map((p) => p.id);
