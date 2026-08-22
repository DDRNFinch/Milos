import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const index=fs.readFileSync("index.html","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const update=JSON.parse(fs.readFileSync("update.json","utf8"));
const packageJson=JSON.parse(fs.readFileSync("package.json","utf8"));

const stale=[
  "assets/milos-auto-trigger-v210.js",
  "assets/milos-planning-v212.js",
  "assets/milos-natural-narrative-v27.js",
  "assets/milos-observation-auto-v25.js",
  "assets/milos-observation-prose-v27.js",
  "assets/milos-review-auto-v26.js",
  "assets/milos-review-prose-v27.js"
];

test("Milos 2.15 has no superseded runtime files",()=>{
  for(const path of stale)assert.equal(fs.existsSync(path),false,`${path} should not exist`);
});

test("every local script loaded by Milos exists",()=>{
  const scripts=[...index.matchAll(/<script[^>]+src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)].map(match=>match[1]);
  assert.ok(scripts.length>0);
  for(const path of scripts)assert.equal(fs.existsSync(path),true,`${path} is missing`);
});

test("Milos app, manifest, package and offline cache agree on 2.15",()=>{
  assert.equal(update.version,"2.15");
  assert.equal(packageJson.version,"2.15.0");
  assert.match(index,/milos-app-version" content="2\.15"/);
  assert.match(sw,/milos-assessor-shell-v2\.15/);
});
