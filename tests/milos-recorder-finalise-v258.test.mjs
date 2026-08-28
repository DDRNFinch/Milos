import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-recorder-finalise-v258.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('2.58 uses one recorder finalisation layer instead of stacked hotfixes',()=>{
  assert.match(index,/milos-recorder-finalise-v258\.js\?v=2\.58/);
  assert.doesNotMatch(index,/milos-recorder-recovery-v256\.js/);
  assert.doesNotMatch(index,/milos-recorder-finalise-v257\.js/);
  assert.match(sw,/milos-recorder-finalise-v258\.js/);
  assert.doesNotMatch(sw,/milos-recorder-recovery-v256\.js/);
  assert.doesNotMatch(sw,/milos-recorder-finalise-v257\.js/);
});

test('2.58 has bounded stop and WebM duration finalisation',()=>{
  assert.match(js,/STOP_TIMEOUT=1200/);
  assert.match(js,/FIX_TIMEOUT=1800/);
  assert.match(js,/dispatchEvent\(new Event\('stop'\)\)/);
  assert.match(js,/setTimeout\(syntheticStop,STOP_TIMEOUT\)/);
  assert.match(js,/ysFixWebmDuration/);
  assert.match(js,/setTimeout\(\(\)=>finish\(blob\),FIX_TIMEOUT\)/);
});

test('2.58 retains unexpected-stop recovery and visible saving state',()=>{
  assert.match(js,/meta\.unexpected=true/);
  assert.match(js,/return'recording'/);
  assert.match(js,/REC STOPPED/);
  assert.match(js,/CLIP HELD/);
  assert.match(js,/Saving clip…/);
});

test('2.58 release metadata is aligned',()=>{
  assert.equal(pkg.version,'2.58.0');
  assert.equal(update.version,'2.58');
  assert.match(index,/milos-app-version" content="2\.58"/);
  assert.match(sw,/milos-assessor-shell-v2\.58/);
});
