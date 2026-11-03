const { test } = require('node:test');
const assert = require('node:assert/strict');
const overlaps = require('../server/reservation-overlap');
test('locks the seat before checking reservation intervals, including slot-free holds', async () => {
  const calls = [];
  const conn = { query: async (sql, args) => { calls.push({ sql, args }); return [calls.length === 2 ? [{ reservation_id: 9 }] : []]; } };
  assert.equal(await overlaps(conn, 4, '2026-11-07 10:00:00', '2026-11-07 13:00:00'), true);
  assert.match(calls[0].sql, /FROM seat.*FOR UPDATE/);
  assert.match(calls[1].sql, /FROM reservation/);
  assert.doesNotMatch(calls[1].sql, /reservation_slot/);
  assert.deepEqual(calls[1].args, [4, '2026-11-07 13:00:00', '2026-11-07 10:00:00', 0]);
});
test('a change excludes its own reservation and an empty interval result is free', async () => {
  const calls = [];
  const conn = { query: async (sql, args) => { calls.push({ sql, args }); return [[]]; } };
  assert.equal(await overlaps(conn, 4, '2026-11-07 10:00:00', '2026-11-07 13:00:00', 12), false);
  assert.equal(calls[1].args[3], 12);
  assert.match(calls[1].sql, /status = 'CONFIRMED'/);
});
