import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../assets/milos-video-observation-v226.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('Milos 2.26 loads guided video observation offline', () => {
  assert.match(index, /milos-app-version" content="2\.26"/);
  assert.match(index, /milos-video-observation-v226\.css\?v=2\.26/);
  assert.match(index, /milos-video-observation-v226\.js\?v=2\.26/);
  assert.match(sw, /milos-assessor-shell-v2\.26/);
  assert.match(sw, /milos-video-observation-v226\.js/);
  assert.match(sw, /milos-video-observation-v226\.css/);
});

test('video observation records intro then lets assessor choose LOs freely', () => {
  assert.match(js, /Record introduction/);
  assert.match(js, /Choose any LO to observe/);
  assert.match(js, /No LO order is required/);
  assert.match(js, /data-mvo-action="choose-lo"/);
  assert.match(js, /recordingName\(kind, lo, timestamp, extension\)/);
});

test('video capture is intentionally reduced and warns around ten minutes', () => {
  assert.match(js, /VIDEO_BITS_PER_SECOND = 550000/);
  assert.match(js, /AUDIO_BITS_PER_SECOND = 48000/);
  assert.match(js, /SOFT_WARNING_SECONDS = 9 \* 60/);
  assert.match(js, /BURST_TARGET_SECONDS = 10 \* 60/);
  assert.match(js, /width: \{ ideal: 854, max: 1280 \}/);
});

test('competence uses compact circle symbols and actions are conditional', () => {
  assert.match(js, /competent: \{ symbol: "●"/);
  assert.match(js, /action: \{ symbol: "◐"/);
  assert.match(js, /further: \{ symbol: "○"/);
  assert.match(js, /Action \/ further evidence/);
});

test('100 percent wording matches are mapped without copying competence', () => {
  assert.match(js, /item\.words !== sourceWords/);
  assert.match(js, /mapping: "100% wording match"/);
  assert.match(js, /status: "mapped-supporting-evidence"/);
  assert.match(js, /No competence is copied across/);
});

test('witness mode, signatures, timestamped PDF and ZIP are present', () => {
  assert.match(js, /Video witness testimony/);
  assert.match(js, /Witness signature/);
  assert.match(js, /Timestamped video evidence/);
  assert.match(js, /B\.makeZip\(entries\)/);
  assert.match(js, /Download compressed ZIP/);
});
