import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/milos-evidence-timestamp-v274.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const baseHtml = `<!doctype html><html><body><main>Milos Evidence Viewer</main><script type="application/json" id="milosEvidenceDataV272">{"criteria":[{"id":"a","code":"235.3.2","file":"LO3.mp4","seconds":15}]}</script><script id="milosEvidenceViewerRuntimeV272"></script></body></html>`;

test("2.74 patches the evidence HTML before delegating to the ZIP builder", async () => {
  let delegated = null;
  const sandbox = { Blob, MilosObservationBundle: { makeZip: async (entries) => { delegated = entries; return entries; } } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  const result = await sandbox.MilosObservationBundle.makeZip([{ name:"00_OPEN_EVIDENCE.html", blob:new Blob([baseHtml],{type:"text/html"}) }]);
  const delegatedHtml = await delegated[0].blob.text();
  const resultHtml = await result[0].blob.text();
  assert.match(delegatedHtml, /milosEvidenceTimestampRuntimeV274/);
  assert.match(resultHtml, /milosEvidenceTimestampRuntimeV274/);
  assert.match(resultHtml, /files\.dispatchEvent\(new Event\("change"/);
  assert.match(resultHtml, /player\.currentTime=Math\.min\(target,player\.duration\)/);
  assert.match(resultHtml, /stopImmediatePropagation\(\)/);
});

test("2.74 timestamp layer sits inside the export chain before the responsive viewer and timeline", () => {
  const repair = index.indexOf("milos-evidence-timestamp-v274.js");
  const viewer = index.indexOf("milos-evidence-viewer-v272.js");
  const timeline = index.indexOf("milos-evidence-timeline-v242.js");
  const oldRepair = index.indexOf("milos-evidence-timestamp-v273.js");
  assert.ok(repair >= 0 && viewer > repair && timeline > viewer);
  assert.equal(oldRepair, -1);
  assert.match(index,/milos-evidence-timestamp-v274\.js\?v=2\.74/);
  assert.match(index,/milos-app-version" content="2\.74"/);
  assert.match(sw,/milos-assessor-shell-v2\.74/);
  assert.match(sw,/milos-evidence-timestamp-v274\.js/);
  assert.doesNotMatch(sw,/milos-evidence-timestamp-v273\.js/);
});
