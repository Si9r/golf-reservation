import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { useT } from "../i18n";
import { DEMO_USER, useAuth } from "../store";
import { Logo } from "../components/Shell";
import { ScreenTag } from "../components/ui";

// 본 사이트(TRAVENDER) 로그인 화면 자리. 실서비스는 본 사이트 로그인 후 next 파라미터로 복귀 (F-004, T-30)
export default function Login() {
  const { t } = useT();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/golf";
  const login = useAuth((s) => s.login);
  return (
    <div className="page step grid min-h-[70dvh] place-items-center">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="card w-full max-w-[420px] p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
        <ScreenTag id="외부" name="본 사이트 로그인 (데모 자리)" refs="F-004 · T-30" />
        <div className="mb-5"><Logo /></div>
        <h1 className="text-[21px] font-bold">{t("loginT")}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{t("loginS")}</p>
        <div className="mt-5 grid gap-1 rounded-xl bg-surface-2 p-4 text-[13.5px]">
          <span className="font-semibold text-muted">{t("demoAccount")}</span>
          <span className="font-bold">{DEMO_USER.nameKo} · {DEMO_USER.email}</span>
        </div>
        <div className="mt-5 grid gap-2">
          <button
            className="btn btn-primary w-full"
            onClick={() => {
              login();
              nav(next, { replace: true });
            }}
          >
            {t("loginDo")}
          </button>
          <button className="btn btn-ghost w-full" onClick={() => (window.history.length > 1 ? nav(-1) : nav("/golf"))}>{t("cancel")}</button>
        </div>
      </motion.div>
    </div>
  );
}
