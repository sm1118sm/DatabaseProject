const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../public/erd');
const ctx=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(root,'data.js'),'utf8'),ctx);
vm.runInContext("const esc=s=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));",ctx);
const src=fs.readFileSync(path.join(root,'viewer.js'),'utf8');
vm.runInContext(src.slice(src.indexOf('function tableCard('),src.indexOf("$('schema').innerHTML=")),ctx);
const data=ctx.window.ERD_DATA;
test('one-to-one foreign keys display UK and correct NULL rules',()=>{
 for(const name of ['payment','review']){
  const t=data.tables.find(t=>t.name===name),c=t.cols.find(c=>c.name==='reservation_id');
  assert.deepEqual(Array.from(c.uniqueGroups),['UK']);
  assert.equal(c.nullable,name==='review');
  const html=ctx.tableCard(t);assert.match(html,/>UK<\/span>reservation_id/);
 }
});
test('composite uniqueness is grouped rather than shown as individual uniqueness',()=>{
 const t=data.tables.find(t=>t.name==='region');
 for(const name of ['sido','sigungu'])assert.deepEqual(Array.from(t.cols.find(c=>c.name===name).uniqueGroups),['UK1']);
 const html=ctx.tableCard(t);assert.match(html,/\(sido, sigungu\).*조합 전체가 유일/);
});
test('explicit defaults, checks and update rules are visible',()=>{
 const member=data.tables.find(t=>t.name==='member');
 assert.match(ctx.tableCard(member),/기본값: 0/);
 assert.match(ctx.tableCard(member),/CHECK<\/b> point_balance &gt;= 0/);
 assert.match(ctx.tableCard(data.tables.find(t=>t.name==='reservation')),/수정 시 CURRENT_TIMESTAMP/);
 assert.equal(data.tables.reduce((n,t)=>n+t.uniques.length,0),9);
 assert.equal(data.tables.reduce((n,t)=>n+t.checks.length,0),10);
});
