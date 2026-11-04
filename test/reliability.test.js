const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const retryTransaction = require('../server/retry-transaction');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

function session(fetch) {
  let saved = 'valid-session';
  const context = {
    API: { on: false, token: null }, SV: { user: null, res: [] }, TOKEN_KEY: 'session',
    localStorage: { getItem: () => saved, setItem: (_, value) => { saved = value; }, removeItem: () => { saved = null; } },
    renderUser() {}, loadMyRes: async () => {}, route() {},
    fetch: async (url) => url === '/api/config'
      ? { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ server: true }) }
      : fetch(),
  };
  vm.createContext(context);
  vm.runInContext(section('  const saveToken =', '  // 서버 예약 내역'), context);
  return { context, saved: () => saved };
}

for (const failure of ['503', 'network']) test(`temporary ${failure} keeps session and recovers without signing in again`, async () => {
  let healthy = false;
  const { context, saved } = session(async () => {
    if (healthy) return { ok: true, status: 200, json: async () => ({ email: 'test@example.invalid', name: 'test', points: 1 }) };
    if (failure === 'network') throw new Error('network unavailable');
    return { ok: false, status: 503, json: async () => ({ error: 'temporarily unavailable' }) };
  });
  await context.detectServer(); await context.API.restoreP; // 로그인 확인은 첫 화면을 막지 않도록 뒤에서 진행되므로, 결과를 보기 전에 끝나기를 기다린다
  assert.equal(saved(), 'valid-session');
  assert.equal(context.SV.user, null);
  healthy = true;
  await context.recoverSession();
  assert.equal(context.SV.user.email, 'test@example.invalid');
  assert.equal(saved(), 'valid-session');
});

test('confirmed authentication failure still clears the session', async () => {
  const { context, saved } = session(async () => ({ ok: false, status: 401, json: async () => ({ error: 'expired' }) }));
  await context.detectServer(); await context.API.restoreP; // 로그인 확인은 첫 화면을 막지 않도록 뒤에서 진행되므로, 결과를 보기 전에 끝나기를 기다린다
  assert.equal(saved(), null);
});

function seats() {
  let healthy = false, calls = 0, done;
  const context = {
    API: { on: true }, SV: { taken: new Map(), takenLoading: new Set(), takenError: new Set() },
    URLSearchParams, encodeURIComponent, DAYS: { DAY: 1 }, seatKeys: () => ['N1', 'N2'],
    seatLabel: (key) => key, placeIdOf: () => 'test-place',
    api: async () => { calls++; if (!healthy) throw new Error('503'); return { taken: ['N1'] }; },
  };
  vm.createContext(context);
  vm.runInContext(section('  const takenKey =', '  // ---- 후기'), context);
  const cafe = { id: 1 }, booking = { mode: 'HOURLY', date: '2026-11-20', start: 10, end: 11 };
  return { context, cafe, booking, healthy: () => { healthy = true; }, calls: () => calls,
    query: () => new Promise((resolve) => context.ensureTaken(cafe, 'NORMAL', booking, 0, resolve)) };
}

test('failed seat lookup remains unknown, avoids a retry loop, then recovers with actual occupied seats', async () => {
  const s = seats();
  assert.equal(s.context.avail(s.cafe, 'NORMAL', s.booking).ready, false);
  await s.query();
  const failed = s.context.avail(s.cafe, 'NORMAL', s.booking);
  assert.equal(failed.ready, false);
  assert.equal(failed.failed, true);
  assert.equal(failed.free, null);
  assert.equal(s.context.SV.taken.size, 0);
  s.context.ensureTaken(s.cafe, 'NORMAL', s.booking, 0);
  assert.equal(s.calls(), 1);
  s.healthy();
  s.context.SV.takenError.clear();
  await s.query();
  const ready = s.context.avail(s.cafe, 'NORMAL', s.booking);
  assert.equal(ready.ready, true);
  assert.equal(ready.free, 1);
  assert.equal(ready.taken.has('N1'), true);
});

test('unverified availability disables seat buttons and offers a retry after failure', async () => {
  const s = seats(); await s.query();
  const box = { innerHTML: '' };
  Object.assign(s.context, {
    S: { book: { ...s.booking, cafeId: 1, type: 'NORMAL', seat: 'N2' } },
    $: () => box, cafeById: () => s.cafe, SEAT: { NORMAL: '일반석' },
    fmtDate: (value) => value, hh: String, esc: String, PLAN: {}, refreshBook() {},
  });
  vm.runInContext(section('  function renderSeats()', '  function renderBook()'), s.context);
  s.context.renderSeats();
  assert.equal((box.innerHTML.match(/data-act="bseat"[^>]*disabled/g) || []).length, 2);
  assert.match(box.innerHTML, /data-act="retrySeats"/);
  assert.doesNotMatch(box.innerHTML, /2\/2석 이용 가능/);
  assert.equal(s.context.S.book.seat, null);
});

test('booking button stays disabled when availability has not been verified', () => {
  const s = seats(), box = { innerHTML: '' };
  Object.assign(s.context, {
    S: { book: { ...s.booking, cafeId: 1, type: 'NORMAL', seat: 'N2' } },
    $: () => box, cafeById: () => s.cafe, timeError: () => null,
    bookTotal: () => 1000, price: () => 1000, won: String, SEAT: { NORMAL: '일반석' },
    todayStr: () => '2026-11-02', esc: String, timeOptions: () => '', PLAN: {},
  });
  vm.runInContext(section('  function renderBook()', '  // ---- 결제'), s.context);
  s.context.renderBook();
  assert.match(box.innerHTML, /data-act="pay" disabled/);
  assert.match(box.innerHTML, /좌석 현황을 먼저 확인/);
});

test('deadlocked operation is retried from the beginning and can return a normal conflict', async () => {
  let calls = 0;
  const response = await retryTransaction(async () => {
    if (++calls === 1) throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' });
    return { status: 409 };
  });
  assert.equal(response.status, 409); assert.equal(calls, 2);
});

test('deadlock retries are bounded', async () => {
  let calls = 0;
  await assert.rejects(retryTransaction(async () => { calls++; throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }); }), { code: 'ER_LOCK_DEADLOCK' });
  assert.equal(calls, 3);
});

test('uncertain connection failures and duplicate entries are never retried', async () => {
  for (const code of ['PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ER_DUP_ENTRY']) {
    let calls = 0;
    await assert.rejects(retryTransaction(async () => { calls++; throw Object.assign(new Error(code), { code }); }), { code });
    assert.equal(calls, 1);
  }
});
