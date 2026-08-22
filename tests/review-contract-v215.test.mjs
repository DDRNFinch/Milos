import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const share = readFileSync(new URL('../assets/milos-evia-v2.js', import.meta.url), 'utf8');
const deadlines = readFileSync(new URL('../assets/milos-review-deadlines-v215.js', import.meta.url), 'utf8');
const dates = readFileSync(new URL('../assets/milos-uk-dates-v215.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('review QR has one semantic heading and one progress summary', () => {
  assert.match(share, /summary:'Progress review'/);
  assert.match(share, /overallProgress:data\.summary/);
  assert.doesNotMatch(share, /summary:data\.summary/);
});

test('all returned review targets are due by the next review', () => {
  assert.match(share, /dueDate:nextReviewDate/);
  assert.match(deadlines, /name=\"nextReviewDate\"/);
  assert.match(deadlines, /name=\"targetDue\"/);
});

test('numeric UK date display helper and v2.15 shell are loaded', () => {
  assert.match(dates, /\$\{d\}\/\$\{m\}\/\$\{y\}/);
  assert.match(index, /milos-app-version\" content=\"2\.15\"/);
  assert.match(index, /milos-review-deadlines-v215\.js\?v=2\.15/);
  assert.match(index, /milos-uk-dates-v215\.js\?v=2\.15/);
});
