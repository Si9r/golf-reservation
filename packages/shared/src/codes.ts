// 코드값 (상세설계 v1.3 '코드·상태' ①)
export const BOOKING_STATUS = ["CONFIRMED", "USER_CANCEL", "OP_CANCEL", "DONE"] as const;
export type BookingStatus = (typeof BOOKING_STATUS)[number];
export const DEPARTURE_STATUS = ["OPEN", "GO", "CANCEL", "DONE"] as const;
export type DepartureStatus = (typeof DEPARTURE_STATUS)[number];
export const PACKAGE_TYPE = ["multi", "stay", "day"] as const;
export type PackageType = (typeof PACKAGE_TYPE)[number];
export const ROOM_TYPE = ["std", "dlx"] as const; // single은 객실 구성(1인실 인원)으로 대체 (화면설계 v2)
export type RoomType = (typeof ROOM_TYPE)[number];
export type StopKind = "PICK" | "DROP";
export type NotificationKind = "CONFIRM" | "GO" | "CANCEL" | "PICKUP" | "USER_CANCEL" | "COMPANION" | "NO_SEAT";
export type CancelBy = "USER" | "OP" | "SYSTEM";
export type RefundStatus = "REQUESTED" | "DONE" | "FAIL";
export type HotelZone = "CITY" | "RESORT";
export type Lang = "ko" | "ja";

// ② 상태 전이: 표에 없는 변경은 허용 안 함
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  CONFIRMED: ["OP_CANCEL", "USER_CANCEL", "DONE"],
  USER_CANCEL: [],
  OP_CANCEL: [],
  DONE: [],
};
export const DEPARTURE_TRANSITIONS: Record<DepartureStatus, DepartureStatus[]> = {
  OPEN: ["GO", "CANCEL"],
  GO: ["DONE"],
  CANCEL: [],
  DONE: [],
};
export const canMove = <S extends string>(table: Record<S, S[]>, from: S, to: S) => table[from].includes(to);
