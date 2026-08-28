import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/milos-evidence-timeline-v242.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

function sampleRecord() {
  return {
    id: "record-1",
    videoEvidenceV231: true,
    courseType: "nvq",
    courseTitle: "Trowel Occupations",
    jobTitle: "Unit 235",
    observationDate: "2026-08-28",
    completedAt: Date.now(),
    media: [{ id: "media-1", name: "235_LO3_test.mp4" }],
    videoTimeline: [{
      kind: "lo",
      lo: 3,
      loTitle: "Erect masonry structures",
      mediaId: "media-1",
      filename: "235_LO3_test.mp4",
      startedAt: Date.now() - 600000,
      durationSeconds: 420,
      source: "assessor",
      acTimeline: [
        { code: "235.3.1", title: "Set out the work", startedOffsetMs: 258000, endedOffsetMs: 300000, status: "competent" },
        { code: "235.3.2", title: "Build the masonry", startedOffsetMs: 300000, endedOffsetMs: 350000, status: "action" },
      ],
    }],
  };
}

test("2.42 replaces the generic player with an AC-indexed clickable evidence viewer when a matching video observation is exported", async () => {
  const record = sampleRecord();
  const sandbox = {
    Blob,
    Date,
    TextEncoder,
    MilosCore: { getObservations: () => [record] },
    MilosObservationBundle: { makeZip: async (entries) => entries },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);

  const result = await sandbox.MilosObservationBundle.makeZip([
    { name: "Evidence_Record.pdf", blob: new Blob(["pdf"], { type: "application/pdf" }), date: new Date() },
    { name: "235_LO3_test.mp4", blob: new Blob(["video"], { type: "video/mp4" }), date: new Date() },
  ]);

  assert.equal(result[0].name, "00_OPEN_EVIDENCE.html");
  const html = await result[0].blob.text();
  assert.match(html, /Milos Evidence Viewer/);
  assert.match(html, /IQA \/ EQA/);
  assert.match(html, /235\.3\.1/);
  assert.match(html, /Set out the work/);
  assert.match(html, /04:18/);
  assert.match(html, /data-evidence-id/);
  assert.match(html, /activateCriterion/);
  assert.match(html, /pendingSeek/);
  assert.match(html, /loadFromZip/);
  assert.match(html, /Everything stays on this device/);
  assert.equal(sandbox.MilosEvidenceTimeline.clickableAcTimestamps, true);
  assert.equal(sandbox.MilosObservationBundle.clickableAcTimeline, true);
});

test("2.42 keeps the 2.41 generic player as fallback when no matching saved video observation can be identified", async () => {
  let delegated = null;
  const sandbox = {
    Blob,
    Date,
    TextEncoder,
    MilosCore: { getObservations: () => [] },
    MilosObservationBundle: { makeZip: async (entries) => { delegated = entries; return entries; } },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);

  const original = [
    { name: "random.mp4", blob: new Blob(["video"], { type: "video/mp4" }), date: new Date() },
  ];
  const result = await sandbox.MilosObservationBundle.makeZip(original);
  assert.equal(result, delegated);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "random.mp4");
});

test("current release keeps the working AC timestamp engine and direct seek repair in the intended order", () => {
  const player = index.indexOf("milos-evidence-player-v241.js");
  const square = index.indexOf("milos-square-evidence-v244.js");
  const viewer = index.indexOf("milos-evidence-viewer-v272.js");
  const timeline = index.indexOf("milos-evidence-timeline-v242.js");
  const seekRepair = index.indexOf("milos-evidence-timestamp-v273.js");
  const standardExporter = index.indexOf("milos-observation-export-v225.js");
  const videoExporter = index.indexOf("milos-video-evidence-v231.js");
  assert.ok(player >= 0 && square > player && viewer > square && timeline > viewer && seekRepair > timeline);
  assert.ok(standardExporter > seekRepair && videoExporter > seekRepair);
  assert.match(index, /milos-evidence-viewer-v272\.js\?v=[0-9.]+/);
  assert.match(index, /milos-evidence-timeline-v242\.js\?v=[0-9.]+/);
  assert.match(index, /milos-evidence-timestamp-v273\.js\?v=[0-9.]+/);
  assert.doesNotMatch(index, /milos-evidence-viewer-v271\.js\?v=/);
  assert.doesNotMatch(index, /milos-evidence-navigator-v245\.js/);
  assert.match(sw, /milos-evidence-viewer-v272\.js/);
  assert.match(sw, /milos-evidence-timeline-v242\.js/);
  assert.match(sw, /milos-evidence-timestamp-v273\.js/);
  assert.doesNotMatch(sw, /milos-evidence-viewer-v271\.js/);
  assert.doesNotMatch(sw, /milos-evidence-navigator-v245\.js/);
});
