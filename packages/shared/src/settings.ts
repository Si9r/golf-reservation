// 기준 값 (상세설계 v1.3 '처리 로직' ①). 화면 미리 보기용 — 서버 쪽 원본은 apps/api/app/settings.py (둘을 같이 고칠 것)
// 예시 값은 YU PM 답변·팀 결정에 따라 바뀜 (TBD 번호는 상세설계 '확인·결정' 시트)
export const SETTINGS = {
  MAX_PEOPLE: 20, // F-011. 한 예약도 출발편 정원을 넘을 수 없음 (운영사 확정)
  MIN_PEOPLE: 1,
  BUS_SEATS: 20, // 출발편 정원 = 버스 1대 (운영사 확정)
  MIN_DEPARTURE: 15, // 최소 출발 인원 (F-043). 테스트용 15 (팀 결정 10/29, 운영 값은 20)
  JUDGE_DAYS: 7, // 출발 n일 전 판정 (운영사 확정, TBD-05). 동반자 명단 마감과 같은 날
  HOLD_MINUTES: 10, // 결제 중 좌석 확보 (TBD-14)
  PICKUP_REGISTER_DUE_DAYS: 3, // L-16 운영이 승차 시간을 등록하는 기한: 출발 확정(출발 7일 전)부터 출발 n일 전까지 (운영사 10/29 설정값, 팀 결정 10/29). JUDGE_DAYS 보다 작아야 함. 서버 settings.py 와 같은 값
  COMPANION_DUE_DAYS: 7, // 동반자 이름 수정 마감 (오타 수정용, 이름은 예약 때 모두 받음 — 팀 결정 10/23, TBD-09)
  CLOSED_SEASON: { from: "11-16", to: "04-19" }, // 휴장기, 모든 골프장 공통 (운영사 확정, TBD-16)
  SINGLE_ADD: 12000, // 1인실 추가 요금 1명당 (예시, 화면설계 v2 · Q-02). 패키지별 값이 있으면 그 값
  NEAR_PLACE_M: 350, // L-06 지도 탭 근처 장소 이름 사용
  // L-06 승하차 가능 범위: 중심(삿포로 TV탑 부근)에서 반경 5km (운영사 확정 10/29). 서버 settings.py SERVICE_AREA 와 같은 값. 화면 data.ts ZONES_STRICT 가 씀
  SERVICE_AREA: { id: "SAPPORO", lat: 43.0621, lng: 141.3544, r: 5000 },
  MEMO_MAX: 100, // V-11 요청 사항
  SEARCH_MAX: 50, // V-01
  DEPARTURE_MONTHS_AHEAD: 13, // B-04
  // 희망 승하차 시간은 받지 않음 (팀 결정 11/05): 승차 시간은 운영이 정해 안내 (PICKUP_REGISTER_DUE_DAYS)
  SUPPORT: { tel: "00-0000-000", email: "golf@travender-hokkaido.com", hours: "10:00-17:00" }, // 전화·이메일 임시값 (운영사 10/29, 실제 번호 받기 전). 운영 시간 확정
  TERMS_URL: { terms: "https://travender-hokkaido.com/terms", privacy: "https://travender-hokkaido.com/privacy", cancel: "https://travender-hokkaido.com/cancel" }, // 예시
} as const;
export type Settings = typeof SETTINGS;
