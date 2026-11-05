import { useLocation } from "react-router-dom";
import { pkgOf, type Pkg } from "../data";
import { useAuth, useDraft } from "../store";

// 예약 단계 화면이 열리려면 앞 단계에서 고른 내용이 있어야 함 (직접 URL 접근·새로고침 대비)
// '변경'으로 들어온 화면에서 '변경 완료'를 누르면 돌아갈 곳 (S-08 확인 / S-09 정보 입력)
export const editBackTo = (r: false | "review" | "info") => (r === "info" ? "/golf/book/info" : "/golf/book/review");

export function useFlow(need: { place?: boolean; login?: boolean; info?: boolean } = {}) {
  const d = useDraft();
  const user = useAuth((s) => s.user);
  const loc = useLocation();
  const p = pkgOf(d.pkgId) as Pkg | null;
  let redirect: string | null = null;
  if (!p) redirect = "/golf/packages";
  else if (!d.dep) redirect = `/golf/packages/${p.id}`;
  else if (need.place && (!d.pick || !d.drop)) redirect = "/golf/book/place"; // 승하차 장소
  else if (need.login && !user) redirect = `/login?next=${encodeURIComponent(loc.pathname)}`;
  else if (need.info && !d.info) redirect = "/golf/book/info";
  return { d, p: p as Pkg, redirect, user };
}
