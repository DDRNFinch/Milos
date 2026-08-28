import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const js = fs.readFileSync("assets/milos-square-evidence-v244.js", "utf8");
const css = fs.readFileSync("assets/milos-square-evidence-v244.css", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

test("2.44 requests and verifies a true square camera stream", () => {
  assert.match(js, /const SQUARE_SIZE = 720/);
  assert.match(js, /aspectRatio: \{ ideal: 1 \}/);
  assert.match(js, /aspectRatio: \{ exact: 1 \}/);
  assert.match(js, /squareSettings\(track\)/);
  assert.match(js, /could not provide Milos's 1:1 evidence frame/);
});

test("2.44 lowers bitrate only for the square evidence stream", () => {
  assert.match(js, /const SQUARE_VIDEO_BITS = 1100000/);
  assert.match(js, /square && options/);
  assert.match(js, /videoBitsPerSecond: SQUARE_VIDEO_BITS/);
});

test("recording preview shows the whole 1:1 frame", () => {
  assert.match(css, /aspect-ratio:1\/1!important/);
  assert.match(css, /object-fit:contain!important/);
  assert.match(css, /720px/);
});

test("desktop evidence viewer fits video beside a fixed criteria rail", () => {
  assert.match(js, /milosEvidenceDesktopV244/);
  assert.match(js, /grid-template-columns:minmax\(0,1fr\) minmax\(340px,420px\)/);
  assert.match(js, /object-fit:contain/);
  assert.match(js, /criteriaList\{flex:1 1 auto;min-height:0;max-height:none;overflow:auto\}/);
});

test("2.44 assets are loaded and cached", () => {
  assert.match(index, /milos-square-evidence-v244\.css/);
  assert.match(index, /milos-square-evidence-v244\.js/);
  assert.match(sw, /milos-square-evidence-v244\.css/);
  assert.match(sw, /milos-square-evidence-v244\.js/);
});
