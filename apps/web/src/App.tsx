import { Suspense, lazy, useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { useApp, useDb } from "./store";
import { Header } from "./components/Shell";
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

export default function App() {
  const { lang, theme } = useApp();
  const { seeded, seed } = useDb();
  useEffect(() => {
    if (!seeded) seed();
  }, [seeded, seed]);
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
        <ProtoPanel />
        <Toast />
      </HashRouter>
    </MotionConfig>
  );
}
