import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const qr = fs.readFileSync(new URL("../assets/milos-evia-v2.js", import.meta.url), "utf8");
const updater = fs.readFileSync(new URL("../assets/milos-updater-v235.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const staticTests = fs.readFileSync(new URL("./static.test.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const manifest = JSON.parse(fs.readFileSync(new URL("../update.json", import.meta.url), "utf8"));
const version=String(manifest.version);

test("review return to Evia is one compact QR", () => {
  assert.match(qr, /NISI:MILOS:VISIT:2:/);
  assert.match(qr, /:1\/1:/);
  assert.doesNotMatch(qr, /CHUNK/);
  assert.doesNotMatch(qr, /data-v2-prev|data-v2-next/);
  assert.match(qr, /1 QR — scan once/);
});

test("review QR contains only the review summary, next date and targets plus matching metadata", () => {
  assert.match(qr, /overallStatus/);
  assert.match(qr, /overallProgress/);
  assert.match(qr, /nextReviewDate/);
  assert.match(qr, /targets/);
  for (const removed of ["previousActions", "trainingEvidence", "learningProgress", "qualifications", "trainingPlanChanges", "supportNeeds", "wellbeing", "apprenticeComments", "employerComments", "employerContribution"]) {
    assert.doesNotMatch(qr, new RegExp(removed));
  }
});

test("observation return is also one compact QR", () => {
  assert.match(qr, /NISI:MILOS:OBS:1:/);
  assert.match(qr, /observedCodes/);
});

test("Milos has a visible update available notification and install action", () => {
  assert.match(updater, /Update available/);
  assert.match(updater, /Install update/);
  assert.match(updater, /update\.json\?check=/);
  assert.match(updater, /cache:\"no-store\"/);
  assert.match(index, new RegExp(`milos-updater-v235\\.js\\?v=${version.replaceAll('.', '\\.')} ` .trim()));
});

test("current Milos shell and manifest agree", () => {
  assert.equal(pkg.version, `${version}.0`);
  assert.match(index, new RegExp(`milos-app-version\\" content=\\"${version.replaceAll('.', '\\.')}`));
  assert.match(sw, new RegExp(`milos-assessor-shell-v${version.replaceAll('.', '\\.')}`));
  assert.match(sw, /milos-updater-v235\.js/);
  assert.match(sw, /update\.json/);
});

test("general static regressions do not pin retired Milos versions", () => {
  assert.doesNotMatch(staticTests, /milos-app-version\" content=\"2\\\.9/);
  assert.doesNotMatch(staticTests, /milos-assessor-shell-v2\\\.9/);
  assert.doesNotMatch(staticTests, /BUNDLE_VERSION = 1/);
});