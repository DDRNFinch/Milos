import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("assets/milos-evidence-compat-v239.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function localEntries(bytes) {
  const out = [];
  let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const originalSize = bytes.readUInt32LE(offset + 22);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataOffset = offset + 30 + nameLength + extraLength;
    out.push({ name, method, compressedSize, originalSize, dataOffset });
    offset = dataOffset + compressedSize;
  }
  return out;
}

test("2.40 evidence compatibility loads before export consumers and is cached", () => {
  const bundleAt = index.indexOf("milos-observation-bundle-v22.js");
  const compatAt = index.indexOf("milos-evidence-compat-v239.js");
  const exportAt = index.indexOf("milos-observation-export-v225.js");
  const videoAt = index.indexOf("milos-video-evidence-v231.js");
  assert.ok(bundleAt >= 0 && compatAt > bundleAt);
  assert.ok(exportAt > compatAt && videoAt > compatAt);
  assert.match(index, /milos-app-version" content="2\.40"/);
  assert.match(sw, /milos-assessor-shell-v2\.40/);
  assert.match(sw, /milos-evidence-compat-v239\.js/);
});

test("video entries use STORE while documents remain DEFLATE", async () => {
  let optimiseCalls = 0;
  const context = {
    Blob,
    Response,
    CompressionStream,
    TextEncoder,
    Uint8Array,
    Uint32Array,
    DataView,
    Date,
    console,
    MilosObservationBundle: { version: "old", makeZip: async () => { throw new Error("old zip should not run"); } },
    MilosMp4Faststart: { optimise: async (blob) => { optimiseCalls += 1; return blob; } },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);

  const pdf = new Blob(["%PDF-1.4\nMilos evidence evidence evidence evidence"], { type: "application/pdf" });
  const video = new Blob([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])], { type: "video/mp4" });
  const zip = await context.MilosObservationBundle.makeZip([
    { name: "Evidence.pdf", blob: pdf, date: new Date("2026-08-27T12:00:00Z") },
    { name: "Observation.mp4", blob: video, date: new Date("2026-08-27T12:00:00Z") },
  ]);
  const entries = localEntries(Buffer.from(await zip.arrayBuffer()));

  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, "Evidence.pdf");
  assert.equal(entries[0].method, 8, "documents should remain DEFLATE compressed");
  assert.equal(entries[1].name, "Observation.mp4");
  assert.equal(entries[1].method, 0, "MP4 must be STORE for archive-level seeking compatibility");
  assert.equal(entries[1].compressedSize, entries[1].originalSize);
  assert.equal(optimiseCalls, 1, "MP4 must be passed through fast-start repair at the ZIP boundary");
  assert.equal(context.MilosObservationBundle.seekableVideoEntries, true);
  assert.equal(context.MilosObservationBundle.fastStartMp4AtZipBoundary, true);
  assert.equal(context.MilosEvidenceCompatibility.videoZipMethod, "STORE");
});
