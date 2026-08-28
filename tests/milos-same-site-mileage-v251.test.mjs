import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-same-site-mileage-v251.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('groups learners sharing a calendar postcode into one physical stop',()=>{
  assert.match(js,/function normaliseAddress/);
  assert.match(js,/function ukPostcode/);
  assert.match(js,/function siteKey/);
  assert.match(js,/postcode:\$\{postcode\}/);
  assert.match(js,/const groups=new Map\(\)/);
  assert.match(js,/groups\.get\(key\)/);
  assert.match(js,/group\.names\.push/);
  assert.match(js,/names\.join\(' \+ '\)/);
});

test('2.54 invalidates older geocodes and refreshes the saved base',()=>{
  assert.match(js,/GEO_VERSION='2\.54-postcode-first'/);
  assert.match(js,/function freshLocation/);
  assert.match(js,/value\.geocodeVersion===currentGeoVersion\(\)/);
  assert.match(js,/async function ensureBase/);
  assert.match(js,/await api\.geocode\(d\.baseAddress\)/);
  assert.match(js,/d\.base=base/);
});

test('same-site calendar visits are geocoded once and routed once',()=>{
  assert.match(js,/shared=group\.profiles\.length>1/);
  assert.match(js,/if\(!shared&&cached/);
  assert.match(js,/group\.bookings\.forEach/);
  assert.match(js,/const groups=groupBookings\(dateRows\)/);
  assert.match(js,/roadRoute\(\[base,\.\.\.order\.map\(item=>item\.site\),base\]\)/);
  assert.match(js,/same calendar visit address are combined into one stop/i);
});

test('route planning still combines duplicate same-site learners',()=>{
  assert.match(js,/const groups=groupBookings\(fakeBookings\)/);
  assert.match(js,/Learners at the same calendar visit address are combined into one stop/);
});

test('same-site mileage remains loaded before the existing visit handler',()=>{
  const same=index.indexOf('milos-same-site-mileage-v251.js');
  const visit=index.indexOf('milos-visit-address-v249.js');
  assert.ok(same>=0&&visit>same);
  assert.match(pkg.version,/^2\.\d+\.0$/);
  assert.match(update.version,/^2\.\d+$/);
  assert.match(index,/milos-app-version" content="2\.\d+"/);
  assert.match(index,/milos-same-site-mileage-v251\.js\?v=2\.\d+/);
  assert.match(sw,/milos-assessor-shell-v2\.\d+/);
  assert.match(sw,/milos-same-site-mileage-v251\.js/);
});
