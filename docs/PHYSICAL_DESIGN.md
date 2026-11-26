# 스터디픽 물리적 설계서

작성일 2026-11-26

강의자료 431쪽의 열 순서에 맞춘 테이블 명세서다. 현재 db/schema.sql과 ERD 모델을 대조하여 생성했으며 DB에 접속하거나 구조를 변경하지 않는다.

설계 기준은 MySQL 8.4, InnoDB, utf8mb4, utf8mb4_0900_ai_ci이다. 관리형 DB의 실제 디스크 배치·오프셋·페이지 크기를 변경하거나 측정했다는 의미는 아니다.

널허용 Y는 NULL 가능, N은 NULL 불가이다. 기본값의 -는 명시적인 DEFAULT가 없다는 뜻이다. NULL 가능 열은 생략 시 NULL이 될 수 있다. AUTO_INCREMENT와 ON UPDATE는 기본값과 구분한다.

같은 UNIQUE 이름이 여러 열에 붙으면 그 조합 전체가 유일하다. NULL 허용 UNIQUE는 모든 행을 식별하는 후보키와 구분한다.

보조 인덱스 17개는 SQL에 직접 선언한 기본키 외 인덱스 수다. 외래키용 자동 생성 인덱스는 포함하지 않으며, 성능 향상은 실행계획·측정 없이 단정하지 않는다.

예약과 시간대의 좌석 일치, 잔액과 포인트 내역 합계, 후기와 예약의 회원·카페 일치는 독립 FK·행 단위 CHECK만으로 보장되지 않는다. 트랜잭션과 별도의 읽기 전용 SQL 검사를 함께 사용한다.

테이블 12개 · 속성 84개 · PK 12개 · FK 15개 · UNIQUE 9개 · CHECK 10개 · 명시적 보조 인덱스 17개

## MEMBER 회원

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| member_id | BIGINT | N | - | PK | - | AUTO_INCREMENT |
| email | VARCHAR(100) | N | - | - | - | uq_member_email (email) |
| password_hash | VARCHAR(255) | Y | - | - | - | - |
| name | VARCHAR(50) | N | - | - | - | - |
| phone | VARCHAR(20) | Y | - | - | - | uq_member_phone (phone) |
| phone_verified | BOOLEAN | N | FALSE | - | - | - |
| point_balance | INT | N | 0 | - | - | ck_member_point |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | - | - | - |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| uq_member_email | UNIQUE | email |
| uq_member_phone | UNIQUE | phone |

### CHECK 조건

| 이름 | 조건 |
| --- | --- |
| ck_member_point | point_balance >= 0 |

## PHONE_VERIFICATION 휴대폰 인증

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| verify_id | BIGINT | N | - | PK | - | AUTO_INCREMENT |
| phone | VARCHAR(20) | N | - | - | - | - |
| code_hash | VARCHAR(64) | N | - | - | - | - |
| attempts | TINYINT | N | 0 | - | - | - |
| expires_at | DATETIME | N | - | - | - | - |
| verified_at | DATETIME | Y | - | - | - | - |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | - | - | - |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| idx_pv_phone | 일반 | phone, created_at |

## REGION 지역

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| region_id | BIGINT | N | - | PK | - | AUTO_INCREMENT |
| sido | VARCHAR(20) | N | - | - | - | uq_region (sido, sigungu) |
| sigungu | VARCHAR(30) | N | - | - | - | uq_region (sido, sigungu) |
| center_lat | DECIMAL(10,7) | Y | - | - | - | - |
| center_lng | DECIMAL(10,7) | Y | - | - | - | - |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| uq_region | UNIQUE | sido, sigungu |

## CAFE 카페

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| cafe_id | BIGINT | N | - | PK | - | AUTO_INCREMENT |
| kakao_place_id | VARCHAR(30) | Y | - | - | - | uq_cafe_kakao (kakao_place_id) |
| region_id | BIGINT | N | - | - | region.region_id | - |
| name | VARCHAR(100) | N | - | - | - | - |
| address | VARCHAR(200) | N | - | - | - | - |
| phone | VARCHAR(20) | Y | - | - | - | - |
| latitude | DECIMAL(10,7) | N | - | - | - | - |
| longitude | DECIMAL(10,7) | N | - | - | - | - |
| place_url | VARCHAR(200) | Y | - | - | - | - |
| open_time | TIME | N | '00:00:00' | - | - | - |
| close_time | TIME | N | '23:59:59' | - | - | - |
| info_source | ENUM('KAKAO','MANUAL') | N | 'KAKAO' | - | - | - |
| fetched_at | DATETIME | Y | - | - | - | - |
| is_active | BOOLEAN | N | TRUE | - | - | - |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | - | - | - |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| uq_cafe_kakao | UNIQUE | kakao_place_id |
| idx_cafe_region | 일반 | region_id |

### 참조 무결성

| 열 | 참조 대상 | ON DELETE | ON UPDATE |
| --- | --- | --- | --- |
| region_id | region.region_id | RESTRICT | RESTRICT |

## SEAT_TYPE 좌석 유형

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| seat_type_id | TINYINT | N | - | PK | - | AUTO_INCREMENT |
| code | VARCHAR(20) | N | - | - | - | uq_seat_type_code (code) |
| name | VARCHAR(30) | N | - | - | - | - |
| is_room | BOOLEAN | N | FALSE | - | - | - |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| uq_seat_type_code | UNIQUE | code |

## SEAT 좌석

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| seat_id | BIGINT | N | - | PK | - | AUTO_INCREMENT |
| cafe_id | BIGINT | N | - | - | cafe.cafe_id | uq_seat_label (cafe_id, label) |
| seat_type_id | TINYINT | N | - | - | seat_type.seat_type_id | - |
| label | VARCHAR(50) | N | - | - | - | uq_seat_label (cafe_id, label) |
| capacity | INT | N | 1 | - | - | ck_seat_capacity |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| uq_seat_label | UNIQUE | cafe_id, label |
| idx_seat_type | 일반 | seat_type_id |

### CHECK 조건

| 이름 | 조건 |
| --- | --- |
| ck_seat_capacity | capacity > 0 |

### 참조 무결성

| 열 | 참조 대상 | ON DELETE | ON UPDATE |
| --- | --- | --- | --- |
| cafe_id | cafe.cafe_id | CASCADE | RESTRICT |
| seat_type_id | seat_type.seat_type_id | RESTRICT | RESTRICT |

## PRICE_PLAN 요금제

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| plan_id | BIGINT | N | - | PK | - | AUTO_INCREMENT |
| cafe_id | BIGINT | N | - | - | cafe.cafe_id | uq_price_plan (cafe_id, seat_type_id, plan_type) |
| seat_type_id | TINYINT | N | - | - | seat_type.seat_type_id | uq_price_plan (cafe_id, seat_type_id, plan_type) |
| plan_type | ENUM('HOURLY','DAILY','WEEKLY','MONTHLY') | N | - | - | - | uq_price_plan (cafe_id, seat_type_id, plan_type) |
| price | INT | N | - | - | - | ck_plan_price |
| price_source | ENUM('EXAMPLE','VERIFIED') | N | 'EXAMPLE' | - | - | ck_plan_verified |
| source_note | VARCHAR(200) | Y | - | - | - | ck_plan_verified |
| verified_at | DATE | Y | - | - | - | ck_plan_verified |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| uq_price_plan | UNIQUE | cafe_id, seat_type_id, plan_type |

### CHECK 조건

| 이름 | 조건 |
| --- | --- |
| ck_plan_price | price >= 0 |
| ck_plan_verified | price_source = 'EXAMPLE' OR (source_note IS NOT NULL AND verified_at IS NOT NULL) |

### 참조 무결성

| 열 | 참조 대상 | ON DELETE | ON UPDATE |
| --- | --- | --- | --- |
| cafe_id | cafe.cafe_id | CASCADE | RESTRICT |
| seat_type_id | seat_type.seat_type_id | RESTRICT | RESTRICT |

## RESERVATION 예약

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| reservation_id | BIGINT | N | - | PK | - | AUTO_INCREMENT |
| member_id | BIGINT | N | - | - | member.member_id | - |
| seat_id | BIGINT | N | - | - | seat.seat_id | - |
| start_at | DATETIME | N | - | - | - | ck_resv_time |
| end_at | DATETIME | N | - | - | - | ck_resv_time |
| status | ENUM('CONFIRMED','CANCELED','COMPLETED','NO_SHOW') | N | 'CONFIRMED' | - | - | - |
| total_price | INT | N | - | - | - | ck_resv_price |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | - | - | - |
| updated_at | DATETIME | N | CURRENT_TIMESTAMP | - | - | ON UPDATE CURRENT_TIMESTAMP |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| idx_resv_member | 일반 | member_id, start_at |
| idx_resv_seat_time | 일반 | seat_id, start_at, end_at |

### CHECK 조건

| 이름 | 조건 |
| --- | --- |
| ck_resv_time | end_at > start_at |
| ck_resv_price | total_price >= 0 |

### 참조 무결성

| 열 | 참조 대상 | ON DELETE | ON UPDATE |
| --- | --- | --- | --- |
| member_id | member.member_id | RESTRICT | RESTRICT |
| seat_id | seat.seat_id | RESTRICT | RESTRICT |

## RESERVATION_SLOT 예약 시간대

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| seat_id | BIGINT | N | - | PK(복합) | seat.seat_id | - |
| slot_start | DATETIME | N | - | PK(복합) | - | - |
| reservation_id | BIGINT | N | - | - | reservation.reservation_id | - |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| idx_slot_resv | 일반 | reservation_id |

### 참조 무결성

| 열 | 참조 대상 | ON DELETE | ON UPDATE |
| --- | --- | --- | --- |
| seat_id | seat.seat_id | RESTRICT | RESTRICT |
| reservation_id | reservation.reservation_id | CASCADE | RESTRICT |

## PAYMENT 결제

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| payment_id | BIGINT | N | - | PK | - | AUTO_INCREMENT |
| reservation_id | BIGINT | N | - | - | reservation.reservation_id | uq_payment_resv (reservation_id) |
| amount | INT | N | - | - | - | ck_payment_amount; ck_payment_refund |
| method | ENUM('CARD','TRANSFER','KAKAO','POINT') | N | - | - | - | - |
| status | ENUM('PAID','REFUNDED','FAILED') | N | 'PAID' | - | - | - |
| refund_amount | INT | Y | - | - | - | ck_payment_refund |
| paid_at | DATETIME | N | CURRENT_TIMESTAMP | - | - | - |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| uq_payment_resv | UNIQUE | reservation_id |

### CHECK 조건

| 이름 | 조건 |
| --- | --- |
| ck_payment_amount | amount >= 0 |
| ck_payment_refund | refund_amount IS NULL OR (refund_amount >= 0 AND refund_amount <= amount) |

### 참조 무결성

| 열 | 참조 대상 | ON DELETE | ON UPDATE |
| --- | --- | --- | --- |
| reservation_id | reservation.reservation_id | RESTRICT | RESTRICT |

## POINT_HISTORY 포인트 내역

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| point_id | BIGINT | N | - | PK | - | AUTO_INCREMENT |
| member_id | BIGINT | N | - | - | member.member_id | - |
| reservation_id | BIGINT | Y | - | - | reservation.reservation_id | - |
| delta | INT | N | - | - | - | ck_point_delta |
| reason | VARCHAR(100) | N | - | - | - | - |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | - | - | - |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| idx_point_member | 일반 | member_id, created_at |

### CHECK 조건

| 이름 | 조건 |
| --- | --- |
| ck_point_delta | delta <> 0 |

### 참조 무결성

| 열 | 참조 대상 | ON DELETE | ON UPDATE |
| --- | --- | --- | --- |
| member_id | member.member_id | CASCADE | RESTRICT |
| reservation_id | reservation.reservation_id | SET NULL | RESTRICT |

## REVIEW 후기

| 속성이름 | 데이터타입 | 널허용 | 기본값 | 기본키 | 외래키 | 제약조건 |
| --- | --- | --- | --- | --- | --- | --- |
| review_id | BIGINT | N | - | PK | - | AUTO_INCREMENT |
| member_id | BIGINT | N | - | - | member.member_id | - |
| cafe_id | BIGINT | N | - | - | cafe.cafe_id | - |
| reservation_id | BIGINT | Y | - | - | reservation.reservation_id | uq_review_resv (reservation_id) |
| rating | TINYINT | N | - | - | - | ck_review_rating |
| content | TEXT | Y | - | - | - | - |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | - | - | - |

### 명시적 보조 인덱스

| 이름 | 종류 | 열 |
| --- | --- | --- |
| uq_review_resv | UNIQUE | reservation_id |
| idx_review_cafe | 일반 | cafe_id, created_at |

### CHECK 조건

| 이름 | 조건 |
| --- | --- |
| ck_review_rating | rating BETWEEN 1 AND 5 |

### 참조 무결성

| 열 | 참조 대상 | ON DELETE | ON UPDATE |
| --- | --- | --- | --- |
| member_id | member.member_id | RESTRICT | RESTRICT |
| cafe_id | cafe.cafe_id | CASCADE | RESTRICT |
| reservation_id | reservation.reservation_id | SET NULL | RESTRICT |

## 근거와 재생성

- 강의자료 431쪽 물리적 설계 예시
- [현재 SQL](../db/schema.sql)
- [역정규화 검토](DENORMALIZATION.md)
- [2026-11-23 보정·재검증 기록](CONSISTENCY_REPAIR_20261123.md)
- `npm run docs:design`로 재생성하고 `npm run check:design`으로 파일과 스키마의 일치를 확인한다.
