// schema.sql 과 seed.sql 을 순서대로 실행한다.
//  - 기본(이 PC): studycafe DB 를 DROP 하고 다시 만든다.
//  - DB_SKIP_CREATE=true (Aiven 같은 인터넷 DB): 이미 있는 DB(DB_NAME) 안에서 테이블만 지우고 다시 만든다. DB 자체는 만들거나 지우지 않는다.
// 환경 파일 선택: ENV_FILE=.env.hosted npm run db:init -- --force
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { connectionOptions, dbName: getDbName } = require('../server/dbconfig');

async function main() {
  const dbName = getDbName();
  const managed = process.env.DB_SKIP_CREATE === 'true';
  const conn = await mysql.createConnection(connectionOptions({ multipleStatements: true, ...(managed ? { database: dbName } : {}) }));
  const force = process.argv.includes('--force');
  console.log(`대상: ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306} / ${dbName} ${managed ? '(기존 DB 안에서 테이블만)' : ''}`);

  if (managed) {
    const [tables] = await conn.query("SELECT TABLE_NAME n, TABLE_TYPE t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [dbName]);
    if (tables.length && !force) { console.error(`'${dbName}' 안에 이미 테이블 ${tables.length}개가 있습니다. 지우고 다시 만들려면: --force`); process.exit(1); }
    // 이 프로젝트의 것이 아닌 테이블이 보이면 다른 프로젝트의 DB 일 수 있으므로 지우지 않고 멈춘다 (예: 같은 Aiven 서비스를 다른 프로젝트와 나눠 쓰는 경우)
    const ours = new Set([...fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8').matchAll(/CREATE (?:TABLE|VIEW) (\w+)/g)].map((m) => m[1]));
    const foreign = tables.filter((t) => !ours.has(t.n)).map((t) => t.n);
    if (foreign.length && !process.argv.includes('--allow-foreign')) {
      console.error(`중단: '${dbName}' 에 이 프로젝트의 것이 아닌 테이블이 있습니다 (${foreign.slice(0, 6).join(', ')}${foreign.length > 6 ? ' …' : ''}). 다른 프로젝트의 DB 일 수 있어 아무것도 지우지 않았습니다.`);
      process.exit(1);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of tables) await conn.query(`DROP ${t.t === 'VIEW' ? 'VIEW' : 'TABLE'} IF EXISTS \`${t.n}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } else {
    const [exists] = await conn.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [dbName]);
    if (exists.length && !force) { console.error(`DB '${dbName}' 이(가) 이미 있습니다. 지우고 다시 만들려면: npm run db:init -- --force`); process.exit(1); }
  }

  const dir = path.join(__dirname, '..', 'db');
  const hash = await bcrypt.hash('demo1234', 10);
  // 인터넷 DB 에서는 DB 를 만들고 지우는 문장과 USE 를 빼고 실행한다
  const strip = (sql) => (managed ? sql.replace(/DROP DATABASE[^;]*;/gi, '').replace(/CREATE DATABASE[^;]*;/gi, '').replace(/^\s*USE\s+\w+;\s*$/gim, '') : sql);

  console.log('schema.sql 실행...');
  await conn.query(strip(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8')));

  // 전국 시·군·구는 사이트가 쓰는 public/regions.js 에서 읽어 넣는다 (같은 목록을 쓰도록)
  const sandbox = { window: {} };
  require('vm').runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'regions.js'), 'utf8'), sandbox);
  const regions = sandbox.window.SC_REGIONS;
  await conn.query(`USE \`${dbName}\``);
  await conn.query('INSERT INTO region (sido, sigungu, center_lat, center_lng) VALUES ?', [regions.map((r) => [r.sido, r.sigungu, r.center[0], r.center[1]])]);
  console.log(`region ${regions.length}곳 입력`);

  console.log('seed.sql 실행...');
  await conn.query(strip(fs.readFileSync(path.join(dir, 'seed.sql'), 'utf8')).replaceAll('__DEMO_HASH__', hash));

  const [[counts]] = await conn.query(
    `SELECT (SELECT COUNT(*) FROM region) AS regions, (SELECT COUNT(*) FROM cafe) AS cafes, (SELECT COUNT(*) FROM seat) AS seats,
            (SELECT COUNT(*) FROM price_plan) AS plans, (SELECT COUNT(*) FROM reservation) AS reservations, (SELECT COUNT(*) FROM review) AS reviews`);
  console.log('완료:', counts);
  await conn.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
