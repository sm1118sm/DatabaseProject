const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.ENV_FILE = '__no_test_environment_file__';
process.env.AUTH_SECRET = 'isolated-booking-price-test';
let rolledBack = false;
const statements = [];
const conn = { beginTransaction: async () => {}, rollback: async () => { rolledBack = true; }, release() {},
  query: async (sql) => {
    statements.push(sql);
    if (sql.includes('FROM seat s')) return [[{ seat_id: 7, seat_type_id: 1, cafe_id: 42, is_room: 0, is_active: 1, open_time: '00:00:00', close_time: '23:59:59' }]];
    if (sql.includes('FROM price_plan')) return [[{ price: 4100 }]];
    throw Error('Unexpected write or query');
  } };
require.cache[require.resolve('../server/db')] = { id: require.resolve('../server/db'), filename: require.resolve('../server/db'), loaded: true,
  exports: { query: async () => [[{ phone_verified: 1 }]], getConnection: async () => conn } };
const app = require('../server/index');

test('a changed price returns 409 and rolls back before creating reservations or payments', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/reservations`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${app.__newSession({ member_id: 1, name: 'test' })}` },
      body: JSON.stringify({ cafeId: 42, seatLabel: '일반석 1번', mode: 'HOURLY', date: '2099-01-01', startHour: 10, hours: 2, method: 'CARD', quotedTotal: 2000 })
    });
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'PRICE_CHANGED');
    assert.equal(rolledBack, true); assert.equal(statements.some((sql) => /INSERT|UPDATE|DELETE/.test(sql)), false);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
