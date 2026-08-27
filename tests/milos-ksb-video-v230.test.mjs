import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js=readFileSync(new URL('../assets/milos-video-evidence-v231.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const brick=readFileSync(new URL('../course-packs/Bricklayer_ST0095_v1.2.nisi',import.meta.url),'utf8');
const carp=readFileSync(new URL('../course-packs/Carpentry_Joinery_ST0264_v1.4.nisi',import.meta.url),'utf8');

test('Milos 2.37 uses the unified engine for KSB and NVQ video evidence',()=>{
  assert.match(index,/milos-video-evidence-v231\.js\?v=2\.37/);
  assert.match(sw,/milos-video-evidence-v231\.js/);
  assert.match(js,/courseType = isKsb\(profile\) \? "ksb" : "nvq"/);
});

test('KSB observations use apprenticeship siteData jobs as practical sub-categories',()=>{
  assert.match(js,/course\.siteData/);
  assert.match(js,/category\.jobs/);
  assert.match(js,/job\.opps/);
  assert.match(js,/Choose observation area/);
  assert.match(js,/KSB course · choose the practical sub-category/);
});

test('current course packs expose real practical sub-categories',()=>{
  assert.match(brick,/Building a cavity wall/);
  assert.match(carp,/Install a trussed roof/);
  assert.match(carp,/siteData/);
});

test('KSB recording maps course codes but moves written action until after capture',()=>{
  assert.match(js,/renderKsbRecording/);
  assert.match(js,/\(opp\.codes \|\| \[\]\)\.join/);
  assert.match(js,/data-mve-status="competent"/);
  assert.match(js,/data-mve-field="clipAction"/);
  assert.doesNotMatch(js,/data-ksbv-field="currentAction"/);
});

test('witness mode does not demand another learner signature and can link to main observation',()=>{
  assert.match(js,/A separate learner signature is not required for standalone witness testimony/);
  assert.match(js,/Assessor and learner signatures are already held on the main observation/);
  assert.match(js,/completeLinkedWitness/);
  assert.match(js,/witnessEvidence/);
  assert.match(js,/combinedMedia/);
});

test('KSB witness and observation videos export through one complete evidence ZIP',()=>{
  assert.match(js,/Download complete evidence ZIP/);
  assert.match(js,/B\.makeZip\(entries\)/);
  assert.match(js,/media: combinedMedia/);
  assert.match(js,/professional PDF/i);
});
