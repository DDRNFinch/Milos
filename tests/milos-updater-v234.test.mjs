import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const updater=readFileSync(new URL('../assets/milos-updater-v236.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Milos 2.40 uses the lightweight updater',()=>{
  assert.match(index,/milos-updater-v236\.js\?v=2\.40/);
  assert.match(updater,/Milos \$\{item\.version\} available/);
  assert.match(updater,/update\.json\?check=/);
  assert.doesNotMatch(updater,/milos-update-layer|waitCache|Preparing the new offline copy/);
});

test('installed shell remains version-stable between explicit updates',()=>{
  assert.match(sw,/const CACHE_NAME = "milos-assessor-shell-v2\.40"/);
  assert.match(sw,/const cached = \(await cache\.match\("\.\/index\.html"\)\)/);
  assert.doesNotMatch(sw,/await cache\.put\("\.\/index\.html", response\.clone\(\)\)/);
});

test('updater waits for worker readiness then reloads without a blocking overlay',()=>{
  assert.match(updater,/serviceWorker\.register\('\.\/sw\.js'/);
  assert.match(updater,/SKIP_WAITING/);
  assert.match(updater,/controllerchange/);
  assert.match(updater,/location\.reload/);
  assert.doesNotMatch(updater,/location\.replace/);
});

test('version-check index requests bypass the cached shell',()=>{
  assert.match(sw,/searchParams\.has\("check"\)/);
  assert.match(sw,/fetch\(request, \{ cache: "no-store" \}\)/);
});
