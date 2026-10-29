// 카카오 로컬 API(키워드 검색)로 스터디카페를 수집해 DB에 넣는다.
// 사용법: npm run collect -- "서울 강남구" ["서울 마포구" ...]
// 카카오 API 는 가격을 제공하지 않으므로 새로 들어온 카페의 좌석/룸/요금은 더미 값으로 채운다.
require('dotenv').config();
const pool = require('../server/db');

const KEY = process.env.KAKAO_REST_KEY;
const regions = process.argv.slice(2);
if (!KEY) { console.error('.env 에 KAKAO_REST_KEY 를 설정하세요.'); process.exit(1); }
if (!regions.length) { console.error('사용법: npm run collect -- "서울 강남구" ["서울 마포구" ...]'); process.exit(1); }

async function search(query, page) {
  const url = 'https://dapi.kakao.com/v2/local/search/keyword.json?' + new URLSearchParams({ query, page, size: 15 });
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } });
  if (!res.ok) throw new Error(`카카오 API ${res.status}: ${await res.text()}`);
  return res.json();
}

// "서울 강남구 역삼동 1" -> { sido: '서울', sigungu: '강남구' }
// "충남 천안시 동남구 ..." -> { sido: '충남', sigungu: '천안시 동남구' }
function parseRegion(address) {
  const t = address.split(' ');
  if (t.length < 2) return null;
  const sigungu = t[1].endsWith('시') && t[2] && t[2].endsWith('구') ? `${t[1]} ${t[2]}` : t[1];
  return { sido: t[0], sigungu };
}

const rand = (min, max, step) => min + step * Math.floor(Math.random() * ((max - min) / step + 1));

async function upsertCafe(place) {
  const addr = place.road_address_name || place.address_name;
  const reg = parseRegion(place.address_name || addr);
  if (!reg) return null;

  await pool.query('INSERT IGNORE INTO region (sido, sigungu) VALUES (?, ?)', [reg.sido, reg.sigungu]);
  const [[r]] = await pool.query('SELECT region_id FROM region WHERE sido = ? AND sigungu = ?', [reg.sido, reg.sigungu]);

  await pool.query(
    `INSERT INTO cafe (kakao_place_id, region_id, name, address, phone, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), address = VALUES(address), phone = VALUES(phone),
                             latitude = VALUES(latitude), longitude = VALUES(longitude), region_id = VALUES(region_id)`,
    [place.id, r.region_id, place.place_name, addr, place.phone || null, place.y, place.x]);
  const [[cafe]] = await pool.query('SELECT cafe_id FROM cafe WHERE kakao_place_id = ?', [place.id]);

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM room WHERE cafe_id = ?', [cafe.cafe_id]);
  if (n === 0) {
    const rooms = [];
    for (let i = 1; i <= 6; i++) rooms.push([cafe.cafe_id, `좌석 ${i}`, 'SEAT', 1]);
    for (let i = 1; i <= 2; i++) rooms.push([cafe.cafe_id, `룸 ${i}`, 'ROOM', 4]);
    await pool.query('INSERT INTO room (cafe_id, name, room_type, capacity) VALUES ?', [rooms]);

    const seat = rand(1500, 4500, 100), room = rand(6000, 15000, 500);
    await pool.query('INSERT INTO price_plan (cafe_id, room_type, plan_type, price) VALUES ?', [[
      [cafe.cafe_id, 'SEAT', 'HOURLY', seat],
      [cafe.cafe_id, 'SEAT', 'DAILY', Math.round(seat * 6 / 100) * 100],
      [cafe.cafe_id, 'SEAT', 'WEEKLY', Math.round(seat * 28 / 100) * 100],
      [cafe.cafe_id, 'SEAT', 'MONTHLY', Math.round(seat * 80 / 100) * 100],
      [cafe.cafe_id, 'ROOM', 'HOURLY', room],
    ]]);
    return 'new';
  }
  return 'updated';
}

async function main() {
  const seen = new Set();
  let added = 0, updated = 0;
  for (const region of regions) {
    for (const keyword of ['스터디카페', '스터디룸']) {
      for (let page = 1; page <= 3; page++) {
        const data = await search(`${region} ${keyword}`, page);
        for (const p of data.documents) {
          if (seen.has(p.id) || !/스터디|독서실/.test(p.category_name + p.place_name)) continue;
          seen.add(p.id);
          const r = await upsertCafe(p);
          if (r === 'new') added++; else if (r === 'updated') updated++;
        }
        if (data.meta.is_end) break;
      }
    }
    console.log(`${region}: 누적 신규 ${added}, 갱신 ${updated}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
