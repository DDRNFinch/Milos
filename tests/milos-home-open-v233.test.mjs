import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js=readFileSync(new URL('../assets/milos-home-open-v233.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Milos home tap hotfix loads after the normal UI handler and is cached offline',()=>{
  assert.match(index,/milos-home-open-v233\.js\?v=2\.33/);
  assert.ok(index.indexOf('milos-home-open-v233.js')>index.indexOf('milos-standard-ui-v229.js'));
  assert.match(sw,/milos-assessor-shell-v2\.33/);
  assert.match(sw,/milos-home-open-v233\.js/);
});

test('Android touch opens Milos through a direct pointer handler on the avatar',()=>{
  assert.match(js,/milos-anchor\[data-action="avatar"\]/);
  assert.match(js,/addEventListener\("pointerdown"/);
  assert.match(js,/addEventListener\("touchstart"/);
  assert.match(js,/event\.preventDefault\(\)/);
  assert.match(js,/target\.dispatchEvent\(new MouseEvent\("click"/);
  assert.match(js,/touchAction = "manipulation"/);
});
