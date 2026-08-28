import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-manual-evia-v254.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('2.54 exposes manual Evia entry anywhere the normal scan button is shown',()=>{
  assert.match(js,/\[data-action="scan-profile"\]\[data-id\]/);
  assert.match(js,/dataset\.action='manual-evia'/);
  assert.match(js,/Enter Evia data manually/);
  assert.match(js,/Edit Evia data/);
});

test('manual Evia entry uses the same progress import pipeline as a QR scan',()=>{
  assert.match(js,/C\.attachProgress\(state\.profileId,raw\)/);
  assert.match(js,/manualEntry=true/);
  assert.match(js,/manualEditedAt=Date\.now\(\)/);
});

test('manual editor covers every normal core Evia progress field',()=>{
  for(const name of ['courseRouteId','sharedId','startDate','endDate','learningHours','learningTarget','completedCodes','changedCodes','targets','evidenceCount','lastReviewAt','exportedAt']){
    assert.match(js,new RegExp(`name=["']${name}["']|['"]${name}['"]`),`${name} should be editable`);
  }
});

test('manual editor covers every Coach field Milos receives from Evia',()=>{
  for(const name of ['periodId','periodStart','periodEnd','periodDays','usageSessions','usageDays','usageWeeks','usageCount','usageLearning','usageTargets','usageLast','criteriaBaseline','criteriaCurrent','criteriaNew','evTotal','evPhotos','evVideos','evAudio','evWritten','evWitness','evAssessor','periodLearningHours','periodLearningEntries','periodLearningKind','mcqAttempts','mcqBest','mcqLatest','discussionAttempts','discussionBest','discussionLatest','practicalAttempts','practicalBest','mathsAttempts','mathsScore','englishAttempts','englishScore','targetsDone','targetsOpen','targetsOverdue','targetsTotal','confidenceBaseline','confidenceCurrent','confidenceCount','confidenceLow','wellbeingCount','wellbeingSequence']){
    assert.match(js,new RegExp(name),`${name} should be editable`);
  }
});

test('manual editor covers every Symi attendance field carried inside Evia',()=>{
  for(const name of ['attendanceExact','attendancePercent','attendanceBaseline','attendanceSince','attendanceMinutes','attendanceExpected','attendanceSessions','attendanceDate']){
    assert.match(js,new RegExp(name),`${name} should be editable`);
  }
});

test('manual Evia tool loads after the app and remains available offline',()=>{
  const app=index.indexOf('milos-app.js');
  const manual=index.indexOf('milos-manual-evia-v254.js');
  assert.ok(app>=0&&manual>app);
  assert.match(index,/milos-manual-evia-v254\.js\?v=2\.54/);
  assert.match(sw,/milos-manual-evia-v254\.js/);
});
