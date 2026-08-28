import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-visit-address-v249.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('2.49 keeps permanent site and mentor as local travel reference data',()=>{
  assert.match(js,/Mentor name/);
  assert.match(js,/Permanent site address/);
  assert.match(js,/milos-travel-v1/);
  assert.match(js,/mentors:\{\}/);
  assert.doesNotMatch(js,/C\.updateProfile\(/);
});

test('2.49 calendar booking defaults to permanent site but allows one-visit override',()=>{
  assert.match(js,/Visit address/);
  assert.match(js,/permanent site is filled in automatically/i);
  assert.match(js,/booking\.location/);
  assert.match(js,/profileAddress/);
  assert.match(js,/input\[name="title"\]/);
});

test('2.49 visit addresses open preferred maps from current location',()=>{
  assert.match(js,/maps\/dir\/\?api=1&destination=/);
  assert.match(js,/waze\.com\/ul\?q=/);
  assert.match(js,/data-mvisit-map/);
  assert.doesNotMatch(js,/navigator\.geolocation/);
});

test('2.49 mileage and route planning use visit-specific booking addresses',()=>{
  assert.match(js,/bookingAddress\(booking\)/);
  assert.match(js,/bookingLocations/);
  assert.match(js,/kind!==['"]mileage['"]&&kind!==['"]route['"]/);
  assert.match(js,/Where a calendar booking has its own visit address/);
});

test('2.49 visit workflow remains loaded and cached in the current release',()=>{
  const standard=index.indexOf('milos-standard-ui-v229.js');
  const visit=index.indexOf('milos-visit-address-v249.js');
  const travel=index.indexOf('milos-travel-v248.js');
  assert.ok(standard>=0&&visit>standard&&travel>visit);
  assert.match(pkg.version,/^2\.\d+\.0$/);
  assert.match(update.version,/^2\.\d+$/);
  assert.match(index,/milos-app-version" content="2\.\d+"/);
  assert.match(index,/milos-visit-address-v249\.js\?v=2\.\d+/);
  assert.match(sw,/milos-assessor-shell-v2\.\d+/);
  assert.match(sw,/milos-visit-address-v249\.js/);
});
