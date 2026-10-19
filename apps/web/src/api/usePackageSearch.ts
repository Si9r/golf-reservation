// S-02 패키지 목록: API-01로 가져옴 (VITE_USE_API=1). 꺼져 있으면 프로토타입 계산(searchPkgs)
import { useEffect, useMemo, useState } from "react";
import { pkgOf } from "../data";
import { searchPkgs, type SearchFilters } from "../logic";
import { useDb } from "../store";
import { useFakeLoad } from "../components/ui";
import { USE_API, api, protoId } from "./client";

export type SearchRow = NonNullable<ReturnType<typeof searchPkgs>>[number];

export function usePackageSearch(o: { q: string; date: string | null; people: number; filters: SearchFilters }) {
  const extra = useDb((s) => s.extra);
  const fake = useFakeLoad(JSON.stringify([o.date, o.people]));
  const local = useMemo(() => (USE_API ? [] : searchPkgs({ ...o, extra })), [o.q, o.date, o.people, o.filters, extra]); // eslint-disable-line react-hooks/exhaustive-deps

  const [rows, setRows] = useState<SearchRow[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!USE_API) return;
    let alive = true;
    setState("loading");
    api.packages({ q: o.q, date: o.date, people: o.people, ...o.filters })
      .then((r) => {
        if (!alive) return;
        // 카드 모양(사진·태그)은 아직 프로토타입 데이터에서 → 화면 전체가 API로 바뀌면 API 응답만 사용
        setRows(r.items.flatMap((it) => {
          const p = pkgOf(protoId(it.id));
          return p && it.nextDeparture ? [{ p, d: it.nextDeparture.date, seats: it.nextDeparture.seatsLeft }] : [];
        }));
        setState("ok");
      })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [o.q, o.date, o.people, o.filters, n]);

  if (!USE_API) return { rows: local, ...fake };
  return { rows, loading: state === "loading", error: state === "error", retry: () => setN((x) => x + 1) };
}
