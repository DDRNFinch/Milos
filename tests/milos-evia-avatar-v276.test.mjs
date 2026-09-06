import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("assets/milos-evia-avatar-v276.css", "utf8");
const js = fs.readFileSync("assets/milos-evia-avatar-v276.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

test("Milos uses current Evia avatar geometry in Milos blue", () => {
  assert.match(css, /font-size:\s*clamp\(123\.75px, 34\.5vw, 165px\)/);
  assert.match(css, /font-size:\s*clamp\(61\.875px, 17\.25vw, 82\.5px\)/);
  assert.match(css, /border:\s*0\.026em solid var\(--milos-avatar-blue\)/);
  assert.match(css, /width:\s*0\.235em;/);
  assert.match(css, /gap:\s*0\.105em;/);
  assert.match(css, /#2c85f7/i);
});

test("Milos uses Evia gaze and blink timings", () => {
  assert.match(js, /x:\s*-0\.038/);
  assert.match(js, /2800 \+ Math\.random\(\) \* 2200/);
  assert.match(js, /3200 \+ Math\.random\(\) \* 2600/);
  assert.match(js, /Math\.random\(\) < 0\.22/);
  assert.match(js, /130/);
  assert.match(js, /110/);
});

test("avatar parity files are production-loaded and cached", () => {
  assert.match(index, /milos-evia-avatar-v276\.css\?v=2\.76/);
  assert.match(index, /milos-evia-avatar-v276\.js\?v=2\.76/);
  assert.match(sw, /milos-evia-avatar-v276\.css/);
  assert.match(sw, /milos-evia-avatar-v276\.js/);
});
