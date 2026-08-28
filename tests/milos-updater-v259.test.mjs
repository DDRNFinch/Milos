import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const updater=readFileSync(new URL('../assets/milos-updater-v236.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('2.59 updater waits for the new worker and controller before reopening Milos',()=>{
  assert.match(updater,/waitForUpdateWorker/);
  assert.match(updater,/waitControllerChange/);
  assert.match(updater,/await reg\.update\(\)/);
  assert.match(updater,/await waitControllerChange\(before,12000\)/);
  assert.match(updater,/milos_update=/);
});

test('2.59 service worker refreshes the HTML shell for explicit update navigation',()=>{
  assert.match(sw,/async function refreshIndex/);
  assert.match(sw,/index\.html\?check=/);
  assert.match(sw,/url\.searchParams\.has\("milos_update"\)/);
  assert.match(sw,/await refreshIndex\(cache\)/);
});

test('2.59 changes update delivery without replacing the recorder finaliser',()=>{
  assert.match(index,/milos-recorder-finalise-v258\.js\?v=2\.59/);
  assert.doesNotMatch(index,/milos-recorder-recovery-v256\.js/);
  assert.doesNotMatch(index,/milos-recorder-finalise-v257\.js/);
});

test('2.59 release metadata is aligned',()=>{
  assert.equal(pkg.version,'2.59.0');
  assert.equal(update.version,'2.59');
  assert.match(index,/milos-app-version" content="2\.59"/);
  assert.match(sw,/milos-assessor-shell-v2\.59/);
});
