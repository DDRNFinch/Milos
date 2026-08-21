import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bundle=fs.readFileSync(new URL('../assets/milos-observation-bundle-v22.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('observation exporter captures the PDF before download',()=>{
  assert.match(bundle,/doc\.output\("blob"\)/);
  assert.match(bundle,/captureObservationPdf/);
  assert.match(bundle,/originalPdf\.observationPdf/);
});

test('video and audio recordings are included in the ZIP',()=>{
  assert.match(bundle,/type\.startsWith\("video\/"\)/);
  assert.match(bundle,/type\.startsWith\("audio\/"\)/);
  assert.match(bundle,/application\/zip/);
  assert.match(bundle,/0x04034B50/);
  assert.match(bundle,/0x02014B50/);
  assert.match(bundle,/0x06054B50/);
});

test('every ZIP entry uses DEFLATE compression rather than store mode',()=>{
  assert.match(bundle,/new CompressionStream\(format\)/);
  assert.match(bundle,/deflate-raw/);
  assert.match(bundle,/view\.setUint16\(8, 8, true\)/);
  assert.match(bundle,/view\.setUint16\(10, 8, true\)/);
  assert.match(bundle,/compressionMethod: "DEFLATE"/);
  assert.match(bundle,/compressed: true/);
});

test('Milos exposes a direct Record audio control',()=>{
  assert.match(bundle,/Record audio/);
  assert.match(bundle,/accept=\"audio\/\*\"/);
  assert.match(bundle,/data-observation-media/);
});

test('bundle exporter loads before the app and is cached offline',()=>{
  const bundleAt=index.indexOf('milos-observation-bundle-v22.js');
  const appAt=index.indexOf('milos-app.js');
  assert.ok(bundleAt>0&&appAt>bundleAt);
  assert.match(sw,/milos-observation-bundle-v22\.js/);
});
