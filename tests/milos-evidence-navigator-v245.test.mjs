import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("2.45 evidence navigator source remains available for regression reference", () => {
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

test("2.45 navigator source documents the sticky mobile layout that is now retired from the live viewer", () => {
  const source = read("assets/milos-evidence-navigator-v245.js");
  assert.match(source, /\.videoCol\{position:sticky;top:0/);
  assert.match(source, /\.mve-section-list/);
  assert.match(source, /height:min\(42dvh,62vw\)/);
});

test("2.45 recording layout remains video then AC then competence and next AC", () => {
  const css = read("assets/milos-video-layout-v245.css");
  assert.match(css, /\.mvo-ac-video\{[\s\S]*order:1/);
  assert.match(css, /\.mvo-ac-head\{[\s\S]*order:2/);
  assert.match(css, /\.mvo-ac-controls\{[\s\S]*order:3/);
  assert.match(css, /height:min\(52dvh,100vw\)/);
  assert.match(css, /\.mvo-next-ac/);
});

test("current shell retires only the broken evidence navigator while keeping the working timestamp viewer and recording layout", () => {
  const index = read("index.html");
  const sw = read("sw.js");
  const player = index.indexOf("milos-evidence-player-v241.js");
  const navigator = index.indexOf("milos-evidence-navigator-v245.js");
  const square = index.indexOf("milos-square-evidence-v244.js");
  const timeline = index.indexOf("milos-evidence-timeline-v242.js");
  assert.ok(player >= 0 && square > player && timeline > square);
  assert.equal(navigator, -1);
  assert.doesNotMatch(index, /milos-evidence-navigator-v245\.js\?v=/);
  assert.match(index, /milos-evidence-timeline-v242\.js\?v=\d+\.\d+/);
  assert.match(index, /milos-video-layout-v245\.css\?v=\d+\.\d+/);
  assert.doesNotMatch(sw, /milos-evidence-navigator-v245\.js/);
  assert.match(sw, /milos-evidence-timeline-v242\.js/);
  assert.match(sw, /milos-video-layout-v245\.css/);
});
