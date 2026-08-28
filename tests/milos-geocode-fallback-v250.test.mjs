import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-geocode-fallback-v250.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('2.54 resolves a UK postcode before broad full-address geocoding',()=>{
  assert.match(js,/const GEO_VERSION='2\.54-postcode-first'/);
  assert.match(js,/ukPostcode/);
  assert.match(js,/postalcode=/);
  assert.match(js,/United Kingdom/);
  assert.match(js,/const exact=await postcodeGeocode\(postcode\)/);
  assert.match(js,/if\(exact\)return exact/);
  assert.match(js,/const point=await api\.geocode\(q\)/);
});

test('2.54 keeps OpenStreetMap lookup and does not add device location tracking',()=>{
  assert.match(js,/nominatim\.openstreetmap\.org\/search/);
  assert.doesNotMatch(js,/navigator\.geolocation/);
  assert.doesNotMatch(js,/postcodes\.io/);
});

test('2.54 gives a useful message when mileage cannot resolve a calendar postcode',()=>{
  assert.match(js,/needs a recognised UK postcode to calculate reliable mileage/);
  assert.match(js,/Check the calendar address and try again/);
});

test('postcode-first lookup remains loaded after travel and cached in the current release',()=>{
  const travel=index.indexOf('milos-travel-v248.js');
  const fallback=index.indexOf('milos-geocode-fallback-v250.js');
  const updater=index.indexOf('milos-updater-v236.js');
  assert.ok(travel>=0&&fallback>travel&&updater>fallback);
  assert.match(pkg.version,/^2\.\d+\.0$/);
  assert.match(update.version,/^2\.\d+$/);
  assert.match(index,/milos-app-version" content="2\.\d+"/);
  assert.match(index,/milos-geocode-fallback-v250\.js\?v=2\.\d+/);
  assert.match(sw,/milos-assessor-shell-v2\.\d+/);
  assert.match(sw,/milos-geocode-fallback-v250\.js/);
});
