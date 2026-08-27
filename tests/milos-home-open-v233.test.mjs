import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js=readFileSync(new URL('../assets/milos-home-open-v233.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Milos home tap hotfix loads after the normal UI handler and is cached offline',()=>{
  assert.match(index,/milos-home-open-v233\.js\?v=2\.32/);
  assert.ok(index.indexOf('milos-home-open-v233.js')>index.indexOf('milos-standard-ui-v229.js'));
  assert.match(sw,/milos-home-open-v233\.js/);
});

test('a swallowed face tap is replayed through the existing avatar action',()=>{
  assert.match(js,/\.milos-anchor\[data-action=/);
  assert.match(js,/const wasOpen = root\.classList\.contains\("is-open"\)/);
  assert.match(js,/if \(isOpen === wasOpen\) replayAvatarAction\(\)/);
  assert.match(js,/proxy\.dataset\.action = "avatar"/);
  assert.match(js,/proxy\.click\(\)/);
});
