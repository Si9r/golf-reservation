import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { useT } from "../i18n";
import { DEMO_USER, useAuth } from "../store";
import { Logo } from "../components/Shell";
import { ScreenTag } from "../components/ui";
import { USE_API, api } from "../api/client";
import { loadMe } from "../api/sync";

// 본 사이트(TRAVENDER) 로그인 화면 자리. 실서비스는 본 사이트 로그인 후 next 파라미터로 복귀 (F-004, T-30)
// API 모드: 서버에 로그인 여부를 물어 이미 로그인했으면 바로 next 로, partner 모드에서 로그인 안 됐으면 본 사이트 로그인으로 이동(client.ts)
export default function Login() {
  const { t } = useT();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next") || "/golf";
  const login = useAuth((s) => s.login);
  useEffect(() => {
    if (!USE_API) return;
    // 401 이면 client.ts 가 본 사이트 로그인으로 보냄 (fake 모드는 이 화면에 머묾). 이미 로그인했으면 바로 next 로
    api.meOrLogin().then(() => loadMe()).then((ok) => ok && nav(next, { replace: true })).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
              login(); // 데모 로그인 (fake). API 모드는 서버 세션으로 다시 맞춤
              void loadMe().finally(() => nav(next, { replace: true }));
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
