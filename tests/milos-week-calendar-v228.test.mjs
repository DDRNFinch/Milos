import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js=readFileSync(new URL('../assets/milos-week-calendar-v228.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/milos-week-calendar-v228.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Milos 2.28 loads the weekday calendar offline',()=>{
  assert.match(index,/milos-app-version" content="2\.28"/);
  assert.match(index,/milos-week-calendar-v228\.css\?v=2\.28/);
  assert.match(index,/milos-week-calendar-v228\.js\?v=2\.28/);
  assert.match(sw,/milos-assessor-shell-v2\.28/);
  assert.match(sw,/milos-week-calendar-v228\.js/);
  assert.match(sw,/milos-week-calendar-v228\.css/);
});

test('calendar replaces the arch dock and centres Today',()=>{
  assert.match(js,/querySelector\("\.progress-dock"\)/);
  assert.match(js,/data-mcal-today/);
  assert.match(js,/scrollIntoView\(\{ behavior: "instant", block: "nearest", inline: "center" \}\)/);
  assert.match(css,/\.progress-dock\.mcal-host\{min-height:112px/);
  assert.match(css,/\.mcal-strip\{display:flex;[^}]*overflow-x:auto/);
});

test('tap-day bookings include review observation witness and learner linking',()=>{
  assert.match(js,/milos-calendar-bookings-v1/);
  assert.match(js,/data-mcal-date/);
  assert.match(js,/<option value="review">Review<\/option>/);
  assert.match(js,/<option value="observation">Observation<\/option>/);
  assert.match(js,/<option value="witness">Witness testimony<\/option>/);
  assert.match(js,/Learner \(optional\)/);
});

test('existing review and observation dates feed the calendar automatically',()=>{
  assert.match(js,/review\.nextReviewDate === key/);
  assert.match(js,/Review due/);
  assert.match(js,/observation\.observationDate !== key/);
  assert.match(js,/observation\.method \|\| "Observation"/);
});
