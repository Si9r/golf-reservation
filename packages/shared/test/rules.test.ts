import { describe, expect, it } from "vitest";
import { bookingNo, departureView, inArea, inClosedSeason, isBookableDate, isSaleDate, quote, roomsOf, seatsLeft } from "../src";

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
    expect(inArea({ lat: 43.0675, lng: 141.3508 }, { type: "circle", lat: 43.0621, lng: 141.3544, r: 12000 })).toBe(true);
    expect(inArea({ lat: 43.1979, lng: 140.9937 }, { type: "circle", lat: 43.0621, lng: 141.3544, r: 12000 })).toBe(false);
    const sq = { type: "polygon" as const, points: [[43, 141.3], [43.1, 141.3], [43.1, 141.4], [43, 141.4]] as [number, number][] };
    expect(inArea({ lat: 43.05, lng: 141.35 }, sq)).toBe(true);
    expect(inArea({ lat: 43.2, lng: 141.35 }, sq)).toBe(false);
  });
  it("예약번호", () => expect(bookingNo("2026-10-23", 7)).toBe("GT-261023-0007"));
});
