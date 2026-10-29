require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- 간단한 토큰 인증 (과제용: 서버 메모리에 보관) ----------------------
const sessions = new Map(); // token -> { memberId, name }

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = sessions.get(token);
  if (!s) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.member = s;
  next();
}

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

// ---- 설정 / 지역 ---------------------------------------------------------
app.get('/api/config', (req, res) => {
  res.json({ kakaoJsKey: process.env.KAKAO_JS_KEY || '' });
});

app.get('/api/regions', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.region_id, r.sido, r.sigungu, COUNT(c.cafe_id) AS cafe_count
     FROM region r LEFT JOIN cafe c ON c.region_id = r.region_id
     GROUP BY r.region_id, r.sido, r.sigungu
     ORDER BY r.sido, r.sigungu`);
  res.json(rows);
}));

// ---- 회원 ----------------------------------------------------------------
app.post('/api/signup', wrap(async (req, res) => {
  const { email, password, name, phone } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: '이메일, 비밀번호, 이름은 필수입니다.' });
  const hash = await bcrypt.hash(password, 10);
  try {
    await pool.query('INSERT INTO member (email, password_hash, name, phone) VALUES (?, ?, ?, ?)',
      [email, hash, name, phone || null]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
    throw e;
  }
  res.status(201).json({ ok: true });
}));

app.post('/api/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const [[m]] = await pool.query('SELECT member_id, password_hash, name FROM member WHERE email = ?', [email]);
  if (!m || !(await bcrypt.compare(password || '', m.password_hash))) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { memberId: m.member_id, name: m.name });
  res.json({ token, name: m.name });
}));

// ---- 카페 목록 (시·구 평균 대비) ------------------------------------------
// room_type 별 시간당 요금을 같은 시·구 평균과 비교한다. (뷰: v_cafe_price_vs_region)
app.get('/api/cafes', wrap(async (req, res) => {
  const { sido, sigungu } = req.query;
  const roomType = req.query.roomType === 'ROOM' ? 'ROOM' : 'SEAT';
  const where = ['v.room_type = ?'];
  const params = [roomType];
  if (sido) { where.push('v.sido = ?'); params.push(sido); }
  if (sigungu) { where.push('v.sigungu = ?'); params.push(sigungu); }

  const [rows] = await pool.query(
    `SELECT v.cafe_id, v.cafe_name AS name, v.sido, v.sigungu, v.room_type,
            v.hourly_price, v.region_avg_price, v.diff_from_avg, v.cafe_count_in_region,
            c.address, c.latitude, c.longitude,
            ROUND(AVG(rv.rating), 1) AS avg_rating, COUNT(rv.review_id) AS review_count
     FROM v_cafe_price_vs_region v
     JOIN cafe c ON c.cafe_id = v.cafe_id
     LEFT JOIN review rv ON rv.cafe_id = v.cafe_id
     WHERE ${where.join(' AND ')}
     GROUP BY v.cafe_id, v.cafe_name, v.sido, v.sigungu, v.room_type, v.hourly_price,
              v.region_avg_price, v.diff_from_avg, v.cafe_count_in_region,
              c.address, c.latitude, c.longitude
     ORDER BY v.diff_from_avg, v.cafe_name`, params);
  res.json(rows);
}));

// ---- 카페 상세 -------------------------------------------------------------
app.get('/api/cafes/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [[cafe]] = await pool.query(
    `SELECT c.*, r.sido, r.sigungu FROM cafe c JOIN region r ON r.region_id = c.region_id WHERE c.cafe_id = ?`, [id]);
  if (!cafe) return res.status(404).json({ error: '카페를 찾을 수 없습니다.' });

  const [rooms] = await pool.query('SELECT room_id, name, room_type, capacity FROM room WHERE cafe_id = ? ORDER BY room_type, room_id', [id]);
  const [plans] = await pool.query('SELECT room_type, plan_type, price FROM price_plan WHERE cafe_id = ? ORDER BY room_type, price', [id]);
  const [comparison] = await pool.query(
    'SELECT room_type, hourly_price, region_avg_price, diff_from_avg, cafe_count_in_region FROM v_cafe_price_vs_region WHERE cafe_id = ?', [id]);
  const [reviews] = await pool.query(
    `SELECT rv.rating, rv.content, rv.created_at, m.name AS member_name
     FROM review rv JOIN member m ON m.member_id = rv.member_id
     WHERE rv.cafe_id = ? ORDER BY rv.created_at DESC LIMIT 20`, [id]);
  res.json({ cafe, rooms, plans, comparison, reviews });
}));

// ---- 좌석/룸의 하루 예약 현황 (1시간 슬롯) -----------------------------------
app.get('/api/rooms/:id/availability', wrap(async (req, res) => {
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date=YYYY-MM-DD 형식이 필요합니다.' });
  const [rows] = await pool.query(
    `SELECT HOUR(slot_start) AS hour FROM reservation_slot
     WHERE room_id = ? AND slot_start >= ? AND slot_start < DATE_ADD(?, INTERVAL 1 DAY)`,
    [Number(req.params.id), date, date]);
  res.json({ date, reservedHours: rows.map((r) => r.hour) });
}));

// ---- 예약 생성 (이중 예약은 reservation_slot 기본키가 차단) -------------------
app.post('/api/reservations', auth, wrap(async (req, res) => {
  const { roomId, date, startHour, hours, method } = req.body || {};
  const rid = Number(roomId), sh = Number(startHour), hrs = Number(hours);
  if (!rid || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !Number.isInteger(sh) || !Number.isInteger(hrs)
      || sh < 0 || hrs < 1 || hrs > 12 || sh + hrs > 24) {
    return res.status(400).json({ error: '예약 정보가 올바르지 않습니다.' });
  }
  const payMethod = ['CARD', 'TRANSFER', 'POINT'].includes(method) ? method : 'CARD';

  const startAt = new Date(`${date}T${String(sh).padStart(2, '0')}:00:00`);
  if (Number.isNaN(startAt.getTime()) || startAt < new Date()) {
    return res.status(400).json({ error: '지난 시간은 예약할 수 없습니다.' });
  }
  const fmt = (h) => `${date} ${String(h).padStart(2, '0')}:00:00`;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[room]] = await conn.query(
      `SELECT rm.room_id, rm.room_type, rm.cafe_id, c.open_time, c.close_time
       FROM room rm JOIN cafe c ON c.cafe_id = rm.cafe_id WHERE rm.room_id = ?`, [rid]);
    if (!room) { await conn.rollback(); return res.status(404).json({ error: '좌석/룸을 찾을 수 없습니다.' }); }

    const [[plan]] = await conn.query(
      `SELECT price FROM price_plan WHERE cafe_id = ? AND room_type = ? AND plan_type = 'HOURLY'`,
      [room.cafe_id, room.room_type]);
    if (!plan) { await conn.rollback(); return res.status(400).json({ error: '시간당 요금이 등록되지 않았습니다.' }); }
    const total = plan.price * hrs;

    const endClock = sh + hrs === 24 ? '24:00:00' : `${String(sh + hrs).padStart(2, '0')}:00:00`;
    const closeClock = room.close_time >= '23:59:59' ? '24:00:00' : room.close_time;
    if (`${String(sh).padStart(2, '0')}:00:00` < room.open_time || endClock > closeClock) {
      await conn.rollback();
      return res.status(400).json({ error: '영업시간 밖입니다.' });
    }

    let endAt = fmt(sh + hrs);
    if (sh + hrs === 24) { // 자정 종료: 다음 날 00:00 (서버 로컬 시간 기준으로 날짜 계산)
      const next = new Date(`${date}T00:00:00`);
      next.setDate(next.getDate() + 1);
      const p = (n) => String(n).padStart(2, '0');
      endAt = `${next.getFullYear()}-${p(next.getMonth() + 1)}-${p(next.getDate())} 00:00:00`;
    }

    const [ins] = await conn.query(
      `INSERT INTO reservation (member_id, room_id, start_at, end_at, status, total_price)
       VALUES (?, ?, ?, ?, 'CONFIRMED', ?)`,
      [req.member.memberId, rid, fmt(sh), endAt, total]);
    const reservationId = ins.insertId;

    const slotRows = [];
    for (let h = sh; h < sh + hrs; h++) slotRows.push([rid, fmt(h), reservationId]);
    await conn.query('INSERT INTO reservation_slot (room_id, slot_start, reservation_id) VALUES ?', [slotRows]);

    await conn.query(
      `INSERT INTO payment (reservation_id, amount, method, status) VALUES (?, ?, ?, 'PAID')`,
      [reservationId, total, payMethod]);

    await conn.commit();
    res.status(201).json({ reservationId, totalPrice: total });
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '이미 예약된 시간입니다. 다른 시간을 선택해주세요.' });
    throw e;
  } finally {
    conn.release();
  }
}));

// ---- 내 예약 / 취소 -------------------------------------------------------
app.get('/api/me/reservations', auth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT rs.reservation_id, rs.start_at, rs.end_at, rs.status, rs.total_price,
            rm.name AS room_name, rm.room_type, c.cafe_id, c.name AS cafe_name
     FROM reservation rs
     JOIN room rm ON rm.room_id = rs.room_id
     JOIN cafe c ON c.cafe_id = rm.cafe_id
     WHERE rs.member_id = ?
     ORDER BY rs.start_at DESC`, [req.member.memberId]);
  res.json(rows);
}));

app.post('/api/reservations/:id/cancel', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[rs]] = await conn.query(
      'SELECT reservation_id, status, start_at FROM reservation WHERE reservation_id = ? AND member_id = ? FOR UPDATE',
      [id, req.member.memberId]);
    if (!rs) { await conn.rollback(); return res.status(404).json({ error: '예약을 찾을 수 없습니다.' }); }
    if (!['PENDING', 'CONFIRMED'].includes(rs.status) || new Date(rs.start_at.replace(' ', 'T')) <= new Date()) {
      await conn.rollback();
      return res.status(400).json({ error: '취소할 수 없는 예약입니다.' });
    }
    await conn.query("UPDATE reservation SET status = 'CANCELED' WHERE reservation_id = ?", [id]);
    await conn.query('DELETE FROM reservation_slot WHERE reservation_id = ?', [id]);
    await conn.query("UPDATE payment SET status = 'REFUNDED' WHERE reservation_id = ?", [id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// ---- 후기 작성 (이용 완료한 예약만) ------------------------------------------
app.post('/api/reviews', auth, wrap(async (req, res) => {
  const { reservationId, rating, content } = req.body || {};
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: '평점은 1~5 사이여야 합니다.' });
  const [[rs]] = await pool.query(
    `SELECT rs.reservation_id, rm.cafe_id FROM reservation rs JOIN room rm ON rm.room_id = rs.room_id
     WHERE rs.reservation_id = ? AND rs.member_id = ? AND rs.status = 'COMPLETED'`,
    [Number(reservationId), req.member.memberId]);
  if (!rs) return res.status(400).json({ error: '이용 완료된 본인 예약에만 후기를 쓸 수 있습니다.' });
  try {
    await pool.query(
      'INSERT INTO review (member_id, cafe_id, reservation_id, rating, content) VALUES (?, ?, ?, ?, ?)',
      [req.member.memberId, rs.cafe_id, rs.reservation_id, r, content || null]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '이미 후기를 작성한 예약입니다.' });
    throw e;
  }
  res.status(201).json({ ok: true });
}));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`http://localhost:${port}`));
