const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const script=path.join(__dirname,'../scripts/repair-consistency-20261123.cjs');

test('historical repair refuses to connect or change data without --apply',()=>{
 const r=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,DB_HOST:'unreachable.invalid',NODE_PATH:''},timeout:5000});
 assert.equal(r.status,0);assert.match(r.stdout,/No changes made/);assert.equal(r.stderr,'');
});

test('historical repair requires an explicit database before loading DB dependencies',()=>{
 for(const args of [['--apply'],['--apply','--database'],['--apply','--database','unsafe;database']]){
  const r=spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:{...process.env,NODE_PATH:''},timeout:5000});
  assert.notEqual(r.status,0);assert.match(r.stderr,/explicit valid --database/);assert.doesNotMatch(r.stderr,/MODULE_NOT_FOUND/);
 }
});
