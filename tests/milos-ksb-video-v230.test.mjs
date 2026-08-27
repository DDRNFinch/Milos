import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js=readFileSync(new URL('../assets/milos-ksb-video-v230.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const brick=readFileSync(new URL('../course-packs/Bricklayer_ST0095_v1.2.nisi',import.meta.url),'utf8');
const carp=readFileSync(new URL('../course-packs/Carpentry_Joinery_ST0264_v1.4.nisi',import.meta.url),'utf8');

test('Milos 2.30 loads KSB video observations before the NVQ video handler',()=>{
  assert.match(index,/milos-ksb-video-v230\.js\?v=2\.30/);
  assert.match(index,/milos-ksb-video-v230\.css\?v=2\.30/);
  assert.ok(index.indexOf('milos-ksb-video-v230.js')<index.indexOf('milos-video-observation-v226.js'));
  assert.match(sw,/milos-ksb-video-v230\.js/);
  assert.match(sw,/milos-ksb-video-v230\.css/);
});

test('KSB observations use apprenticeship siteData jobs as practical sub-categories',()=>{
  assert.match(js,/courseType==='apprenticeship'/);
  assert.match(js,/course\?\.siteData/);
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

test('KSB videos retain full-screen recording competence decisions and mapped KSB codes',()=>{
  assert.match(js,/mvo-ac-screen/);
  assert.match(js,/competent:\{symbol:'●'/);
  assert.match(js,/action:\{symbol:'◐'/);
  assert.match(js,/further:\{symbol:'○'/);
  assert.match(js,/codes:\[\.\.\.\(opp\.codes\|\|\[\]\)\]/);
  assert.match(js,/coverageLabel:'KSB'/);
  assert.match(js,/ksbVideoObservationV1:true/);
});

test('KSB video observation supports witness mode QR return signed PDF and complete ZIP',()=>{
  assert.match(js,/Witness video testimony/);
  assert.match(js,/Q\.observationPayload/);
  assert.match(js,/KSB Video Observation/);
  assert.match(js,/B\.makeZip\(entries\)/);
  assert.match(js,/Assessor signature is required/);
  assert.match(js,/Learner signature is required/);
});
