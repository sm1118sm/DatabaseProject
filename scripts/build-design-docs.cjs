// Build the physical specification from schema.sql and the checked ERD model.
// No dependencies, credentials, DB connection, or schema mutation.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8').replace(/\r\n/g, '\n');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/erd/data.js'), 'utf8'), context);
const model = JSON.parse(JSON.stringify(context.window.ERD_DATA));
const date = '2026-11-26';
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const md = (s) => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
const tableRows = (headers, rows) => '| ' + headers.join(' | ') + ' |\n| ' + headers.map(() => '---').join(' | ') + ' |\n' + rows.map(r => '| ' + r.map(md).join(' | ') + ' |').join('\n');
const htmlTable = (headers, rows, caption) => `<div class="table-scroll"><table><caption>${escape(caption)}</caption><thead><tr>${headers.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<${i === 0 ? 'th scope="row"' : 'td'}>${escape(c)}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
let columns = 0, fkCount = 0, uniqueCount = 0, checkCount = 0, indexCount = 0;
const tables = [];
for (const match of sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\) ENGINE=InnoDB;/g)) {
  const [, name, body] = match;
  const t = model.tables.find(t => t.name === name);
  assert.ok(t, `Missing ERD table ${name}`);
  const pk = body.match(/PRIMARY KEY \(([^)]+)\)/)[1].split(',').map(s => s.trim());
  const fks = [...body.matchAll(/CONSTRAINT\s+(\w+)\s+FOREIGN KEY\s+\((\w+)\)\s+REFERENCES\s+(\w+)\s+\((\w+)\)([^\n]*)/g)].map(m => ({name:m[1],col:m[2],target:m[3]+'.'+m[4],onDelete:m[5].match(/ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION)/)?.[1] || 'RESTRICT',onUpdate:m[5].match(/ON UPDATE (CASCADE|SET NULL|RESTRICT|NO ACTION)/)?.[1] || 'RESTRICT'}));
  const indexes = [...body.matchAll(/^  (UNIQUE )?KEY (\w+) \(([^)]+)\)/gm)].map(m => ({name:m[2],unique:!!m[1],cols:m[3]}));
  const checks = [...body.matchAll(/CONSTRAINT\s+(\w+)\s+CHECK\s+\(([^\n]*)\),?$/gm)].map(m => ({name:m[1],expression:m[2]}));
  const cols = [...body.matchAll(/^  (\w+)\s+(BIGINT|TINYINT|INT|VARCHAR|BOOLEAN|DATETIME|DECIMAL|TIME|DATE|TEXT|ENUM)([^\n]*)/gm)];
  assert.equal(cols.length, t.cols.length, `${name}: column count`);
  const rows = cols.map(m => {
    const c = t.cols.find(c => c.name === m[1]);
    assert.ok(c, `${name}.${m[1]}`);
    const params = m[3].trimStart().match(/^\([^)]*\)/)?.[0] || '';
    const type = m[2] + params;
    const rest = m[3].trimStart().slice(params.length);
    const nullable = !rest.includes('NOT NULL');
    const def = rest.match(/\bDEFAULT\s+('(?:[^']|'')*'|[A-Z_]+(?:\(\))?|[-\d.]+)/)?.[1] ?? null;
    const onUpdate = rest.match(/ON UPDATE (\w+)/)?.[1] ?? null;
    assert.equal(c.type, type, `${name}.${c.name}: type`);
    assert.equal(c.nullable, nullable, `${name}.${c.name}: NULL`);
    assert.equal(c.pk, pk.includes(c.name), `${name}.${c.name}: PK`);
    assert.equal(c.defaultValue, def, `${name}.${c.name}: default`);
    assert.equal(c.onUpdate, onUpdate, `${name}.${c.name}: on update`);
    const fk = fks.find(f => f.col === c.name);
    assert.equal(c.fk, fk?.target ?? null, `${name}.${c.name}: FK`);
    const notes = [];
    if (rest.includes('AUTO_INCREMENT')) notes.push('AUTO_INCREMENT');
    for (const i of indexes.filter(i => i.unique && i.cols.split(',').map(s => s.trim()).includes(c.name))) notes.push(`${i.name} (${i.cols})`);
    for (const ch of checks) if (new RegExp('\\b'+c.name+'\\b').test(ch.expression)) notes.push(ch.name);
    if (onUpdate) notes.push('ON UPDATE '+onUpdate);
    return [c.name,type,nullable?'Y':'N',def ?? '-',pk.includes(c.name)?(pk.length>1?'PK(복합)':'PK'):'-',fk?.target ?? '-',notes.join('; ') || '-'];
  });
  columns += rows.length; fkCount += fks.length; checkCount += checks.length; indexCount += indexes.length; uniqueCount += indexes.filter(i => i.unique).length;
  tables.push({name,label:model.entities.find(e => e.table === name.toUpperCase()).name,rows,pk,fks,indexes,checks});
}
assert.deepEqual(tables.map(t => t.name).sort(), model.tables.map(t => t.name).sort());
assert.deepEqual([tables.length,columns,fkCount,uniqueCount,checkCount,indexCount],[12,84,15,9,10,17]);
const counts = {tables:tables.length,columns,primaryKeys:tables.length,foreignKeys:fkCount,uniqueKeys:uniqueCount,checks:checkCount,explicitSecondaryIndexes:indexCount};
const headers = ['속성이름','데이터타입','널허용','기본값','기본키','외래키','제약조건'];
const intro = [
  '강의자료 431쪽의 열 순서에 맞춘 테이블 명세서다. 현재 db/schema.sql과 ERD 모델을 대조하여 생성했으며 DB에 접속하거나 구조를 변경하지 않는다.',
  '설계 기준은 MySQL 8.4, InnoDB, utf8mb4, utf8mb4_0900_ai_ci이다. 관리형 DB의 실제 디스크 배치·오프셋·페이지 크기를 변경하거나 측정했다는 의미는 아니다.',
  '널허용 Y는 NULL 가능, N은 NULL 불가이다. 기본값의 -는 명시적인 DEFAULT가 없다는 뜻이다. NULL 가능 열은 생략 시 NULL이 될 수 있다. AUTO_INCREMENT와 ON UPDATE는 기본값과 구분한다.',
  '같은 UNIQUE 이름이 여러 열에 붙으면 그 조합 전체가 유일하다. NULL 허용 UNIQUE는 모든 행을 식별하는 후보키와 구분한다.',
  '보조 인덱스 17개는 SQL에 직접 선언한 기본키 외 인덱스 수다. 외래키용 자동 생성 인덱스는 포함하지 않으며, 성능 향상은 실행계획·측정 없이 단정하지 않는다.',
  '예약과 시간대의 좌석 일치, 잔액과 포인트 내역 합계, 후기와 예약의 회원·카페 일치는 독립 FK·행 단위 CHECK만으로 보장되지 않는다. 트랜잭션과 별도의 읽기 전용 SQL 검사를 함께 사용한다.',
];
let spec = '# 스터디픽 물리적 설계서\n\n작성일 '+date+'\n\n'+intro.join('\n\n')+'\n\n테이블 12개 · 속성 84개 · PK 12개 · FK 15개 · UNIQUE 9개 · CHECK 10개 · 명시적 보조 인덱스 17개\n';
let physical = '';
for (const t of tables) {
  spec += `\n## ${t.name.toUpperCase()} ${t.label}\n\n`+tableRows(headers,t.rows)+'\n';
  let detail = '';
  if (t.indexes.length) {
    const rows=t.indexes.map(i=>[i.name,i.unique?'UNIQUE':'일반',i.cols]);
    spec+='\n### 명시적 보조 인덱스\n\n'+tableRows(['이름','종류','열'],rows)+'\n';
    detail+=htmlTable(['이름','종류','열'],rows,'명시적 보조 인덱스');
  }
  if (t.checks.length) {
    const rows=t.checks.map(c=>[c.name,c.expression]);
    spec+='\n### CHECK 조건\n\n'+tableRows(['이름','조건'],rows)+'\n';
    detail+=htmlTable(['이름','조건'],rows,'CHECK 조건');
  }
  if (t.fks.length) {
    const rows=t.fks.map(f=>[f.col,f.target,f.onDelete,f.onUpdate]);
    spec+='\n### 참조 무결성\n\n'+tableRows(['열','참조 대상','ON DELETE','ON UPDATE'],rows)+'\n';
    detail+=htmlTable(['열','참조 대상','ON DELETE','ON UPDATE'],rows,'참조 무결성');
  }
  physical+=`<section class="table-spec" id="${t.name}"><h3>${escape(t.name.toUpperCase())} <span>${escape(t.label)}</span></h3>${htmlTable(headers,t.rows,t.label+' 테이블 명세')}<details><summary>인덱스·CHECK·참조 동작</summary>${detail || '<p>기본키 외 별도 선언 없음</p>'}</details></section>`;
}
spec+='\n## 근거와 재생성\n\n- 강의자료 431쪽 물리적 설계 예시\n- [현재 SQL](../db/schema.sql)\n- [역정규화 검토](DENORMALIZATION.md)\n- [2026-11-23 보정·재검증 기록](CONSISTENCY_REPAIR_20261123.md)\n- `npm run docs:design`로 재생성하고 `npm run check:design`으로 파일과 스키마의 일치를 확인한다.\n';
const denorm = fs.readFileSync(path.join(root,'docs/DENORMALIZATION.md'),'utf8').replace(/\r\n/g,'\n');
function markdownHTML(text) {
  let out='',inTable=false;
  const inline=s=>escape(s).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,url)=>`<a href="${url.startsWith('http')?escape(url):'https://github.com/sm1118sm/DatabaseProject/blob/main/docs/'+escape(url)}">${label}</a>`);
  for (const line of text.split('\n')) {
    if (line.startsWith('|')) {
      if (/^\|[\s:|\-]+\|$/.test(line)) continue;
      const cells=line.split('|').slice(1,-1).map(s=>s.trim());
      if(!inTable){out+='<div class="table-scroll"><table><thead><tr>'+cells.map(s=>'<th scope="col">'+inline(s)+'</th>').join('')+'</tr></thead><tbody>';inTable=true;}
      else out+='<tr>'+cells.map(s=>'<td>'+inline(s)+'</td>').join('')+'</tr>';
    } else {
      if(inTable){out+='</tbody></table></div>';inTable=false;}
      if(!line.trim())continue;
      if(line.startsWith('# '))continue;
      if(/^## /.test(line))out+='<h3>'+inline(line.slice(3))+'</h3>';
      else if(/^### /.test(line))out+='<h4>'+inline(line.slice(4))+'</h4>';
      else out+='<p>'+inline(line.replace(/^- /,''))+'</p>';
    }
  }
  return out+(inTable?'</tbody></table></div>':'');
}
const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>스터디픽 | 역정규화 검토·물리적 설계서</title><meta name="description" content="강의 양식에 따른 역정규화 검토와 12개 테이블의 물리적 설계서"><style>
:root{--ink:#173450;--blue:#245fa4;--muted:#64748b;--line:#dce4ed;--bg:#f2f5fa}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--bg);font:15px/1.75 'Malgun Gothic','Apple SD Gothic Neo',sans-serif}a{color:var(--blue)}a:focus-visible,summary:focus-visible{outline:3px solid #78aef1;outline-offset:4px}header{background:white;border-bottom:1px solid var(--line);padding:20px max(24px,calc((100vw - 1240px)/2));display:flex;justify-content:space-between;gap:20px;align-items:center;flex-wrap:wrap}header strong{font-size:20px}nav{display:flex;gap:20px;flex-wrap:wrap}main{max-width:1288px;margin:auto;padding:38px 24px 72px}h1{font-size:34px;line-height:1.4;letter-spacing:-1px;margin:0 0 12px}h2{font-size:27px;margin:48px 0 16px}h3{font-size:21px;margin:30px 0 12px}h3 span{font-size:17px;font-weight:400;margin-left:8px}h4{font-size:17px}.meta{color:var(--muted);font-size:13px}.intro{max-width:920px}.overview{padding-bottom:26px;border-bottom:1px solid var(--line)}.toc{display:flex;gap:10px 18px;flex-wrap:wrap;list-style:none;padding:0}.table-scroll{overflow-x:auto;margin:16px 0 24px;background:white;border:1px solid var(--line)}table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.6;min-width:680px}caption{text-align:left;font-size:13px;padding:12px 14px;color:var(--muted);background:#fff}th,td{padding:12px 14px;border:1px solid var(--line);vertical-align:top;text-align:left;overflow-wrap:anywhere}thead th{background:#eaf2fd;font-weight:700;white-space:nowrap}tbody th{font-weight:500;min-width:115px}tbody tr:nth-child(even){background:#f8faff}.table-spec{scroll-margin-top:20px;border-top:1px solid var(--line);padding-top:8px;margin-top:32px}.table-spec>div table{min-width:1050px}.table-spec>div td:nth-child(3),.table-spec>div td:nth-child(5){text-align:center}.table-spec>div td:nth-child(2){min-width:140px}.table-spec>div td:nth-child(7){min-width:200px}details{background:transparent}summary{cursor:pointer;color:var(--blue);padding:8px 0}code{font:13px Consolas,monospace;overflow-wrap:anywhere}footer{margin-top:50px;padding-top:20px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}@media(max-width:600px){main{padding:26px 16px}header{padding:16px}h1{font-size:26px}h2{font-size:23px}table{font-size:12px}th,td{padding:10px}}@media print{body{background:white;color:black;font-size:11pt}header,nav,.toc{display:none}main{max-width:none;padding:0}h1{font-size:24pt}h2{page-break-before:always}h3{break-after:avoid}.table-scroll{overflow:visible;border:0}table,.table-spec>div table{min-width:0;font-size:8pt;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{padding:5px;min-width:0!important}details{display:block}details>summary{display:none}details>*{display:block!important}a{color:inherit;text-decoration:none}@page{size:A4 landscape;margin:14mm}}
</style></head><body><header><strong>스터디픽 · 데이터베이스 설계</strong><nav aria-label="설계 문서"><a href="/erd/">개념적 ERD·논리적 모델</a><a href="#denormalization">역정규화 검토</a><a href="#physical">물리적 설계서</a><a href="/">서비스 홈</a></nav></header><main><section class="overview"><p class="meta">강의자료 431쪽 · 481~483쪽 / 문서 검토 ${date}</p><h1>역정규화 검토와 물리적 설계서</h1><p class="intro">기존 12개 테이블을 유지하면서 저장한 값의 목적과 무결성 관리 방법을 정리했습니다. 물리적 설계서는 SQL에서 생성하며, 이 문서 배포가 DB 구조 변경이나 성능 검증을 의미하지는 않습니다.</p><p><b>테이블 12개 · 속성 84개 · FK 15개 · UNIQUE 9개 · CHECK 10개 · 뷰 없음</b></p></section><section id="denormalization"><h2>역정규화 검토</h2>${markdownHTML(denorm)}</section><section id="physical"><h2>물리적 설계서</h2>${intro.map(s=>'<p>'+escape(s)+'</p>').join('')}<ul class="toc">${tables.map(t=>`<li><a href="#${t.name}">${escape(t.name.toUpperCase())}</a></li>`).join('')}</ul>${physical}</section><footer><p>원문: <a href="https://github.com/sm1118sm/DatabaseProject/blob/main/docs/DENORMALIZATION.md">역정규화 검토</a> · <a href="https://github.com/sm1118sm/DatabaseProject/blob/main/docs/PHYSICAL_DESIGN.md">물리적 설계서</a> · <a href="https://github.com/sm1118sm/DatabaseProject/blob/main/db/schema.sql">SQL 스키마</a></p><p>SQL 정합성 검사는 2026-11-23 기록이며, ${date}에는 스키마·문서를 대조했습니다. 웹사이트 기능 검증은 정규화 판정과 구분합니다.</p></footer></main></body></html>\n`;
const payload={documentDate:date,schemaSha256:crypto.createHash('sha256').update(sql).digest('hex'),counts,tables};
const outputs={'docs/PHYSICAL_DESIGN.md':spec,'public/design/index.html':html,'public/design/schema.json':JSON.stringify(payload,null,2)+'\n'};
for(const [file,content] of Object.entries(outputs)){
  const dest=path.join(root,file);
  if(process.argv.includes('--check')) assert.equal(fs.readFileSync(dest,'utf8').replace(/\r\n/g,'\n'),content,`Regenerate ${file}: npm run docs:design`);
  else {fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);}
}
console.log(`${process.argv.includes('--check')?'Checked':'Generated'} design docs: ${JSON.stringify(counts)}`);
