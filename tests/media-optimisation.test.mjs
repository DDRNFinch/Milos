import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const media=fs.readFileSync(new URL('../assets/milos-media-optimize-v24.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Milos caps stored video at 11 MB per minute',()=>{
  assert.match(media,/MAX_VIDEO_BYTES_PER_MINUTE = 11 \* 1000 \* 1000/);
  assert.match(media,/CAPTURE_VIDEO_BITS_PER_SECOND = 1300000/);
  assert.match(media,/CAPTURE_AUDIO_BITS_PER_SECOND = 96000/);
  assert.match(media,/ensureVideoTarget/);
  assert.match(media,/output\.size > maximum/);
  assert.match(media,/Record it directly in Milos instead/);
});

test('Milos records video itself before private storage',()=>{
  assert.match(media,/navigator\.mediaDevices\.getUserMedia/);
  assert.match(media,/new MediaRecorder\(stream/);
  assert.match(media,/Start recording/);
  assert.match(media,/Stop & use video/);
  assert.match(media,/data-observation-media/);
});

test('imported videos are transcoded when they exceed the same limit',()=>{
  assert.match(media,/captureStream/);
  assert.match(media,/transcodeVideo/);
  assert.match(media,/file\.size <= maximum/);
  assert.match(media,/audioTracks/);
  assert.match(media,/stream\.getAudioTracks\(\)/);
});

test('photos are only reduced by lossless metadata removal',()=>{
  assert.match(media,/minimiseImageLossless/);
  assert.match(media,/exifOrientation/);
  assert.match(media,/orientation === 0 \|\| orientation === 1/);
  assert.match(media,/"tEXt", "zTXt", "iTXt", "eXIf", "tIME"/);
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
  assert.match(index,/milos-app-version" content="2\.4"/);
});
