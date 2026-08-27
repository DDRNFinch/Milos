import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src=readFileSync(new URL('../assets/milos-attendance-v224.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Milos stores Symi attendance from the Evia Coach snapshot',()=>{
  assert.match(src,/raw\?\.co\?\.at/);
  assert.match(src,/collegeAttendance/);
  assert.match(src,/College attendance:/);
});

test('Milos distinguishes exact cumulative attendance from migration baseline',()=>{
  assert.match(src,/at\.x&&at\.p/);
  assert.match(src,/at\.bp!=null&&at\.sp!=null/);
});

test('current Milos release loads and caches attendance support',()=>{
  assert.match(index,/milos-app-version" content="2\.38"/);
  assert.match(index,/milos-attendance-v224\.js/);
  assert.match(sw,/milos-assessor-shell-v2\.38/);
  assert.match(sw,/milos-attendance-v224\.js/);
});
