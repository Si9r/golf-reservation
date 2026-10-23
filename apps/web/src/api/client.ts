// API 클라이언트 (apps/api). 요청·응답 모양은 @golf/shared 의 타입과 같음
import type {
  ApiErrorBody, BookingCreateReq, BookingCreateRes, BookingStatus, BookingSummary, CalendarRes, DepartureListRes, DepartureStatus,
  HoldReq, HoldRes, PackageListRes, QuoteReq, QuoteRes,
} from "@golf/shared";

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
  /** API-03 출발일 목록 */
  departures: (pkg: string, month: string, people: number) => req<DepartureListRes>("GET", `/packages/${pkg}/departures` + qs({ month, people })),
  /** API-04 날짜별 출발 패키지 수 */
  calendar: (month: string, people: number) => req<CalendarRes>("GET", "/departures/calendar" + qs({ month, people })),
  /** API-06 승하차 범위 */
  checkPlace: (lat: number, lng: number) => req<{ inArea: boolean }>("POST", "/places/check", { lat, lng }),
  /** API-07 금액 */
  quote: (b: QuoteReq) => req<QuoteRes>("POST", "/quotes", b),
  /** API-08 / 09 좌석 임시확보 */
  hold: (b: HoldReq) => req<HoldRes>("POST", "/holds", b),
  releaseHold: (id: number) => req<void>("DELETE", `/holds/${id}`),
  /** API-10 예약 확정 */
  book: (b: BookingCreateReq) => req<BookingCreateRes>("POST", "/bookings", b),
  /** API-11 내 예약 (departureId를 주면 그 출발편의 살아 있는 예약만) */
  myBookings: (departureId?: string) => req<{ items: BookingSummary[] }>("GET", "/bookings" + qs({ departureId })),
  /** API-12 예약 상세 */
  booking: (no: string) => req<ApiBooking>("GET", `/bookings/${no}`),
  /** API-13 동반자 명단 */
  saveCompanions: (no: string, names: string[]) => req<{ saved: number }>("PUT", `/bookings/${no}/companions`, { companions: names.map((nameEn) => ({ nameEn })) }),
};

/** API-12 응답 (packages/shared에 아직 타입 없음) */
export interface ApiBooking {
  no: string; packageId: string; status: BookingStatus; people: number; singles: number | null; unitPrice: number; total: number; currency: "JPY";
  optionId: string | null; lang: "ko" | "ja"; createdAt: string; refundStatus: "REQUESTED" | "DONE" | "FAIL" | null;
  departure: { id: string; date: string; booked: number; minPeople: number; seatsLeft: number; status: DepartureStatus; judgeDate: string };
  companionDue: string;
  stops: { kind: "PICK" | "DROP"; placeName: string; placeId: string | null; address: string | null; lat: number; lng: number; memo: string | null; pickupTime: string | null; desiredTime: string | null }[];
  members: { seq: number; isRep: boolean; nameLocal: string | null; nameEn: string | null; countryCode: string | null; phone: string | null; email: string | null }[];
}

/** 서버 ID ↔ 프로토타입 데이터 ID. 화면이 API 응답만 쓰게 되면 삭제 */
export const protoId = (apiId: string) => Number(apiId.replace(/^PKG-0*/, ""));
export const apiPkgId = (id: number) => `PKG-${String(id).padStart(3, "0")}`;
export const apiDepId = (id: number, date: string) => `${apiPkgId(id)}-${date.replace(/-/g, "")}`;
export const apiOptId = (id: number, code: string | null) => (code ? `${apiPkgId(id)}-${code}` : null);
export const optCode = (apiOpt: string | null) => (apiOpt ? apiOpt.replace(/^PKG-\d+-/, "") : null);
