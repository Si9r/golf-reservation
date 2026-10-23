import { useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowSquareOut, CaretRight, WarningCircle } from "@phosphor-icons/react";
import { SET, TERMS_URL } from "../data";
import { useT, type Key } from "../i18n";
import { useDb, useDraft, useToast, type Info } from "../store";
import { depView, fShort, hasHotelStep, optionOf, stayHotel, totalPrice, tripEnd, yen, seatsLeft } from "../logic";
import { Anno, BottomBar, Img, PriceBlock, Q, ScreenTag, Sheet, StepHead } from "../components/ui";
import { useFlow } from "./flow";
import { ApiError, USE_API, api, apiDepId } from "../api/client";
import { refreshMonth } from "../api/sync";

// 입력 검사 (상세설계 '입력 검사' V-20~V-25). 검사 시점: 칸에서 벗어날 때 + '다음'을 누를 때
// 동의 항목 (V-25, 운영사 확정): 이 서비스에만 해당하는 취소 규정 · 합승 안내 2개. 이용약관·개인정보는 본 사이트 회원가입 때 동의
const AGREE = ["cancel", "shared"] as const;
const AGREE_LABEL = { cancel: "agreeCancel", shared: "agreeShared" } as const;
// V-21·V-24: 성과 이름 모두 — 영문 대문자 단어 2개 이상, 단어 사이 공백 1칸, 단어 안 하이픈·아포스트로피 허용 (KIM MIN-JI, O'BRIEN SEAN), 60자 이하. 서버 NAME_EN 과 같음 (팀 테스트 10/23)
export const V21 = /^[A-Z]+(?:['-][A-Z]+)*(?: [A-Z]+(?:['-][A-Z]+)*)+$/;
const V22 = /^\+?[0-9][0-9 -]{7,}$/; // 국가번호 포함 숫자·공백·하이픈 8자 이상
const V23 = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const validEn = (s: string) => s.length <= 60 && V21.test(s); // 성 + 이름 (영문 풀네임) — 단어 2개 이상은 V21이 검사
// 영문 성·이름 칸 하나: 대문자 영문, 단어 사이 공백·하이픈·아포스트로피 1개, 1~30자
const VPART = /^[A-Z]+(?:[ '-][A-Z]+)*$/;
export const validPart = (s: string) => s.length >= 1 && s.length <= 30 && VPART.test(s);
export const splitEn = (s: string): [string, string] => { const w = s.trim().split(/\s+/); return [w[0] ?? "", w.slice(1).join(" ")]; };
export const joinEn = ([a, b]: [string, string]) => `${a.trim()} ${b.trim()}`.trim();
export const upper = (s: string) => s.toUpperCase().replace(/[^A-Z '-]/g, "");

export default function InfoForm() {
  const { t, n, L, list } = useT();
  const nav = useNavigate();
  const toast = useToast((s) => s.show);
  const extra = useDb((s) => s.extra);
  const { d, p, redirect, user } = useFlow({ place: true, login: true });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false); // API-08 요청 중 중복 탭 방지 (C-10)
  const busyRef = useRef(false); // 같은 순간 두 번 눌러도 확보 요청은 한 번만 (state 는 다음 화면 갱신 전까지 false 라 막지 못함)
  const [terms, setTerms] = useState<null | (typeof AGREE)[number]>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  if (redirect) return <Navigate to={redirect} replace />;

  // 회원 정보로 채움 (동반자는 기본 '나중에 입력')
  // 회원 정보로 채움. 영문 이름은 성·이름 두 칸, 동반자 명단은 필수 (나중에 입력 없음)
  const f: Info = d.info ?? { nameKo: user!.nameKo, nameEn: user!.nameEn, cc: user!.cc, phone: user!.phone, email: user!.email, companions: [], agree: { cancel: false, shared: false } };
  const en: [string, string] = f.en ?? splitEn(f.nameEn);
  const compN = d.people - 1;
  const compEn: [string, string][] = Array.from({ length: compN }, (_, i) => f.compEn?.[i] ?? (f.companions[i] ? splitEn(f.companions[i]) : ["", ""]));
  const set = (p: Partial<Info>) => useDraft.getState().patch({ info: { ...f, ...p } });
  const blur = (k: string) => setTouched((x) => ({ ...x, [k]: true }));

  const nameKo = f.nameKo.trim();
  const errs: Record<string, string | null> = {
    nameKo: nameKo.length >= 1 && nameKo.length <= 30 ? null : t("M-161"), // V-20
    nameEn: en.every(validPart) ? null : en.some((x) => x.trim()) ? t("M-162") : t("M-161"), // V-21 성·이름 모두 필수
    phone: V22.test(`${f.cc} ${f.phone}`.trim()) && V22.test(f.phone) ? null : f.phone ? t("M-163") : t("M-161"), // V-22
    email: V23.test(f.email.trim()) ? null : f.email ? t("M-164") : t("M-161"), // V-23
    comps: compN === 0 || compEn.every((x) => x.every(validPart)) ? null : compEn.some((x) => x.some((y) => y.trim())) ? t("M-162") : t("M-161"), // V-24 동반자 전원 성·이름 필수
    agree: AGREE.every((k) => f.agree[k]) ? null : t("M-165"), // V-25
  };
  const show = (k: string) => (tried || touched[k] ? errs[k] : null);
  const ok = Object.values(errs).every((e) => !e);
  const submit = () => {
    setTried(true);
    if (!ok) {
      toast(t("M-160"), "bad");
      const first = Object.keys(errs).find((k) => errs[k]); // T-16: 첫 번째 오류 칸으로
      const el = first ? refs.current[first] : null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      (el?.querySelector("input,button") as HTMLElement | null)?.focus({ preventScroll: true });
      return;
    }
    // L-07 좌석 임시확보: 잔여석 ≥ 인원 확인 (아니면 E-SEAT / M-120)
    const v = depView(p.id, d.dep!, d.people, extra);
    if (v.state === "unavailable") {
      toast(t("M-120", { s: v.seats, n: d.people }), "bad");
      return;
    }
    const info = { ...f, nameEn: joinEn(en), companions: compEn.map(joinEn) };
    if (USE_API) {
      // API-08 좌석 임시확보 (서버가 출발편을 잠그고 잔여석 확인). 실패하면 E-SEAT → 서버 최신 잔여석으로 M-120
      if (busy || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      api.hold({ departureId: apiDepId(p.id, d.dep!), people: d.people })
        .then((h) => {
          const exp = /Z|[+-]\d\d:?\d\d$/.test(h.expiresAt) ? h.expiresAt : h.expiresAt + "Z"; // 서버는 UTC
          d.patch({ info, holdId: h.holdId, holdUntil: Date.parse(exp), holdPeople: d.people });
          nav("/golf/book/pay"); // T-15
        })
        .catch(async (e) => {
          if (!(e instanceof ApiError && e.body.error === "E-SEAT")) return toast(t("M-900"), "bad");
          await refreshMonth(p.id, d.dep!.slice(0, 7));
          toast(t("M-120", { s: seatsLeft(p.id, d.dep!, extra), n: d.people }), "bad");
        })
        .finally(() => { busyRef.current = false; setBusy(false); });
      return;
    }
    d.patch({ info, holdUntil: Date.now() + SET.HOLD_MINUTES * 60000, holdPeople: d.people });
    nav("/golf/book/pay"); // T-15
  };
  const allAgree = AGREE.every((k) => f.agree[k]);
  const total = totalPrice(p, d.opt, d.people, d.singles).total;

  return (
    <div className="page step">
      <ScreenTag id="S-09" name="정보 입력" refs="FN-19~21 · V-20~V-25 · L-07 · API-08 · T-15, T-16" />
      <StepHead at={4} hasHotel={hasHotelStep(p)} onBack={() => nav("/golf/book/review")} />
      <h1 className="mb-4 text-[22px] font-bold">{t("infoT")}</h1>
      {tried && !ok && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-2xl border p-3 text-[14px] font-semibold text-bad" style={{ background: "var(--bad-soft)", borderColor: "var(--bad-line)" }}>
          <WarningCircle size={18} weight="fill" /> {t("M-160")}
        </p>
      )}

      {/* PC: 왼쪽 입력 · 오른쪽 예약 요약 (확인 화면과 같은 2칸) */}
      <div className="grid lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-6">
      <div>
      <section className="relative card grid gap-4 p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-[18px] font-bold">{t("repT")}</h1>
          <span className="chip gray">{t("filled")}</span>
        </div>
        <p className="-mt-2 text-[12.5px] text-muted">{t("reqNote")}</p>
        <Field id="nameKo" n={1} anno="대표자 이름(한글) booking_member.name_ko, 회원 정보로 채움 (V-20: 1~30자)" label={t("nameKo")} err={show("nameKo")} refs={refs}>
          <input id="f-nameKo" className="input" value={f.nameKo} maxLength={30} aria-invalid={!!show("nameKo")} onBlur={() => blur("nameKo")} onChange={(e) => set({ nameKo: e.target.value })} autoComplete="name" />
        </Field>
        <Field id="nameEn" n={2} anno="대표자 영문 이름 (V-21): 성·이름 두 칸 모두 필수, 자동 대문자, 영문·공백·하이픈 1~30자. 보낼 때 '성 이름'" label={t("nameEn")} err={show("nameEn")} refs={refs}>
          <div className="grid grid-cols-2 gap-2">
            <input id="f-nameEn" className="input uppercase" value={en[0]} maxLength={30} aria-label={t("enSur")} placeholder={t("enSurPh")} aria-invalid={!!show("nameEn") && !validPart(en[0])} onBlur={() => blur("nameEn")} onChange={(e) => set({ en: [upper(e.target.value), en[1]] })} autoComplete="family-name" />
            <input className="input uppercase" value={en[1]} maxLength={30} aria-label={t("enGiven")} placeholder={t("enGivenPh")} aria-invalid={!!show("nameEn") && !validPart(en[1])} onBlur={() => blur("nameEn")} onChange={(e) => set({ en: [en[0], upper(e.target.value)] })} autoComplete="given-name" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[12px] text-muted"><span>{t("enSur")}</span><span>{t("enGiven")}</span></div>
        </Field>
        <Field id="phone" n={3} anno="연락처 (V-22: 국가번호 포함 숫자·공백·하이픈 8자 이상)" label={t("phone")} err={show("phone")} refs={refs}>
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <select className="input pr-2" value={f.cc} onChange={(e) => set({ cc: e.target.value })} aria-label="Country code">
              {["+82", "+81", "+86", "+886", "+1"].map((c) => <option key={c}>{c}</option>)}
            </select>
            <input id="f-phone" className="input num" inputMode="tel" value={f.phone} aria-invalid={!!show("phone")} onBlur={() => blur("phone")} onChange={(e) => set({ phone: e.target.value.replace(/[^\d\s-]/g, "") })} autoComplete="tel-national" />
          </div>
        </Field>
        <Field id="email" n={4} anno="이메일 (V-23): 확인서·출발 확정·취소 안내 주소" label={t("email")} err={show("email")} help={t("emailNote")} refs={refs}>
          <input id="f-email" className="input" type="email" value={f.email} aria-invalid={!!show("email")} onBlur={() => blur("email")} onChange={(e) => set({ email: e.target.value })} autoComplete="email" />
        </Field>
      </section>

      {compN > 0 && (
        <section ref={(el) => { refs.current.comps = el; }} className="relative mt-4 card grid gap-3 p-5">
          <Anno n={5} t="동반자 명단 × (인원−1) (V-24): 필수. 사람마다 영문 성·이름 두 칸 (자동 대문자)" />
          <h2 className="flex flex-wrap items-center gap-2 text-[16px] font-bold"><span>{t("compT")}<Req /></span> <span className="text-[13px] font-normal text-muted">{t("peopleN", { n: compN })}</span> <Q id="Q-21" t="필수 수집 항목" /></h2>
          <p className="help -mt-1">{t("compNote")}</p>
          <div className="grid gap-3">
            {compEn.map((c, i) => (
              <div key={i} className="field">
                <span className="text-[13px] font-semibold text-ink-2">{t("compN", { i: i + 1 })}</span>
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1].map((k) => (
                    <input key={k} className="input uppercase" value={c[k]} maxLength={30} aria-label={`${t("compN", { i: i + 1 })} ${t(k ? "enGiven" : "enSur")}`} placeholder={t(k ? "enGivenPh" : "enSurPh")} aria-invalid={(tried || touched.comps) && !validPart(c[k])} onBlur={() => blur("comps")}
                      onChange={(e) => { const next = compEn.map((x) => [...x] as [string, string]); next[i][k] = upper(e.target.value); set({ compEn: next }); }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {show("comps") && <p className="err">{show("comps")}</p>}
        </section>
      )}

      {/* 대표자·동반자를 다 적은 뒤 총 인원 확인 */}
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-brand-soft px-5 py-3.5">
        <span className="text-[14px] font-semibold text-ink-2">{t("totalPeople")}</span>
        <span className="text-right">
          <b className="num text-[16px]">{t("peopleN", { n: d.people })}</b>
          <span className="block text-[12.5px] text-muted">{t("peopleSplit", { c: compN })}</span>
        </span>
      </div>

      <section ref={(el) => { refs.current.agree = el; }} className="relative mt-4 card grid gap-1 p-5">
        <Anno n={6} t="동의 2개 (V-25): 전체 동의 / 취소 규정 / 합승 안내 (모두 필수). 이용약관·개인정보는 본 사이트 기준 → 아래 링크 (TERMS_URL)" />
        <h2 className="mb-1 text-[16px] font-bold">{t("termsT")}<Req /></h2>
        <label className="flex min-h-[48px] items-center gap-3 border-b border-line pb-2 text-[15px] font-bold">
          <input type="checkbox" className="check" checked={allAgree} onChange={(e) => set({ agree: { cancel: e.target.checked, shared: e.target.checked } })} />
          {t("agreeAll")}
        </label>
        {AGREE.map((k) => (
          <div key={k} className="flex min-h-[44px] items-center gap-3">
            <label className="flex flex-1 items-center gap-3 text-[14px]">
              <input type="checkbox" className="check" checked={f.agree[k]} onChange={(e) => set({ agree: { ...f.agree, [k]: e.target.checked } })} />
              {t(AGREE_LABEL[k])}
            </label>
            <button className="flex items-center text-[13px] font-semibold text-muted underline underline-offset-2" onClick={() => setTerms(k)}>{t("view")}<CaretRight size={12} /></button>
          </div>
        ))}
        {show("agree") && <p className="err mt-1">{show("agree")}</p>}
        <a className="mt-2 inline-flex items-center gap-1 text-[12px] text-muted underline underline-offset-2" href={TERMS_URL} target="_blank" rel="noreferrer">
          {t("siteTerms")} <ArrowSquareOut size={12} />
        </a>
      </section>

      </div>
      <aside className="hidden lg:sticky lg:top-24 lg:grid lg:gap-3">
        <div className="card overflow-hidden">
          <div className="relative aspect-[16/7]"><Img src={p.photos[0]} alt={n(p.name)} className="absolute inset-0 h-full w-full" /></div>
          <div className="grid gap-2 p-4 text-[13.5px]">
            <b className="text-[15px] font-extrabold leading-snug">{n(p.name)}</b>
            <p className="flex flex-wrap items-center gap-2 text-ink-2">{fShort(d.dep!, L)} ~ {fShort(tripEnd(p, d.dep!), L)} <span className="badge brand">{t("peopleN", { n: d.people })}</span></p>
            {(() => { const h = stayHotel(p, d.opt); const o = optionOf(d.opt); return <p className="text-ink-2">{h ? `${n(h.name)} · ${o && !o.hotel ? n(o.sub) : n(h.room)}` : o?.none ? n(o.name) : t("noHotel")}</p>; })()}
            <p className="text-ink-2">{t("pick")} · {d.pick ? n(d.pick.name) : "-"} · {t("wishAt", { t: d.pickTime ?? "-" })}</p>
            <div className="mt-1 flex items-baseline justify-between border-t border-line pt-3">
              <span className="font-semibold">{t("totalL", { n: d.people })}</span>
              <span className="num text-[22px] font-extrabold text-brand">{yen(total)}</span>
            </div>
          </div>
        </div>
        <button className="btn btn-primary w-full" disabled={busy} onClick={submit}>{t("next")}</button>
      </aside>
      </div>

      <Sheet open={!!terms} onClose={() => setTerms(null)} title={terms ? t(AGREE_LABEL[terms]) : ""}>
        {terms === "cancel" && <p className="mb-3 text-[13px] text-muted">{t("termsBody")}</p>}
        <ul className="grid list-disc gap-2 pl-5 text-[14px] text-ink-2">{terms && list(`terms_${terms}` as Key).map((x) => <li key={x}>{x}</li>)}</ul>
        {terms && <button className="btn btn-primary mt-5 w-full" onClick={() => { set({ agree: { ...f.agree, [terms]: true } }); setTerms(null); }}>{t("agreeOne")}</button>}
      </Sheet>

      <BottomBar pcHidden>
        <span className="absolute -top-3 left-3"><Anno n={7} t="하단 다음: 검사 통과 시 좌석 임시확보(L-07, API-08) 후 S-10 (T-15) / 오류 → 첫 오류 칸으로 (T-16, M-160)" /></span>
        <PriceBlock main={yen(total)} sub={n(p.name)} />
        <button className="btn btn-primary min-w-[140px]" onClick={submit}>{t("next")}</button>
      </BottomBar>
    </div>
  );
}

export function Req() {
  const { t, L } = useT();
  return L === "ja"
    ? <span className="ml-1.5 inline-block rounded px-1.5 py-px align-middle text-[11px] font-bold text-white" style={{ background: "var(--bad)" }}>{t("reqMark")}</span>
    : <span className="ml-0.5 font-bold text-bad" aria-hidden>{t("reqMark")}</span>;
}

function Field({ id, n, anno, label, err, help, children, refs }: { id: string; n: number; anno: string; label: string; err: string | null; help?: string; children: ReactNode; refs: MutableRefObject<Record<string, HTMLElement | null>> }) {
  return (
    <div className="field relative" ref={(el) => { refs.current[id] = el; }}>
      <Anno n={n} t={anno} />
      <label className="label" htmlFor={`f-${id}`}>{label}<Req /><span className="sr-only"> (required)</span></label>
      {children}
      {err ? <p className="err">{err}</p> : help ? <p className="help">{help}</p> : null}
    </div>
  );
}
