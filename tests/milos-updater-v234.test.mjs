import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const updater=readFileSync(new URL('../assets/milos-updater-v234.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Milos 2.34 uses the new updater and announces installed releases',()=>{
  assert.match(index,/milos-updater-v234\.js\?v=2\.34/);
  assert.match(updater,/Milos updated · \$\{CURRENT\}/);
  assert.match(updater,/Update available · \$\{item\.version\}/);
  assert.match(updater,/update\.json\?check=/);
});

test('installed shell does not silently replace its HTML with a newer server build',()=>{
  assert.match(sw,/const CACHE_NAME = "milos-assessor-shell-v2\.34"/);
  assert.match(sw,/const cached = \(await cache\.match\("\.\/index\.html"\)\)/);
  assert.doesNotMatch(sw,/await cache\.put\("\.\/index\.html", response\.clone\(\)\)/);
});

test('updater installs the new service worker and waits for its complete offline cache',()=>{
  assert.match(updater,/serviceWorker\.register\(`\.\/sw\.js\?v=/);
  assert.match(updater,/milos-assessor-shell-v\$\{version\}/);
  assert.match(updater,/waitCache/);
});
