// Count each occupied seat once, including bookings spanning multiple slots.
module.exports = async function listAvailability(pool, placeIds, type, start, end) {
  const [rows] = await pool.query(
    `SELECT c.kakao_place_id AS placeId, COUNT(s.seat_id) AS total,
            COALESCE(SUM(EXISTS (
              SELECT 1 FROM reservation_slot rs
              WHERE rs.seat_id = s.seat_id AND rs.slot_start >= ? AND rs.slot_start < ?
            )), 0) AS occupied
     FROM cafe c
     LEFT JOIN seat_type st ON st.code = ?
     LEFT JOIN seat s ON s.cafe_id = c.cafe_id AND s.seat_type_id = st.seat_type_id
     WHERE c.is_active = 1 AND c.kakao_place_id IN (?)
     GROUP BY c.cafe_id, c.kakao_place_id`, [start, end, type, placeIds]);
  const counts = new Map(rows.map((row) => [String(row.placeId), {
    placeId: String(row.placeId), total: Number(row.total),
    free: Number(row.total) - Number(row.occupied),
  }]));
  return placeIds.map((placeId) => counts.get(placeId) || { placeId, total: null, free: null });
};
