const fs = require('node:fs'), path = require('node:path');
const mysql = require('mysql2/promise');
const cfg = require('../server/dbconfig');
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0 && (!process.argv[outputIndex + 1] || process.argv[outputIndex + 1].startsWith('--'))) throw Error('--output requires a file path');
const out = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : null;
const dbIndex = process.argv.indexOf('--database');
if (dbIndex >= 0 && (!process.argv[dbIndex + 1] || process.argv[dbIndex + 1].startsWith('--'))) throw Error('--database requires a database name');
const database = dbIndex >= 0 ? process.argv[dbIndex + 1] : cfg.dbName();
(async () => {
  const opts = cfg.connectionOptions({ database, connectTimeout: 12000, dateStrings: true });
  if (!['localhost','127.0.0.1','::1'].includes(opts.host) && opts.ssl?.rejectUnauthorized !== true) throw Error('Remote DB checks require certificate-verified TLS');
  const db = await mysql.createConnection(opts);
  try {
    await db.query('SET TRANSACTION READ ONLY');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const report = { checkedAt: new Date().toISOString(), database, readOnly: true };
    const [tables] = await db.query("SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
    const [cols] = await db.query("SELECT TABLE_NAME table_name,COLUMN_NAME name,DATA_TYPE type,IS_NULLABLE nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION");
    const [keys] = await db.query("SELECT TABLE_NAME table_name,INDEX_NAME name,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND NON_UNIQUE=0 GROUP BY TABLE_NAME,INDEX_NAME ORDER BY TABLE_NAME,INDEX_NAME");
    const [fks] = await db.query("SELECT TABLE_NAME table_name,COLUMN_NAME col,REFERENCED_TABLE_NAME target,REFERENCED_COLUMN_NAME target_col FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL");
    report.schema = { tables: tables.map(x=>x.name), columnCount: cols.length, primaryKeys: keys.filter(x=>x.name==='PRIMARY').length, uniqueKeys: keys.filter(x=>x.name!=='PRIMARY').length, foreignKeys: fks.length,
      noCollectionTypes: !cols.some(c=>['json','set'].includes(c.type)),
      cafeDoesNotRepeatRegionName: !cols.some(c=>c.table_name==='cafe'&&['sido','sigungu'].includes(c.name)),
      pricePlanDoesNotRepeatCafeName: !cols.some(c=>c.table_name==='price_plan'&&['name','address','cafe_name'].includes(c.name)),
      seatDoesNotRepeatTypeName: !cols.some(c=>c.table_name==='seat'&&['type_name','seat_type_name'].includes(c.name)), keys };
    const checks = [
      ['duplicateMemberEmail', 'SELECT COUNT(*) n FROM (SELECT email FROM member GROUP BY email HAVING COUNT(*)>1) x'],
      ['duplicateRegions', 'SELECT COUNT(*) n FROM (SELECT sido,sigungu FROM region GROUP BY sido,sigungu HAVING COUNT(*)>1) x'],
      ['duplicatePricePlans', 'SELECT COUNT(*) n FROM (SELECT cafe_id,seat_type_id,plan_type FROM price_plan GROUP BY cafe_id,seat_type_id,plan_type HAVING COUNT(*)>1) x'],
      ['duplicateSeatLabels', 'SELECT COUNT(*) n FROM (SELECT cafe_id,label FROM seat GROUP BY cafe_id,label HAVING COUNT(*)>1) x'],
      ['duplicateSeatTimeSlots', 'SELECT COUNT(*) n FROM (SELECT seat_id,slot_start FROM reservation_slot GROUP BY seat_id,slot_start HAVING COUNT(*)>1) x'],
      ['duplicateReservationStartSlots', 'SELECT COUNT(*) n FROM (SELECT reservation_id,slot_start FROM reservation_slot GROUP BY reservation_id,slot_start HAVING COUNT(*)>1) x'],
      ['slotReservationSeatMismatchRows', 'SELECT COUNT(*) n FROM reservation_slot s JOIN reservation r ON r.reservation_id=s.reservation_id WHERE s.seat_id<>r.seat_id'],
      ['slotReservationsWithMultipleSeats', 'SELECT COUNT(*) n FROM (SELECT reservation_id FROM reservation_slot GROUP BY reservation_id HAVING COUNT(DISTINCT seat_id)>1) x'],
      ['paidAmountMismatch', "SELECT COUNT(*) n FROM payment p JOIN reservation r ON r.reservation_id=p.reservation_id WHERE p.status='PAID' AND p.amount<>r.total_price"],
      ['linkedReviewMismatch', 'SELECT COUNT(*) n FROM review rv JOIN reservation r ON r.reservation_id=rv.reservation_id JOIN seat s ON s.seat_id=r.seat_id WHERE rv.cafe_id<>s.cafe_id OR rv.member_id<>r.member_id'],
      ['pointBalanceMismatchMembers', 'SELECT COUNT(*) n FROM member m LEFT JOIN (SELECT member_id,SUM(delta) balance FROM point_history GROUP BY member_id) h ON h.member_id=m.member_id WHERE m.point_balance<>COALESCE(h.balance,0)']
    ];
    report.checks={};
    for (const [key,sql] of checks) { const [[r]]=await db.query(sql); report.checks[key]=Number(r.n); }
    report.orphanForeignKeys=[];
    for(const f of fks){
      const q = mysql.escapeId;
      const [[r]]=await db.query(`SELECT COUNT(*) n FROM ${q(f.table_name)} a LEFT JOIN ${q(f.target)} b ON a.${q(f.col)}=b.${q(f.target_col)} WHERE a.${q(f.col)} IS NOT NULL AND b.${q(f.target_col)} IS NULL`);
      report.orphanForeignKeys.push({table:f.table_name,column:f.col,target:f.target,missing:Number(r.n)});
    }
    report.orphanCount=report.orphanForeignKeys.reduce((n,f)=>n+f.missing,0);
    const [[slotDetail]]=await db.query('SELECT COUNT(DISTINCT s.reservation_id) reservations,MIN(s.slot_start) first_slot,MAX(s.slot_start) last_slot FROM reservation_slot s JOIN reservation r ON r.reservation_id=s.reservation_id WHERE s.seat_id<>r.seat_id');
    report.slotMismatchDetail=slotDetail;
    await db.rollback();
    const expectedTables = ['cafe','member','payment','phone_verification','point_history','price_plan','region','reservation','reservation_slot','review','seat','seat_type'];
    report.schemaMatchesExpectedModel = JSON.stringify(report.schema.tables) === JSON.stringify(expectedTables)
      && report.schema.columnCount === 84 && report.schema.primaryKeys === 12 && report.schema.uniqueKeys === 9 && report.schema.foreignKeys === 15
      && report.schema.noCollectionTypes && report.schema.cafeDoesNotRepeatRegionName && report.schema.pricePlanDoesNotRepeatCafeName && report.schema.seatDoesNotRepeatTypeName;
    report.passed = report.schemaMatchesExpectedModel && Object.values(report.checks).every(n => n === 0) && report.orphanCount === 0;
    if (out) { fs.mkdirSync(path.dirname(out), {recursive:true}); fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n'); }
    if (!report.passed) process.exitCode = 1;
    console.log(JSON.stringify({...report,schema:{...report.schema,keys:undefined},orphanForeignKeys:undefined}));
  } finally { await db.end(); }
})().catch(e=>{if (out) { fs.mkdirSync(path.dirname(out), {recursive:true}); fs.writeFileSync(out,JSON.stringify({success:false,error:e.code||e.message,checkedAt:new Date().toISOString()})); }console.error(e.code||e.message);process.exitCode=1;});
