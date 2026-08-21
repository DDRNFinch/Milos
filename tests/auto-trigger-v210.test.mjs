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

test("mobile trigger listens to the actual guidance M on pointer and touch input", () => {
  assert.match(trigger, /MARK_SELECTOR = "\\.milos-guidance > span"/);
  assert.match(trigger, /event\.target\.closest\(MARK_SELECTOR\)/);
  assert.match(trigger, /pointerup/);
  assert.match(trigger, /touchend/);
  assert.match(trigger, /stopImmediatePropagation/);
  assert.match(trigger, /event\.isTrusted/);
  assert.match(trigger, /TAP_TARGET = 7/);
  assert.match(trigger, /dispatchEvent\(new MouseEvent\("click"/);
  assert.doesNotMatch(trigger, /closest\(TRIGGER_SELECTOR\)/);
});
