import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const js = fs.readFileSync(new URL("../assets/milos-observation-outcomes-v247.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../assets/milos-observation-outcomes-v247.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("2.47 reduces live video decisions to Competent and More required", () => {
  assert.match(js, /data-mve-status=\"action\"/);
  assert.match(js, /More required/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /data-mve-status=\"action\"/);
  assert.match(css, /button>span/);
});

test("2.47 drafts editable feedback after More required", () => {
  assert.match(js, /Future observation/);
  assert.match(js, /Learner evidence/);
  assert.match(js, /needs a little more evidence/);
  assert.match(js, /record\.feedback = record\.actions/);
});

test("2.47 PDF keeps mapped criteria compact and feedback explicit", () => {
  assert.match(js, /Additional mapped criteria/);
  assert.match(js, /compactMappedCode/);
  assert.doesNotMatch(js, /mappedCode\} \(from/);
  assert.match(js, /Feedback \/ more required/);
});

test("2.47 outcome layer remains loaded after the video engine and cached offline", () => {
  const video = index.indexOf("milos-video-evidence-v231.js");
  const outcome = index.indexOf("milos-observation-outcomes-v247.js");
  assert.ok(video >= 0 && outcome > video);
  assert.match(index, /milos-observation-outcomes-v247\.css\?v=\d+\.\d+/);
  assert.match(index, /milos-observation-outcomes-v247\.js\?v=\d+\.\d+/);
  assert.match(index, /milos-app-version\" content=\"\d+\.\d+\"/);
  assert.match(sw, /milos-assessor-shell-v\d+\.\d+/);
  assert.match(sw, /milos-observation-outcomes-v247\.css/);
  assert.match(sw, /milos-observation-outcomes-v247\.js/);
});
