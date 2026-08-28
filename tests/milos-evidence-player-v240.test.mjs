import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../assets/milos-evidence-player-v240.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("2.40 evidence ZIP includes a portable offline player", () => {
  assert.match(source, /00_OPEN_EVIDENCE\.html/);
  assert.match(source, /extract the complete ZIP/i);
  assert.match(source, /Go to timestamp/);
  assert.match(source, /type="range"/);
  assert.match(source, /player\.currentTime/);
  assert.match(source, /Choose a video manually/);
  assert.match(source, /URL\.createObjectURL/);
});

test("player wrapper preserves the 2.39 cross-platform ZIP path", () => {
  assert.match(source, /const prior = global\.MilosObservationBundle/);
  assert.match(source, /return prior\.makeZip\(list\)/);
  assert.match(source, /portableEvidencePlayer: true/);
});

test("2.40 loads the evidence player after compatibility ZIP handling", () => {
  const compat = index.indexOf("milos-evidence-compat-v239.js");
  const player = index.indexOf("milos-evidence-player-v240.js");
  const exporter = index.indexOf("milos-observation-export-v225.js");
  assert.ok(compat >= 0 && player > compat && exporter > player);
  assert.match(index, /milos-app-version" content="2\.40"/);
});
