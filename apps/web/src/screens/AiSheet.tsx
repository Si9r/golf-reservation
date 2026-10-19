import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Sparkle } from "@phosphor-icons/react";
import { PKGS, hotelOf } from "../data";
import { useT } from "../i18n";
import { Img, Sheet } from "../components/ui";
import { PkgTags } from "../components/booking";
import { yen } from "../logic";

function Bubble({ me, children }: { me?: boolean; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14.5px] ${me ? "ml-auto rounded-br-md bg-brand text-brand-ink" : "rounded-bl-md bg-surface-2"}`}>
      {children}
    </motion.div>
  );
}

// 3단계 미리보기: 대화형 패키지 추천 (F-072). 실서비스는 AI 응답, 프로토타입은 규칙 기반
export function AiSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, list, n } = useT();
  const nav = useNavigate();
  const [ans, setAns] = useState<number[]>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) setAns([]); }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [ans]);
  const qs = [
    { q: t("aiQ1"), o: list("aiQ1o") },
    { q: t("aiQ2"), o: list("aiQ2o") },
    { q: t("aiQ3"), o: list("aiQ3o") },
  ];
  const best = (() => {
    if (ans.length < 3) return null;
    const scored = PKGS.map((p) => {
      let s = 0;
      if (p.nights === ans[0]) s += 3;
      else s -= Math.abs(p.nights - ans[0]);
      const h = hotelOf(p.hotel);
      if (ans[1] === 0 && h?.area === "SAPPORO") s += 2;
      if (ans[1] === 1 && (p.type === "stay" || (h && h.area !== "SAPPORO"))) s += 2;
      if (ans[1] === 2 && (!p.hotel || p.opts.includes("none"))) s += 2;
      if (ans[2] === 0 && p.price < 50000) s += 2;
      if (ans[2] === 1 && p.price >= 50000 && p.price <= 100000) s += 2;
      if (p.rec) s += 0.5;
      return { p, s };
    }).sort((a, b) => b.s - a.s);
    return scored[0];
  })();
  return (
    <Sheet open={open} onClose={onClose} title={t("aiT")}>
      <div className="grid gap-2.5">
        <Bubble><Sparkle size={16} weight="fill" className="mr-1 inline text-brand" />{t("aiHello")}</Bubble>
        {qs.map((q, i) =>
          i <= ans.length ? (
            <div key={i} className="grid gap-2.5">
              <Bubble>{q.q}</Bubble>
              {ans[i] === undefined ? (
                <div className="flex flex-wrap gap-2">
                  {q.o.map((o, j) => (
                    <button key={o} className="fchip" onClick={() => setAns([...ans, j])}>{o}</button>
                  ))}
                </div>
              ) : (
                <Bubble me>{q.o[ans[i]]}</Bubble>
              )}
            </div>
          ) : null,
        )}
        {best && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card mt-2 overflow-hidden">
            <div className="aspect-[16/8]"><Img src={best.p.photos[0]} alt={n(best.p.name)} /></div>
            <div className="grid gap-2 p-4">
              <p className="text-[13px] font-bold text-brand">{best.s >= 5 ? t("aiResult") : t("aiNone")}</p>
              <h3 className="font-bold">{n(best.p.name)}</h3>
              <PkgTags p={best.p} />
              <p className="num text-[18px] font-extrabold">{yen(best.p.price)}~ <span className="text-[12px] font-normal text-muted">{t("perPerson")} · {t("busIncl")}</span></p>
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button className="btn btn-sm btn-ghost" onClick={() => setAns([])}>{t("aiRestart")}</button>
                <button className="btn btn-sm btn-primary" onClick={() => { onClose(); nav(`/golf/packages/${best.p.id}`); }}>{t("aiOpen")}</button>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={end} />
      </div>
    </Sheet>
  );
}
