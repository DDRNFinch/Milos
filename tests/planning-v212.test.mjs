import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const planning = fs.readFileSync(new URL("../assets/milos-planning-v212.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("Milos 2.12 loads and caches Planning offline", () => {
  assert.match(index, /milos-app-version" content="2\.12"/);
  assert.match(index, /milos-planning-v212\.js\?v=2\.12/);
  assert.match(sw, /milos-assessor-shell-v2\.12/);
  assert.match(sw, /milos-planning-v212\.js/);
});

test("Planning stores local visit records and supports the requested visit types", () => {
  assert.match(planning, /milos-planning-v1/);
  assert.match(planning, /review:\s*\{ label: "Review"/);
  assert.match(planning, /observation:\s*\{ label: "Observation"/);
  assert.match(planning, /both:\s*\{ label: "Review & Observation"/);
  assert.match(planning, /localStorage\.setItem\(STORAGE_KEY/);
});

test("calendar uses learner names with a three-shade Milos blue key", () => {
  assert.match(planning, /firstName\(profile\.name\)/);
  assert.match(planning, /#dceeff/);
  assert.match(planning, /#92c7f5/);
  assert.match(planning, /#2f8fef/);
  assert.match(planning, /Review &amp; Observation/);
});

test("planned visits can launch reviews, observations and driving navigation", () => {
  assert.match(planning, /bridgeToMilos\("start-review"/);
  assert.match(planning, /bridgeToMilos\("start-observation"/);
  assert.match(planning, /maps\.apple\.com/);
  assert.match(planning, /google\.com\/maps\/dir/);
  assert.match(planning, /travelmode=driving/);
});

test("Planning is event-driven rather than polling the Milos page", () => {
  assert.match(planning, /new MutationObserver\(scheduleDecorate\)/);
  assert.doesNotMatch(planning, /setInterval\(/);
});
