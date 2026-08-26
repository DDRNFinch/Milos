import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const coach=readFileSync(new URL('../assets/milos-coach-v222.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('Milos sanitises and stores the Evia Coach Snapshot without importing identity',()=>{
  assert.match(coach,/sanitiseCoach/);
  assert.match(coach,/attachProgress/);
  assert.match(coach,/xs\[0\]\.coach=coach/);
  assert.doesNotMatch(coach,/raw\.(name|email|phone|address|postcode|dob|signature)/i);
});

test('Milos Coach creates factual review draft fields from Evia data',()=>{
  assert.match(coach,/previousActions:/);
  assert.match(coach,/trainingEvidence:/);
  assert.match(coach,/overallProgress:/);
  assert.match(coach,/learningProgress:/);
  assert.match(coach,/qualifications:/);
  assert.match(coach,/review-progress/);
  assert.doesNotMatch(coach,/fillIfEmpty\(form,"trainingPlanChanges"/);
  assert.match(coach,/still require the review discussion/);
});

test('Milos keeps wellbeing as a review prompt rather than an automated judgement',()=>{
  assert.match(coach,/Wellbeing remains a conversation/);
  assert.match(coach,/does not provide a diagnosis/);
  assert.doesNotMatch(coach,/\b(depressed|depression|anxious|anxiety|happy|sad)\b/i);
});

test('Milos 2.22 loads and caches Coach Snapshot support',()=>{
  assert.equal(String(update.version),'2.22');
  assert.match(index,/milos-app-version" content="2\.22/);
  assert.match(index,/milos-coach-v222\.js\?v=2\.22/);
  assert.match(sw,/milos-assessor-shell-v2\.22/);
  assert.match(sw,/assets\/milos-coach-v222\.js/);
});
