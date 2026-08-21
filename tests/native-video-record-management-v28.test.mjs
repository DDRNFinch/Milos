import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const optimiser = fs.readFileSync(new URL("../assets/milos-media-optimize-v24.js", import.meta.url), "utf8");
const bundle = fs.readFileSync(new URL("../assets/milos-observation-bundle-v22.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../assets/milos-app.js", import.meta.url), "utf8");
const records = fs.readFileSync(new URL("../assets/milos-record-management-v28.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("video capture uses the normal device camera and is not transcoded before storage", () => {
  assert.match(app, /Record video<input type="file" accept="video\/\*" capture="environment" data-observation-media>/);
  assert.match(optimiser, /compressVideoOnSave:\s*false/);
  assert.match(optimiser, /nativeCameraCapture:\s*true/);
  assert.doesNotMatch(optimiser, /openVideoRecorder/);
});

test("oversized video is prepared to the 11 MB per minute target during ZIP export", () => {
  assert.match(optimiser, /MAX_VIDEO_BYTES_PER_MINUTE\s*=\s*11\s*\*\s*1000\s*\*\s*1000/);
  assert.match(optimiser, /prepareVideoForExport/);
  assert.match(bundle, /mediaOptimizer\.prepareVideoForExport/);
  assert.match(bundle, /videoTargetBytesPerMinute:\s*11\s*\*\s*1000\s*\*\s*1000/);
  assert.match(bundle, /compressionMethod:\s*"DEFLATE"/);
});

test("saved reviews and observations expose edit and delete controls", () => {
  assert.match(records, /Edit review/);
  assert.match(records, /Delete review/);
  assert.match(records, /Edit observation/);
  assert.match(records, /Delete observation/);
  assert.match(records, /C\.saveReview\(next\)/);
  assert.match(records, /C\.saveObservation\(next\)/);
  assert.match(records, /M\.removeFile/);
  assert.match(records, /milos-reviews-v1/);
  assert.match(records, /milos-observations-v1/);
});

test("Milos 2.10 still loads and caches v2.8 record management", () => {
  assert.match(index, /milos-app-version" content="2\.10/);
  assert.match(index, /milos-record-management-v28\.js\?v=2\.10/);
  assert.match(sw, /milos-assessor-shell-v2\.10/);
  assert.match(sw, /milos-record-management-v28\.js/);
});
