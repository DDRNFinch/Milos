import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const startup=readFileSync(new URL('../assets/milos-startup-repair-v235.js',import.meta.url),'utf8');
const legacy=readFileSync(new URL('../assets/milos-home-repair-v234.js',import.meta.url),'utf8');
const standard=readFileSync(new URL('../assets/milos-standard-ui-v229.js',import.meta.url),'utf8');
const current=readFileSync(new URL('../assets/milos-ui-current-v219.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../assets/milos-app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('current Milos release repairs legacy onboarding before the normal app creates menu state',()=>{
  assert.match(index,/milos-startup-repair-v235\.js\?v=\d+\.\d+/);
  assert.ok(index.indexOf('milos-startup-repair-v235.js')<index.indexOf('milos-app.js'));
  assert.match(sw,/milos-startup-repair-v235\.js/);
  assert.match(startup,/C\.saveSettings\(\{ onboardingComplete: true \}\)/);
});

test('avatar uses one native click route with no synthetic pointer-to-click shim',()=>{
  assert.match(app,/app\.addEventListener\("click", handleClick\)/);
  assert.match(app,/action === "avatar"/);
  assert.doesNotMatch(startup,/pointerdown|touchstart|target\.click\(/);
  assert.doesNotMatch(legacy,/pointerdown|touchstart|target\.click\(/);
});

test('home and current UI patches do not observe and rewrite the live Milos DOM',()=>{
  assert.doesNotMatch(standard,/MutationObserver/);
  assert.doesNotMatch(current,/MutationObserver/);
  assert.match(standard,/observer:false/);
  assert.match(current,/observer:false/);
});

test('legacy 2.34 repair remains safe for cached clients',()=>{
  assert.match(legacy,/repairLegacyOnboarding/);
  assert.match(legacy,/2\.34-safe/);
  assert.doesNotMatch(legacy,/MutationObserver/);
});
