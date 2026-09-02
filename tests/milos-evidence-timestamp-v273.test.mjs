import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../assets/milos-evidence-timestamp-v273.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("2.73 timestamp repair remains available as regression history", () => {
  assert.match(source, /milosEvidenceTimestampRuntimeV273/);
  assert.match(source, /player\.currentTime=Math\.min\(target,player\.duration\)/);
});

test("2.73 timestamp repair stays retired while the proven 2.74 repair remains live", () => {
  assert.doesNotMatch(index, /milos-evidence-timestamp-v273\.js\?v=/);
  assert.doesNotMatch(sw, /milos-evidence-timestamp-v273\.js/);
  assert.match(index, /milos-evidence-timestamp-v274\.js\?v=2\.74/);
  assert.match(index, /milos-app-version" content="2\.75"/);
  assert.match(sw, /milos-assessor-shell-v2\.75/);
  assert.match(sw, /milos-evidence-timestamp-v274\.js/);
});
