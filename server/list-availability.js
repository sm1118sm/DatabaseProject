// Reservation intervals are authoritative; a week-long demo needs one row, not 168 slots.
module.exports = async function listAvailability(pool, placeIds, type, start, end) {
  const [rows] = await pool.query(
    `SELECT c.kakao_place_id AS placeId, COUNT(s.seat_id) AS total,
            COALESCE(SUM(EXISTS (
              SELECT 1 FROM reservation r
              WHERE r.seat_id = s.seat_id AND r.status = 'CONFIRMED'
                AND r.start_at < ? AND r.end_at > ?
            )), 0) AS occupied
     FROM cafe c
     LEFT JOIN seat_type st ON st.code = ?
     LEFT JOIN seat s ON s.cafe_id = c.cafe_id AND s.seat_type_id = st.seat_type_id
     WHERE c.is_active = 1 AND c.kakao_place_id IN (?)
     GROUP BY c.cafe_id, c.kakao_place_id`, [end, start, type, placeIds]);
  const counts = new Map(rows.map((row) => [String(row.placeId), {
    placeId: String(row.placeId), total: Number(row.total),
    free: Number(row.total) - Number(row.occupied),
  }]));
  return placeIds.map((placeId) => counts.get(placeId) || { placeId, total: null, free: null });
};
