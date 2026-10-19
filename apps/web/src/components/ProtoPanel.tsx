import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Blueprint } from "@phosphor-icons/react";
import { useApp, useAuth, useDb, useDraft, useToast, type Theme } from "../store";
import { PKGS } from "../data";
import { firstAvailable } from "../logic";
import { Sheet } from "./ui";

// 프로토타입 전용 도구 (실서비스 제외). 설계서 번호 보기, MVP 단계 미리보기, 오류·결제 결과 데모
function Seg<T extends string | number>({ value, items, onChange }: { value: T; items: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-xl bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map(([v, l]) => (
        <button key={String(v)} aria-pressed={value === v} onClick={() => onChange(v)} className={`min-h-[40px] rounded-lg text-[13.5px] font-bold ${value === v ? "bg-surface text-brand shadow-sm" : "text-muted"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function ProtoPanel() {
  const [open, setOpen] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  useEffect(() => {
    // 페이지 맨 아래(160px 안)에서는 버튼을 숨겨 마지막 내용·푸터를 가리지 않음
    const f = () => setAtEnd(window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 160 && document.documentElement.scrollHeight > window.innerHeight + 40);
    f();
    window.addEventListener("scroll", f, { passive: true });
    window.addEventListener("resize", f);
    const mo = new MutationObserver(f);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { window.removeEventListener("scroll", f); window.removeEventListener("resize", f); mo.disconnect(); };
  }, []);
  const app = useApp();
  const { user, login, logout } = useAuth();
  const db = useDb();
  const toast = useToast((s) => s.show);
  const nav = useNavigate();
  const go = (to: string) => {
    setOpen(false);
    nav(to);
  };
  const jumpBooking = (to: string) => {
    // 예약 단계 화면은 고른 내용이 있어야 열림 → 첫 패키지·가까운 출발일로 채움
    const d = useDraft.getState();
    if (!d.pkgId || !d.dep) {
      const p = PKGS[0];
      const dep = firstAvailable(p, null, d.people, useDb.getState().extra);
      useDraft.setState({ pkgId: p.id, dep, opt: p.opts[0] ?? null });
    }
    const s = useDraft.getState();
    if ((to.includes("review") || to.includes("info") || to.includes("pay")) && (!s.pick || !s.drop)) {
      const pl = { name: { ko: "JR 삿포로역 남쪽 출구", ja: "JR札幌駅 南口" }, kind: "station" as const, area: "SAPPORO" as const, lat: 43.0675, lng: 141.3508 };
      useDraft.setState({ pick: s.pick ?? pl, drop: s.drop ?? pl, dropSame: true });
    }
    if (to.includes("pay") && !useAuth.getState().user) login();
    if (to.includes("pay")) {
      const u = useAuth.getState().user!;
      const st = useDraft.getState();
      useDraft.setState({
        holdUntil: Date.now() + 10 * 60000,
        holdPeople: st.people,
        info: st.info ?? { nameKo: u.nameKo, nameEn: u.nameEn, cc: u.cc, phone: u.phone, email: u.email, companions: [], later: true, agree: { terms: true, privacy: true, cancel: true } },
      });
    }
    go(to);
  };
  const screens: [string, string, () => void][] = [
    ["S-01", "홈 / 여행 조건 입력", () => go("/golf")],
    ["S-02", "패키지 목록", () => go("/golf/packages")],
    ["S-03", "패키지 상세", () => go(`/golf/packages/${useDraft.getState().pkgId ?? 1}`)],
    ["S-04", "패키지 비교 (2단계)", () => { if (useDraft.getState().cmp.length < 2) useDraft.setState({ cmp: [1, 2, 6] }); go("/golf/compare"); }],
    ["S-05", "호텔 옵션 선택", () => jumpBooking("/golf/book/hotel")],
    ["S-06", "승하차 장소 지정", () => jumpBooking("/golf/book/place")],
    ["S-08", "예약 내용·비용 확인", () => jumpBooking("/golf/book/review")],
    ["S-09", "예약자 정보 입력", () => jumpBooking("/golf/book/info")],
    ["S-10", "결제", () => jumpBooking("/golf/book/pay")],
    ["S-12", "내 예약", () => go("/golf/my")],
    ["S-13", "예약 상세", () => { const b = useDb.getState().bookings[0]; go(b ? `/golf/my/${b.no}` : "/golf/my"); }],
    ["S-14", "고객센터 안내", () => go("/golf/support")],
  ];
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-[96px] right-3 z-[55] flex h-11 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-bold transition-opacity lg:bottom-6 lg:left-6 lg:right-auto ${atEnd ? "pointer-events-none opacity-0" : ""}`}
        style={{ background: "var(--surface)", borderColor: "var(--anno)", color: "var(--anno)", boxShadow: "var(--shadow)" }}
        aria-label="프로토타입 설계 도구 열기"
      >
        <Blueprint size={18} weight="bold" /> 설계
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="프로토타입 설계 도구" wide>
        <div className="grid gap-5 text-[14px]">
          <p className="rounded-xl bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">
            기준: 상세설계서 v1.0 (업무 규칙·메시지·코드) · 화면설계서 v1.0 초안·v0.2 · 요건 정의서 v1.0 · 기본설계서 v0.2 · 질문답변 1~3차. 패키지·가격·사진은 예시이며 실제 예약·결제는 없어요. 이 도구는 실서비스에 포함되지 않아요.
          </p>
          <section className="grid gap-2">
            <h3 className="font-bold">설계서 번호 표시</h3>
            <Seg value={app.anno ? 1 : 0} items={[[0, "끄기"], [1, "켜기 (주황 번호·Q·화면 ID)"]]} onChange={(v) => app.set({ anno: v === 1 })} />
            <p className="help">주황 번호 = 설계서 각 화면 시트의 항목 번호. 노란 Q = 요건 정의서의 확인 필요 사항.</p>
          </section>
          <section className="grid gap-2">
            <h3 className="font-bold">MVP 단계 미리보기</h3>
            <Seg value={app.stage} items={[[1, "1단계"], [2, "2단계"], [3, "3단계"]]} onChange={(v) => app.set({ stage: v })} />
            <p className="help">2단계: 추천 패키지, 비교, 포함 사항 내역, 출발 확정 현황 · 3단계: AI 추천 입구</p>
          </section>
          <section className="grid gap-2">
            <h3 className="font-bold">상태 데모</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn btn-sm btn-ghost" onClick={() => { app.set({ failNext: true }); toast("다음 목록·상세 불러오기에서 통신 오류가 나요"); }}>다음 불러오기 통신 오류</button>
              <button className="btn btn-sm btn-ghost" onClick={() => (user ? logout() : login())}>{user ? "로그아웃 상태로" : "로그인 상태로"}</button>
            </div>
            <span className="text-[13px] font-semibold text-muted">다음 결제 결과</span>
            <Seg value={app.payResult} items={[["ok", "성공"], ["fail", "실패 (M-173)"], ["soldout", "결제 후 자리 없음 (M-174)"]]} onChange={(v) => app.set({ payResult: v })} />
            <span className="text-[13px] font-semibold text-muted">승하차 가능 범위 (SERVICE_AREA, 확인 필요)</span>
            <Seg value={app.wideArea ? 1 : 0} items={[[0, "상세설계: 삿포로 12km"], [1, "넓은 범위: 공항 포함"]]} onChange={(v) => app.set({ wideArea: v === 1 })} />
            <span className="text-[13px] font-semibold text-muted">테마</span>
            <Seg<Theme> value={app.theme} items={[["system", "시스템"], ["light", "라이트"], ["dark", "다크"]]} onChange={(v) => app.set({ theme: v })} />
            <span className="text-[13px] font-semibold text-muted">데모 예약 데이터</span>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-sm btn-ghost" onClick={() => { db.seed(); toast("예시 예약 3건을 넣었어요"); }}>예시 데이터 다시 넣기</button>
              <button className="btn btn-sm btn-ghost" onClick={() => { db.clear(); toast("예약 내역을 모두 비웠어요"); }}>모두 비우기 (빈 상태)</button>
            </div>
          </section>
          <section className="grid gap-2">
            <h3 className="font-bold">화면 바로가기</h3>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {screens.map(([id, name, fn]) => (
                <button key={id} onClick={fn} className="flex min-h-[44px] items-center gap-2 rounded-xl border border-line px-3 text-left hover:border-brand">
                  <b className="num w-11 text-brand">{id}</b>
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
            <p className="help">S-07(일정 확인)은 기본설계서 v0.2에서 삭제됨. S-11(예약 완료)은 결제를 마치면 열려요.</p>
          </section>
        </div>
      </Sheet>
    </>
  );
}
