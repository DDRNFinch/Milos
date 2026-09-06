import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("assets/milos-evia-avatar-v276.css", "utf8");
const js = fs.readFileSync("assets/milos-evia-avatar-v276.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

test("Milos uses the visible Evia avatar component with only the hue changed to blue", () => {
  assert.match(js, /float\.innerHTML/);
  assert.match(js, /class="evia-character" id="milosEviaCharacter"/);
  assert.match(js, /class="evia-body"/);
  assert.match(js, /class="eyes"/);
  assert.equal((js.match(/class="eye"/g) || []).length, 2);
  assert.match(js, /exactVisibleEviaPolish:\s*true/);

  assert.match(css, /--evia-yellow:\s*#2c85f7/i);
  assert.match(css, /font-size:\s*clamp\(123\.75px, 34\.5vw, 165px\)/);
  assert.match(css, /font-size:\s*clamp\(61\.875px, 17\.25vw, 82\.5px\)/);

  // These values are the active Evia visible-polish layer, not the smaller base avatar underneath it.
  assert.match(css, /evia-float::before[\s\S]*inset:\s*-0\.58em/i);
  assert.match(css, /evia-float::after[\s\S]*inset:\s*-\.32em/i);
  assert.match(css, /evia-character::before[\s\S]*inset:\s*-\.82em/i);
  assert.match(css, /evia-character::after[\s\S]*inset:\s*-\.28em/i);
  assert.match(css, /filter:\s*blur\(\.10em\)/i);
  assert.match(css, /isolation:\s*isolate/i);

  assert.match(css, /\.evia-body[\s\S]*background:\s*radial-gradient\(circle at 50% 43%/i);
  assert.match(css, /\.evia-body[\s\S]*box-shadow:\s*0 0 \.05em[\s\S]*0 0 \.35em/i);
  assert.match(css, /\.evia-body::before/);
  assert.match(css, /\.evia-body::after/);

  assert.match(css, /\.eyes[\s\S]*width:\s*82%\s*!important/i);
  assert.match(css, /\.eyes[\s\S]*height:\s*46%\s*!important/i);
  assert.match(css, /\.eyes[\s\S]*gap:\s*12%\s*!important/i);
  assert.match(css, /\.eye[\s\S]*width:\s*42%\s*!important/i);
  assert.match(css, /\.eye[\s\S]*aspect-ratio:\s*1/i);
  assert.match(css, /\.eye[\s\S]*border:\s*1\.5px solid/i);

  assert.match(css, /top:\s*calc\(50% \+ clamp\(88px, 24vw, 108px\)\)/);
  assert.doesNotMatch(css, /width:\s*0\.235em/);
  assert.doesNotMatch(css, /inset:\s*0\.10em/);
});

test("Milos mirrors Evia idle blink gaze glow and accent movement", () => {
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

test("Milos 2.80 forces installed apps to receive the corrected avatar", () => {
  assert.match(index, /milos-app-version" content="2\.80"/);
  assert.match(index, /milos-evia-avatar-v276\.css\?v=2\.80-evia-visible-polish/);
  assert.match(index, /milos-evia-avatar-v276\.js\?v=2\.80-evia-visible-polish/);
  assert.match(sw, /milos-assessor-shell-v2\.80/);
  assert.match(sw, /milos-evia-avatar-v276\.css/);
  assert.match(sw, /milos-evia-avatar-v276\.js/);
});
