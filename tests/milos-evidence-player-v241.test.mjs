import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/milos-evidence-player-v241.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("2.41 evidence ZIP includes a phone-safe direct ZIP player", async () => {
  const sandbox = {
    Blob,
    Date,
    TextEncoder,
    MilosObservationBundle: { makeZip: async (entries) => entries },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  const result = await sandbox.MilosObservationBundle.makeZip([
    { name: "235_LO3_test.webm", blob: new Blob(["video"], { type: "video/webm" }), date: new Date() },
  ]);
  assert.equal(result[0].name, "00_OPEN_EVIDENCE.html");
  const html = await result[0].blob.text();
  assert.match(html, /Open complete evidence ZIP/);
  assert.match(html, /readZipDirectory/);
  assert.match(html, /entry\.method===0/);
  assert.match(html, /DecompressionStream/);
  assert.match(html, /nothing was uploaded/i);
  assert.match(html, /Go to timestamp/);
  assert.match(html, /type="range"/);
  assert.match(html, /Choose one video manually/);
  assert.match(html, /URL\.createObjectURL/);
});

test("player wrapper preserves the 2.39 STORE-media ZIP path", () => {
  assert.match(source, /const prior = global\.MilosObservationBundle/);
  assert.match(source, /return prior\.makeZip\(list\)/);
  assert.match(source, /directZipPlayback: true/);
  assert.match(source, /localOnlyZipReader: true/);
});

test("2.41 loads the evidence player after compatibility ZIP handling", () => {
  const compat = index.indexOf("milos-evidence-compat-v239.js");
  const player = index.indexOf("milos-evidence-player-v241.js");
  const exporter = index.indexOf("milos-observation-export-v225.js");
  assert.ok(compat >= 0 && player > compat && exporter > player);
  assert.match(index, /milos-app-version" content="2\.41"/);
});
