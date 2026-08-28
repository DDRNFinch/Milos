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

test('Android observation finalisation calls native MediaRecorder.stop and keeps track shutdown only as fallback',()=>{
  assert.match(js,/return target\.stop\(\)/);
  assert.match(js,/STOP_FALLBACK_MS=2500/);
  assert.match(js,/emergencyFinish\(target,meta\)/);
  assert.match(js,/track\.stop\(\)/);
  assert.doesNotMatch(js,/endAndroidTracks\(target,meta\)/);
  assert.doesNotMatch(js,/tracks-ended-timeout/);
});

test('observation requestData remains available and Android MP4 is not selected',()=>{
  assert.doesNotMatch(js,/if\(meta\.evidence\)return;/);
  assert.match(js,/if\(target\.state!=='recording'\)return;/);
  assert.match(js,/target\.requestData\(\.\.\.args\)/);
  assert.match(js,/IS_ANDROID=\/Android\/i/);
  assert.match(js,/IS_ANDROID&&value\.includes\('video\/mp4'\)/);
});

test('track shutdown is emergency fallback only after native stop timeout',()=>{
  assert.match(js,/fallbackTimer=setTimeout\(\(\)=>\{meta\.fallbackTimer=0;emergencyFinish\(target,meta\);\},STOP_FALLBACK_MS\)/);
  assert.match(js,/dispatchRecoveredStop\(target,meta,'native-stop-timeout',true\)/);
  assert.match(js,/androidStopStrategy:IS_ANDROID\?'native-stop-first':'native-stop'/);
});

test('unexpected native stop can still finish captured evidence',()=>{
  assert.match(js,/meta\.unexpected&&!meta\.stopRequested&&actual==='inactive'/);
  assert.match(js,/already-inactive/);
  assert.match(js,/REC STOPPED/);
  assert.match(js,/CLIP HELD/);
});

test('WebM rewrite is bypassed only around live persistence and can run later',()=>{
  assert.match(js,/LIVE_SAVE_BYPASS_MS=10000/);
  assert.match(js,/meta\.liveSaveUntil=Date\.now\(\)\+LIVE_SAVE_BYPASS_MS/);
  assert.match(js,/Date\.now\(\)<=active\.meta\.liveSaveUntil/);
  assert.match(js,/FIX_MAX_BYTES=12\*1024\*1024/);
  assert.match(js,/FIX_TIMEOUT_MS=1800/);
});

test('current release metadata remains aligned after recorder repair',()=>{
  assert.match(pkg.version,/^2\.\d+\.0$/);
  assert.match(update.version,/^2\.\d+$/);
  assert.match(index,/milos-app-version" content="2\.\d+"/);
  assert.match(sw,/milos-assessor-shell-v2\.\d+/);
});