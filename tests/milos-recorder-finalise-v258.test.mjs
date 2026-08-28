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

test('Android observation finalisation ends source tracks instead of calling native MediaRecorder.stop',()=>{
  assert.match(js,/if\(IS_ANDROID&&meta\.evidence\)/);
  assert.match(js,/endAndroidTracks\(target,meta\)/);
  assert.match(js,/track\.stop\(\)/);
  assert.match(js,/ANDROID_DRAIN_MS=1600/);
  assert.match(js,/ANDROID_TIMESLICE_MS=1000/);
  assert.match(js,/tracks-ended-timeout/);
});

test('observation requestData is suppressed and Android MP4 is not selected',()=>{
  assert.match(js,/if\(meta\.evidence\)return;/);
  assert.match(js,/IS_ANDROID=\/Android\/i/);
  assert.match(js,/IS_ANDROID&&value\.includes\('video\/mp4'\)/);
});

test('fallback only manufactures completion after camera and microphone tracks were ended',()=>{
  const stopTracksAt=js.indexOf('track.stop()');
  const recoveredAt=js.indexOf("deliverRecoveredStop(target,meta,'tracks-ended-timeout')");
  assert.ok(stopTracksAt>=0);
  assert.ok(recoveredAt>stopTracksAt);
  assert.match(js,/meta\.syntheticFinalised=true/);
  assert.match(js,/if\(meta\.syntheticFinalised\)return'inactive'/);
});

test('unexpected native stop can still finish after native final data has already been emitted',()=>{
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