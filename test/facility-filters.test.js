const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

test('regional price comparison and difference sorting survive feature removal', () => {
  const cafes = [3000, 1000, 2000].map((hourly, id) => ({ id, sido: '서울', sigungu: '강남', lat: 0, lng: 0, price: { NORMAL: { hourly } } }));
  const context = vm.createContext({ D: { cafes }, S: { q: { sido: '서울', sigungu: '강남', sort: 'diff' } },
    qView: () => ({ type: 'NORMAL', mode: 'HOURLY' }), origin: () => [0, 0], dist: () => 0, isOpen: () => true, avail: () => 1, ratingOf: () => ({ avg: 0 }), won: n => n+'원' });
  vm.runInContext(source.slice(source.indexOf('  const price ='), source.indexOf('  // ---- 거리')), context);
  vm.runInContext(source.slice(source.indexOf('  const RADIUS_KM'), source.indexOf('  function avgStrip')), context);
  const rows = vm.runInContext('results()', context);
  assert.deepEqual(Array.from(rows, r => r.p), [1000, 2000, 3000]);
  assert.deepEqual(Array.from(rows, r => r.diff), [-1000, 0, 1000]);
  assert.equal(rows[0].avg, 2000);
  assert.match(vm.runInContext('diffBadge(-1000, 2000)', context), /저렴/);
  assert.match(vm.runInContext('diffBar(1000, 2000, "low")', context), /지역 평균/);
});

test('retired controls and endpoints are absent while average sort remains', () => {
  assert.doesNotMatch(source, /data-act="(?:fac|facmore|clearFac)"|sec-fac|q\.fac|c\.fac/);
  assert.match(source, /\['diff', '평균 대비 저렴순'\]/);
  const server = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
  assert.doesNotMatch(server, /\/api\/facilities|\/api\/me\/favorites|v_cafe_price_vs_region|FROM cafe_facility/);
  assert.match(server, /\) comparison WHERE cafe_id = \?/);
});
