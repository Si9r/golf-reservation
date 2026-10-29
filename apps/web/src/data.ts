// 프로토타입 데이터. 패키지 구성·가격·사진은 예시 (요건 정의서 Q-02·Q-08·Q-14: 운영사 확정 전)
// 골프장·호텔 이름은 프로토타입 v9(TRAVENDER /hotels 실존 호텔)과 같게 유지
import { SETTINGS } from "@golf/shared";

export type Lang = "ko" | "ja";
export type L2 = { ko: string; ja: string };
export type Zone = "SAPPORO" | "KITAHIROSHIMA" | "CHITOSE";
export type Area = Zone | "ENIWA" | "TOMAKOMAI" | "OTARU" | "JOZANKEI" | "NOBORIBETSU" | "OTHER" | "MAP";

// 서비스 이름 (임시, 운영사 확정 전). 헤더 왼쪽에 표시
export const SERVICE_NAME = "TRAVENDER Golf";
// 본 사이트 이용약관 주소. 서버 공개 설정 API(GET /api/golf/settings/public)의 terms.terms 와 같은 값 (화면 API 연결 전이라 상수로)
export const TERMS_URL = "https://travender-hokkaido.com/terms";

export const SET = {
  MIN_PEOPLE: 1,
  MAX_PEOPLE: 20, // 한 예약도 출발편 정원을 넘을 수 없음 (운영사 확정)
  DEFAULT_PEOPLE: 2,
  MIN_DEPARTURE: 15, // 최소 출발 인원 (Q-03). 테스트용 15 (팀 결정 10/29, 운영 값은 20)
  BUS_SEATS: 20, // 출발편 정원 = 버스 1대 (F-031, 운영사 확정)
  JUDGE_DAYS: 7, // 출발 판정일 = 출발 7일 전 (운영사 확정). 동반자 명단 마감과 같은 날
  HOLD_MINUTES: 10, // 결제 중 잔여석 확보 시간 (v0.2 S-10)
  SEASON_FROM: "04-20", // 홋카이도 골프 시즌 (예시) - 11/16~4/19 휴장 (v1.3 CLOSED_SEASON)
  SEASON_TO: "11-15",
  CLOSED_FROM: "11-16", // 휴장기 CLOSED_SEASON, 모든 골프장 공통 (운영사 확정)
  CLOSED_TO: "04-19",
  SINGLE_ADD: 12000, // 1인실 추가 요금 (1명당, 예시 · Q-02)
  COMPANION_DUE_DAYS: 7, // 동반자 이름 수정 마감 = 출발 7일 전 (오타 수정용, 이름은 예약 때 모두 받음 — 팀 결정 10/23)
  NEAR_PLACE_M: 350, // 지도 탭 위치 근처의 알려진 장소 이름 사용 (L-06)
  MEMO_MAX: 100, // 만날 위치 메모 (V-11)
  SEARCH_MAX: 50, // 검색어 (V-01)
  SUPPORT_TEL: "00-0000-000", // 임시값 (운영사 10/29, 실제 번호 받기 전. 화면 '예시 번호' 표시는 그대로)
  SUPPORT_MAIL: "golf@travender-hokkaido.com", // 임시값 (운영사 10/29)
  SUPPORT_HOURS: "10:00-17:00",
  // 희망 승하차 시간 (V-12, 운영사 확정). 서버 apps/api/app/settings.py 와 같은 값
  STOP_TIME_FIRST: "06:00", // 가장 이른 승차·하차
  STOP_TIME_LAST: "21:00", // 가장 늦은 승차·하차
  STOP_TIME_STEP_MIN: 30, // 30분 단위
  PICK_MARGIN_MIN: 30, // 승차: 첫 티오프 − 이동 시간 − 이 여유 (가장 늦은 승차)
  PICK_EARLIEST_BEFORE_TEE_MIN: 150, // 승차: 첫 티오프 − 2시간 30분부터 (가장 이른 승차, 12:30 → 10:00). 합승이라 일찍 타면 골프장에서 대기
  ROUND_HOURS: 5, // 라운드 종료 예정 = 티오프 + 5시간
  NO_ROUND_DROP_FROM: "11:00", // 마지막 날 라운드가 없을 때 하차 기준 (체크아웃 후, 일정표와 같음)
};

const U = (id: string, w = 960) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;
export const PHOTOS = {
  blueSky: U("photo-1538648759472-7251f7cb2c2f"),
  aerialTrees: U("photo-1776717163995-7807586c229b"),
  fromGreen: U("photo-1709525616662-8d9f9a995ceb"),
  aerialLawn: U("photo-1500932334442-8761ee4810a7"),
  lawnTrees: U("photo-1592937238247-cd0090e02f65"),
  ballLawn: U("photo-1587174486073-ae5e5cff23aa"),
  mower: U("photo-1605144884374-ecbb643615f6"),
  pines: U("photo-1623567341691-1f47b5cf949e"),
  bunkers: U("photo-1780702828814-b9ac93cf01a9"),
  aerialTrap: U("photo-1776723670814-6f786c205117"),
  aerialTrap2: U("photo-1776723670896-4c8d9e7055ab"),
  ball: U("photo-1632946269126-0f8edbe8b068"),
  swing: U("photo-1535131749006-b7f58c99034b"),
  swingCloud: U("photo-1592919505780-303950717480"),
};

export const AREA_NAME: Record<Area, L2> = {
  SAPPORO: { ko: "삿포로 시내", ja: "札幌市内" },
  KITAHIROSHIMA: { ko: "기타히로시마", ja: "北広島" },
  CHITOSE: { ko: "치토세·신치토세공항", ja: "千歳・新千歳空港" },
  ENIWA: { ko: "에니와", ja: "恵庭" },
  TOMAKOMAI: { ko: "토마코마이", ja: "苫小牧" },
  OTHER: { ko: "그 외 지역", ja: "その他の地域" },
  OTARU: { ko: "오타루", ja: "小樽" },
  JOZANKEI: { ko: "조잔케이", ja: "定山渓" },
  NOBORIBETSU: { ko: "노보리베쓰", ja: "登別" },
  MAP: { ko: "지도에서 고른 위치", ja: "地図で選んだ位置" },
};

// 승하차 가능 범위 SERVICE_AREA: 중심 반경 5km (운영사 확정 10/29). 값은 packages/shared settings.ts SERVICE_AREA (서버 settings.py·service_area 와 같음)
// 공항 포함 여부는 회사 확인 필요 → 설계 도구에서 '넓은 범위'(이전 프로토타입: 기타히로시마·치토세·공항 포함)로 비교
export type ZoneCircle = { zone: Zone; lat: number; lng: number; r: number };
export const ZONES_STRICT: ZoneCircle[] = [{ zone: SETTINGS.SERVICE_AREA.id, lat: SETTINGS.SERVICE_AREA.lat, lng: SETTINGS.SERVICE_AREA.lng, r: SETTINGS.SERVICE_AREA.r }];
export const ZONES_WIDE: ZoneCircle[] = [
  { zone: "SAPPORO", lat: 43.055, lng: 141.375, r: 13000 },
  { zone: "KITAHIROSHIMA", lat: 42.98, lng: 141.56, r: 7000 },
  { zone: "CHITOSE", lat: 42.805, lng: 141.67, r: 6000 },
];
export const serviceArea = { wide: false };
export const activeZones = () => (serviceArea.wide ? ZONES_WIDE : ZONES_STRICT);

export interface Course {
  id: number;
  name: L2;
  area: Area;
  addr: L2;
  holes: number;
  caddie: boolean;
  rating: number;
  photo: string;
  intro: L2;
  lat: number; // Google Places 기준 좌표·Place ID (2026-10 조회)
  lng: number;
  placeId: string;
  en: string; // 영문 이름 (검색용, V-01 한·일·영)
}

export const COURSES: Course[] = [
  { id: 1, name: { ko: "선파크 삿포로 골프코스", ja: "サンパーク札幌ゴルフコース" }, en: "Sun Park Sapporo Golf Course", area: "KITAHIROSHIMA", addr: { ko: "홋카이도 기타히로시마시 도미가오카 456", ja: "北海道北広島市富ヶ岡456" }, lat: 42.95286, lng: 141.54696, placeId: "ChIJnwqx64TWdF8RClEYtKx--nc", holes: 27, caddie: false, rating: 4.0, photo: PHOTOS.lawnTrees,
    intro: { ko: "넓은 페어웨이의 27홀 코스. 처음 오는 골퍼도 편하게 칠 수 있습니다.", ja: "広いフェアウェイの27ホール。初めての方も気軽にプレーできます。" } },
  { id: 2, name: { ko: "삿포로 기타히로시마 골프클럽", ja: "札幌北広島ゴルフ倶楽部" }, en: "Sapporo Kitahiroshima Golf Club", area: "KITAHIROSHIMA", addr: { ko: "홋카이도 기타히로시마시 나카노사와 450-1", ja: "北海道北広島市中の沢450-1" }, lat: 42.97324, lng: 141.52723, placeId: "ChIJgwdBskDUdF8RSknFqZKtxKM", holes: 54, caddie: true, rating: 4.0, photo: PHOTOS.aerialTrees,
    intro: { ko: "숲으로 둘러싸인 54홀. 캐디가 함께해 코스 공략이 쉽습니다.", ja: "森に囲まれた54ホール。キャディ付きで攻略しやすいコースです。" } },
  { id: 3, name: { ko: "삿포로 엘름 컨트리클럽", ja: "札幌エルムカントリークラブ" }, en: "Sapporo Elm Country Club Eniwa", area: "ENIWA", addr: { ko: "홋카이도 에니와시 시마마쓰자와 55", ja: "北海道恵庭市島松沢55" }, lat: 42.91319, lng: 141.50202, placeId: "ChIJ7VZq_topdV8R0ua4Nv8tUTA", holes: 36, caddie: true, rating: 4.2, photo: PHOTOS.pines,
    intro: { ko: "느릅나무 숲과 연못이 어우러진 36홀 정통 코스.", ja: "ニレの林と池が調和する36ホールの本格コース。" } },
  { id: 4, name: { ko: "신치토세 컨트리클럽", ja: "新千歳カントリークラブ" }, en: "Shin Chitose Country Club", area: "CHITOSE", addr: { ko: "홋카이도 치토세시 교와 1392", ja: "北海道千歳市協和1392" }, lat: 42.89827, lng: 141.76297, placeId: "ChIJIfDfFZ_bdF8RmPmknR57A0Y", holes: 36, caddie: false, rating: 4.1, photo: PHOTOS.blueSky,
    intro: { ko: "공항에서 가까워 도착일·출국일 라운드에 알맞습니다.", ja: "空港に近く、到着日・出国日のラウンドに最適です。" } },
  { id: 5, name: { ko: "그레이트 삿포로 컨트리클럽", ja: "グレート札幌カントリー倶楽部" }, en: "Great Sapporo Country Club Chitose", area: "CHITOSE", addr: { ko: "홋카이도 치토세시 이즈미사와 845-1", ja: "北海道千歳市泉郷845-1" }, lat: 42.91513, lng: 141.74309, placeId: "ChIJsaj_ff_adF8Rn7OYtbwa9sg", holes: 18, caddie: false, rating: 4.2, photo: PHOTOS.fromGreen,
    intro: { ko: "18홀 셀프 플레이. 삿포로에서 당일로 다녀오기 좋습니다.", ja: "18ホールのセルフプレー。札幌からの日帰りに便利です。" } },
  { id: 6, name: { ko: "에미나 골프클럽", ja: "エミナゴルフクラブ" }, en: "Emina Golf Club Tomakomai", area: "TOMAKOMAI", addr: { ko: "홋카이도 토마코마이시 우에나에 341", ja: "北海道苫小牧市植苗341" }, lat: 42.68916, lng: 141.656, placeId: "ChIJHT3AzQ0ZdV8Rt1aMMNdBk3c", holes: 54, caddie: false, rating: 4.0, photo: PHOTOS.bunkers,
    intro: { ko: "18홀 코스 3개로 매일 다른 코스를 즐길 수 있는 리조트.", ja: "18ホール×3コースで毎日違うコースを楽しめるリゾート。" } },
  { id: 7, name: { ko: "마코마나이 컨트리클럽", ja: "真駒内カントリークラブ" }, en: "Makomanai Country Club Sapporo", area: "SAPPORO", addr: { ko: "홋카이도 삿포로시 미나미구 도키와 200", ja: "北海道札幌市南区常盤200" }, lat: 42.90526, lng: 141.33214, placeId: "ChIJJ2ICK10sdV8RSdJ30Ynl2sY", holes: 36, caddie: true, rating: 4.0, photo: PHOTOS.aerialLawn,
    intro: { ko: "삿포로 시내에서 25분. 산을 바라보며 치는 캐디 동반 코스.", ja: "札幌市内から25分。山を望むキャディ付きコース。" } },
  { id: 8, name: { ko: "니도무 클래식 코스", ja: "ニドムクラシックコース" }, en: "Nidom Classic Course Tomakomai", area: "TOMAKOMAI", addr: { ko: "홋카이도 토마코마이시 우에나에 430", ja: "北海道苫小牧市植苗430" }, lat: 42.71789, lng: 141.65416, placeId: "ChIJXaI9U9gYdV8RbG7fwOhur-g", holes: 45, caddie: true, rating: 4.6, photo: PHOTOS.aerialTrap,
    intro: { ko: "홋카이도를 대표하는 숲속 코스. 대회 개최 이력이 있는 명문.", ja: "北海道を代表する林間コース。大会開催実績のある名門。" } },
];

export interface Hotel {
  id: string;
  name: L2;
  area: Area;
  lat: number;
  lng: number;
  rating?: number;
  near: L2;
  room: L2;
  zone: "CITY" | "RESORT"; // 숙소 구분 (S-02 숙소 필터, hotel.zone)
  en: string;
  onsite?: boolean; // 골프장 안 숙소 (시내 밖)
}

export const HOTELS: Hotel[] = [
  { id: "h1", zone: "CITY", en: "Dormy Inn Premium Sapporo", name: { ko: "도미인 PREMIUM 삿포로", ja: "ドーミーインPREMIUM札幌" }, area: "SAPPORO", lat: 43.05706, lng: 141.34884, rating: 4.5, near: { ko: "스스키노역 도보 5분", ja: "すすきの駅 徒歩5分" }, room: { ko: "스탠다드 트윈", ja: "スタンダードツイン" } },
  { id: "h2", zone: "CITY", en: "Mitsui Garden Hotel Sapporo", name: { ko: "미쓰이가든호텔 삿포로", ja: "三井ガーデンホテル札幌" }, area: "SAPPORO", lat: 43.06652, lng: 141.34701, rating: 4.2, near: { ko: "삿포로역 도보 3분", ja: "札幌駅 徒歩3分" }, room: { ko: "스탠다드 트윈", ja: "スタンダードツイン" } },
  { id: "h7", zone: "CITY", en: "Keio Plaza Hotel Sapporo", name: { ko: "게이오플라자호텔 삿포로", ja: "京王プラザホテル札幌" }, area: "SAPPORO", lat: 43.06649, lng: 141.34544, rating: 4.4, near: { ko: "삿포로역 도보 5분", ja: "札幌駅 徒歩5分" }, room: { ko: "스탠다드 트윈", ja: "スタンダードツイン" } },
  { id: "h8", zone: "CITY", en: "JR Tower Hotel Nikko Sapporo", name: { ko: "JR타워호텔 닛코 삿포로", ja: "JRタワーホテル日航札幌" }, area: "SAPPORO", lat: 43.06815, lng: 141.35322, rating: 4.7, near: { ko: "삿포로역 직결", ja: "札幌駅直結" }, room: { ko: "스탠다드 트윈", ja: "スタンダードツイン" } },
  { id: "h9", zone: "CITY", en: "Sapporo Grand Hotel", name: { ko: "삿포로 그랜드호텔", ja: "札幌グランドホテル" }, area: "SAPPORO", lat: 43.06269, lng: 141.35095, rating: 4.5, near: { ko: "삿포로역 도보 5분", ja: "札幌駅 徒歩5分" }, room: { ko: "스탠다드 트윈", ja: "スタンダードツイン" } },
  { id: "h3", zone: "RESORT", en: "Kitahiroshima Golf Resort Hotel", name: { ko: "기타히로시마 골프 리조트 호텔 (예시)", ja: "北広島ゴルフリゾートホテル(例)" }, area: "KITAHIROSHIMA", lat: 42.975, lng: 141.57, near: { ko: "골프장까지 버스 15분", ja: "ゴルフ場までバス15分" }, room: { ko: "스탠다드 트윈", ja: "スタンダードツイン" } },
  { id: "h4", zone: "CITY", en: "New Chitose Airport Hotel", name: { ko: "신치토세공항 직결 호텔 (예시)", ja: "新千歳空港直結ホテル(例)" }, area: "CHITOSE", lat: 42.7795, lng: 141.6845, near: { ko: "국제선 터미널 직결", ja: "国際線ターミナル直結" }, room: { ko: "스탠다드 트윈", ja: "スタンダードツイン" } },
  { id: "h5", zone: "RESORT", en: "Hotel Nidom", name: { ko: "호텔 니도무 (골프장 내)", ja: "ホテルニドム（ゴルフ場内）" }, area: "TOMAKOMAI", lat: 42.71546, lng: 141.65547, near: { ko: "1번 홀까지 걸어서", ja: "1番ホールまで徒歩" }, room: { ko: "코티지 트윈", ja: "コテージツイン" }, onsite: true },
  { id: "h6", zone: "RESORT", en: "Emina Golf Resort", name: { ko: "에미나 골프 리조트 숙소 (예시)", ja: "エミナ ゴルフリゾートの宿(例)" }, area: "TOMAKOMAI", lat: 42.68916, lng: 141.656, near: { ko: "클럽하우스 옆", ja: "クラブハウス隣" }, room: { ko: "스탠다드 트윈", ja: "スタンダードツイン" }, onsite: true },
];

export interface HotelOption {
  id: string;
  name: L2;
  sub: L2;
  add: number; // 1인 기준 기본 대비 차액 (버스·픽업 포함)
  hotel?: string; // 숙박 호텔을 바꾸는 옵션
  none?: boolean; // 호텔 없이 (버스 + 골프)
}

export const OPTIONS: Record<string, HotelOption> = {
  std: { id: "std", name: { ko: "호텔 포함", ja: "ホテル込み" }, sub: { ko: "스탠다드 트윈 (2인 1실)", ja: "スタンダードツイン（2名1室）" }, add: 0 },
  dlx: { id: "dlx", name: { ko: "객실 업그레이드", ja: "客室アップグレード" }, sub: { ko: "디럭스 트윈 (2인 1실)", ja: "デラックスツイン（2名1室）" }, add: 8000 },
  single: { id: "single", name: { ko: "1인 1실", ja: "1名1室" }, sub: { ko: "싱글 이용", ja: "シングル利用" }, add: 12000 },
  none: { id: "none", name: { ko: "호텔 없이", ja: "ホテルなし" }, sub: { ko: "버스 + 골프만. 숙박은 직접 준비", ja: "バス＋ゴルフのみ。宿泊はご自身で手配" }, add: -9000, none: true },
  mitsui: { id: "mitsui", name: { ko: "미쓰이가든호텔 삿포로", ja: "三井ガーデンホテル札幌" }, sub: { ko: "스탠다드 트윈 · 기본 호텔", ja: "スタンダードツイン・基本ホテル" }, add: 0, hotel: "h2" },
  keio: { id: "keio", name: { ko: "게이오플라자호텔 삿포로", ja: "京王プラザホテル札幌" }, sub: { ko: "스탠다드 트윈", ja: "スタンダードツイン" }, add: 6000, hotel: "h7" },
  grand: { id: "grand", name: { ko: "삿포로 그랜드호텔", ja: "札幌グランドホテル" }, sub: { ko: "스탠다드 트윈", ja: "スタンダードツイン" }, add: 9000, hotel: "h9" },
  jrt: { id: "jrt", name: { ko: "JR타워호텔 닛코 삿포로", ja: "JRタワーホテル日航札幌" }, sub: { ko: "스탠다드 트윈 · 역 직결", ja: "スタンダードツイン・駅直結" }, add: 15000, hotel: "h8" },
};

export interface Round {
  course: number;
  tee: string;
  back: string;
}

export interface Pkg {
  id: number;
  rec?: boolean;
  type: "multi" | "stay" | "day"; // package.type: multi = n색 골프(매일 다른 골프장), stay = 체류형, day = 당일
  name: L2;
  short: L2;
  nights: number;
  hotel: string | null;
  opts: string[];
  price: number; // 1인, 버스·픽업·송영 포함 (예시)
  wd: number[]; // 출발 요일 (0=일) - 가정, YU PM 확인 필요
  days: (Round | null)[];
  photos: string[];
  extra: L2[]; // 버스·픽업·송영 외 포함 사항
  excl: L2[]; // 불포함 항목
  kw: string; // 영문 검색어 (V-01)
}

export const PKGS: Pkg[] = [
  {
    id: 1, rec: true, type: "multi",
    name: { ko: "삿포로 시내 숙박 2박 3일 · 2라운드", ja: "札幌市内泊 2泊3日・2ラウンド" },
    short: { ko: "첫날 공항에서 바로 라운드, 저녁은 삿포로 시내에서. 둘째 날은 시내에서 가까운 마코마나이.", ja: "初日は空港からそのままラウンド、夜は札幌の街へ。2日目は市内から近い真駒内。" },
    nights: 2, hotel: "h2", opts: ["mitsui", "keio", "grand", "jrt", "none"], price: 69800, wd: [2, 5],
    days: [{ course: 2, tee: "12:30", back: "17:30" }, { course: 7, tee: "08:30", back: "14:30" }, null],
    photos: [PHOTOS.aerialTrees, PHOTOS.aerialLawn, PHOTOS.ballLawn],
    extra: [{ ko: "그린피·카트비 2라운드", ja: "グリーンフィー・カート代 2ラウンド" }, { ko: "숙박 2박 (조식 포함)", ja: "宿泊2泊（朝食付き）" }],
    excl: [{ ko: "골프용품 렌탈", ja: "ゴルフ用品レンタル" }, { ko: "점심·개인 경비", ja: "昼食・個人的な費用" }, { ko: "석식", ja: "夕食" } ],
    kw: "Sapporo city 2 nights 2 rounds",
  },
  {
    id: 2, rec: true, type: "multi",
    name: { ko: "기타히로시마 3박 4일 · 매일 다른 골프장 3곳", ja: "北広島 3泊4日・毎日違うゴルフ場3か所" },
    short: { ko: "골프장 가까운 리조트 호텔에 머물며 3라운드. 골프장까지 15분이라 아침이 여유롭습니다.", ja: "ゴルフ場近くのリゾートホテルに泊まり3ラウンド。ゴルフ場まで15分で朝もゆったり。" },
    nights: 3, hotel: "h3", opts: ["std", "dlx"], price: 98000, wd: [1, 4],
    days: [{ course: 1, tee: "12:30", back: "17:30" }, { course: 3, tee: "07:45", back: "13:30" }, { course: 2, tee: "08:00", back: "14:00" }, null],
    photos: [PHOTOS.lawnTrees, PHOTOS.pines, PHOTOS.aerialTrees],
    extra: [{ ko: "그린피·카트비 3라운드", ja: "グリーンフィー・カート代 3ラウンド" }, { ko: "숙박 3박 (조식 포함)", ja: "宿泊3泊（朝食付き）" }],
    excl: [{ ko: "골프용품 렌탈", ja: "ゴルフ用品レンタル" }, { ko: "점심·개인 경비", ja: "昼食・個人的な費用" }, { ko: "석식", ja: "夕食" } ],
    kw: "Kitahiroshima 3 nights 3 rounds resort",
  },
  {
    id: 3, type: "day",
    name: { ko: "삿포로 출발 당일 골프 1라운드", ja: "札幌発 日帰りゴルフ 1ラウンド" },
    short: { ko: "아침에 시내에서 출발해 1라운드, 오후에 시내로 돌아옵니다. 여행 중 하루 가볍게.", ja: "朝に市内を出発して1ラウンド、午後に市内へ戻ります。旅行中に1日だけ気軽に。" },
    nights: 0, hotel: null, opts: [], price: 16900, wd: [3, 6],
    days: [{ course: 5, tee: "08:15", back: "14:00" }],
    photos: [PHOTOS.fromGreen, PHOTOS.swingCloud],
    extra: [{ ko: "그린피·카트비 1라운드", ja: "グリーンフィー・カート代 1ラウンド" }],
    excl: [{ ko: "골프용품 렌탈", ja: "ゴルフ用品レンタル" }, { ko: "점심·개인 경비", ja: "昼食・個人的な費用" } ],
    kw: "Sapporo day trip 1 round",
  },
  {
    id: 4, type: "multi",
    name: { ko: "신치토세 2박 3일 · 3라운드", ja: "新千歳 2泊3日・3ラウンド" },
    short: { ko: "공항 직결 호텔에 묵으며 공항 근처 골프장 3곳을 돕니다. 마지막 날도 라운드 후 바로 공항으로.", ja: "空港直結ホテルに泊まり、空港近くのゴルフ場3か所を回ります。最終日もラウンド後そのまま空港へ。" },
    nights: 2, hotel: "h4", opts: [], price: 89800, wd: [3, 6],
    days: [{ course: 4, tee: "12:00", back: "17:00" }, { course: 6, tee: "08:00", back: "14:00" }, { course: 5, tee: "07:30", back: "13:00" }],
    photos: [PHOTOS.blueSky, PHOTOS.bunkers, PHOTOS.fromGreen],
    extra: [{ ko: "그린피·카트비 3라운드", ja: "グリーンフィー・カート代 3ラウンド" }, { ko: "숙박 2박 (조식 포함)", ja: "宿泊2泊（朝食付き）" }],
    excl: [{ ko: "골프용품 렌탈", ja: "ゴルフ用品レンタル" }, { ko: "점심·개인 경비", ja: "昼食・個人的な費用" }, { ko: "석식", ja: "夕食" } ],
    kw: "New Chitose airport 2 nights 3 rounds",
  },
  {
    id: 5, type: "stay",
    name: { ko: "니도무 골프장 내 숙박 2박 3일 · 2라운드", ja: "ニドム ゴルフ場内泊 2泊3日・2ラウンド" },
    short: { ko: "골프장 안 숙소에 묵으며 니도무 클래식 코스에서 2번 라운드. 캐디가 함께합니다.", ja: "ゴルフ場内の宿に泊まり、ニドムクラシックコースで2回ラウンド。キャディ付き。" },
    nights: 2, hotel: "h5", opts: ["std", "dlx"], price: 128000, wd: [5],
    days: [{ course: 8, tee: "12:30", back: "17:30" }, { course: 8, tee: "08:00", back: "14:00" }, null],
    photos: [PHOTOS.aerialTrap, PHOTOS.aerialTrap2, PHOTOS.mower],
    extra: [{ ko: "그린피·카트비·캐디피 2라운드", ja: "グリーンフィー・カート代・キャディフィー 2ラウンド" }, { ko: "골프장 내 숙박 2박 (조식·석식 포함)", ja: "ゴルフ場内泊2泊（朝夕食付き）" }],
    excl: [{ ko: "골프용품 렌탈", ja: "ゴルフ用品レンタル" }, { ko: "점심·개인 경비", ja: "昼食・個人的な費用" } ],
    kw: "Nidom Tomakomai stay 2 rounds",
  },
  {
    id: 6, rec: true, type: "stay",
    name: { ko: "에미나 54홀 리조트 2박 3일 · 3라운드", ja: "エミナ 54ホールリゾート 2泊3日・3ラウンド" },
    short: { ko: "54홀 리조트에 묵으며 매일 다른 18홀 코스를 돕니다. 같은 골프장이라 이동 걱정이 없습니다.", ja: "54ホールのリゾートに泊まり、毎日違う18ホールを回ります。同じゴルフ場なので移動の心配なし。" },
    nights: 2, hotel: "h6", opts: ["std", "none"], price: 79800, wd: [1, 4],
    days: [{ course: 6, tee: "12:30", back: "17:30" }, { course: 6, tee: "07:30", back: "13:00" }, { course: 6, tee: "07:30", back: "13:00" }],
    photos: [PHOTOS.bunkers, PHOTOS.ball, PHOTOS.swing],
    extra: [{ ko: "그린피·카트비 3라운드", ja: "グリーンフィー・カート代 3ラウンド" }, { ko: "리조트 숙박 2박 (조식 포함)", ja: "リゾート宿泊2泊（朝食付き）" }],
    excl: [{ ko: "골프용품 렌탈", ja: "ゴルフ用品レンタル" }, { ko: "점심·개인 경비", ja: "昼食・個人的な費用" }, { ko: "석식", ja: "夕食" } ],
    kw: "Emina 54 holes Tomakomai resort 3 rounds",
  },
  {
    id: 7, type: "multi",
    name: { ko: "가볍게 1박 2일 · 2라운드", ja: "気軽に 1泊2日・2ラウンド" },
    short: { ko: "짧은 일정으로 2라운드. 스스키노 호텔이라 저녁도 알차게. 호텔 없이도 예약할 수 있습니다.", ja: "短い日程で2ラウンド。すすきののホテルで夜も充実。ホテルなしでも予約できます。" },
    nights: 1, hotel: "h1", opts: ["std", "none"], price: 45800, wd: [2, 6],
    days: [{ course: 7, tee: "12:00", back: "17:00" }, { course: 1, tee: "08:00", back: "14:00" }],
    photos: [PHOTOS.swing, PHOTOS.lawnTrees],
    extra: [{ ko: "그린피·카트비 2라운드", ja: "グリーンフィー・カート代 2ラウンド" }, { ko: "숙박 1박 (조식 포함)", ja: "宿泊1泊（朝食付き）" }],
    excl: [{ ko: "골프용품 렌탈", ja: "ゴルフ用品レンタル" }, { ko: "점심·개인 경비", ja: "昼食・個人的な費用" }, { ko: "석식", ja: "夕食" } ],
    kw: "Sapporo Susukino 1 night 2 rounds",
  },
];

export type PlaceKind = "hotel" | "station" | "airport" | "spot" | "map";
export interface Place {
  name: L2;
  kind: PlaceKind;
  area: Area;
  lat: number;
  lng: number;
  addr?: string; // Google Places 주소
  placeId?: string;
}

export const PLACES: Place[] = [
  ...HOTELS.map((h) => ({ name: h.name, kind: "hotel" as const, area: h.area, lat: h.lat, lng: h.lng })),
  { name: { ko: "JR 삿포로역 남쪽 출구", ja: "JR札幌駅 南口" }, kind: "station", area: "SAPPORO", lat: 43.0675, lng: 141.3508 },
  { name: { ko: "스스키노역", ja: "すすきの駅" }, kind: "station", area: "SAPPORO", lat: 43.0554, lng: 141.3532 },
  { name: { ko: "삿포로 TV타워 옆 버스정류장", ja: "さっぽろテレビ塔横バス停" }, kind: "spot", area: "SAPPORO", lat: 43.0611, lng: 141.3564 },
  { name: { ko: "오도리공원", ja: "大通公園" }, kind: "spot", area: "SAPPORO", lat: 43.0596, lng: 141.3485 },
  { name: { ko: "신삿포로역", ja: "新さっぽろ駅" }, kind: "station", area: "SAPPORO", lat: 43.0393, lng: 141.4734 },
  { name: { ko: "마루야마공원역", ja: "円山公園駅" }, kind: "station", area: "SAPPORO", lat: 43.0543, lng: 141.3165 },
  { name: { ko: "삿포로돔", ja: "札幌ドーム" }, kind: "spot", area: "SAPPORO", lat: 43.0151, lng: 141.4096 },
  { name: { ko: "JR 기타히로시마역", ja: "JR北広島駅" }, kind: "station", area: "KITAHIROSHIMA", lat: 42.9808, lng: 141.5636 },
  { name: { ko: "에스콘필드 홋카이도", ja: "エスコンフィールドHOKKAIDO" }, kind: "spot", area: "KITAHIROSHIMA", lat: 42.9898, lng: 141.5503 },
  { name: { ko: "JR 치토세역", ja: "JR千歳駅" }, kind: "station", area: "CHITOSE", lat: 42.8282, lng: 141.6516 },
  { name: { ko: "신치토세공항 국제선 터미널", ja: "新千歳空港 国際線ターミナル" }, kind: "airport", area: "CHITOSE", lat: 42.788, lng: 141.681 },
  { name: { ko: "신치토세공항 국내선 터미널", ja: "新千歳空港 国内線ターミナル" }, kind: "airport", area: "CHITOSE", lat: 42.7752, lng: 141.6923 },
  { name: { ko: "오타루역", ja: "小樽駅" }, kind: "station", area: "OTARU", lat: 43.1979, lng: 140.9937 },
  { name: { ko: "조잔케이 온천", ja: "定山渓温泉" }, kind: "spot", area: "JOZANKEI", lat: 42.967, lng: 141.164 },
  { name: { ko: "토마코마이역", ja: "苫小牧駅" }, kind: "station", area: "TOMAKOMAI", lat: 42.639, lng: 141.605 },
  { name: { ko: "노보리베쓰 온천", ja: "登別温泉" }, kind: "spot", area: "NOBORIBETSU", lat: 42.496, lng: 141.145 },
];

// 지역 → 골프장 지역 이동 시간(분). Google 경로를 못 받을 때만 쓰는 대략값.
// 서버 apps/api/app/settings.py TRAVEL_MIN 과 같은 값 (서버는 이 표로 희망 시간 범위를 검사, 둘을 같이 고칠 것)
export const TRAVEL: Record<Zone, Partial<Record<Area, number>>> = {
  SAPPORO: { SAPPORO: 40, KITAHIROSHIMA: 40, ENIWA: 40, CHITOSE: 60, TOMAKOMAI: 70 },
  KITAHIROSHIMA: { SAPPORO: 40, KITAHIROSHIMA: 15, ENIWA: 20, CHITOSE: 30, TOMAKOMAI: 45 },
  CHITOSE: { SAPPORO: 60, KITAHIROSHIMA: 30, ENIWA: 25, CHITOSE: 20, TOMAKOMAI: 25 },
};

export const courseOf = (id: number) => COURSES.find((c) => c.id === id)!;
export const hotelOf = (id: string | null | undefined) => (id ? HOTELS.find((h) => h.id === id) ?? null : null);
export const pkgOf = (id: number | null | undefined) => PKGS.find((p) => p.id === id) ?? null;
