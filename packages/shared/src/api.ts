// API 요청·응답 모양 (상세설계 v1.3 'API'). 서버와 화면이 같이 씀
import type { BookingStatus, DepartureStatus, HotelZone, Lang, PackageType, StopKind } from "./codes";
import type { DepState } from "./rules";

export type L2 = { ko: string; ja: string };

export interface PackageListItem {
  id: string;
  name: L2;
  type: PackageType;
  nights: number;
  rounds: number;
  hotel: { name: L2; near: L2 | null; zone: HotelZone } | null;
  basePrice: number;
  photoUrl: string | null;
  recommended: boolean;
  nextDeparture: { date: string; seatsLeft: number } | null;
}
export interface PackageListRes { items: PackageListItem[]; total: number }

export interface HotelOptionDto { id: string; code: string; hotelId: string | null; roomType: string; priceDiff: number; isDefault: boolean }
export interface PackageDayDto { dayNo: number; course: { id: string; name: L2; area: string; lat: number; lng: number; holes: number; caddie: boolean } | null; teeTime: string | null; departTime: string | null; overnight: boolean }
export interface PackageDetailRes extends PackageListItem {
  desc: L2 | null;
  includes: L2 | null;
  depWeekdays: string;
  singleAdd: number;
  days: PackageDayDto[];
  options: HotelOptionDto[];
}

export interface DepartureItem { id: string; date: string; booked: number; minPeople: number; seatsLeft: number; status: DepartureStatus; judgeDate: string; selectable: boolean; view: { state: DepState; msg: string; need: number; full: boolean } }
export interface DepartureListRes { items: DepartureItem[] }
export interface CalendarRes { items: { date: string; count: number }[] }

export interface QuoteReq { departureId: string; optionId?: string | null; people: number; singles?: number | null }
export interface QuoteRes { unitPrice: number; optionDiff: number; people: number; rooms: { twins: number; singles: number } | null; singleAddEach: number; singleTotal: number; total: number; currency: "JPY" }

export interface HoldReq { departureId: string; people: number }
export interface HoldRes { holdId: number; expiresAt: string }

// desiredTime: 'HH:MM' 희망 승하차 시간 (참고용, 30분 단위). PICK·DROP 모두 필수 (V-12), 패키지 일정으로 정한 범위 밖이면 V-12-range
export interface StopInput { kind: StopKind; placeName: string; placeId?: string | null; address?: string | null; lat: number; lng: number; memo?: string | null; desiredTime: string }
export interface RepInput { nameLocal: string; nameEn: string; countryCode: string; phone: string; email: string }
export interface BookingCreateReq {
  holdId: number;
  optionId?: string | null;
  singles?: number | null;
  stops: StopInput[];
  rep: RepInput;
  companions: { nameEn: string }[];
  paymentId: string;
  lang: Lang;
}
export interface BookingCreateRes { bookingNo: string; status: BookingStatus }
export interface BookingSummary { no: string; packageId: string; packageName: L2; depDate: string; people: number; total: number; status: BookingStatus; departureStatus: DepartureStatus }
