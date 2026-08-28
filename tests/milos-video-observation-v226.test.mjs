import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js = fs.readFileSync(new URL('../assets/milos-video-evidence-v231.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/milos-video-evidence-v231.css', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('Milos 2.41 loads one unified video engine offline', () => {
  assert.match(index, /milos-app-version" content="2\.41"/);
  assert.match(index, /milos-video-evidence-v231\.js\?v=2\.41/);
  assert.match(index, /milos-video-evidence-v231\.css\?v=2\.41/);
  assert.doesNotMatch(index, /src="\.\/assets\/milos-video-observation-v226\.js/);
  assert.doesNotMatch(index, /src="\.\/assets\/milos-ksb-video-v230\.js/);
  assert.match(sw, /milos-assessor-shell-v2\.41/);
  assert.match(sw, /milos-video-evidence-v231\.js/);
});

test('NVQ keeps intro then free LO selection and AC timestamp decisions', () => {
  assert.match(js, /Start introduction recording/);
  assert.match(js, /Choose an LO to observe/);
  assert.match(js, /No LO order is required/);
  assert.match(js, /data-mve-action="choose-lo"/);
  assert.match(js, /startedOffsetMs: state\.acStartedOffsetMs/);
});

test('actions are written once after the LO recording has stopped', () => {
  assert.doesNotMatch(js, /mvo-inline-action/);
  assert.match(js, /data-mve-field="clipAction"/);
  assert.match(js, /Write one action for the whole LO\/section after the camera has stopped/);
  assert.match(js, /No typing is required while the camera is recording/);
  assert.match(js, /clip\.action = action/);
  assert.match(css, /\.mve-lo-action/);
});

test('live recorder uses higher-quality 720p capture and requires microphone audio', () => {
  assert.match(js, /VIDEO_BITS = 1600000/);
  assert.match(js, /AUDIO_BITS = 96000/);
  assert.match(js, /width: \{ ideal: 1280, max: 1280 \}/);
  assert.match(js, /height: \{ ideal: 720, max: 720 \}/);
  assert.match(js, /getAudioTracks\(\)/);
  assert.match(js, /Microphone audio is unavailable/);
  assert.match(js, /video\/webm;codecs=vp8,opus/);
  assert.match(js, /MIC ON/);
});

test('competence taps do not rebuild the live camera element', () => {
  assert.match(js, /id="mveVideoPreview"/);
  assert.match(js, /function chooseStatus\(status\)/);
  assert.match(js, /classList\.toggle\("is-selected"/);
  assert.match(js, /function updateNvqRecordingPanel\(\)/);
  const choose = js.slice(js.indexOf('function chooseStatus(status)'), js.indexOf('function storeCurrentAcDecision'));
  assert.doesNotMatch(choose, /show\(/);
  assert.doesNotMatch(choose, /renderNvqRecording/);
});

test('linked witness evidence reuses signatures and joins the parent record', () => {
  assert.match(js, /Assessor and learner signatures are already held on the main observation/);
  assert.match(js, /function completeLinkedWitness/);
  assert.match(js, /combinedMedia/);
  assert.match(js, /witnessEvidence/);
  assert.match(js, /Add witness testimony/);
});

test('professional PDF and ZIP retain original stored media without export transcoding', () => {
  assert.match(js, /MILOS · ASSESSOR EVIDENCE/);
  assert.match(js, /Recorded evidence/);
  assert.match(js, /Actions \/ further evidence/);
  assert.match(js, /Created in Milos \$\{VERSION\} · Page/);
  assert.match(js, /B\.makeZip\(entries\)/);
  assert.doesNotMatch(js, /prepareVideoForExport/);
  assert.match(js, /Videos are never replayed or transcoded during export/);
});
