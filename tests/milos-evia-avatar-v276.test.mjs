import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("assets/milos-evia-avatar-v276.css", "utf8");
const js = fs.readFileSync("assets/milos-evia-avatar-v276.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

test("Milos uses current Evia avatar geometry and glow with only yellow changed to blue", () => {
  assert.match(js, /float\.innerHTML/);
  assert.match(js, /class="evia-character" id="milosEviaCharacter"/);
  assert.match(js, /class="evia-body"/);
  assert.match(js, /class="eyes"/);
  assert.equal((js.match(/class="eye"/g) || []).length, 2);

  assert.match(css, /--evia-yellow:\s*#2c85f7/i);
  assert.match(css, /font-size:\s*clamp\(123\.75px, 34\.5vw, 165px\)/);
  assert.match(css, /font-size:\s*clamp\(61\.875px, 17\.25vw, 82\.5px\)/);
  assert.match(css, /border:\s*0\.026em solid var\(--evia-yellow\)/);
  assert.match(css, /width:\s*0\.235em;/);
  assert.match(css, /height:\s*0\.235em;/);
  assert.match(css, /border:\s*0\.022em solid var\(--evia-yellow\)/);
  assert.match(css, /gap:\s*0\.105em;/);

  assert.match(css, /inset:\s*0\.10em/);
  assert.match(css, /radial-gradient\(circle at center, rgba\(44, 133, 247, 0\.22\), rgba\(44, 133, 247, 0\.08\) 46%, rgba\(44, 133, 247, 0\) 76%\)/);
  assert.match(css, /filter:\s*blur\(0\.10em\)/);
  assert.match(css, /transform:\s*scale\(1\.12\)/);
  assert.match(css, /animation:\s*glowPulse 8s ease-in-out infinite/);
  assert.match(css, /drop-shadow\(0 0 0\.038em rgba\(44, 133, 247, 0\.55\)\)/);
  assert.match(css, /drop-shadow\(0 0 0\.105em rgba\(44, 133, 247, 0\.28\)\)/);
  assert.match(css, /drop-shadow\(0 0 0\.22em rgba\(44, 133, 247, 0\.13\)\)/);

  assert.match(css, /top:\s*calc\(50% \+ clamp\(88px, 24vw, 108px\)\)/);
});

test("Milos mirrors current Evia idle, blink, gaze, glow and accent movement exactly", () => {
  assert.match(js, /x:\s*-0\.038/);
  assert.match(js, /x:\s*0\.038/);
  assert.match(js, /y:\s*-0\.029/);
  assert.match(js, /y:\s*0\.029/);
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

  assert.match(css, /@keyframes stageFloat[\s\S]*50% \{ transform: translateY\(-8px\); \}/);
  assert.match(css, /@keyframes glowPulse[\s\S]*scale\(1\.08\); opacity: 0\.8[\s\S]*scale\(1\.16\); opacity: 1/);
  assert.match(css, /@keyframes bodyDrift[\s\S]*rotate\(-0\.6deg\) scale\(1\.005, 0\.995\)/);
  assert.match(css, /@keyframes talkingFloat[\s\S]*translateY\(-5px\) scale\(1\.012\)/);
  assert.match(css, /@keyframes talkingTilt[\s\S]*- 1\.8deg/);
  assert.match(css, /@keyframes accentWobble/);
  assert.match(css, /@keyframes accentSquish/);
  assert.match(css, /@keyframes accentLean/);
});

test("the exact-avatar files are cache-busted without changing the Milos app release", () => {
  assert.match(index, /milos-app-version" content="2\.79"/);
  assert.match(index, /milos-evia-avatar-v276\.css\?v=2\.79-evia-exact/);
  assert.match(index, /milos-evia-avatar-v276\.js\?v=2\.79-evia-exact/);
  assert.match(sw, /milos-assessor-shell-v2\.79/);
  assert.match(sw, /milos-evia-avatar-v276\.css/);
  assert.match(sw, /milos-evia-avatar-v276\.js/);
});
