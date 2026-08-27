import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const updater=readFileSync(new URL('../assets/milos-updater-v235.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Milos 2.35 uses the current updater and announces installed releases',()=>{
  assert.match(index,/milos-updater-v235\.js\?v=2\.35/);
  assert.match(updater,/Milos updated · \$\{CURRENT\}/);
  assert.match(updater,/Update available · \$\{item\.version\}/);
  assert.match(updater,/update\.json\?check=/);
});

test('installed shell remains version-stable between explicit updates',()=>{
  assert.match(sw,/const CACHE_NAME = "milos-assessor-shell-v2\.35"/);
  assert.match(sw,/const cached = \(await cache\.match\("\.\/index\.html"\)\)/);
  assert.doesNotMatch(sw,/await cache\.put\("\.\/index\.html", response\.clone\(\)\)/);
});

test('updater waits for the new worker to control the page before reopening',()=>{
  assert.match(updater,/serviceWorker\.register\(`\.\/sw\.js\?v=/);
  assert.match(updater,/milos-assessor-shell-v\$\{version\}/);
  assert.match(updater,/waitCache/);
  assert.match(updater,/waitControllerChange/);
  assert.match(updater,/controllerchange/);
  assert.match(updater,/location\.replace/);
});

test('version-check index requests bypass the cached shell',()=>{
  assert.match(sw,/searchParams\.has\("check"\)/);
  assert.match(sw,/fetch\(request, \{ cache: "no-store" \}\)/);
});
