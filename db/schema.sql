-- 스터디카페 통합 예약 및 비교 플랫폼 스키마 (MySQL 8.0+)
-- 실행: mysql -u root -p < db/schema.sql

DROP DATABASE IF EXISTS studycafe;
CREATE DATABASE studycafe
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE studycafe;

-- 회원 (일반 이용자 / 카페 사장 / 관리자)
CREATE TABLE member (
  member_id     BIGINT       NOT NULL AUTO_INCREMENT,
  email         VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(50)  NOT NULL,
  phone         VARCHAR(20),
  role          ENUM('USER','OWNER','ADMIN') NOT NULL DEFAULT 'USER',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id),
  UNIQUE KEY uq_member_email (email)
) ENGINE=InnoDB;

-- 지역 (시·도 / 시·군·구). 구 단위 평균 비교의 기준 테이블
CREATE TABLE region (
  region_id BIGINT      NOT NULL AUTO_INCREMENT,
  sido      VARCHAR(20) NOT NULL,
  sigungu   VARCHAR(30) NOT NULL,
  PRIMARY KEY (region_id),
  UNIQUE KEY uq_region (sido, sigungu)
) ENGINE=InnoDB;

-- 스터디카페 (카카오 로컬 API 장소 정보 기반)
CREATE TABLE cafe (
  cafe_id        BIGINT        NOT NULL AUTO_INCREMENT,
  kakao_place_id VARCHAR(30),
  owner_id       BIGINT,
  region_id      BIGINT        NOT NULL,
  name           VARCHAR(100)  NOT NULL,
  address        VARCHAR(200)  NOT NULL,
  phone          VARCHAR(20),
  latitude       DECIMAL(10,7) NOT NULL,
  longitude      DECIMAL(10,7) NOT NULL,
  open_time      TIME          NOT NULL DEFAULT '00:00:00',
  close_time     TIME          NOT NULL DEFAULT '23:59:59',
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cafe_id),
  UNIQUE KEY uq_cafe_kakao (kakao_place_id),
  KEY idx_cafe_region (region_id),
  CONSTRAINT fk_cafe_owner  FOREIGN KEY (owner_id)  REFERENCES member (member_id) ON DELETE SET NULL,
  CONSTRAINT fk_cafe_region FOREIGN KEY (region_id) REFERENCES region (region_id)
) ENGINE=InnoDB;

-- 좌석/룸 (예약 단위)
CREATE TABLE room (
  room_id   BIGINT      NOT NULL AUTO_INCREMENT,
  cafe_id   BIGINT      NOT NULL,
  name      VARCHAR(50) NOT NULL,
  room_type ENUM('SEAT','ROOM') NOT NULL DEFAULT 'SEAT',
  capacity  INT         NOT NULL DEFAULT 1,
  PRIMARY KEY (room_id),
  UNIQUE KEY uq_room_name (cafe_id, name),
  CONSTRAINT fk_room_cafe FOREIGN KEY (cafe_id) REFERENCES cafe (cafe_id) ON DELETE CASCADE,
  CONSTRAINT ck_room_capacity CHECK (capacity > 0)
) ENGINE=InnoDB;

-- 요금제 (카페 × 좌석유형 × 이용권종류). 시간당 요금 비교는 HOURLY 기준
CREATE TABLE price_plan (
  plan_id   BIGINT NOT NULL AUTO_INCREMENT,
  cafe_id   BIGINT NOT NULL,
  room_type ENUM('SEAT','ROOM') NOT NULL,
  plan_type ENUM('HOURLY','DAILY','WEEKLY','MONTHLY') NOT NULL,
  price     INT    NOT NULL,
  PRIMARY KEY (plan_id),
  UNIQUE KEY uq_price_plan (cafe_id, room_type, plan_type),
  CONSTRAINT fk_plan_cafe FOREIGN KEY (cafe_id) REFERENCES cafe (cafe_id) ON DELETE CASCADE,
  CONSTRAINT ck_plan_price CHECK (price >= 0)
) ENGINE=InnoDB;

-- 예약
CREATE TABLE reservation (
  reservation_id BIGINT   NOT NULL AUTO_INCREMENT,
  member_id      BIGINT   NOT NULL,
  room_id        BIGINT   NOT NULL,
  start_at       DATETIME NOT NULL,
  end_at         DATETIME NOT NULL,
  status         ENUM('PENDING','CONFIRMED','CANCELED','COMPLETED','NO_SHOW') NOT NULL DEFAULT 'PENDING',
  total_price    INT      NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reservation_id),
  KEY idx_resv_member (member_id, start_at),
  KEY idx_resv_room_time (room_id, start_at, end_at),
  CONSTRAINT fk_resv_member FOREIGN KEY (member_id) REFERENCES member (member_id),
  CONSTRAINT fk_resv_room   FOREIGN KEY (room_id)   REFERENCES room (room_id),
  CONSTRAINT ck_resv_time   CHECK (end_at > start_at),
  CONSTRAINT ck_resv_price  CHECK (total_price >= 0)
) ENGINE=InnoDB;

-- 예약 점유 슬롯 (1시간 단위). (room_id, slot_start) 유일 제약으로
-- 같은 좌석·같은 시간대 이중 예약을 DB 레벨에서 차단한다.
-- 예약 취소/노쇼 시 해당 예약의 슬롯을 삭제해 자리를 반환한다.
CREATE TABLE reservation_slot (
  room_id        BIGINT   NOT NULL,
  slot_start     DATETIME NOT NULL,
  reservation_id BIGINT   NOT NULL,
  PRIMARY KEY (room_id, slot_start),
  KEY idx_slot_resv (reservation_id),
  CONSTRAINT fk_slot_room FOREIGN KEY (room_id) REFERENCES room (room_id),
  CONSTRAINT fk_slot_resv FOREIGN KEY (reservation_id) REFERENCES reservation (reservation_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 결제 (예약 1건당 1결제)
CREATE TABLE payment (
  payment_id     BIGINT   NOT NULL AUTO_INCREMENT,
  reservation_id BIGINT   NOT NULL,
  amount         INT      NOT NULL,
  method         ENUM('CARD','TRANSFER','POINT') NOT NULL,
  status         ENUM('PAID','REFUNDED','FAILED') NOT NULL DEFAULT 'PAID',
  paid_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  UNIQUE KEY uq_payment_resv (reservation_id),
  CONSTRAINT fk_payment_resv FOREIGN KEY (reservation_id) REFERENCES reservation (reservation_id),
  CONSTRAINT ck_payment_amount CHECK (amount >= 0)
) ENGINE=InnoDB;

-- 후기 (이용 완료한 예약에 대해 1건)
CREATE TABLE review (
  review_id      BIGINT   NOT NULL AUTO_INCREMENT,
  member_id      BIGINT   NOT NULL,
  cafe_id        BIGINT   NOT NULL,
  reservation_id BIGINT,
  rating         TINYINT  NOT NULL,
  content        TEXT,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id),
  UNIQUE KEY uq_review_resv (reservation_id),
  KEY idx_review_cafe (cafe_id, created_at),
  CONSTRAINT fk_review_member FOREIGN KEY (member_id)      REFERENCES member (member_id),
  CONSTRAINT fk_review_cafe   FOREIGN KEY (cafe_id)        REFERENCES cafe (cafe_id) ON DELETE CASCADE,
  CONSTRAINT fk_review_resv   FOREIGN KEY (reservation_id) REFERENCES reservation (reservation_id) ON DELETE SET NULL,
  CONSTRAINT ck_review_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- 즐겨찾기 (회원 N:M 카페)
CREATE TABLE favorite (
  member_id  BIGINT   NOT NULL,
  cafe_id    BIGINT   NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, cafe_id),
  CONSTRAINT fk_fav_member FOREIGN KEY (member_id) REFERENCES member (member_id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_cafe   FOREIGN KEY (cafe_id)   REFERENCES cafe (cafe_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 뷰: 카페별 시간당 요금과 같은 시·구 평균 대비 차이 (윈도우 함수)
CREATE VIEW v_cafe_price_vs_region AS
SELECT
  c.cafe_id,
  c.name                                   AS cafe_name,
  r.sido,
  r.sigungu,
  p.room_type,
  p.price                                  AS hourly_price,
  ROUND(AVG(p.price) OVER (PARTITION BY r.region_id, p.room_type), 0) AS region_avg_price,
  p.price - ROUND(AVG(p.price) OVER (PARTITION BY r.region_id, p.room_type), 0) AS diff_from_avg,
  COUNT(*) OVER (PARTITION BY r.region_id, p.room_type)               AS cafe_count_in_region
FROM price_plan p
JOIN cafe   c ON c.cafe_id   = p.cafe_id
JOIN region r ON r.region_id = c.region_id
WHERE p.plan_type = 'HOURLY';
