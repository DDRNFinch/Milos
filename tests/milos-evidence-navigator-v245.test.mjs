import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("2.45 evidence navigator uses one ZIP and hierarchical recorded sections", () => {
  const source = read("assets/milos-evidence-navigator-v245.js");
  assert.match(source, /Introduction/);
  assert.match(source, /LO"\+lo/);
  assert.match(source, /Witness testimony/);
  assert.match(source, /data-open-section/);
  assert.match(source, /data-open-evidence/);
  assert.match(source, /zipOnlyEvidenceMedia/);
  assert.match(source, /Open evidence ZIP/);
  assert.doesNotMatch(source, /Choose video manually/);
  assert.doesNotMatch(source, /−10 seconds/);
  assert.doesNotMatch(source, /\+10 seconds/);
  assert.doesNotMatch(source, /Go to timestamp/);
});

test("2.45 phone viewer keeps video sticky while LO and AC list scrolls", () => {
  const source = read("assets/milos-evidence-navigator-v245.js");
  assert.match(source, /\.videoCol\{position:sticky;top:0/);
  assert.match(source, /\.mve-section-list/);
  assert.match(source, /height:min\(42dvh,62vw\)/);
});

test("2.45 recording layout is video then AC then competence and next AC", () => {
  const css = read("assets/milos-video-layout-v245.css");
  assert.match(css, /\.mvo-ac-video\{[\s\S]*order:1/);
  assert.match(css, /\.mvo-ac-head\{[\s\S]*order:2/);
  assert.match(css, /\.mvo-ac-controls\{[\s\S]*order:3/);
  assert.match(css, /height:min\(52dvh,100vw\)/);
  assert.match(css, /\.mvo-next-ac/);
});


test("2.45 assets load in wrapper order and stay cached offline", () => {
  const index = read("index.html");
  const sw = read("sw.js");
  const player = index.indexOf("milos-evidence-player-v241.js");
  const navigator = index.indexOf("milos-evidence-navigator-v245.js");
  const square = index.indexOf("milos-square-evidence-v244.js");
  const timeline = index.indexOf("milos-evidence-timeline-v242.js");
  assert.ok(player >= 0 && navigator > player && square > navigator && timeline > square);
  assert.match(index, /milos-evidence-navigator-v245\.js\?v=2\.45/);
  assert.match(index, /milos-video-layout-v245\.css\?v=2\.45/);
  assert.match(sw, /milos-evidence-navigator-v245\.js/);
  assert.match(sw, /milos-video-layout-v245\.css/);
});
