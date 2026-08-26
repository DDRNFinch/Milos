import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const qr=readFileSync(new URL('../assets/milos-coach-qr-v222.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const update=JSON.parse(readFileSync(new URL('../update.json',import.meta.url),'utf8'));
const version=String(update.version),escaped=version.replaceAll('.', '\\.');

test('Milos Coach recognises multipart Evia progress frames',()=>{
  assert.match(qr,/NISI:EVIA:PROGRESS:2:/);
  assert.match(qr,/receiveCoachFrame/);
  assert.match(qr,/parts:new Map/);
  assert.match(qr,/NISI:EVIA:PROGRESS:1:/);
});

test('Milos only forwards a progress payload after every part is collected',()=>{
  assert.match(qr,/count<total/);
  assert.match(qr,/Array\.from\(\{length:total\}/);
  assert.match(qr,/onResult\(frame\.raw\)/);
  assert.match(qr,/keep the camera pointed at Evia/);
});

test('legacy single Evia progress QRs remain supported',()=>{
  assert.match(qr,/legacy:true/);
  assert.match(qr,/originalStartCamera\.call/);
  assert.match(qr,/onResult\(frame\.raw\)/);
});

test('current Milos release loads and caches the multipart receiver before the app',()=>{
  const receiver=index.search(new RegExp(`milos-coach-qr-v222\\.js\\?v=${escaped}`));
  const app=index.search(new RegExp(`milos-app\\.js\\?v=${escaped}`));
  assert.ok(receiver>0&&app>receiver);
  assert.match(sw,/assets\/milos-coach-qr-v222\.js/);
});
