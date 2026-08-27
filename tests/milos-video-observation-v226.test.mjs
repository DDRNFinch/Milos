import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../assets/milos-video-observation-v226.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/milos-video-observation-v226.css', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('Milos 2.29 loads guided video observation offline', () => {
  assert.match(index, /milos-app-version" content="2\.29"/);
  assert.match(index, /milos-video-observation-v226\.css\?v=2\.29/);
  assert.match(index, /milos-video-observation-v226\.js\?v=2\.29/);
  assert.match(sw, /milos-assessor-shell-v2\.29/);
  assert.match(sw, /milos-video-observation-v226\.js/);
  assert.match(sw, /milos-video-observation-v226\.css/);
});

test('Start Observation opens a clean method chooser including witness testimony', () => {
  assert.match(js, /Choose how you want to record this observation/);
  assert.match(js, /Written observation/);
  assert.match(js, /Video observation/);
  assert.match(js, /Witness video testimony/);
  assert.match(js, /data-mvo-action="written-method"/);
  assert.match(js, /data-mvo-action="video-method"/);
  assert.match(js, /data-mvo-action="witness-method"/);
});

test('video observation records intro then lets assessor choose LOs freely', () => {
  assert.match(js, /Start introduction recording/);
  assert.match(js, /Choose an LO to observe/);
  assert.match(js, /No LO order is required/);
  assert.match(js, /data-mvo-action="choose-lo"/);
  assert.match(js, /recordingName\(kind, lo, timestamp, extension\)/);
});

test('each LO recording shows one AC at a time and timestamps Next AC', () => {
  assert.match(js, /AC \$\{state\.acIndex \+ 1\} of/);
  assert.match(js, /data-mvo-action="next-ac"/);
  assert.match(js, /Press Next AC when you move to the next criterion/);
  assert.match(js, /startedOffsetMs: state\.acStartedOffsetMs/);
  assert.match(js, /formatOffset\(ac\.startedOffsetMs\)/);
  assert.match(css, /\.mvo-ac-screen\{height:100dvh/);
  assert.match(css, /\.mvo-ac-video\{[^}]*flex:1 1 auto/);
});

test('competence unlocks Next AC and actions are shown only when needed', () => {
  assert.match(js, /competent: \{ symbol: "●"/);
  assert.match(js, /action: \{ symbol: "◐"/);
  assert.match(js, /further: \{ symbol: "○"/);
  assert.match(js, /data-mvo-action="next-ac" \$\{state\.currentStatus \? "" : "disabled"\}/);
  assert.match(js, /showAction = state\.currentStatus === "action" \|\| state\.currentStatus === "further"/);
});

test('100 percent wording matches become partially observed without competence', () => {
  assert.match(js, /item\.words !== sourceWords/);
  assert.match(js, /mapping: "100% wording match"/);
  assert.match(js, /status: "Partially observed"/);
  assert.match(js, /competence: ""/);
  assert.match(js, /mappedOutcome: "Partially observed"/);
});

test('video capture remains reduced and ZIP/PDF export includes timestamped ACs', () => {
  assert.match(js, /VIDEO_BITS_PER_SECOND = 550000/);
  assert.match(js, /SOFT_WARNING_SECONDS = 9 \* 60/);
  assert.match(js, /Timestamped video evidence/);
  assert.match(js, /B\.makeZip\(entries\)/);
  assert.match(js, /Download compressed ZIP/);
  assert.match(js, /Record witness testimony/);
});
