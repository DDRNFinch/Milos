import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-travel-v248.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/milos-travel-v248.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('2.48 adds travel without changing core learner storage',()=>{
  assert.match(js,/milos-travel-v1/);
  assert.match(js,/milos-calendar-bookings-v1/);
  assert.match(js,/Site & travel/);
  assert.doesNotMatch(js,/C\.updateProfile\(/);
  assert.doesNotMatch(js,/geolocation/i);
});

test('2.48 calculates explicit online road mileage and stores it locally',()=>{
  assert.match(js,/nominatim\.openstreetmap\.org\/search/);
  assert.match(js,/router\.project-osrm\.org\/route\/v1\/driving/);
  assert.match(js,/Online road lookup runs only when you press calculate/);
  assert.match(js,/oneWayMiles/);
});

test('2.48 supports same-day route planning mileage and receipts',()=>{
  assert.match(js,/Suggest efficient route/);
  assert.match(js,/Google Maps/);
  assert.match(js,/Waze/);
  assert.match(js,/Download mileage CSV/);
  assert.match(js,/milos-travel-receipts-v1/);
  assert.match(js,/without making you label each one/);
  assert.match(css,/\.mtravel-sheet/);
});

test('2.48 travel layer remains loaded and cached in the current release',()=>{
  assert.match(pkg.version,/^2\.\d+\.0$/);
  assert.match(update.version,/^2\.\d+$/);
  assert.match(index,/milos-app-version" content="2\.\d+"/);
  assert.match(index,/milos-travel-v248\.css\?v=2\.\d+/);
  assert.match(index,/milos-travel-v248\.js\?v=2\.\d+/);
  assert.match(sw,/milos-assessor-shell-v2\.\d+/);
  assert.match(sw,/milos-travel-v248\.js/);
  assert.match(sw,/milos-travel-v248\.css/);
});
