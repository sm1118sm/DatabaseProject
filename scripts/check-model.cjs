// Verify the generated viewer and relational ERD against schema.sql. No DB access.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/erd/data.js'), 'utf8'), ctx);
const data = JSON.parse(JSON.stringify(ctx.window.ERD_DATA));
const erd = fs.readFileSync(path.join(root, 'db/ERD.md'), 'utf8');
let columnCount = 0, fkCount = 0;
const names = [];
for (const m of sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\) ENGINE/g)) {
  const name = m[1], body = m[2];
  names.push(name);
  const table = data.tables.find(t => t.name === name);
  assert.ok(table, `Viewer is missing table ${name}`);
  const pk = body.match(/PRIMARY KEY \(([^)]+)\)/)[1].split(',').map(s => s.trim());
  const cols = [...body.matchAll(/^  (\w+)\s+(BIGINT|TINYINT|INT|VARCHAR|BOOLEAN|DATETIME|DECIMAL|TIME|DATE|TEXT|ENUM)([^\n]*)/gm)];
  assert.equal(table.cols.length, cols.length, `${name}: column count`);
  const diagram = erd.match(new RegExp('  '+name.toUpperCase()+' \\{([\\s\\S]*?)\\n  \\}'));
  assert.ok(diagram, `ERD.md is missing table ${name}`);
  for (const c of cols) {
    const actual = table.cols.find(x => x.name === c[1]);
    assert.ok(actual, `${name}.${c[1]} is missing`);
    const params = c[3].trimStart().match(/^\([^)]*\)/)?.[0] || '';
    assert.equal(actual.type, c[2] + params, `${name}.${c[1]}: type`);
    assert.equal(actual.nullable, !c[0].includes('NOT NULL'), `${name}.${c[1]}: NULL`);
    assert.equal(actual.pk, pk.includes(c[1]), `${name}.${c[1]}: PK`);
    assert.match(diagram[1], new RegExp('\\n    '+c[2].toLowerCase()+' '+c[1]+'(?: |\\n|$)'), `${name}.${c[1]}: ERD type`);
    columnCount++;
  }
  for (const f of body.matchAll(/FOREIGN KEY \((\w+)\)\s+REFERENCES (\w+) \((\w+)\)/g)) {
    assert.equal(table.cols.find(c => c.name === f[1]).fk, f[2]+'.'+f[3], `${name}.${f[1]}: FK`);
    fkCount++;
  }
}
assert.deepEqual(data.tables.map(t => t.name).sort(), names.sort(), 'Table sets differ');
const junctions = [];
assert.deepEqual(data.entities.map(e => e.table.toLowerCase()).sort(), names.filter(n => !junctions.includes(n)).sort(), 'Conceptual entity set differs');
assert.equal(data.relationships.length, fkCount, 'Conceptual relationship count differs');
for (const r of data.relationships) {
  assert.ok(data.entities.some(e => e.id === r.a) && data.entities.some(e => e.id === r.b), `Unknown endpoint: ${r.id}`);
}
for (const [key, svg] of Object.entries(data.diagrams)) {
  const group = data.groups.find(g => key.startsWith(g.id+'-'));
  const expected = data.entities.filter(e => group.ids.includes(e.id));
  for (const e of expected) assert.ok(svg.includes(`id="entity_${e.id}"`), `${key}: missing ${e.id}`);
  const relations = data.relationships.filter(r => group.ids.includes(r.a) && group.ids.includes(r.b));
  for (const r of relations) assert.ok(svg.includes(`id="relation_${r.id}"`), `${key}: missing ${r.id}`);
}
console.log(`Model check passed: ${names.length} tables, ${columnCount} columns, ${fkCount} FKs, ${data.entities.length} entities, ${data.relationships.length} relationships; no mismatches.`);
