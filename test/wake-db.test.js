const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MODULE = path.join(__dirname, '../server/wake-db.js');
const SECRET = 'tok-SECRET-should-never-appear';
const realFetch = global.fetch, realLog = console.log;
let calls, logs;

// 모듈 안의 '마지막 시도 시각'이 테스트끼리 섞이지 않도록 매번 새로 불러온다
const load = () => { delete require.cache[MODULE]; return require(MODULE).wakeDb; };
const loadStatus = () => require(MODULE).wakeStatus;
const env = (on) => {
  for (const k of ['AIVEN_TOKEN', 'AIVEN_PROJECT', 'AIVEN_SERVICE']) delete process.env[k];
  if (on) Object.assign(process.env, { AIVEN_TOKEN: SECRET, AIVEN_PROJECT: 'proj-x', AIVEN_SERVICE: 'svc-y' });
};
const stubFetch = (state, putStatus = 200) => {
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body });
    if (opts.method === 'GET') return { ok: true, status: 200, json: async () => ({ service: { state } }) };
    return { ok: putStatus < 300, status: putStatus, json: async () => ({}) };
  };
};

beforeEach(() => { calls = []; logs = []; console.log = (...a) => logs.push(a.join(' ')); });
afterEach(() => { global.fetch = realFetch; console.log = realLog; env(false); });

test('환경 변수가 없으면 아무 요청도 보내지 않는다', async () => {
  env(false); stubFetch('POWEROFF');
  assert.equal(await load()(), 'disabled');
  assert.equal(calls.length, 0);
});

test('꺼져 있으면(POWEROFF) 켜기 요청(powered: true)을 보낸다', async () => {
  env(true); stubFetch('POWEROFF');
  assert.equal(await load()(), 'power-on-200');
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PUT']);
  assert.equal(calls[1].url, 'https://api.aiven.io/v1/project/proj-x/service/svc-y');
  assert.deepEqual(JSON.parse(calls[1].body), { powered: true });
  assert.equal(calls[1].headers.Authorization, `aivenv1 ${SECRET}`);
});

test('이미 켜져 있거나 켜지는 중이면 건드리지 않는다', async () => {
  for (const state of ['RUNNING', 'REBUILDING']) {
    calls = []; env(true); stubFetch(state);
    assert.equal(await load()(), `state-${state}`);
    assert.deepEqual(calls.map((c) => c.method), ['GET']);
  }
});

test('같은 인스턴스에서 60초 안에는 다시 시도하지 않는다', async () => {
  env(true); stubFetch('POWEROFF');
  const wake = load();
  assert.equal(await wake(), 'power-on-200');
  assert.equal(await wake(), 'cooldown');
  assert.equal(calls.length, 2);
});

test('동시에 여러 번 불러도 요청은 한 번만 나간다', async () => {
  env(true); stubFetch('POWEROFF');
  const wake = load();
  const r = await Promise.all([wake(), wake(), wake()]);
  assert.deepEqual(r, ['power-on-200', 'power-on-200', 'power-on-200']);
  assert.equal(calls.length, 2);
});

test('상태 조회가 실패해도 오류를 던지지 않고, 토큰을 로그에 남기지 않는다', async () => {
  env(true);
  global.fetch = async () => { throw Object.assign(new Error(`connect failed https://api.aiven.io token=${SECRET}`), { name: 'FetchError' }); };
  assert.equal(await load()(), 'error');
  assert.ok(logs.length > 0);
  assert.ok(!logs.join('\n').includes(SECRET), '로그에 토큰이 있으면 안 된다');
});

test('권한이 없어(403) 켜기가 거절돼도 오류를 던지지 않는다', async () => {
  env(true); stubFetch('POWEROFF', 403);
  assert.equal(await load()(), 'power-on-403');
  assert.ok(!logs.join('\n').includes(SECRET));
});

test('상태: 설정 여부와 마지막 시도 결과만 알려 주고 비밀 값은 담지 않는다', async () => {
  env(false);
  const wake0 = load(); const status0 = loadStatus();
  assert.deepEqual(status0(), { configured: false, last: null, at: null });
  env(true); stubFetch('POWEROFF');
  await wake0();
  const st = status0();
  assert.equal(st.configured, true);
  assert.equal(st.last, 'power-on-200');
  assert.ok(st.at);
  const text = JSON.stringify(st);
  assert.ok(!text.includes(SECRET) && !text.includes('proj-x') && !text.includes('svc-y'));
});
