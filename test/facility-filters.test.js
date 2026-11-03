const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
function ui() {
  const S = { q: { fac: ['h'], seat: 'ANY' } };
  const context = vm.createContext({ S, D: { cafes: [{ real: true }] }, ico: () => '',
    PAGE: 24, refreshPanel() {}, refreshCats() {}, renderResults() {}, refreshMaps() {} });
  vm.runInContext(source.slice(source.indexOf('  const CATS ='), source.indexOf('  const refreshCats =')), context);
  vm.runInContext(source.slice(source.indexOf('  const afterQuery ='), source.indexOf('  const ACT =')), context);
  return { context, S, run: (js) => vm.runInContext(js, context) };
}
test('facility chips stay selectable when real cafes are loaded', () => {
  const u = ui(), html = u.run('catsHtml()');
  assert.doesNotMatch(html, /disabled/);
  assert.match(html, /data-v="h" aria-pressed="true"/);
  assert.match(html, /data-v="p" aria-pressed="false"/);
});
test('query refresh and asynchronous cafe loading preserve selected facilities', () => {
  const u = ui(); u.run('afterQuery(); onRealLoaded();');
  assert.deepEqual(u.S.q.fac, ['h']);
});
test('unknown facilities do not pass a selected facility requirement', () => {
  const u = ui();
  assert.equal(u.run('matchesFacilities({real:true,fac:[]}, ["h"])'), false);
  assert.equal(u.run('matchesFacilities({real:true}, ["p"])'), false);
  assert.equal(u.run('matchesFacilities({real:true,fac:["h","p"]}, ["h","p"])'), true);
  assert.equal(u.run('matchesFacilities({fac:["h"]}, ["h","p"])'), false);
  assert.equal(u.run('matchesFacilities({real:true}, [])'), true);
});
