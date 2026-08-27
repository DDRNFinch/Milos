import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js=readFileSync(new URL('../assets/milos-week-calendar-v228.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/milos-week-calendar-v228.css',import.meta.url),'utf8');
const managerCss=readFileSync(new URL('../assets/milos-calendar-manager-v230.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Milos 2.37 loads the weekday calendar offline',()=>{
  assert.match(index,/milos-app-version" content="2\.37"/);
  assert.match(index,/milos-week-calendar-v228\.css\?v=2\.37/);
  assert.match(index,/milos-week-calendar-v228\.js\?v=2\.37/);
  assert.match(index,/milos-calendar-manager-v230\.css\?v=2\.37/);
  assert.match(sw,/milos-assessor-shell-v2\.37/);
  assert.match(sw,/milos-calendar-manager-v230\.css/);
});

test('calendar replaces the arch dock and centres Today',()=>{
  assert.match(js,/querySelector\("\.progress-dock"\)/);
  assert.match(js,/data-mcal-today/);
  assert.match(js,/scrollIntoView\(\{ behavior: "instant", block: "nearest", inline: "center" \}\)/);
  assert.match(css,/\.progress-dock\.mcal-host\{min-height:112px/);
  assert.match(css,/\.mcal-strip\{display:flex;[^}]*overflow-x:auto/);
});

test('bookings expose complete details and can be edited rescheduled or deleted',()=>{
  assert.match(js,/data-mcal-event=/);
  assert.match(js,/mcal-detail-grid/);
  assert.match(js,/Edit \/ reschedule/);
  assert.match(js,/Delete booking/);
  assert.match(js,/name="date" type="date"/);
  assert.match(js,/data-booking-id/);
  assert.match(js,/global\.confirm/);
  assert.match(managerCss,/\.mcal-detail/);
  assert.match(managerCss,/\.mcal-danger/);
});

test('bookings include review observation witness learner location and notes',()=>{
  assert.match(js,/milos-calendar-bookings-v1/);
  assert.match(js,/"review","observation","witness","meeting","other"/);
  assert.match(js,/Learner/);
  assert.match(js,/Location/);
  assert.match(js,/Notes/);
});

test('completed review and observation records feed the calendar but stay protected',()=>{
  assert.match(js,/review\.nextReviewDate === key/);
  assert.match(js,/Review due/);
  assert.match(js,/observation\.observationDate !== key/);
  assert.match(js,/subcategoryTitle \|\| observation\.unitTitle/);
  assert.match(js,/editable: false, removable: false/);
});
