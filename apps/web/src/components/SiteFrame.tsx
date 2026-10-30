import { useLocation } from "react-router-dom";
import { CaretDown, InstagramLogo, XLogo } from "@phosphor-icons/react";
import { SITE_URL } from "../data";
import { useT } from "../i18n";

// 본 사이트(travender-hokkaido.com) 상단·하단 틀을 그대로 씀 (팀 결정 10/29). 로고 아래 작은 글씨만 골프 페이지용 GOLF

// 본 사이트 로고: 핀 + TRAVENDER 글자 (본 사이트 SVG 그대로)
function Pin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 659.25 835.84" aria-hidden="true">
      <g fill="currentColor">
        <path d="M222.51,496.39c35.58,73.48,81.71,136.87,107.12,169.36,25.4-32.49,71.53-95.88,107.12-169.36h-214.24Z" />
        <path d="M535.92,315.57c0,40.09-8.16,84.04-24.27,130.83h100.72c28.32-42.98,46.89-87.63,46.89-130.83,0-24.25-2.64-47.89-7.62-70.65h-119.72c2.64,23.02,4,46.66,4,70.65Z" />
        <path d="M479.73,70.44c19.82,36.03,34.75,78.41,44.23,124.48h112.51C599.78,101.68,521.83,29.23,425.1,0c20.43,17.97,38.77,41.6,54.63,70.44Z" />
        <path d="M491.88,496.39c-13.7,30.89-30.52,62.81-50.23,95.31-15.01,24.73-29.95,46.96-43.35,65.76,51.3-38.23,121.7-96.02,176.45-161.07h-82.87Z" />
      </g>
      <g fill="#e60044">
        <path d="M217.61,591.7c-19.72-32.5-36.53-64.42-50.23-95.31h-82.87c54.75,65.05,125.15,122.84,176.45,161.07-13.39-18.8-28.34-41.03-43.34-65.76Z" />
        <path d="M123.33,315.57c0-23.99,1.36-47.63,4-70.65H7.62c-4.97,22.76-7.62,46.4-7.62,70.65,0,43.2,18.57,87.85,46.89,130.83h100.72c-16.11-46.79-24.27-90.74-24.27-130.83Z" />
        <path d="M135.29,194.92c9.48-46.07,24.41-88.45,44.23-124.48C195.38,41.6,213.73,17.97,234.15,0,137.43,29.23,59.47,101.68,22.78,194.92h112.51Z" />
        <path d="M472.64,194.92C448.13,87.79,392.5,0,329.63,0s-118.5,87.79-143.01,194.92h286.02Z" />
        <circle cx="329.63" cy="777.97" r="57.87" />
      </g>
    </svg>
  );
}

function Word({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 659.25 62.73" fill="currentColor" role="img" aria-label="TRAVENDER">
      <path d="M20.79,9.86H0V0h53.23v9.86h-20.79v52.87h-11.65V9.86Z" />
      <path d="M116.14,62.73l-12.82-18.37c-.81.09-1.61.09-2.42.09h-14.16v18.28h-11.65V0h25.81c16.49,0,26.71,8.42,26.71,22.31,0,9.5-4.84,16.49-13.35,19.8l14.43,20.61h-12.55ZM100.37,9.86h-13.62v25h13.62c10.22,0,15.5-4.66,15.5-12.55s-5.29-12.46-15.5-12.46Z" />
      <path d="M194.24,48.21h-31.37l-6.18,14.52h-12.01L172.91,0h11.47l28.32,62.73h-12.19l-6.27-14.52ZM190.39,39.07l-11.83-27.42-11.74,27.42h23.57Z" />
      <path d="M282.97,0l-27.33,62.73h-11.47L216.74,0h12.64l20.88,48.39L271.32,0h11.65Z" />
      <path d="M348.94,52.96v9.77h-47.05V0h45.79v9.77h-34.14v16.31h30.29v9.59h-30.29v17.3h35.4Z" />
      <path d="M429.66,0v62.73h-9.59l-34.59-42.48v42.48h-11.56V0h9.59l34.59,42.48V0h11.56Z" />
      <path d="M454.22,0h27.42c20.34,0,34.23,12.55,34.23,31.36s-13.89,31.37-34.23,31.37h-27.42V0ZM481.1,52.87c13.98,0,23.03-8.51,23.03-21.51s-9.05-21.51-23.03-21.51h-15.24v43.02h15.24Z" />
      <path d="M583.26,52.96v9.77h-47.05V0h45.79v9.77h-34.14v16.31h30.29v9.59h-30.29v17.3h35.4Z" />
      <path d="M646.71,62.73l-12.81-18.37c-.81.09-1.61.09-2.42.09h-14.16v18.28h-11.65V0h25.81c16.49,0,26.71,8.42,26.71,22.31,0,9.5-4.84,16.49-13.35,19.8l14.43,20.61h-12.55ZM630.94,9.86h-13.62v25h13.62c10.22,0,15.5-4.66,15.5-12.55s-5.29-12.46-15.5-12.46Z" />
    </svg>
  );
}

// 골프 페이지 로고: 본 사이트 로고 + GOLF
export function GolfLogo({ big }: { big?: boolean }) {
  return (
    <span className="flex items-center gap-2.5" aria-label="TRAVENDER Golf">
      <Pin className={big ? "h-10 w-auto flex-none" : "h-8 w-auto flex-none sm:h-9"} />
      <span className={`flex flex-col ${big ? "gap-1.5" : "gap-1"}`}>
        <Word className={big ? "h-4 w-auto" : "h-[11px] w-auto sm:h-3"} />
        <span className={`font-black leading-none tracking-[0.32em] ${big ? "text-[12px] text-[#b9a4ff]" : "text-[10px] text-brand sm:text-[11px]"}`}>GOLF</span>
      </span>
    </span>
  );
}

// 본 사이트 주 메뉴 (PC 상단 가운데)
export function SiteNav() {
  const { t } = useT();
  const links: [string, string][] = [[t("siteGourmet"), "/gourmet"], [t("siteNight"), "/nightlife"], [t("siteEvents"), "/events"], [t("siteTourism"), "/tourism"]];
  return (
    <nav className="hidden flex-1 items-center justify-center gap-7 text-[14px] font-medium text-ink-2 lg:flex" aria-label="TRAVENDER">
      {links.map(([label, path]) => <a key={path} href={SITE_URL + path} className="hover:text-ink">{label}</a>)}
      <a href={SITE_URL + "/"} className="flex items-center gap-1 hover:text-ink">{t("siteMore")} <CaretDown size={12} weight="bold" /></a>
    </nav>
  );
}

// 본 사이트 하단 (결제·승하차처럼 화면 아래에 버튼이 붙는 예약 단계에서는 숨김)
export function SiteFooter() {
  const { t } = useT();
  const loc = useLocation();
  if (loc.pathname.startsWith("/golf/book") || loc.pathname.startsWith("/login") || loc.pathname.startsWith("/golf/payment")) return null;
  const hasBar = /^\/golf\/packages\/[^/]+$/.test(loc.pathname); // 패키지 상세: 휴대폰 아래 고정 바가 가리지 않게 여백
  const col = (title: string, items: [string, string][]) => (
    <div className="grid content-start gap-3">
      <b className="text-[14px] text-white">{title}</b>
      {items.map(([label, path]) => <a key={path} href={SITE_URL + path} className="text-[14px] text-[#b8bfcc] hover:text-white">{label}</a>)}
    </div>
  );
  return (
    <footer className="mt-12 bg-[#1a1d24] text-white lg:mt-16">
      <div className={`mx-auto max-w-[1280px] px-4 pt-12 sm:px-6 lg:pb-10 lg:pt-[72px] ${hasBar ? "pb-32" : "pb-10"}`}>
        {/* 휴대폰: 로고·소개 한 줄 + 메뉴 두 칸 나란히 (본 사이트와 같게) / PC: 세 칸 */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-[2fr_1fr_1fr] sm:gap-10">
          <div className="col-span-2 grid content-start gap-5 sm:col-span-1">
            <a href="#/golf" className="text-white"><GolfLogo big /></a>
            <p className="max-w-[340px] text-[14px] leading-relaxed text-[#b8bfcc]">{t("siteTagline")}</p>
            <span className="flex gap-2.5">
              <a href="#" aria-label="X" className="grid h-9 w-9 place-items-center rounded-[10px] bg-white/10"><XLogo size={16} /></a>
              <a href="#" aria-label="Instagram" className="grid h-9 w-9 place-items-center rounded-[10px] bg-white/10"><InstagramLogo size={16} /></a>
            </span>
          </div>
          {col(t("siteCats"), [[t("siteGourmet"), "/gourmet"], [t("siteNight2"), "/nightlife"], [t("siteCafe"), "/cafe"], [t("siteTourism"), "/tourism"], [t("siteHotels"), "/hotels"]])}
          {col(t("siteInfo"), [[t("siteCompany"), "/company"], [t("siteContact"), "/contact"], [t("sitePrivacy"), "/privacy"], [t("siteTermsL"), "/terms"]])}
        </div>
        <p className="mt-12 border-t border-white/10 pt-7 text-center text-[13px] text-[#8a93a6]">© 2026 TRAVENDER. All Rights Reserved.</p>
      </div>
    </footer>
  );
}
