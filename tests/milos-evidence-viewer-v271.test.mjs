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
      { id: "1-1-235.4.2", code: "235.4.2", description: "Allow for wastage", file: "Unit_235_LO4.mp4", seconds: 43, lo: "4", loTitle: "Calculate quantities", source: "assessor", witnessName: "" },
    ],
  };
  return `<!doctype html><html><head><title>Milos Evidence Viewer</title></head><body>
<div class="notice"></div><label class="zipPick">Open complete evidence ZIP<input id="zipPicker" type="file"></label>
<div class="viewer"><section class="videoCol"><div class="row"></div><video id="player"></video><div class="seek"></div><div class="row"><span id="status"></span></div><p class="help"></p></section><section class="criteriaBox"><div class="criteriaHead"></div><div class="filter"></div><div id="criteriaList" class="criteriaList"><button data-evidence-id="1-0-235.4.1"></button></div></section></div>
<select id="files"><option value="Unit_235_Intro.mp4">intro</option><option value="Unit_235_LO4.mp4">lo4</option></select>
<script>(function(){const expectedMedia=["Unit_235_Intro.mp4","Unit_235_LO4.mp4"];const evidence=${JSON.stringify(evidence)};const files=document.getElementById("files");if(expectedMedia.length)loadRelative(expectedMedia[0]);else setStatus("No video files were listed in this evidence package.",true);})();</script>
</body></html>`;
}

test("2.71 restores the responsive viewer without hiding timestamps until the enhancement is ready", async () => {
  const sandbox = {
    Blob,
    JSON,
    MilosObservationBundle: { makeZip: async (entries) => entries },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);

  const result = await sandbox.MilosObservationBundle.makeZip([
    { name: "00_OPEN_EVIDENCE.html", blob: new Blob([baseViewerHtml()], { type: "text/html" }), date: new Date() },
  ]);
  const html = await result[0].blob.text();

  assert.match(html, /milosEvidenceViewerV271/);
  assert.match(html, /milosEvidenceDataV271/);
  assert.match(html, /milosEvidenceViewerRuntimeV271/);
  assert.match(html, /\.mev-ready \.criteriaList\{display:none!important\}/);
  assert.doesNotMatch(html, /(^|\n)\.criteriaList\{display:none!important\}/);
  assert.match(html, /document\.body\.classList\.add\("mev-ready"\)/);
  assert.match(html, /position:sticky;top:16px/);
  assert.match(html, /position:sticky;top:0/);
  assert.match(html, /video stays in place while the evidence list scrolls/i);
  assert.match(html, /data-open-evidence/);
  assert.match(html, /"seconds":18/);
  assert.match(html, /"seconds":43/);
  assert.match(html, /fmt\(item\.seconds\)/);
});

test("2.71 preserves automatic sibling-video loading for desktop and falls back to one ZIP permission on blocked phones", async () => {
  const sandbox = {
    Blob,
    JSON,
    MilosObservationBundle: { makeZip: async (entries) => entries },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);

  const result = await sandbox.MilosObservationBundle.makeZip([
    { name: "00_OPEN_EVIDENCE.html", blob: new Blob([baseViewerHtml()], { type: "text/html" }), date: new Date() },
  ]);
  const html = await result[0].blob.text();

  assert.match(html, /if\(expectedMedia\.length\)loadRelative\(expectedMedia\[0\]\)/);
  assert.doesNotMatch(html, /if\(expectedMedia\.length\)setStatus\("Open the evidence ZIP to start\."\)/);
  assert.match(html, /on desktop, extracted evidence loads automatically/i);
  assert.match(html, /Tap Open evidence ZIP once/i);
  assert.match(html, /then load the recordings and timestamps automatically/i);
});

test("2.71 generated runtime JavaScript is syntactically valid", async () => {
  const sandbox = {
    Blob,
    JSON,
    MilosObservationBundle: { makeZip: async (entries) => entries },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);

  const result = await sandbox.MilosObservationBundle.makeZip([
    { name: "00_OPEN_EVIDENCE.html", blob: new Blob([baseViewerHtml()], { type: "text/html" }), date: new Date() },
  ]);
  const html = await result[0].blob.text();
  const match = html.match(/<script id="milosEvidenceViewerRuntimeV271">([\s\S]*?)<\/script>/);
  assert.ok(match && match[1]);
  assert.doesNotThrow(() => new vm.Script(match[1]));
});

test("2.71 leaves the original timestamp viewer untouched if evidence metadata cannot be extracted", async () => {
  const sandbox = {
    Blob,
    JSON,
    MilosObservationBundle: { makeZip: async (entries) => entries },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);

  const original = '<!doctype html><html><head><title>Milos Evidence Viewer</title></head><body><div id="criteriaList">working fallback</div></body></html>';
  const result = await sandbox.MilosObservationBundle.makeZip([
    { name: "00_OPEN_EVIDENCE.html", blob: new Blob([original], { type: "text/html" }), date: new Date() },
  ]);
  const html = await result[0].blob.text();
  assert.equal(html, original);
  assert.doesNotMatch(html, /milosEvidenceViewerV271/);
});

test("2.71 viewer is loaded in the wrapper chain and cached offline while the broken 2.45 navigator stays retired", () => {
  const player = index.indexOf("milos-evidence-player-v241.js");
  const square = index.indexOf("milos-square-evidence-v244.js");
  const viewer = index.indexOf("milos-evidence-viewer-v271.js");
  const timeline = index.indexOf("milos-evidence-timeline-v242.js");
  assert.ok(player >= 0 && square > player && viewer > square && timeline > viewer);
  assert.match(index, /milos-evidence-viewer-v271\.js\?v=2\.71/);
  assert.doesNotMatch(index, /milos-evidence-navigator-v245\.js/);
  assert.match(sw, /milos-evidence-viewer-v271\.js/);
  assert.doesNotMatch(sw, /milos-evidence-navigator-v245\.js/);
});
