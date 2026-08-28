import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../assets/milos-recorder-recovery-v256.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('unexpected observation recorder stops keep the judgement controls recoverable',()=>{
  assert.match(js,/meta\.unexpected=true/);
  assert.match(js,/meta\.pretend=true/);
  assert.match(js,/if\(meta\.evidence&&meta\.unexpected&&meta\.pretend&&actual==='inactive'\)return'recording'/);
  assert.match(js,/\[data-mve-status\]/);
  assert.match(js,/\[data-mve-action=\"next-ac\"\]/);
  assert.match(js,/\[data-mve-action=\"finish-lo-here\"\]/);
  assert.match(js,/\[data-mve-action=\"finish-opp\"\]/);
});

test('already-stopped native media can still be finalised from the existing Milos clip buffer',()=>{
  assert.match(js,/if\(meta\.evidence&&meta\.unexpected&&target\.state==='inactive'\)return;/);
  assert.match(js,/target\.dispatchEvent\(new Event\('stop'\)\)/);
  assert.match(js,/meta\.stopRequested=true/);
  assert.match(js,/CLIP HELD/);
  assert.match(js,/Your recorded clip is still held/);
});

test('a final AC that already has a judgement saves automatically if the device stops the recorder',()=>{
  assert.match(js,/const selected=layer\.querySelector\('\[data-mve-status\]\.is-selected'\)/);
  assert.match(js,/\^Finish\\b/i);
  assert.match(js,/finalNvq\.click\(\)/);
  assert.match(js,/finalKsb\.click\(\)/);
  assert.match(js,/intro\.click\(\)/);
});

test('recorder recovery loads before the unified video engine and is cached offline',()=>{
  const recovery=index.indexOf('milos-recorder-recovery-v256.js');
  const video=index.indexOf('milos-video-evidence-v231.js');
  assert.ok(recovery>=0&&video>recovery);
  assert.match(index,/milos-recorder-recovery-v256\.js\?v=\d+\.\d+/);
  assert.match(sw,/milos-recorder-recovery-v256\.js/);
});
