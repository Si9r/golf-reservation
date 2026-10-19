// 기준 값 (상세설계 v1.3 '처리 로직' ①). 화면 미리 보기용 — 서버 쪽 원본은 apps/api/app/settings.py (둘을 같이 고칠 것)
// 예시 값은 YU PM 답변·팀 결정에 따라 바뀜 (TBD 번호는 상세설계 '확인·결정' 시트)
export const SETTINGS = {
  MAX_PEOPLE: 30, // F-011
  MIN_PEOPLE: 1,
  BUS_SEATS: 30, // 출발편 정원
  MIN_DEPARTURE: 20, // 최소 출발 인원 (F-043)
  JUDGE_DAYS: 3, // 출발 n일 전 판정 (예시, TBD-05)
  HOLD_MINUTES: 10, // 결제 중 좌석 확보 (TBD-14)
  COMPANION_DUE_DAYS: 7, // 동반자 명단 마감 (TBD-09)
  CLOSED_SEASON: { from: "11-16", to: "04-19" }, // 휴장기 (예시, TBD-16)
  SINGLE_ADD: 12000, // 1인실 추가 요금 1명당 (예시, 화면설계 v2 · Q-02). 패키지별 값이 있으면 그 값
  NEAR_PLACE_M: 350, // L-06 지도 탭 근처 장소 이름 사용
  MEMO_MAX: 100, // V-11
  SEARCH_MAX: 50, // V-01
  DEPARTURE_MONTHS_AHEAD: 13, // B-04
  SUPPORT: { tel: "+81-11-200-4812", email: "golf@travender-hokkaido.com", hours: "10:00-17:00" }, // 예시 (Q-13)
  TERMS_URL: { terms: "https://travender-hokkaido.com/terms", privacy: "https://travender-hokkaido.com/privacy", cancel: "https://travender-hokkaido.com/cancel" }, // 예시
} as const;
export type Settings = typeof SETTINGS;
