import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/milos-evidence-viewer-v271.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

function baseViewerHtml() {
  const evidence = {
    version: "2.42",
    criteriaLabel: "Assessment criteria",
    clips: [
      { file: "Unit_235_Intro.mp4", kind: "intro", lo: "", title: "Introduction", source: "assessor", witnessName: "" },
      { file: "Unit_235_LO4.mp4", kind: "lo", lo: "4", title: "Calculate quantities", source: "assessor", witnessName: "" },
    ],
    criteria: [
      { id: "1-0-235.4.1", code: "235.4.1", description: "Confirm quantities", file: "Unit_235_LO4.mp4", seconds: 18, lo: "4", loTitle: "Calculate quantities", source: "assessor", witnessName: "" },
    ],
  };
  return `<!doctype html><html><head><title>Milos Evidence Viewer</title></head><body>
<div class="notice"></div><label class="zipPick">Open complete evidence ZIP<input id="zipPicker" type="file"></label>
<div class="viewer"><section class="videoCol"><div class="row"></div><video id="player"></video><div class="seek"></div><div class="row"><span id="status"></span></div><p class="help"></p></section><section class="criteriaBox"><div class="criteriaHead"></div><div class="filter"></div><div id="criteriaList" class="criteriaList"><button data-evidence-id="1-0-235.4.1"></button></div></section></div>
<select id="files"><option value="Unit_235_Intro.mp4">intro</option><option value="Unit_235_LO4.mp4">lo4</option></select>
<script>(function(){const expectedMedia=["Unit_235_Intro.mp4","Unit_235_LO4.mp4"];const evidence=${JSON.stringify(evidence)};const files=document.getElementById("files");if(expectedMedia.length)loadRelative(expectedMedia[0]);})();</script>
</body></html>`;
}

test("2.71 viewer source remains available as the safe responsive predecessor", async () => {
  const sandbox = { Blob, JSON, MilosObservationBundle: { makeZip: async (entries) => entries } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  const result = await sandbox.MilosObservationBundle.makeZip([
    { name: "00_OPEN_EVIDENCE.html", blob: new Blob([baseViewerHtml()], { type: "text/html" }), date: new Date() },
  ]);
  const html = await result[0].blob.text();
  assert.match(html, /milosEvidenceViewerV271/);
  assert.match(html, /position:sticky;top:16px/);
  assert.match(html, /position:sticky;top:0/);
  assert.match(html, /data-open-evidence/);
});

test("2.71 leaves the original timeline untouched if its metadata cannot be extracted", async () => {
  const sandbox = { Blob, JSON, MilosObservationBundle: { makeZip: async (entries) => entries } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  const original = '<!doctype html><html><head><title>Milos Evidence Viewer</title></head><body><div id="criteriaList">working fallback</div></body></html>';
  const result = await sandbox.MilosObservationBundle.makeZip([
    { name: "00_OPEN_EVIDENCE.html", blob: new Blob([original], { type: "text/html" }), date: new Date() },
  ]);
  assert.equal(await result[0].blob.text(), original);
});

test("2.71 viewer remains retired while the current responsive viewer and seek repair are live", () => {
  assert.doesNotMatch(index, /milos-evidence-viewer-v271\.js\?v=/);
  assert.doesNotMatch(sw, /milos-evidence-viewer-v271\.js/);
  assert.match(index, /milos-evidence-viewer-v272\.js\?v=[0-9.]+/);
  assert.match(index, /milos-evidence-timestamp-v273\.js\?v=[0-9.]+/);
  assert.match(sw, /milos-evidence-viewer-v272\.js/);
  assert.match(sw, /milos-evidence-timestamp-v273\.js/);
});
