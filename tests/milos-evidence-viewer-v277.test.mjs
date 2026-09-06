import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("assets/milos-evidence-viewer-v277.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

async function buildViewer() {
  const record = {
    id: "obs-1",
    publicId: "OBS-001",
    profileId: "learner-1",
    observationDate: "2026-09-06",
    courseTitle: "Bricklayer — ST0095",
    unitNumber: "3",
    jobTitle: "Cavity wall observation",
    location: "Training workshop",
    actions: "Continue checking line and level.",
    media: [{ id: "media-1", name: "clip.mp4" }],
    videoTimeline: [{ mediaId: "media-1", filename: "clip.mp4", kind: "video", startedAt: 1 }],
    witnessEvidence: [{
      witnessName: "Witness Name",
      witnessRole: "Site Supervisor",
      location: "Site",
      activityObserved: "Observed the learner carrying out cavity walling.",
      criteria: [{ code: "K1", description: "Explain safe working", outcome: "Competent" }],
      mappedEvidence: [{ code: "K1" }]
    }]
  };
  const context = {
    Blob,
    btoa,
    atob,
    WeakSet,
    Set,
    Map,
    Object,
    Array,
    JSON,
    Date,
    Math,
    String,
    Number,
    RegExp,
    console,
    MilosObservationBundle: { makeZip: async (entries) => entries },
    MilosCore: {
      getObservations: () => [record],
      getProfile: () => ({ name: "Learner Name", localReference: "LR-01" }),
      getSettings: () => ({ assessorName: "Assessor Name", organisation: "Provider", role: "Assessor" })
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "milos-evidence-viewer-v277.js" });

  const evidence = {
    courseTitle: "Bricklayer — ST0095",
    observationTitle: "Cavity wall observation",
    observationDate: "2026-09-06",
    criteriaLabel: "Evidence criteria",
    criteria: [
      { id: "direct-1", code: "S10", description: "Construct cavity walling", file: "clip.mp4", seconds: 12, endSeconds: 18, lo: "1", loTitle: "Cavity walling", source: "assessor", status: "Competent" },
      { id: "witness-1", code: "K1", description: "Explain safe working", file: "clip.mp4", seconds: 25, lo: "1", loTitle: "Cavity walling", source: "witness", witnessName: "Witness Name", status: "Competent" }
    ],
    clips: [{ file: "clip.mp4", kind: "video", lo: "1", title: "Cavity walling", source: "assessor" }]
  };
  const oldPlayer = `<!doctype html><title>Milos Evidence Viewer</title><script>const evidence=${JSON.stringify(evidence)}; const files=[];</script>`;
  const output = await context.MilosObservationBundle.makeZip([
    { name: "00_OPEN_EVIDENCE.html", blob: new Blob([oldPlayer], { type: "text/html" }), date: new Date() },
    { name: "clip.mp4", blob: new Blob(["abc"], { type: "video/mp4" }), date: new Date() },
    { name: "Observation.pdf", blob: new Blob(["pdf"], { type: "application/pdf" }), date: new Date() }
  ]);
  const viewer = output.find((entry) => entry.name === "00_OPEN_EVIDENCE.html");
  return { output, html: await viewer.blob.text() };
}

test("v2.77 replaces the ZIP-dependent player with a self-contained Milos viewer", async () => {
  const { output, html } = await buildViewer();
  assert.ok(output.some((entry) => entry.name === "Evidence Viewer - Read Me.txt"));
  assert.ok(output.some((entry) => entry.name === "clip.mp4"));
  assert.ok(output.some((entry) => entry.name === "Observation.pdf"));
  assert.match(html, /milosSelfContainedEvidenceViewerV277/);
  assert.match(html, /milosEvidenceViewerV272 compatibility marker/);
  assert.match(html, /#2c85f7/i);
  assert.match(html, /Find an AC, KSB, LO or wording/);
  assert.doesNotMatch(html, /Open complete evidence ZIP/i);
  assert.doesNotMatch(html, /type="file"/i);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test("viewer embeds source files and preserves assessor, learner, witness and mapping context", async () => {
  const { html } = await buildViewer();
  assert.match(html, /YWJj/);
  assert.match(html, /cGRm/);
  assert.match(html, /Learner Name/);
  assert.match(html, /Assessor Name/);
  assert.match(html, /Site Supervisor/);
  assert.match(html, /Witness Name/);
  assert.match(html, /S10/);
  assert.match(html, /K1/);
  assert.match(html, /Construct cavity walling/);
  assert.match(html, /Explain safe working/);
  assert.match(html, /"seconds":12/);
  assert.match(html, /currentTime/);
  assert.match(html, /loadedmetadata/);
});

test("generated standalone viewer runtime is valid JavaScript", async () => {
  const { html } = await buildViewer();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 1);
  assert.doesNotThrow(() => new vm.Script(scripts.at(-1)[1]));
});

test("v2.77 viewer is loaded after v2.72 and before the timeline, and is cached offline", () => {
  const oldViewer = index.indexOf("milos-evidence-viewer-v272.js");
  const newViewer = index.indexOf("milos-evidence-viewer-v277.js");
  const timeline = index.indexOf("milos-evidence-timeline-v242.js");
  assert.ok(oldViewer >= 0 && newViewer > oldViewer && timeline > newViewer);
  assert.match(index, /milos-evidence-viewer-v277\.js\?v=\d+\.\d+/);
  assert.match(sw, /milos-evidence-viewer-v277\.js/);
  assert.match(index, /milos-app-version" content="\d+\.\d+/);
  assert.match(sw, /milos-assessor-shell-v\d+\.\d+/);
});
