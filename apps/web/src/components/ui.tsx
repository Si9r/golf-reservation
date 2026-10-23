import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, CheckCircle, Minus, Plus, WarningCircle, X } from "@phosphor-icons/react";
import { useApp, useToast } from "../store";
import { useT } from "../i18n";
import { SET } from "../data";

// ---------- 설계 주석: 설계서의 주황 번호 / 확인 필요(Q) / MVP 단계 ----------
export function Anno({ n, t }: { n: number | string; t: string }) {
  const on = useApp((s) => s.anno);
  if (!on) return null;
  return (
    <span className="anno" title={`${n}. ${t}`} aria-label={`설계 항목 ${n}: ${t}`}>
      {n}
    </span>
  );
}
export function Q({ id, t }: { id: string; t: string }) {
  const on = useApp((s) => s.anno);
  if (!on) return null;
  return <span className="qtag" title={`확인 필요 ${id}: ${t}`}>{id} {t}</span>;
}
export const useStage = () => useApp((s) => s.stage);
export function StageTag({ s }: { s: 2 | 3 }) {
  const on = useApp((x) => x.anno);
  const { L } = useT();
  if (!on) return null;
  return <span className="stagetag">{L === "ko" ? `${s}단계` : `第${s}段階`}</span>;
}
export function ScreenTag({ id, name, refs }: { id: string; name: string; refs?: string }) {
  const on = useApp((s) => s.anno);
  if (!on) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-[12px]" style={{ borderColor: "var(--anno)", color: "var(--anno)" }}>
      <b className="num">{id}</b>
      <span className="font-bold">{name}</span>
      {refs && <span className="text-muted">{refs}</span>}
    </div>
  );
}

// ---------- 이미지 (불러오지 못하면 회색 면) ----------
export function Img({ src, alt, className = "", eager }: { src: string; alt: string; className?: string; eager?: boolean }) {
  const [bad, setBad] = useState(false);
  if (bad) return <div className={`ph ${className}`} role="img" aria-label={alt} />;
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" className={`img-cover ${className}`} onError={() => setBad(true)} />;
}

// ---------- 아래에서 올라오는 창 (PC에서는 가운데 창) ----------
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);
  const { t } = useT();
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
          <motion.div className="absolute inset-0" style={{ background: "var(--scrim)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={id}
            tabIndex={-1}
            className={`relative flex max-h-[88dvh] w-full flex-col rounded-t-[20px] bg-surface outline-none lg:rounded-[20px] ${wide ? "max-w-[640px]" : "max-w-[480px]"}`}
            style={{ boxShadow: "var(--shadow-lg)" }}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 id={id} className="text-[17px] font-bold">{title}</h2>
              <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface-2" onClick={onClose} aria-label={t("close")}>
                <X size={20} weight="bold" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer && <div className="border-t border-line px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ---------- 인원 (+/− 와 직접 입력, V-02: 범위 밖 입력은 가까운 값으로 맞추고 M-001) ----------
export function PeopleInput({ value, onChange, error, max = SET.MAX_PEOPLE, label, anno }: { value: number; onChange: (n: number) => void; error?: string | null; max?: number; label?: string; anno?: ReactNode }) {
  const { t } = useT();
  const id = useId();
  const [text, setText] = useState(String(value));
  const [clamped, setClamped] = useState(false);
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Number(raw.replace(/[^0-9]/g, "")) || 0;
    const c = Math.min(max, Math.max(SET.MIN_PEOPLE, n));
    setClamped(c !== n);
    setText(String(c));
    onChange(c);
  };
  const step = (d: number) => {
    setClamped(false);
    onChange(Math.min(max, Math.max(SET.MIN_PEOPLE, value + d)));
  };
  const msg = error ?? (clamped ? t("M-001", { n: max }) : null);
  return (
    <div className="field relative">
      {anno}
      {label && <label className="label" htmlFor={id}>{label}</label>}
      <div className="flex items-center rounded-xl border-[1.5px] bg-surface" style={{ borderColor: msg ? "var(--bad)" : "var(--line-strong)" }}>
        <button type="button" className="grid h-12 w-14 place-items-center text-ink-2 disabled:opacity-35" onClick={() => step(-1)} disabled={value <= SET.MIN_PEOPLE} aria-label="−1">
          <Minus size={18} weight="bold" />
        </button>
        <input
          id={id}
          inputMode="numeric"
          className="num h-12 min-w-0 flex-1 border-0 bg-transparent text-center text-[18px] font-bold outline-none"
          value={text}
          aria-invalid={!!msg}
          aria-describedby={`${id}-h`}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
        />
        <span className="pr-1 text-[14px] text-muted">{t("peopleN", { n: "" }).trim()}</span>
        <button type="button" className="grid h-12 w-14 place-items-center text-ink-2 disabled:opacity-35" onClick={() => step(1)} disabled={value >= max} aria-label="+1">
          <Plus size={18} weight="bold" />
        </button>
      </div>
      <p id={`${id}-h`} className={msg ? "err" : "help"}>{msg ?? t("peopleHelp")}</p>
    </div>
  );
}

// ---------- 예약 진행 단계 (C-04: 항상 6단계, 호텔 옵션 없는 패키지는 2단계를 건너뜀 표시) ----------
export function Steps({ at, hasHotel }: { at: number; hasHotel: boolean }) {
  const { list } = useT();
  // 호텔 옵션이 없는 패키지는 호텔 단계를 아예 빼고 5단계로 보여 줌 (줄 높이는 모든 화면에서 같음)
  const idx = list("steps").map((_, i) => i).filter((i) => hasHotel || i !== 1);
  const steps = idx.map((i) => list("steps")[i]);
  const short = idx.map((i) => list("stepsShort")[i]);
  const cur = Math.max(0, idx.indexOf(at));
  return (
    <div className="relative" aria-label={`${cur + 1}/${steps.length} ${steps[cur]}`}>
      <Anno n="C-04" t="예약 진행 단계: 칸마다 단계 이름(패키지·호텔·승하차·확인·정보·결제), 현재 단계 굵게, 호텔 옵션 없는 패키지는 호텔 단계 없이 5단계" />
      <div className="flex gap-1.5" aria-hidden="true">
        {steps.map((s, i) => (
          <div key={s} className="min-w-0 flex-1">
            <div className="h-[5px] overflow-hidden rounded-full bg-line">
              <motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: i <= cur ? "100%" : "0%" }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} />
            </div>
            <span className={`mt-1 block truncate text-center text-[11px] leading-tight ${i === cur ? "font-bold text-brand" : i < cur ? "text-ink-2" : "text-muted"}`}>{short[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 단계 화면 머리: ← 버튼 + 진행 단계 줄 (← 아이콘은 화면 왼쪽 끝에 맞추고 단계 줄과 가깝게)
// PC는 모든 단계 화면에서 832px 가운데 → 한 줄 배치 화면의 본문과 일직선, 단계마다 위치 같음
export function StepHead({ at, hasHotel, onBack, disabled, className = "" }: { at: number; hasHotel: boolean; onBack: () => void; disabled?: boolean; className?: string }) {
  const { t } = useT();
  return (
    <div className={`mb-4 flex items-center gap-1.5 lg:mx-auto lg:max-w-[832px] ${className}`}>
      <button className="-ml-2 grid h-9 w-9 flex-none -translate-y-[8px] place-items-center rounded-full hover:bg-surface-2" onClick={onBack} aria-label={t("back")} disabled={disabled}><ArrowLeft size={20} weight="bold" /></button>
      <div className="flex-1"><Steps at={at} hasHotel={hasHotel} /></div>
    </div>
  );
}

// ---------- 하단 고정 버튼 (C-05) ----------
export function BottomBar({ children, width = "step", pcHidden }: { children: ReactNode; width?: "step" | "narrow" | "wide"; pcHidden?: boolean }) {
  return (
    <div className={`fixed inset-x-0 bottom-0 z-[45] border-t border-line bg-surface/95 backdrop-blur ${pcHidden ? "lg:hidden" : ""}`} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className={`relative mx-auto flex max-w-[480px] items-center gap-3 px-4 py-3 ${width === "step" ? "lg:max-w-[1160px] lg:px-6" : width === "narrow" ? "lg:max-w-[880px] lg:px-6" : "lg:max-w-[1200px] lg:px-6"}`}>
        <Anno n="C-05" t="하단 고정 버튼: 활성 / 비활성 / 처리 중" />
        {children}
      </div>
    </div>
  );
}
export function PriceBlock({ main, sub }: { main: string; sub: string }) {
  return (
    <div className="min-w-0 flex-1 leading-tight">
      <p className="num truncate text-[19px] font-extrabold">{main}</p>
      <p className="truncate text-[12px] text-muted">{sub}</p>
    </div>
  );
}

// ---------- 통신·서버 오류 (C-09) ----------
export function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  const { t } = useT();
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} role="alert" className="relative mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3" style={{ background: "var(--bad-soft)", borderColor: "var(--bad-line)" }}>
      <Anno n="C-09" t="통신·서버 오류 (E-SERVER, M-900) + 다시 시도" />
      <WarningCircle size={22} weight="fill" className="mt-0.5 flex-none text-bad" />
      <p className="flex-1 text-[14px] font-semibold text-bad">{t("M-900")}</p>
      <button className="btn btn-xs btn-ghost" onClick={onRetry}>{t("retry")}</button>
    </motion.div>
  );
}

// 데이터를 불러오는 척 (로딩 스켈레톤 + 오류 데모, C-09·C-10)
export function useFakeLoad(key: string, ms = 550) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [n, setN] = useState(0);
  useEffect(() => {
    setState("loading");
    const tm = window.setTimeout(() => {
      const { failNext, set } = useApp.getState();
      if (failNext) {
        set({ failNext: false });
        setState("error");
      } else setState("ok");
    }, ms);
    return () => window.clearTimeout(tm);
  }, [key, n, ms]);
  return { loading: state === "loading", error: state === "error", retry: () => setN((x) => x + 1) };
}

export function CardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <div className="skel h-[150px] rounded-none" />
      <div className="grid gap-2 p-4">
        <div className="skel h-5 w-3/4" />
        <div className="skel h-4 w-1/2" />
        <div className="skel h-6 w-1/3" />
      </div>
    </div>
  );
}

// Google 지도 앱·웹으로 열기 (I-03, 키 불필요). placeId가 있으면 정확한 장소로
export const gmapLink = (q: string, placeId?: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}${placeId ? `&query_place_id=${placeId}` : ""}`;

// ---------- 토스트 ----------
export function Toast() {
  const { msg, tone } = useToast();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {msg && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="flex max-w-[440px] items-start gap-2 rounded-2xl px-4 py-2.5 text-[14px] font-semibold" style={{ background: tone === "bad" ? "var(--bad)" : "var(--ink)", color: "var(--surface)" }}>
            {tone === "bad" ? <WarningCircle size={18} weight="fill" className="mt-0.5 flex-none" /> : <CheckCircle size={18} weight="fill" className="mt-0.5 flex-none" />}
            {msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// 펼침 영역 (높이 애니메이션은 grid-rows 로)
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

// 위에서 아래로 나타나기 (섹션 단위, 정보 위계)
export function Reveal({ children, i = 0, className = "" }: { children: ReactNode; i?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: Math.min(i, 8) * 0.05, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

// **굵게** 표기 지원
export function Rich({ text }: { text: string }) {
  const parts = text.split("**");
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}</>;
}
