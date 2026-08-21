import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const trigger = fs.readFileSync(new URL("../assets/milos-auto-trigger-v211.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("2.11 mobile trigger is loaded before the automatic writer", () => {
  const triggerPos = index.indexOf("milos-auto-trigger-v211.js");
  const writerPos = index.indexOf("milos-auto-v29.js");
  assert.ok(triggerPos >= 0);
  assert.ok(writerPos > triggerPos);
  assert.match(index, /milos-app-version" content="2\.11"/);
});

test("guidance M resolves the form it is actually inside", () => {
  assert.match(trigger, /FORM_SELECTOR = 'form\[data-form="observation-record"\], form\[data-form\^="review-"\]'/);
  assert.match(trigger, /mark\.closest\(FORM_SELECTOR\)/);
  assert.doesNotMatch(trigger, /page\.querySelector\('form\[data-form="observation-record"\]'/);
});

test("mobile trigger counts seven real taps and fills directly", () => {
  assert.match(trigger, /MARK_SELECTOR = "\.milos-guidance > span"/);
  assert.match(trigger, /event\.target\.closest\(MARK_SELECTOR\)/);
  assert.match(trigger, /pointerup/);
  assert.match(trigger, /touchend/);
  assert.match(trigger, /stopImmediatePropagation/);
  assert.match(trigger, /event\.isTrusted/);
  assert.match(trigger, /TAP_TARGET = 7/);
  assert.match(trigger, /global\.MilosAutomaticMode/);
  assert.match(trigger, /A\.buildObservation/);
  assert.match(trigger, /A\.buildReview/);
  assert.doesNotMatch(trigger, /dispatchEvent\(new MouseEvent\("click"/);
});
