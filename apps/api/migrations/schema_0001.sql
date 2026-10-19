-- 홋카이도 골프투어 초기 스키마 · MySQL 8.0+ (InnoDB, utf8mb4)
-- 기준: 상세설계 v1.3 '테이블' 시트. [v2] = 설계서와 다른 곳 (화면설계 v2 · 개발 중 결정, 설계서 반영 필요)
-- 시각(DATETIME)은 모두 UTC

-- ===== 상품 (마스터): 운영 시트 가져오기(B-05)로만 바뀜 =====
CREATE TABLE golf_course (
  id          VARCHAR(20)  NOT NULL PRIMARY KEY,
  name_ko     VARCHAR(100) NOT NULL,
  name_ja     VARCHAR(100) NOT NULL,
  name_en     VARCHAR(100) NULL,               -- [v2] 영문 검색 (V-01 한·일·영)
  area        VARCHAR(30)  NOT NULL,
  address     VARCHAR(200) NULL,
  lat         DECIMAL(9,6) NOT NULL,
  lng         DECIMAL(9,6) NOT NULL,
  place_id    VARCHAR(100) NULL,               -- [v2] Google 장소 ID
  holes       SMALLINT     NOT NULL,
  caddie      TINYINT(1)   NOT NULL DEFAULT 0,
  rating      DECIMAL(2,1) NULL,
  intro_ko    TEXT NULL,
  intro_ja    TEXT NULL,
  photo_url   VARCHAR(300) NULL
);

CREATE TABLE hotel (
  id            VARCHAR(20)  NOT NULL PRIMARY KEY,
  name_ko       VARCHAR(100) NOT NULL,
  name_ja       VARCHAR(100) NOT NULL,
  name_en       VARCHAR(100) NULL,             -- [v2]
  area          VARCHAR(30)  NOT NULL,
  zone          VARCHAR(10)  NOT NULL,
  near_ko       VARCHAR(60)  NULL,
  near_ja       VARCHAR(60)  NULL,
  lat           DECIMAL(9,6) NOT NULL,
  lng           DECIMAL(9,6) NOT NULL,
  rating        DECIMAL(2,1) NULL,
  photo_url     VARCHAR(300) NULL,
  site_hotel_id VARCHAR(40)  NULL,
  CONSTRAINT hotel_zone_chk CHECK (zone IN ('CITY','RESORT'))
);

CREATE TABLE package (
  id               VARCHAR(20)  NOT NULL PRIMARY KEY,
  name_ko          VARCHAR(100) NOT NULL,
  name_ja          VARCHAR(100) NOT NULL,
  type             VARCHAR(10)  NOT NULL,
  nights           SMALLINT     NOT NULL,
  base_price       INT          NOT NULL,
  single_add       INT          NULL,          -- [v2] 1인실 추가 요금(1명당). NULL이면 설정값 SINGLE_ADD
  default_hotel_id VARCHAR(20)  NULL,
  dep_weekdays     VARCHAR(20)  NOT NULL,      -- 'MON,THU'
  season_from      CHAR(5)      NOT NULL,      -- 'MM-DD' (해마다 반복이라 date 대신 월-일)
  season_to        CHAR(5)      NOT NULL,
  is_recommended   TINYINT(1)   NOT NULL DEFAULT 0,
  desc_ko          TEXT NULL,
  desc_ja          TEXT NULL,
  includes_ko      TEXT NULL,
  includes_ja      TEXT NULL,
  search_kw        TEXT NULL,                  -- [v2] 영문 검색어
  photo_url        VARCHAR(300) NULL,
  published        TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT package_type_chk CHECK (type IN ('multi','stay','day')),
  CONSTRAINT package_nights_chk CHECK (nights >= 0),
  CONSTRAINT package_price_chk CHECK (base_price >= 0),
  CONSTRAINT package_hotel_fk FOREIGN KEY (default_hotel_id) REFERENCES hotel(id)
);

CREATE TABLE package_day (
  package_id  VARCHAR(20) NOT NULL,
  day_no      SMALLINT    NOT NULL,
  course_id   VARCHAR(20) NULL,
  tee_time    TIME NULL,
  depart_time TIME NULL,
  overnight   TINYINT(1)  NOT NULL DEFAULT 0,
  PRIMARY KEY (package_id, day_no),
  CONSTRAINT package_day_pkg_fk FOREIGN KEY (package_id) REFERENCES package(id) ON DELETE CASCADE,
  CONSTRAINT package_day_course_fk FOREIGN KEY (course_id) REFERENCES golf_course(id)
);

CREATE TABLE hotel_option (
  id          VARCHAR(20) NOT NULL PRIMARY KEY,
  package_id  VARCHAR(20) NOT NULL,
  hotel_id    VARCHAR(20) NULL,                -- NULL = 숙박 없음
  code        VARCHAR(20) NOT NULL,
  room_type   VARCHAR(20) NOT NULL,            -- [v2] std / dlx / none (single 삭제 → booking.single_count)
  price_diff  INT         NOT NULL DEFAULT 0,
  is_default  TINYINT(1)  NOT NULL DEFAULT 0,
  sort        SMALLINT    NOT NULL DEFAULT 0,
  UNIQUE KEY hotel_option_pkg_code (package_id, code),
  CONSTRAINT hotel_option_room_chk CHECK (room_type IN ('std','dlx','none')),
  CONSTRAINT hotel_option_pkg_fk FOREIGN KEY (package_id) REFERENCES package(id) ON DELETE CASCADE,
  CONSTRAINT hotel_option_hotel_fk FOREIGN KEY (hotel_id) REFERENCES hotel(id)
);

CREATE TABLE service_area (
  id         VARCHAR(20) NOT NULL PRIMARY KEY,
  name_ko    VARCHAR(50) NOT NULL,
  name_ja    VARCHAR(50) NOT NULL,
  shape      JSON        NOT NULL,             -- v1.3 polygon. {type:'circle',lat,lng,r} 또는 {type:'polygon',points:[[lat,lng],...]} (기준 T-1)
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

-- ===== 출발편 (자동): B-04가 만들고 B-01이 판정 =====
CREATE TABLE departure (
  id           VARCHAR(30) NOT NULL PRIMARY KEY,  -- PKG-001-20261015
  package_id   VARCHAR(20) NOT NULL,
  dep_date     DATE        NOT NULL,
  capacity     SMALLINT    NOT NULL DEFAULT 30,
  min_people   SMALLINT    NOT NULL DEFAULT 20,
  booked_count SMALLINT    NOT NULL DEFAULT 0,
  judge_date   DATE        NOT NULL,
  status       VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  judged_at    DATETIME(3) NULL,
  UNIQUE KEY departure_pkg_date (package_id, dep_date),
  KEY departure_date_idx (dep_date),
  KEY departure_judge_idx (status, judge_date),
  CONSTRAINT departure_status_chk CHECK (status IN ('OPEN','GO','CANCEL','DONE')),
  CONSTRAINT departure_booked_chk CHECK (booked_count >= 0 AND booked_count <= capacity),
  CONSTRAINT departure_pkg_fk FOREIGN KEY (package_id) REFERENCES package(id)
);

CREATE TABLE seat_hold (
  id           BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  departure_id VARCHAR(30) NOT NULL,
  member_id    VARCHAR(40) NOT NULL,
  people       SMALLINT    NOT NULL,
  expires_at   DATETIME(3) NOT NULL,
  KEY seat_hold_dep_idx (departure_id, expires_at),
  KEY seat_hold_member_idx (member_id),
  CONSTRAINT seat_hold_people_chk CHECK (people >= 1),
  CONSTRAINT seat_hold_dep_fk FOREIGN KEY (departure_id) REFERENCES departure(id)
);

-- ===== 예약 =====
-- [v2] 예약번호 일련번호 (L-09). 출발일마다 마지막 번호를 원자적으로 올림
CREATE TABLE booking_seq (
  dep_date DATE NOT NULL PRIMARY KEY,
  last_no  INT  NOT NULL
);

CREATE TABLE booking (
  no              VARCHAR(20) NOT NULL PRIMARY KEY, -- GT-YYMMDD-NNNN
  member_id       VARCHAR(40) NOT NULL,             -- 메인 사이트 회원 ID (회원 테이블 없음)
  departure_id    VARCHAR(30) NOT NULL,
  hotel_option_id VARCHAR(20) NULL,
  people          SMALLINT    NOT NULL,
  single_count    SMALLINT    NOT NULL DEFAULT 0,   -- [v2] 1인실 이용 인원 (객실 구성)
  unit_price      INT         NOT NULL,
  total_price     INT         NOT NULL,
  currency        CHAR(3)     NOT NULL DEFAULT 'JPY',
  status          VARCHAR(12) NOT NULL,
  payment_id      VARCHAR(40) NULL,
  lang            CHAR(2)     NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  canceled_at     DATETIME(3) NULL,
  cancel_by       VARCHAR(10) NULL,
  cancel_note     VARCHAR(200) NULL,
  refund_id       VARCHAR(40) NULL,
  refund_status   VARCHAR(10) NULL,
  UNIQUE KEY booking_payment_uq (payment_id),       -- [v2] 같은 결제로 두 번 예약 방지
  KEY booking_member_idx (member_id, created_at),
  KEY booking_dep_idx (departure_id),
  CONSTRAINT booking_people_chk CHECK (people BETWEEN 1 AND 30),
  CONSTRAINT booking_status_chk CHECK (status IN ('CONFIRMED','USER_CANCEL','OP_CANCEL','DONE')),
  CONSTRAINT booking_lang_chk CHECK (lang IN ('ko','ja')),
  CONSTRAINT booking_cancel_by_chk CHECK (cancel_by IN ('USER','OP','SYSTEM')),
  CONSTRAINT booking_refund_chk CHECK (refund_status IN ('REQUESTED','DONE','FAIL')),
  CONSTRAINT booking_dep_fk FOREIGN KEY (departure_id) REFERENCES departure(id),
  CONSTRAINT booking_opt_fk FOREIGN KEY (hotel_option_id) REFERENCES hotel_option(id)
);

CREATE TABLE booking_stop (
  booking_no  VARCHAR(20)  NOT NULL,
  kind        VARCHAR(5)   NOT NULL,
  place_name  VARCHAR(100) NOT NULL,
  place_id    VARCHAR(100) NULL,
  address     VARCHAR(200) NULL,
  lat         DECIMAL(9,6) NOT NULL,
  lng         DECIMAL(9,6) NOT NULL,
  area_id     VARCHAR(20)  NOT NULL,
  memo        VARCHAR(200) NULL,
  stop_order  SMALLINT NULL,
  pickup_time TIME NULL,
  PRIMARY KEY (booking_no, kind),
  CONSTRAINT booking_stop_kind_chk CHECK (kind IN ('PICK','DROP')),
  CONSTRAINT booking_stop_booking_fk FOREIGN KEY (booking_no) REFERENCES booking(no) ON DELETE CASCADE,
  CONSTRAINT booking_stop_area_fk FOREIGN KEY (area_id) REFERENCES service_area(id)
);

CREATE TABLE booking_member (
  booking_no   VARCHAR(20)  NOT NULL,
  seq          SMALLINT     NOT NULL,
  is_rep       TINYINT(1)   NOT NULL DEFAULT 0,
  name_ko      VARCHAR(30)  NULL,
  name_en      VARCHAR(60)  NULL,
  country_code VARCHAR(6)   NULL,                -- [v2] 연락처 국가번호
  phone        VARCHAR(30)  NULL,
  email        VARCHAR(100) NULL,
  PRIMARY KEY (booking_no, seq),
  CONSTRAINT booking_member_booking_fk FOREIGN KEY (booking_no) REFERENCES booking(no) ON DELETE CASCADE
);

CREATE TABLE notification (
  id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  booking_no VARCHAR(20) NOT NULL,
  kind       VARCHAR(12) NOT NULL,
  channel    VARCHAR(10) NOT NULL DEFAULT 'EMAIL',
  sent_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  result     VARCHAR(10) NOT NULL,
  error      VARCHAR(200) NULL,
  KEY notification_booking_idx (booking_no),
  CONSTRAINT notification_booking_fk FOREIGN KEY (booking_no) REFERENCES booking(no)
);
