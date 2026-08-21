import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runtime() {
  const records = new Map();
  const context = {
    console,
    crypto: webcrypto,
    TextEncoder,
    TextDecoder,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    localStorage: {
      getItem(key) { return records.has(key) ? records.get(key) : null; },
      setItem(key, value) { records.set(key, String(value)); },
      removeItem(key) { records.delete(key); },
      clear() { records.clear(); },
    },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ["assets/milos-core.js", "assets/milos-qr.js", "assets/milos-observation-optional.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  return context;
}

test("observation PDF path remains available without an Evia scan", () => {
  const { MilosCore: core, MilosQR: qr } = runtime();
  const profile = core.createProfile({ name: "Local Learner", courseRouteId: "ST0095" });
  const course = { route: core.routeById("ST0095") };
  const observation = { publicId: "obs-local-1", observationDate: "2026-08-21", observedCodes: ["K1"] };

  assert.equal(qr.observationPayload(observation, profile, course), "");
  assert.throws(() => qr.dataUrl("", 500), /PDF is still available without it/i);
});

test("scanned observations still create the normal Evia return QR", () => {
  const { MilosCore: core, MilosQR: qr } = runtime();
  const profile = core.createProfile({ name: "Scanned Learner", courseRouteId: "ST0095" });
  const course = { route: core.routeById("ST0095") };
  const observation = {
    publicId: "obs-scan-1",
    eviaSharedId: "evia-shared-1",
    observationDate: "2026-08-21",
    observedCodes: ["K1", "S1"],
  };

  const payload = qr.observationPayload(observation, profile, course);
  const parsed = qr.parsePayload(payload);
  assert.equal(parsed.type, "observation");
  assert.equal(parsed.value.r, "evia-shared-1");
  assert.deepEqual([...parsed.value.z], ["K1", "S1"]);
});
