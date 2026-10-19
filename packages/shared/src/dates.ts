// 날짜는 모두 'YYYY-MM-DD' 문자열 (JST 기준 달력 날짜). 시각 계산이 필요한 곳만 Date 사용
const pad = (n: number) => String(n).padStart(2, "0");
export const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const dow = (d: string) => new Date(d + "T00:00:00Z").getUTCDay(); // 0=일
export const ymOf = (d: string) => d.slice(0, 7);
export const addMonths = (ym: string, n: number) => {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${pad((((m % 12) + 12) % 12) + 1)}`;
};
export const daysInMonth = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
export const datesInMonth = (ym: string) => Array.from({ length: daysInMonth(ym) }, (_, i) => `${ym}-${pad(i + 1)}`);
/** 지금 JST 달력 날짜 */
export const todayJST = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
export const isISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().startsWith(s);

export const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
/** package.dep_weekdays ('MON,THU') → 요일 번호 목록 */
export const parseWeekdays = (s: string) => s.split(",").map((x) => WEEKDAYS.indexOf(x.trim().toUpperCase() as (typeof WEEKDAYS)[number])).filter((x) => x >= 0);
