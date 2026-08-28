import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/milos-evidence-timestamp-v273.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const baseHtml = `<!doctype html><html><body><main>Milos Evidence Viewer</main><script type="application/json" id="milosEvidenceDataV272">{"criteria":[{"id":"a","code":"235.3.2","file":"LO3.mp4","seconds":15}]}</script><script id="milosEvidenceViewerRuntimeV272"></script></body></html>`;

test("2.73 patches the exported viewer after 2.72 and seeks the real video directly", async () => {
  const sandbox = { Blob, MilosObservationBundle: { makeZip: async (entries) => entries } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  const result = await sandbox.MilosObservationBundle.makeZip([{ name:"00_OPEN_EVIDENCE.html", blob:new Blob([baseHtml],{type:"text/html"}) }]);
  const html = await result[0].blob.text();
  assert.match(html, /milosEvidenceTimestampRuntimeV273/);
  assert.match(html, /data-open-evidence/);
  assert.match(html, /player\.currentTime=Math\.min\(target,player\.duration\)/);
  assert.match(html, /files\.dispatchEvent\(new Event\("change"/);
  assert.match(html, /stopImmediatePropagation\(\)/);
});

test("2.73 loads after the working timeline wrapper and is cached offline", () => {
  const timeline=index.indexOf("milos-evidence-timeline-v242.js");
  const repair=index.indexOf("milos-evidence-timestamp-v273.js");
  assert.ok(timeline>=0 && repair>timeline);
  assert.match(index,/milos-evidence-timestamp-v273\.js\?v=2\.73/);
  assert.match(index,/milos-app-version" content="2\.73"/);
  assert.match(sw,/milos-assessor-shell-v2\.73/);
  assert.match(sw,/milos-evidence-timestamp-v273\.js/);
});
