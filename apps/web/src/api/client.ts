// API 클라이언트 (apps/api). 요청·응답 모양은 @golf/shared 의 타입과 같음
import type { ApiErrorBody, DepartureListRes, PackageListRes } from "@golf/shared";

/** VITE_USE_API=1 이면 서버 API 사용, 아니면 프로토타입 데이터(브라우저 안 계산) 사용 */
export const USE_API = import.meta.env.VITE_USE_API === "1";
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api/golf";

export class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) {
    super(body.error);
  }
}

// 로그인: 메인 사이트 연동 방식(TBD-03) 전까지는 데모 토큰
let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return undefined as T;
  const j = await r.json().catch(() => ({ error: "E-SERVER", message: "M-900" }));
  if (!r.ok) throw new ApiError(r.status, j as ApiErrorBody);
  return j as T;
}
const qs = (o: Record<string, string | number | null | undefined>) =>
  "?" + Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export const api = {
  /** API-01 */
  packages: (o: { q?: string; date?: string | null; people: number; nights?: string; zone?: string; rounds?: string; sort?: string }) => req<PackageListRes>("GET", "/packages" + qs(o)),
  /** API-03 출발일 목록 (잔여석·판정일 다시 확인, api/seatCheck.ts) */
  departures: (pkgId: string, month: string, people: number) => req<DepartureListRes>("GET", `/packages/${pkgId}/departures` + qs({ month, people })),
  // TODO: API-02 ~ API-18 연결 (docs/DEVELOPMENT.md '화면 연결 순서')
};

/** 서버 패키지 ID(PKG-001) ↔ 프로토타입 데이터 ID(1). 화면이 전부 API로 바뀌면 삭제 */
export const protoId = (apiId: string) => Number(apiId.replace(/^PKG-0*/, ""));
export const apiPkgId = (id: number) => `PKG-${String(id).padStart(3, "0")}`;
