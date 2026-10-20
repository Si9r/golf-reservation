import { useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowSquareOut, CaretRight, WarningCircle } from "@phosphor-icons/react";
import { SET, TERMS_URL } from "../data";
import { useT, type Key } from "../i18n";
import { useDb, useDraft, useToast, type Info } from "../store";
import { depView, totalPrice, yen } from "../logic";
import { Anno, BottomBar, Collapse, PriceBlock, Q, ScreenTag, Sheet, Steps } from "../components/ui";
import { useFlow } from "./flow";

// 입력 검사 (상세설계 '입력 검사' V-20~V-25). 검사 시점: 칸에서 벗어날 때 + '다음'을 누를 때
// 동의 항목 (V-25, 운영사 확정): 이 서비스에만 해당하는 취소 규정 · 합승 안내 2개. 이용약관·개인정보는 본 사이트 회원가입 때 동의
const AGREE = ["cancel", "shared"] as const;
const AGREE_LABEL = { cancel: "agreeCancel", shared: "agreeShared" } as const;
export const V21 = /^[A-Z][A-Z ]*[A-Z]$/; // 영문 대문자와 공백만, 2~60자, 앞뒤 공백 없음
const V22 = /^\+?[0-9][0-9 -]{7,}$/; // 국가번호 포함 숫자·공백·하이픈 8자 이상
const V23 = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const validEn = (s: string) => s.length >= 2 && s.length <= 60 && V21.test(s);

export default function InfoForm() {
  const { t, n, list } = useT();
  const nav = useNavigate();
  const toast = useToast((s) => s.show);
  const extra = useDb((s) => s.extra);
  const { d, p, redirect, user } = useFlow({ place: true, login: true });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState(false);
  const [terms, setTerms] = useState<null | (typeof AGREE)[number]>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  if (redirect) return <Navigate to={redirect} replace />;

  // 회원 정보로 채움 (동반자는 기본 '나중에 입력')
  const f: Info = d.info ?? { nameKo: user!.nameKo, nameEn: user!.nameEn, cc: user!.cc, phone: user!.phone, email: user!.email, companions: [], later: true, agree: { cancel: false, shared: false } };
  const compN = d.people - 1;
  const comps = Array.from({ length: compN }, (_, i) => f.companions[i] ?? "");
  const set = (p: Partial<Info>) => useDraft.getState().patch({ info: { ...f, ...p } });
  const blur = (k: string) => setTouched((x) => ({ ...x, [k]: true }));

  const nameKo = f.nameKo.trim();
  const errs: Record<string, string | null> = {
    nameKo: nameKo.length >= 1 && nameKo.length <= 30 ? null : t("M-161"), // V-20
    nameEn: validEn(f.nameEn) ? null : f.nameEn ? t("M-162") : t("M-161"), // V-21
    phone: V22.test(`${f.cc} ${f.phone}`.trim()) && V22.test(f.phone) ? null : f.phone ? t("M-163") : t("M-161"), // V-22
    email: V23.test(f.email.trim()) ? null : f.email ? t("M-164") : t("M-161"), // V-23
    comps: f.later || compN === 0 || comps.every((c) => validEn(c)) ? null : t("M-162"), // V-24
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
    d.patch({ info: { ...f, nameEn: f.nameEn.trim(), companions: f.later ? [] : comps.map((c) => c.trim()) }, holdUntil: Date.now() + SET.HOLD_MINUTES * 60000, holdPeople: d.people });
    nav("/golf/book/pay"); // T-15
  };
  const allAgree = AGREE.every((k) => f.agree[k]);
  const total = totalPrice(p, d.opt, d.people, d.singles).total;

  return (
    <div className="page step">
      <ScreenTag id="S-09" name="정보 입력" refs="FN-19~21 · V-20~V-25 · L-07 · API-08 · T-15, T-16" />
      <div className="mb-1 flex items-center gap-3">
        <button className="grid h-10 w-10 flex-none place-items-center rounded-full hover:bg-surface-2" onClick={() => nav("/golf/book/review")} aria-label={t("back")}><ArrowLeft size={20} weight="bold" /></button>
        <div className="flex-1"><Steps at={4} hasHotel={p.opts.length > 0} /></div>
      </div>
      {tried && !ok && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-2xl border p-3 text-[14px] font-semibold text-bad" style={{ background: "var(--bad-soft)", borderColor: "var(--bad-line)" }}>
          <WarningCircle size={18} weight="fill" /> {t("M-160")}
        </p>
      )}

      <section className="relative card grid gap-4 p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-[18px] font-bold">{t("repT")}</h1>
          <span className="chip gray">{t("filled")}</span>
        </div>
        <Field id="nameKo" n={1} anno="대표자 이름(한글) booking_member.name_ko, 회원 정보로 채움 (V-20: 1~30자)" label={t("nameKo")} err={show("nameKo")} refs={refs}>
          <input id="f-nameKo" className="input" value={f.nameKo} maxLength={30} aria-invalid={!!show("nameKo")} onBlur={() => blur("nameKo")} onChange={(e) => set({ nameKo: e.target.value })} autoComplete="name" />
        </Field>
        <Field id="nameEn" n={2} anno="대표자 영문 이름 (V-21: 자동 대문자, 영문 대문자·공백 2~60자)" label={t("nameEn")} err={show("nameEn")} refs={refs}>
          <input id="f-nameEn" className="input uppercase" value={f.nameEn} maxLength={60} aria-invalid={!!show("nameEn")} onBlur={() => { set({ nameEn: f.nameEn.trim() }); blur("nameEn"); }} onChange={(e) => set({ nameEn: e.target.value.toUpperCase() })} autoComplete="off" placeholder="KIM MINJUN" />
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
        <div className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
          <span className="text-[14px] font-semibold text-ink-2">{t("totalPeople")}</span>
          <b className="num">{t("peopleN", { n: d.people })}</b>
        </div>
      </section>

      {compN > 0 && (
        <section ref={(el) => { refs.current.comps = el; }} className="relative mt-4 card grid gap-3 p-5">
          <Anno n={5} t="동반자 명단 × (인원−1) (V-24): 기본 '나중에 입력' 체크, 해제하면 칸 표시 (출발 7일 전 마감)" />
          <h2 className="flex flex-wrap items-center gap-2 text-[16px] font-bold">{t("compT")} <span className="text-[13px] font-normal text-muted">{t("peopleN", { n: compN })}</span> <Q id="Q-21" t="필수 수집 항목" /></h2>
          <label className="flex min-h-[44px] items-center gap-3 text-[14px] font-semibold">
            <input type="checkbox" className="check" checked={f.later} onChange={(e) => set({ later: e.target.checked })} />
            {t("later")}
          </label>
          <Collapse open={!f.later}>
            <div className="grid gap-2.5 pt-1">
              {comps.map((c, i) => (
                <label key={i} className="field">
                  <span className="text-[13px] font-semibold text-ink-2">{t("compN", { i: i + 1 })}</span>
                  <input className="input uppercase" value={c} maxLength={60} aria-invalid={(tried || touched.comps) && !validEn(c)} onBlur={() => blur("comps")} onChange={(e) => { const next = [...comps]; next[i] = e.target.value.toUpperCase(); set({ companions: next }); }} />
                </label>
              ))}
            </div>
          </Collapse>
          {show("comps") && <p className="err">{show("comps")}</p>}
        </section>
      )}

      <section ref={(el) => { refs.current.agree = el; }} className="relative mt-4 card grid gap-1 p-5">
        <Anno n={6} t="동의 2개 (V-25): 전체 동의 / 취소 규정 / 합승 안내 (모두 필수). 이용약관·개인정보는 본 사이트 기준 → 아래 링크 (TERMS_URL)" />
        <h2 className="mb-1 text-[16px] font-bold">{t("termsT")}</h2>
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

      <Sheet open={!!terms} onClose={() => setTerms(null)} title={terms ? t(AGREE_LABEL[terms]) : ""}>
        {terms === "cancel" && <p className="mb-3 text-[13px] text-muted">{t("termsBody")}</p>}
        <ul className="grid list-disc gap-2 pl-5 text-[14px] text-ink-2">{terms && list(`terms_${terms}` as Key).map((x) => <li key={x}>{x}</li>)}</ul>
        {terms && <button className="btn btn-primary mt-5 w-full" onClick={() => { set({ agree: { ...f.agree, [terms]: true } }); setTerms(null); }}>{t("agreeOne")}</button>}
      </Sheet>

      <BottomBar>
        <span className="absolute -top-3 left-3"><Anno n={7} t="하단 다음: 검사 통과 시 좌석 임시확보(L-07, API-08) 후 S-10 (T-15) / 오류 → 첫 오류 칸으로 (T-16, M-160)" /></span>
        <PriceBlock main={yen(total)} sub={n(p.name)} />
        <button className="btn btn-primary min-w-[140px]" onClick={submit}>{t("next")}</button>
      </BottomBar>
    </div>
  );
}

function Field({ id, n, anno, label, err, help, children, refs }: { id: string; n: number; anno: string; label: string; err: string | null; help?: string; children: ReactNode; refs: MutableRefObject<Record<string, HTMLElement | null>> }) {
  return (
    <div className="field relative" ref={(el) => { refs.current[id] = el; }}>
      <Anno n={n} t={anno} />
      <label className="label" htmlFor={`f-${id}`}>{label}</label>
      {children}
      {err ? <p className="err">{err}</p> : help ? <p className="help">{help}</p> : null}
    </div>
  );
}
