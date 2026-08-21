import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("the app shell references only local, present production assets", () => {
  const html = read("index.html");
  assert.match(html, /id="milosApp"/);
  assert.doesNotMatch(html, /https?:\/\//);
  const references = [...html.matchAll(/(?:src|href)="\.\/([^"?#]+)/g)].map((match) => match[1]);
  for (const reference of references) assert.ok(fs.existsSync(path.join(root, reference)), `${reference} should exist`);
});

test("service worker shell files all exist", () => {
  const source = read("sw.js");
  const items = [...source.matchAll(/"\.\/([^"?]+)"/g)].map((match) => match[1]).filter(Boolean);
  for (const item of items) assert.ok(fs.existsSync(path.join(root, item)), `${item} should exist`);
});

test("Milos has four home routes and no unfinished workflow stubs", () => {
  const source = read("assets/milos-app.js");
  for (const route of ["Learners", "Reviews", "Observation", "More"]) assert.match(source, new RegExp(`optionRow\\(\"${route}\"`));
  assert.doesNotMatch(source, /workflow is still loading/);
  assert.doesNotMatch(source, /function renderObservations\(\) \{ return ""; \}/);
  assert.match(source, /NISI:EVIA:PROGRESS:1:/);
});

test("manifest is an installable Milos PWA", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.short_name, "Milos");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
});
