import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const index = read('index.html');
const sw = read('sw.js');
const pkg = JSON.parse(read('package.json'));
const update = JSON.parse(read('update.json'));

function shellVersion() {
  return index.match(/name="milos-app-version" content="([^"]+)"/)?.[1] || '';
}

test('Milos has one current release version across package, shell, update manifest and cache', () => {
  const version = shellVersion();
  assert.ok(version, 'milos-app-version meta must exist');
  assert.equal(pkg.version, `${version}.0`);
  assert.equal(String(update.version), version);
  assert.match(sw, new RegExp(`milos-assessor-shell-v${version.replace(/\./g, '\\.')}`));
});

test('every versioned production asset in index uses the current release version', () => {
  const version = shellVersion();
  const refs = [...index.matchAll(/(?:src|href)="\.\/[^"?]+\?v=([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, 'versioned production assets should exist');
  for (const ref of refs) assert.equal(ref, version);
});

test('update notification and offline shell are part of the installed release', () => {
  assert.match(index, /milos-updater-v214\.js/);
  assert.match(sw, /\.\/assets\/milos-updater-v214\.js/);
  assert.match(sw, /\.\/update\.json|update\.json/);
});
