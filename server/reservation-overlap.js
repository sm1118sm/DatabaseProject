// Serialize bookings for one seat, then use a current locking read for overlap checks.
module.exports = async function hasOverlap(conn, seatId, start, end, skip = 0) {
  await conn.query('SELECT seat_id FROM seat WHERE seat_id = ? FOR UPDATE', [seatId]);
  const [rows] = await conn.query(
    `SELECT reservation_id FROM reservation
     WHERE seat_id = ? AND status = 'CONFIRMED' AND start_at < ? AND end_at > ?
       AND reservation_id <> ? LIMIT 1 FOR UPDATE`, [seatId, end, start, skip]);
  return rows.length > 0;
};
