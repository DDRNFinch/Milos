(function (global) {
  "use strict";

  const C = global.MilosCore;
  const M = global.MilosMedia;
  const Q = global.MilosQR;
  const B = global.MilosObservationBundle;
  if (!C || !M) return;

  const VERSION = "2.31";
  const VIDEO_BITS = 1600000;
  const AUDIO_BITS = 96000;
  const SOFT_WARNING_SECONDS = 8 * 60;
  const CHUNK_MS = 2000;
  const STATUS = Object.freeze({
    competent: { symbol: "●", label: "Competent" },
    action: { symbol: "◐", label: "Competent with actions" },
    further: { symbol: "○", label: "Further evidence required" }
  });
  const NVQ_UNIT_TITLES = Object.freeze({
    "102": "Conforming to general health, safety and welfare in the workplace",
    "234": "Erecting masonry cladding in the workplace",
    "235": "Erecting masonry structures in the workplace",
    "238": "Erecting thin joint masonry structures in the workplace",
    "300": "Confirming work activities and resources for an occupational work area in the workplace",
    "303": "Confirming the occupational method of work in the workplace",
    "313": "Erecting masonry to form architectural and decorative structures in the workplace",
    "502": "Developing and maintaining good occupational working relationships in the workplace",
    "690": "Repairing and maintaining masonry structures in the workplace",
    "701": "Setting out to form masonry structures in the workplace",
    "828": "Installing and forming specialist masonry elements in the workplace",
    "837": "Installing drainage in the workplace"
  });

  const state = {
    profile: null,
    course: null,
    courseType: "nvq",
    mode: "assessor",
    linkedParent: null,
    unit: "",
    unitTitle: "",
    category: null,
    area: null,
    location: "",
    activity: "",
    witnessName: "",
    witnessRole: "",
    sessionStartedAt: 0,
    introduction: null,
    clips: [],
    currentLo: null,
    currentOpp: null,
    acIndex: 0,
    acStartedOffsetMs: 0,
    acTimeline: [],
    currentStatus: "",
    stream: null,
    recorder: null,
    chunks: [],
    recordStartedAt: 0,
    timerId: 0,
    lastChunkAt: 0,
    pendingClip: null,
    signaturePads: {},
    savedRecord: null,
    exporting: false
  };

  function h(value) {
    return C.escapeHtml ? C.escapeHtml(value) : String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function clean(value, max) { return C.cleanText ? C.cleanText(value, max || 500) : String(value == null ? "" : value).trim().slice(0, max || 500); }
  function pad(value) { return String(value).padStart(2, "0"); }
  function localDate(timestamp) { const d = new Date(timestamp || Date.now()); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function localClock(timestamp, seconds) { const d = new Date(timestamp || Date.now()); return [pad(d.getHours()), pad(d.getMinutes()), ...(seconds ? [pad(d.getSeconds())] : [])].join(":"); }
  function fileStamp(timestamp) { return `${localDate(timestamp)}_${localClock(timestamp, true).replace(/:/g, "-")}`; }
  function durationLabel(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds || 0))), hours = Math.floor(total / 3600), mins = Math.floor((total % 3600) / 60), secs = total % 60;
    return hours ? `${pad(hours)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  }
  function offsetLabel(ms) { return durationLabel(Math.floor(Math.max(0, Number(ms || 0)) / 1000)); }
  function safeName(value) { return clean(value, 100).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 72) || "Evidence"; }
  function normaliseWords(value) { return String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
  function codeParts(code) { const match = String(code || "").match(/^(\d+)\.(\d+)\.(\d+)$/); return match ? { unit: match[1], lo: Number(match[2]), ac: Number(match[3]) } : null; }
  function desc(code) { return clean(state.course && state.course.descriptions && state.course.descriptions[code] || "Assessment criterion", 1200); }
  function routeFor(profile) { return profile && C.routeById ? C.routeById(profile.courseRouteId) : null; }
  function isKsb(profile) { return !!(routeFor(profile) && routeFor(profile).courseType === "apprenticeship"); }

  function allUnitCodes(course, unit) {
    return (Array.isArray(course && course.codes) ? course.codes : []).filter((code) => { const part = codeParts(code); return part && part.unit === String(unit); }).sort((a, b) => {
      const pa = codeParts(a), pb = codeParts(b); return (pa.lo - pb.lo) || (pa.ac - pb.ac);
    });
  }
  function availableUnits(course) {
    const fromPack = Array.isArray(course && course.units) ? course.units.map((item) => typeof item === "object" ? String(item.id || item.unit || item.number || "") : String(item)).filter(Boolean) : [];
    const fromCodes = (Array.isArray(course && course.codes) ? course.codes : []).map(codeParts).filter(Boolean).map((part) => part.unit);
    return [...new Set([...fromPack, ...fromCodes])].sort((a, b) => Number(a) - Number(b));
  }
  function unitTitle(unit) { return NVQ_UNIT_TITLES[String(unit)] || `Unit ${unit}`; }
  function losForUnit(unit) {
    const grouped = new Map();
    allUnitCodes(state.course, unit).forEach((code) => {
      const part = codeParts(code); if (!part) return;
      if (!grouped.has(part.lo)) grouped.set(part.lo, []);
      grouped.get(part.lo).push(code);
    });
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([number, codes]) => ({ number, id: `LO${number}`, codes, title: desc(codes[0]) || `Learning outcome ${number}` }));
  }
  function ksbAreas(course) {
    return (Array.isArray(course && course.siteData) ? course.siteData : []).flatMap((category) => (Array.isArray(category.jobs) ? category.jobs : []).filter((job) => Array.isArray(job.opps) && job.opps.length).map((job) => ({
      category: { id: category.id || "", title: category.title || "Course area" }, job
    })));
  }
  function exactMatchesForCodes(codes, sourceUnit) {
    if (state.courseType === "ksb") return [];
    const descriptions = state.course && state.course.descriptions || {};
    const entries = Object.keys(descriptions).map((code) => ({ code, part: codeParts(code), words: normaliseWords(descriptions[code]) })).filter((item) => item.part && item.words);
    const matches = [], seen = new Set();
    (codes || []).forEach((sourceCode) => {
      const sourceWords = normaliseWords(descriptions[sourceCode]); if (!sourceWords) return;
      entries.forEach((item) => {
        if (item.code === sourceCode || item.part.unit === String(sourceUnit) || item.words !== sourceWords) return;
        const key = `${sourceCode}=>${item.code}`; if (seen.has(key)) return; seen.add(key);
        matches.push({ sourceCode, mappedCode: item.code, unit: item.part.unit, mapping: "100% wording match", status: "Partially observed", competence: "" });
      });
    });
    return matches;
  }

  function layer() {
    let el = document.getElementById("milosVideoObservationLayer");
    if (!el) {
      el = document.createElement("section"); el.id = "milosVideoObservationLayer"; el.className = "mvo-layer"; el.hidden = true;
      el.setAttribute("aria-label", "Milos video evidence"); document.body.appendChild(el);
    }
    return el;
  }
  function show(html) { const el = layer(); el.hidden = false; el.innerHTML = html; el.scrollTop = 0; }
  function showError(message) {
    let el = layer().querySelector(".mvo-error");
    if (!el) { el = document.createElement("div"); el.className = "mvo-error"; layer().prepend(el); }
    el.textContent = message;
  }
  function header(title, kicker, close) {
    return `<header class="mvo-top"><div><small>${h(kicker || "Video evidence")}</small><strong>${h(title)}</strong></div>${close === false ? "" : '<button type="button" class="mvo-icon-button" data-mve-action="close" aria-label="Close">×</button>'}</header>`;
  }
  function stopStream() {
    if (state.stream) state.stream.getTracks().forEach((track) => { try { track.stop(); } catch (_) {} });
    state.stream = null;
  }
  function reset(keepParent) {
    stopStream(); clearInterval(state.timerId);
    const parent = keepParent ? state.linkedParent : null;
    Object.assign(state, {
      profile: null, course: null, courseType: "nvq", mode: "assessor", linkedParent: parent,
      unit: "", unitTitle: "", category: null, area: null, location: "", activity: "", witnessName: "", witnessRole: "",
      sessionStartedAt: 0, introduction: null, clips: [], currentLo: null, currentOpp: null, acIndex: 0, acStartedOffsetMs: 0, acTimeline: [], currentStatus: "",
      stream: null, recorder: null, chunks: [], recordStartedAt: 0, timerId: 0, lastChunkAt: 0, pendingClip: null, signaturePads: {}, savedRecord: null, exporting: false
    });
  }
  function closeLayer() {
    if (state.recorder && state.recorder.state !== "inactive") return;
    layer().hidden = true; layer().innerHTML = ""; reset(false);
  }

  function findStartButton(profileId) {
    return Array.from(document.querySelectorAll('[data-action="start-observation"][data-id]')).find((button) => button.dataset.id === profileId) || null;
  }
  function continueWritten() {
    const profileId = state.profile && state.profile.id, button = findStartButton(profileId);
    layer().hidden = true; layer().innerHTML = ""; reset(false);
    if (!button) { global.location.reload(); return; }
    button.dataset.mveBypass = "1"; button.click();
  }

  function openMethodPicker(profileId) {
    reset(false);
    const profile = C.getProfile(profileId); if (!profile) throw new Error("Choose a learner first.");
    state.profile = profile;
    show(`${header("Start observation", profile.name)}<div class="mvo-method-page"><p class="mvo-method-intro">Choose how you want to capture the evidence.</p><div class="mvo-method-list">
      <button type="button" data-mve-action="written"><span class="mvo-method-mark">W</span><span><strong>Written observation</strong><small>Use the standard Milos observation form.</small></span><i>›</i></button>
      <button type="button" data-mve-action="video"><span class="mvo-method-mark">V</span><span><strong>Video observation</strong><small>Record first. Add one LO/section action afterwards.</small></span><i>›</i></button>
      <button type="button" data-mve-action="witness"><span class="mvo-method-mark">T</span><span><strong>Witness video testimony</strong><small>Record the witness and mapped evidence without duplicating learner signatures.</small></span><i>›</i></button>
    </div></div>`);
  }

  async function launch(profileId, mode, linkedParent) {
    const profile = C.getProfile(profileId); if (!profile) throw new Error("Choose a learner first.");
    if (!profile.courseRouteId) throw new Error("Set the learner course or scan Evia before starting video evidence.");
    const course = await C.loadCourse(profile.courseRouteId);
    reset(false);
    state.profile = profile; state.course = course; state.courseType = isKsb(profile) ? "ksb" : "nvq"; state.mode = mode === "witness" ? "witness" : "assessor"; state.linkedParent = linkedParent || null;
    if (state.courseType === "ksb") renderAreaPicker(); else renderUnitPicker();
  }

  function renderUnitPicker() {
    const units = availableUnits(state.course), label = state.mode === "witness" ? "Witness video testimony" : "Video observation";
    show(`${header("Choose main unit", label)}<div class="mvo-page"><div class="mvo-context"><span>${h(state.profile.name)}</span><strong>${h(state.course.title)}</strong><small>Introduction first, then choose LOs in any order.</small></div>${units.length ? `<div class="mvo-unit-list">${units.map((unit) => `<button type="button" data-mve-action="choose-unit" data-unit="${h(unit)}"><span><strong>Unit ${h(unit)}</strong><small>${h(unitTitle(unit))}</small></span><i>›</i></button>`).join("")}</div>` : '<div class="mvo-empty"><strong>No NVQ units found</strong><p>This course pack needs unit.LO.AC codes for video observation.</p></div>'}</div>`);
  }
  function renderAreaPicker() {
    const list = ksbAreas(state.course), label = state.mode === "witness" ? "Witness video testimony" : "Video observation";
    show(`${header("Choose observation area", label)}<div class="mvo-page"><div class="mvo-context"><span>${h(state.profile.name)}</span><strong>${h(state.course.title)}</strong><small>KSB course · choose the practical sub-category you are observing.</small></div>${list.length ? `<div class="mvo-unit-list">${list.map(({ category, job }) => `<button type="button" data-mve-action="choose-area" data-category="${h(category.id)}" data-area="${h(job.id)}"><span><strong>${h(job.title)}</strong><small>${h(category.title)} · ${(job.opps || []).length} evidence prompt${(job.opps || []).length === 1 ? "" : "s"}</small></span><i>›</i></button>`).join("")}</div>` : '<div class="mvo-empty"><strong>No KSB sub-categories found</strong><p>This course pack does not contain practical observation areas.</p></div>'}</div>`);
  }
  function selectArea(categoryId, areaId) {
    const found = ksbAreas(state.course).find((item) => String(item.category.id) === String(categoryId) && String(item.job.id) === String(areaId));
    if (!found) return renderAreaPicker(); state.category = found.category; state.area = found.job; renderIntroduction();
  }

  function contextTitle() { return state.courseType === "ksb" ? (state.area && state.area.title || "KSB evidence") : `Unit ${state.unit}`; }
  function contextSubtitle() { return state.courseType === "ksb" ? (state.category && state.category.title || state.course.title) : state.unitTitle; }
  function renderIntroduction() {
    const witness = state.mode === "witness" ? `<div class="mvo-grid"><label><span>Witness name</span><input data-mve-field="witnessName" value="${h(state.witnessName)}" maxlength="100"></label><label><span>Witness role</span><input data-mve-field="witnessRole" value="${h(state.witnessRole)}" maxlength="120"></label></div>` : "";
    const what = state.courseType === "ksb" ? h(state.area.title) : `Unit ${h(state.unit)}`;
    show(`${header(contextTitle(), state.mode === "witness" ? "Witness introduction" : "Observation introduction")}<div class="mvo-page"><div class="mvo-context"><span>${h(state.profile.name)}</span><strong>${h(contextSubtitle())}</strong><small>${h(localDate())}</small></div><div class="mvo-grid"><label><span>Location</span><input data-mve-field="location" value="${h(state.location)}" maxlength="180" placeholder="Site, workshop or workplace"></label><label><span>Work/activity</span><input data-mve-field="activity" value="${h(state.activity)}" maxlength="220" placeholder="What is being carried out"></label></div>${witness}<div class="mvo-prompt-card"><strong>Introduction</strong><p>State assessor, learner, date, location, ${what} and the work being observed.${state.mode === "witness" ? " Ask the witness to state their role, relationship to the learner and what they have observed." : ""}</p></div><button type="button" class="mvo-primary" data-mve-action="record-intro">Start introduction recording</button></div>`);
  }

  function renderHub() {
    if (state.courseType === "ksb") return renderKsbHub();
    const los = losForUnit(state.unit);
    show(`${header(`Unit ${state.unit}`, state.mode === "witness" ? "Witness testimony · choose an LO" : "Choose an LO to observe")}<div class="mvo-page"><div class="mvo-session-strip"><span><strong>Introduction recorded</strong><small>${state.introduction ? `${localClock(state.introduction.startedAt, true)} · ${durationLabel(state.introduction.durationSeconds)}` : ""}</small></span><button type="button" data-mve-action="record-intro-again">Record again</button></div><div class="mvo-lo-list">${los.map((lo) => {
      const clips = state.clips.filter((clip) => Number(clip.lo) === Number(lo.number)), latest = clips.slice().sort((a, b) => b.startedAt - a.startedAt)[0];
      const mark = latest ? (STATUS[latest.ratingKey] && STATUS[latest.ratingKey].symbol || "●") : "›";
      return `<button type="button" data-mve-action="choose-lo" data-lo="${lo.number}"><span class="mvo-lo-main"><b>LO${lo.number}</b><span><strong>${h(lo.title)}</strong><small>${lo.codes.length} AC${lo.codes.length === 1 ? "" : "s"}${clips.length ? ` · ${clips.length} recording${clips.length === 1 ? "" : "s"}` : ""}</small></span></span><i class="mvo-status-mark">${mark}</i></button>`;
    }).join("")}</div><button type="button" class="mvo-primary" data-mve-action="finish-session" ${state.clips.length ? "" : "disabled"}>Finish observation</button><p class="mvo-note">No LO order is required. Record whichever LO matches the work happening now.</p></div>`);
  }
  function renderKsbHub() {
    const opps = state.area && state.area.opps || [];
    show(`${header(state.area.title, state.mode === "witness" ? "Witness testimony · choose evidence" : "Choose what to observe")}<div class="mvo-page"><div class="mvo-session-strip"><span><strong>Introduction recorded</strong><small>${state.introduction ? `${localClock(state.introduction.startedAt, true)} · ${durationLabel(state.introduction.durationSeconds)}` : ""}</small></span><button type="button" data-mve-action="record-intro-again">Record again</button></div><div class="mvo-lo-list">${opps.map((opp) => {
      const clips = state.clips.filter((clip) => clip.oppId === opp.id), latest = clips.slice().sort((a, b) => b.startedAt - a.startedAt)[0];
      const mark = latest ? (STATUS[latest.ratingKey] && STATUS[latest.ratingKey].symbol || "●") : "›";
      return `<button type="button" data-mve-action="choose-opp" data-opp="${h(opp.id)}"><span class="mvo-lo-main"><b>${h((opp.codes || []).join(" · "))}</b><span><strong>${h(opp.title)}</strong><small>${h(opp.question || opp.instruction || "Observation prompt")}${clips.length ? ` · ${clips.length} recording${clips.length === 1 ? "" : "s"}` : ""}</small></span></span><i class="mvo-status-mark">${mark}</i></button>`;
    }).join("")}</div><button type="button" class="mvo-primary" data-mve-action="finish-session" ${state.clips.length ? "" : "disabled"}>Finish observation</button><p class="mvo-note">Choose the practical section that matches the work happening now. You can record the same section again.</p></div>`);
  }

  function renderLoReady(loNumber) {
    state.currentLo = losForUnit(state.unit).find((lo) => Number(lo.number) === Number(loNumber)) || null;
    if (!state.currentLo) return renderHub();
    const first = state.currentLo.codes[0];
    show(`${header(`LO${state.currentLo.number}`, `Unit ${state.unit}`)}<div class="mvo-page"><div class="mvo-context"><span>${state.currentLo.codes.length} AC${state.currentLo.codes.length === 1 ? "" : "s"}</span><strong>${h(state.currentLo.title)}</strong><small>One video file for this LO. Decisions are taps only while recording; the LO action is written afterwards.</small></div><div class="mvo-prompt-card"><strong>First AC · ${h(first)}</strong><p>${h(desc(first))}</p></div><button type="button" class="mvo-primary" data-mve-action="record-lo">Start LO${state.currentLo.number} recording</button><button type="button" class="mvo-secondary" data-mve-action="back-hub">Back to LO list</button></div>`);
  }
  function renderOppReady(id) {
    state.currentOpp = (state.area && state.area.opps || []).find((opp) => opp.id === id) || null;
    if (!state.currentOpp) return renderHub();
    show(`${header(state.currentOpp.title, state.area.title)}<div class="mvo-page"><div class="mvo-context"><span>${h(state.category.title)}</span><strong>${h((state.currentOpp.codes || []).join(" · "))}</strong><small>${h((state.currentOpp.codes || []).map((code) => `${code}: ${desc(code)}`).join(" | "))}</small></div><div class="mvo-prompt-card"><strong>${state.mode === "witness" ? "Ask the witness" : "Ask / observe"}</strong><p>${h(state.currentOpp.question || state.currentOpp.instruction || state.currentOpp.title)}</p>${state.currentOpp.instruction && state.currentOpp.question ? `<p>${h(state.currentOpp.instruction)}</p>` : ""}</div><button type="button" class="mvo-primary" data-mve-action="record-opp">Start recording</button><button type="button" class="mvo-secondary" data-mve-action="back-hub">Back to list</button></div>`);
  }

  function chooseMimeType() {
    if (!global.MediaRecorder) return "";
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (/Safari/.test(navigator.userAgent || "") && !/Chrome|CriOS|Android/.test(navigator.userAgent || ""));
    const candidates = apple
      ? ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"]
      : ["video/webm;codecs=vp8,opus", "video/webm", "video/webm;codecs=vp9,opus", "video/mp4;codecs=h264,aac", "video/mp4"];
    return candidates.find((type) => !global.MediaRecorder.isTypeSupported || global.MediaRecorder.isTypeSupported(type)) || "";
  }
  function extensionForMime(type) { const value = String(type || "").toLowerCase(); return value.includes("mp4") ? "mp4" : value.includes("webm") ? "webm" : "video"; }
  function recordingName(kind, item, timestamp, ext) {
    if (kind === "intro") return `${safeName(contextTitle())}_Introduction_${fileStamp(timestamp)}.${ext}`;
    if (state.courseType === "ksb") return `${safeName(state.area.title)}_${safeName(item && item.title)}_${fileStamp(timestamp)}.${ext}`;
    return `${state.unit}_LO${item && item.number}_${fileStamp(timestamp)}.${ext}`;
  }
  async function openStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Camera recording is not available on this device/browser.");
    let stream;
    const preferred = {
      audio: { channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 }, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 } }
    };
    try { stream = await navigator.mediaDevices.getUserMedia(preferred); }
    catch (_) { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: { ideal: "environment" } } }); }
    const audio = stream.getAudioTracks();
    if (!audio.length || audio[0].readyState !== "live") { stream.getTracks().forEach((track) => track.stop()); throw new Error("Microphone audio is unavailable. Allow microphone access before recording evidence."); }
    audio[0].enabled = true;
    return stream;
  }
  function createRecorder(stream) {
    const mimeType = chooseMimeType(), options = { videoBitsPerSecond: VIDEO_BITS, audioBitsPerSecond: AUDIO_BITS };
    if (mimeType) options.mimeType = mimeType;
    try { return new MediaRecorder(stream, options); }
    catch (_) { return new MediaRecorder(stream); }
  }
  function attachPreview() {
    const video = document.getElementById("mveVideoPreview"); if (!video || !state.stream) return;
    video.srcObject = state.stream; video.muted = true; video.playsInline = true; video.play().catch(() => {});
  }
  function startTimer() {
    clearInterval(state.timerId);
    state.timerId = global.setInterval(() => {
      const seconds = Math.floor((Date.now() - state.recordStartedAt) / 1000), timer = document.getElementById("mveTimer"), hint = document.getElementById("mveRecordingHint");
      if (timer) { timer.textContent = durationLabel(seconds); timer.classList.toggle("is-warning", seconds >= SOFT_WARNING_SECONDS); }
      if (hint && seconds >= SOFT_WARNING_SECONDS) hint.textContent = "Long clip. Recording is still running; finish this LO/section when practical.";
      if (state.recorder && state.recorder.state === "recording" && state.lastChunkAt && Date.now() - state.lastChunkAt > 7000) {
        try { state.recorder.requestData(); } catch (_) {}
      }
    }, 500);
  }

  async function beginRecording(kind) {
    if (state.recorder && state.recorder.state !== "inactive") return;
    if (kind === "intro") {
      state.location = clean(layer().querySelector('[data-mve-field="location"]') && layer().querySelector('[data-mve-field="location"]').value, 180);
      state.activity = clean(layer().querySelector('[data-mve-field="activity"]') && layer().querySelector('[data-mve-field="activity"]').value, 220);
      if (state.mode === "witness") {
        state.witnessName = clean(layer().querySelector('[data-mve-field="witnessName"]') && layer().querySelector('[data-mve-field="witnessName"]').value, 100);
        state.witnessRole = clean(layer().querySelector('[data-mve-field="witnessRole"]') && layer().querySelector('[data-mve-field="witnessRole"]').value, 120);
        if (!state.witnessName || !state.witnessRole) throw new Error("Add the witness name and role before recording witness testimony.");
      }
    }
    state.stream = await openStream(); state.recorder = createRecorder(state.stream); state.chunks = []; state.recordStartedAt = Date.now(); state.lastChunkAt = Date.now();
    if (!state.sessionStartedAt) state.sessionStartedAt = state.recordStartedAt;
    state.recorder.addEventListener("dataavailable", (event) => { if (event.data && event.data.size) { state.chunks.push(event.data); state.lastChunkAt = Date.now(); } });
    state.recorder.addEventListener("error", () => showError("The device reported a recording error. Finish this clip and record the section again if needed."));
    state.stream.getTracks().forEach((track) => track.addEventListener("ended", () => { if (state.recorder && state.recorder.state === "recording") showError(`${track.kind === "audio" ? "Microphone" : "Camera"} stopped during recording.`); }));
    state.recorder.start(CHUNK_MS);
    if (kind === "intro") renderIntroRecording();
    else if (state.courseType === "ksb") { state.currentStatus = ""; renderKsbRecording(); }
    else { state.acIndex = 0; state.acStartedOffsetMs = 0; state.acTimeline = []; state.currentStatus = ""; renderNvqRecording(); }
    attachPreview(); startTimer();
  }

  function recordingShell(headHtml, controlHtml) {
    return `<div class="mvo-ac-screen"><div class="mvo-ac-head" id="mveRecordingHead">${headHtml}</div><div class="mvo-ac-video"><video id="mveVideoPreview" autoplay muted playsinline></video><span class="mvo-rec-badge">REC</span><span class="mve-mic-badge">MIC ON</span><span id="mveTimer" class="mvo-timer">00:00</span></div><div class="mvo-ac-controls">${controlHtml}<p id="mveRecordingHint" class="mvo-recording-hint">Recording continues until you finish this clip.</p></div></div>`;
  }
  function renderIntroRecording() {
    show(recordingShell(`<span>Introduction</span><strong>${h(contextTitle())} · ${h(state.profile.name)}</strong>`, `<p class="mvo-intro-cue">Assessor · learner · date · location · ${h(contextTitle())} · activity${state.mode === "witness" ? " · witness role" : ""}</p><button type="button" class="mvo-next-ac" data-mve-action="stop-intro">Finish introduction</button>`));
  }
  function currentAcCode() { return state.currentLo && state.currentLo.codes[state.acIndex] || ""; }
  function decisionButtons() {
    return `<div class="mvo-decision-bar" aria-label="Competence decision"><button type="button" data-mve-status="competent"><span>●</span><small>Competent</small></button><button type="button" data-mve-status="action"><span>◐</span><small>With actions</small></button><button type="button" data-mve-status="further"><span>○</span><small>Further evidence</small></button></div>`;
  }
  function renderNvqRecording() {
    const code = currentAcCode(), nextCode = state.currentLo.codes[state.acIndex + 1] || "";
    show(recordingShell(`<span id="mveAcCounter">AC ${state.acIndex + 1} of ${state.currentLo.codes.length} · ${h(code)}</span><strong id="mveAcDescription">${h(desc(code))}</strong>`, `${decisionButtons()}<button type="button" class="mvo-next-ac" data-mve-action="next-ac" disabled>${nextCode ? `Next AC · ${h(nextCode)}` : `Finish LO${state.currentLo.number} recording`}</button>${nextCode ? '<button type="button" class="mvo-finish-early" data-mve-action="finish-lo-here" disabled>Finish LO after this AC</button>' : ""}`));
  }
  function renderKsbRecording() {
    const opp = state.currentOpp;
    show(recordingShell(`<span>${h(state.area.title)} · ${h((opp.codes || []).join(" · "))}</span><strong>${h(opp.title)}</strong><small class="ksbv-question">${h(state.mode === "witness" ? `Witness prompt: ${opp.question || opp.instruction || "Describe what you observed, how often, how independently and to what standard."}` : (opp.question || opp.instruction || "Observe this activity"))}</small>`, `${decisionButtons()}<button type="button" class="mvo-next-ac" data-mve-action="finish-opp" disabled>Finish · ${h(opp.title)}</button>`));
  }

  function chooseStatus(status) {
    if (!STATUS[status] || !state.recorder || state.recorder.state !== "recording") return;
    state.currentStatus = status;
    layer().querySelectorAll("[data-mve-status]").forEach((button) => button.classList.toggle("is-selected", button.dataset.mveStatus === status));
    const next = layer().querySelector('[data-mve-action="next-ac"]'), early = layer().querySelector('[data-mve-action="finish-lo-here"]'), finishOpp = layer().querySelector('[data-mve-action="finish-opp"]');
    if (next) next.disabled = false; if (early) early.disabled = false; if (finishOpp) finishOpp.disabled = false;
  }
  function storeCurrentAcDecision() {
    if (!state.currentStatus) return false;
    const code = currentAcCode(), endedOffsetMs = Math.max(state.acStartedOffsetMs, Date.now() - state.recordStartedAt);
    state.acTimeline.push({ code, title: desc(code), startedOffsetMs: state.acStartedOffsetMs, endedOffsetMs, status: state.currentStatus, action: "", mapped: exactMatchesForCodes([code], state.unit) });
    return true;
  }
  function updateNvqRecordingPanel() {
    const code = currentAcCode(), nextCode = state.currentLo.codes[state.acIndex + 1] || "";
    const counter = document.getElementById("mveAcCounter"), description = document.getElementById("mveAcDescription"), next = layer().querySelector('[data-mve-action="next-ac"]'), early = layer().querySelector('[data-mve-action="finish-lo-here"]');
    if (counter) counter.textContent = `AC ${state.acIndex + 1} of ${state.currentLo.codes.length} · ${code}`;
    if (description) description.textContent = desc(code);
    layer().querySelectorAll("[data-mve-status]").forEach((button) => button.classList.remove("is-selected"));
    if (next) { next.disabled = true; next.textContent = nextCode ? `Next AC · ${nextCode}` : `Finish LO${state.currentLo.number} recording`; }
    if (early) { early.disabled = true; early.hidden = !nextCode; }
  }
  async function advanceAc(finishHere) {
    if (!storeCurrentAcDecision()) return;
    const isLast = state.acIndex >= state.currentLo.codes.length - 1;
    if (finishHere || isLast) { await finishCurrentClip(); return; }
    state.acIndex += 1; state.acStartedOffsetMs = Date.now() - state.recordStartedAt; state.currentStatus = ""; updateNvqRecordingPanel();
  }

  async function finaliseMedia(kind, item) {
    const recorder = state.recorder; if (!recorder || recorder.state === "inactive") throw new Error("No recording is active.");
    clearInterval(state.timerId);
    const endedAt = Date.now(), stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
    try { recorder.requestData(); } catch (_) {}
    recorder.stop(); await stopped;
    const type = recorder.mimeType || (state.chunks[0] && state.chunks[0].type) || "video/webm", blob = new Blob(state.chunks, { type });
    if (!blob.size) { stopStream(); state.recorder = null; throw new Error("The recording file was empty. Record this section again."); }
    const ext = extensionForMime(type), filename = recordingName(kind, item, state.recordStartedAt, ext);
    let file; try { file = new File([blob], filename, { type, lastModified: state.recordStartedAt }); } catch (_) { file = blob; file.name = filename; }
    const media = await M.putFile(file);
    const result = { media, filename, mimeType: type, startedAt: state.recordStartedAt, endedAt, durationSeconds: Math.max(1, Math.round((endedAt - state.recordStartedAt) / 1000)) };
    stopStream(); state.recorder = null; state.chunks = []; return result;
  }
  async function stopIntro() {
    const saved = await finaliseMedia("intro", null);
    if (state.introduction && state.introduction.media && state.introduction.media.id) { try { await M.removeFile(state.introduction.media.id); } catch (_) {} }
    state.introduction = Object.assign({ kind: "intro", lo: null, loTitle: "Introduction", codes: [], mapped: [], action: "", source: state.mode }, saved);
    renderHub();
  }
  function ratingKeyFor(items) {
    if ((items || []).some((item) => item.status === "further")) return "further";
    if ((items || []).some((item) => item.status === "action")) return "action";
    return "competent";
  }
  async function finishCurrentClip() {
    if (state.courseType === "ksb") {
      if (!state.currentStatus) return;
      const opp = state.currentOpp, saved = await finaliseMedia("evidence", opp), ratingKey = state.currentStatus;
      state.pendingClip = Object.assign({ kind: "ksb", oppId: opp.id, lo: null, loTitle: opp.title, codes: (opp.codes || []).slice(), acTimeline: (opp.codes || []).map((code) => ({ code, title: desc(code), startedOffsetMs: 0, endedOffsetMs: Math.max(0, Date.now() - state.recordStartedAt), status: ratingKey, action: "", mapped: [] })), mapped: [], ratingKey, status: ratingKey, action: "", source: state.mode }, saved);
    } else {
      const lo = state.currentLo, saved = await finaliseMedia("lo", lo), ratingKey = ratingKeyFor(state.acTimeline);
      state.pendingClip = Object.assign({ kind: "lo", lo: lo.number, loTitle: lo.title, codes: state.acTimeline.map((item) => item.code), acTimeline: state.acTimeline.map((item) => Object.assign({}, item)), mapped: state.acTimeline.flatMap((item) => item.mapped || []), ratingKey, status: ratingKey, action: "", source: state.mode }, saved);
    }
    renderClipReview();
  }
  function renderClipReview() {
    const clip = state.pendingClip; if (!clip) return renderHub();
    const nonCompetent = clip.ratingKey !== "competent", label = state.courseType === "ksb" ? clip.loTitle : `LO${clip.lo}`;
    const lines = (clip.acTimeline || []).map((item) => `<li><b>${h(item.code)}</b><span>${h(STATUS[item.status] ? STATUS[item.status].label : "Decision")}</span></li>`).join("");
    show(`${header(`${label} recorded`, "Add the written action after recording", false)}<div class="mvo-page"><div class="mvo-summary-mini"><span>${h(localClock(clip.startedAt, true))} · ${h(durationLabel(clip.durationSeconds))}</span><strong>${h(clip.loTitle)}</strong><small>${h(clip.filename)}</small></div><div class="mve-decision-summary"><strong>Recorded decisions</strong><ul>${lines}</ul></div><label class="mve-lo-action"><span>${nonCompetent ? "Action / further evidence for this LO" : "LO note / action (optional)"}</span><textarea data-mve-field="clipAction" rows="4" maxlength="2000" placeholder="Write one action for the whole LO/section after the camera has stopped"></textarea></label><button type="button" class="mvo-primary" data-mve-action="save-clip-review">Save ${h(label)} and return</button><button type="button" class="mvo-secondary" data-mve-action="discard-clip">Discard this recording</button><p class="mvo-note">No typing is required while the camera is recording.</p></div>`);
  }
  async function saveClipReview() {
    const clip = state.pendingClip; if (!clip) return renderHub();
    const action = clean(layer().querySelector('[data-mve-field="clipAction"]') && layer().querySelector('[data-mve-field="clipAction"]').value, 2000);
    if (clip.ratingKey !== "competent" && !action) return showError("Add one action or further-evidence note for this LO/section.");
    clip.action = action; state.clips.push(clip); state.pendingClip = null; state.currentLo = null; state.currentOpp = null; state.acTimeline = []; state.currentStatus = ""; renderHub();
  }
  async function discardPendingClip() {
    const clip = state.pendingClip; if (clip && clip.media && clip.media.id) { try { await M.removeFile(clip.media.id); } catch (_) {} }
    state.pendingClip = null; state.currentLo = null; state.currentOpp = null; state.acTimeline = []; state.currentStatus = ""; renderHub();
  }

  function initSignaturePads(names) {
    state.signaturePads = {};
    names.forEach((name) => {
      const canvas = document.getElementById(`mve${name[0].toUpperCase()}${name.slice(1)}Signature`);
      if (canvas) state.signaturePads[name] = M.signaturePad(canvas);
    });
  }
  function signatureBlock(name, label) {
    return `<div class="mvo-signature"><div><strong>${h(label)}</strong><button type="button" data-mve-action="clear-signature" data-pad="${h(name)}">Clear</button></div><canvas id="mve${name[0].toUpperCase()}${name.slice(1)}Signature"></canvas></div>`;
  }
  function renderSignatures() {
    const settings = C.getSettings ? C.getSettings() : {}, assessorName = clean(settings.assessorName || "", 100);
    if (state.mode === "witness" && state.linkedParent) {
      show(`${header("Witness signature", "Linked to the completed observation")}<div class="mvo-page"><div class="mvo-summary-mini"><span>${h(state.witnessName)}</span><strong>${h(contextTitle())}</strong><small>Assessor and learner signatures are already held on the main observation.</small></div>${signatureBlock("witness", "Witness signature")}<button type="button" class="mvo-primary" data-mve-action="complete-session">Add witness evidence</button></div>`);
      requestAnimationFrame(() => initSignaturePads(["witness"])); return;
    }
    if (state.mode === "witness") {
      show(`${header("Sign witness testimony", contextTitle())}<div class="mvo-page"><label class="mvo-name-field"><span>Assessor name</span><input data-mve-field="assessorName" value="${h(assessorName)}" maxlength="100"></label>${signatureBlock("assessor", "Assessor signature")}${signatureBlock("witness", "Witness signature")}<button type="button" class="mvo-primary" data-mve-action="complete-session">Complete witness testimony</button><p class="mvo-note">A separate learner signature is not required for standalone witness testimony.</p></div>`);
      requestAnimationFrame(() => initSignaturePads(["assessor", "witness"])); return;
    }
    show(`${header("Sign observation", contextTitle())}<div class="mvo-page"><label class="mvo-name-field"><span>Assessor name</span><input data-mve-field="assessorName" value="${h(assessorName)}" maxlength="100"></label>${signatureBlock("assessor", "Assessor signature")}${signatureBlock("learner", "Learner signature")}<button type="button" class="mvo-primary" data-mve-action="complete-session">Complete observation</button></div>`);
    requestAnimationFrame(() => initSignaturePads(["assessor", "learner"]));
  }

  function acEvidence() { return state.clips.flatMap((clip) => (clip.acTimeline || []).map((ac) => Object.assign({ lo: clip.lo, loTitle: clip.loTitle, clipStartedAt: clip.startedAt, filename: clip.filename, clipAction: clip.action || "" }, ac))); }
  function mappedEvidence() {
    const map = new Map();
    acEvidence().forEach((ac) => (ac.mapped || []).forEach((item) => { const key = `${item.sourceCode}=>${item.mappedCode}`; if (!map.has(key)) map.set(key, Object.assign({}, item, { lo: ac.lo, clipStartedAt: ac.clipStartedAt, acOffsetMs: ac.startedOffsetMs, status: "Partially observed", competence: "" })); }));
    return [...map.values()].sort((a, b) => a.mappedCode.localeCompare(b.mappedCode, undefined, { numeric: true }));
  }
  function aggregateRating(items) { return STATUS[ratingKeyFor(items)] ? STATUS[ratingKeyFor(items)].label : "Competent"; }
  function recordSections() {
    return state.clips.map((clip, index) => ({
      key: `video::${state.courseType}::${safeName(contextTitle())}::${index + 1}`,
      categoryId: "video-evidence", categoryTitle: state.mode === "witness" ? "Witness video testimony" : "Video observation",
      jobId: state.courseType === "ksb" ? (state.area.id || "ksb") : `unit-${state.unit}`,
      jobTitle: contextTitle(), opportunityId: `clip-${index + 1}`, opportunityTitle: clip.lo ? `LO${clip.lo} · ${clip.loTitle}` : clip.loTitle,
      instruction: "Timestamped video evidence", question: "", codes: (clip.codes || []).slice()
    }));
  }
  function mediaList() { return [state.introduction, ...state.clips].filter(Boolean).map((clip) => Object.assign({}, clip.media, { name: clip.filename, startedAt: clip.startedAt, lo: clip.lo, kind: clip.kind, source: state.mode })); }
  function timelineList() { return [state.introduction, ...state.clips].filter(Boolean).map((clip) => ({ kind: clip.kind, lo: clip.lo, loTitle: clip.loTitle, oppId: clip.oppId || "", codes: clip.codes || [], mediaId: clip.media.id, filename: clip.filename, startedAt: clip.startedAt, endedAt: clip.endedAt, durationSeconds: clip.durationSeconds, offsetMs: clip.startedAt - state.sessionStartedAt, acTimeline: clip.acTimeline || [], action: clip.action || "", source: state.mode })); }
  function criteriaList(evidence) {
    const latest = new Map(); evidence.forEach((item) => latest.set(item.code, item));
    return [...latest.entries()].map(([code, item]) => ({ code, description: desc(code), outcome: "Observed", included: true, competence: STATUS[item.status] ? STATUS[item.status].label : "" }));
  }

  async function completeSession() {
    const evidence = acEvidence(), endedAt = Math.max(state.introduction && state.introduction.endedAt || 0, ...state.clips.map((clip) => clip.endedAt));
    if (state.mode === "witness" && state.linkedParent) return completeLinkedWitness(evidence, endedAt);
    const assessorName = clean(layer().querySelector('[data-mve-field="assessorName"]') && layer().querySelector('[data-mve-field="assessorName"]').value, 100);
    if (!assessorName) return showError("Add the assessor name.");
    const assessorPad = state.signaturePads.assessor, learnerPad = state.signaturePads.learner, witnessPad = state.signaturePads.witness;
    if (!assessorPad || assessorPad.isEmpty()) return showError("Assessor signature is required.");
    if (state.mode === "assessor" && (!learnerPad || learnerPad.isEmpty())) return showError("Learner signature is required.");
    if (state.mode === "witness" && (!witnessPad || witnessPad.isEmpty())) return showError("Witness signature is required.");
    const mapped = mappedEvidence(), observedCodes = [...new Set(evidence.map((item) => item.code))], mappedCodes = [...new Set(mapped.map((item) => item.mappedCode))];
    const record = {
      videoObservationV1: true, videoEvidenceV231: true, videoObservationVersion: 3, method: state.mode === "witness" ? "Witness video testimony" : "Video observation", mode: state.mode,
      profileId: state.profile.id, courseRouteId: state.profile.courseRouteId, courseId: state.course.id || state.course.courseId || "", courseTitle: state.course.title || "", coverageLabel: state.course.coverageLabel || (state.courseType === "ksb" ? "KSB" : "AC"),
      courseType: state.courseType, observationDate: localDate(state.sessionStartedAt), startTime: localClock(state.sessionStartedAt), endTime: localClock(endedAt), sessionStartedAt: state.sessionStartedAt, sessionEndedAt: endedAt,
      location: state.location, activityObserved: state.activity || `${state.mode === "witness" ? "Witness testimony for" : "Video observation of"} ${contextTitle()}`,
      unitNumber: state.courseType === "nvq" ? state.unit : "", unitTitle: state.courseType === "nvq" ? state.unitTitle : "", categoryTitle: state.courseType === "ksb" ? state.category.title : "", jobTitle: contextTitle(), opportunityTitle: `${state.mode === "witness" ? "Witness video" : "Video observation"} · ${contextTitle()}`,
      sections: recordSections(), criteria: criteriaList(evidence), mappedCriteria: mappedCodes.map((code) => ({ code, description: desc(code), outcome: "Partially observed", included: true, competence: "", mapping: "100% wording match" })), observedCodes, mappedEvidence: mapped,
      videoTimeline: timelineList(), media: mediaList(), rating: aggregateRating(evidence), actions: state.clips.filter((clip) => clip.action).map((clip) => `${clip.lo ? `LO${clip.lo}` : clip.loTitle}: ${clip.action}`).join("\n"),
      assessorName, witnessName: state.witnessName, witnessRole: state.witnessRole, assessorSignature: assessorPad.toDataUrl(), learnerSignature: learnerPad && !learnerPad.isEmpty() ? learnerPad.toDataUrl() : "", witnessSignature: witnessPad && !witnessPad.isEmpty() ? witnessPad.toDataUrl() : "", witnessEvidence: [], completedAt: Date.now()
    };
    let saved = C.saveObservation(record);
    if (Q && typeof Q.observationPayload === "function") { try { const qrPayload = Q.observationPayload(saved, state.profile, state.course); saved = C.saveObservation(Object.assign({}, saved, { qrPayload })); } catch (_) {} }
    state.savedRecord = saved; renderComplete(saved);
  }

  async function completeLinkedWitness(evidence, endedAt) {
    const witnessPad = state.signaturePads.witness;
    if (!witnessPad || witnessPad.isEmpty()) return showError("Witness signature is required.");
    const parent = C.getObservations().find((item) => item.id === state.linkedParent.id) || state.linkedParent;
    const addition = {
      id: `witness-${Date.now().toString(36)}`, witnessName: state.witnessName, witnessRole: state.witnessRole, location: state.location, activityObserved: state.activity,
      startedAt: state.sessionStartedAt, endedAt, videoTimeline: timelineList(), media: mediaList(), criteria: criteriaList(evidence), mappedEvidence: mappedEvidence(),
      actions: state.clips.filter((clip) => clip.action).map((clip) => `${clip.lo ? `LO${clip.lo}` : clip.loTitle}: ${clip.action}`).join("\n"), witnessSignature: witnessPad.toDataUrl()
    };
    const combinedMedia = [...(parent.media || []), ...addition.media].filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index);
    const combinedTimeline = [...(parent.videoTimeline || []), ...addition.videoTimeline.map((clip) => Object.assign({}, clip, { source: "witness", witnessName: addition.witnessName }))].sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
    const witnessEvidence = [...(parent.witnessEvidence || []), addition];
    const observedCodes = [...new Set([...(parent.observedCodes || []), ...evidence.map((item) => item.code)])];
    const saved = C.saveObservation(Object.assign({}, parent, {
      videoEvidenceV231: true, media: combinedMedia, videoTimeline: combinedTimeline, witnessEvidence, observedCodes,
      actions: [parent.actions || "", addition.actions || ""].filter(Boolean).join("\n"), sessionEndedAt: Math.max(Number(parent.sessionEndedAt || 0), endedAt), endTime: localClock(Math.max(Number(parent.sessionEndedAt || 0), endedAt)), completedAt: Date.now()
    }));
    let finalSaved = saved;
    if (Q && typeof Q.observationPayload === "function") { try { const qrPayload = Q.observationPayload(saved, state.profile, state.course); finalSaved = C.saveObservation(Object.assign({}, saved, { qrPayload })); } catch (_) {} }
    state.savedRecord = finalSaved; state.linkedParent = null; renderComplete(finalSaved);
  }

  function renderComplete(record) {
    const witnessCount = (record.witnessEvidence || []).length, directClips = (record.videoTimeline || []).filter((clip) => clip.kind !== "intro" && clip.source !== "witness").length;
    show(`${header("Observation complete", record.method)}<div class="mvo-page"><div class="mvo-complete-mark">✓</div><div class="mvo-summary-mini"><span>${h(state.profile ? state.profile.name : "Learner")}</span><strong>${h(record.jobTitle || contextTitle())} · ${h(record.rating)}</strong><small>${directClips} observation video${directClips === 1 ? "" : "s"}${witnessCount ? ` · ${witnessCount} linked witness testimon${witnessCount === 1 ? "y" : "ies"}` : ""}</small></div><button type="button" class="mvo-primary" data-mve-action="download-complete">Download complete evidence ZIP</button>${record.mode !== "witness" ? '<button type="button" class="mvo-secondary" data-mve-action="add-linked-witness">Add witness testimony</button>' : ""}<button type="button" class="mvo-secondary" data-mve-action="done">Done</button><p class="mvo-note">The ZIP contains the professional PDF and every stored observation/witness video. Videos are never replayed or transcoded during export.</p></div>`);
  }

  function legacyLinkedWitnesses(record) {
    if (!record || record.mode === "witness") return [];
    const end = Number(record.sessionEndedAt || record.completedAt || 0);
    return C.getObservations().filter((item) => item.id !== record.id && item.mode === "witness" && item.profileId === record.profileId && item.observationDate === record.observationDate && String(item.unitNumber || "") === String(record.unitNumber || "") && Math.abs(Number(item.sessionStartedAt || item.createdAt || 0) - end) <= 4 * 60 * 60 * 1000);
  }
  function exportView(record) {
    const legacyWitnesses = legacyLinkedWitnesses(record);
    if (!legacyWitnesses.length) return record;
    return Object.assign({}, record, {
      witnessEvidence: [...(record.witnessEvidence || []), ...legacyWitnesses.map((item) => ({ witnessName: item.witnessName, witnessRole: item.witnessRole, location: item.location, activityObserved: item.activityObserved, startedAt: item.sessionStartedAt, endedAt: item.sessionEndedAt, videoTimeline: item.videoTimeline || [], media: item.media || [], criteria: item.criteria || [], mappedEvidence: item.mappedEvidence || [], actions: item.actions || "", witnessSignature: item.witnessSignature || "" }))],
      media: [...(record.media || []), ...legacyWitnesses.flatMap((item) => item.media || [])].filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
    });
  }

  function groupMapped(items) {
    return (items || []).reduce((groups, item) => { const unit = item.unit || (codeParts(item.mappedCode) || {}).unit || "Other"; (groups[unit] ||= []).push(item); return groups; }, {});
  }
  function buildProfessionalPdf(input, profile) {
    const record = exportView(input), JsPDF = global.jspdf && global.jspdf.jsPDF;
    if (typeof JsPDF !== "function") throw new Error("The offline PDF builder is unavailable.");
    const doc = new JsPDF({ unit: "mm", format: "a4" }), W = 210, margin = 16, contentW = 178; let y = 18;
    const navy = [37, 73, 115], grey = [94, 106, 120], pale = [243, 247, 251], line = [218, 226, 235];
    function newPage() { doc.addPage(); y = 18; pageHeader(); }
    function ensure(space) { if (y + space > 278) newPage(); }
    function pageHeader() { doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...navy); doc.text("MILOS · ASSESSOR EVIDENCE", margin, 10); doc.setDrawColor(...line); doc.line(margin, 13, W - margin, 13); doc.setTextColor(35, 39, 46); }
    function title(text, sub) { doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...navy); doc.text(text, margin, y); y += 7; doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...grey); if (sub) { const lines = doc.splitTextToSize(sub, contentW); doc.text(lines, margin, y); y += lines.length * 4 + 3; } doc.setTextColor(35, 39, 46); }
    function section(text) { ensure(12); y += 2; doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...navy); doc.text(text, margin, y); y += 5; doc.setDrawColor(...line); doc.line(margin, y, W - margin, y); y += 5; doc.setTextColor(35, 39, 46); }
    function infoRow(label, value) { const lines = doc.splitTextToSize(String(value || "—"), 124); const height = Math.max(8, lines.length * 4.3 + 3); ensure(height); doc.setFillColor(...pale); doc.roundedRect(margin, y, contentW, height, 1.5, 1.5, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...grey); doc.text(label, margin + 3, y + 5); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(35, 39, 46); doc.text(lines, margin + 47, y + 5); y += height + 2; }
    function paragraph(text, x, width, size) { const lines = doc.splitTextToSize(String(text || ""), width); doc.setFont("helvetica", "normal"); doc.setFontSize(size || 9.5); doc.text(lines, x, y); y += lines.length * ((size || 9.5) * 0.45) + 2; }
    function decisionLabel(keyOrLabel) { return STATUS[keyOrLabel] ? STATUS[keyOrLabel].label : String(keyOrLabel || "Decision recorded"); }
    function evidenceCard(clip, witnessName) {
      const acs = clip.acTimeline || [], action = clip.action || "", heading = clip.kind === "intro" ? "Introduction" : (clip.lo ? `LO${clip.lo} · ${clip.loTitle || ""}` : clip.loTitle || "Evidence clip");
      const statusLines = acs.map((ac) => `${ac.code} — ${decisionLabel(ac.status)}`);
      const estimated = 19 + Math.min(32, statusLines.length * 4) + (action ? 12 : 0); ensure(estimated);
      doc.setDrawColor(...line); doc.setFillColor(252, 253, 255); doc.roundedRect(margin, y, contentW, Math.max(20, estimated), 2, 2, "FD");
      let cy = y + 6; doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...navy); doc.text(heading, margin + 4, cy); cy += 5; doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...grey);
      const meta = `${localDate(clip.startedAt)} ${localClock(clip.startedAt, true)} · ${durationLabel(clip.durationSeconds)} · ${clip.filename || "video"}${witnessName ? ` · Witness: ${witnessName}` : ""}`;
      const metaLines = doc.splitTextToSize(meta, contentW - 8); doc.text(metaLines, margin + 4, cy); cy += metaLines.length * 3.8 + 2;
      doc.setTextColor(35, 39, 46); doc.setFontSize(9);
      statusLines.forEach((text) => { const lines = doc.splitTextToSize(text, contentW - 12); doc.text(lines, margin + 6, cy); cy += lines.length * 4; });
      if (action) { cy += 1; doc.setFont("helvetica", "bold"); doc.text("LO/section action", margin + 4, cy); cy += 4; doc.setFont("helvetica", "normal"); const lines = doc.splitTextToSize(action, contentW - 8); doc.text(lines, margin + 4, cy); cy += lines.length * 4; }
      y += Math.max(20, estimated) + 3;
    }
    function signature(label, data, name) {
      if (!data) return; ensure(29); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(label, margin, y); if (name) { doc.setFont("helvetica", "normal"); doc.setTextColor(...grey); doc.text(name, margin + 34, y); doc.setTextColor(35, 39, 46); } y += 3;
      try { doc.addImage(data, "JPEG", margin, y, 58, 17); } catch (_) {} y += 21;
    }

    pageHeader();
    const witnessCount = (record.witnessEvidence || []).length;
    title(witnessCount ? "Video Observation & Witness Evidence" : (record.mode === "witness" ? "Witness Video Testimony" : "Video Observation"), `${record.courseTitle || "Course evidence"} · ${record.observationDate || ""}`);
    infoRow("Learner", profile && profile.name || ""); infoRow("Assessor", record.assessorName); infoRow("Course", record.courseTitle);
    infoRow(record.courseType === "ksb" ? "Observation area" : "Main unit", record.courseType === "ksb" ? (record.jobTitle || "") : `Unit ${record.unitNumber || ""} — ${record.unitTitle || ""}`);
    infoRow("Date / time", `${record.observationDate || ""} · ${record.startTime || ""}–${record.endTime || ""}`); infoRow("Location", record.location); infoRow("Work / activity", record.activityObserved); infoRow("Overall decision", record.rating);

    section("Recorded evidence");
    (record.videoTimeline || []).filter((clip) => clip.source !== "witness").forEach((clip) => evidenceCard(clip, ""));
    (record.witnessEvidence || []).forEach((witness, index) => {
      section(`Witness testimony${record.witnessEvidence.length > 1 ? ` ${index + 1}` : ""}`);
      infoRow("Witness", witness.witnessName); infoRow("Witness role", witness.witnessRole); if (witness.location) infoRow("Location", witness.location);
      (witness.videoTimeline || []).forEach((clip) => evidenceCard(clip, witness.witnessName));
      if (witness.actions) { ensure(12); doc.setFont("helvetica", "bold"); doc.text("Witness actions", margin, y); y += 5; paragraph(witness.actions, margin, contentW, 9.5); }
      signature("Witness signature", witness.witnessSignature, witness.witnessName);
    });

    const mapped = record.mappedEvidence || [];
    if (mapped.length) {
      section("Mapped supporting evidence");
      const groups = groupMapped(mapped);
      Object.keys(groups).sort((a, b) => Number(a) - Number(b)).forEach((unit) => {
        ensure(11); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text(`Unit ${unit}`, margin, y); y += 4; doc.setFont("helvetica", "normal"); doc.setFontSize(9);
        const text = groups[unit].map((item) => `${item.mappedCode} (from ${item.sourceCode})`).join(" · "); paragraph(text, margin + 3, contentW - 3, 9);
      });
      ensure(10); doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(...grey); paragraph("Mapped ACs are supporting evidence only and remain partially observed. Competence is not copied automatically.", margin, contentW, 8.5); doc.setTextColor(35, 39, 46);
    }

    if (record.actions) { section("Actions / further evidence"); paragraph(record.actions, margin, contentW, 9.5); }
    section("Signatures"); signature("Assessor", record.assessorSignature, record.assessorName); signature("Learner", record.learnerSignature, profile && profile.name || ""); if (record.mode === "witness" && record.witnessSignature) signature("Witness", record.witnessSignature, record.witnessName);

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page); doc.setDrawColor(...line); doc.line(margin, 286, W - margin, 286); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...grey); doc.text(`Created in Milos ${VERSION} · Page ${page} of ${pages}`, margin, 291); doc.text("Video timestamps use the actual recording time for each file.", W - margin, 291, { align: "right" });
    }
    return doc.output("blob");
  }

  function downloadBlob(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
  async function exportRecord(input) {
    if (state.exporting) return; state.exporting = true;
    const record = exportView(input), profile = C.getProfile(record.profileId); if (!profile) { state.exporting = false; throw new Error("The learner profile for this observation is no longer available."); }
    try {
      const base = safeName(`${record.jobTitle || (record.unitNumber ? `Unit${record.unitNumber}` : "Observation")}_${record.observationDate || localDate()}`), entries = [{ name: `${base}_Evidence_Record.pdf`, blob: buildProfessionalPdf(record, profile), date: new Date(record.completedAt || Date.now()) }], missing = [];
      for (const item of (record.media || [])) {
        let stored = null; try { stored = await M.getFile(item.id); } catch (_) {}
        if (!stored || !(stored.blob instanceof Blob)) { missing.push(item.name || item.id); continue; }
        entries.push({ name: clean(item.name || stored.name, 170) || "video", blob: stored.blob, date: new Date(Number(stored.createdAt || item.startedAt || Date.now())) });
      }
      if (missing.length) throw new Error(`${missing.length} video file${missing.length === 1 ? " is" : "s are"} missing from this device, so a complete ZIP was not created.`);
      if (!B || typeof B.makeZip !== "function") throw new Error("Compressed ZIP export is unavailable. Update Milos and try again.");
      const zip = await B.makeZip(entries); downloadBlob(zip, `${base}_Complete_Evidence.zip`);
    } finally { state.exporting = false; }
  }

  function patchHistory(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-action="observation-download"][data-id]').forEach((button) => {
      const record = C.getObservations().find((item) => item.id === button.dataset.id);
      if (record && (record.videoEvidenceV231 || record.videoObservationV1)) button.textContent = "Download complete evidence ZIP";
    });
  }
  function observeUi() {
    patchHistory(document);
    if (!global.MutationObserver) return;
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node.nodeType === 1) patchHistory(node); }))).observe(document.getElementById("milosApp") || document.body, { childList: true, subtree: true });
  }

  document.addEventListener("click", async (event) => {
    const start = event.target.closest && event.target.closest('[data-action="start-observation"][data-id]');
    if (start) {
      if (start.dataset.mveBypass === "1") { delete start.dataset.mveBypass; return; }
      event.preventDefault(); event.stopImmediatePropagation(); try { openMethodPicker(start.dataset.id); } catch (error) { global.alert(error.message || "Observation could not start."); } return;
    }
    const historyDownload = event.target.closest && event.target.closest('[data-action="observation-download"][data-id]');
    if (historyDownload) {
      const record = C.getObservations().find((item) => item.id === historyDownload.dataset.id);
      if (record && (record.videoEvidenceV231 || record.videoObservationV1)) { event.preventDefault(); event.stopImmediatePropagation(); try { await exportRecord(record); } catch (error) { global.alert(error.message || "The evidence ZIP could not be created."); } return; }
    }
    const status = event.target.closest && event.target.closest("[data-mve-status]");
    if (status) { event.preventDefault(); chooseStatus(status.dataset.mveStatus); return; }
    const button = event.target.closest && event.target.closest("[data-mve-action]"); if (!button) return;
    event.preventDefault();
    try {
      const action = button.dataset.mveAction;
      if (action === "close") { closeLayer(); return; }
      if (action === "written") { continueWritten(); return; }
      if (action === "video") { await launch(state.profile.id, "assessor", null); return; }
      if (action === "witness") { await launch(state.profile.id, "witness", null); return; }
      if (action === "choose-unit") { state.unit = button.dataset.unit; state.unitTitle = unitTitle(state.unit); renderIntroduction(); return; }
      if (action === "choose-area") { selectArea(button.dataset.category, button.dataset.area); return; }
      if (action === "record-intro") { await beginRecording("intro"); return; }
      if (action === "record-intro-again") { renderIntroduction(); return; }
      if (action === "stop-intro") { await stopIntro(); return; }
      if (action === "choose-lo") { renderLoReady(button.dataset.lo); return; }
      if (action === "choose-opp") { renderOppReady(button.dataset.opp); return; }
      if (action === "record-lo") { await beginRecording("lo"); return; }
      if (action === "record-opp") { await beginRecording("evidence"); return; }
      if (action === "next-ac") { await advanceAc(false); return; }
      if (action === "finish-lo-here") { await advanceAc(true); return; }
      if (action === "finish-opp") { await finishCurrentClip(); return; }
      if (action === "save-clip-review") { await saveClipReview(); return; }
      if (action === "discard-clip") { await discardPendingClip(); return; }
      if (action === "back-hub") { renderHub(); return; }
      if (action === "finish-session") { renderSignatures(); return; }
      if (action === "clear-signature") { const padObj = state.signaturePads[button.dataset.pad]; if (padObj) padObj.clear(); return; }
      if (action === "complete-session") { await completeSession(); return; }
      if (action === "download-complete") { if (state.savedRecord) await exportRecord(state.savedRecord); return; }
      if (action === "add-linked-witness") { const parent = state.savedRecord; await launch(parent.profileId, "witness", parent); return; }
      if (action === "done") { closeLayer(); global.location.reload(); return; }
    } catch (error) { showError(error.message || "That action could not be completed."); }
  }, true);

  global.addEventListener("beforeunload", () => { stopStream(); clearInterval(state.timerId); });
  global.MilosVideoEvidence = Object.freeze({ version: VERSION, videoBitsPerSecond: VIDEO_BITS, audioBitsPerSecond: AUDIO_BITS, capture: "720p", postRecordingAction: true, linkedWitnessEvidence: true, stablePreview: true, exportRecord, buildProfessionalPdf });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observeUi, { once: true }); else observeUi();
})(window);
