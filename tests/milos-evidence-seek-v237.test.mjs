import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js=readFileSync(new URL('../assets/milos-video-evidence-v231.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('AC timestamps are printed in the professional evidence PDF',()=>{
  assert.match(js,/Video \$\{start\}/);
  assert.match(js,/startedOffsetMs/);
  assert.match(js,/endedOffsetMs/);
  assert.match(js,/acTimestampsInPdf: true/);
});

test('new recordings prefer MP4 when MediaRecorder supports it',()=>{
  const base=js.indexOf('const candidates');
  const mp4=js.indexOf('video/mp4;codecs=avc1.42E01E,mp4a.40.2',base);
  const webm=js.indexOf('video/webm;codecs=vp8,opus',base);
  assert.ok(mp4>=0&&webm>=0&&mp4<webm);
});

test('WebM is repaired at save and export without transcoding',()=>{
  assert.match(js,/ysFixWebmDuration\(blob, durationMs/);
  assert.match(js,/seekableEvidenceBlob/);
  assert.match(js,/seekableMedia: true/);
  assert.doesNotMatch(js,/prepareVideoForExport/);
});

test('offline shell contains duration repair library',()=>{
  assert.match(index,/fix-webm-duration-1\.0\.6\.js\?v=2\.39/);
  assert.ok(index.indexOf('fix-webm-duration-1.0.6.js')<index.indexOf('milos-video-evidence-v231.js'));
  assert.match(sw,/fix-webm-duration-1\.0\.6\.js/);
  assert.match(sw,/milos-assessor-shell-v2\.39/);
});
