import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-geocode-fallback-v250.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('2.50 retries a failed full UK address using its postcode',()=>{
  assert.match(js,/ukPostcode/);
  assert.match(js,/postalcode=/);
  assert.match(js,/United Kingdom/);
  assert.match(js,/return await api\.geocode\(q\)/);
  assert.match(js,/if\(fallback\)return fallback/);
});

test('2.50 keeps the same OpenStreetMap lookup service and does not add location tracking',()=>{
  assert.match(js,/nominatim\.openstreetmap\.org\/search/);
  assert.doesNotMatch(js,/navigator\.geolocation/);
  assert.doesNotMatch(js,/postcodes\.io/);
});

test('2.50 gives a useful message when mileage cannot resolve a site address',()=>{
  assert.match(js,/needs a recognised UK postcode to calculate mileage/);
  assert.match(js,/Check the postcode and try again/);
});

test('2.50 loads after the existing travel engine and is cached offline',()=>{
  const travel=index.indexOf('milos-travel-v248.js');
  const fallback=index.indexOf('milos-geocode-fallback-v250.js');
  const updater=index.indexOf('milos-updater-v236.js');
  assert.ok(travel>=0&&fallback>travel&&updater>fallback);
  assert.equal(pkg.version,'2.50.0');
  assert.equal(update.version,'2.50');
  assert.match(index,/milos-app-version" content="2\.50"/);
  assert.match(index,/milos-geocode-fallback-v250\.js\?v=2\.50/);
  assert.match(sw,/milos-assessor-shell-v2\.50/);
  assert.match(sw,/milos-geocode-fallback-v250\.js/);
});
