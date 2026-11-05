const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
function client(fetch) {
  const context = vm.createContext({ API: { on: true }, SV: { reviews: new Map() },
    Date, placeIdOf: (c) => String(c.id), reviewsOf: (c) => context.SV.reviews.get(c.id) || [],
    api: fetch, renderResults: () => { context.rendered++; }, rendered: 0 });
  vm.runInContext(source.slice(source.indexOf('  const ratingSummaries'), source.indexOf('  const starsHtml')) + '\nthis.ratingOf = ratingOf;', context);
  return context;
}
test('list ratings sort correctly before any cafe detail is opened, and preserve precise averages', async () => {
  let calls = 0;
  const c = client(async () => { calls++; return [
    { place_id: '11', avg_rating: 4.14, review_count: 7, demo_count: 7 },
    { place_id: '22', avg_rating: 4.12, review_count: 8, demo_count: 0 }
  ]; });
  c.loadRatingSummaries(); c.loadRatingSummaries();
  await vm.runInContext('ratingSummaryPending', c);
  const cafes = [{ id: 22 }, { id: 33 }, { id: 11 }];
  cafes.sort((a, b) => c.ratingOf(b).avg - c.ratingOf(a).avg);
  assert.deepEqual(cafes.map((x) => x.id), [11, 22, 33]);
  assert.equal(c.ratingOf(cafes[0]).demo, true);
  c.loadRatingSummaries(); assert.equal(calls, 1); assert.equal(c.rendered, 1);
  c.SV.reviews.set(11, [{ rating: 5, text: '실제 작성 후기' }]);
  assert.equal(c.ratingOf({ id: 11 }).avg, 5);
});
test('rating failures keep the list usable and do not trigger repeated requests', async () => {
  let calls = 0;
  const c = client(async () => { calls++; throw Error('503'); });
  c.loadRatingSummaries(); await vm.runInContext('ratingSummaryPending', c);
  c.loadRatingSummaries(); assert.equal(calls, 1);
  assert.equal(c.ratingOf({ id: 11 }).n, 0);
});
