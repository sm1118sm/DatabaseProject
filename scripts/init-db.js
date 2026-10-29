// schema.sql 과 seed.sql 을 순서대로 실행한다. (schema.sql 은 studycafe DB 를 DROP 하고 다시 만든다)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  const dbName = process.env.DB_NAME || 'studycafe';
  const [exists] = await conn.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [dbName]);
  if (exists.length && !process.argv.includes('--force')) {
    console.error(`DB '${dbName}' 이(가) 이미 있습니다. 지우고 다시 만들려면: npm run db:init -- --force`);
    process.exit(1);
  }

  const dir = path.join(__dirname, '..', 'db');
  const hash = await bcrypt.hash('demo1234', 10);

  console.log('schema.sql 실행...');
  await conn.query(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));

  console.log('seed.sql 실행...');
  await conn.query(fs.readFileSync(path.join(dir, 'seed.sql'), 'utf8').replaceAll('__DEMO_HASH__', hash));

  const [[counts]] = await conn.query(
    `SELECT (SELECT COUNT(*) FROM cafe) AS cafes, (SELECT COUNT(*) FROM room) AS rooms,
            (SELECT COUNT(*) FROM reservation) AS reservations, (SELECT COUNT(*) FROM review) AS reviews`);
  console.log('완료:', counts);
  await conn.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
