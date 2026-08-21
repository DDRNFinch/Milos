(function (global) {
  "use strict";

  const STORAGE = Object.freeze({
    settings: "milos-settings-v1",
    profiles: "milos-learner-profiles-v1",
    reviews: "milos-reviews-v1",
    observations: "milos-observations-v1",
  });

  const COURSE_ROUTES = Object.freeze([
    {
      id: "ST0095",
      courseId: "st0095-v1-2",
      familyId: "ST0095",
      pathway: "",
      title: "Bricklayer — ST0095",
      shortTitle: "Bricklayer",
      courseType: "apprenticeship",
      coverageLabel: "KSB",
      learningLabel: "OTJ",
      learningTarget: 578,
      file: "./course-packs/Bricklayer_ST0095_v1.2.nisi",
    },
    {
      id: "ST0264-SITE",
      courseId: "st0264-v1-4",
      familyId: "ST0264",
      pathway: "site-carpenter",
      title: "Site Carpenter — ST0264",
      shortTitle: "Site Carpenter",
      courseType: "apprenticeship",
      coverageLabel: "KSB",
      learningLabel: "OTJ",
      learningTarget: 557,
      file: "./course-packs/Carpentry_Joinery_ST0264_v1.4.nisi",
    },
    {
      id: "ST0264-AJ",
      courseId: "st0264-v1-4",
      familyId: "ST0264",
      pathway: "architectural-joiner",
      title: "Architectural Joiner — ST0264",
      shortTitle: "Architectural Joiner",
      courseType: "apprenticeship",
      coverageLabel: "KSB",
      learningLabel: "OTJ",
      learningTarget: 557,
      file: "./course-packs/Carpentry_Joinery_ST0264_v1.4.nisi",
    },
    {
      id: "6570-05-THIN",
      courseId: "6570-05",
      familyId: "6570-05",
      pathway: "thin",
      title: "Trowel Occupations L3 — Thin Joint",
      shortTitle: "Thin Joint",
      courseType: "nvq",
      coverageLabel: "AC",
      learningLabel: "GLH",
      learningTarget: 847,
      file: "./course-packs/Trowel_Occupations_6570-05_v1.nisi",
    },
    {
      id: "6570-05-REPAIR",
      courseId: "6570-05",
      familyId: "6570-05",
      pathway: "repair",
      title: "Trowel Occupations L3 — Repair & Maintenance",
      shortTitle: "Repair & Maintenance",
      courseType: "nvq",
      coverageLabel: "AC",
      learningLabel: "GLH",
      learningTarget: 847,
      file: "./course-packs/Trowel_Occupations_6570-05_v1.nisi",
    },
    {
      id: "6570-05-SPECIALIST",
      courseId: "6570-05",
      familyId: "6570-05",
      pathway: "specialist",
      title: "Trowel Occupations L3 — Specialist Masonry",
      shortTitle: "Specialist Masonry",
      courseType: "nvq",
      coverageLabel: "AC",
      learningLabel: "GLH",
      learningTarget: 847,
      file: "./course-packs/Trowel_Occupations_6570-05_v1.nisi",
    },
    {
      id: "6570-05-DRAINAGE",
      courseId: "6570-05",
      familyId: "6570-05",
      pathway: "drainage",
      title: "Trowel Occupations L3 — Drainage",
      shortTitle: "Drainage",
      courseType: "nvq",
      coverageLabel: "AC",
      learningLabel: "GLH",
      learningTarget: 847,
      file: "./course-packs/Trowel_Occupations_6570-05_v1.nisi",
    },
  ]);

  const blockedImportKeys = new Set([
    "name", "fullname", "full_name", "learnername", "learner_name", "photo", "photos",
    "image", "images", "video", "videos", "audio", "recording", "recordings", "media",
    "email", "phone", "telephone", "mobile", "address", "postcode", "dob", "dateofbirth",
    "date_of_birth", "uln", "nationalinsurance", "national_insurance", "signature", "signatures",
    "employer", "employername", "employer_name", "contact", "contacts",
  ]);

  const packCache = new Map();

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function read(key, fallback) {
    try {
      const raw = global.localStorage.getItem(key);
      return raw === null ? clone(fallback) : JSON.parse(raw);
    } catch (_) {
      return clone(fallback);
    }
  }

  function write(key, value) {
    global.localStorage.setItem(key, JSON.stringify(value));
    return value;
  }

  function uid(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return `${prefix}-${global.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function cleanText(value, maxLength) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, maxLength || 500);
  }

  function cleanMultiline(value, maxLength) {
    return String(value == null ? "" : value).replace(/\r/g, "").trim().slice(0, maxLength || 6000);
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : (fallback == null ? 0 : fallback);
  }

  function validDate(value) {
    const text = cleanText(value, 24);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
    const date = new Date(`${text}T12:00:00`);
    return Number.isFinite(date.getTime()) ? text : "";
  }

  function normaliseCode(value) {
    const code = cleanText(value, 32).toUpperCase();
    return /^[A-Z]{0,3}\d+(?:\.\d+){0,3}[A-Z]?$/.test(code) ? code : "";
  }

  function cleanCodes(value) {
    const list = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[\s,;|]+/)
        : [];
    return [...new Set(list.map(normaliseCode).filter(Boolean))].slice(0, 500);
  }

  function cleanTargets(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 12).map((target) => {
      if (typeof target === "string") {
        return { id: uid("target"), title: cleanText(target, 220), dueDate: "", code: "" };
      }
      return {
        id: cleanText(target && target.id, 80) || uid("target"),
        title: cleanText(target && (target.title || target.text || target.target), 220),
        dueDate: validDate(target && (target.dueDate || target.due || target.date)),
        code: normaliseCode(target && (target.code || target.ksb || target.ac)),
        status: cleanText(target && target.status, 40),
      };
    }).filter((target) => target.title);
  }

  function findPersonalFields(value, found, depth) {
    if (!value || typeof value !== "object" || depth > 4) return found;
    Object.keys(value).forEach((key) => {
      const compact = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (blockedImportKeys.has(compact)) found.add(key);
      const child = value[key];
      if (child && typeof child === "object") findPersonalFields(child, found, depth + 1);
    });
    return found;
  }

  function routeFromIdentifier(course, pathway) {
    const raw = cleanText(course, 80).toUpperCase().replace(/_/g, "-");
    const path = cleanText(pathway, 60).toLowerCase();
    let direct = COURSE_ROUTES.find((route) => route.id === raw);
    if (direct) return direct;
    if (raw.includes("ST0095") || raw.includes("BRICK")) return COURSE_ROUTES[0];
    if (raw.includes("ST0264")) {
      if (raw.includes("AJ") || raw.includes("JOIN") || path.includes("join")) return COURSE_ROUTES[2];
      return COURSE_ROUTES[1];
    }
    if (raw.includes("6570") || raw.includes("TROWEL") || raw.includes("NVQ")) {
      const hint = `${raw} ${path}`;
      if (hint.includes("REPAIR")) return COURSE_ROUTES[4];
      if (hint.includes("SPECIAL")) return COURSE_ROUTES[5];
      if (hint.includes("DRAIN")) return COURSE_ROUTES[6];
      return COURSE_ROUTES[3];
    }
    return null;
  }

  function routeById(id) {
    return COURSE_ROUTES.find((route) => route.id === id) || null;
  }

  function defaultSettings() {
    return {
      assessorName: "",
      organisation: "",
      role: "Assessor",
      onboardingComplete: false,
      reduceMotion: false,
      textSize: "standard",
      createdAt: Date.now(),
    };
  }

  function getSettings() {
    return Object.assign(defaultSettings(), read(STORAGE.settings, {}));
  }

  function saveSettings(patch) {
    return write(STORAGE.settings, Object.assign(getSettings(), patch || {}, { updatedAt: Date.now() }));
  }

  function getProfiles() {
    const profiles = read(STORAGE.profiles, []);
    return Array.isArray(profiles) ? profiles : [];
  }

  function saveProfiles(profiles) {
    return write(STORAGE.profiles, profiles);
  }

  function createProfile(input) {
    const name = cleanText(input && input.name, 100);
    if (!name) throw new Error("Add the learner's name.");
    const route = routeById(cleanText(input && input.courseRouteId, 60));
    const now = Date.now();
    const profile = {
      id: uid("learner"),
      sharedId: uid("share").replace(/^share-/, "").slice(0, 48),
      name,
      localReference: cleanText(input && input.localReference, 80),
      courseRouteId: route ? route.id : "",
      startDate: validDate(input && input.startDate),
      endDate: validDate(input && input.endDate),
      createdAt: now,
      updatedAt: now,
      snapshots: [],
    };
    const profiles = getProfiles();
    profiles.unshift(profile);
    saveProfiles(profiles);
    return clone(profile);
  }

  function getProfile(id) {
    return clone(getProfiles().find((profile) => profile.id === id) || null);
  }

  function updateProfile(id, patch) {
    const profiles = getProfiles();
    const index = profiles.findIndex((profile) => profile.id === id);
    if (index < 0) throw new Error("Learner profile not found.");
    const next = Object.assign({}, profiles[index]);
    if (patch && Object.prototype.hasOwnProperty.call(patch, "name")) {
      const name = cleanText(patch.name, 100);
      if (!name) throw new Error("Add the learner's name.");
      next.name = name;
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, "localReference")) next.localReference = cleanText(patch.localReference, 80);
    if (patch && Object.prototype.hasOwnProperty.call(patch, "courseRouteId")) {
      const route = routeById(cleanText(patch.courseRouteId, 60));
      next.courseRouteId = route ? route.id : "";
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, "startDate")) next.startDate = validDate(patch.startDate);
    if (patch && Object.prototype.hasOwnProperty.call(patch, "endDate")) next.endDate = validDate(patch.endDate);
    if (patch && patch.sharedId) next.sharedId = cleanText(patch.sharedId, 80);
    next.updatedAt = Date.now();
    profiles[index] = next;
    saveProfiles(profiles);
    return clone(next);
  }

  function removeProfile(id) {
    const profiles = getProfiles();
    const exists = profiles.some((profile) => profile.id === id);
    if (!exists) return false;
    saveProfiles(profiles.filter((profile) => profile.id !== id));
    write(STORAGE.reviews, getReviews().filter((review) => review.profileId !== id));
    write(STORAGE.observations, getObservations().filter((observation) => observation.profileId !== id));
    return true;
  }

  function sanitiseProgress(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("This is not an Evia progress record.");
    const personalFields = [...findPersonalFields(raw, new Set(), 0)];
    const route = routeFromIdentifier(
      raw.courseRouteId || raw.route || raw.courseId || raw.course || raw.c || raw.standard || raw.standardId,
      raw.pathway || raw.path || raw.p,
    );
    if (!route) throw new Error("The course in this Evia QR is not recognised.");
    const learningHours = Math.max(0, finiteNumber(
      raw.learningHours != null ? raw.learningHours : raw.loggedHours != null ? raw.loggedHours : raw.otjHours != null ? raw.otjHours : raw.glhHours != null ? raw.glhHours : raw.l,
      0,
    ));
    const learningTarget = Math.max(0, finiteNumber(
      raw.learningTarget != null ? raw.learningTarget : raw.targetHours != null ? raw.targetHours : raw.otjTarget != null ? raw.otjTarget : raw.glhTarget != null ? raw.glhTarget : raw.lt,
      route.learningTarget,
    ));
    const exportedAtValue = raw.exportedAt || raw.updatedAt || raw.timestamp || raw.u;
    const exportedAtNumber = typeof exportedAtValue === "number" ? exportedAtValue : Date.parse(exportedAtValue || "");
    const snapshot = {
      id: uid("snapshot"),
      source: "evia-qr",
      protocolVersion: Math.max(1, finiteNumber(raw.protocolVersion || raw.version || raw.v, 1)),
      courseRouteId: route.id,
      courseId: route.courseId,
      pathway: route.pathway,
      sharedId: cleanText(raw.sharedId || raw.learnerRef || raw.deviceRef || raw.r || raw.sid, 80),
      startDate: validDate(raw.startDate || raw.s),
      endDate: validDate(raw.endDate || raw.e),
      learningHours: Math.round(learningHours * 100) / 100,
      learningTarget: Math.round(learningTarget * 100) / 100,
      completedCodes: cleanCodes(raw.completedCodes || raw.complete || raw.coveredCodes || raw.codesComplete || raw.z || raw.cc),
      changedCodes: cleanCodes(raw.changedCodes || raw.newCodes || raw.sinceReview || raw.delta || raw.d),
      targets: cleanTargets(raw.targets || raw.currentTargets || raw.g || raw.tg),
      evidenceCount: Math.max(0, Math.round(finiteNumber(raw.evidenceCount || raw.records || raw.ec, 0))),
      lastReviewAt: cleanText(raw.lastReviewAt || raw.lastReview || raw.lr, 40),
      exportedAt: Number.isFinite(exportedAtNumber) ? exportedAtNumber : Date.now(),
      importedAt: Date.now(),
      ignoredPersonalFields: personalFields.slice(0, 30),
    };
    return snapshot;
  }

  function attachProgress(profileId, rawProgress) {
    const snapshot = sanitiseProgress(rawProgress);
    const profiles = getProfiles();
    const index = profiles.findIndex((profile) => profile.id === profileId);
    if (index < 0) throw new Error("Select a learner before importing progress.");
    const profile = Object.assign({}, profiles[index]);
    profile.courseRouteId = snapshot.courseRouteId;
    profile.startDate = snapshot.startDate || profile.startDate || "";
    profile.endDate = snapshot.endDate || profile.endDate || "";
    if (snapshot.sharedId) profile.sharedId = snapshot.sharedId;
    profile.snapshots = [snapshot, ...(Array.isArray(profile.snapshots) ? profile.snapshots : [])].slice(0, 30);
    profile.updatedAt = Date.now();
    profiles[index] = profile;
    saveProfiles(profiles);
    return clone(profile);
  }

  function latestSnapshot(profile) {
    return clone(profile && Array.isArray(profile.snapshots) && profile.snapshots.length ? profile.snapshots[0] : null);
  }

  function getReviews() {
    const reviews = read(STORAGE.reviews, []);
    return Array.isArray(reviews) ? reviews : [];
  }

  function saveReview(review) {
    const reviews = getReviews();
    const clean = clone(review || {});
    clean.id = clean.id || uid("review");
    clean.createdAt = clean.createdAt || Date.now();
    clean.updatedAt = Date.now();
    const index = reviews.findIndex((item) => item.id === clean.id);
    if (index >= 0) reviews[index] = clean;
    else reviews.unshift(clean);
    write(STORAGE.reviews, reviews);
    return clone(clean);
  }

  function reviewsForProfile(profileId) {
    return clone(getReviews().filter((review) => review.profileId === profileId).sort((a, b) => (b.reviewDate || "").localeCompare(a.reviewDate || "")));
  }

  function getObservations() {
    const observations = read(STORAGE.observations, []);
    return Array.isArray(observations) ? observations : [];
  }

  function saveObservation(observation) {
    const observations = getObservations();
    const clean = clone(observation || {});
    clean.id = clean.id || uid("observation");
    clean.createdAt = clean.createdAt || Date.now();
    clean.updatedAt = Date.now();
    const index = observations.findIndex((item) => item.id === clean.id);
    if (index >= 0) observations[index] = clean;
    else observations.unshift(clean);
    write(STORAGE.observations, observations);
    return clone(clean);
  }

  function observationsForProfile(profileId) {
    return clone(getObservations().filter((observation) => observation.profileId === profileId).sort((a, b) => (b.observationDate || "").localeCompare(a.observationDate || "")));
  }

  function timeOnCoursePercent(startDate, endDate, atDate) {
    const start = Date.parse(`${validDate(startDate)}T00:00:00`);
    const end = Date.parse(`${validDate(endDate)}T23:59:59`);
    const now = atDate ? new Date(atDate).getTime() : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return Math.round(Math.max(0, Math.min(1, (now - start) / (end - start))) * 100);
  }

  function addWeeks(dateString, weeks) {
    const base = validDate(dateString) || new Date().toISOString().slice(0, 10);
    const date = new Date(`${base}T12:00:00`);
    date.setDate(date.getDate() + Number(weeks || 0) * 7);
    return date.toISOString().slice(0, 10);
  }

  function metricsFor(profile, course) {
    const snapshot = latestSnapshot(profile) || {};
    const codes = course && Array.isArray(course.codes) ? course.codes : [];
    const validCompleted = cleanCodes(snapshot.completedCodes).filter((code) => !codes.length || codes.includes(code));
    const total = codes.length;
    const completed = validCompleted.length;
    const coverage = total ? Math.round((completed / total) * 100) : 0;
    const learningHours = finiteNumber(snapshot.learningHours, 0);
    const route = routeById((profile && profile.courseRouteId) || snapshot.courseRouteId);
    const learningTarget = finiteNumber(snapshot.learningTarget, route ? route.learningTarget : 0);
    const learningPercent = learningTarget ? Math.min(100, Math.round((learningHours / learningTarget) * 100)) : 0;
    const toc = timeOnCoursePercent((profile && profile.startDate) || snapshot.startDate, (profile && profile.endDate) || snapshot.endDate);
    return { total, completed, coverage, learningHours, learningTarget, learningPercent, toc, completedCodes: validCompleted };
  }

  function codesSinceLastReview(profileId, currentCodes) {
    const previous = reviewsForProfile(profileId)[0];
    const previousCodes = cleanCodes(previous && previous.snapshot && previous.snapshot.completedCodes);
    const before = new Set(previousCodes);
    return cleanCodes(currentCodes).filter((code) => !before.has(code));
  }

  async function loadCourse(routeId) {
    const route = routeById(routeId);
    if (!route) throw new Error("Choose the learner's course first.");
    const cacheKey = route.id;
    if (packCache.has(cacheKey)) return packCache.get(cacheKey);
    const response = await fetch(route.file, { cache: "force-cache" });
    if (!response.ok) throw new Error("Milos could not open this course pack.");
    const pack = await response.json();
    const pathway = route.pathway && Array.isArray(pack.pathways)
      ? pack.pathways.find((item) => item.id === route.pathway)
      : null;
    const source = pathway || pack;
    const result = {
      route: clone(route),
      packId: pack.id,
      title: route.title,
      shortTitle: route.shortTitle,
      courseType: route.courseType,
      coverageLabel: route.coverageLabel,
      learningLabel: route.learningLabel,
      learningTarget: finiteNumber(source.glhTargetHours || pack.glhTargetHours || pack.otjMinimumHours, route.learningTarget),
      codes: cleanCodes(source.codes || pack.codes),
      descriptions: clone(source.codeDescriptions || pack.codeDescriptions || {}),
      siteData: clone(source.siteData || pack.siteData || []),
      units: clone(source.units || pack.units || []),
    };
    packCache.set(cacheKey, result);
    return result;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value, includeTime) {
    if (!value) return "Not recorded";
    const date = typeof value === "number" ? new Date(value) : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
    if (!Number.isFinite(date.getTime())) return "Not recorded";
    return date.toLocaleString("en-GB", includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
  }

  global.MilosCore = Object.freeze({
    STORAGE,
    COURSE_ROUTES,
    addWeeks,
    attachProgress,
    cleanCodes,
    cleanMultiline,
    cleanTargets,
    cleanText,
    codesSinceLastReview,
    createProfile,
    escapeHtml,
    finiteNumber,
    formatDate,
    getObservations,
    getProfile,
    getProfiles,
    getReviews,
    getSettings,
    latestSnapshot,
    loadCourse,
    metricsFor,
    observationsForProfile,
    removeProfile,
    reviewsForProfile,
    routeById,
    routeFromIdentifier,
    sanitiseProgress,
    saveObservation,
    saveReview,
    saveSettings,
    timeOnCoursePercent,
    uid,
    updateProfile,
    validDate,
  });
})(window);
