import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const share = readFileSync(new URL('../assets/milos-evia-v2.js', import.meta.url), 'utf8');
const deadlines = readFileSync(new URL('../assets/milos-review-deadlines-v215.js', import.meta.url), 'utf8');
const dates = readFileSync(new URL('../assets/milos-uk-dates-v215.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));
const version=String(manifest.version).replaceAll('.', '\\.');

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

test('numeric UK date display helper and current review shell are loaded', () => {
  assert.match(dates, /\$\{d\}\/\$\{m\}\/\$\{y\}/);
  assert.match(index, new RegExp(`milos-app-version\\" content=\\"${version}`));
  assert.match(index, new RegExp(`milos-review-deadlines-v215\\.js\\?v=${version}`));
  assert.match(index, new RegExp(`milos-uk-dates-v215\\.js\\?v=${version}`));
});
