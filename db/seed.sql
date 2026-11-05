-- 기준 데이터 + 시연용 샘플 (스키마 v2). 지역(region) 256곳은 scripts/init-db.js 가 public/regions.js 에서 먼저 넣는다.
-- 카페명·요금·후기는 모두 가상이며 이름 앞에 '(예시)'를 붙였다. 실제 카페와 확인한 요금은 별도로 입력한다.
USE studycafe;

-- 좌석 유형 · 시설 종류 ------------------------------------------------
INSERT INTO seat_type (code, name, is_room) VALUES
  ('NORMAL', '일반석',   FALSE),
  ('FOCUS',  '집중석',   FALSE),
  ('ROOM',   '스터디룸', TRUE);

INSERT INTO facility (code, name) VALUES
  ('SNACK',   '스낵바'),
  ('PRINTER', '프린터'),
  ('LOCKER',  '사물함'),
  ('H24',     '24시간'),
  ('OUTLET',  '개인 콘센트'),
  ('SHOWER',  '샤워실'),
  ('LOUNGE',  '휴게 라운지');

-- 회원 (비밀번호는 모두 demo1234) ---------------------------------------
INSERT INTO member (email, password_hash, name, phone, phone_verified, point_balance) VALUES
  ('demo@example.com',  '__DEMO_HASH__', '데모유저', '01011111111', TRUE, 5000),
  ('minji@example.com', '__DEMO_HASH__', '김민지',   '01022222222', TRUE, 0);

-- 샘플 카페 4곳 (가상) -----------------------------------------------------
INSERT INTO cafe (region_id, name, address, phone, latitude, longitude, info_source)
SELECT r.region_id, t.name, t.address, t.phone, t.lat, t.lng, 'MANUAL'
FROM (
  SELECT '서울특별시' AS sido, '마포구' AS sigungu, '(예시) 모아 스터디카페 홍대점' AS name, '서울 마포구 (가상 주소) 1' AS address, '02-000-0001' AS phone, 37.5563610 AS lat, 126.9236650 AS lng
  UNION ALL SELECT '서울특별시', '마포구', '(예시) 모아 스터디카페 합정점', '서울 마포구 (가상 주소) 2', '02-000-0002', 37.5496280, 126.9139500
  UNION ALL SELECT '서울특별시', '강남구', '(예시) 모아 스터디카페 역삼점', '서울 강남구 (가상 주소) 3', '02-000-0003', 37.5006870, 127.0364370
  UNION ALL SELECT '경기도', '성남시 분당구', '(예시) 모아 스터디카페 정자점', '경기 성남시 분당구 (가상 주소) 4', '031-000-0004', 37.3670000, 127.1080000
) t JOIN region r ON r.sido = t.sido AND r.sigungu = t.sigungu;

-- 시설: 카페마다 스낵바·프린터·콘센트, 역삼점은 24시간 추가
INSERT INTO cafe_facility (cafe_id, facility_id)
SELECT c.cafe_id, f.facility_id FROM cafe c JOIN facility f ON f.code IN ('SNACK', 'PRINTER', 'OUTLET');
INSERT INTO cafe_facility (cafe_id, facility_id)
SELECT c.cafe_id, f.facility_id FROM cafe c JOIN facility f ON f.code = 'H24' WHERE c.name LIKE '%역삼점';

-- 좌석: 카페마다 일반석 6 · 집중석 3 · 스터디룸 2 --------------------------------
INSERT INTO seat (cafe_id, seat_type_id, label, capacity)
SELECT c.cafe_id, st.seat_type_id, CONCAT(st.name, ' ', n.n, IF(st.is_room, '', '번')), IF(st.is_room, 4, 1)
FROM cafe c
JOIN seat_type st
JOIN (SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) n
  ON (st.code = 'NORMAL' AND n.n <= 6) OR (st.code = 'FOCUS' AND n.n <= 3) OR (st.code = 'ROOM' AND n.n <= 2);

-- 요금: 모두 EXAMPLE (사람이 확인한 값만 VERIFIED + 출처·확인일 로 올린다) -----------
INSERT INTO price_plan (cafe_id, seat_type_id, plan_type, price, price_source)
SELECT c.cafe_id, st.seat_type_id, p.plan_type,
  ROUND((2000 + (c.cafe_id MOD 4) * 400) * p.mult * IF(st.code = 'FOCUS', 1.3, IF(st.code = 'ROOM', 3, 1)), -2), 'EXAMPLE'
FROM cafe c
JOIN seat_type st
JOIN (SELECT 'HOURLY' AS plan_type, 1 AS mult UNION ALL SELECT 'DAILY', 6 UNION ALL SELECT 'WEEKLY', 28 UNION ALL SELECT 'MONTHLY', 80) p
  ON st.code <> 'ROOM' OR p.plan_type = 'HOURLY';

-- 예약 1건 (데모유저, 첫 카페 일반석 1번, 내일 18~21시) + 슬롯 3칸 + 결제 + 후기 ---------------
SET @day = DATE_ADD(CURDATE(), INTERVAL 1 DAY);
SET @seat = (SELECT s.seat_id FROM seat s JOIN cafe c ON c.cafe_id = s.cafe_id WHERE s.label = '일반석 1번' ORDER BY c.cafe_id LIMIT 1);
SET @cafe = (SELECT cafe_id FROM seat WHERE seat_id = @seat);
SET @hourly = (SELECT p.price FROM price_plan p JOIN seat s ON s.seat_type_id = p.seat_type_id AND s.cafe_id = p.cafe_id WHERE s.seat_id = @seat AND p.plan_type = 'HOURLY');
SET @member = (SELECT member_id FROM member WHERE email = 'demo@example.com');

INSERT INTO reservation (member_id, seat_id, start_at, end_at, status, total_price)
VALUES (@member, @seat, TIMESTAMP(@day, '18:00:00'), TIMESTAMP(@day, '21:00:00'), 'CONFIRMED', @hourly * 3);
SET @resv = LAST_INSERT_ID();

INSERT INTO reservation_slot (seat_id, slot_start, reservation_id) VALUES
  (@seat, TIMESTAMP(@day, '18:00:00'), @resv),
  (@seat, TIMESTAMP(@day, '19:00:00'), @resv),
  (@seat, TIMESTAMP(@day, '20:00:00'), @resv);

INSERT INTO payment (reservation_id, amount, method, status) VALUES (@resv, @hourly * 3, 'CARD', 'PAID');

INSERT INTO review (member_id, cafe_id, reservation_id, rating, content)
VALUES ((SELECT member_id FROM member WHERE email = 'minji@example.com'), @cafe, NULL, 5, '(예시) 조용하고 좌석이 넓어요.');

INSERT INTO favorite (member_id, cafe_id) VALUES (@member, @cafe);
