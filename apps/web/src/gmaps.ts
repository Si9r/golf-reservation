import { useEffect, useState } from "react";
import type { Lang } from "./data";

// Google Maps Platform 연동 (I-01 지도, I-02 장소, 소요시간은 Routes API)
// 키는 프로젝트 폴더의 .env.local → VITE_GOOGLE_MAPS_API_KEY (빌드할 때 들어감, 웹사이트 주소 제한 필수)
const KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();
export const hasMapsKey = !!KEY;
// 프로토타입용 Google 데모 지도 ID (고급 마커 사용에 필요). 실서비스는 콘솔에서 만든 Map ID로 교체
export const MAP_ID = "DEMO_MAP_ID";

type Status = "idle" | "loading" | "ready" | "error";
let status: Status = "idle";
let loadedLang: Lang | null = null;
// 지도 스크립트가 다른 언어로 이미 불러와졌는지 (Google 지도는 불러온 뒤 언어를 바꿀 수 없음)
export const mapsLangDiffers = (l: Lang) => loadedLang !== null && loadedLang !== l;
let failReason: string | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export function loadMaps(lang: Lang): Promise<void> {
  if (!KEY) {
    status = "error";
    failReason = "NO_KEY";
    return Promise.reject(new Error("NO_KEY"));
  }
  if (loading) return loading;
  status = "loading";
  loadedLang = lang;
  loading = new Promise<void>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    w.__golfMapsReady = () => {
      status = "ready";
      notify();
      resolve();
    };
    // 키 제한(웹사이트 주소)·결제 문제 등으로 인증에 실패하면 Google 이 호출
    w.gm_authFailure = () => {
      status = "error";
      failReason = "AUTH";
      notify();
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&libraries=places,marker&language=${lang}&region=JP&callback=__golfMapsReady`;
    s.async = true;
    s.onerror = () => {
      status = "error";
      failReason = "LOAD";
      notify();
      reject(new Error("LOAD"));
    };
    document.head.append(s);
  });
  return loading;
}

export function useMaps(lang: Lang) {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    loadMaps(lang).catch(() => f());
    return () => {
      subs.delete(f);
    };
  }, [lang]);
  return { ready: status === "ready", error: status === "error" ? failReason : null };
}

// ---------- 예상 소요시간 (Routes API computeRoutes, 차량·교통 상황 미반영 = Essentials 요금) ----------
export interface LL {
  lat: number;
  lng: number;
}
export interface Drive {
  min: number;
  km: number;
  source: "google" | "estimate";
}
const CACHE_KEY = "golf-drive-v1";
const cache: Record<string, Drive> = (() => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
})();
const inflight = new Map<string, Promise<Drive | null>>();
const keyOf = (a: LL, b: LL) => `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;

// 키가 없거나 실패하면 직선거리 × 1.35, 평균 45km/h 로 대략 계산
const estimate = (a: LL, b: LL): Drive => {
  const R = 6371;
  const r = (x: number) => (x * Math.PI) / 180;
  const d = 2 * R * Math.asin(Math.sqrt(Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2));
  const km = d * 1.35;
  return { km: Math.round(km * 10) / 10, min: Math.max(5, Math.round((km / 45) * 60)), source: "estimate" };
};

// 이미 받아 둔 Google 경로 시간(분). 캐시에는 Google 결과만 저장되므로 없으면 null (일정표 시각 계산용, 팀 테스트 10/23 B-02)
export const cachedDriveMin = (a: LL, b: LL): number | null => cache[keyOf(a, b)]?.min ?? null;

export function getDrive(a: LL, b: LL): Promise<Drive | null> {
  const k = keyOf(a, b);
  if (cache[k]) return Promise.resolve(cache[k]);
  if (!KEY) return Promise.resolve(estimate(a, b));
  const hit = inflight.get(k);
  if (hit) return hit;
  const p = fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters" },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
      destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
      travelMode: "DRIVE",
    }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { routes?: { duration?: string; distanceMeters?: number }[] }) => {
      const route = j.routes?.[0];
      if (!route?.duration) return estimate(a, b);
      const out: Drive = { min: Math.max(1, Math.round(parseInt(route.duration, 10) / 60)), km: Math.round((route.distanceMeters ?? 0) / 100) / 10, source: "google" };
      cache[k] = out;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch {
        /* 저장 공간이 없으면 캐시 생략 */
      }
      return out;
    })
    .catch(() => estimate(a, b))
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

export function useDrive(a: LL | null | undefined, b: LL | null | undefined) {
  const k = a && b ? keyOf(a, b) : "";
  const [state, setState] = useState<{ k: string; d: Drive | null }>({ k: "", d: null });
  useEffect(() => {
    if (!a || !b) return;
    let alive = true;
    getDrive(a, b).then((d) => alive && setState({ k, d }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return { loading: !!k && state.k !== k, drive: state.k === k ? state.d : null };
}

export const fmtDrive = (d: Drive, L: Lang) => {
  const h = Math.floor(d.min / 60);
  const m = d.min % 60;
  const t = L === "ko" ? (h ? `${h}시간 ${m}분` : `${m}분`) : h ? `${h}時間${m}分` : `${m}分`;
  return `${t} · ${d.km}km`;
};
