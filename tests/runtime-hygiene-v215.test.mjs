import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const index=fs.readFileSync("index.html","utf8");
const sw=fs.readFileSync("sw.js","utf8");
const update=JSON.parse(fs.readFileSync("update.json","utf8"));
const packageJson=JSON.parse(fs.readFileSync("package.json","utf8"));
const current=index.match(/milos-app-version" content="([^"]+)"/)?.[1];

const stale=[
  "assets/milos-auto-trigger-v210.js",
  "assets/milos-planning-v212.js",
  "assets/milos-natural-narrative-v27.js",
  "assets/milos-observation-auto-v25.js",
  "assets/milos-observation-prose-v27.js",
  "assets/milos-review-auto-v26.js",
  "assets/milos-review-prose-v27.js"
];

test("Milos has no superseded runtime files",()=>{
  for(const path of stale)assert.equal(fs.existsSync(path),false,`${path} should not exist`);
});

test("every local script loaded by Milos exists",()=>{
  const scripts=[...index.matchAll(/<script[^>]+src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)].map(match=>match[1]);
  assert.ok(scripts.length>0);
  for(const path of scripts)assert.equal(fs.existsSync(path),true,`${path} is missing`);
});

test("Milos app, manifest, package and offline cache use the same current version",()=>{
  assert.ok(current,"current version should be present in index.html");
  assert.equal(update.version,current);
  assert.equal(packageJson.version,`${current}.0`);
  assert.match(sw,new RegExp(`milos-assessor-shell-v${current.replace(/\./g,"\\.")}`));
});

test("Evia Course Packs DOM patch cannot self-trigger forever",()=>{
  const match=index.match(/assets\/(milos-evia-course-packs-v\d+\.js)/);
  assert.ok(match,"Evia Course Packs controller should be loaded");
  const source=fs.readFileSync(`assets/${match[1]}`,"utf8");
  assert.doesNotMatch(source,/new MutationObserver\(patchMore\)/);
  assert.match(source,/title&&title\.textContent!=="Evia Course Packs"/);
  assert.match(source,/relevantMutation\(records\)/);
});
