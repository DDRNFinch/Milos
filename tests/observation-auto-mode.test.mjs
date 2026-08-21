import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "assets/milos-observation-auto-v25.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function loadAutoModule() {
  const document = {
    addEventListener() {},
    documentElement: {},
    createElement() { return {}; },
    head: { appendChild() {} },
  };
  class MutationObserver { observe() {} }
  const context = {
    console,
    document,
    MutationObserver,
    sessionStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    MilosCore: {
      cleanCodes(value) { return Array.isArray(value) ? value : []; },
      getProfile() { return null; },
      loadCourse: async () => null,
    },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "milos-observation-auto-v25.js" });
  return context.MilosObservationAuto;
}

test("automatic observation mode is hidden behind seven taps on the blue M", () => {
  assert.match(source, /const TAP_TARGET = 7/);
  assert.match(source, /form\[data-form=\"observation-record\"\] \.milos-guidance > span/);
  assert.match(source, /tapCount < TAP_TARGET/);
  assert.match(source, /activateAutomaticMode/);
});

test("automatic mode fills only the six editable narrative fields", () => {
  for (const name of ["activityObserved", "safetyNotes", "qualityNotes", "questionsAndAnswers", "feedback", "actions"]) {
    assert.match(source, new RegExp(`\\"${name}\\"`));
  }
  const fieldsBlock = source.match(/const NARRATIVE_FIELDS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  assert.ok(fieldsBlock);
  assert.doesNotMatch(fieldsBlock[1], /observationDate|location|startTime|endTime|rating/);
  assert.match(source, /element\.value = value/);
  assert.doesNotMatch(source, /readOnly\s*=|disabled\s*=/);
});

test("reports use learner first name and the selected observation sections", () => {
  const auto = loadAutoModule();
  assert.equal(auto.tapTarget, 7);
  const reports = auto.buildReports("William Coffey", [
    {
      categoryTitle: "Building masonry structures",
      jobTitle: "Build cavity walling",
      opportunityTitle: "Show the wall being built",
      question: "Why are the wall ties positioned at the required spacing?",
      instruction: "Observe the wall as it is constructed.",
      codes: ["235.7.1", "235.7.3"],
      descriptions: [
        "Carry out the masonry work to the required specification and quality.",
        "Maintain safe and healthy working practices and use the required PPE.",
      ],
    },
    {
      categoryTitle: "Building masonry structures",
      jobTitle: "Build cavity walling",
      opportunityTitle: "Show the cavity details",
      question: "Explain how the cavity is kept clear and why this matters.",
      instruction: "Observe cavity components and details.",
      codes: ["235.5.4"],
      descriptions: ["Check quality, tolerances and protection of completed work."],
    },
    {
      categoryTitle: "Building masonry structures",
      jobTitle: "Build cavity walling",
      opportunityTitle: "Check the wall",
      question: "What checks confirm the wall meets the specification?",
      instruction: "Observe final quality checks.",
      codes: ["235.7.4"],
      descriptions: ["Complete masonry structures to specification and carry out appropriate checks."],
    },
  ], { coverageLabel: "AC" });

  for (const name of auto.narrativeFields) {
    assert.ok(reports[name].includes("William"), `${name} should use the learner first name`);
    assert.ok(reports[name].length > 180, `${name} should contain a full report rather than a short generic sentence`);
  }
  assert.match(reports.activityObserved, /wall being built/i);
  assert.match(reports.activityObserved, /cavity details/i);
  assert.match(reports.activityObserved, /checking the wall/i);
  assert.match(reports.safetyNotes, /PPE/i);
  assert.match(reports.qualityNotes, /quality|tolerance|specification/i);
  assert.match(reports.questionsAndAnswers, /wall ties|cavity|checks/i);
  assert.match(reports.feedback, /selected observation areas/i);
  assert.match(reports.actions, /future workplace tasks/i);
});

test("selected route data drives the report and later section changes update untouched fields", () => {
  assert.match(source, /C\.loadCourse\(profile\.courseRouteId\)/);
  assert.match(source, /course\.siteData/);
  assert.match(source, /job\.opps/);
  assert.match(source, /opportunity\.instruction/);
  assert.match(source, /opportunity\.question/);
  assert.match(source, /course\.descriptions/);
  assert.match(source, /userEditedFields\.has\(name\)/);
  assert.match(source, /signature === lastSectionSignature/);
});

test("v2.5 automatic mode is loaded after the app and cached offline", () => {
  const appAt = index.indexOf("milos-app.js?v=2.5");
  const autoAt = index.indexOf("milos-observation-auto-v25.js?v=2.5");
  assert.ok(appAt > 0 && autoAt > appAt);
  assert.match(index, /milos-app-version\" content=\"2\.5\"/);
  assert.match(sw, /milos-assessor-shell-v2\.5/);
  assert.match(sw, /milos-observation-auto-v25\.js/);
});
