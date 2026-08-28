import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-same-site-mileage-v251.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('2.51 groups learners sharing the same visit address into one physical stop',()=>{
  assert.match(js,/function normaliseAddress/);
  assert.match(js,/function siteKey/);
  assert.match(js,/const groups=new Map\(\)/);
  assert.match(js,/groups\.get\(key\)/);
  assert.match(js,/group\.names\.push/);
  assert.match(js,/names\.join\(' \+ '\)/);
});

test('2.51 road mileage routes through grouped stops only once',()=>{
  assert.match(js,/const groups=groupBookings\(dateRows\)/);
  assert.match(js,/roadRoute\(\[d\.base,\.\.\.order\.map\(item=>item\.site\),d\.base\]\)/);
  assert.match(js,/same visit address are treated as one physical stop/i);
});

test('2.51 route planning also combines duplicate same-address learners',()=>{
  assert.match(js,/const groups=groupBookings\(fakeBookings\)/);
  assert.match(js,/Learners at the same address are combined into one stop/);
});

test('2.51 interception loads before the existing 2.49 visit handler',()=>{
  const same=index.indexOf('milos-same-site-mileage-v251.js');
  const visit=index.indexOf('milos-visit-address-v249.js');
  assert.ok(same>=0&&visit>same);
  assert.equal(pkg.version,'2.51.0');
  assert.equal(update.version,'2.51');
  assert.match(index,/milos-app-version" content="2\.51"/);
  assert.match(index,/milos-same-site-mileage-v251\.js\?v=2\.51/);
  assert.match(sw,/milos-assessor-shell-v2\.51/);
  assert.match(sw,/milos-same-site-mileage-v251\.js/);
});
