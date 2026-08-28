import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-review-calendar-v255.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/milos-review-calendar-v255.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('2.55 final calendar override keeps Today white with a blue outline',()=>{
  assert.match(css,/\.mcal-day\.is-today\{[^}]*background:rgba\(255,255,255,\.98\)!important/);
  assert.match(css,/\.mcal-day\.is-today\{[^}]*border:2px solid var\(--std-brand,#2C85F7\)!important/);
  const standard=index.indexOf('milos-standard-ui-v229.css');
  const fix=index.indexOf('milos-review-calendar-v255.css');
  assert.ok(standard>=0&&fix>standard,'final Today override must load after standard UI');
});

test('review update toast has a real hidden state and hard cleanup',()=>{
  assert.match(css,/#toastRegion \.app-toast\{[^}]*opacity:0!important/);
  assert.match(css,/#toastRegion \.app-toast\.is-visible\{[^}]*opacity:1!important/);
  assert.match(js,/setTimeout\(\(\)=>\{if\(item\.isConnected\)item\.remove\(\);\},3800\)/);
});

test('generic Booking becomes an editable Distance Booking starting at zero miles',()=>{
  assert.match(js,/Distance Booking \(0 miles\)/);
  assert.match(js,/name=\"distanceMiles\"/);
  assert.match(js,/item\.distanceMiles=distanceValue\(pending\.distanceMiles\)/);
  assert.match(js,/item\.distanceBooking=true/);
  assert.match(js,/function distanceLabel\(value\)/);
});

test('calendar details provide quick access to planned review observation and meeting work',()=>{
  assert.match(js,/Open planned review/);
  assert.match(js,/Open planned observation/);
  assert.match(js,/Open meeting notes/);
  assert.match(js,/Open midpoint check-in/);
  assert.match(js,/dispatchAppAction\('start-review',item\.profileId\)/);
  assert.match(js,/dispatchAppAction\('start-observation',item\.profileId\)/);
  assert.match(js,/openNotes\(item\)/);
});

test('Evia wellbeing history is reference only and does not populate the review statement',()=>{
  assert.match(js,/coach\?\.wb\?\.s/);
  assert.match(js,/Evia wellbeing history since last review/);
  assert.match(js,/Reference only\. Milos does not write or infer the review wellbeing statement from these results\./);
  assert.doesNotMatch(js,/elements\.wellbeing\.value\s*=/);
  assert.doesNotMatch(js,/draft\.wellbeing\s*=/);
});

test('review can schedule an editable calculated midpoint check-in',()=>{
  assert.match(js,/function midpointDate\(from,to\)/);
  assert.match(js,/name=\"midpointCheckinEnabled\"/);
  assert.match(js,/name=\"midpointCheckinDate\"/);
  assert.match(js,/midpointCheckIn:true/);
  assert.match(js,/midpointCheckInDate:state\.midpoint\.date/);
  assert.match(js,/id=`midpoint-checkin-\$\{review\.id\}`/);
  assert.match(js,/type:'meeting'/);
});

test('midpoint and meeting check-in form is deliberately just a notes box',()=>{
  const form=js.match(/<form data-checkin-form[\s\S]*?<\/form>/)?.[0]||'';
  assert.ok(form,'check-in form should exist');
  assert.match(form,/textarea name=\"notes\"/);
  assert.doesNotMatch(form,/name=\"(?:rating|status|target|signature)/);
  assert.match(js,/milos-checkins-v1/);
});

test('review calendar layer stays loaded in the intended order and remains offline',()=>{
  const planning=index.indexOf('milos-planning-v213.js');
  const layer=index.indexOf('milos-review-calendar-v255.js');
  const records=index.indexOf('milos-record-management-v28.js');
  assert.ok(planning>=0&&layer>planning&&records>layer);
  assert.match(index,/milos-review-calendar-v255\.js\?v=\d+\.\d+/);
  assert.match(index,/milos-review-calendar-v255\.css\?v=\d+\.\d+/);
  assert.match(sw,/milos-review-calendar-v255\.js/);
  assert.match(sw,/milos-review-calendar-v255\.css/);
});

test('current release metadata remains aligned',()=>{
  const release=String(update.version||'');
  assert.match(release,/^\d+\.\d+$/);
  assert.equal(pkg.version,`${release}.0`);
  const escaped=release.replace('.', '\\.');
  assert.match(index,new RegExp(`milos-app-version\\" content=\\"${escaped}\\"`));
  assert.match(sw,new RegExp(`milos-assessor-shell-v${escaped}`));
});
