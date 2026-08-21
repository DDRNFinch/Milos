import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const planning = fs.readFileSync(new URL("../assets/milos-planning-v212.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("Planning is exposed from More and stores visits locally", () => {
  assert.match(planning, /Planning<\/span><small>Reviews and observations calendar/);
  assert.match(planning, /milos-planning-v1/);
  assert.match(planning, /localStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(planning, /setInterval\s*\(/);
});

test("Calendar uses blue shades for review, observation and both", () => {
  assert.match(planning, /review:\s*"Review"/);
  assert.match(planning, /observation:\s*"Observation"/);
  assert.match(planning, /both:\s*"Review & Observation"/);
  assert.match(planning, /\.milos-plan-review\{--plan-bg:#dceeff/);
  assert.match(planning, /\.milos-plan-observation\{--plan-bg:#8ec4f4/);
  assert.match(planning, /\.milos-plan-both\{--plan-bg:#2f8fef/);
});

test("Booking form contains learner, visit type, optional time and optional address", () => {
  assert.match(planning, />Learner<\/span><select name="profileId" required>/);
  assert.match(planning, />Visit type<\/span>/);
  assert.match(planning, />Time \(optional\)<\/span>/);
  assert.match(planning, />Address \(optional\)<\/span>/);
});

test("Saved plans can start the correct Milos workflow", () => {
  assert.match(planning, /data-plan-action="start-review"/);
  assert.match(planning, /data-plan-action="start-observation"/);
  assert.match(planning, /launchMilos\("start-review", id\)/);
  assert.match(planning, /launchMilos\("start-observation", id\)/);
});

test("Navigation hands the optional address to driving directions on Android and iPhone", () => {
  assert.match(planning, /maps\.apple\.com\/\?daddr=/);
  assert.match(planning, /google\.com\/maps\/dir\/\?api=1&destination=/);
  assert.match(planning, /travelmode=driving/);
});

test("2.12 shell loads and caches Planning", () => {
  assert.match(index, /milos-app-version" content="2\.12"/);
  assert.match(index, /milos-planning-v212\.js\?v=2\.12/);
  assert.match(sw, /milos-assessor-shell-v2\.12/);
  assert.match(sw, /\.\/assets\/milos-planning-v212\.js/);
  assert.equal(pkg.version, "2.12.0");
  assert.match(pkg.scripts.check, /milos-planning-v212\.js/);
});
