import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/milos-evia-figures-v275.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("Milos reads the single Evia figures QR and keeps learner identity local", () => {
  let profiles = [{ id:"learner-1", name:"Local learner", snapshots:[] }];
  const storage = new Map();
  const sandbox = {
    JSON, Date, Number, Object, Array, String, Math,
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) {
        storage.set(key, String(value));
        if (key === "profiles") profiles = JSON.parse(String(value));
      }
    },
    MilosQR: {
      parsePayload() { return { type:"legacy" }; }
    },
    MilosCore: {
      STORAGE: { profiles:"profiles" },
      getProfiles() { return JSON.parse(JSON.stringify(profiles)); },
      sanitiseProgress(raw) {
        return {
          courseRouteId: raw.c,
          startDate:"",
          endDate:"",
          sharedId:"",
          updatedAt:raw.u,
          learningHours:raw.l,
          learningTarget:raw.lt,
          evidenceCount:raw.ec,
          completedCodes:[],
          changedCodes:[],
          targets:[]
        };
      },
      attachProgress() { throw new Error("legacy progress path should not handle Evia figures v2"); }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);

  const raw = JSON.stringify({
    t:"evia-figures-v2", v:2, u:123456,
    c:["ST0095","1.2"],
    f:[9,5,59,9,91,95,93,578,12,11,23,4,3,8,4,1,3,72,60,47]
  });
  const parsed = sandbox.MilosQR.parsePayload(raw);
  assert.equal(parsed.type, "progress");
  assert.equal(parsed.value.c, "ST0095");
  assert.equal(parsed.value.l, 23);
  assert.equal(parsed.value.lt, 578);
  assert.equal(parsed.value.ec, 8);
  assert.equal(parsed.value.attendancePercent, 93);
  assert.equal(parsed.value.epaReadinessPercent, 47);

  const updated = sandbox.MilosCore.attachProgress("learner-1", parsed.value);
  assert.equal(updated.name, "Local learner");
  assert.equal(updated.courseRouteId, "ST0095");
  assert.equal(updated.snapshots[0].learningHours, 23);
  assert.equal(updated.snapshots[0].eviaFigures.attendance.combinedPercent, 93);
  assert.equal(updated.snapshots[0].eviaFigures.targets.outstanding, 3);
  assert.equal(updated.snapshots[0].eviaFigures.epa.readinessPercent, 47);
});

test("Milos loads Evia figures support before the app and caches it offline", () => {
  const bridge = index.indexOf("milos-evia-figures-v275.js");
  const app = index.indexOf("milos-app.js");
  assert.ok(bridge >= 0 && app > bridge);
  assert.match(sw, /milos-evia-figures-v275\.js/);
});
