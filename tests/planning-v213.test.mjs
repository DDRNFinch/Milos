import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const planning = fs.readFileSync(new URL("../assets/milos-planning-v213.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("Planning opens through stable delegated click handling", () => {
  assert.match(planning, /document\.addEventListener\("click", handlePlanClick, false\)/);
  assert.match(planning, /if \(action === "open"\).*renderCalendar\(\)/);
  assert.match(planning, /pointer-events:auto/);
  assert.doesNotMatch(planning, /setInterval\s*\(/);
});

test("More gets a Planning row whenever its view is rendered", () => {
  assert.match(planning, /data-action=\\?"open-settings/);
  assert.match(planning, /button\.dataset\.planAction = "open"/);
  assert.match(planning, /MutationObserver/);
});

test("new reviews default from 12 weeks to an editable 10 weeks", () => {
  assert.match(planning, /form\[data-form="review-targets"\]/);
  assert.match(planning, /addDays\(input\.value, -14\)/);
  assert.match(planning, /event\.isTrusted/);
  assert.match(planning, /Next review date \(booked in Planning\)/);
});

test("completing a review upserts its next review into Planning", () => {
  assert.match(planning, /appAction\.dataset\.action === "review-complete"/);
  assert.match(planning, /upsertNextReview\(review\.profileId, review\.nextReviewDate, review\.id\)/);
  assert.match(planning, /next-review-\$\{cleanReview\}/);
});

test("calendar retains visit types, editing and navigation", () => {
  assert.match(planning, /review:\s*"Review"/);
  assert.match(planning, /observation:\s*"Observation"/);
  assert.match(planning, /both:\s*"Review & Observation"/);
  assert.match(planning, /data-plan-action="edit"/);
  assert.match(planning, /data-plan-action="delete"/);
  assert.match(planning, /maps\.apple\.com\/\?daddr=/);
  assert.match(planning, /google\.com\/maps\/dir\/\?api=1&destination=/);
});

test("2.13 shell loads and caches the replacement Planning module", () => {
  assert.match(index, /milos-app-version" content="2\.13"/);
  assert.match(index, /milos-planning-v213\.js\?v=2\.13/);
  assert.doesNotMatch(index, /milos-planning-v212\.js/);
  assert.match(sw, /milos-assessor-shell-v2\.13/);
  assert.match(sw, /\.\/assets\/milos-planning-v213\.js/);
  assert.equal(pkg.version, "2.13.0");
  assert.match(pkg.scripts.check, /milos-planning-v213\.js/);
});
