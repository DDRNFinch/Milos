import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../assets/milos-standard-ui-v229.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../assets/milos-standard-ui-v229.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('Milos 2.31 loads standardized UI last and offline',()=>{
  assert.match(index,/milos-standard-ui-v229\.css\?v=2\.31/);
  assert.match(index,/milos-standard-ui-v229\.js\?v=2\.31/);
  assert.ok(index.indexOf('milos-standard-ui-v229.css')>index.indexOf('milos-calendar-manager-v230.css'));
  assert.match(sw,/milos-standard-ui-v229\.css/);
  assert.match(sw,/milos-standard-ui-v229\.js/);
});

test('Milos brand has a blue i and assessor lockup',()=>{
  assert.match(css,/--std-brand:#2C85F7/);
  assert.match(js,/M<span class="app-brand-i">i<\/span>los/);
  assert.match(js,/Assessor assistant/);
});

test('shared component rules standardize cards buttons forms and calendar',()=>{
  assert.match(css,/\.option-row,\.milos-option-row/);
  assert.match(css,/\.milos-primary/);
  assert.match(css,/\.milos-field input/);
  assert.match(css,/\.progress-dock\.mcal-host/);
  assert.match(css,/\.mcal-day\.is-today/);
});

test('full screen recorder is explicitly preserved',()=>{
  assert.match(css,/\.mvo-ac-screen\{background:#0E1116/);
  assert.doesNotMatch(css,/\.mvo-ac-screen\{[^}]*height:/);
});
