// 무료 인터넷 DB(Aiven)가 꺼져 있으면(POWEROFF) 켠다.
//  - 사이트가 DB 에 연결하지 못하는 순간 server/db.js 가 호출한다. 그래서 GitHub 예약 실행이 늦어져도
//    누군가 접속하면 곧바로 복구가 시작된다.
//  - 환경 변수 AIVEN_TOKEN, AIVEN_PROJECT, AIVEN_SERVICE 가 모두 있을 때만 동작한다 (없으면 아무 일도 하지 않는다).
//  - 토큰은 로그나 오류 문구에 절대 남기지 않는다. 필요한 권한은 서비스 읽기·켜기뿐이다.
//  - 같은 인스턴스에서는 60초에 한 번만 시도하고, 이미 시도 중이면 그 결과를 같이 기다린다.
const COOLDOWN_MS = 60 * 1000;
const TIMEOUT_MS = 4000;
let lastTry = 0;
let running = null;

function wakeDb() {
  const { AIVEN_TOKEN: token, AIVEN_PROJECT: project, AIVEN_SERVICE: service } = process.env;
  if (!token || !project || !service) return Promise.resolve('disabled');
  if (running) return running;
  if (Date.now() - lastTry < COOLDOWN_MS) return Promise.resolve('cooldown');
  lastTry = Date.now();

  // 시험 모드(NODE_ENV=test)에서만 API 주소를 바꿀 수 있다 (토큰이 다른 곳으로 가지 않도록 운영에서는 고정)
  const base = process.env.NODE_ENV === 'test' && process.env.AIVEN_API_BASE ? process.env.AIVEN_API_BASE : 'https://api.aiven.io';
  const url = `${base}/v1/project/${encodeURIComponent(project)}/service/${encodeURIComponent(service)}`;
  const headers = { Authorization: `aivenv1 ${token}`, 'Content-Type': 'application/json' };
  const call = async (method, body) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try { return await fetch(url, { method, headers, body, signal: ac.signal }); } finally { clearTimeout(timer); }
  };

  running = (async () => {
    try {
      const r = await call('GET');
      if (!r.ok) { console.log(`[wake-db] state check failed: HTTP ${r.status}`); return `state-http-${r.status}`; }
      const data = await r.json();
      const state = data && data.service && data.service.state;
      if (state !== 'POWEROFF') return `state-${state}`; // 이미 켜져 있거나 켜지는 중이면 건드리지 않는다
      const p = await call('PUT', JSON.stringify({ powered: true }));
      console.log(`[wake-db] power-on requested: HTTP ${p.status}`);
      return `power-on-${p.status}`;
    } catch (e) {
      console.log(`[wake-db] failed: ${e && e.name}`); // 메시지에는 주소·토큰이 들어갈 수 있어 이름만 남긴다
      return 'error';
    } finally {
      running = null;
    }
  })();
  return running;
}

module.exports = { wakeDb };
