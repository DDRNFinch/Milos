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
  const localStorage = {
    getItem(key) { return records.has(key) ? records.get(key) : null; },
    setItem(key, value) { records.set(key, String(value)); },
    removeItem(key) { records.delete(key); },
    clear() { records.clear(); },
  };
  const context = {
    console,
    crypto: webcrypto,
    localStorage,
    TextEncoder,
    TextDecoder,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    fetch: async (url) => {
      const filename = path.resolve(root, String(url).replace(/^\.\//, ""));
      return {
        ok: fs.existsSync(filename),
        status: fs.existsSync(filename) ? 200 : 404,
        async json() { return JSON.parse(fs.readFileSync(filename, "utf8")); },
      };
    },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ["assets/milos-core.js", "assets/milos-qr.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  return context;
}

test("Evia progress QR round-trips and personal fields are discarded", () => {
  const { MilosCore: core, MilosQR: qr } = runtime();
  const payload = qr.progressPayload({
    sharedId: "learner-ref-17",
    courseRouteId: "ST0095",
    startDate: "2026-08-01",
    endDate: "2028-01-31",
    learningHours: 84.5,
    learningTarget: 578,
    completedCodes: ["K1", "S1"],
    changedCodes: ["S1"],
    targets: [{ title: "Build a return corner", dueDate: "2026-09-12", code: "S14" }],
  });
  const decoded = qr.parsePayload(payload);
  assert.equal(decoded.type, "progress");
  const sanitised = core.sanitiseProgress({
    ...decoded.value,
    learnerName: "Must not survive",
    photo: "data:image/jpeg;base64,private",
    email: "private@example.test",
  });
  assert.equal(sanitised.courseRouteId, "ST0095");
  assert.equal(sanitised.learningHours, 84.5);
  assert.deepEqual([...sanitised.completedCodes], ["K1", "S1"]);
  assert.deepEqual([...sanitised.ignoredPersonalFields].sort(), ["email", "learnerName", "photo"].sort());
  assert.equal(Object.hasOwn(sanitised, "learnerName"), false);
  assert.equal(Object.hasOwn(sanitised, "photo"), false);
});

test("imported progress updates a local profile without replacing its local name", () => {
  const { MilosCore: core } = runtime();
  const profile = core.createProfile({ name: "Local Learner", localReference: "Cohort A" });
  const updated = core.attachProgress(profile.id, {
    t: "progress",
    c: "ST0264-SITE",
    r: "anonymous-evia-ref",
    s: "2026-08-03",
    e: "2028-02-02",
    z: ["K1", "S1"],
    name: "QR Name Must Be Ignored"
  });
  assert.equal(updated.name, "Local Learner");
  assert.equal(updated.courseRouteId, "ST0264-SITE");
  assert.equal(updated.sharedId, "anonymous-evia-ref");
  assert.equal(updated.snapshots[0].ignoredPersonalFields.includes("name"), true);
});

test("observation return QR contains only the minimal Evia instruction", () => {
  const { MilosCore: core, MilosQR: qr } = runtime();
  const profile = core.createProfile({ name: "Private Name", courseRouteId: "ST0095" });
  const course = { route: core.routeById("ST0095") };
  const observation = {
    publicId: "obs-public-1",
    eviaSharedId: "evia-pseudonymous-ref",
    observationDate: "2026-08-21",
    completedAt: 1787310000000,
    observedCodes: ["K1", "S1"],
    assessorName: "Private Assessor",
    signature: { dataUrl: "private-signature" },
    media: [{ name: "private-photo.jpg" }],
  };
  const payload = qr.observationPayload(observation, profile, course);
  const parsed = qr.parsePayload(payload);
  assert.equal(parsed.type, "observation");
  assert.equal(parsed.value.a, "mark-observed");
  assert.equal(parsed.value.m, "blue-o");
  assert.deepEqual([...parsed.value.z], ["K1", "S1"]);
  const raw = JSON.stringify(parsed.value);
  assert.equal(raw.includes("Private Name"), false);
  assert.equal(raw.includes("Private Assessor"), false);
  assert.equal(raw.includes("private-photo"), false);
  assert.equal(raw.includes("signature"), false);
});

test("observation return QR requires an Evia-issued learner reference", () => {
  const { MilosCore: core, MilosQR: qr } = runtime();
  const profile = core.createProfile({ name: "Local only", courseRouteId: "ST0095" });
  assert.throws(
    () => qr.observationPayload({ publicId: "obs-1", observationDate: "2026-08-21", observedCodes: ["K1"] }, profile, { route: core.routeById("ST0095") }),
    /full Evia progress QR/i,
  );
});

test("all seven routes load a mapped Evia course pack", async () => {
  const { MilosCore: core } = runtime();
  assert.equal(core.COURSE_ROUTES.length, 7);
  for (const route of core.COURSE_ROUTES) {
    const course = await core.loadCourse(route.id);
    assert.equal(course.route.id, route.id);
    assert.ok(course.codes.length > 0, `${route.id} should include course codes`);
    assert.ok(course.siteData.length > 0, `${route.id} should include observation routes`);
    const firstOpportunity = course.siteData[0]?.jobs?.[0]?.opps?.[0];
    assert.ok(firstOpportunity?.codes?.length > 0, `${route.id} should map the first opportunity`);
  }
});

test("course-only Evia codes remain supported for staged rollout", () => {
  const { MilosQR: qr } = runtime();
  const parsed = qr.parsePayload("EVIA1:6570-05-DRAINAGE");
  assert.equal(parsed.type, "progress");
  assert.equal(parsed.courseOnly, true);
  assert.equal(parsed.value.c, "6570-05-DRAINAGE");
});
