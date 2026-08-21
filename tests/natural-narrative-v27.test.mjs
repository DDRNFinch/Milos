import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "assets/milos-natural-narrative-v27.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function loadNarrative() {
  const document = {
    addEventListener() {},
    documentElement: {},
    createElement() { return { style: {}, classList: { add() {}, remove() {} } }; },
    head: { appendChild() {} },
    querySelector() { return null; },
  };
  class MutationObserver { observe() {} }
  class Event { constructor(type, options) { this.type = type; this.options = options; } }
  const context = {
    console,
    document,
    MutationObserver,
    Event,
    setTimeout() { return 1; },
    clearTimeout() {},
    sessionStorage: { getItem() { return ""; }, setItem() {} },
    MilosCore: {
      cleanCodes(value) { return Array.isArray(value) ? value : []; },
      codesSinceLastReview() { return ["K21", "S10"]; },
    },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "milos-natural-narrative-v27.js" });
  return context.MilosNaturalNarrative;
}

test("observation automatic mode writes assessor-style narrative rather than criterion lists", () => {
  const writer = loadNarrative();
  const reports = writer.buildObservationReports("William Coffey", [
    {
      opportunityTitle: "Show the wall being built",
      jobTitle: "Build cavity walling",
      question: "Why are wall ties positioned at the required spacing?",
      instruction: "Observe the wall as it is constructed.",
      codes: ["235.7.1", "235.7.3"],
      descriptions: [
        "Carry out the masonry work to the required specification and quality.",
        "Maintain safe and healthy working practices and use the required PPE.",
      ],
    },
    {
      opportunityTitle: "Show the cavity details",
      jobTitle: "Build cavity walling",
      question: "Explain how the cavity is kept clear and why this matters.",
      instruction: "Observe cavity components and details.",
      codes: ["235.5.4"],
      descriptions: ["Check quality, tolerances and protection of completed work."],
    },
  ]);

  assert.match(reports.activityObserved, /^I observed William /);
  assert.match(reports.questionsAndAnswers, /^I questioned William /);
  assert.match(reports.safetyNotes, /William/);
  assert.match(reports.qualityNotes, /William/);
  for (const text of Object.values(reports)) {
    assert.doesNotMatch(text, /\b235\.\d+(?:\.\d+)?\b/);
    assert.doesNotMatch(text, /selected sections map|mapped AC|mapped KSB/i);
  }
});

test("review automatic mode converts changed KSBs into natural course-topic prose", () => {
  const writer = loadNarrative();
  const reports = writer.buildReviewReports(
    { id: "learner-1", name: "William Coffey" },
    {
      evidenceCount: 12,
      changedCodes: ["K21", "S10"],
      completedCodes: ["K21", "S10"],
      targets: [{ title: "Complete cavity wall evidence", code: "S10" }],
    },
    {
      coverageLabel: "KSB",
      learningLabel: "OTJ",
      descriptions: {
        K21: "Principles and requirements for setting out cavity walling.",
        S10: "Set out cavity walling accurately to the required specification.",
      },
    },
    {
      toc: 50,
      coverage: 45,
      learningPercent: 48,
      completed: 27,
      total: 59,
      learningHours: 277.5,
      learningTarget: 578,
    },
    null,
  );

  assert.match(reports.trainingEvidence, /William/);
  assert.match(reports.trainingEvidence, /setting out cavity walling/i);
  assert.match(reports.overallProgress, /William is around 50% through/);
  assert.doesNotMatch(reports.trainingEvidence, /\bK21\b|\bS10\b/);
  assert.doesNotMatch(reports.trainingEvidence, /latest Evia QR records|mapped KSB items/i);
  assert.equal(reports.overallStatus, "On track");
});

test("legacy natural-writer behavior remains covered while the active app uses the single current writer", () => {
  assert.match(index, /milos-app-version\" content=\"2\.12\"/);
  assert.match(index, /milos-auto-v29\.js\?v=2\.12/);
  assert.doesNotMatch(index, /milos-natural-narrative-v27\.js\?v=/);
  assert.match(sw, /milos-assessor-shell-v2\.12/);
  assert.match(sw, /milos-auto-v29\.js/);
});
