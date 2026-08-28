import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/milos-full-criteria-prompts-v243.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../assets/milos-full-criteria-prompts-v243.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("2.43 parses exact KSB wording and labels knowledge, skill and behaviour clearly", () => {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);

  const items = sandbox.MilosFullCriteriaPrompts.parseKsbCriteriaText(
    "K1: Explain the relevant regulations | S4: Set out and build the masonry accurately | B2: Work reliably with others"
  );

  assert.deepEqual(JSON.parse(JSON.stringify(items)), [
    { code: "K1", description: "Explain the relevant regulations", type: "Knowledge · theory" },
    { code: "S4", description: "Set out and build the masonry accurately", type: "Skill · practical" },
    { code: "B2", description: "Work reliably with others", type: "Behaviour" },
  ]);
  assert.equal(sandbox.MilosFullCriteriaPrompts.exactNvqWording, true);
  assert.equal(sandbox.MilosFullCriteriaPrompts.exactKsbWording, true);
});

test("2.43 removes the old two-line visual clamp and keeps long criteria readable on phone", () => {
  assert.match(css, /mve-full-ac-head strong\{display:block;-webkit-line-clamp:unset/);
  assert.match(css, /max-height:34dvh;overflow-y:auto/);
  assert.match(css, /\.mvo-ac-head \.ksbv-question\{display:block;max-width:100%;overflow:visible/);
});

test("2.43 full-criteria layer remains loaded and cached in Milos 2.45 after the unified video evidence engine", () => {
  const engine = index.indexOf("milos-video-evidence-v231.js");
  const prompts = index.indexOf("milos-full-criteria-prompts-v243.js");
  assert.ok(engine >= 0 && prompts > engine);
  assert.match(index, /milos-full-criteria-prompts-v243\.css\?v=2\.45/);
  assert.match(index, /milos-full-criteria-prompts-v243\.js\?v=2\.45/);
  assert.match(index, /milos-app-version" content="2\.45"/);
  assert.match(sw, /milos-assessor-shell-v2\.45/);
  assert.match(sw, /milos-full-criteria-prompts-v243\.js/);
  assert.match(sw, /milos-full-criteria-prompts-v243\.css/);
});
