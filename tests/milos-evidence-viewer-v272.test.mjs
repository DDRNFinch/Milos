import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/milos-evidence-viewer-v272.js", import.meta.url), "utf8");
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

async function patchedHtml() {
  const sandbox = { Blob, JSON, MilosObservationBundle: { makeZip: async (entries) => entries } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  const result = await sandbox.MilosObservationBundle.makeZip([
    { name: "00_OPEN_EVIDENCE.html", blob: new Blob([baseViewerHtml()], { type: "text/html" }), date: new Date() },
  ]);
  return result[0].blob.text();
}

test("2.72 keeps the fixed desktop/mobile video layout and clickable timestamps", async () => {
  const html = await patchedHtml();
  assert.match(html, /milosEvidenceViewerV272/);
  assert.match(html, /milosEvidenceDataV272/);
  assert.match(html, /milosEvidenceViewerRuntimeV272/);
  assert.match(html, /position:sticky;top:16px/);
  assert.match(html, /position:sticky;top:0/);
  assert.match(html, /data-open-evidence/);
  assert.match(html, /"seconds":18/);
  assert.match(html, /"seconds":43/);
  assert.match(html, /fmt\(item\.seconds\)/);
});

test("2.72 turns the Android permission step into a quiet normal flow", async () => {
  const html = await patchedHtml();
  assert.match(html, /Private evidence viewer\.<\/strong> Files stay on this device\./);
  assert.match(html, /Open the evidence ZIP once to load the recordings\./);
  assert.doesNotMatch(html, /This browser blocks automatic access/);
  assert.doesNotMatch(html, /className="status error"/);
  assert.doesNotMatch(html, /One ZIP selection unlocks/);
});

test("2.72 lets a timestamp or clip tap open the ZIP picker directly on restricted Android local pages", async () => {
  const html = await patchedHtml();
  assert.match(html, /location\.protocol==="content:"\|\|\/Android\/i/);
  assert.match(html, /try\{zipPicker\.click\(\)\}/);
  assert.match(html, /if\(!requestZip\(\)\)return/);
  assert.match(html, /pendingEvidenceId=id/);
  assert.match(html, /pendingClipFile=file/);
});

test("2.72 hides the permission controls once the ZIP is loaded", async () => {
  const html = await patchedHtml();
  assert.match(html, /mev-ready\.mev-loaded \.zipPick\{display:none!important\}/);
  assert.match(html, /document\.body\.classList\.add\("mev-loaded"\)/);
  assert.match(html, /setQuietStatus\(""\)/);
});

test("2.72 preserves automatic sibling-video loading on desktop", async () => {
  const html = await patchedHtml();
  assert.match(html, /if\(expectedMedia\.length\)loadRelative\(expectedMedia\[0\]\)/);
  assert.match(html, /desktopAutoRelative:true/);
});

test("2.72 remains the live enhanced layout before the 2.42 timeline and the direct seek repair", () => {
  const player = index.indexOf("milos-evidence-player-v241.js");
  const square = index.indexOf("milos-square-evidence-v244.js");
  const viewer = index.indexOf("milos-evidence-viewer-v272.js");
  const oldViewer = index.indexOf("milos-evidence-viewer-v271.js");
  const timeline = index.indexOf("milos-evidence-timeline-v242.js");
  const seekRepair = index.indexOf("milos-evidence-timestamp-v273.js");
  assert.ok(player >= 0 && square > player && viewer > square && timeline > viewer && seekRepair > timeline);
  assert.equal(oldViewer, -1);
  assert.match(index, /milos-evidence-viewer-v272\.js\?v=[0-9.]+/);
  assert.match(index, /milos-evidence-timestamp-v273\.js\?v=[0-9.]+/);
  assert.match(sw, /milos-evidence-viewer-v272\.js/);
  assert.match(sw, /milos-evidence-timestamp-v273\.js/);
  assert.doesNotMatch(sw, /milos-evidence-viewer-v271\.js/);
  assert.doesNotMatch(index, /milos-evidence-navigator-v245\.js/);
});
