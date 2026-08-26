import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const media=fs.readFileSync(new URL('../assets/milos-media-optimize-v24.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../update.json',import.meta.url),'utf8'));
const version=String(manifest.version).replaceAll('.','\\.');

test('Milos keeps the 11 MB per minute video export cap',()=>{
  assert.match(media,/MAX_VIDEO_BYTES_PER_MINUTE = 11 \* 1000 \* 1000/);
  assert.match(media,/EXPORT_VIDEO_BITS_PER_SECOND = 1280000/);
  assert.match(media,/EXPORT_AUDIO_BITS_PER_SECOND = 96000/);
  assert.match(media,/prepareVideoForExport/);
  assert.match(media,/result\.size > maximum/);
  assert.match(media,/11 MB\/min export target/);
});

test('native camera video is stored without save-time transcoding',()=>{
  assert.match(media,/nativeCameraCapture:\s*true/);
  assert.match(media,/compressVideoOnSave:\s*false/);
  assert.match(media,/compressVideoOnExport:\s*true/);
  assert.doesNotMatch(media,/openVideoRecorder/);
});

test('oversized imported videos are transcoded during ZIP export',()=>{
  assert.match(media,/captureStream/);
  assert.match(media,/transcodeVideo/);
  assert.match(media,/source\.size <= maximum/);
  assert.match(media,/audioTracks/);
  assert.match(media,/stream\.getAudioTracks\(\)/);
});

test('photos are only reduced by lossless metadata removal',()=>{
  assert.match(media,/minimiseImageLossless/);
  assert.match(media,/exifOrientation/);
  assert.match(media,/\[0, 1\]\.includes\(exifOrientation\(payload\)\)/);
  assert.match(media,/"tEXt","zTXt","iTXt","eXIf","tIME"/);
  assert.doesNotMatch(media,/toDataURL\(/);
  assert.doesNotMatch(media,/toBlob\(/);
});

test('media optimiser loads before PDF/app and is cached offline',()=>{
  const base=index.indexOf('milos-media.js');
  const optimise=index.indexOf('milos-media-optimize-v24.js');
  const pdf=index.indexOf('milos-pdf.js');
  const app=index.indexOf('milos-app.js');
  assert.ok(base>0&&optimise>base&&pdf>optimise&&app>pdf);
  assert.match(sw,/milos-media-optimize-v24\.js/);
  assert.match(index,new RegExp(`milos-app-version" content="${version}`));
});
