import { Suspense, lazy, useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { DESIGN_TOOLS, useApp, useDb } from "./store";
import { loadMe } from "./api/sync";
import { Header } from "./components/Shell";
import { SiteFooter } from "./components/SiteFrame";
import { ProtoPanel } from "./components/ProtoPanel";
import { Toast } from "./components/ui";
import Home from "./screens/Home";
const List = lazy(() => import("./screens/List"));
const Detail = lazy(() => import("./screens/Detail"));
const Compare = lazy(() => import("./screens/Compare"));
const HotelOption = lazy(() => import("./screens/HotelOption"));
const Place = lazy(() => import("./screens/Place"));
const Review = lazy(() => import("./screens/Review"));
const InfoForm = lazy(() => import("./screens/InfoForm"));
const Pay = lazy(() => import("./screens/Pay"));
const Done = lazy(() => import("./screens/Done"));
const PayReturn = lazy(() => import("./screens/PayReturn"));
const MyList = lazy(() => import("./screens/MyList"));
const MyDetail = lazy(() => import("./screens/MyDetail"));
const Support = lazy(() => import("./screens/Support"));
const Login = lazy(() => import("./screens/Login"));

// URL은 화면설계서 v0.2 '화면 목록'의 제안 URL을 따름
function Pages() {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [loc.pathname]);
  return (
    <main key={loc.pathname} className="page-in">
        <Suspense fallback={<div className="page"><div className="skel h-[60dvh] rounded-2xl" /></div>}>
        <Routes location={loc}>
          <Route path="/" element={<Navigate to="/golf" replace />} />
          <Route path="/golf" element={<Home />} />
          <Route path="/golf/packages" element={<List />} />
          <Route path="/golf/packages/:id" element={<Detail />} />
          <Route path="/golf/compare" element={<Compare />} />
          <Route path="/golf/book/hotel" element={<HotelOption />} />
          <Route path="/golf/book/place" element={<Place />} />
          <Route path="/golf/book/review" element={<Review />} />
          <Route path="/golf/book/info" element={<InfoForm />} />
          <Route path="/golf/book/pay" element={<Pay />} />
          <Route path="/golf/bookings/:no/complete" element={<Done />} />
          <Route path="/golf/payment/return" element={<PayReturn />} />
          <Route path="/golf/my" element={<MyList />} />
          <Route path="/golf/my/:no" element={<MyDetail />} />
          <Route path="/golf/support" element={<Support />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/golf" replace />} />
        </Routes>
        </Suspense>
    </main>
  );
}

// PC 가로 목록(.hscroll: 칩·월 탭·카드 줄): 마우스로 잡고 좌우로 끌기 + 휠로 좌우 이동. 끌었으면 손을 뗄 때 클릭은 무시
function useHScrollMouse() {
  useEffect(() => {
    let el: HTMLElement | null = null;
    let startX = 0;
    let startL = 0;
    let moved = false;
    const canScroll = (t: HTMLElement) => t.scrollWidth > t.clientWidth + 1;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const t = (e.target as Element).closest<HTMLElement>(".hscroll");
      if (!t || !canScroll(t)) return;
      el = t;
      startX = e.clientX;
      startL = t.scrollLeft;
      moved = false;
    };
    const move = (e: PointerEvent) => {
      if (!el) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 5) {
        moved = true;
        el.classList.add("dragging");
      }
      if (moved) el.scrollLeft = startL - dx;
    };
    const up = () => {
      if (!el) return;
      el.classList.remove("dragging");
      if (moved) {
        const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener("click", stop, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
      }
      el = null;
    };
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const t = (e.target as Element).closest<HTMLElement>(".hscroll");
      if (!t || !canScroll(t)) return;
      const atStart = t.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = t.scrollLeft + t.clientWidth >= t.scrollWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return; // 끝에 닿으면 화면을 위아래로
      t.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    document.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.addEventListener("wheel", wheel, { passive: false });
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("wheel", wheel);
    };
  }, []);
}

export default function App() {
  const { lang, theme } = useApp();
  useHScrollMouse();
  const { seeded, seed } = useDb();
  useEffect(() => {
    if (!seeded) seed();
  }, [seeded, seed]);
  useEffect(() => {
    void loadMe(); // API 모드: 본 사이트 세션으로 로그인 상태 맞추기 (API-18)
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.body.classList.toggle("ja", lang === "ja");
    document.title = lang === "ko" ? "홋카이도 버스 골프 패키지 | TRAVENDER" : "北海道バスゴルフパッケージ | TRAVENDER";
  }, [lang]);
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <Header />
        <Pages />
        <SiteFooter />
        {DESIGN_TOOLS && <ProtoPanel />}
        <Toast />
      </HashRouter>
    </MotionConfig>
  );
}
