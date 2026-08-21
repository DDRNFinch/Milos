import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "assets/milos-observation-prose-v27.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function loadWriter() {
  const document = { addEventListener() {}, querySelector() { return null; }, documentElement: {} };
  class MutationObserver { observe() {} }
  class Event {}
  const context = {
    document,
    MutationObserver,
    Event,
    setTimeout() { return 1; },
    clearTimeout() {},
    sessionStorage: { getItem() { return ""; }, setItem() {} },
    MilosCore: { cleanCodes(value) { return Array.isArray(value) ? value : []; } },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "milos-observation-prose-v27.js" });
  return context.MilosObservationProse;
}

test("final observation prose separates performance from knowledge", () => {
  const writer = loadWriter();
  const reports = writer.build("William Coffey", [{
    title: "Build the wall",
    job: "Building a cavity wall",
    requirements: [
      { code: "K22", text: "Cavity wall construction including stretcher bond walling, openings, cavity closure, wall ties and insulation." },
      { code: "S11", text: "Construct a stretcher bond brick and block cavity wall with return and opening to required tolerances." },
      { code: "B3", text: "Take ownership of the quality and completion of work." },
    ],
  }]);

  assert.match(reports.activityObserved, /^I observed William /);
  assert.match(reports.activityObserved, /William constructed/);
  assert.doesNotMatch(reports.activityObserved, /\bK22\b|\bS11\b|\bB3\b/);
  assert.match(reports.questionsAndAnswers, /^I asked William to explain cavity wall construction/i);
  assert.doesNotMatch(reports.questionsAndAnswers, /\bK22\b/);
  assert.match(reports.qualityNotes, /William/);
});

test("final prose module is loaded last for observations and cached offline", () => {
  const natural = index.indexOf("milos-natural-narrative-v27.js?v=2.7");
  const prose = index.indexOf("milos-observation-prose-v27.js?v=2.7");
  assert.ok(natural > 0 && prose > natural);
  assert.match(sw, /milos-observation-prose-v27\.js/);
});
