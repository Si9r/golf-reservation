import { useEffect, useRef, useState } from "react";
import { Car, MapTrifold, WarningCircle } from "@phosphor-icons/react";
import { activeZones } from "../data";
import { useApp } from "../store";
import { useT } from "../i18n";
import { MAP_ID, fmtDrive, useDrive, useMaps, type LL } from "../gmaps";

export type MarkerKind = "golf" | "hotel" | "pick" | "drop" | "bad" | "preview" | "other";
export interface MapMarker extends LL {
  title: string;
  kind: MarkerKind;
  glyph?: string;
}

const COLORS: Record<MarkerKind, [string, string]> = {
  golf: ["#10B981", "#047857"],
  hotel: ["#6B3FF7", "#4C1FD6"],
  pick: ["#6B3FF7", "#4C1FD6"],
  drop: ["#1A1D24", "#000000"],
  bad: ["#DC2626", "#991B1B"],
  preview: ["#F59E0B", "#B45309"],
  other: ["#8A93A6", "#5F6B85"],
};

const resolvedDark = (theme: string) => theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

// Google 지도 (Maps JavaScript API). 실서비스와 같은 방식, 키는 .env.local
export function MapView({
  markers,
  zones,
  onPoi,
  onMapClick,
  className = "",
  label,
  zoom = 14,
  focusKey,
  center,
  path,
}: {
  markers: MapMarker[];
  path?: LL[]; // 승차 → 일정 → 하차를 잇는 점선 (피드백 1)
  zones?: boolean;
  onPoi?: (placeId: string, at: LL) => void;
  onMapClick?: (at: LL) => void;
  className?: string;
  label: string;
  zoom?: number;
  focusKey?: string; // 이 값이 바뀔 때만 화면을 마커에 맞춤
  center?: LL | null; // 주면 마커 전체 대신 이 지점으로 이동
}) {
  const line = useRef<google.maps.Polyline | null>(null);
  const { L, t } = useT();
  const theme = useApp((s) => s.theme);
  const { ready, error } = useMaps(L);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const pins = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const handlers = useRef({ onPoi, onMapClick });
  handlers.current = { onPoi, onMapClick };
  const [made, setMade] = useState(false);
  const fitted = useRef(false);

  useEffect(() => {
    if (!ready || !el.current || map.current) return;
    const m = new google.maps.Map(el.current, {
      center: markers[0] ?? { lat: 42.95, lng: 141.5 },
      zoom,
      mapId: MAP_ID,
      colorScheme: resolvedDark(theme) ? google.maps.ColorScheme.DARK : google.maps.ColorScheme.LIGHT,
      disableDefaultUI: true,
      zoomControl: true,
      fullscreenControl: true,
      gestureHandling: "cooperative",
      clickableIcons: !!onPoi,
    });
    m.addListener("click", (e: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
      const at = e.latLng ? { lat: e.latLng.lat(), lng: e.latLng.lng() } : null;
      if (!at) return;
      if ("placeId" in e && e.placeId && handlers.current.onPoi) {
        e.stop(); // Google 기본 정보 창 대신 우리 미리보기 카드
        handlers.current.onPoi(e.placeId, at);
      } else handlers.current.onMapClick?.(at);
    });
    if (zones) {
      activeZones().forEach((z) => new google.maps.Circle({ map: m, center: { lat: z.lat, lng: z.lng }, radius: z.r, strokeColor: "#10B981", strokeWeight: 1.5, fillColor: "#10B981", fillOpacity: 0.1, clickable: false }));
    }
    map.current = m;
    if (import.meta.env.DEV) ((window as unknown as { __maps?: google.maps.Map[] }).__maps ??= []).push(m); // 개발 중 확인용
    setMade(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // 마커 갱신
  useEffect(() => {
    const m = map.current;
    if (!m || !made) return;
    let alive = true;
    (async () => {
      const { AdvancedMarkerElement, PinElement } = (await google.maps.importLibrary("marker")) as google.maps.MarkerLibrary;
      if (!alive) return;
      pins.current.forEach((p) => (p.map = null));
      pins.current = markers.map((mk) => {
        const [bg, border] = COLORS[mk.kind];
        const pin = new PinElement({ background: bg, borderColor: border, glyphColor: "#fff", glyphText: mk.glyph, scale: mk.kind === "other" ? 0.85 : 1.05 });
        return new AdvancedMarkerElement({ map: m, position: { lat: mk.lat, lng: mk.lng }, title: mk.title, content: pin, zIndex: mk.kind === "other" ? 1 : 10 });
      });
    })();
    return () => {
      alive = false;
    };
  }, [markers, made]);

  // 화면 맞춤
  useEffect(() => {
    const m = map.current;
    if (!m || !made || markers.length === 0) return;
    // 지도가 준비되기 전 panTo 는 무시되므로 첫 맞춤은 setCenter
    const move = (c: LL) => (fitted.current ? m.panTo(c) : m.setCenter(c));
    if (center) {
      move(center);
      m.setZoom(zoom);
    } else if (markers.length === 1 && !zones) {
      move(markers[0]);
      if ((m.getZoom() ?? 0) < zoom) m.setZoom(zoom);
    } else {
      const b = new google.maps.LatLngBounds();
      markers.forEach((x) => b.extend(x));
      if (zones) {
        // 승하차 가능 범위(원)도 한 화면에 들어오게
        activeZones().forEach((z) => {
          const dLat = z.r / 111320;
          const dLng = z.r / (111320 * Math.cos((z.lat * Math.PI) / 180));
          b.extend({ lat: z.lat + dLat, lng: z.lng + dLng });
          b.extend({ lat: z.lat - dLat, lng: z.lng - dLng });
        });
      }
      m.fitBounds(b, 24);
    }
    fitted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey ?? markers.map((x) => `${x.lat},${x.lng}`).join("|"), center?.lat, center?.lng, made]);

  // 승차 → 골프장 → 하차 이동 경로 점선 (실제 도로가 아닌 순서 표시)
  useEffect(() => {
    const m = map.current;
    if (!m || !made) return;
    line.current?.setMap(null);
    if (path && path.length >= 2) {
      line.current = new google.maps.Polyline({
        map: m,
        path,
        strokeOpacity: 0,
        icons: [
          { icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#6B3FF7", strokeWeight: 3, scale: 3 }, offset: "0", repeat: "14px" },
          { icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: "#6B3FF7", fillColor: "#6B3FF7", fillOpacity: 1 }, offset: "50%" },
        ],
        clickable: false,
        zIndex: 5,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [made, (path ?? []).map((x) => `${x.lat},${x.lng}`).join("|")]);

  useEffect(() => {
    map.current?.setOptions({ colorScheme: resolvedDark(theme) ? google.maps.ColorScheme.DARK : google.maps.ColorScheme.LIGHT });
  }, [theme]);

  return (
    <div className={`relative isolate overflow-hidden rounded-2xl bg-surface-2 ${className}`}>
      <div ref={el} className="gm-host" role="application" aria-label={label} />
      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center text-[13px] text-muted">
          <div className="skel absolute inset-0 rounded-none" />
          <span className="relative flex items-center gap-1.5"><MapTrifold size={18} /> {t("loadingMap")}</span>
        </div>
      )}
      {error && markers.length > 0 && <SchematicMap markers={markers} path={path} zones={zones} note={t("mapSchematic")} />}
      {error && markers.length === 0 && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center">
          <p className="flex max-w-[34ch] flex-col items-center gap-2 text-[13px] text-ink-2">
            <WarningCircle size={24} className="text-bad" />
            {error === "NO_KEY" ? t("mapNoKey") : error === "AUTH" ? t("mapAuth") : t("mapLoadFail")}
          </p>
        </div>
      )}
    </div>
  );
}

// 두 지점 사이 차량 이동 시간 (Routes API, 교통 상황 미반영)
export function DriveChip({ from, to, label, strong }: { from: LL | null | undefined; to: LL | null | undefined; label?: string; strong?: boolean }) {
  const { L, t } = useT();
  const { loading, drive } = useDrive(from, to);
  if (!from || !to) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${strong ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-2"}`} aria-live="polite">
      <Car size={14} weight="bold" />
      {label && <span className="font-normal">{label}</span>}
      {loading || !drive ? <span className="skel inline-block h-3 w-16" /> : <span className="num">{t(drive.source === "google" ? "driveG" : "driveE", { v: fmtDrive(drive, L) })}</span>}
    </span>
  );
}

// 일정표 두 항목 사이의 이동 구간 표시
export function LegRow({ from, to, cols = "grid-cols-[52px_28px_1fr]" }: { from?: LL; to?: LL; cols?: string }) {
  if (!from || !to || (Math.abs(from.lat - to.lat) < 1e-4 && Math.abs(from.lng - to.lng) < 1e-4)) return null;
  return (
    <li className={`grid ${cols} gap-2 pb-3`} aria-label="이동">
      <span />
      <span className="flex justify-center"><span className="w-[2px] bg-brand-line" /></span>
      <span><DriveChip from={from} to={to} /></span>
    </li>
  );
}

// Google 지도를 못 불러올 때 쓰는 간이 지도: 마커 위치와 경로 점선만 그림 (오프라인 미리보기·캡처용)
function SchematicMap({ markers, path, zones, note }: { markers: MapMarker[]; path?: LL[]; zones?: boolean; note: string }) {
  const pts: LL[] = [...markers, ...(path ?? [])];
  if (zones) activeZones().forEach((z) => pts.push({ lat: z.lat, lng: z.lng }));
  let minLat = Math.min(...pts.map((p) => p.lat)), maxLat = Math.max(...pts.map((p) => p.lat));
  let minLng = Math.min(...pts.map((p) => p.lng)), maxLng = Math.max(...pts.map((p) => p.lng));
  const padLat = Math.max(0.02, (maxLat - minLat) * 0.15), padLng = Math.max(0.03, (maxLng - minLng) * 0.15);
  minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;
  const W = 400, H = 260;
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * W;
  const y = (lat: number) => H - ((lat - minLat) / (maxLat - minLat)) * H;
  const kmPx = W / ((maxLng - minLng) * 111.32 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  return (
    <div className="absolute inset-0">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img" aria-label={note}>
        <rect width={W} height={H} fill="var(--surface-2)" />
        {zones && activeZones().map((z, i) => <circle key={i} cx={x(z.lng)} cy={y(z.lat)} r={(z.r / 1000) * kmPx} fill="#10B98122" stroke="#10B981" strokeWidth="1.5" />)}
        {path && path.length >= 2 && (
          <polyline points={path.map((p) => `${x(p.lng)},${y(p.lat)}`).join(" ")} fill="none" stroke="#6B3FF7" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {markers.map((m, i) => {
          const [bg] = COLORS[m.kind];
          return (
            <g key={i} transform={`translate(${x(m.lng)},${y(m.lat)})`}>
              <circle r="11" fill={bg} stroke="#fff" strokeWidth="2" />
              {m.glyph && <text textAnchor="middle" dy="4" fontSize="11" fontWeight="700" fill="#fff">{m.glyph}</text>}
            </g>
          );
        })}
      </svg>
      <span className="absolute bottom-2 left-2 rounded-md bg-surface/90 px-2 py-0.5 text-[11px] text-muted">{note}</span>
    </div>
  );
}
