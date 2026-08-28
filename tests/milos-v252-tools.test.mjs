import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const profile=readFileSync(new URL('../assets/milos-profile-branding-v252.js',import.meta.url),'utf8');
const calendar=readFileSync(new URL('../assets/milos-full-calendar-v252.js',import.meta.url),'utf8');
const route=readFileSync(new URL('../assets/milos-route-selection-v252.js',import.meta.url),'utf8');
const mileage=readFileSync(new URL('../assets/milos-mileage-pdf-v252.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));
test('2.52 assessor details still add college branding and place of work',()=>{
  assert.match(profile,/College name/);assert.match(profile,/College logo/);assert.match(profile,/Place of work \/ mileage base/);assert.match(profile,/collegeLogo/);assert.match(profile,/placeOfWork/);assert.match(profile,/API\.save/);
});
test('2.52 planning/privacy removals and monthly calendar remain present',()=>{
  assert.match(profile,/data-plan-action="open"/);assert.match(profile,/data-action="open-privacy"/);assert.match(calendar,/Open Calendar/);assert.match(calendar,/derivedEvents/);assert.match(calendar,/MilosWeekCalendar\?\.openDay/);
});
test('2.52 route learner selections still survive the route rerender',()=>{
  assert.match(route,/mvisitStops/);assert.match(route,/setTimeout\(restore,30\)/);assert.match(route,/selected\.add/);assert.match(route,/selected\.delete/);
});
test('mileage export remains PDF only with routes, leg miles and receipts',()=>{
  assert.match(mileage,/Download mileage PDF/);assert.match(mileage,/data-msame-download/);assert.match(mileage,/roadRoute/);assert.match(mileage,/leg\?\.miles/);assert.match(mileage,/Receipts & supporting documents/);assert.match(mileage,/image receipts are reproduced/i);assert.doesNotMatch(mileage,/\.zip/i);
});
test('current release still loads and caches all four 2.52 feature tools',()=>{
  for(const file of ['milos-profile-branding-v252.js','milos-full-calendar-v252.js','milos-route-selection-v252.js','milos-mileage-pdf-v252.js']){assert.ok(index.includes(`${file}?v=2.53`));assert.match(sw,new RegExp(file.replaceAll('.','\\.')));}
  assert.equal(pkg.version,'2.53.0');assert.equal(update.version,'2.53');assert.match(index,/milos-app-version" content="2\.53"/);assert.match(sw,/milos-assessor-shell-v2\.53/);
});
