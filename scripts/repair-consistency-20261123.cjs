const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const applied = process.argv.includes('--apply');
const dbIndex = process.argv.indexOf('--database');
const database = dbIndex >= 0 ? process.argv[dbIndex + 1] : null;
if (!applied) { console.log('No changes made. Historical repair requires: node scripts/repair-consistency-20261123.cjs --apply --database <name> [--backup-dir <path>]'); process.exit(0); }
if (!database || !/^[A-Za-z0-9_]+$/.test(database)) throw Error('An explicit valid --database is required');
const backupIndex = process.argv.indexOf('--backup-dir');
if (backupIndex >= 0 && (!process.argv[backupIndex + 1] || process.argv[backupIndex + 1].startsWith('--'))) throw Error('--backup-dir requires a directory');
const mysql=require('mysql2/promise'),cfg=require('../server/dbconfig');
const lock='studypick_consistency_repair_20261123';
const reason='[정합성 보정] 시드 초기 지급 포인트 5,000P 내역 복원';
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backupRoot = backupIndex >= 0 ? path.resolve(process.argv[backupIndex + 1]) : path.join(root,'backups','consistency-20261123');
const backupDir=path.join(backupRoot,stamp);

(async()=>{
 const opts=cfg.connectionOptions({database,connectTimeout:15000,dateStrings:true});
 if(!['localhost','127.0.0.1','::1'].includes(opts.host)&&opts.ssl?.rejectUnauthorized!==true)throw Error('Remote repairs require certificate-verified TLS');
 const db=await mysql.createConnection(opts);let committed=false,inTransaction=false,locked=false;
 try{
  const [[got]]=await db.query('SELECT GET_LOCK(?, 10) acquired',[lock]);assert.equal(Number(got.acquired),1);locked=true;
  await db.query('SET SESSION innodb_lock_wait_timeout=10');
  await db.query(`CREATE TEMPORARY TABLE consistency_slot_repair (
   old_seat_id BIGINT NOT NULL, slot_start DATETIME NOT NULL, reservation_id BIGINT NOT NULL, target_seat_id BIGINT NOT NULL,
   PRIMARY KEY(old_seat_id,slot_start), UNIQUE KEY(target_seat_id,slot_start)) ENGINE=InnoDB`);
  await db.beginTransaction();inTransaction=true;
  const [slots]=await db.query(`SELECT s.seat_id,s.slot_start,s.reservation_id,r.seat_id correct_seat_id
   FROM reservation_slot s JOIN reservation r ON r.reservation_id=s.reservation_id
   WHERE s.seat_id<>r.seat_id ORDER BY s.reservation_id,s.slot_start FOR UPDATE`);
  const [[member]]=await db.query("SELECT member_id,point_balance,email='demo@example.com' original_demo FROM member WHERE member_id=1 FOR UPDATE");
  assert.ok(member&&Number(member.original_demo)===1,'Unexpected member');
  const [history]=await db.query('SELECT point_id,member_id,reservation_id,delta,reason,created_at FROM point_history WHERE member_id=1 ORDER BY point_id FOR UPDATE');
  const oldTotal=history.reduce((sum,h)=>sum+Number(h.delta),0),missing=Number(member.point_balance)-oldTotal;
  if(slots.length===0&&missing===0){await db.rollback();inTransaction=false;console.log(JSON.stringify({alreadyConsistent:true,database}));return;}
  assert.equal(slots.length,49560,'Unexpected affected slot count');
  assert.equal(new Set(slots.map(s=>s.reservation_id)).size,295,'Unexpected affected reservation count');
  assert.equal(missing,5000,'Unexpected point discrepancy');assert.equal(Number(member.point_balance),5294);
  assert.ok(slots.every(s=>s.slot_start<='2026-11-09 23:00:00'),'Only the historical mismatch is authorized');
  const backup={createdAt:new Date().toISOString(),database,slots,
   member:{member_id:member.member_id,point_balance:Number(member.point_balance),history_total:oldTotal,missing_delta:missing},point_history:history};
  fs.mkdirSync(backupDir,{recursive:true});
  fs.writeFileSync(path.join(backupDir,'before.json'),JSON.stringify(backup,null,2),{flag:'wx'});

  const [temp]=await db.query(`INSERT INTO consistency_slot_repair(old_seat_id,slot_start,reservation_id,target_seat_id)
   SELECT s.seat_id,s.slot_start,s.reservation_id,r.seat_id FROM reservation_slot s
   JOIN reservation r ON r.reservation_id=s.reservation_id WHERE s.seat_id<>r.seat_id`);
  assert.equal(temp.affectedRows,slots.length);
  const [[clash]]=await db.query(`SELECT COUNT(*) n FROM consistency_slot_repair r
   JOIN reservation_slot s ON s.seat_id=r.target_seat_id AND s.slot_start=r.slot_start
   JOIN reservation original ON original.reservation_id=s.reservation_id
   WHERE s.seat_id=original.seat_id`);assert.equal(Number(clash.n),0,'Corrected keys conflict with unrelated data');
  const [[beforeCount]]=await db.query('SELECT COUNT(*) n FROM reservation_slot');
  // Remove and reinsert only the backed-up affected rows, atomically, so primary-key swaps are safe.
  const [deleted]=await db.query(`DELETE s FROM reservation_slot s JOIN consistency_slot_repair r
   ON r.old_seat_id=s.seat_id AND r.slot_start=s.slot_start AND r.reservation_id=s.reservation_id`);
  assert.equal(deleted.affectedRows,slots.length);
  const [inserted]=await db.query(`INSERT INTO reservation_slot(seat_id,slot_start,reservation_id)
   SELECT target_seat_id,slot_start,reservation_id FROM consistency_slot_repair`);
  assert.equal(inserted.affectedRows,slots.length);
  const [credit]=await db.query('INSERT INTO point_history(member_id,reservation_id,delta,reason) VALUES (?,NULL,?,?)',[member.member_id,missing,reason]);
  const [[slotCheck]]=await db.query('SELECT COUNT(*) n FROM reservation_slot s JOIN reservation r ON r.reservation_id=s.reservation_id WHERE s.seat_id<>r.seat_id');
  const [[pointCheck]]=await db.query('SELECT COUNT(*) n FROM member m LEFT JOIN (SELECT member_id,SUM(delta) balance FROM point_history GROUP BY member_id) h ON h.member_id=m.member_id WHERE m.point_balance<>COALESCE(h.balance,0)');
  const [[afterCount]]=await db.query('SELECT COUNT(*) n FROM reservation_slot');
  assert.equal(Number(slotCheck.n),0);assert.equal(Number(pointCheck.n),0);assert.equal(Number(beforeCount.n),Number(afterCount.n));
  const [[current]]=await db.query('SELECT m.point_balance,(SELECT SUM(delta) FROM point_history WHERE member_id=m.member_id) history_total FROM member m WHERE m.member_id=?',[member.member_id]);
  assert.equal(Number(current.point_balance),5294);assert.equal(Number(current.history_total),5294);
  await db.commit();committed=true;inTransaction=false;
  const result={success:true,committedAt:new Date().toISOString(),database,backupDirectory:backupDir,
   slots:{corrected:inserted.affectedRows,reservations:295,totalBefore:Number(beforeCount.n),totalAfter:Number(afterCount.n),mismatchAfter:0},
   points:{member_id:member.member_id,balanceBefore:5294,balanceAfter:5294,historyBefore:oldTotal,historyAfter:5294,restoredInitialCredit:5000,insertedPointId:credit.insertId,reason,mismatchMembersAfter:0}};
  fs.writeFileSync(path.join(backupDir,'repair-result.json'),JSON.stringify(result,null,2));

  console.log(JSON.stringify(result));
 }catch(e){if(inTransaction)await db.rollback();console.error(JSON.stringify({error:e.code||e.message,rolledBack:!committed}));process.exitCode=1;}
 finally{if(locked)await db.query('SELECT RELEASE_LOCK(?)',[lock]);await db.end();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
