import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { PKGS, SET, serviceArea, type Lang, type Place } from "./data";
import { mapsLangDiffers } from "./gmaps";
import { USE_API, api } from "./api/client";
import { syncToken } from "./api/sync";
import { addDays, booked, departuresIn, judgeDate, monthsAhead, stopTimeRange, todayISO, tripEnd, type Extra, type SearchFilters } from "./logic";

// ---------- 앱 설정 (언어·테마·프로토타입 도구) ----------
export type Theme = "system" | "light" | "dark";
export type PayResult = "ok" | "fail" | "soldout";
interface AppState {
  lang: Lang;
  theme: Theme;
  anno: boolean; // 설계 번호·확인 필요(Q) 표시
  stage: 1 | 2 | 3; // MVP 단계 미리보기
  failNext: boolean; // 다음 불러오기에서 통신 오류 (C-09 데모)
  payResult: PayResult; // 다음 결제 결과 (성공 / 실패 E-PAY / 결제 후 자리 없음 E-SOLDOUT)
  wideArea: boolean; // 승하차 범위: false = 삿포로 중심 3km, true = 넓은 범위(공항 포함, 확인 필요)
  setLang: (l: Lang) => void;
  set: (p: Partial<AppState>) => void;
}
const initialLang = (): Lang => ((navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "ko"); // L-12, C-03
export const useApp = create<AppState>()(
  persist(
    (set) => ({
      lang: initialLang(),
      theme: "system",
      anno: false,
      stage: 3,
      failNext: false,
      payResult: "ok",
      wideArea: false,
      setLang: (lang) => {
        set({ lang });
        if (mapsLangDiffers(lang)) window.setTimeout(() => window.location.reload(), 30); // 지도 언어까지 바꾸려면 다시 불러옴 (고른 내용은 저장소에 남음)
      },
      set: (p) => {
        if (p.wideArea !== undefined) serviceArea.wide = p.wideArea;
        set(p);
      },
    }),
    {
      name: "golf-app",
      version: 2,
      migrate: (old) => ({ ...(old as object), payResult: "ok", wideArea: false }) as AppState,
      onRehydrateStorage: () => (st) => {
        if (st) serviceArea.wide = st.wideArea;
      },
    },
  ),
);

// ---------- 메인 사이트 로그인 (데모) ----------
export interface User {
  memberId: string;
  nameKo: string;
  nameEn: string;
  email: string;
  cc: string;
  phone: string;
}
export const DEMO_USER: User = { memberId: "TV-M-208173", nameKo: "이정훈", nameEn: "LEE JEONGHUN", email: "jh.lee@example.com", cc: "+82", phone: "10-4827-3519" };
interface AuthState {
  user: User | null;
  login: () => void;
  logout: () => void;
}
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      login: () => set({ user: DEMO_USER }),
      logout: () => set({ user: null }),
    }),
    { name: "golf-auth", version: 2, migrate: () => ({ user: null }) as unknown as AuthState },
  ),
);

// API 모드: 로그인 상태를 가짜 토큰(Bearer demo:M0001)으로 서버에 전달 (메인 사이트 연동 전, TBD-03)
syncToken(!!useAuth.getState().user);
useAuth.subscribe((st) => syncToken(!!st.user));

// ---------- 진행 중인 예약 (L-13: 브라우저 세션에 저장, 뒤로 가기·새로고침·로그인 다녀오기에도 유지) ----------
export const DEFAULT_FILTERS: SearchFilters = { nights: "all", zone: "all", rounds: "all", sort: "rec" };
export interface Info {
  nameKo: string;
  nameEn: string;
  cc: string;
  phone: string;
  email: string;
  companions: string[];
  en?: [string, string]; // 입력 중인 대표자 영문 [성, 이름] (보낼 때 nameEn = '성 이름')
  compEn?: [string, string][]; // 입력 중인 동반자 영문 [성, 이름] (보낼 때 companions)
  // 예약 화면 동의 2개 (V-25): 취소 규정 · 합승 안내. 이용약관·개인정보는 본 사이트 회원가입 때 동의 (운영사 확정)
  agree: { cancel: boolean; shared: boolean };
}
export interface Draft {
  q: string; // 검색어 (S-01·S-02 공유)
  date: string | null; // 출발일 (선택)
  people: number;
  filters: SearchFilters;
  cmp: number[];
  pkgId: number | null;
  dep: string | null;
  opt: string | null;
  pick: Place | null;
  drop: Place | null;
  dropSame: boolean; // 하차도 승차와 같은 곳 (기본 체크)
  pickMemo: string;
  pickTime: string | null; // 희망 승차 시간 'HH:MM' (booking_stop.desired_time, 참고용)
  dropTime: string | null; // 희망 하차 시간, 선택 (하차가 승차와 같은 곳이어도 따로 받음)
  info: Info | null;
  holdUntil: number | null; // 좌석 임시확보 만료 (seat_hold.expires_at)
  holdPeople: number;
  pendingNo?: string | null; // API 모드: 결제 대기 예약번호 (API-10, 본 사이트 결제 연동). 이 예약이 좌석을 잡음
  singles: number | null; // 1인실 이용 인원 (null = 자동: 홀수면 1명)
  editReturn: boolean; // S-08 '변경'으로 들어온 경우 → '변경 완료' 후 S-08
}
const blankDraft = (): Draft => ({
  q: "",
  date: null,
  people: SET.DEFAULT_PEOPLE,
  filters: DEFAULT_FILTERS,
  cmp: [],
  pkgId: null,
  dep: null,
  opt: null,
  pick: null,
  drop: null,
  dropSame: true,
  pickMemo: "",
  pickTime: null,
  dropTime: null,
  info: null,
  holdUntil: null,
  holdPeople: 0,
  singles: null,
  editReturn: false,
});
interface DraftState extends Draft {
  patch: (p: Partial<Draft>) => void;
  choosePkg: (id: number) => void;
}
export const useDraft = create<DraftState>()(
  persist(
    (set, get) => ({
      ...blankDraft(),
      patch: (p) => set(p),
      choosePkg: (id) => {
        const s = get();
        if (s.pkgId === id) return;
        const p = PKGS.find((x) => x.id === id)!;
        set({ pkgId: id, dep: null, opt: p.opts[0] ?? null, pick: null, drop: null, dropSame: true, pickMemo: "", pickTime: null, dropTime: null, holdUntil: null, holdPeople: 0, singles: null });
      },
    }),
    { name: "golf-draft", version: 3, migrate: () => blankDraft() as DraftState, storage: createJSONStorage(() => sessionStorage) },
  ),
);
// 서비스명 탭 확인 후 초기화 (M-101, C-06)
export const fullReset = () => useDraft.setState({ ...blankDraft() });
// 좌석 임시확보 해제 (뒤로 가기·만료)
export const releaseHold = () => {
  const no = useDraft.getState().pendingNo;
  if (USE_API && no) api.abandon(no).catch(() => undefined); // 주문 전 결제 대기면 좌석 바로 해제 (실패해도 B-08이 10분 뒤 정리)
  useDraft.setState({ holdUntil: null, holdPeople: 0, pendingNo: null });
};

// ---------- 예약 데이터 (데모 DB: 브라우저에 저장) ----------
// 코드 정의: booking.status / departure.status / cancel_by / refund_status
export type BookingStatus = "CONFIRMED" | "USER_CANCEL" | "OP_CANCEL" | "DONE";
export type DepStatus = "OPEN" | "GO" | "CANCEL" | "DONE";
export type CancelBy = "USER" | "OP" | "SYSTEM";
export type RefundStatus = "REQUESTED" | "DONE" | "FAIL";
export interface Booking {
  no: string;
  pkgId: number;
  dep: string;
  people: number;
  opt: string | null;
  pick: Place | null;
  drop: Place | null;
  pickMemo: string;
  pickTime?: string; // 희망 승하차 시간 (booking_stop.desired_time). 운영이 확정한 시간은 pickupTime
  dropTime?: string;
  unit: number;
  singles?: number; // 1인실 이용 인원 (객실 구성)
  total: number;
  currency: "JPY";
  info: Info;
  status: BookingStatus;
  depStatus?: DepStatus; // 데모로 지정한 출발편 상태 (없으면 판정일 기준으로 계산)
  pickupTime?: string; // 출발 확정 후 운영이 등록한 승차 시각 (API-17)
  cancelBy?: CancelBy;
  refundStatus?: RefundStatus;
  canceledAt?: string;
  createdAt: string;
  lang: Lang;
}

// S-12 예약 조회 탭: 예정 = 예약 확정, 지난 = 여행 완료, 취소 = 고객 취소 + 운행 취소 (서버 rules.py booking_tab 과 같음, 팀 테스트 10/23)
export const tabOf = (status: BookingStatus): "up" | "past" | "cancel" => (status === "CONFIRMED" ? "up" : status === "DONE" ? "past" : "cancel");

// 화면 표시용 상태 (B-01 판정·B-03 완료를 계산으로 흉내)
export const viewOf = (b: Booking, extra: Extra) => {
  const p = PKGS.find((x) => x.id === b.pkgId)!;
  const today = todayISO();
  const end = tripEnd(p, b.dep);
  const cnt = booked(b.pkgId, b.dep, extra);
  const dep: DepStatus = b.depStatus ?? (judgeDate(b.dep) > today ? "OPEN" : cnt >= SET.MIN_DEPARTURE ? (end < today ? "DONE" : "GO") : "CANCEL");
  let status = b.status;
  let refund = b.refundStatus;
  let cancelBy = b.cancelBy;
  if (status === "CONFIRMED" && dep === "CANCEL") {
    status = "OP_CANCEL";
    cancelBy = "OP";
    refund = refund ?? "DONE";
  }
  if (status === "CONFIRMED" && dep === "DONE") status = "DONE";
  // 화면 라벨: 예약 확정·모집 중 / 인원 충족 / 출발 확정 / 운행 취소 / 고객 취소 / 여행 완료
  const label: "OPEN" | "ENOUGH" | "GO" | BookingStatus = status === "CONFIRMED" ? (dep === "GO" ? "GO" : cnt >= SET.MIN_DEPARTURE ? "ENOUGH" : "OPEN") : status;
  const tab = tabOf(status);
  return { p, dep, status, refund, cancelBy, label, tab, booked: cnt, end };
};

interface DbState {
  bookings: Booking[];
  extra: Extra;
  seeded: boolean;
  add: (b: Booking) => void;
  update: (no: string, p: Partial<Booking>) => void;
  clear: () => void;
  seed: () => void;
}
const seedBookings = (): { bookings: Booking[]; extra: Extra } => {
  const t = todayISO();
  const info = (n: number): Info => ({
    nameKo: DEMO_USER.nameKo, nameEn: DEMO_USER.nameEn, cc: DEMO_USER.cc, phone: DEMO_USER.phone, email: DEMO_USER.email,
    companions: ["PARK MINSEO", "CHOI YUNA", "KANG DOHYUN", "LIM SEOJIN", "YOON JIHO", "HAN SOYEON", "OH JUNSEO", "SEO HAEUN", "JUNG WOOJIN", "BAE YERIN", "KWON TAEYANG"].slice(0, n - 1),
    agree: { cancel: true, shared: true },
  });
  const sapSt: Place = { name: { ko: "JR 삿포로역 남쪽 출구", ja: "JR札幌駅 南口" }, kind: "station", area: "SAPPORO", lat: 43.0675, lng: 141.3508 };
  const odori: Place = { name: { ko: "삿포로 TV타워 옆 버스정류장", ja: "さっぽろテレビ塔横バス停" }, kind: "spot", area: "SAPPORO", lat: 43.0611, lng: 141.3564 };
  const no = (d: string, n: number) => `GT-${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${String(n).padStart(4, "0")}`;
  const nextDep = (pid: number, skip = 0) => {
    const p = PKGS.find((x) => x.id === pid)!;
    const all = monthsAhead().flatMap((ym) => departuresIn(p, ym));
    return all[skip] ?? all[0] ?? null;
  };
  const out: Booking[] = [];
  const extra: Extra = {};
  // 희망 시간: 승차는 고를 수 있는 가장 늦은 시간, 하차는 가장 이른 시간 (TRAVEL 대략값 기준)
  const times = (pid: number, pick: Place, drop: Place) => {
    const p = PKGS.find((x) => x.id === pid)!;
    return { pickTime: stopTimeRange(p, "pick", pick)?.options.at(-1), dropTime: stopTimeRange(p, "drop", drop)?.options[0] };
  };
  const up = nextDep(1, 1);
  if (up) {
    out.push({ no: no(up, 1), pkgId: 1, dep: up, people: 4, opt: "mitsui", pick: odori, drop: sapSt, pickMemo: "TV타워 1층 출입구 앞", ...times(1, odori, sapSt), unit: 69800, total: 279200, currency: "JPY", info: info(4), status: "CONFIRMED", createdAt: addDays(t, -2), lang: "ko" });
    extra[`1|${up}`] = 4;
  }
  const up2 = nextDep(7, 2);
  if (up2) {
    out.push({ no: no(up2, 1), pkgId: 7, dep: up2, people: 2, opt: "std", pick: sapSt, drop: sapSt, pickMemo: "", ...times(7, sapSt, sapSt), unit: 45800, total: 91600, currency: "JPY", info: info(2), status: "USER_CANCEL", cancelBy: "USER", refundStatus: "REQUESTED", canceledAt: addDays(t, -1), createdAt: addDays(t, -6), lang: "ko" });
  }
  const past = addDays(t, -24);
  out.push({ no: no(past, 3), pkgId: 7, dep: past, people: 12, opt: "std", pick: sapSt, drop: sapSt, pickMemo: "", ...times(7, sapSt, sapSt), unit: 45800, total: 549600, currency: "JPY", info: info(12), status: "DONE", depStatus: "DONE", createdAt: addDays(t, -60), lang: "ko" });
  const can = addDays(t, -9);
  out.push({ no: no(can, 2), pkgId: 3, dep: can, people: 2, opt: null, pick: sapSt, drop: sapSt, pickMemo: "", ...times(3, sapSt, sapSt), unit: 16900, total: 33800, currency: "JPY", info: info(2), status: "OP_CANCEL", depStatus: "CANCEL", cancelBy: "OP", refundStatus: "DONE", canceledAt: addDays(can, -3), createdAt: addDays(t, -30), lang: "ko" });
  return { bookings: out, extra };
};
export const useDb = create<DbState>()(
  persist(
    (set, get) => ({
      bookings: [],
      extra: {},
      seeded: false,
      add: (b) => set({ bookings: [b, ...get().bookings], extra: { ...get().extra, [`${b.pkgId}|${b.dep}`]: (get().extra[`${b.pkgId}|${b.dep}`] ?? 0) + b.people } }),
      update: (no, p) => {
        const prev = get().bookings.find((b) => b.no === no);
        let extra = get().extra;
        // 고객 취소: 출발편 인원에서 뺌 (L-14)
        if (prev && p.status && p.status !== "CONFIRMED" && prev.status === "CONFIRMED") extra = { ...extra, [`${prev.pkgId}|${prev.dep}`]: Math.max(0, (extra[`${prev.pkgId}|${prev.dep}`] ?? 0) - prev.people) };
        if (prev && p.status === "CONFIRMED" && prev.status !== "CONFIRMED") extra = { ...extra, [`${prev.pkgId}|${prev.dep}`]: (extra[`${prev.pkgId}|${prev.dep}`] ?? 0) + prev.people };
        set({ bookings: get().bookings.map((b) => (b.no === no ? { ...b, ...p } : b)), extra });
      },
      clear: () => set({ bookings: [], extra: {}, seeded: true }),
      seed: () => set({ ...seedBookings(), seeded: true }),
    }),
    { name: "golf-db", version: 4, migrate: () => ({ bookings: [], extra: {}, seeded: false }) as unknown as DbState },
  ),
);

// ---------- 토스트 ----------
interface ToastState {
  msg: string | null;
  tone: "ok" | "bad";
  show: (m: string, tone?: "ok" | "bad") => void;
}
let toastTimer: number | undefined;
export const useToast = create<ToastState>()((set) => ({
  msg: null,
  tone: "ok",
  show: (msg, tone = "ok") => {
    window.clearTimeout(toastTimer);
    set({ msg, tone });
    toastTimer = window.setTimeout(() => set({ msg: null }), Math.max(2600, msg.length * 70));
  },
}));
