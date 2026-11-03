const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const clientSource = source.slice(source.indexOf('  // List cards use'), source.indexOf('  // ---- 후기'));
function client(fetch) {
  let view = { type: 'NORMAL', mode: 'HOURLY', date: '2026-11-20', start: 10, end: 12, plan: 'DAY' };
  const context = { API: { on: true }, SV: { listSeats: new Map(), taken: new Map(), takenError: new Set() },
    URLSearchParams, Date, DAYS: { DAY: 1, WEEK: 7, MONTH: 30 }, document: { querySelectorAll: () => [] },
    placeIdOf: (c) => String(c.id), takenKey: (c, type, o) => JSON.stringify([c.id, type, o.mode, o.date, o.start, o.end, o.plan]),
    qView: () => view, api: async (_, url) => fetch(new URL(url, 'https://example.invalid')) };
  vm.createContext(context); vm.runInContext(clientSource, context);
  return { context, view: () => view, change: (next) => { view = { ...view, ...next }; } };
}

test('lists 85 cafes with three sequential requests and shows returned counts', async () => {
  let requests = 0, active = 0, maxActive = 0;
  const c = client(async (url) => {
    requests++; active++; maxActive = Math.max(maxActive, active);
    const ids = url.searchParams.get('placeIds').split(','); assert.ok(ids.length <= 40);
    await Promise.resolve(); active--;
    return ids.map((placeId) => ({ placeId, total: 59, free: 58 }));
  });
  const cafes = Array.from({ length: 85 }, (_, i) => ({ id: i + 1 }));
  const loading = c.context.loadListSeats(cafes, c.view());
  assert.match(c.context.listSeatsHtml(cafes[0], c.view()), /조회 중/);
  await loading;
  assert.equal(requests, 3); assert.equal(maxActive, 1);
  assert.match(c.context.listSeatsHtml(cafes[0], c.view()), /잔여 58\/59석/);
  await c.context.loadListSeats(cafes, c.view()); assert.equal(requests, 3);
});

test('failed lookup never displays vacant seats and can be retried', async () => {
  let failed = true;
  const c = client(async () => { if (failed) throw Error('503'); return [{ placeId: '1', total: 2, free: 0 }]; });
  const cafe = { id: 1 };
  await c.context.loadListSeats([cafe], c.view());
  assert.match(c.context.listSeatsHtml(cafe, c.view()), /좌석 조회 재시도/);
  assert.doesNotMatch(c.context.listSeatsHtml(cafe, c.view()), /잔여/);
  failed = false; c.context.clearSeatCaches();
  await c.context.loadListSeats([cafe], c.view());
  assert.match(c.context.listSeatsHtml(cafe, c.view()), /잔여 0\/2석/);
});

test('date, type, and period conditions use separate cached counts', async () => {
  const queries = [];
  const c = client(async (url) => { queries.push(url.searchParams); return [{ placeId: '1', total: 3, free: queries.length }]; });
  const cafe = { id: 1 };
  await c.context.loadListSeats([cafe], c.view());
  c.change({ date: '2026-11-21', type: 'ROOM' });
  assert.match(c.context.listSeatsHtml(cafe, c.view()), /조회 중/);
  await c.context.loadListSeats([cafe], c.view());
  c.change({ type: 'NORMAL', mode: 'PERIOD', plan: 'WEEK' });
  await c.context.loadListSeats([cafe], c.view());
  assert.equal(queries.length, 3); assert.equal(queries[1].get('type'), 'ROOM');
  assert.equal(queries[1].get('date'), '2026-11-21'); assert.equal(queries[2].get('days'), '7');
  assert.equal(queries[2].get('start'), null);
});

test('response from before a booking cannot repopulate invalidated cache', async () => {
  let release, started;
  const waiting = new Promise((r) => { started = r; });
  const c = client(async () => { started(); return new Promise((r) => { release = r; }); });
  const cafe = { id: 1 }, pending = c.context.loadListSeats([cafe], c.view());
  await waiting; c.context.clearSeatCaches(); release([{ placeId: '1', total: 59, free: 59 }]); await pending;
  assert.match(c.context.listSeatsHtml(cafe, c.view()), /조회 중/);
  assert.equal(c.context.SV.listSeats.size, 0);
});

test('unregistered cafes are not reported as vacant and invalid counts fail closed', async () => {
  const c = client(async () => [{ placeId: '1', total: null, free: null }, { placeId: '2', total: 1, free: 2 }]);
  await c.context.loadListSeats([{ id: 1 }], c.view());
  assert.match(c.context.listSeatsHtml({ id: 1 }, c.view()), /좌석 정보 미등록/);
  await c.context.loadListSeats([{ id: 2 }], c.view());
  assert.match(c.context.listSeatsHtml({ id: 2 }, c.view()), /재시도/);
});

test('rapid date changes discard queued queries for the old selection', async () => {
  let calls = 0;
  const c = client(async (url) => { calls++; return url.searchParams.get('placeIds').split(',').map((placeId) => ({ placeId, total: 3, free: 2 })); });
  const cafes = Array.from({ length: 85 }, (_, i) => ({ id: i + 1 }));
  const oldView = c.view(), pending = c.context.loadListSeats(cafes, oldView);
  c.change({ date: '2026-11-21' }); await pending;
  assert.equal(calls, 0); assert.equal(c.context.SV.listSeats.size, 0);
  await c.context.loadListSeats(cafes, c.view()); assert.equal(calls, 3);
});
