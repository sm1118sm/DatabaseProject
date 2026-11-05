-- 스터디모아 스키마 v5 (MySQL 8.0+) — ERD: db/ERD.md
-- 실행: npm run db:init -- --force   (studycafe DB 를 지우고 다시 만든다)

DROP DATABASE IF EXISTS studycafe;
CREATE DATABASE studycafe
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE studycafe;

-- 회원 (일반 이용자)
CREATE TABLE member (
  member_id     BIGINT       NOT NULL AUTO_INCREMENT,
  email         VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255),
  name          VARCHAR(50)  NOT NULL,
  phone         VARCHAR(20),                  -- 숫자만 저장(01012345678). 한 번호로 한 번만 가입
  phone_verified BOOLEAN     NOT NULL DEFAULT FALSE,
  point_balance INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id),
  UNIQUE KEY uq_member_email (email),
  UNIQUE KEY uq_member_phone (phone),
  CONSTRAINT ck_member_point CHECK (point_balance >= 0)
) ENGINE=InnoDB;

-- 휴대폰 인증 요청 (문자 인증번호). 코드는 해시로만 저장하고 만료·시도 횟수를 제한한다.
CREATE TABLE phone_verification (
  verify_id   BIGINT      NOT NULL AUTO_INCREMENT,
  phone       VARCHAR(20) NOT NULL,
  code_hash   VARCHAR(64) NOT NULL,
  attempts    TINYINT     NOT NULL DEFAULT 0,
  expires_at  DATETIME    NOT NULL,
  verified_at DATETIME,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (verify_id),
  KEY idx_pv_phone (phone, created_at)
) ENGINE=InnoDB;

-- 지역 (시·도 / 시·군·구). 세종은 시·군·구가 없어 sigungu 에 시·도 이름을 넣는다.
CREATE TABLE region (
  region_id  BIGINT        NOT NULL AUTO_INCREMENT,
  sido       VARCHAR(20)   NOT NULL,
  sigungu    VARCHAR(30)   NOT NULL,
  center_lat DECIMAL(10,7),
  center_lng DECIMAL(10,7),
  PRIMARY KEY (region_id),
  UNIQUE KEY uq_region (sido, sigungu)
) ENGINE=InnoDB;

-- 스터디카페. 이름·주소·전화·좌표·링크는 카카오 장소 검색 정보이고 요금·좌석은 카카오가 주지 않는다.
CREATE TABLE cafe (
  cafe_id        BIGINT        NOT NULL AUTO_INCREMENT,
  kakao_place_id VARCHAR(30),
  region_id      BIGINT        NOT NULL,
  name           VARCHAR(100)  NOT NULL,
  address        VARCHAR(200)  NOT NULL,
  phone          VARCHAR(20),
  latitude       DECIMAL(10,7) NOT NULL,
  longitude      DECIMAL(10,7) NOT NULL,
  place_url      VARCHAR(200),
  open_time      TIME          NOT NULL DEFAULT '00:00:00',
  close_time     TIME          NOT NULL DEFAULT '23:59:59',
  info_source    ENUM('KAKAO','MANUAL') NOT NULL DEFAULT 'KAKAO',
  fetched_at     DATETIME,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cafe_id),
  UNIQUE KEY uq_cafe_kakao (kakao_place_id),
  KEY idx_cafe_region (region_id),
  CONSTRAINT fk_cafe_region FOREIGN KEY (region_id) REFERENCES region (region_id)
) ENGINE=InnoDB;

-- 시설 종류 (스낵바·프린터 등) 와 카페별 보유 시설
-- 좌석 유형 (일반석·집중석·스터디룸)
CREATE TABLE seat_type (
  seat_type_id TINYINT     NOT NULL AUTO_INCREMENT,
  code         VARCHAR(20) NOT NULL,
  name         VARCHAR(30) NOT NULL,
  is_room      BOOLEAN     NOT NULL DEFAULT FALSE,
  PRIMARY KEY (seat_type_id),
  UNIQUE KEY uq_seat_type_code (code)
) ENGINE=InnoDB;

-- 좌석/룸 (예약 단위, 한 행이 좌석 하나)
CREATE TABLE seat (
  seat_id      BIGINT      NOT NULL AUTO_INCREMENT,
  cafe_id      BIGINT      NOT NULL,
  seat_type_id TINYINT     NOT NULL,
  label        VARCHAR(50) NOT NULL,
  capacity     INT         NOT NULL DEFAULT 1,
  PRIMARY KEY (seat_id),
  UNIQUE KEY uq_seat_label (cafe_id, label),
  KEY idx_seat_type (seat_type_id),
  CONSTRAINT fk_seat_cafe FOREIGN KEY (cafe_id)      REFERENCES cafe (cafe_id) ON DELETE CASCADE,
  CONSTRAINT fk_seat_type FOREIGN KEY (seat_type_id) REFERENCES seat_type (seat_type_id),
  CONSTRAINT ck_seat_capacity CHECK (capacity > 0)
) ENGINE=InnoDB;

-- 요금제 (카페 × 좌석유형 × 이용권종류). 시간당 요금 비교는 HOURLY 기준.
-- price_source: EXAMPLE = 화면에 '예시'로 표시하는 가상 값, VERIFIED = 사람이 직접 확인한 값(출처·확인일 필수)
CREATE TABLE price_plan (
  plan_id      BIGINT       NOT NULL AUTO_INCREMENT,
  cafe_id      BIGINT       NOT NULL,
  seat_type_id TINYINT      NOT NULL,
  plan_type    ENUM('HOURLY','DAILY','WEEKLY','MONTHLY') NOT NULL,
  price        INT          NOT NULL,
  price_source ENUM('EXAMPLE','VERIFIED') NOT NULL DEFAULT 'EXAMPLE',
  source_note  VARCHAR(200),
  verified_at  DATE,
  PRIMARY KEY (plan_id),
  UNIQUE KEY uq_price_plan (cafe_id, seat_type_id, plan_type),
  CONSTRAINT fk_plan_cafe FOREIGN KEY (cafe_id)      REFERENCES cafe (cafe_id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_type FOREIGN KEY (seat_type_id) REFERENCES seat_type (seat_type_id),
  CONSTRAINT ck_plan_price CHECK (price >= 0),
  CONSTRAINT ck_plan_verified CHECK (price_source = 'EXAMPLE' OR (source_note IS NOT NULL AND verified_at IS NOT NULL))
) ENGINE=InnoDB;

-- 예약 (사이트는 예약 즉시 확정이라 PENDING 상태는 쓰지 않는다)
CREATE TABLE reservation (
  reservation_id BIGINT   NOT NULL AUTO_INCREMENT,
  member_id      BIGINT   NOT NULL,
  seat_id        BIGINT   NOT NULL,
  start_at       DATETIME NOT NULL,
  end_at         DATETIME NOT NULL,
  status         ENUM('CONFIRMED','CANCELED','COMPLETED','NO_SHOW') NOT NULL DEFAULT 'CONFIRMED',
  total_price    INT      NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (reservation_id),
  KEY idx_resv_member (member_id, start_at),
  KEY idx_resv_seat_time (seat_id, start_at, end_at),
  CONSTRAINT fk_resv_member FOREIGN KEY (member_id) REFERENCES member (member_id),
  CONSTRAINT fk_resv_seat   FOREIGN KEY (seat_id)   REFERENCES seat (seat_id),
  CONSTRAINT ck_resv_time   CHECK (end_at > start_at),
  CONSTRAINT ck_resv_price  CHECK (total_price >= 0)
) ENGINE=InnoDB;

-- 예약 점유 슬롯 (1시간 단위). (seat_id, slot_start) 기본키가 같은 좌석·같은 시간대 이중 예약을 DB 레벨에서 차단한다.
-- 취소·노쇼 시 해당 예약의 슬롯을 삭제해 자리를 반환한다.
CREATE TABLE reservation_slot (
  seat_id        BIGINT   NOT NULL,
  slot_start     DATETIME NOT NULL,
  reservation_id BIGINT   NOT NULL,
  PRIMARY KEY (seat_id, slot_start),
  KEY idx_slot_resv (reservation_id),
  CONSTRAINT fk_slot_seat FOREIGN KEY (seat_id)        REFERENCES seat (seat_id),
  CONSTRAINT fk_slot_resv FOREIGN KEY (reservation_id) REFERENCES reservation (reservation_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 결제 (예약 1건당 1결제)
CREATE TABLE payment (
  payment_id     BIGINT   NOT NULL AUTO_INCREMENT,
  reservation_id BIGINT   NOT NULL,
  amount         INT      NOT NULL,
  method         ENUM('CARD','TRANSFER','KAKAO','POINT') NOT NULL,
  status         ENUM('PAID','REFUNDED','FAILED') NOT NULL DEFAULT 'PAID',
  refund_amount  INT,
  paid_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  UNIQUE KEY uq_payment_resv (reservation_id),
  CONSTRAINT fk_payment_resv FOREIGN KEY (reservation_id) REFERENCES reservation (reservation_id),
  CONSTRAINT ck_payment_amount CHECK (amount >= 0),
  CONSTRAINT ck_payment_refund CHECK (refund_amount IS NULL OR (refund_amount >= 0 AND refund_amount <= amount))
) ENGINE=InnoDB;

-- 포인트 내역 (적립 +, 사용 -). member.point_balance 는 이 합계의 조회용 값
CREATE TABLE point_history (
  point_id       BIGINT       NOT NULL AUTO_INCREMENT,
  member_id      BIGINT       NOT NULL,
  reservation_id BIGINT,
  delta          INT          NOT NULL,
  reason         VARCHAR(100) NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (point_id),
  KEY idx_point_member (member_id, created_at),
  CONSTRAINT fk_point_member FOREIGN KEY (member_id)      REFERENCES member (member_id) ON DELETE CASCADE,
  CONSTRAINT fk_point_resv   FOREIGN KEY (reservation_id) REFERENCES reservation (reservation_id) ON DELETE SET NULL,
  CONSTRAINT ck_point_delta  CHECK (delta <> 0)
) ENGINE=InnoDB;

-- 후기 (이용한 예약에 대해 1건)
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
