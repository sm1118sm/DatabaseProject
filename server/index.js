require('./dbconfig'); // 환경 변수 (ENV_FILE 로 환경 파일 선택)
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { wakeStatus } = require('./wake-db');
const retryTransaction = require('./retry-transaction');
const hasReservationOverlap = require('./reservation-overlap');
const listAvailability = require('./list-availability');

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- 서명된 토큰 인증 -----------------------------------------------------
// 서버에 로그인 상태를 저장하지 않는다. 토큰 자체에 회원 번호와 만료 시각이 들어 있고 비밀 키(AUTH_SECRET)로 서명한다.
// 서버리스(Vercel)에서는 요청마다 다른 인스턴스가 처리하므로 메모리에 저장하는 방식은 쓸 수 없다.
const AUTH_SECRET = process.env.AUTH_SECRET || (process.env.VERCEL || process.env.NODE_ENV === 'production' ? '' : crypto.randomBytes(32).toString('hex'));
if (!AUTH_SECRET) throw new Error('AUTH_SECRET 환경 변수가 필요합니다. (임의의 긴 문자열)');
const mac = (body) => crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
const sign = (payload) => { const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${body}.${mac(body)}`; };
function unsign(token, type) { // 서명·종류·만료를 모두 확인한다
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const want = mac(body);
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p && p.t === type && p.exp > Date.now() ? p : null;
  } catch { return null; }
}
const SESSION_MS = 7 * 24 * 3600e3;

function auth(req, res, next) {
  const p = unsign((req.headers.authorization || '').replace('Bearer ', ''), 's');
  if (!p) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.member = { memberId: p.m, name: p.n };
  next();
}

// 요청 횟수 제한 (인스턴스별로 세는 간단한 방식이라 완벽하지는 않다. 인증번호 같은 중요한 것은 DB 에서도 따로 제한한다)
const hits = new Map();
const limit = (name, max, windowMs) => (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const k = `${name}|${ip}`, now = Date.now();
  const recent = (hits.get(k) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return res.status(429).json({ error: '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.' });
  recent.push(now); hits.set(k, recent);
  if (hits.size > 5000) for (const [key, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(key);
  next();
};

const DB_WAKING = 'DB가 깨어나는 중이에요. 잠시 뒤 다시 시도해 주세요.';
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (e.code === 'ER_LOCK_DEADLOCK') {
    res.set('Retry-After', '1');
    return res.status(503).json({ error: '예약 요청이 몰리고 있어요. 잠시 뒤 다시 시도해 주세요.', retryable: true });
  }
  console.error(e);
  if (e.dbDown) return res.status(503).json({ error: DB_WAKING, dbDown: true }); // 무료 DB 가 꺼져 있다가 켜지는 동안
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});
const bookingWrap = (fn) => wrap((req, res) => retryTransaction(() => fn(req, res)));

// 휴대폰 인증을 마친 회원만 예약·후기를 쓸 수 있다 (소셜로 막 가입한 회원은 먼저 인증해야 한다)
async function requireVerified(req, res, next) {
  try {
    const [[m]] = await pool.query('SELECT phone_verified FROM member WHERE member_id = ?', [req.member.memberId]);
    if (!m) return res.status(401).json({ error: '로그인이 필요합니다.' });
    if (!m.phone_verified) return res.status(403).json({ error: '휴대폰 인증을 먼저 해 주세요.', needsPhone: true });
    next();
  } catch (e) {
    console.error(e);
    if (e.dbDown) return res.status(503).json({ error: DB_WAKING, dbDown: true });
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}

const SEAT_TYPES = ['NORMAL', 'FOCUS', 'ROOM']; // 일반석 · 집중석 · 스터디룸
const PAY_METHODS = ['CARD', 'TRANSFER', 'KAKAO', 'POINT'];
const PLAN_DAYS = { DAY: 1, WEEK: 7, MONTH: 30 }; // 화면의 기간제 이용권 → 일수
const PLAN_TYPE = { DAY: 'DAILY', WEEK: 'WEEKLY', MONTH: 'MONTHLY' }; // 화면 키 → DB price_plan.plan_type
const SIGNUP_BONUS = 10000;
const pad = (n) => String(n).padStart(2, '0');
const sqlDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sqlTime = (d) => `${sqlDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
const startOfHour = () => { const d = new Date(); d.setMinutes(0, 0, 0); return d; };
const addHours = (d, h) => new Date(d.getTime() + h * 3600e3);

function newSession(m) {
  return sign({ t: 's', m: m.member_id, n: m.name, exp: Date.now() + SESSION_MS });
}
const publicMember = (m) => ({ email: m.email, name: m.name, points: m.point_balance, phoneVerified: !!m.phone_verified });

// 이용 시간이 끝난 예약은 '이용 완료'로 바꾼다 (후기 작성 조건)
async function completePast(conn, memberId) {
  await conn.query("UPDATE reservation SET status = 'COMPLETED' WHERE member_id = ? AND status = 'CONFIRMED' AND end_at <= NOW()", [memberId]);
}

// ---- 설정 / 지역 ---------------------------------------------------------
// 상태 확인: DB 에 실제로 질의해 보고, '스스로 켜기' 설정과 마지막 시도 결과를 알려 준다 (비밀 값은 없다).
// 외부 감시(UptimeRobot 등)에 쓰면 사이트가 아니라 DB 까지 살아 있는지 확인할 수 있다.
app.get('/api/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { await pool.query('SELECT 1'); res.json({ ok: true, db: 'up', wake: wakeStatus() }); }
  catch (e) { res.status(503).json({ ok: false, db: 'down', wake: wakeStatus() }); }
});

app.get('/api/config', (req, res) => {
  res.json({
    server: true,
    kakaoJsKey: process.env.KAKAO_JS_KEY || '',
  });
});

app.get('/api/regions', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.region_id, r.sido, r.sigungu, COUNT(c.cafe_id) AS cafe_count
     FROM region r LEFT JOIN cafe c ON c.region_id = r.region_id AND c.is_active
     GROUP BY r.region_id, r.sido, r.sigungu
     ORDER BY r.sido, r.sigungu`);
  res.json(rows);
}));


// ---- 회원: 휴대폰 인증 → 가입 (이메일·휴대폰 중복 불가) ---------------------------
// 실제 문자 발송은 유료 문자 업체 계약이 필요해서, SMS_PROVIDER 가 없으면 모의 모드로 동작한다(인증번호를 응답에 담아 화면에 보여 준다).
const normPhone = (s) => String(s || '').replace(/\D/g, '');
const phoneOk = (p) => /^01[016789]\d{7,8}$/.test(p);
const codeHash = (phone, code) => crypto.createHash('sha256').update(`${phone}:${code}:${process.env.PHONE_SALT || 'studymoa'}`).digest('hex');

app.post('/api/phone/send', limit('phone', 10, 3600e3), wrap(async (req, res) => {
  const phone = normPhone(req.body && req.body.phone);
  if (!phoneOk(phone)) return res.status(400).json({ error: '휴대폰 번호 형식을 확인해 주세요. (예: 010-1234-5678)' });
  const [[dup]] = await pool.query('SELECT member_id FROM member WHERE phone = ?', [phone]);
  if (dup) return res.status(409).json({ error: '이미 가입된 휴대폰 번호예요.' });
  const [[recent]] = await pool.query('SELECT COUNT(*) AS n FROM phone_verification WHERE phone = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)', [phone]);
  if (recent.n >= 5) return res.status(429).json({ error: '인증번호 요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.' });
  if (process.env.SMS_PROVIDER) return res.status(501).json({ error: '문자 발송 업체가 아직 연결되지 않았어요.' });
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await pool.query('INSERT INTO phone_verification (phone, code_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))', [phone, codeHash(phone, code)]);
  res.json({ ok: true, expiresInSec: 300, mock: true, devCode: code });
}));

app.post('/api/phone/verify', limit('verify', 40, 3600e3), wrap(async (req, res) => {
  const phone = normPhone(req.body && req.body.phone), code = String((req.body && req.body.code) || '').trim();
  const [[v]] = await pool.query(
    'SELECT verify_id, code_hash, attempts FROM phone_verification WHERE phone = ? AND verified_at IS NULL AND expires_at > NOW() ORDER BY verify_id DESC LIMIT 1', [phone]);
  if (!v) return res.status(400).json({ error: '인증번호가 만료됐어요. 다시 요청해 주세요.' });
  if (v.attempts >= 5) return res.status(429).json({ error: '인증번호를 5번 틀렸어요. 다시 요청해 주세요.' });
  if (v.code_hash !== codeHash(phone, code)) {
    await pool.query('UPDATE phone_verification SET attempts = attempts + 1 WHERE verify_id = ?', [v.verify_id]);
    return res.status(400).json({ error: '인증번호가 맞지 않아요.' });
  }
  await pool.query('UPDATE phone_verification SET verified_at = NOW() WHERE verify_id = ?', [v.verify_id]);
  res.json({ ok: true });
}));

app.post('/api/signup', limit('signup', 15, 3600e3), wrap(async (req, res) => {
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase(), password = String(body.password || ''), name = String(body.name || '').trim();
  const phone = normPhone(body.phone);
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 100) return res.status(400).json({ error: '이메일 형식을 확인해 주세요.' });
  if (password.length < 6) return res.status(400).json({ error: '비밀번호는 6자 이상이어야 해요.' });
  if (!name || name.length > 50) return res.status(400).json({ error: '이름을 입력해 주세요.' });
  if (!phoneOk(phone)) return res.status(400).json({ error: '휴대폰 번호를 입력하고 인증해 주세요.' });

  const [[dupEmail]] = await pool.query('SELECT member_id FROM member WHERE email = ?', [email]);
  if (dupEmail) return res.status(409).json({ error: '이미 가입된 이메일이에요.' });
  const [[dupPhone]] = await pool.query('SELECT member_id FROM member WHERE phone = ?', [phone]);
  if (dupPhone) return res.status(409).json({ error: '이미 가입된 휴대폰 번호예요.' });

  const hash = await bcrypt.hash(password, 10);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 최근 15분 안에 인증을 마친 번호만 가입할 수 있다
    const [[ver]] = await conn.query(
      'SELECT verify_id FROM phone_verification WHERE phone = ? AND verified_at IS NOT NULL AND verified_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE) ORDER BY verify_id DESC LIMIT 1 FOR UPDATE', [phone]);
    if (!ver) { await conn.rollback(); return res.status(400).json({ error: '휴대폰 인증을 먼저 완료해 주세요.' }); }
    const [ins] = await conn.query(
      'INSERT INTO member (email, password_hash, name, phone, phone_verified, point_balance) VALUES (?, ?, ?, ?, TRUE, ?)', [email, hash, name, phone, SIGNUP_BONUS]);
    await conn.query('INSERT INTO point_ledger (member_id, delta, reason) VALUES (?, ?, ?)', [ins.insertId, SIGNUP_BONUS, '가입 보너스']);
    await conn.query('DELETE FROM phone_verification WHERE phone = ?', [phone]); // 한 번 쓴 인증은 다시 쓰지 못한다
    await conn.commit();
    const m = { member_id: ins.insertId, email, name, point_balance: SIGNUP_BONUS, phone_verified: 1 };
    res.status(201).json({ ok: true, token: newSession(m), ...publicMember(m) });
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: /uq_member_phone/.test(e.sqlMessage) ? '이미 가입된 휴대폰 번호예요.' : '이미 가입된 이메일이에요.' });
    }
    throw e;
  } finally {
    conn.release();
  }
}));

app.post('/api/login', limit('login', 40, 600e3), wrap(async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase(), password = String((req.body && req.body.password) || '');
  const [[m]] = await pool.query('SELECT member_id, email, password_hash, name, point_balance, phone_verified FROM member WHERE email = ?', [email]);
  if (m && !m.password_hash) return res.status(400).json({ error: '소셜 로그인으로 가입한 계정이에요. 카카오·네이버로 로그인해 주세요.' });
  if (!m || !(await bcrypt.compare(password, m.password_hash))) {
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
  }
  res.json({ token: newSession(m), ...publicMember(m) });
}));

app.get('/api/me', auth, wrap(async (req, res) => {
  const [[m]] = await pool.query('SELECT member_id, email, name, phone, phone_verified, point_balance FROM member WHERE member_id = ?', [req.member.memberId]);
  if (!m) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const [points] = await pool.query(
    'SELECT delta, reason, created_at FROM point_ledger WHERE member_id = ? ORDER BY created_at DESC, point_id DESC LIMIT 20', [req.member.memberId]);
  res.json({ member: m, ...publicMember(m), history: points });
}));

// ---- 카페 목록 (시·구 평균 대비) ------------------------------------------
// 좌석 유형별 시간당 요금을 같은 시·구 평균과 비교한다.
// 평균은 사람이 확인한 요금(VERIFIED)만으로 계산한다. 예시 요금(EXAMPLE)인 카페는 목록에는 나오되 평균 비교(diff)는 null 이다.
app.get('/api/cafes', wrap(async (req, res) => {
  const { sido, sigungu } = req.query;
  const legacy = { SEAT: 'NORMAL' }[req.query.roomType]; // 옛 파라미터(roomType=SEAT) 호환
  const seatType = SEAT_TYPES.includes(req.query.seatType) ? req.query.seatType : (legacy || (req.query.roomType === 'ROOM' ? 'ROOM' : 'NORMAL'));
  const where = ['c.is_active'];
  const params = [seatType];
  if (sido) { where.push('r.sido = ?'); params.push(sido); }
  if (sigungu) { where.push('r.sigungu = ?'); params.push(sigungu); }

  const [rows] = await pool.query(
    `SELECT x.*, ROUND(AVG(rv.rating), 1) AS avg_rating, COUNT(rv.review_id) AS review_count
     FROM (
       SELECT c.cafe_id, c.name, r.sido, r.sigungu, c.address, c.latitude, c.longitude, c.place_url,
              st.code AS seat_type, p.price AS hourly_price, p.price_source, p.verified_at,
              ROUND(AVG(CASE WHEN p.price_source = 'VERIFIED' THEN p.price END) OVER (PARTITION BY c.region_id, p.seat_type_id), 0) AS region_avg_price,
              COUNT(CASE WHEN p.price_source = 'VERIFIED' THEN 1 END) OVER (PARTITION BY c.region_id, p.seat_type_id) AS verified_count_in_region
       FROM cafe c
       JOIN region r ON r.region_id = c.region_id
       JOIN seat_type st ON st.code = ?
       LEFT JOIN price_plan p ON p.cafe_id = c.cafe_id AND p.seat_type_id = st.seat_type_id AND p.plan_type = 'HOURLY'
       WHERE ${where.join(' AND ')}
     ) x
     LEFT JOIN review rv ON rv.cafe_id = x.cafe_id
     GROUP BY x.cafe_id, x.name, x.sido, x.sigungu, x.address, x.latitude, x.longitude, x.place_url,
              x.seat_type, x.hourly_price, x.price_source, x.verified_at, x.region_avg_price, x.verified_count_in_region
     ORDER BY x.hourly_price IS NULL, x.hourly_price, x.name`, params);

  res.json(rows.map((r) => ({
    ...r,
    diff_from_avg: r.price_source === 'VERIFIED' && r.region_avg_price != null ? r.hourly_price - Number(r.region_avg_price) : null,
  })));
}));

// ---- 카페 상세 -------------------------------------------------------------
app.get('/api/cafes/:id(\\d+)', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [[cafe]] = await pool.query(
    `SELECT c.*, r.sido, r.sigungu FROM cafe c JOIN region r ON r.region_id = c.region_id WHERE c.cafe_id = ?`, [id]);
  if (!cafe) return res.status(404).json({ error: '카페를 찾을 수 없습니다.' });

  const [seats] = await pool.query(
    `SELECT s.seat_id, s.label, st.code AS seat_type, st.name AS seat_type_name, s.capacity
     FROM seat s JOIN seat_type st ON st.seat_type_id = s.seat_type_id
     WHERE s.cafe_id = ? ORDER BY st.seat_type_id, s.seat_id`, [id]);
  const [plans] = await pool.query(
    `SELECT st.code AS seat_type, p.plan_type, p.price, p.price_source, p.source_note, p.verified_at
     FROM price_plan p JOIN seat_type st ON st.seat_type_id = p.seat_type_id
     WHERE p.cafe_id = ? ORDER BY st.seat_type_id, p.price`, [id]);
  const [comparison] = await pool.query(
    `SELECT seat_type, hourly_price, region_avg_price, diff_from_avg, cafe_count_in_region
     FROM (SELECT
  c.cafe_id,
  c.name                                   AS cafe_name,
  r.sido,
  r.sigungu,
  st.code                                  AS seat_type,
  p.price                                  AS hourly_price,
  ROUND(AVG(p.price) OVER (PARTITION BY r.region_id, p.seat_type_id), 0) AS region_avg_price,
  p.price - ROUND(AVG(p.price) OVER (PARTITION BY r.region_id, p.seat_type_id), 0) AS diff_from_avg,
  COUNT(*) OVER (PARTITION BY r.region_id, p.seat_type_id)               AS cafe_count_in_region
FROM price_plan p
JOIN cafe      c  ON c.cafe_id       = p.cafe_id
JOIN region    r  ON r.region_id     = c.region_id
JOIN seat_type st ON st.seat_type_id = p.seat_type_id
WHERE p.plan_type = 'HOURLY' AND p.price_source = 'VERIFIED'
     ) comparison WHERE cafe_id = ?`, [id]);
  const [reviews] = await pool.query(
    `SELECT rv.rating, rv.content, rv.created_at, m.name AS member_name
     FROM review rv JOIN member m ON m.member_id = rv.member_id
     WHERE rv.cafe_id = ? ORDER BY rv.created_at DESC LIMIT 20`, [id]);
  res.json({ cafe, seats, plans, comparison, reviews });
}));

// ---- 화면이 보는 카페를 DB 에 등록 (처음 예약할 때) ----------------------------------
// 카카오에서 가져온 카페는 예약이 처음 생길 때만 DB 에 저장한다. 전국 목록을 통째로 저장하지 않는다.
// 좌석 수와 요금은 화면의 '예시' 값을 그대로 쓰며 price_source 는 EXAMPLE 이다.
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
app.post('/api/cafes/ensure', auth, limit('ensure', 60, 3600e3), wrap(async (req, res) => {
  const b = req.body || {};
  const placeId = b.placeId == null ? '' : String(b.placeId).slice(0, 30);
  const name = String(b.name || '').trim().slice(0, 100), address = String(b.address || '').trim().slice(0, 200);
  const lat = num(b.lat, 30, 40), lng = num(b.lng, 120, 135);
  const seats = {}; for (const t of SEAT_TYPES) seats[t] = num(b.seats && b.seats[t], 0, 200);
  if (!placeId || !name || !address || lat == null || lng == null || SEAT_TYPES.some((t) => seats[t] == null)) return res.status(400).json({ error: '카페 정보가 올바르지 않습니다.' });
  const roomCap = num(b.roomCap, 1, 20) || 4;

  const [[ex]] = await pool.query('SELECT cafe_id FROM cafe WHERE kakao_place_id = ?', [placeId]);
  if (ex) return res.json({ cafeId: ex.cafe_id, created: false });
  const [[region]] = await pool.query('SELECT region_id FROM region WHERE sido = ? AND sigungu = ?', [String(b.sido || ''), String(b.sigungu || '')]);
  if (!region) return res.status(400).json({ error: '지역을 찾을 수 없습니다.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO cafe (kakao_place_id, region_id, name, address, phone, latitude, longitude, place_url, info_source, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [placeId, region.region_id, name, address, String(b.phone || '').slice(0, 20) || null, lat, lng, String(b.url || '').slice(0, 200) || null, b.real ? 'KAKAO' : 'MANUAL']);
    const cafeId = ins.insertId;
    const [types] = await conn.query('SELECT seat_type_id, code FROM seat_type');
    const tid = Object.fromEntries(types.map((t) => [t.code, t.seat_type_id]));
    const seatRows = [];
    for (const t of SEAT_TYPES) for (let i = 1; i <= seats[t]; i++) seatRows.push([cafeId, tid[t], t === 'ROOM' ? `스터디룸 ${i}` : `${t === 'NORMAL' ? '일반석' : '집중석'} ${i}번`, t === 'ROOM' ? roomCap : 1]);
    if (seatRows.length) await conn.query('INSERT INTO seat (cafe_id, seat_type_id, label, capacity) VALUES ?', [seatRows]);
    const planRows = [];
    for (const t of SEAT_TYPES) {
      const p = (b.price || {})[t] || {};
      const h = num(p.hourly, 0, 1e6); if (h != null) planRows.push([cafeId, tid[t], 'HOURLY', h, 'EXAMPLE']);
      if (t !== 'ROOM') for (const k of Object.keys(PLAN_TYPE)) { const v = num(p[k], 0, 1e7); if (v != null) planRows.push([cafeId, tid[t], PLAN_TYPE[k], v, 'EXAMPLE']); }
    }
    if (planRows.length) await conn.query('INSERT INTO price_plan (cafe_id, seat_type_id, plan_type, price, price_source) VALUES ?', [planRows]);
    await conn.commit();
    res.status(201).json({ cafeId, created: true });
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') { // 동시에 같은 카페를 등록한 경우
      const [[row]] = await pool.query('SELECT cafe_id FROM cafe WHERE kakao_place_id = ?', [placeId]);
      if (row) return res.json({ cafeId: row.cafe_id, created: false });
    }
    throw e;
  } finally {
    conn.release();
  }
}));

// ---- 좌석 현황 -------------------------------------------------------------------
// 기간 안에 이미 예약된 좌석 이름 목록. 시간제는 date+start~end, 기간제는 date부터 days 일.
const intervalOf = (q) => {
  if (!isDate(q.date)) return null;
  const d0 = new Date(`${q.date}T00:00:00`);
  if (q.days != null) { const days = num(q.days, 1, 30); return days ? [d0, addHours(d0, days * 24)] : null; }
  const s = num(q.start, 0, 23), e = num(q.end, 1, 24);
  return s != null && e != null && e > s ? [addHours(d0, s), addHours(d0, e)] : null;
};
app.get('/api/cafes/availability', wrap(async (req, res) => {
  const iv = intervalOf(req.query);
  const raw = typeof req.query.placeIds === 'string' ? req.query.placeIds.split(',') : [];
  if (!iv || !SEAT_TYPES.includes(req.query.type) || !raw.length || raw.length > 40 || raw.some((id) => !/^(?:\d+|sample-\d+)$/.test(id))) {
    return res.status(400).json({ error: '조회 조건이 올바르지 않습니다.' });
  }
  res.set('Cache-Control', 'no-store');
  res.json(await listAvailability(pool, [...new Set(raw)], req.query.type, sqlTime(iv[0]), sqlTime(iv[1])));
}));

app.get('/api/cafes/by-place/:placeId/taken', wrap(async (req, res) => {
  const iv = intervalOf(req.query);
  if (!iv || !SEAT_TYPES.includes(req.query.type)) return res.status(400).json({ error: '조회 조건이 올바르지 않습니다.' });
  const [[cafe]] = await pool.query('SELECT cafe_id FROM cafe WHERE kakao_place_id = ?', [String(req.params.placeId)]);
  if (!cafe) return res.json({ cafeId: null, taken: [] }); // 아직 예약이 없는 카페
  const skip = Number(req.query.skip) || 0;
  const [rows] = await pool.query(
    `SELECT DISTINCT s.label FROM reservation r
     JOIN seat s ON s.seat_id = r.seat_id JOIN seat_type st ON st.seat_type_id = s.seat_type_id
     WHERE s.cafe_id = ? AND st.code = ? AND r.status = 'CONFIRMED'
       AND r.start_at < ? AND r.end_at > ? AND r.reservation_id <> ?`,
    [cafe.cafe_id, req.query.type, sqlTime(iv[1]), sqlTime(iv[0]), skip]);
  res.json({ cafeId: cafe.cafe_id, taken: rows.map((r) => r.label) });
}));

const availability = wrap(async (req, res) => {
  const date = String(req.query.date || '');
  if (!isDate(date)) return res.status(400).json({ error: 'date=YYYY-MM-DD 형식이 필요합니다.' });
  const [rows] = await pool.query(
    `SELECT start_at, end_at FROM reservation WHERE seat_id = ? AND status = 'CONFIRMED'
     AND start_at < DATE_ADD(?, INTERVAL 1 DAY) AND end_at > ?`, [Number(req.params.id), date, date]);
  const base = new Date(`${date}T00:00:00`);
  const reservedHours = Array.from({ length: 24 }, (_, h) => h).filter((h) =>
    rows.some((r) => r.start_at < sqlTime(addHours(base, h + 1)) && r.end_at > sqlTime(addHours(base, h))));
  res.json({ date, reservedHours });
});
app.get('/api/seats/:id/availability', availability);
app.get('/api/rooms/:id/availability', availability); // 옛 주소 호환

app.get('/api/cafes/by-place/:placeId/reviews', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT rv.rating, rv.content, DATE(rv.created_at) AS date, m.name AS member_name
     FROM review rv JOIN cafe c ON c.cafe_id = rv.cafe_id JOIN member m ON m.member_id = rv.member_id
     WHERE c.kakao_place_id = ? ORDER BY rv.created_at DESC LIMIT 50`, [String(req.params.placeId)]);
  res.json(rows);
}));

// ---- 예약 ------------------------------------------------------------------------
// 예약 기간 계산: 시간제는 date startHour 부터 hours 시간, 기간제는 date 0시부터 plan 일수.
function bookingSpan({ mode, date, startHour, hours, plan }) {
  if (!isDate(date)) return null;
  const d0 = new Date(`${date}T00:00:00`);
  if (mode === 'PERIOD') {
    const days = PLAN_DAYS[plan];
    if (!days) return null;
    if (d0 < new Date(new Date().setHours(0, 0, 0, 0))) return { error: '지난 날짜는 예약할 수 없습니다.' };
    return { start: d0, end: addHours(d0, days * 24), unit: PLAN_TYPE[plan], hours: days * 24 };
  }
  const sh = Number(startHour), hrs = Number(hours);
  if (!Number.isInteger(sh) || !Number.isInteger(hrs) || sh < 0 || hrs < 1 || hrs > 12 || sh + hrs > 24) return null;
  const start = addHours(d0, sh);
  if (start < startOfHour()) return { error: '지난 시간은 예약할 수 없습니다.' };
  return { start, end: addHours(d0, sh + hrs), unit: 'HOURLY', hours: hrs, sh, hrs };
}
const slotRowsOf = (seatId, span, reservationId) => {
  const rows = [];
  for (let i = 0; i < span.hours; i++) rows.push([seatId, sqlTime(addHours(span.start, i)), reservationId]);
  return rows;
};
const spanFromRow = (r) => { // 저장된 예약의 길이로 시간제/기간제를 구분한다 (시간제는 최대 12시간)
  const h = Math.round((new Date(r.end_at.replace(' ', 'T')) - new Date(r.start_at.replace(' ', 'T'))) / 3600e3);
  return h > 12 ? { mode: 'PERIOD', plan: { 24: 'DAY', 168: 'WEEK', 720: 'MONTH' }[h] || 'DAY', hours: h } : { mode: 'HOURLY', plan: null, hours: h };
};

app.post('/api/reservations', auth, requireVerified, bookingWrap(async (req, res) => {
  const b = req.body || {};
  const span = bookingSpan({ mode: b.mode === 'PERIOD' ? 'PERIOD' : 'HOURLY', date: b.date, startHour: b.startHour, hours: b.hours, plan: b.plan });
  if (!span || (!b.cafeId && !b.seatId && !b.roomId)) return res.status(400).json({ error: '예약 정보가 올바르지 않습니다.' });
  if (span.error) return res.status(400).json({ error: span.error });
  const payMethod = PAY_METHODS.includes(b.method) ? b.method : 'CARD';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const seatSql = `SELECT s.seat_id, s.seat_type_id, s.cafe_id, st.is_room, c.open_time, c.close_time, c.is_active
       FROM seat s JOIN seat_type st ON st.seat_type_id = s.seat_type_id JOIN cafe c ON c.cafe_id = s.cafe_id WHERE `;
    const [[seat]] = b.cafeId && b.seatLabel
      ? await conn.query(`${seatSql}s.cafe_id = ? AND s.label = ?`, [Number(b.cafeId), String(b.seatLabel)])
      : await conn.query(`${seatSql}s.seat_id = ?`, [Number(b.seatId || b.roomId)]);
    if (!seat || !seat.is_active) { await conn.rollback(); return res.status(404).json({ error: '좌석/룸을 찾을 수 없습니다.' }); }
    if (seat.is_room && span.unit !== 'HOURLY') { await conn.rollback(); return res.status(400).json({ error: '스터디룸은 시간제로만 이용할 수 있어요.' }); }

    const [[plan]] = await conn.query(
      'SELECT price FROM price_plan WHERE cafe_id = ? AND seat_type_id = ? AND plan_type = ?', [seat.cafe_id, seat.seat_type_id, span.unit]);
    if (!plan) { await conn.rollback(); return res.status(400).json({ error: '해당 이용권 요금이 등록되지 않았습니다.' }); }
    const total = span.unit === 'HOURLY' ? plan.price * span.hrs : plan.price;

    if (span.unit === 'HOURLY') {
      const closeClock = seat.close_time >= '23:59:59' ? 24 : Number(String(seat.close_time).slice(0, 2));
      if (span.sh < Number(String(seat.open_time).slice(0, 2)) || span.sh + span.hrs > closeClock) {
        await conn.rollback();
        return res.status(400).json({ error: '영업시간 밖입니다.' });
      }
    }

    if (payMethod === 'POINT') { // 포인트 결제는 잔액을 잠그고 확인한 뒤 차감한다
      const [[m]] = await conn.query('SELECT point_balance FROM member WHERE member_id = ? FOR UPDATE', [req.member.memberId]);
      if (!m || m.point_balance < total) { await conn.rollback(); return res.status(400).json({ error: '포인트가 부족합니다.' }); }
    }

    if (await hasReservationOverlap(conn, seat.seat_id, sqlTime(span.start), sqlTime(span.end))) {
      await conn.rollback(); return res.status(409).json({ error: '이미 예약된 시간입니다. 다른 시간을 선택해주세요.' });
    }
    const [ins] = await conn.query(
      `INSERT INTO reservation (member_id, seat_id, start_at, end_at, status, total_price) VALUES (?, ?, ?, ?, 'CONFIRMED', ?)`,
      [req.member.memberId, seat.seat_id, sqlTime(span.start), sqlTime(span.end), total]);
    const reservationId = ins.insertId;
    await conn.query('INSERT INTO reservation_slot (seat_id, slot_start, reservation_id) VALUES ?', [slotRowsOf(seat.seat_id, span, reservationId)]);
    await conn.query(`INSERT INTO payment (reservation_id, amount, method, status) VALUES (?, ?, ?, 'PAID')`, [reservationId, total, payMethod]);

    let delta = 0;
    if (payMethod === 'POINT') { delta = -total; await conn.query('INSERT INTO point_ledger (member_id, reservation_id, delta, reason) VALUES (?, ?, ?, ?)', [req.member.memberId, reservationId, -total, '예약 결제']); }
    else if (Math.floor(total * 0.01) > 0) { delta = Math.floor(total * 0.01); await conn.query('INSERT INTO point_ledger (member_id, reservation_id, delta, reason) VALUES (?, ?, ?, ?)', [req.member.memberId, reservationId, delta, '결제 적립 1%']); }
    if (delta) await conn.query('UPDATE member SET point_balance = point_balance + ? WHERE member_id = ?', [delta, req.member.memberId]);
    const [[bal]] = await conn.query('SELECT point_balance FROM member WHERE member_id = ?', [req.member.memberId]);

    await conn.commit();
    res.status(201).json({ reservationId, totalPrice: total, pointBalance: bal.point_balance });
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '이미 예약된 시간입니다. 다른 시간을 선택해주세요.' });
    throw e;
  } finally {
    conn.release();
  }
}));

// ---- 내 예약 / 변경 / 취소 -----------------------------------------------------
app.get('/api/me/reservations', auth, wrap(async (req, res) => {
  await completePast(pool, req.member.memberId);
  const [rows] = await pool.query(
    `SELECT rs.reservation_id, rs.start_at, rs.end_at, rs.status, rs.total_price,
            s.label AS seat_label, st.code AS seat_type, c.cafe_id, c.kakao_place_id, c.name AS cafe_name, c.address, c.phone, c.place_url,
            c.latitude, c.longitude, c.info_source, r.sido, r.sigungu,
            pay.method AS pay_method, pay.status AS pay_status, pay.refund_amount,
            EXISTS (SELECT 1 FROM review rv WHERE rv.reservation_id = rs.reservation_id) AS reviewed
     FROM reservation rs
     JOIN seat s ON s.seat_id = rs.seat_id
     JOIN seat_type st ON st.seat_type_id = s.seat_type_id
     JOIN cafe c ON c.cafe_id = s.cafe_id
     JOIN region r ON r.region_id = c.region_id
     LEFT JOIN payment pay ON pay.reservation_id = rs.reservation_id
     WHERE rs.member_id = ?
     ORDER BY rs.start_at DESC`, [req.member.memberId]);
  res.json(rows.map((r) => ({ ...r, reviewed: !!r.reviewed, ...spanFromRow(r) })));
}));

// 환불 규정: 시간제는 이용 1시간 전까지 100%, 이후 50%. 기간제는 시작 전 100%.
const refundPct = (r) => (spanFromRow(r).mode === 'PERIOD' ? 1 : (new Date(r.start_at.replace(' ', 'T')) - Date.now()) / 3600e3 >= 1 ? 1 : 0.5);

app.post('/api/reservations/:id(\\d+)/cancel', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[rs]] = await conn.query(
      'SELECT reservation_id, status, start_at, end_at, total_price FROM reservation WHERE reservation_id = ? AND member_id = ? FOR UPDATE',
      [id, req.member.memberId]);
    if (!rs) { await conn.rollback(); return res.status(404).json({ error: '예약을 찾을 수 없습니다.' }); }
    if (rs.status !== 'CONFIRMED' || new Date(rs.start_at.replace(' ', 'T')) <= new Date()) {
      await conn.rollback();
      return res.status(400).json({ error: '취소할 수 없는 예약입니다.' });
    }
    const [[pay]] = await conn.query('SELECT method, amount FROM payment WHERE reservation_id = ? FOR UPDATE', [id]);
    const refund = Math.round(pay.amount * refundPct(rs));
    await conn.query("UPDATE reservation SET status = 'CANCELED' WHERE reservation_id = ?", [id]);
    await conn.query('DELETE FROM reservation_slot WHERE reservation_id = ?', [id]);
    await conn.query("UPDATE payment SET status = 'REFUNDED', refund_amount = ? WHERE reservation_id = ?", [refund, id]);
    if (pay.method === 'POINT' && refund > 0) { // 포인트로 결제했다면 포인트로 돌려준다
      await conn.query('UPDATE member SET point_balance = point_balance + ? WHERE member_id = ?', [refund, req.member.memberId]);
      await conn.query('INSERT INTO point_ledger (member_id, reservation_id, delta, reason) VALUES (?, ?, ?, ?)', [req.member.memberId, id, refund, '예약 취소 환불']);
    }
    const [[bal]] = await conn.query('SELECT point_balance FROM member WHERE member_id = ?', [req.member.memberId]);
    await conn.commit();
    res.json({ ok: true, refund, pointBalance: bal.point_balance });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// 예약 변경: 같은 좌석에서 날짜·시간을 바꾼다. 새 시간이 비어 있어야 하고, 요금 차액은 포인트 결제일 때만 포인트로 정산한다.
app.put('/api/reservations/:id(\\d+)', auth, bookingWrap(async (req, res) => {
  const id = Number(req.params.id), b = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[rs]] = await conn.query(
      `SELECT rs.reservation_id, rs.seat_id, rs.status, rs.start_at, rs.end_at, rs.total_price, s.cafe_id, s.seat_type_id
       FROM reservation rs JOIN seat s ON s.seat_id = rs.seat_id WHERE rs.reservation_id = ? AND rs.member_id = ? FOR UPDATE`, [id, req.member.memberId]);
    if (!rs) { await conn.rollback(); return res.status(404).json({ error: '예약을 찾을 수 없습니다.' }); }
    if (rs.status !== 'CONFIRMED' || new Date(rs.start_at.replace(' ', 'T')) <= new Date()) { await conn.rollback(); return res.status(400).json({ error: '변경할 수 없는 예약입니다.' }); }
    const cur = spanFromRow(rs);
    const span = bookingSpan({ mode: cur.mode, date: b.date, startHour: b.startHour, hours: b.hours, plan: cur.plan });
    if (!span) { await conn.rollback(); return res.status(400).json({ error: '변경할 날짜와 시간을 확인해 주세요.' }); }
    if (span.error) { await conn.rollback(); return res.status(400).json({ error: span.error }); }
    const [[plan]] = await conn.query('SELECT price FROM price_plan WHERE cafe_id = ? AND seat_type_id = ? AND plan_type = ?', [rs.cafe_id, rs.seat_type_id, span.unit]);
    const total = span.unit === 'HOURLY' ? plan.price * span.hrs : rs.total_price, diff = total - rs.total_price;
    const [[pay]] = await conn.query('SELECT method FROM payment WHERE reservation_id = ? FOR UPDATE', [id]);
    if (pay.method === 'POINT' && diff > 0) {
      const [[m]] = await conn.query('SELECT point_balance FROM member WHERE member_id = ? FOR UPDATE', [req.member.memberId]);
      if (m.point_balance < diff) { await conn.rollback(); return res.status(400).json({ error: '차액을 낼 포인트가 부족합니다.' }); }
    }
    if (await hasReservationOverlap(conn, rs.seat_id, sqlTime(span.start), sqlTime(span.end), id)) {
      await conn.rollback(); return res.status(409).json({ error: '이미 예약된 시간입니다. 다른 시간을 선택해주세요.' });
    }
    await conn.query('DELETE FROM reservation_slot WHERE reservation_id = ?', [id]);
    await conn.query('INSERT INTO reservation_slot (seat_id, slot_start, reservation_id) VALUES ?', [slotRowsOf(rs.seat_id, span, id)]); // 실제 예약의 시간별 고유키도 유지한다
    await conn.query('UPDATE reservation SET start_at = ?, end_at = ?, total_price = ? WHERE reservation_id = ?', [sqlTime(span.start), sqlTime(span.end), total, id]);
    await conn.query('UPDATE payment SET amount = ? WHERE reservation_id = ?', [total, id]);
    if (pay.method === 'POINT' && diff !== 0) {
      await conn.query('UPDATE member SET point_balance = point_balance - ? WHERE member_id = ?', [diff, req.member.memberId]);
      await conn.query('INSERT INTO point_ledger (member_id, reservation_id, delta, reason) VALUES (?, ?, ?, ?)', [req.member.memberId, id, -diff, '예약 변경 차액']);
    }
    const [[bal]] = await conn.query('SELECT point_balance FROM member WHERE member_id = ?', [req.member.memberId]);
    await conn.commit();
    res.json({ ok: true, totalPrice: total, diff, pointBalance: bal.point_balance });
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '그 시간에는 이미 사용 중인 좌석이에요.' });
    throw e;
  } finally {
    conn.release();
  }
}));

// 데모용: 이용을 마친 것으로 표시해 후기를 써 볼 수 있게 한다 (실서비스라면 시간이 지나야 자동으로 완료됨)
app.post('/api/reservations/:id(\\d+)/complete', auth, wrap(async (req, res) => {
  const [r] = await pool.query("UPDATE reservation SET status = 'COMPLETED' WHERE reservation_id = ? AND member_id = ? AND status = 'CONFIRMED'", [Number(req.params.id), req.member.memberId]);
  if (!r.affectedRows) return res.status(400).json({ error: '이용 완료로 바꿀 수 없는 예약입니다.' });
  res.json({ ok: true });
}));

// ---- 후기 작성 (이용 완료한 예약만) ------------------------------------------
app.post('/api/reviews', auth, requireVerified, wrap(async (req, res) => {
  const { reservationId, rating, content } = req.body || {};
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: '평점은 1~5 사이여야 합니다.' });
  await completePast(pool, req.member.memberId);
  const [[rs]] = await pool.query(
    `SELECT rs.reservation_id, s.cafe_id FROM reservation rs JOIN seat s ON s.seat_id = rs.seat_id
     WHERE rs.reservation_id = ? AND rs.member_id = ? AND rs.status = 'COMPLETED'`,
    [Number(reservationId), req.member.memberId]);
  if (!rs) return res.status(400).json({ error: '이용 완료된 본인 예약에만 후기를 쓸 수 있습니다.' });
  try {
    await pool.query(
      'INSERT INTO review (member_id, cafe_id, reservation_id, rating, content) VALUES (?, ?, ?, ?, ?)',
      [req.member.memberId, rs.cafe_id, rs.reservation_id, r, String(content || '').slice(0, 300) || null]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '이미 후기를 작성한 예약입니다.' });
    throw e;
  }
  res.status(201).json({ ok: true });
}));

if (process.env.NODE_ENV === 'test') app.__newSession = newSession; // 테스트가 소셜 로그인 없이 세션을 만들 수 있게 (운영에서는 노출하지 않음)
module.exports = app;

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`http://localhost:${port}`));
}
