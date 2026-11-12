const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const catalog = require('../server/cafe-catalog');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const row = { cafe_id: 42, kakao_place_id: '123', name: '스터디카페', address: '서울 강남구', sido: '서울', sigungu: '강남구', latitude: 37, longitude: 127,
  open_time: '09:00:00', close_time: '23:59:59',
  plans: [{ code: 'NORMAL', plan_type: 'HOURLY', price: 4100, region_avg_price: 3500, price_source: 'VERIFIED' },
    { code: 'NORMAL', plan_type: 'MONTHLY', price: 120000, region_avg_price: 150000, price_source: 'EXAMPLE' }],
  seats: [{ code: 'NORMAL', total: 8, capacity: 1 }, { code: 'ROOM', total: 2, capacity: 6 }] };

function client() {
  const context = vm.createContext({ API: { on: true }, D: { cafes: [] }, S: { regionTime: new Map() },
    Map, Set, Date, URLSearchParams,
    fromPlace: (p, r) => ({ id: Number(p.id), ...r, price: { NORMAL: { hourly: 1000 } }, seats: { NORMAL: 99 } }) });
  vm.runInContext(source.slice(source.indexOf('  const enrichedRegions'), source.indexOf('  // 고른 시·군·구의 실제 카페를 불러온다. 같은')), context);
  vm.runInContext(source.slice(source.indexOf('  const price ='), source.indexOf('  // ---- 거리')) + '\nthis.price = price;', context);
  return context;
}

test('DB prices, averages, hours and seat totals replace generated and cached values', () => {
  const c = client();
  const cafe = c.catalogCafe(row, { price: { NORMAL: { hourly: 1000 } }, station: '강남역' });
  assert.equal(cafe.dbId, 42); assert.equal(cafe.seats.NORMAL, 8); assert.equal(cafe.roomCap, 6);
  assert.equal(cafe.open, 9); assert.equal(cafe.close, 24); assert.equal(cafe.station, '강남역');
  assert.equal(c.price(cafe, 'NORMAL', 'HOURLY'), 4100);
  assert.equal(c.regionAvg(cafe, 'NORMAL', 'HOURLY'), 3500);
  assert.equal(c.price(cafe, 'NORMAL', 'PERIOD', 'MONTH'), 120000);
  assert.equal(c.regionAvg(cafe, 'NORMAL', 'PERIOD', 'MONTH'), 150000);
  assert.equal(c.price(cafe, 'FOCUS', 'HOURLY'), null);
  assert.equal(c.price({ price: { NORMAL: { hourly: 999 } } }, 'NORMAL', 'HOURLY'), null);
});

test('regional averages come from the DB even when only one cafe is visible', () => {
  const c = client(); const cafe = c.catalogCafe(row);
  c.D.cafes.push(cafe);
  assert.equal(c.regionAvg(cafe, 'NORMAL', 'HOURLY'), 3500);
  assert.equal(c.price(cafe, 'NORMAL', 'HOURLY') - c.regionAvg(cafe, 'NORMAL', 'HOURLY'), 600);
});

test('catalog parameterizes region and keeps separate seat types and plan averages', async () => {
  const calls = [];
  const responses = [[{ cafe_id: 42 }], [{ cafe_id: 42, code: 'NORMAL', price: '4100', region_avg_price: '3500', cafe_count: '2' }], [{ cafe_id: 42, code: 'ROOM', total: '2', capacity: 6 }]];
  const result = await catalog({ query: async (sql, args) => { calls.push({ sql, args }); return [responses[calls.length - 1]]; } }, { sido: "'서울", sigungu: '강남구' });
  assert.equal(calls.length, 3);
  for (const call of calls) { assert.deepEqual(call.args, ["'서울", '강남구']); assert.doesNotMatch(call.sql, /'서울/); assert.match(call.sql, /is_active = 1/); }
  assert.match(calls[1].sql, /PARTITION BY c.region_id, p.seat_type_id, p.plan_type/);
  assert.equal(result[0].plans[0].price, 4100); assert.equal(result[0].seats[0].total, 2);
});
