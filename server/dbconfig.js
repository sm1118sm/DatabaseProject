// DB 접속 설정 (환경 변수). 이 PC의 MySQL 과 인터넷의 MySQL(Aiven 등) 모두 같은 코드로 접속한다.
//  - ENV_FILE=.env.hosted 처럼 환경 파일을 골라 쓸 수 있다 (기본 .env)
//  - DB_SSL=true 이면 TLS 로 접속한다. 인증서는 DB_SSL_CA_FILE(파일 경로) 또는 DB_SSL_CA_BASE64(Vercel 환경 변수용)로 준다.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), process.env.ENV_FILE || '.env') });

// Aiven 의 서비스 주소(mysql://user:password@host:port/db?ssl-mode=REQUIRED) 한 줄로도 설정할 수 있다
if (process.env.DATABASE_URL) {
  const u = new URL(process.env.DATABASE_URL);
  const set = (k, v) => { if (v && !process.env[k]) process.env[k] = v; };
  set('DB_HOST', u.hostname); set('DB_PORT', u.port); set('DB_USER', decodeURIComponent(u.username));
  set('DB_PASSWORD', decodeURIComponent(u.password)); set('DB_NAME', u.pathname.replace(/^\//, ''));
  if (/^(required|verify)/i.test(u.searchParams.get('ssl-mode') || '')) set('DB_SSL', 'true');
}

function sslOptions() {
  if (process.env.DB_SSL !== 'true') return undefined;
  let ca;
  if (process.env.DB_SSL_CA_BASE64) ca = Buffer.from(process.env.DB_SSL_CA_BASE64, 'base64').toString('utf8');
  else if (process.env.DB_SSL_CA_FILE) ca = fs.readFileSync(path.resolve(process.cwd(), process.env.DB_SSL_CA_FILE), 'utf8');
  else if (process.env.DB_SSL_CA) ca = process.env.DB_SSL_CA.replace(/\n/g, '\n');
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) }; // 서버 인증서를 항상 검증한다
}

function connectionOptions(extra = {}) {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    ssl: sslOptions(),
    ...extra,
  };
}

module.exports = { connectionOptions, dbName: () => process.env.DB_NAME || 'studycafe' };
