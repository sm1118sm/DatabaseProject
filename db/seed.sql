-- 더미 데이터 (카페명·가격·후기는 모두 가상입니다)
-- 실행: npm run db:init  (schema.sql 적용 후 이 파일을 실행하며 __DEMO_HASH__ 를 demo1234 의 bcrypt 해시로 치환)
USE studycafe;

-- 지역 -----------------------------------------------------------
INSERT INTO region (sido, sigungu) VALUES
  ('서울', '강남구'),
  ('서울', '마포구'),
  ('서울', '관악구'),
  ('서울', '노원구'),
  ('서울', '성북구'),
  ('충남', '천안시 동남구'),
  ('충남', '천안시 서북구');

-- 회원 (비밀번호는 모두 demo1234) ----------------------------------
INSERT INTO member (email, password_hash, name, phone, role) VALUES
  ('demo@example.com',   '__DEMO_HASH__', '데모유저', '010-1111-1111', 'USER'),
  ('minji@example.com',  '__DEMO_HASH__', '김민지',   '010-2222-2222', 'USER'),
  ('junho@example.com',  '__DEMO_HASH__', '박준호',   '010-3333-3333', 'USER'),
  ('owner@example.com',  '__DEMO_HASH__', '카페사장', '010-4444-4444', 'OWNER'),
  ('admin@example.com',  '__DEMO_HASH__', '관리자',   '010-5555-5555', 'ADMIN');

-- 카페 + 요금 원본 (임시 테이블) -----------------------------------
-- 일반 테이블로 만든다 (MySQL 은 TEMPORARY 테이블을 한 쿼리에서 두 번 참조할 수 없는데, 아래 UNION ALL 이 그렇게 쓴다)
CREATE TABLE tmp_cafe (
  sido VARCHAR(20), sigungu VARCHAR(30),
  name VARCHAR(100), address VARCHAR(200), phone VARCHAR(20),
  lat DECIMAL(10,7), lng DECIMAL(10,7),
  seat_hourly INT, room_hourly INT
);

INSERT INTO tmp_cafe VALUES
  ('서울','강남구','포커스랩 스터디카페 강남점','서울 강남구 테헤란로 123','02-555-0101',37.4979520,127.0276240,3500,12000),
  ('서울','강남구','딥워크 스터디카페 역삼점','서울 강남구 역삼로 45','02-555-0102',37.5006870,127.0364370,4000,14000),
  ('서울','강남구','라이브러리온 논현점','서울 강남구 학동로 77','02-555-0103',37.5113640,127.0214100,3000,10000),
  ('서울','강남구','몰입공간 삼성점','서울 강남구 영동대로 513','02-555-0104',37.5088950,127.0628200,4500,15000),
  ('서울','마포구','홍대 올나잇 스터디카페','서울 마포구 양화로 160','02-555-0201',37.5563610,126.9236650,2500,9000),
  ('서울','마포구','합정 집중관','서울 마포구 월드컵로 25','02-555-0202',37.5496280,126.9139500,3000,10000),
  ('서울','마포구','공덕 프라이빗 스터디','서울 마포구 마포대로 92','02-555-0203',37.5442210,126.9515190,3200,11000),
  ('서울','관악구','신림 합격의 정석 스터디카페','서울 관악구 신림로 340','02-555-0301',37.4843290,126.9296500,2000,8000),
  ('서울','관악구','서울대입구 열람실','서울 관악구 관악로 158','02-555-0302',37.4812300,126.9527820,2200,8500),
  ('서울','관악구','봉천 챌린저스','서울 관악구 봉천로 220','02-555-0303',37.4824640,126.9420890,1800,7500),
  ('서울','노원구','노원 스터디허브','서울 노원구 동일로 1414','02-555-0401',37.6553580,127.0614130,2000,7500),
  ('서울','노원구','상계 집중연구소','서울 노원구 상계로 77','02-555-0402',37.6613830,127.0734560,1800,7000),
  ('서울','노원구','중계 북카페 스터디','서울 노원구 한글비석로 205','02-555-0403',37.6439440,127.0638110,2200,8000),
  ('서울','성북구','안암 고대앞 스터디카페','서울 성북구 인촌로 66','02-555-0501',37.5865200,127.0292550,2500,9000),
  ('서울','성북구','성신여대 스터디라운지','서울 성북구 동소문로 101','02-555-0502',37.5926010,127.0165910,2800,9500),
  ('서울','성북구','길음 몰입스터디','서울 성북구 동소문로 275','02-555-0503',37.6032140,127.0252180,2300,8500),
  ('충남','천안시 동남구','천안 두정 스터디카페','충남 천안시 서북구 두정로 10','041-555-0601',36.8305140,127.1403570,1500,6000),
  ('충남','천안시 동남구','청당 한기대 스터디존','충남 천안시 동남구 병천면 충절로 1600','041-555-0602',36.7633550,127.2829110,1500,6000),
  ('충남','천안시 동남구','천안터미널 열공관','충남 천안시 동남구 만남로 43','041-555-0603',36.8189090,127.1546700,1800,6500),
  ('충남','천안시 서북구','불당 프리미엄 스터디','충남 천안시 서북구 불당로 200','041-555-0701',36.8156710,127.1052630,2500,9000),
  ('충남','천안시 서북구','쌍용 스터디라운지','충남 천안시 서북구 쌍용대로 55','041-555-0702',36.7962100,127.1233150,1700,6500),
  ('충남','천안시 서북구','성정 집중스터디','충남 천안시 서북구 성정로 31','041-555-0703',36.8197710,127.1330960,1600,6000);

INSERT INTO cafe (owner_id, region_id, name, address, phone, latitude, longitude, open_time, close_time)
SELECT
  (SELECT member_id FROM member WHERE email = 'owner@example.com'),
  r.region_id, t.name, t.address, t.phone, t.lat, t.lng,
  '00:00:00', '23:59:59'
FROM tmp_cafe t
JOIN region r ON r.sido = t.sido AND r.sigungu = t.sigungu;

-- 좌석 6개(SEAT) + 룸 2개(ROOM) 를 카페마다 생성 -------------------
INSERT INTO room (cafe_id, name, room_type, capacity)
SELECT c.cafe_id, CONCAT('좌석 ', n.n), 'SEAT', 1
FROM cafe c
CROSS JOIN (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3
            UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) n;

INSERT INTO room (cafe_id, name, room_type, capacity)
SELECT c.cafe_id, CONCAT('룸 ', n.n), 'ROOM', 4
FROM cafe c
CROSS JOIN (SELECT 1 AS n UNION ALL SELECT 2) n;

-- 요금제: 좌석(시간/일/월)과 룸(시간) ---------------------------------
INSERT INTO price_plan (cafe_id, room_type, plan_type, price)
SELECT c.cafe_id, 'SEAT', 'HOURLY',  t.seat_hourly                      FROM cafe c JOIN tmp_cafe t ON t.name = c.name
UNION ALL
SELECT c.cafe_id, 'SEAT', 'DAILY',   ROUND(t.seat_hourly * 6,  -2)      FROM cafe c JOIN tmp_cafe t ON t.name = c.name
UNION ALL
SELECT c.cafe_id, 'SEAT', 'WEEKLY',  ROUND(t.seat_hourly * 28, -2)      FROM cafe c JOIN tmp_cafe t ON t.name = c.name
UNION ALL
SELECT c.cafe_id, 'SEAT', 'MONTHLY', ROUND(t.seat_hourly * 80, -2)      FROM cafe c JOIN tmp_cafe t ON t.name = c.name
UNION ALL
SELECT c.cafe_id, 'ROOM', 'HOURLY',  t.room_hourly                      FROM cafe c JOIN tmp_cafe t ON t.name = c.name;

DROP TABLE tmp_cafe;

-- 과거 예약(이용 완료) + 슬롯 + 결제 + 후기 -------------------------
-- 샘플 4건: 데모유저/김민지/박준호가 3~10일 전에 2시간씩 이용
CREATE TEMPORARY TABLE tmp_past (
  email VARCHAR(100), cafe_name VARCHAR(100), room_name VARCHAR(50),
  days_ago INT, start_hour INT, rating INT, content TEXT
);
INSERT INTO tmp_past VALUES
  ('demo@example.com',  '포커스랩 스터디카페 강남점', '좌석 1', 3,  10, 5, '조용하고 좌석이 넓어서 집중이 잘 됐어요.'),
  ('minji@example.com', '포커스랩 스터디카페 강남점', '좌석 2', 5,  14, 4, '가격은 조금 있지만 시설이 깔끔합니다.'),
  ('junho@example.com', '신림 합격의 정석 스터디카페',  '좌석 3', 7,  9,  5, '가성비 최고. 시험기간에 자주 올 것 같아요.'),
  ('demo@example.com',  '천안 두정 스터디카페',        '룸 1',   10, 19, 4, '룸이 아늑해서 팀플하기 좋았어요.');

INSERT INTO reservation (member_id, room_id, start_at, end_at, status, total_price)
SELECT m.member_id, rm.room_id,
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL p.days_ago DAY), MAKETIME(p.start_hour, 0, 0)),
       TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL p.days_ago DAY), MAKETIME(p.start_hour + 2, 0, 0)),
       'COMPLETED',
       2 * pp.price
FROM tmp_past p
JOIN member m   ON m.email = p.email
JOIN cafe c     ON c.name = p.cafe_name
JOIN room rm    ON rm.cafe_id = c.cafe_id AND rm.name = p.room_name
JOIN price_plan pp ON pp.cafe_id = c.cafe_id AND pp.room_type = rm.room_type AND pp.plan_type = 'HOURLY';

-- 예약 시작 시각 및 +1시간 두 슬롯을 점유 (과거 예약이므로 기록 목적)
INSERT INTO reservation_slot (room_id, slot_start, reservation_id)
SELECT r.room_id, r.start_at, r.reservation_id FROM reservation r
UNION ALL
SELECT r.room_id, DATE_ADD(r.start_at, INTERVAL 1 HOUR), r.reservation_id FROM reservation r;

INSERT INTO payment (reservation_id, amount, method, status, paid_at)
SELECT reservation_id, total_price, 'CARD', 'PAID', start_at FROM reservation;

INSERT INTO review (member_id, cafe_id, reservation_id, rating, content, created_at)
SELECT r.member_id, rm.cafe_id, r.reservation_id, p.rating, p.content, DATE_ADD(r.end_at, INTERVAL 1 HOUR)
FROM tmp_past p
JOIN member m   ON m.email = p.email
JOIN cafe c     ON c.name = p.cafe_name
JOIN room rm    ON rm.cafe_id = c.cafe_id AND rm.name = p.room_name
JOIN reservation r ON r.member_id = m.member_id AND r.room_id = rm.room_id;

DROP TEMPORARY TABLE tmp_past;

-- 즐겨찾기
INSERT INTO favorite (member_id, cafe_id)
SELECT m.member_id, c.cafe_id FROM member m JOIN cafe c
  ON m.email = 'demo@example.com' AND c.name IN ('포커스랩 스터디카페 강남점', '신림 합격의 정석 스터디카페');
