const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('  const CAFE_NAME'), source.indexOf('  // 카카오 주소')), context);
const accepts = (name, category = '') => vm.runInContext(`isStudyCafe(${JSON.stringify({ place_name: name, category_name: category })})`, context);

test('accepts named study cafes even when Kakao categorizes them as reading rooms', () => {
  assert.equal(accepts('하자스터디카페', '교육,학문 > 학습시설 > 독서실'), true);
  assert.equal(accepts('그램스터디카페', '교육,학문 > 학습시설 > 독서실'), true);
  assert.equal(accepts('타임 스터디 카페'), true);
});

test('rejects reading rooms, meeting spaces, academies and study-room-only rentals', () => {
  for (const name of ['정독서실', '초심 독서실', '공유 오피스', '영어학원', '스터디카페독서실']) assert.equal(accepts(name), false, name);
  assert.equal(accepts('14파운드', '서비스,산업 > 공간대여 > 모임공간'), false);
  assert.equal(accepts('스터디카페 영어교실', '교육,학문 > 학원'), false);
  assert.equal(accepts('모임 스터디룸', '스터디카페,스터디룸 > 초심'), false);
});

test('does not treat the shared cafe/study-room category as proof of a study cafe', () => {
  assert.equal(accepts('인스터디라운지', '서비스,산업 > 공간대여 > 스터디카페,스터디룸'), false);
  assert.equal(accepts('초심 역삼점', '서비스,산업 > 공간대여 > 스터디카페,스터디룸 > 초심'), true);
  assert.equal(accepts(undefined, undefined), false);
});
