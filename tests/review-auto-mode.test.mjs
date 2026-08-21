import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "assets/milos-review-auto-v26.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function loadModule() {
  const document = {
    addEventListener() {},
    documentElement: {},
    createElement() { return {}; },
    head: { appendChild() {} },
    querySelector() { return null; },
    getElementById() { return null; },
  };
  class MutationObserver { observe() {} }
  const context = {
    console,
    document,
    MutationObserver,
    Event: class Event {},
    setTimeout() { return 1; },
    clearTimeout() {},
    sessionStorage: { getItem() { return ""; }, setItem() {}, removeItem() {} },
    MilosCore: {
      codesSinceLastReview() { return ["K2", "S3"]; },
      getProfile() { return null; },
      latestSnapshot() { return null; },
      loadCourse: async () => null,
      metricsFor() { return {}; },
      reviewsForProfile() { return []; },
    },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "milos-review-auto-v26.js" });
  return context.MilosReviewAuto;
}

test("review automatic mode uses the same seven-tap Milos shortcut", () => {
  assert.match(source, /const TAP_TARGET = 7/);
  assert.match(source, /data-action=\"start-review\"/);
  assert.match(source, /\.milos-guidance > span/);
  assert.match(source, /tapCount < TAP_TARGET/);
});

test("review reports are grounded in the Evia progress snapshot and course stage", () => {
  const auto = loadModule();
  const profile = { id: "learner-1", name: "William Coffey" };
  const snapshot = {
    evidenceCount: 18,
    completedCodes: ["K1", "K2", "S1", "S3"],
    changedCodes: ["S3"],
    targets: [{ code: "S4", title: "Complete next cavity wall evidence" }],
  };
  const course = {
    coverageLabel: "KSB",
    learningLabel: "OTJ",
    descriptions: { K2: "Use safety equipment correctly", S3: "Manage waste appropriately" },
  };
  const metrics = {
    toc: 52,
    coverage: 47,
    learningPercent: 50,
    completed: 28,
    total: 59,
    learningHours: 289,
    learningTarget: 578,
  };
  const previous = { targets: [{ title: "Finish previous evidence pack" }] };
  const reports = auto.buildReports(profile, snapshot, course, metrics, previous);

  for (const name of auto.fields) assert.match(reports[name], /William|Evia|QR|provider|review/i);
  assert.match(reports.overallProgress, /52%/);
  assert.match(reports.overallProgress, /47%/);
  assert.match(reports.learningProgress, /289\.0/);
  assert.match(reports.trainingEvidence, /18 evidence/);
  assert.match(reports.trainingEvidence, /K2|S3/);
  assert.match(reports.previousActions, /Finish previous evidence pack/);
  assert.match(reports.apprenticeComments, /Complete next cavity wall evidence/);
  assert.equal(reports.overallStatus, "On track");
});

test("automatic review mode does not fabricate data the QR does not contain", () => {
  const auto = loadModule();
  const reports = auto.buildReports(
    { id: "learner-2", name: "Alex Smith" },
    { evidenceCount: 0, completedCodes: [], changedCodes: [], targets: [] },
    { coverageLabel: "AC", learningLabel: "GLH", descriptions: {} },
    { toc: 35, coverage: 8, learningPercent: 10, completed: 4, total: 50, learningHours: 84, learningTarget: 847 },
    null,
  );
  assert.match(reports.wellbeing, /not transferred|not.*QR/i);
  assert.match(reports.supportNeeds, /No wellbeing, safeguarding or personal support information is carried/i);
  assert.match(reports.qualifications, /does not contain personal English, maths/i);
  assert.equal(reports.overallStatus, "Off track");
  assert.doesNotMatch(reports.wellbeing, /is well|no concerns were raised|enjoying/);
});

test("review auto mode preserves assessor edits when later review pages render", () => {
  assert.match(source, /event\.isTrusted/);
  assert.match(source, /userEditedFields\.add\(name\)/);
  assert.match(source, /userEditedFields\.has\(name\)/);
  assert.match(source, /MutationObserver\(scheduleFill\)/);
});

test("Milos 2.6 loads and caches review automatic mode", () => {
  assert.match(index, /milos-app-version\" content=\"2\.6\"/);
  assert.match(index, /milos-review-auto-v26\.js\?v=2\.6/);
  assert.match(sw, /milos-assessor-shell-v2\.6/);
  assert.match(sw, /milos-review-auto-v26\.js/);
});
