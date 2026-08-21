import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const auto = fs.readFileSync(new URL("../assets/milos-auto-v29.js", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("Milos loads one automatic mode writer", () => {
  assert.match(index, /milos-auto-v29\.js\?v=2\.9/);
  for (const legacy of [
    "milos-observation-auto-v25.js",
    "milos-review-auto-v26.js",
    "milos-natural-narrative-v27.js",
    "milos-observation-prose-v27.js",
    "milos-review-prose-v27.js"
  ]) assert.doesNotMatch(index, new RegExp(legacy.replaceAll(".", "\\.")));
});

test("automatic review prose avoids criterion dump language", () => {
  assert.doesNotMatch(auto, /individual criteria in the review narrative/i);
  assert.match(auto, /clearest development has been in/);
  assert.match(auto, /what .* personally did, the standard achieved and the understanding behind the work/);
});

test("automatic observation prose is assessor narrative", () => {
  assert.match(auto, /I observed \$\{learner\}/);
  assert.match(auto, /I questioned \$\{learner\}/);
  assert.match(auto, /I followed the activity as it happened/);
});

test("only the active automatic mode refreshes and it watches the Milos workspace", () => {
  assert.match(auto, /if \(!activeMode\) return/);
  assert.match(auto, /document\.getElementById\("viewPanel"\)/);
  assert.doesNotMatch(auto, /observe\(document\.documentElement/);
  assert.match(sw, /milos-assessor-shell-v2\.9/);
});
