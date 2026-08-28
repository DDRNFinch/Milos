import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-recorder-recovery-v256.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('historical 2.56 layer kept unexpected recorder stops recoverable',()=>{
  assert.match(js,/meta\.unexpected=true/);
  assert.match(js,/meta\.pretend=true/);
  assert.match(js,/return'recording'/);
  assert.match(js,/CLIP HELD/);
});

test('historical 2.56 layer could finalise an already stopped native recorder',()=>{
  assert.match(js,/target\.dispatchEvent\(new Event\('stop'\)\)/);
  assert.match(js,/meta\.stopRequested=true/);
});

test('2.56 recovery layer is retired from the current runtime after the 2.58 replacement',()=>{
  assert.doesNotMatch(index,/milos-recorder-recovery-v256\.js/);
  assert.doesNotMatch(sw,/milos-recorder-recovery-v256\.js/);
});
