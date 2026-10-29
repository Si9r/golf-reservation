import { describe, expect, it } from "vitest";
import { bookingNo, departureView, inArea, inClosedSeason, isBookableDate, isSaleDate, quote, roomsOf, seatsLeft, SETTINGS } from "../src";

const pkg = { depWeekdays: "TUE,FRI", seasonFrom: "04-20", seasonTo: "11-15" };

describe("L-01 출발일", () => {
  it("휴장기 11/16~4/19는 판매 안 함", () => {
    expect(inClosedSeason("2026-11-16")).toBe(true);
    expect(inClosedSeason("2027-04-19")).toBe(true);
    expect(inClosedSeason("2027-04-20")).toBe(false);
    expect(inClosedSeason("2026-11-15")).toBe(false);
  });
  it("요일·시즌·판정일", () => {
    expect(isSaleDate(pkg, "2026-10-23")).toBe(true); // 금
    expect(isSaleDate(pkg, "2026-10-22")).toBe(false); // 목
    // 판정일(출발 7일 전): 10-30 출발 → 10-23. 오늘이 10-23이면 이미 판정일 → 예약 불가
    expect(isBookableDate(pkg, "2026-10-30", "2026-10-19")).toBe(true);
    expect(isBookableDate(pkg, "2026-10-30", "2026-10-22")).toBe(true);
    expect(isBookableDate(pkg, "2026-10-30", "2026-10-23")).toBe(false);
    expect(isBookableDate(pkg, "2026-10-23", "2026-10-19")).toBe(false); // 판정일 10-16 지남
    expect(isBookableDate(pkg, "2026-10-30", "2026-10-19", "CANCEL")).toBe(false);
  });
});

describe("L-02 · L-04", () => {
  it("잔여석은 확보 인원까지 뺌 (정원 20)", () => expect(seatsLeft(20, 12, 4)).toBe(4));
  it("판정 전 20명 이상은 '인원 충족'(상태는 OPEN), 정원 20이라 마감(full)도 같이", () => {
    expect(departureView({ bookedCount: 18, seats: 2, status: "OPEN", people: 2 })).toMatchObject({ state: "enough", seatsAfter: 0, full: true });
    expect(departureView({ bookedCount: 10, seats: 10, status: "OPEN", people: 2 })).toMatchObject({ state: "need", need: 8, full: false });
    expect(departureView({ bookedCount: 15, seats: 5, status: "OPEN", people: 6 })).toMatchObject({ state: "unavailable", full: false });
    expect(departureView({ bookedCount: 18, seats: 2, status: "GO", people: 1 }).state).toBe("go");
  });
});

describe("L-05 금액 · 객실 구성", () => {
  it("홀수 인원은 1명 1인실 자동", () => {
    expect(roomsOf(3)).toEqual({ singles: 1, twins: 1 });
    expect(roomsOf(4)).toEqual({ singles: 0, twins: 2 });
    expect(roomsOf(4, 1)).toEqual({ singles: 2, twins: 1 }); // 홀짝 맞춤
    expect(roomsOf(1)).toEqual({ singles: 1, twins: 0 });
  });
  it("총액 = 1인 요금 × 인원 + 1인실 추가 × 1인실 인원", () => {
    const q = quote({ basePrice: 69800, priceDiff: 6000, people: 3, hasStay: true, singleAdd: 12000 });
    expect(q.total).toBe(75800 * 3 + 12000);
    expect(quote({ basePrice: 16900, priceDiff: 0, people: 3, hasStay: false }).total).toBe(16900 * 3);
  });
});

describe("L-06 · L-09", () => {
  it("범위 검사 (원·다각형)", () => {
    // 승하차 범위 반경 5km (운영사 확정 10/29): 중심에서 4.9km 안, 5.1km 밖 (북·동·남·서)
    const a = SETTINGS.SERVICE_AREA;
    const circle = { type: "circle" as const, lat: a.lat, lng: a.lng, r: a.r };
    expect(a.r).toBe(5000);
    const kmLat = 1 / 111.195, kmLng = kmLat / Math.cos((a.lat * Math.PI) / 180);
    for (const [dl, dg] of [[kmLat, 0], [0, kmLng], [-kmLat, 0], [0, -kmLng]]) {
      expect(inArea({ lat: a.lat + dl * 4.9, lng: a.lng + dg * 4.9 }, circle)).toBe(true);
      expect(inArea({ lat: a.lat + dl * 5.1, lng: a.lng + dg * 5.1 }, circle)).toBe(false);
    }
    // 실제 장소: 삿포로역·오도리·스스키노·마루야마공원역 안, 삿포로돔·신치토세공항 밖
    for (const [lat, lng] of [[43.0675, 141.3508], [43.0596, 141.3485], [43.0554, 141.3532], [43.0543, 141.3165]]) expect(inArea({ lat, lng }, circle)).toBe(true);
    for (const [lat, lng] of [[43.0151, 141.4096], [42.788, 141.681]]) expect(inArea({ lat, lng }, circle)).toBe(false);
    const sq = { type: "polygon" as const, points: [[43, 141.3], [43.1, 141.3], [43.1, 141.4], [43, 141.4]] as [number, number][] };
    expect(inArea({ lat: 43.05, lng: 141.35 }, sq)).toBe(true);
    expect(inArea({ lat: 43.2, lng: 141.35 }, sq)).toBe(false);
  });
  it("예약번호", () => expect(bookingNo("2026-10-23", 7)).toBe("GT-261023-0007"));
});

describe("L-16", () => {
  it("승차 시간 등록 마감(출발 n일 전)은 출발 확정(판정일)보다 뒤", () => {
    expect(SETTINGS.PICKUP_REGISTER_DUE_DAYS).toBe(3);
    expect(SETTINGS.PICKUP_REGISTER_DUE_DAYS).toBeLessThan(SETTINGS.JUDGE_DAYS);
  });
});

