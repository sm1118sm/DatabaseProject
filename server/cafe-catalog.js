// 목록·예약 화면은 같은 price_plan을 사용한다. 평균은 활성 카페의 지역별 등록 요금 기준이다.
module.exports = async function cafeCatalog(db, { sido, sigungu }) {
  const filter = `c.is_active = 1 AND r.sido = ? AND r.sigungu = ? AND c.kakao_place_id REGEXP '^[0-9]+$'`;
  const args = [sido, sigungu];
  const [cafes] = await db.query(`SELECT c.cafe_id, c.kakao_place_id, c.name, c.address, c.phone,
    c.latitude, c.longitude, c.place_url, c.open_time, c.close_time, r.sido, r.sigungu
    FROM cafe c JOIN region r ON r.region_id = c.region_id WHERE ${filter} ORDER BY c.cafe_id`, args);
  const [plans] = await db.query(`SELECT p.cafe_id, st.code, p.plan_type, p.price, p.price_source,
    ROUND(AVG(p.price) OVER (PARTITION BY c.region_id, p.seat_type_id, p.plan_type), 0) AS region_avg_price,
    COUNT(*) OVER (PARTITION BY c.region_id, p.seat_type_id, p.plan_type) AS cafe_count
    FROM price_plan p JOIN cafe c ON c.cafe_id = p.cafe_id
    JOIN region r ON r.region_id = c.region_id JOIN seat_type st ON st.seat_type_id = p.seat_type_id
    WHERE ${filter}`, args);
  const [seats] = await db.query(`SELECT s.cafe_id, st.code, COUNT(*) AS total, MAX(s.capacity) AS capacity
    FROM seat s JOIN cafe c ON c.cafe_id = s.cafe_id JOIN region r ON r.region_id = c.region_id
    JOIN seat_type st ON st.seat_type_id = s.seat_type_id WHERE ${filter} GROUP BY s.cafe_id, st.code`, args);
  const byId = new Map(cafes.map((c) => [c.cafe_id, { ...c, plans: [], seats: [] }]));
  for (const p of plans) byId.get(p.cafe_id)?.plans.push({ ...p, price: Number(p.price), region_avg_price: Number(p.region_avg_price), cafe_count: Number(p.cafe_count) });
  for (const s of seats) byId.get(s.cafe_id)?.seats.push({ code: s.code, total: Number(s.total), capacity: Number(s.capacity) });
  return [...byId.values()];
};
