import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const updater=readFileSync(new URL('../assets/milos-updater-v236.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('current Milos release uses the lightweight updater',()=>{
  assert.match(index,/milos-updater-v236\.js\?v=\d+\.\d+/);
  assert.match(updater,/Milos \$\{item\.version\} available/);
  assert.match(updater,/update\.json\?check=/);
  assert.doesNotMatch(updater,/milos-update-layer|waitCache|Preparing the new offline copy/);
});

test('installed shell remains stable except during an explicit update handover',()=>{
  assert.match(sw,/const CACHE_NAME = "milos-assessor-shell-v\d+\.\d+"/);
  assert.match(sw,/const cached = \(await cache\.match\("\.\/index\.html"\)\)/);
  assert.match(sw,/async function refreshIndex\(cache\)/);
  assert.match(sw,/url\.searchParams\.has\("milos_update"\)/);
});

test('updater waits for the new worker then opens a cache-busting update route',()=>{
  assert.match(updater,/serviceWorker\.register\('\.\/sw\.js'/);
  assert.match(updater,/waitForUpdateWorker/);
  assert.match(updater,/SKIP_WAITING/);
  assert.match(updater,/controllerchange/);
  assert.match(updater,/location\.replace\(`\.\/\?milos_update=/);
});

test('new service worker refreshes index on activation before claiming clients',()=>{
  const activate=sw.match(/self\.addEventListener\("activate"[\s\S]*?\n\}\);/)?.[0]||'';
  assert.match(activate,/await refreshIndex\(cache\)/);
  assert.match(activate,/await self\.clients\.claim\(\)/);
  assert.ok(activate.indexOf('refreshIndex') < activate.indexOf('clients.claim'));
});

test('version-check index requests bypass the cached shell',()=>{
  assert.match(sw,/searchParams\.has\("check"\)/);
  assert.match(sw,/fetch\(request, \{ cache: "no-store" \}\)/);
});
