import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sameSite=readFileSync(new URL('../assets/milos-same-site-mileage-v251.js',import.meta.url),'utf8');
const visit=readFileSync(new URL('../assets/milos-visit-address-v249.js',import.meta.url),'utf8');
const pdf=readFileSync(new URL('../assets/milos-mileage-pdf-v252.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('2.54 still counts any learner calendar booking with an address, including meetings',()=>{
  assert.match(sameSite,/function isCalendarVisit\(booking\)/);
  assert.match(sameSite,/booking&&booking\.date&&booking\.profileId&&bookingAddress\(booking\)/);
  assert.match(sameSite,/bookings\(\)\.filter\(b=>b\.date>=from&&b\.date<=to&&isCalendarVisit\(b\)\)/);
  assert.doesNotMatch(sameSite,/\['review','observation','witness'\]\.includes\(b\.type\)/);
  assert.match(pdf,/meeting:'Meeting'/);
});

test('calendar booking address remains authoritative after the accuracy change',()=>{
  assert.match(sameSite,/function bookingAddress\(booking\)\{return clean\(booking&&booking\.location,300\);\}/);
  assert.match(visit,/function bookingAddress\(booking\)\{return clean\(booking&&booking\.location,300\);\}/);
  assert.match(pdf,/function address\(b\)\{return clean\(b&&b\.location,300\);\}/);
  assert.doesNotMatch(pdf,/\|\|clean\(s\.address/);
});

test('route choices come from dated calendar visits rather than profile-only sites',()=>{
  assert.match(visit,/function bookedVisits\(date\)\{return bookings\(\)\.filter\(item=>item\.date===date&&isCalendarVisit\(item\)\);\}/);
  assert.match(visit,/Calendar visit address/);
  assert.match(visit,/Add learner visits and their addresses to the calendar first/);
  assert.doesNotMatch(visit,/profiles\(\)\.forEach\(p=>/);
});

test('mileage PDF follows the same calendar booking rules',()=>{
  assert.match(pdf,/function isCalendarVisit\(b\)/);
  assert.match(pdf,/rows\(\)\.filter\(b=>b\.date>=from&&b\.date<=to&&isCalendarVisit\(b\)\)/);
  assert.match(pdf,/No calendar visits with learner addresses were found/);
});

test('2.54 release metadata is aligned',()=>{
  assert.equal(pkg.version,'2.54.0');
  assert.equal(update.version,'2.54');
  assert.match(index,/milos-app-version" content="2\.54"/);
  assert.match(index,/milos-same-site-mileage-v251\.js\?v=2\.54/);
  assert.match(index,/milos-visit-address-v249\.js\?v=2\.54/);
  assert.match(index,/milos-mileage-pdf-v252\.js\?v=2\.54/);
  assert.match(sw,/milos-assessor-shell-v2\.54/);
});
