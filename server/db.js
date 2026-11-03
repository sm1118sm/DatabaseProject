const mysql = require('mysql2/promise');
const { connectionOptions, dbName } = require('./dbconfig');

// 서버리스(Vercel)에서는 요청마다 새 인스턴스가 떠서 접속이 쉽게 늘어나므로 DB_POOL 로 인스턴스당 접속 수를 줄인다.
const raw = mysql.createPool(connectionOptions({
  database: dbName(),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL || 10),
  dateStrings: true,
  enableKeepAlive: true,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 2500), // 서버리스 함수의 제한 시간(10초) 안에 재시도까지 끝나도록 짧게
}));

// 무료 인터넷 DB 는 쓰지 않으면 꺼질 수 있다. '접속 자체가 안 되는' 오류일 때만 짧게 기다렸다 다시 시도한다.
// (질의 도중 끊긴 오류는 이미 실행됐을 수 있어서 다시 시도하지 않는다)
const CONNECT_ERRORS = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn) {
  const attempts = Number(process.env.DB_CONNECT_ATTEMPTS || 3);
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (!CONNECT_ERRORS.has(e.code)) throw e;
      if (i >= attempts) { e.dbDown = true; throw e; }
      await sleep(Math.min(500 * 2 ** (i - 1), 3000));
    }
  }
}

module.exports = {
  query: (...args) => withRetry(() => raw.query(...args)),
  getConnection: () => withRetry(() => raw.getConnection()),
  end: () => raw.end(),
};
