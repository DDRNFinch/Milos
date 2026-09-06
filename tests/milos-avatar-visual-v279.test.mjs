import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('assets/milos-evia-avatar-v276.css','utf8');
const index = fs.readFileSync('index.html','utf8');
const sw = fs.readFileSync('sw.js','utf8');

test('Milos uses Evia visual proportions in blue', () => {
  assert.match(css, /--milos-avatar-blue:\s*#2c85f7/i);
  assert.match(css, /font-size:\s*clamp\(123\.75px,\s*34\.5vw,\s*165px\)/);
  assert.match(css, /width:\s*0\.32em/);
  assert.match(css, /height:\s*0\.32em/);
  assert.match(css, /gap:\s*0\.105em/);
  assert.match(css, /inset:\s*-0\.34em/);
  assert.match(css, /milos-home-copy[\s\S]*30vw/);
});

test('avatar stylesheet is loaded after all other styles', () => {
  const avatar = index.indexOf('milos-evia-avatar-v276.css?v=2.79');
  const lastOther = Math.max(
    index.lastIndexOf('milos-review-calendar-v255.css'),
    index.lastIndexOf('milos-travel-v248.css'),
    index.lastIndexOf('milos-standard-ui-v229.css')
  );
  assert.ok(avatar > lastOther);
  assert.ok(avatar < index.indexOf('<script defer'));
});

test('v2.79 cache release will replace installed avatar assets', () => {
  assert.match(index, /milos-app-version" content="2\.79"/);
  assert.match(sw, /milos-assessor-shell-v2\.79/);
  assert.match(sw, /milos-evia-avatar-v276\.css/);
  assert.match(sw, /milos-evia-avatar-v276\.js/);
});
