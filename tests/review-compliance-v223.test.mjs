import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engine=readFileSync(new URL('../assets/milos-review-compliance-v223.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/milos-review-compliance-v223.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));

test('review compliance covers every agreed mandatory review element',()=>{
  for(const label of [
    'Previous actions','Training delivered and evidence','Occupational progress','OTJ / GLH progress and slippage',
    'Apprentice contribution','Employer contribution','Support and wellbeing','Training-plan changes',
    'EPA / assessment readiness','Assessor judgement','Agreed dated actions','Next review date','Final review summary','Required signatures'
  ]) assert.ok(engine.includes(label),`${label} is in the completion check`);
  assert.match(engine,/function missing\(includeSignatures=true\)/);
  assert.match(engine,/milos-compliance-panel/);
  assert.match(css,/#completeReviewButton\.is-compliance-locked/);
});

test('employer contribution, readiness, judgement and dated actions are required',()=>{
  assert.match(engine,/patchRequired\(input,"Employer contribution \/ opportunity offered"\)/);
  assert.match(engine,/fieldMarkup\("epaReadiness"/);
  assert.match(engine,/fieldMarkup\("assessorJudgement"/);
  assert.match(engine,/querySelectorAll\('\[name="targetDue"\]'\)/);
  assert.match(engine,/Every agreed action needs a description and due date/);
  assert.match(engine,/Final review summary/);
});

test('complete review is blocked when review content is missing',()=>{
  assert.match(engine,/action==="review-complete"/);
  assert.match(engine,/const outstanding=missing\(false\)/);
  assert.match(engine,/event\.preventDefault\(\);event\.stopImmediatePropagation\(\)/);
  assert.match(engine,/is-compliance-locked/);
});

test('saved review and signed PDF retain compliance evidence',()=>{
  assert.match(engine,/saveReview\(record\)\{return originalSaveReview\(complianceRecord\(record\)\)\}/);
  assert.match(engine,/reviewCompliance:/);
  assert.match(engine,/epaReadiness:/);
  assert.match(engine,/assessorJudgement:/);
  assert.match(engine,/Review compliance record/);
  assert.match(engine,/EPA \/ assessment readiness/);
  assert.match(engine,/Assessor judgement/);
  assert.match(engine,/COMPLETION CHECK/);
});

test('current Milos release loads compliance before the app and caches it offline',()=>{
  const current=String(update.version);
  assert.equal(pkg.version,`${current}.0`);
  assert.ok(index.includes(`milos-app-version" content="${current}`));
  const compliance=index.indexOf(`milos-review-compliance-v223.js?v=${current}`);
  const app=index.indexOf(`milos-app.js?v=${current}`);
  assert.ok(compliance>0&&app>compliance);
  assert.ok(index.includes(`milos-review-compliance-v223.css?v=${current}`));
  assert.ok(sw.includes(`milos-assessor-shell-v${current}`));
  assert.match(sw,/milos-review-compliance-v223\.js/);
  assert.match(sw,/milos-review-compliance-v223\.css/);
  assert.match(pkg.scripts.check,/milos-review-compliance-v223\.js/);
});
