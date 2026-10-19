import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { CaretDown, CaretRight, Headset, House, List, MagnifyingGlass, SignOut, Ticket, UserCircle, X } from "@phosphor-icons/react";
import { useApp, useAuth, useToast } from "../store";
import { useT } from "../i18n";
import { Anno, Sheet } from "./ui";

// 예약 진행 중(S-02~S-10): 로고 탭 시 확인 창 (C-06, T-27, M-101)
export const isBookingPath = (p: string) => p.startsWith("/golf/packages") || p.startsWith("/golf/compare") || p.startsWith("/golf/book");
// 골프 하위 메뉴를 보여 주는 화면 (화면설계 v0.2 공통 ①-3: 예약 단계 S-05~S-10·로그인에서는 숨김)
const showGolfTabs = (p: string) => !p.startsWith("/golf/book") && !p.startsWith("/login") && !p.includes("/complete");

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

function LangToggle({ withEn }: { withEn?: boolean }) {
  const { lang, setLang } = useApp();
  const { t } = useT();
  return (
    <div className="relative flex items-center rounded-full border-[1.5px] border-line p-0.5" role="group" aria-label="Language">
      <Anno n="C-03" t="언어 전환 (L-12): 즉시 반영, 다음 방문에도 유지" />
      {(["ja", "ko"] as const).map((l) => (
        <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)} className={`num h-8 min-w-[34px] rounded-full px-1.5 text-[12px] font-bold transition-colors ${lang === l ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}>
          {l === "ko" ? "KO" : "JP"}
        </button>
      ))}
      {withEn && (
        <button disabled title={t("enSoon")} className="num h-8 min-w-[34px] rounded-full px-1.5 text-[12px] font-bold text-line-strong">EN</button>
      )}
    </div>
  );
}

export function Header() {
  const { t, list } = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast((s) => s.show);
  const user = useAuth((s) => s.user);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const goHome = () => {
    if (isBookingPath(loc.pathname)) setConfirm(true);
    else nav("/golf");
  };
  const goMy = () => nav(user ? "/golf/my" : `/login?next=${encodeURIComponent("/golf/my")}`);
  const mainSite = () => toast(t("mainSiteToast"));
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
        <div className="relative mx-auto flex h-16 max-w-[480px] items-center gap-2 px-4 lg:h-[72px] lg:max-w-[1200px] lg:px-6">
          <Anno n={1} t="공통 헤더: 메인 사이트 헤더(로고·카테고리·골프 NEW·언어·로그인) + 골프 하위 메뉴" />
          <button onClick={goHome} className="mr-auto rounded-lg py-1 text-ink lg:mr-6" aria-label="TRAVENDER">
            <Logo />
          </button>
          {/* 메인 사이트 카테고리 (PC) */}
          <nav className="mr-auto hidden items-center gap-1 lg:flex" aria-label="TRAVENDER">
            {list("cats").map((c) => (
              <button key={c} onClick={mainSite} className="rounded-full px-3 py-2 text-[14.5px] font-semibold text-ink-2 hover:bg-surface-2">{c}</button>
            ))}
            <Link to="/golf" className="flex items-center gap-1 rounded-full px-3 py-2 text-[14.5px] font-bold text-brand">
              {t("golf")} <span className="rounded-full bg-[#E11D48] px-1.5 py-px text-[10px] font-bold text-white">{t("newBadge")}</span>
            </Link>
            <button onClick={mainSite} className="flex items-center gap-0.5 rounded-full px-3 py-2 text-[14.5px] font-semibold text-ink-2 hover:bg-surface-2">{t("more")} <CaretDown size={12} /></button>
          </nav>
          <span className="hidden lg:block"><LangToggle withEn /></span>
          <span className="lg:hidden"><LangToggle /></span>
          {user ? (
            <button onClick={() => nav("/golf/my")} className="max-w-[92px] truncate whitespace-nowrap rounded-full border-[1.5px] border-line px-2.5 py-1.5 text-[13px] font-bold" title={t("myBookings")}>
              {t("nameSuffix", { n: user.nameKo })}
            </button>
          ) : (
            <>
              <button onClick={() => nav(`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`)} className="whitespace-nowrap rounded-full border-[1.5px] border-line px-2.5 py-1.5 text-[13px] font-bold hover:border-brand hover:text-brand">
                {t("login")}
              </button>
              <button onClick={mainSite} className="hidden whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-[13px] font-bold text-surface lg:block">{t("signup")}</button>
            </>
          )}
          <button className="-mr-1.5 grid h-11 w-10 place-items-center rounded-full hover:bg-surface-2 lg:hidden" aria-label={t("menu")} aria-expanded={menu} onClick={() => setMenu(true)}>
            <List size={24} weight="bold" />
          </button>
        </div>
        {/* 골프 하위 메뉴 */}
        {showGolfTabs(loc.pathname) && (
          <nav className="mx-auto flex max-w-[480px] gap-1 overflow-x-auto px-3 lg:max-w-[1200px] lg:px-5" aria-label={t("golfMenu")} style={{ scrollbarWidth: "none" }}>
            {tabs.map(([to, label, go]) => (
              <button key={to} onClick={go} aria-current={activeTab === to ? "page" : undefined} className={`relative flex-none px-2.5 pb-2.5 pt-1 text-[14px] font-bold ${activeTab === to ? "text-brand" : "text-muted hover:text-ink"}`}>
                {label}
                {activeTab === to && <motion.span layoutId="golf-tab" className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-full bg-brand" />}
              </button>
            ))}
          </nav>
        )}
      </header>
      <Menu open={menu} onClose={() => setMenu(false)} goMy={goMy} mainSite={mainSite} />
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
          <Anno n="M-101" t="확인 창 (예약 진행 중 로고 탭, L-13)" />
        </div>
      </Sheet>
    </>
  );
}

function Menu({ open, onClose, goMy, mainSite }: { open: boolean; onClose: () => void; goMy: () => void; mainSite: () => void }) {
  const { t, list } = useT();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const { lang, setLang } = useApp();
  const go = (to: string) => {
    onClose();
    nav(to);
  };
  const items = [
    { icon: House, label: t("golfHome"), on: () => go("/golf") },
    { icon: MagnifyingGlass, label: t("allPkgs"), on: () => go("/golf/packages") },
    { icon: Ticket, label: t("myBookings"), on: () => { onClose(); goMy(); } },
    { icon: Headset, label: t("support"), on: () => go("/golf/support") },
  ];
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]">
          <motion.div className="absolute inset-0" style={{ background: "var(--scrim)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={t("menu")}
            className="absolute inset-y-0 right-0 flex w-[86%] max-w-[360px] flex-col overflow-y-auto bg-surface"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 38 }}
          >
            <div className="flex h-16 flex-none items-center justify-between px-5">
              <Logo small />
              <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface-2" onClick={onClose} aria-label={t("close")}>
                <X size={22} weight="bold" />
              </button>
            </div>
            <div className="mx-5 mb-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
              <UserCircle size={36} weight="duotone" className="text-brand" />
              {user ? (
                <div className="min-w-0">
                  <p className="truncate font-bold">{t("nameSuffix", { n: user.nameKo })}</p>
                  <p className="truncate text-[13px] text-muted">{user.email}</p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button className="btn btn-sm btn-primary" onClick={() => go("/login?next=%2Fgolf")}>{t("login")}</button>
                  <button className="btn btn-sm btn-ghost" onClick={mainSite}>{t("signup")}</button>
                </div>
              )}
            </div>
            <p className="mx-5 mb-1 flex items-center gap-1.5 text-[12.5px] font-bold text-brand">{t("golf")} <span className="rounded-full bg-[#E11D48] px-1.5 text-[10px] text-white">{t("newBadge")}</span></p>
            <nav className="grid px-3">
              {items.map(({ icon: I, label, on }) => (
                <button key={label} onClick={on} className="flex min-h-[50px] items-center gap-3 rounded-xl px-3 text-left text-[15.5px] font-semibold hover:bg-surface-2">
                  <I size={22} className="text-ink-2" />
                  <span className="flex-1">{label}</span>
                  <CaretRight size={16} className="text-muted" />
                </button>
              ))}
            </nav>
            <p className="mx-5 mb-1 mt-4 text-[12.5px] font-bold text-muted">{t("mainMenu")}</p>
            <div className="mx-5 flex flex-wrap gap-1.5">
              {[...list("cats"), ...list("catsMore")].map((c) => (
                <button key={c} onClick={mainSite} className="fchip min-h-[34px] text-[13px]">{c}</button>
              ))}
            </div>
            <div className="mx-5 mt-5 border-t border-line pt-4">
              <p className="mb-2 text-[13px] font-bold text-muted">{t("language")}</p>
              <div className="grid grid-cols-3 gap-2">
                {(["ja", "ko"] as const).map((l) => (
                  <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)} className="opt justify-center px-2 py-3 font-bold">
                    {l === "ko" ? "한국어" : "日本語"}
                  </button>
                ))}
                <button disabled className="opt justify-center px-2 py-3 text-[13px] font-bold">{t("enSoon")}</button>
              </div>
            </div>
            {user && (
              <button
                className="mx-5 mb-[max(20px,env(safe-area-inset-bottom))] mt-auto flex min-h-[48px] items-center gap-2 pt-6 text-[15px] font-semibold text-muted"
                onClick={() => {
                  logout();
                  onClose();
                }}
              >
                <SignOut size={20} /> {t("logout")}
              </button>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Footer() {
  const { t, list } = useT();
  const nav = useNavigate();
  const toast = useToast((s) => s.show);
  return (
    <footer className="mt-10" style={{ background: "#1A1D24", color: "#E8EAF0" }}>
      <div className="mx-auto grid max-w-[480px] gap-6 px-5 py-8 lg:max-w-[1200px] lg:grid-cols-[1.3fr_1fr_1fr] lg:px-6">
        <div>
          <p className="text-[16px] font-bold tracking-[0.08em]">TRAVENDER</p>
          <p className="mt-2 max-w-[44ch] text-[13px] leading-relaxed text-[#B7BDCB]">{t("footIntro")}</p>
        </div>
        <div>
          <p className="mb-2 text-[12.5px] font-bold text-white">{t("footCats")}</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-[13px] text-[#B7BDCB]">
            {list("cats").map((c) => (
              <li key={c}><button onClick={() => toast(t("mainSiteToast"))} className="hover:text-white">{c}</button></li>
            ))}
            <li><button onClick={() => nav("/golf")} className="font-bold text-white">{t("golf")} <span className="rounded-full bg-[#E11D48] px-1.5 text-[10px]">{t("newBadge")}</span></button></li>
          </ul>
        </div>
        <div className="grid content-between gap-4">
          <ul className="grid gap-1.5 text-[13px] text-[#B7BDCB]">
            {list("footLinks").map((x) => (
              <li key={x}><button onClick={() => toast(t("mainSiteToast"))} className="hover:text-white">{x}</button></li>
            ))}
          </ul>
          <p className="text-[12px] text-[#8A91A3]">© 2026 TRAVENDER. All Rights Reserved.</p>
        </div>
      </div>
    </footer>
  );
}
