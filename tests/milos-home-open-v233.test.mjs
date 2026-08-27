import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js=readFileSync(new URL('../assets/milos-home-repair-v234.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Milos 2.34 loads the home repair after the normal app and caches it offline',()=>{
  assert.match(index,/milos-home-repair-v234\.js\?v=2\.34/);
  assert.ok(index.indexOf('milos-home-repair-v234.js')>index.indexOf('milos-app.js'));
  assert.match(sw,/milos-home-repair-v234\.js/);
});

test('legacy users are migrated past the hidden onboarding gate',()=>{
  assert.match(js,/onboardingComplete/);
  assert.match(js,/hasExistingWork/);
  assert.match(js,/C\.saveSettings\(\{ onboardingComplete: true \}\)/);
  assert.match(js,/global\.location\.replace/);
});

test('mobile tap directly invokes the existing Milos avatar click action',()=>{
  assert.match(js,/pointerdown/);
  assert.match(js,/touchstart/);
  assert.match(js,/target\.click\(\)/);
  assert.match(js,/touchAction = "manipulation"/);
});
