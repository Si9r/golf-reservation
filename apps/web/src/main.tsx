import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// 화면에서 쓰는 굵기(400~900)를 모두 받음. 없는 굵기는 브라우저가 억지로 두껍게 그려 본 사이트(Noto Sans JP 300~900)와 달라 보임 (10/30)
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "@fontsource/noto-sans-kr/600.css";
import "@fontsource/noto-sans-kr/700.css";
import "@fontsource/noto-sans-kr/800.css"; // 카드 제목 강조 (font-extrabold)
import "@fontsource/noto-sans-kr/900.css"; // 큰 제목 (font-black)
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/600.css";
import "@fontsource/noto-sans-jp/700.css";
import "@fontsource/noto-sans-jp/800.css";
import "@fontsource/noto-sans-jp/900.css";
import "@fontsource-variable/inter";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
