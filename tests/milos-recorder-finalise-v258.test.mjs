import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-recorder-finalise-v258.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('recorder uses one finalisation layer instead of stacked hotfixes',()=>{
  assert.match(index,/milos-recorder-finalise-v258\.js\?v=2\.\d+/);
  assert.doesNotMatch(index,/milos-recorder-recovery-v256\.js/);
  assert.doesNotMatch(index,/milos-recorder-finalise-v257\.js/);
  assert.match(sw,/milos-recorder-finalise-v258\.js/);
  assert.doesNotMatch(sw,/milos-recorder-recovery-v256\.js/);
  assert.doesNotMatch(sw,/milos-recorder-finalise-v257\.js/);
});

test('recorder preserves native final data ordering before missing-stop recovery',()=>{
  assert.match(js,/native\.addEventListener\('dataavailable'/);
  assert.match(js,/target\.state==='inactive'/);
  assert.match(js,/DATA_QUIET_MS/);
  assert.match(js,/FORCE_TRACKS_MS/);
  assert.match(js,/HARD_STOP_MS/);
  assert.match(js,/inactive-without-stop-event/);
});

test('unexpected stop recovery no longer permanently lies about recorder state',()=>{
  assert.match(js,/meta\.unexpected&&meta\.recoveryWindow&&actual==='inactive'/);
  assert.match(js,/pair\.meta\.recoveryWindow=true/);
  assert.match(js,/pair\.meta\.recoveryWindow=false/);
  assert.match(js,/REC STOPPED/);
  assert.match(js,/CLIP HELD/);
});

test('WebM rewrite is bypassed only around live persistence and can run later',()=>{
  assert.match(js,/LIVE_SAVE_BYPASS_MS=10000/);
  assert.match(js,/meta\.liveSaveUntil=Date\.now\(\)\+LIVE_SAVE_BYPASS_MS/);
  assert.match(js,/Date\.now\(\)<=active\.meta\.liveSaveUntil/);
  assert.doesNotMatch(js,/if\(visible\(\)\|\|active\?\.meta\?\.recoveryReason/);
  assert.match(js,/FIX_MAX_BYTES=12\*1024\*1024/);
  assert.match(js,/FIX_TIMEOUT_MS=1800/);
});

test('current release metadata remains aligned after recorder repair',()=>{
  assert.match(pkg.version,/^2\.\d+\.0$/);
  assert.match(update.version,/^2\.\d+$/);
  assert.match(index,/milos-app-version" content="2\.\d+"/);
  assert.match(sw,/milos-assessor-shell-v2\.\d+/);
});
