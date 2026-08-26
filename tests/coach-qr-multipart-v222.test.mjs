import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const coach=readFileSync(new URL('../assets/milos-coach-v222.js',import.meta.url),'utf8');

test('Milos Coach recognises multipart Evia progress frames',()=>{
  assert.match(coach,/NISI:EVIA:PROGRESS:2:/);
  assert.match(coach,/receiveCoachFrame/);
  assert.match(coach,/parts/);
  assert.match(coach,/NISI:EVIA:PROGRESS:1:/);
});

test('Milos only forwards a progress payload after every part is collected',()=>{
  assert.match(coach,/count<total/);
  assert.match(coach,/Array\.from\(\{length:total\}/);
  assert.match(coach,/onResult\(full\)/);
});

test('legacy single Evia progress QRs remain supported',()=>{
  assert.match(coach,/return originalStartCamera\.call/);
  assert.match(coach,/onResult\(raw\)/);
});
