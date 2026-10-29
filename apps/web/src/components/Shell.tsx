import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { SERVICE_NAME } from "../data";
import { useApp, useAuth } from "../store";
import { logoutUrl } from "../api/sync";
import { useT } from "../i18n";
import { Anno, Sheet } from "./ui";
import { GolfLogo, SiteNav } from "./SiteFrame";

// 예약 진행 중(S-02~S-10): 서비스명 탭 시 확인 창 (C-06, T-27, M-101)
export const isBookingPath = (p: string) => p.startsWith("/golf/packages") || p.startsWith("/golf/compare") || p.startsWith("/golf/book");
// 주 메뉴를 보여 주는 화면 (화면설계 v0.2 공통 ①-3: 예약 단계 S-05~S-10·로그인에서는 숨김)
const showGolfTabs = (p: string) => !p.startsWith("/golf/book") && !p.startsWith("/login") && !p.includes("/complete");

// TRAVENDER 로고: 본 사이트 로그인(데모) 화면에서만 씀. 이 서비스 헤더는 서비스 이름(SERVICE_NAME)
export function Logo({ small }: { small?: boolean }) {
  const { t } = useT();
  return (
    <span className="flex items-center gap-2.5">
      {/* 로고 원본 파일 수령 후 교체 (F-002) */}
      <span aria-hidden="true" className="relative h-[30px] w-[26px] flex-none" style={{ borderRadius: "50% 50% 50% 50% / 45% 45% 55% 55%", background: "linear-gradient(90deg,#E11D48 0 50%,#1A1D24 50% 100%)" }}>
        <span className="absolute left-1/2 top-[38%] h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </span>
      <span className="leading-none">
        <b className="block text-[15px] tracking-[0.06em] sm:text-[17px] sm:tracking-[0.08em]">TRAVENDER</b>
        {!small && <small className="mt-0.5 hidden text-[10px] tracking-[0.06em] text-muted sm:block">{t("brandSub")}</small>}
      </span>
    </span>
  );
}

function LangToggle() {
  const { lang, setLang } = useApp();
  return (
    <div className="relative flex items-center rounded-full border-[1.5px] border-line p-0.5" role="group" aria-label="Language">
      <Anno n="C-03" t="언어 전환 (L-12): 즉시 반영, 다음 방문에도 유지" />
      {(["ja", "ko"] as const).map((l) => (
        <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)} className={`num h-8 min-w-[34px] rounded-full px-1.5 text-[12px] font-bold transition-colors ${lang === l ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}>
          {l === "ko" ? "KO" : "JP"}
        </button>
      ))}
    </div>
  );
}

// 공통 헤더: 본 사이트 상단 틀(로고·주 메뉴·언어·로그인) + 골프 메뉴 (팀 결정 10/29, 로고만 골프용 GOLF)
export function Header() {
  const { t } = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const user = useAuth((s) => s.user);
  const demoLogout = useAuth((s) => s.logout);
  const [confirm, setConfirm] = useState(false);
  // 로그아웃: 본 사이트 로그아웃(partner 모드, /me 의 logoutUrl). 없으면 데모 로그아웃 (골프 쪽 로그아웃 화면은 없음)
  const logout = () => (logoutUrl ? window.location.assign(logoutUrl) : demoLogout());
  const goHome = () => {
    if (isBookingPath(loc.pathname)) setConfirm(true);
    else nav("/golf");
  };
  const goMy = () => nav(user ? "/golf/my" : `/login?next=${encodeURIComponent("/golf/my")}`);
  const tabs: [string, string, () => void][] = [
    ["/golf", t("golfHome"), () => nav("/golf")],
    ["/golf/packages", t("allPkgs"), () => nav("/golf/packages")],
    ["/golf/my", t("myBookings"), goMy],
    ["/golf/support", t("support"), () => nav("/golf/support")],
  ];
  const activeTab = loc.pathname === "/golf" ? "/golf" : loc.pathname.startsWith("/golf/my") ? "/golf/my" : loc.pathname.startsWith("/golf/support") ? "/golf/support" : loc.pathname.startsWith("/golf/packages") || loc.pathname.startsWith("/golf/compare") ? "/golf/packages" : "";
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="relative mx-auto flex h-16 max-w-[480px] items-center gap-2 px-4 lg:max-w-[1280px] lg:gap-3 lg:px-6">
          <Anno n={1} t="공통 헤더: 본 사이트 상단(로고·주 메뉴·언어·로그인) + 골프 메뉴. 로고만 골프용" />
          <button onClick={goHome} className="mr-auto rounded-lg py-1 text-ink lg:mr-0" aria-label={SERVICE_NAME}>
            <GolfLogo />
          </button>
          <SiteNav />
          <LangToggle />
          {user ? (
            <button onClick={() => nav("/golf/my")} className="max-w-[92px] truncate whitespace-nowrap rounded-full border-[1.5px] border-line px-2.5 py-1.5 text-[13px] font-bold" title={t("myBookings")}>
              {t("nameSuffix", { n: user.nameKo })}
            </button>
          ) : null}
          {user ? (
            <button onClick={logout} className="whitespace-nowrap px-1 text-[12.5px] font-semibold text-muted underline-offset-2 hover:underline">{t("logout")}</button>
          ) : (
            <button onClick={() => nav(`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`)} className="whitespace-nowrap rounded-full border-[1.5px] border-line px-2.5 py-1.5 text-[13px] font-bold hover:border-brand hover:text-brand">
              {t("login")}
            </button>
          )}
        </div>
        {/* 주 메뉴 */}
        {showGolfTabs(loc.pathname) && (
          <nav className="mx-auto flex max-w-[480px] gap-1 overflow-x-auto px-3 lg:max-w-[1280px] lg:gap-4 lg:border-t lg:border-line lg:px-5 lg:pt-2" aria-label={t("golfMenu")} style={{ scrollbarWidth: "none" }}>
            {tabs.map(([to, label, go]) => (
              <button key={to} onClick={go} aria-current={activeTab === to ? "page" : undefined} className={`relative flex-none px-2.5 pb-2.5 pt-1 text-[14px] font-bold ${activeTab === to ? "text-brand" : "text-muted hover:text-ink"}`}>
                {label}
                {activeTab === to && <motion.span layoutId="golf-tab" className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-full bg-brand" />}
              </button>
            ))}
          </nav>
        )}
      </header>
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("M-101")}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>{t("resetNo")}</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setConfirm(false);
                nav("/golf", { state: { reset: true } }); // 비우기는 골프 홈이 열린 뒤 (먼저 비우면 예약 단계 화면이 목록으로 돌려보냄)
              }}
            >
              {t("resetYes")}
            </button>
          </div>
        }
      >
        <div className="relative pt-1">
          <Anno n="M-101" t="확인 창 (예약 진행 중 서비스명 탭, L-13)" />
        </div>
      </Sheet>
    </>
  );
}
