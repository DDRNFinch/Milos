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
});

test("2.45 recording layout remains video then AC then competence and next AC", () => {
  const css = read("assets/milos-video-layout-v245.css");
  assert.match(css, /\.mvo-ac-video\{[\s\S]*order:1/);
  assert.match(css, /\.mvo-ac-head\{[\s\S]*order:2/);
  assert.match(css, /\.mvo-ac-controls\{[\s\S]*order:3/);
  assert.match(css, /height:min\(52dvh,100vw\)/);
  assert.match(css, /\.mvo-next-ac/);
});

test("current shell keeps the broken 2.45 navigator retired and preserves the timestamp-viewer-timeline export order", () => {
  const index = read("index.html");
  const sw = read("sw.js");
  const player = index.indexOf("milos-evidence-player-v241.js");
  const oldNavigator = index.indexOf("milos-evidence-navigator-v245.js");
  const square = index.indexOf("milos-square-evidence-v244.js");
  const seekRepair = index.indexOf("milos-evidence-timestamp-v274.js");
  const replacement = index.indexOf("milos-evidence-viewer-v272.js");
  const timeline = index.indexOf("milos-evidence-timeline-v242.js");
  assert.ok(player >= 0 && square > player && seekRepair > square && replacement > seekRepair && timeline > replacement);
  assert.equal(oldNavigator, -1);
  assert.doesNotMatch(index, /milos-evidence-navigator-v245\.js\?v=/);
  assert.match(index, /milos-evidence-timestamp-v274\.js\?v=[0-9.]+/);
  assert.match(index, /milos-evidence-viewer-v272\.js\?v=[0-9.]+/);
  assert.match(index, /milos-evidence-timeline-v242\.js\?v=[0-9.]+/);
  assert.match(index, /milos-video-layout-v245\.css\?v=[0-9.]+/);
  assert.doesNotMatch(index, /milos-evidence-timestamp-v273\.js\?v=/);
  assert.doesNotMatch(sw, /milos-evidence-navigator-v245\.js/);
  assert.match(sw, /milos-evidence-timestamp-v274\.js/);
  assert.match(sw, /milos-evidence-viewer-v272\.js/);
  assert.match(sw, /milos-evidence-timeline-v242\.js/);
  assert.doesNotMatch(sw, /milos-evidence-timestamp-v273\.js/);
  assert.match(sw, /milos-video-layout-v245\.css/);
});
