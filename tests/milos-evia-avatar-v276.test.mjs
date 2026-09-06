import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("assets/milos-evia-avatar-v276.css", "utf8");
const js = fs.readFileSync("assets/milos-evia-avatar-v276.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

test("Milos uses the exact current Evia avatar structure in Milos blue", () => {
  assert.match(js, /float\.innerHTML/);
  assert.match(js, /class="evia-character" id="milosEviaCharacter"/);
  assert.match(js, /class="evia-body"/);
  assert.match(js, /class="eyes"/);
  assert.equal((js.match(/class="eye"/g) || []).length, 2);
  assert.match(css, /font-size:\s*clamp\(123\.75px, 34\.5vw, 165px\)/);
  assert.match(css, /font-size:\s*clamp\(61\.875px, 17\.25vw, 82\.5px\)/);
  assert.match(css, /border:\s*0\.026em solid var\(--milos-avatar-blue\)/);
  assert.match(css, /width:\s*0\.32em;/);
  assert.match(css, /height:\s*0\.32em;/);
  assert.match(css, /gap:\s*0\.105em;/);
  assert.match(css, /rgba\(44, 133, 247, 0\.28\)/);
  assert.match(css, /#2c85f7/i);
});

test("Milos mirrors current Evia gaze blink and accent behaviour", () => {
  assert.match(js, /x:\s*-0\.038/);
  assert.match(js, /const accents = \["accent-wobble", "accent-squish", "accent-lean"\]/);
  assert.match(js, /2800 \+ Math\.random\(\) \* 2200/);
  assert.match(js, /3200 \+ Math\.random\(\) \* 2600/);
  assert.match(js, /6200 \+ Math\.random\(\) \* 2600/);
  assert.match(js, /Math\.random\(\) < 0\.22/);
  assert.match(js, /setTimeout\(scheduleLooks, 1800\)/);
  assert.match(js, /setTimeout\(scheduleBlinks, 2200\)/);
  assert.match(js, /setTimeout\(scheduleAccents, 4200\)/);
  assert.match(js, /130/);
  assert.match(js, /110/);
  assert.match(css, /25% \{ transform: rotate\(-0\.6deg\) scale\(1\.005, 0\.995\); \}/);
  assert.match(css, /accentWobble/);
  assert.match(css, /accentSquish/);
  assert.match(css, /accentLean/);
});

test("avatar-only release is production-loaded and cached", () => {
  assert.match(index, /milos-app-version" content="2\.79"/);
  assert.match(index, /milos-evia-avatar-v276\.css\?v=2\.79/);
  assert.match(index, /milos-evia-avatar-v276\.js\?v=2\.79/);
  assert.match(sw, /milos-assessor-shell-v2\.79/);
  assert.match(sw, /milos-evia-avatar-v276\.css/);
  assert.match(sw, /milos-evia-avatar-v276\.js/);
});
