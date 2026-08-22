import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const trigger = fs.readFileSync(new URL("../assets/milos-auto-trigger-v211.js", import.meta.url), "utf8");
const auto = fs.readFileSync(new URL("../assets/milos-auto-v29.js", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../update.json", import.meta.url), "utf8"));
const version = String(manifest.version);

test("Milos loads one automatic writer behind the current mobile-safe trigger", () => {
  assert.match(index, new RegExp(`milos-app-version\\" content=\\"${version}`));
  assert.match(index, new RegExp(`milos-auto-trigger-v211\\.js\\?v=${version.replace('.', '\\.')}`));
  assert.match(index, new RegExp(`milos-auto-v29\\.js\\?v=${version.replace('.', '\\.')}`));
  assert.ok(index.indexOf("milos-auto-trigger-v211.js") < index.indexOf("milos-auto-v29.js"));
  for (const legacy of [
    "milos-observation-auto-v25.js",
    "milos-review-auto-v26.js",
    "milos-natural-narrative-v27.js",
    "milos-observation-prose-v27.js",
    "milos-review-prose-v27.js"
  ]) assert.doesNotMatch(index, new RegExp(legacy.replaceAll(".", "\\.")));
});

test("seven mobile taps activate the single writer directly", () => {
  assert.match(trigger, /const TAP_TARGET = 7/);
  assert.match(trigger, /addEventListener\("pointerup"/);
  assert.match(trigger, /addEventListener\("touchend"/);
  assert.match(trigger, /event\.stopImmediatePropagation\(\)/);
  assert.match(trigger, /!event\.isTrusted/);
  assert.match(trigger, /global\.MilosAutomaticMode/);
  assert.match(trigger, /A\.buildObservation/);
  assert.match(trigger, /A\.buildReview/);
  assert.doesNotMatch(trigger, /dispatchEvent\(new MouseEvent\("click"/);
});

test("automatic review prose avoids criterion-dump language", () => {
  assert.doesNotMatch(auto, /individual criteria in the review narrative/i);
  assert.match(auto, /clearest development has been in/);
  assert.match(auto, /what .* personally did, the standard achieved and the understanding behind the work/);
});

test("automatic observation prose is assessor narrative", () => {
  assert.match(auto, /I observed \$\{learner\}/);
  assert.match(auto, /I questioned \$\{learner\}/);
  assert.match(auto, /I followed the activity as it happened/);
});

test("only active automatic mode refreshes and watches the Milos workspace", () => {
  assert.match(auto, /if \(!activeMode\) return/);
  assert.match(auto, /document\.getElementById\("viewPanel"\)/);
  assert.doesNotMatch(auto, /observe\(document\.documentElement/);
  assert.match(sw, new RegExp(`milos-assessor-shell-v${version.replace('.', '\\.')}`));
  assert.match(sw, /milos-auto-trigger-v211\.js/);
});
