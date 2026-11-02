// 사이트가 계산한 카페 정보(이름·주소·좌표·좌석 수·예시 가격)를 DB 에 넣는다.
// 사용법: npm run db:import -- data/cafes-nationwide.jsonl [--dry-run]   (인터넷 DB: ENV_FILE=.env.hosted npm run db:import -- ...)
// 한 줄이 시·군·구 하나이며 {sido, sigungu, cafes:[...]} 모양이다. 이미 있는 카페(kakao_place_id)는 건너뛴다.
// 요금은 모두 price_source = 'EXAMPLE' 로 넣는다. 팀이 직접 확인한 요금만 나중에 VERIFIED(출처·확인일)로 바꾼다.
const fs = require('fs');
const mysql = require('mysql2/promise');
const { connectionOptions, dbName } = require('../server/dbconfig');

const file = process.argv[2];
const dry = process.argv.includes('--dry-run');
if (!file || !fs.existsSync(file)) { console.error('사용법: npm run db:import -- <cafes.jsonl> [--dry-run]'); process.exit(1); }

const PLAN = { DAY: 'DAILY', WEEK: 'WEEKLY', MONTH: 'MONTHLY' };
const TYPES = ['NORMAL', 'FOCUS', 'ROOM'];
const seatLabel = (t, i) => (t === 'ROOM' ? `스터디룸 ${i}` : `${t === 'NORMAL' ? '일반석' : '집중석'} ${i}번`);
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

async function main() {
  const conn = await mysql.createConnection(connectionOptions({ database: dbName() }));
  const [regs] = await conn.query('SELECT region_id, sido, sigungu FROM region');
  const regionId = new Map(regs.map((r) => [`${r.sido}|${r.sigungu}`, r.region_id]));
  const [types] = await conn.query('SELECT seat_type_id, code FROM seat_type');
  const typeId = Object.fromEntries(types.map((t) => [t.code, t.seat_type_id]));

  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const tot = { regions: 0, cafes: 0, skipped: 0, seats: 0, plans: 0, missingRegion: 0 };

  for (const ln of lines) {
    const rid = regionId.get(`${ln.sido}|${ln.sigungu}`);
    if (!rid) { tot.missingRegion++; console.warn(`지역 없음: ${ln.sido} ${ln.sigungu}`); continue; }
    if (!ln.cafes.length) { tot.regions++; continue; }
    const ids = ln.cafes.map((c) => String(c.id));
    const [have] = await conn.query('SELECT kakao_place_id FROM cafe WHERE kakao_place_id IN (?)', [ids]);
    const exists = new Set(have.map((r) => r.kakao_place_id));
    const fresh = ln.cafes.filter((c) => !exists.has(String(c.id)));
    tot.skipped += ln.cafes.length - fresh.length;
    if (dry) { tot.regions++; tot.cafes += fresh.length; continue; }
    if (!fresh.length) { tot.regions++; continue; }

    await conn.beginTransaction(); // 구 단위로 묶어서, 중간에 실패해도 반쯤 들어간 상태가 남지 않게 한다
    try {
      await conn.query(
        'INSERT INTO cafe (kakao_place_id, region_id, name, address, phone, latitude, longitude, place_url, info_source, fetched_at) VALUES ?',
        [fresh.map((c) => [String(c.id), rid, clip(c.name, 100), clip(c.addr, 200), clip(c.phone, 20) || null, c.lat, c.lng, clip(c.url, 200) || null, 'KAKAO', new Date()])]);
      const [rows] = await conn.query('SELECT cafe_id, kakao_place_id FROM cafe WHERE kakao_place_id IN (?)', [fresh.map((c) => String(c.id))]);
      const cid = new Map(rows.map((r) => [r.kakao_place_id, r.cafe_id]));
      const seats = [], plans = [];
      for (const c of fresh) {
        const id = cid.get(String(c.id));
        for (const t of TYPES) {
          for (let i = 1; i <= (c.seats[t] || 0); i++) seats.push([id, typeId[t], seatLabel(t, i), t === 'ROOM' ? (c.roomCap || 4) : 1]);
          const p = (c.price || {})[t] || {};
          if (p.hourly != null) plans.push([id, typeId[t], 'HOURLY', p.hourly, 'EXAMPLE']);
          if (t !== 'ROOM') for (const k of Object.keys(PLAN)) if (p[k] != null) plans.push([id, typeId[t], PLAN[k], p[k], 'EXAMPLE']);
        }
      }
      for (let i = 0; i < seats.length; i += 8000) await conn.query('INSERT INTO seat (cafe_id, seat_type_id, label, capacity) VALUES ?', [seats.slice(i, i + 8000)]);
      for (let i = 0; i < plans.length; i += 8000) await conn.query('INSERT INTO price_plan (cafe_id, seat_type_id, plan_type, price, price_source) VALUES ?', [plans.slice(i, i + 8000)]);
      await conn.commit();
      tot.regions++; tot.cafes += fresh.length; tot.seats += seats.length; tot.plans += plans.length;
      process.stdout.write(`\r${tot.regions}/${lines.length}구 · 카페 ${tot.cafes}곳 `);
    } catch (e) {
      await conn.rollback();
      console.error(`\n실패(${ln.sido} ${ln.sigungu}): ${e.code || ''} ${e.message}`);
      process.exitCode = 1;
      break;
    }
  }
  console.log(`\n${dry ? '[미리보기 — DB 변경 없음] ' : ''}완료:`, tot);
  await conn.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
