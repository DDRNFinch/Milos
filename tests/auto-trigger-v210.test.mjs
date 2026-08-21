import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const trigger = fs.readFileSync(new URL("../assets/milos-auto-trigger-v210.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("mobile trigger is loaded before the single automatic writer", () => {
  const triggerPos = index.indexOf("milos-auto-trigger-v210.js");
  const writerPos = index.indexOf("milos-auto-v29.js");
  assert.ok(triggerPos >= 0);
  assert.ok(writerPos > triggerPos);
});

test("mobile trigger uses pointer/touch taps and suppresses duplicate physical clicks", () => {
  assert.match(trigger, /pointerup/);
  assert.match(trigger, /touchend/);
  assert.match(trigger, /stopImmediatePropagation/);
  assert.match(trigger, /event\.isTrusted/);
  assert.match(trigger, /TAP_TARGET = 7/);
  assert.match(trigger, /dispatchEvent\(new MouseEvent\("click"/);
});
