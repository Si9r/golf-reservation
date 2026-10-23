// B-01 (팀 테스트 10/23): 예약 단계에서 다음 화면으로 넘어갈 때 그 시점의 잔여석·판정일을 다시 확인.
// 확인 로직은 recheckSeat 하나에 모아 둠. 화면을 모두 API로 바꾸면 이 함수의 프로토타입 계산 부분만 지우면 됨.
// 쓰는 곳: S-03 '이 패키지 예약', S-05 '다음', S-08 '예약 진행'. S-06 '다음'(Place.tsx)은 담당 팀원이 useSeatGuard 를 붙일 예정
import { useNavigate } from "react-router-dom";
import { pkgOf, type Pkg } from "../data";
import { useT } from "../i18n";
import { depView, isDeparture } from "../logic";
import { useDb, useDraft, useToast } from "../store";
import { USE_API, api, apiPkgId } from "./client";
import { refreshMonth } from "./sync";

export type SeatCheck = "ok" | "changed" | "error";

/** 고른 출발편에 지금 인원만큼 자리가 남아 있고 판정일 전인지. VITE_USE_API=1 이면 서버 API-03, 아니면 프로토타입 계산 */
export async function recheckSeat(p: Pkg, dep: string, people: number): Promise<SeatCheck> {
  if (USE_API) {
    try {
      const { items } = await api.departures(apiPkgId(p.id), dep.slice(0, 7), people);
      return items.find((x) => x.date === dep)?.selectable ? "ok" : "changed"; // selectable = 판정일 전 + 잔여석 ≥ 인원 (L-01·L-02)
    } catch {
      return "error";
    }
  }
  return isDeparture(p, dep) && depView(p.id, dep, people, useDb.getState().extra).state !== "unavailable" ? "ok" : "changed";
}

// S-03이 열릴 때 한 번 읽는 'M-128 안내' 표시 (라우터 state 는 출발일을 비울 때 다른 화면의 자동 이동에 덮일 수 있어 따로 둠)
let seatNotice: number | null = null;
export const takeSeatNotice = (pkgId: number) => {
  const on = seatNotice === pkgId;
  seatNotice = null;
  return on;
};

/** 다음 화면으로 가기 전에 잔여석을 다시 확인. 바뀌었으면 M-128 안내 후 S-03 출발일 선택으로 (출발일 선택을 비우고 목록을 새로 계산) */
export function useSeatGuard() {
  const nav = useNavigate();
  const { t } = useT();
  const toast = useToast((s) => s.show);
  return async (next: () => void) => {
    const d = useDraft.getState();
    const pkg = pkgOf(d.pkgId);
    if (!pkg || !d.dep) return next();
    const r = await recheckSeat(pkg, d.dep, d.people);
    if (r === "ok") return next();
    if (r === "error") return toast(t("M-900"), "bad");
    toast(t("M-128"), "bad");
    seatNotice = pkg.id;
    if (USE_API) void refreshMonth(pkg.id, d.dep.slice(0, 7)); // API 모드: S-03 출발일 목록을 서버 값으로 새로 고침
    useDraft.getState().patch({ dep: null, editReturn: false, holdUntil: null, holdPeople: 0 });
    nav(`/golf/packages/${pkg.id}`);
  };
}
