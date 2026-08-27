(function (global) {
  "use strict";

  const C = global.MilosCore;
  const M = global.MilosMedia;
  const Q = global.MilosQR;
  const B = global.MilosObservationBundle;
  if (!C || !M) return;

  const VERSION = "2.27";
  const VIDEO_BITS_PER_SECOND = 550000;
  const AUDIO_BITS_PER_SECOND = 48000;
  const SOFT_WARNING_SECONDS = 9 * 60;
  const BURST_TARGET_SECONDS = 10 * 60;

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

  const STATUS = Object.freeze({
    competent: { symbol: "●", label: "Competent" },
    action: { symbol: "◐", label: "Competent with actions" },
    further: { symbol: "○", label: "Further evidence required" }
  });

  const state = {
    profile: null,
    course: null,
    mode: "assessor",
    unit: "",
    unitTitle: "",
    location: "",
    activity: "",
    witnessName: "",
    witnessRole: "",
    sessionStartedAt: 0,
    introduction: null,
    clips: [],
    currentLo: null,
    acIndex: 0,
    acStartedOffsetMs: 0,
    acTimeline: [],
    currentStatus: "",
    currentAction: "",
    stream: null,
    recorder: null,
    chunks: [],
    recordStartedAt: 0,
    timerId: 0,
    signaturePads: {},
    savedRecord: null,
    exporting: false
  };

  function h(value) {
    return C.escapeHtml ? C.escapeHtml(value) : String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function clean(value, max) { return C.cleanText ? C.cleanText(value, max || 500) : String(value == null ? "" : value).trim().slice(0, max || 500); }
  function localDate(timestamp) {
    const d = new Date(timestamp || Date.now());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function localClock(timestamp, withSeconds) {
    const d = new Date(timestamp || Date.now());
    return [String(d.getHours()).padStart(2, "0"), String(d.getMinutes()).padStart(2, "0"), ...(withSeconds ? [String(d.getSeconds()).padStart(2, "0")] : [])].join(":");
  }
  function fileStamp(timestamp) { return `${localDate(timestamp)}_${localClock(timestamp, true).replace(/:/g, "-")}`; }
  function formatOffset(milliseconds) {
    const total = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
    const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
    return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  function durationLabel(seconds) { return formatOffset(Math.max(0, Number(seconds || 0)) * 1000); }
  function normaliseWords(value) { return String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
  function codeParts(code) {
    const match = String(code || "").match(/^(\d+)\.(\d+)\.(\d+)$/);
    return match ? { unit: match[1], lo: Number(match[2]), ac: Number(match[3]) } : null;
  }
  function allUnitCodes(course, unit) {
    return (Array.isArray(course && course.codes) ? course.codes : []).filter((code) => {
      const part = codeParts(code); return part && part.unit === String(unit);
    }).sort((a, b) => {
      const pa = codeParts(a), pb = codeParts(b); return (pa.lo - pb.lo) || (pa.ac - pb.ac);
    });
  }
  function availableUnits(course) {
    const fromPack = Array.isArray(course && course.units) ? course.units.map((item) => typeof item === "object" ? String(item.id || item.unit || item.number || "") : String(item)).filter(Boolean) : [];
    const fromCodes = (Array.isArray(course && course.codes) ? course.codes : []).map(codeParts).filter(Boolean).map((part) => part.unit);
    return [...new Set([...fromPack, ...fromCodes])].sort((a, b) => Number(a) - Number(b));
  }
  function description(code) { return clean(state.course && state.course.descriptions && state.course.descriptions[code] || "Assessment criterion", 1200); }
  function unitTitle(unit) { return NVQ_UNIT_TITLES[String(unit)] || `Unit ${unit}`; }

  function exactMatchesForCodes(codes, sourceUnit) {
    const descriptions = state.course && state.course.descriptions || {};
    const entries = Object.keys(descriptions).map((code) => ({ code, part: codeParts(code), words: normaliseWords(descriptions[code]), text: clean(descriptions[code], 1200) })).filter((item) => item.part && item.words);
    const matches = [], seen = new Set();
    (codes || []).forEach((sourceCode) => {
      const sourceWords = normaliseWords(descriptions[sourceCode]);
      if (!sourceWords) return;
      entries.forEach((item) => {
        if (item.code === sourceCode || item.part.unit === String(sourceUnit) || item.words !== sourceWords) return;
        const key = `${sourceCode}=>${item.code}`;
        if (seen.has(key)) return;
        seen.add(key);
        matches.push({ sourceCode, mappedCode: item.code, unit: item.part.unit, description: item.text, mapping: "100% wording match", status: "Partially observed", competence: "" });
      });
    });
    return matches;
  }

  function losForUnit(unit) {
    const grouped = new Map();
    allUnitCodes(state.course, unit).forEach((code) => {
      const part = codeParts(code);
      if (!part) return;
      if (!grouped.has(part.lo)) grouped.set(part.lo, []);
      grouped.get(part.lo).push(code);
    });
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([number, codes]) => ({
      number,
      id: `LO${number}`,
      codes,
      title: description(codes[0]) || `Learning outcome ${number}`
    }));
  }

  function layer() {
    let el = document.getElementById("milosVideoObservationLayer");
    if (!el) {
      el = document.createElement("section");
      el.id = "milosVideoObservationLayer";
      el.className = "mvo-layer";
      el.hidden = true;
      el.setAttribute("aria-label", "Milos observation method");
      document.body.appendChild(el);
    }
    return el;
  }
  function show(html) { const el = layer(); el.hidden = false; el.innerHTML = html; el.scrollTop = 0; }
  function showError(message) {
    const existing = layer().querySelector(".mvo-error");
    if (existing) { existing.textContent = message; return; }
    const note = document.createElement("div"); note.className = "mvo-error"; note.textContent = message; layer().prepend(note);
  }
  function resetState() {
    stopStream(); clearInterval(state.timerId);
    Object.assign(state, {
      profile: null, course: null, mode: "assessor", unit: "", unitTitle: "", location: "", activity: "", witnessName: "", witnessRole: "",
      sessionStartedAt: 0, introduction: null, clips: [], currentLo: null, acIndex: 0, acStartedOffsetMs: 0, acTimeline: [], currentStatus: "", currentAction: "",
      stream: null, recorder: null, chunks: [], recordStartedAt: 0, timerId: 0, signaturePads: {}, savedRecord: null, exporting: false
    });
  }
  function closeLayer() {
    if (state.recorder && state.recorder.state !== "inactive") return;
    const el = layer(); el.hidden = true; el.innerHTML = ""; resetState();
  }
  function shellHeader(title, kicker, allowClose) {
    return `<header class="mvo-top"><div><small>${h(kicker || "Observation")}</small><strong>${h(title)}</strong></div>${allowClose === false ? "" : '<button type="button" class="mvo-icon-button" data-mvo-action="close" aria-label="Close">×</button>'}</header>`;
  }

  function openMethodPicker(profileId) {
    resetState();
    const profile = C.getProfile(profileId);
    if (!profile) throw new Error("Choose a learner first.");
    state.profile = profile;
    show(`${shellHeader("Start observation", profile.name)}<div class="mvo-method-page"><p class="mvo-method-intro">Choose how you want to record this observation.</p><div class="mvo-method-list"><button type="button" data-mvo-action="written-method"><span class="mvo-method-mark">W</span><span><strong>Written observation</strong><small>Use the existing Milos written observation workflow.</small></span><i>›</i></button><button type="button" data-mvo-action="video-method"><span class="mvo-method-mark">V</span><span><strong>Video observation</strong><small>Introduction first, then record any LO in any order and move through its ACs.</small></span><i>›</i></button><button type="button" data-mvo-action="witness-method"><span class="mvo-method-mark">T</span><span><strong>Witness video testimony</strong><small>Record a witness against the unit and ACs with the same timestamped workflow.</small></span><i>›</i></button></div></div>`);
  }

  async function launch(profileId, mode) {
    const profile = C.getProfile(profileId);
    if (!profile) throw new Error("Choose a learner first.");
    if (!profile.courseRouteId) throw new Error("Set the learner course or scan Evia before starting a video observation.");
    const course = await C.loadCourse(profile.courseRouteId);
    resetState(); state.profile = profile; state.course = course; state.mode = mode === "witness" ? "witness" : "assessor";
    renderUnitPicker();
  }

  function renderUnitPicker() {
    const units = availableUnits(state.course);
    const label = state.mode === "witness" ? "Witness video testimony" : "Video observation";
    show(`${shellHeader("Choose main unit", label)}<div class="mvo-page"><div class="mvo-context"><span>${h(state.profile.name)}</span><strong>${h(state.course.title)}</strong><small>Record the introduction first. After that, choose LOs in any order.</small></div>${units.length ? `<div class="mvo-unit-list">${units.map((unit) => `<button type="button" data-mvo-action="choose-unit" data-unit="${h(unit)}"><span><strong>Unit ${h(unit)}</strong><small>${h(unitTitle(unit))}</small></span><i>›</i></button>`).join("")}</div>` : '<div class="mvo-empty"><strong>No NVQ units found</strong><p>This video method needs unit.LO.AC codes in the learner course pack.</p></div>'}</div>`);
  }

  function renderIntroduction() {
    const witnessFields = state.mode === "witness" ? `<div class="mvo-grid"><label><span>Witness name</span><input data-mvo-field="witnessName" value="${h(state.witnessName)}" maxlength="100"></label><label><span>Witness role</span><input data-mvo-field="witnessRole" value="${h(state.witnessRole)}" maxlength="120"></label></div>` : "";
    show(`${shellHeader(`Unit ${state.unit}`, state.mode === "witness" ? "Witness introduction" : "Observation introduction")}<div class="mvo-page"><div class="mvo-context"><span>${h(state.profile.name)}</span><strong>${h(state.unitTitle)}</strong><small>${h(localDate(Date.now()))}</small></div><div class="mvo-grid"><label><span>Location</span><input data-mvo-field="location" value="${h(state.location)}" maxlength="180" placeholder="Site, workshop or workplace"></label><label><span>Work/activity</span><input data-mvo-field="activity" value="${h(state.activity)}" maxlength="220" placeholder="What is being carried out"></label></div>${witnessFields}<div class="mvo-prompt-card"><strong>Introduction</strong><p>State assessor, learner, date, location, Unit ${h(state.unit)} and the work being observed.${state.mode === "witness" ? " Ask the witness to state their role and relationship to the learner." : ""}</p></div><button type="button" class="mvo-primary" data-mvo-action="record-intro">Start introduction recording</button></div>`);
  }

  function renderHub() {
    const los = losForUnit(state.unit);
    show(`${shellHeader(`Unit ${state.unit}`, state.mode === "witness" ? "Witness testimony · choose an LO" : "Choose an LO to observe")}<div class="mvo-page"><div class="mvo-session-strip"><span><strong>Introduction recorded</strong><small>${state.introduction ? `${localClock(state.introduction.startedAt, true)} · ${durationLabel(state.introduction.durationSeconds)}` : ""}</small></span><button type="button" data-mvo-action="record-intro-again">Record again</button></div><div class="mvo-lo-list">${los.map((lo) => {
      const latest = state.clips.filter((clip) => Number(clip.lo) === Number(lo.number)).sort((a, b) => b.startedAt - a.startedAt)[0];
      const mark = latest ? STATUS[latest.ratingKey] && STATUS[latest.ratingKey].symbol || "●" : "›";
      const count = state.clips.filter((clip) => Number(clip.lo) === Number(lo.number)).length;
      return `<button type="button" data-mvo-action="choose-lo" data-lo="${lo.number}"><span class="mvo-lo-main"><b>LO${lo.number}</b><span><strong>${h(lo.title)}</strong><small>${lo.codes.length} AC${lo.codes.length === 1 ? "" : "s"}${count ? ` · ${count} recording${count === 1 ? "" : "s"}` : ""}</small></span></span><i class="mvo-status-mark">${mark}</i></button>`;
    }).join("")}</div><button type="button" class="mvo-primary" data-mvo-action="finish-observation" ${state.clips.length ? "" : "disabled"}>Finish observation</button><p class="mvo-note">No LO order is required. Choose the LO that matches the work happening now.</p></div>`);
  }

  function renderLoReady(loNumber) {
    state.currentLo = losForUnit(state.unit).find((lo) => Number(lo.number) === Number(loNumber)) || null;
    if (!state.currentLo) return renderHub();
    const firstCode = state.currentLo.codes[0];
    show(`${shellHeader(`LO${state.currentLo.number}`, `Unit ${state.unit}`)}<div class="mvo-page"><div class="mvo-context"><span>${state.currentLo.codes.length} AC${state.currentLo.codes.length === 1 ? "" : "s"}</span><strong>${h(state.currentLo.title)}</strong><small>One video file will be saved for this LO. Press Next AC during the recording to timestamp each new criterion.</small></div><div class="mvo-prompt-card"><strong>First AC · ${h(firstCode)}</strong><p>${h(description(firstCode))}</p></div><button type="button" class="mvo-primary" data-mvo-action="record-lo">Start LO${state.currentLo.number} recording</button><button type="button" class="mvo-secondary" data-mvo-action="back-hub">Back to LO list</button></div>`);
  }

  function chooseMimeType() {
    if (!global.MediaRecorder) return "";
    return ["video/mp4;codecs=h264,aac", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => global.MediaRecorder.isTypeSupported && global.MediaRecorder.isTypeSupported(type)) || "";
  }
  function extensionForMime(type) { return String(type || "").toLowerCase().includes("mp4") ? "mp4" : "webm"; }
  async function openStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Camera recording is not available on this device/browser.");
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      video: { facingMode: { ideal: "environment" }, width: { ideal: 854, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 24, max: 30 } }
    });
  }
  function recordingName(kind, lo, timestamp, extension) {
    const section = kind === "intro" ? "Introduction" : `LO${lo}`;
    return `${state.unit || "Unit"}_${section}_${fileStamp(timestamp)}.${extension}`;
  }
  function attachPreview() {
    const preview = document.getElementById("mvoVideoPreview");
    if (!preview || !state.stream) return;
    preview.srcObject = state.stream; preview.muted = true; preview.playsInline = true; preview.play().catch(() => {});
  }
  async function beginRecording(kind) {
    if (state.recorder && state.recorder.state !== "inactive") return;
    if (kind === "intro") {
      state.location = clean(layer().querySelector('[data-mvo-field="location"]') && layer().querySelector('[data-mvo-field="location"]').value, 180);
      state.activity = clean(layer().querySelector('[data-mvo-field="activity"]') && layer().querySelector('[data-mvo-field="activity"]').value, 220);
      if (state.mode === "witness") {
        state.witnessName = clean(layer().querySelector('[data-mvo-field="witnessName"]') && layer().querySelector('[data-mvo-field="witnessName"]').value, 100);
        state.witnessRole = clean(layer().querySelector('[data-mvo-field="witnessRole"]') && layer().querySelector('[data-mvo-field="witnessRole"]').value, 120);
      }
    }
    state.stream = await openStream(); state.chunks = []; state.recordStartedAt = Date.now();
    if (!state.sessionStartedAt) state.sessionStartedAt = state.recordStartedAt;
    const mimeType = chooseMimeType();
    const options = { videoBitsPerSecond: VIDEO_BITS_PER_SECOND, audioBitsPerSecond: AUDIO_BITS_PER_SECOND };
    if (mimeType) options.mimeType = mimeType;
    state.recorder = new MediaRecorder(state.stream, options);
    state.recorder.addEventListener("dataavailable", (event) => { if (event.data && event.data.size) state.chunks.push(event.data); });
    state.recorder.start(1000);
    if (kind === "intro") renderIntroRecording();
    else {
      state.acIndex = 0; state.acStartedOffsetMs = 0; state.acTimeline = []; state.currentStatus = ""; state.currentAction = ""; renderAcRecording();
    }
    attachPreview(); startTimer();
  }

  function renderIntroRecording() {
    show(`<div class="mvo-ac-screen"><div class="mvo-ac-head"><span>Introduction</span><strong>Unit ${h(state.unit)} · ${h(state.profile.name)}</strong></div><div class="mvo-ac-video"><video id="mvoVideoPreview" autoplay muted playsinline></video><span class="mvo-rec-badge">REC</span><span id="mvoTimer" class="mvo-timer">00:00</span></div><div class="mvo-ac-controls"><p class="mvo-intro-cue">Assessor · learner · date · location · Unit ${h(state.unit)} · activity${state.mode === "witness" ? " · witness role" : ""}</p><button type="button" class="mvo-next-ac" data-mvo-action="stop-intro">Finish introduction</button><p id="mvoRecordingHint" class="mvo-recording-hint">The introduction is saved as its own timestamped file.</p></div></div>`);
  }

  function currentAcCode() { return state.currentLo && state.currentLo.codes[state.acIndex] || ""; }
  function renderAcRecording() {
    const code = currentAcCode();
    if (!code) return;
    const nextCode = state.currentLo.codes[state.acIndex + 1] || "";
    const nextTitle = nextCode ? description(nextCode) : "";
    const nextLabel = nextCode ? `Next AC · ${nextCode} · ${nextTitle}` : `Finish LO${state.currentLo.number} recording`;
    const showAction = state.currentStatus === "action" || state.currentStatus === "further";
    show(`<div class="mvo-ac-screen"><div class="mvo-ac-head"><span>AC ${state.acIndex + 1} of ${state.currentLo.codes.length} · ${h(code)}</span><strong>${h(description(code))}</strong></div><div class="mvo-ac-video"><video id="mvoVideoPreview" autoplay muted playsinline></video><span class="mvo-rec-badge">REC</span><span id="mvoTimer" class="mvo-timer">${durationLabel(Math.floor((Date.now() - state.recordStartedAt) / 1000))}</span></div><div class="mvo-ac-controls"><div class="mvo-decision-bar" aria-label="Competence decision"><button type="button" data-mvo-status="competent" class="${state.currentStatus === "competent" ? "is-selected" : ""}"><span>●</span><small>Competent</small></button><button type="button" data-mvo-status="action" class="${state.currentStatus === "action" ? "is-selected" : ""}"><span>◐</span><small>With actions</small></button><button type="button" data-mvo-status="further" class="${state.currentStatus === "further" ? "is-selected" : ""}"><span>○</span><small>Further evidence</small></button></div><label id="mvoInlineAction" class="mvo-inline-action" ${showAction ? "" : "hidden"}><span>Action</span><textarea data-mvo-field="currentAction" rows="2" placeholder="Add action or further evidence needed">${h(state.currentAction)}</textarea></label><button type="button" class="mvo-next-ac" data-mvo-action="next-ac" ${state.currentStatus ? "" : "disabled"}>${h(nextLabel)}</button>${nextCode ? '<button type="button" class="mvo-finish-early" data-mvo-action="finish-lo-here" ' + (state.currentStatus ? "" : "disabled") + '>Finish LO after this AC</button>' : ""}<p id="mvoRecordingHint" class="mvo-recording-hint">Press Next AC when you move to the next criterion. Milos timestamps that point in this LO video.</p></div></div>`);
    attachPreview();
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.timerId = global.setInterval(() => {
      const seconds = Math.floor((Date.now() - state.recordStartedAt) / 1000);
      const timer = document.getElementById("mvoTimer");
      if (timer) { timer.textContent = durationLabel(seconds); timer.classList.toggle("is-warning", seconds >= SOFT_WARNING_SECONDS); }
      const hint = document.getElementById("mvoRecordingHint");
      if (hint && seconds >= SOFT_WARNING_SECONDS) hint.textContent = seconds >= BURST_TARGET_SECONDS ? "10-minute target reached. Finish this LO when practical; recording continues until you stop." : "Approaching 10 minutes. Consider finishing this LO when practical.";
    }, 500);
  }
  function chooseStatus(status) {
    if (!STATUS[status]) return;
    state.currentStatus = status;
    state.currentAction = "";
    renderAcRecording();
  }

  async function finaliseMedia(kind, loNumber) {
    const recorder = state.recorder;
    if (!recorder || recorder.state === "inactive") throw new Error("No recording is active.");
    clearInterval(state.timerId);
    const endedAt = Date.now();
    const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
    recorder.stop(); await stopped;
    const type = recorder.mimeType || (state.chunks[0] && state.chunks[0].type) || "video/webm";
    const blob = new Blob(state.chunks, { type });
    const ext = extensionForMime(type), filename = recordingName(kind, loNumber, state.recordStartedAt, ext);
    let file;
    try { file = new File([blob], filename, { type, lastModified: state.recordStartedAt }); }
    catch (_) { file = blob; file.name = filename; }
    const media = await M.putFile(file);
    const result = { media, filename, mimeType: type, startedAt: state.recordStartedAt, endedAt, durationSeconds: Math.max(1, Math.round((endedAt - state.recordStartedAt) / 1000)) };
    stopStream(); state.recorder = null; state.chunks = [];
    return result;
  }
  async function stopIntroRecording() {
    const saved = await finaliseMedia("intro", 0);
    if (state.introduction && state.introduction.media && state.introduction.media.id) { try { await M.removeFile(state.introduction.media.id); } catch (_) {} }
    state.introduction = Object.assign({ kind: "intro", lo: null, loTitle: "Introduction", codes: [], mapped: [] }, saved);
    renderHub();
  }

  function storeCurrentAcDecision() {
    if (!state.currentStatus) return false;
    const area = layer().querySelector('[data-mvo-field="currentAction"]');
    if (state.currentStatus !== "competent") state.currentAction = clean(area && area.value, 2000);
    const code = currentAcCode();
    const endedOffsetMs = Math.max(state.acStartedOffsetMs, Date.now() - state.recordStartedAt);
    state.acTimeline.push({
      code,
      title: description(code),
      startedOffsetMs: state.acStartedOffsetMs,
      endedOffsetMs,
      status: state.currentStatus,
      action: state.currentStatus === "competent" ? "" : state.currentAction,
      mapped: exactMatchesForCodes([code], state.unit)
    });
    return true;
  }
  async function advanceAc(finishHere) {
    if (!storeCurrentAcDecision()) return;
    const isLast = state.acIndex >= state.currentLo.codes.length - 1;
    if (finishHere || isLast) { await finishLoRecording(); return; }
    state.acIndex += 1;
    state.acStartedOffsetMs = Date.now() - state.recordStartedAt;
    state.currentStatus = ""; state.currentAction = "";
    renderAcRecording();
  }
  function ratingKeyForAcs(items) {
    if ((items || []).some((item) => item.status === "further")) return "further";
    if ((items || []).some((item) => item.status === "action")) return "action";
    return "competent";
  }
  async function finishLoRecording() {
    const lo = state.currentLo;
    const saved = await finaliseMedia("lo", lo.number);
    const ratingKey = ratingKeyForAcs(state.acTimeline);
    const clip = Object.assign({
      kind: "lo", lo: lo.number, loTitle: lo.title, codes: state.acTimeline.map((item) => item.code), acTimeline: state.acTimeline.map((item) => Object.assign({}, item)),
      mapped: state.acTimeline.flatMap((item) => item.mapped || []), ratingKey, status: ratingKey, action: state.acTimeline.filter((item) => item.action).map((item) => `${item.code}: ${item.action}`).join("\n")
    }, saved);
    state.clips.push(clip); state.currentLo = null; state.acTimeline = []; state.currentStatus = ""; state.currentAction = "";
    renderHub();
  }
  function stopStream() {
    if (state.stream) state.stream.getTracks().forEach((track) => { try { track.stop(); } catch (_) {} });
    state.stream = null;
  }

  function renderSignatures() {
    const assessor = C.getSettings ? C.getSettings() : {}, assessorName = clean(assessor.assessorName || "", 100), witnessRequired = state.mode === "witness";
    show(`${shellHeader("Sign observation", `Unit ${state.unit} · ${state.clips.length} LO video${state.clips.length === 1 ? "" : "s"}`)}<div class="mvo-page"><div class="mvo-summary-mini"><span>${h(state.profile.name)}</span><strong>${h(state.unitTitle)}</strong><small>${h(localDate(state.sessionStartedAt))} · ${h(state.location || "Location not entered")}</small></div><label class="mvo-name-field"><span>Assessor name</span><input data-mvo-field="assessorName" value="${h(assessorName)}" maxlength="100"></label><div class="mvo-signature"><div><strong>Assessor signature</strong><button type="button" data-mvo-action="clear-signature" data-pad="assessor">Clear</button></div><canvas id="mvoAssessorSignature"></canvas></div><div class="mvo-signature"><div><strong>Learner signature</strong><button type="button" data-mvo-action="clear-signature" data-pad="learner">Clear</button></div><canvas id="mvoLearnerSignature"></canvas></div><label class="mvo-name-field"><span>Witness name ${witnessRequired ? "" : "(optional)"}</span><input data-mvo-field="finalWitnessName" value="${h(state.witnessName)}" maxlength="100"></label><div class="mvo-signature"><div><strong>Witness signature ${witnessRequired ? "" : "(optional)"}</strong><button type="button" data-mvo-action="clear-signature" data-pad="witness">Clear</button></div><canvas id="mvoWitnessSignature"></canvas></div><button type="button" class="mvo-primary" data-mvo-action="complete-observation">Complete observation</button></div>`);
    global.requestAnimationFrame(initSignaturePads);
  }
  function initSignaturePads() {
    state.signaturePads = {
      assessor: document.getElementById("mvoAssessorSignature") ? M.signaturePad(document.getElementById("mvoAssessorSignature")) : null,
      learner: document.getElementById("mvoLearnerSignature") ? M.signaturePad(document.getElementById("mvoLearnerSignature")) : null,
      witness: document.getElementById("mvoWitnessSignature") ? M.signaturePad(document.getElementById("mvoWitnessSignature")) : null
    };
  }
  function allAcEvidence() { return state.clips.flatMap((clip) => (clip.acTimeline || []).map((ac) => Object.assign({ lo: clip.lo, loTitle: clip.loTitle, clipStartedAt: clip.startedAt, filename: clip.filename }, ac))); }
  function allMappedEvidence() {
    const map = new Map();
    allAcEvidence().forEach((ac) => (ac.mapped || []).forEach((item) => {
      const key = `${item.sourceCode}=>${item.mappedCode}`;
      if (!map.has(key)) map.set(key, Object.assign({}, item, { lo: ac.lo, clipStartedAt: ac.clipStartedAt, acOffsetMs: ac.startedOffsetMs, status: "Partially observed", competence: "" }));
    }));
    return [...map.values()].sort((a, b) => a.mappedCode.localeCompare(b.mappedCode, undefined, { numeric: true }));
  }
  function aggregateRating(acEvidence) { return STATUS[ratingKeyForAcs(acEvidence)].label; }

  async function completeObservation() {
    const assessorPad = state.signaturePads.assessor, learnerPad = state.signaturePads.learner, witnessPad = state.signaturePads.witness;
    const assessorName = clean(layer().querySelector('[data-mvo-field="assessorName"]') && layer().querySelector('[data-mvo-field="assessorName"]').value, 100);
    const witnessName = clean(layer().querySelector('[data-mvo-field="finalWitnessName"]') && layer().querySelector('[data-mvo-field="finalWitnessName"]').value, 100);
    if (!assessorName) return showError("Add the assessor name.");
    if (!assessorPad || assessorPad.isEmpty()) return showError("Assessor signature is required.");
    if (!learnerPad || learnerPad.isEmpty()) return showError("Learner signature is required.");
    if (state.mode === "witness" && (!witnessName || !witnessPad || witnessPad.isEmpty())) return showError("Witness name and signature are required for witness testimony.");

    const acEvidence = allAcEvidence();
    const observedCodes = [...new Set(acEvidence.map((item) => item.code))];
    const mappedEvidence = allMappedEvidence();
    const mappedCodes = [...new Set(mappedEvidence.map((item) => item.mappedCode))];
    const latestByCode = new Map(); acEvidence.forEach((item) => latestByCode.set(item.code, item));
    const criteria = observedCodes.map((code) => ({ code, description: description(code), outcome: "Observed", included: true, competence: STATUS[(latestByCode.get(code) || {}).status] ? STATUS[latestByCode.get(code).status].label : "" }));
    const mappedCriteria = mappedCodes.map((code) => ({ code, description: description(code), outcome: "Partially observed", included: true, competence: "", mapping: "100% wording match" }));
    const sections = state.clips.map((clip, index) => ({ key: `video::${state.unit}::lo${clip.lo}::${index + 1}`, categoryId: "video-observation", categoryTitle: state.mode === "witness" ? "Witness video testimony" : "Video observation", jobId: `unit-${state.unit}`, jobTitle: `Unit ${state.unit}`, opportunityId: `lo-${clip.lo}-${index + 1}`, opportunityTitle: `LO${clip.lo} · ${clip.loTitle}`, instruction: "Timestamped AC-by-AC video evidence", question: "", codes: clip.codes.slice() }));
    const endedAt = Math.max(...state.clips.map((clip) => clip.endedAt), state.introduction.endedAt);
    const record = {
      videoObservationV1: true, videoObservationVersion: 2, method: state.mode === "witness" ? "Witness video testimony" : "Video observation", mode: state.mode,
      profileId: state.profile.id, courseRouteId: state.profile.courseRouteId, courseId: state.course.id || state.course.courseId || "", courseTitle: state.course.title || "", coverageLabel: state.course.coverageLabel || "AC",
      observationDate: localDate(state.sessionStartedAt), startTime: localClock(state.sessionStartedAt, false), endTime: localClock(endedAt, false), sessionStartedAt: state.sessionStartedAt, sessionEndedAt: endedAt,
      location: state.location, activityObserved: state.activity || `${state.mode === "witness" ? "Witness testimony for" : "Video observation of"} Unit ${state.unit}`,
      unitNumber: state.unit, unitTitle: state.unitTitle, jobTitle: `Unit ${state.unit}`, opportunityTitle: `${state.mode === "witness" ? "Witness video" : "Video observation"} · Unit ${state.unit}`,
      sections, criteria, mappedCriteria, observedCodes, mappedEvidence,
      videoTimeline: [state.introduction, ...state.clips].map((clip) => ({ kind: clip.kind, lo: clip.lo, loTitle: clip.loTitle, codes: clip.codes || [], mediaId: clip.media.id, filename: clip.filename, startedAt: clip.startedAt, endedAt: clip.endedAt, durationSeconds: clip.durationSeconds, offsetMs: clip.startedAt - state.sessionStartedAt, acTimeline: clip.acTimeline || [] })),
      media: [state.introduction, ...state.clips].map((clip) => Object.assign({}, clip.media, { name: clip.filename, startedAt: clip.startedAt, lo: clip.lo, kind: clip.kind })),
      rating: aggregateRating(acEvidence), actions: acEvidence.filter((item) => item.action).map((item) => `${item.code}: ${item.action}`).join("\n"), assessorName, witnessName, witnessRole: state.witnessRole,
      assessorSignature: assessorPad.toDataUrl(), learnerSignature: learnerPad.toDataUrl(), witnessSignature: witnessPad && !witnessPad.isEmpty() ? witnessPad.toDataUrl() : "", completedAt: Date.now()
    };
    let saved = C.saveObservation(record);
    if (Q && typeof Q.observationPayload === "function") { try { const qrPayload = Q.observationPayload(saved, state.profile, state.course); saved = C.saveObservation(Object.assign({}, saved, { qrPayload })); } catch (_) {} }
    state.savedRecord = saved; renderComplete(saved);
  }

  function groupMapped(items) {
    return (items || []).reduce((groups, item) => { const unit = item.unit || (codeParts(item.mappedCode) || {}).unit || "Other"; (groups[unit] ||= []).push(item); return groups; }, {});
  }
  function renderComplete(record) {
    const mappedByUnit = groupMapped(record.mappedEvidence || []), acCount = (record.videoTimeline || []).flatMap((clip) => clip.acTimeline || []).length;
    show(`${shellHeader("Observation complete", record.method)}<div class="mvo-page"><div class="mvo-complete-mark">✓</div><div class="mvo-summary-mini"><span>${h(state.profile ? state.profile.name : "Learner")}</span><strong>Unit ${h(record.unitNumber)} · ${h(record.rating)}</strong><small>${record.videoTimeline.length - 1} LO video${record.videoTimeline.length - 1 === 1 ? "" : "s"} · ${acCount} timestamped AC${acCount === 1 ? "" : "s"}</small></div>${Object.keys(mappedByUnit).length ? `<div class="mvo-map-summary"><strong>100% wording matches · added as partially observed</strong>${Object.keys(mappedByUnit).map((unit) => `<p><b>Unit ${h(unit)}</b> ${h(mappedByUnit[unit].map((item) => item.mappedCode).join(" · "))}</p>`).join("")}</div>` : ""}<button type="button" class="mvo-primary" data-mvo-action="download-complete">Download compressed ZIP</button>${record.mode !== "witness" ? '<button type="button" class="mvo-secondary" data-mvo-action="start-witness-after">Record witness testimony</button>' : ""}<button type="button" class="mvo-secondary" data-mvo-action="done">Done</button><p class="mvo-note">ZIP contains the timestamped PDF, the introduction video and every LO video.</p></div>`);
  }

  function addPdfText(doc, text, x, y, width, options) { const lines = doc.splitTextToSize(String(text || ""), width); doc.text(lines, x, y, options || {}); return y + lines.length * 5; }
  function videoPdfBlob(record, profile) {
    const JsPDF = global.jspdf && global.jspdf.jsPDF;
    if (typeof JsPDF !== "function") throw new Error("The offline PDF builder is unavailable.");
    const doc = new JsPDF({ unit: "mm", format: "a4" }), left = 16, width = 178; let y = 18;
    function ensure(space) { if (y + space > 278) { doc.addPage(); y = 18; } }
    function heading(text) { ensure(12); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(text, left, y); y += 7; doc.setFont("helvetica", "normal"); doc.setFontSize(9); }
    function row(label, value) { ensure(9); doc.setFont("helvetica", "bold"); doc.text(`${label}:`, left, y); doc.setFont("helvetica", "normal"); y = addPdfText(doc, value || "—", left + 32, y, width - 32); y += 2; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text(record.mode === "witness" ? "Milos Witness Video Testimony" : "Milos Video Observation", left, y); y += 9;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    row("Learner", profile && profile.name || ""); row("Assessor", record.assessorName); row("Course", record.courseTitle); row("Main unit", `Unit ${record.unitNumber} — ${record.unitTitle}`); row("Date", record.observationDate); row("Location", record.location);
    if (record.mode === "witness") { row("Witness", record.witnessName); row("Witness role", record.witnessRole); }
    row("Overall", record.rating);
    heading("Timestamped video evidence");
    (record.videoTimeline || []).forEach((clip) => {
      ensure(12); const sessionOffset = formatOffset(clip.offsetMs || 0), title = clip.kind === "intro" ? "Introduction" : `LO${clip.lo} — ${clip.loTitle}`;
      doc.setFont("helvetica", "bold"); doc.text(`${sessionOffset}  ${title}`, left, y); y += 5; doc.setFont("helvetica", "normal");
      y = addPdfText(doc, `${localDate(clip.startedAt)} ${localClock(clip.startedAt, true)} · ${durationLabel(clip.durationSeconds)} · ${clip.filename}`, left, y, width); y += 2;
      if (clip.kind !== "intro") (clip.acTimeline || []).forEach((ac) => {
        ensure(12); const decision = STATUS[ac.status] ? STATUS[ac.status].label : "Decision not recorded";
        doc.setFont("helvetica", "bold"); doc.text(`${formatOffset(ac.startedOffsetMs)}  ${ac.code}`, left + 4, y); y += 4; doc.setFont("helvetica", "normal");
        y = addPdfText(doc, ac.title, left + 4, y, width - 4); y += 1; y = addPdfText(doc, `Decision: ${decision}`, left + 4, y, width - 4); y += 1;
        if (ac.action) { y = addPdfText(doc, `Action: ${ac.action}`, left + 4, y, width - 4); y += 1; }
        y += 2;
      });
      y += 2;
    });
    const mapped = record.mappedEvidence || [];
    if (mapped.length) {
      heading("Mapped supporting evidence — 100% wording match");
      const groups = groupMapped(mapped);
      Object.keys(groups).sort((a, b) => Number(a) - Number(b)).forEach((unit) => {
        ensure(10); doc.setFont("helvetica", "bold"); doc.text(`Unit ${unit}`, left, y); y += 5; doc.setFont("helvetica", "normal");
        groups[unit].forEach((item) => { y = addPdfText(doc, `${item.mappedCode} — Partially observed (mapped from ${item.sourceCode})`, left, y, width); y += 1; }); y += 2;
      });
      y = addPdfText(doc, "Mapped ACs are automatically recorded as partially observed supporting evidence. No competence decision is copied across.", left, y, width); y += 5;
    }
    heading("Actions"); y = addPdfText(doc, record.actions || "No actions recorded.", left, y, width); y += 6;
    heading("Signatures");
    [["Assessor", record.assessorSignature], ["Learner", record.learnerSignature], ["Witness", record.witnessSignature]].filter((item) => item[1]).forEach(([label, data]) => {
      ensure(28); doc.setFont("helvetica", "bold"); doc.text(label, left, y); y += 3; try { doc.addImage(data, "JPEG", left, y, 55, 16); } catch (_) {} y += 20;
    });
    ensure(12); doc.setFont("helvetica", "normal"); doc.setFontSize(8); addPdfText(doc, `Created in Milos ${VERSION}. Each AC timestamp is relative to its LO video file.`, left, y, width);
    return doc.output("blob");
  }

  function downloadBlob(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
  async function exportRecord(record) {
    if (state.exporting) return; state.exporting = true;
    const profile = C.getProfile(record.profileId); if (!profile) { state.exporting = false; throw new Error("The learner profile for this observation is no longer available."); }
    try {
      const pdfName = `Unit${record.unitNumber}_${record.mode === "witness" ? "Witness" : "VideoObservation"}_${record.observationDate}.pdf`;
      const entries = [{ name: pdfName, blob: videoPdfBlob(record, profile), date: new Date(record.completedAt || Date.now()) }], missing = [];
      for (const item of (record.media || [])) {
        let stored = null; try { stored = await M.getFile(item.id); } catch (_) {}
        if (!stored || !(stored.blob instanceof Blob)) { missing.push(item.name || item.id); continue; }
        entries.push({ name: clean(item.name || stored.name, 160) || "video", blob: stored.blob, date: new Date(Number(stored.createdAt || item.startedAt || Date.now())) });
      }
      if (missing.length) throw new Error(`${missing.length} video file${missing.length === 1 ? " is" : "s are"} missing from this device, so a complete ZIP was not created.`);
      if (!B || typeof B.makeZip !== "function") throw new Error("Compressed ZIP export is unavailable. Update Milos and try again.");
      const zip = await B.makeZip(entries); downloadBlob(zip, `Unit${record.unitNumber}_${record.mode === "witness" ? "Witness" : "VideoObservation"}_${record.observationDate}.zip`);
    } finally { state.exporting = false; }
  }

  function findStartButton(profileId) { return Array.from(document.querySelectorAll('[data-action="start-observation"][data-id]')).find((button) => button.dataset.id === profileId) || null; }
  function continueWrittenObservation() {
    const profileId = state.profile && state.profile.id; const el = layer(); el.hidden = true; el.innerHTML = ""; stopStream(); clearInterval(state.timerId);
    const button = findStartButton(profileId); resetState();
    if (!button) { global.location.reload(); return; }
    button.dataset.mvoBypass = "1"; button.click();
  }
  function patchHistoryButtons(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-action="observation-download"][data-id]').forEach((button) => {
      const record = C.getObservations().find((item) => item.id === button.dataset.id);
      if (record && record.videoObservationV1) button.textContent = "Download compressed ZIP";
    });
  }
  function observeUi() {
    patchHistoryButtons(document);
    if (!global.MutationObserver) return;
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node.nodeType === 1) patchHistoryButtons(node); }))).observe(document.getElementById("milosApp") || document.body, { childList: true, subtree: true });
  }

  document.addEventListener("click", async (event) => {
    const normalStart = event.target.closest && event.target.closest('[data-action="start-observation"][data-id]');
    if (normalStart) {
      if (normalStart.dataset.mvoBypass === "1") { delete normalStart.dataset.mvoBypass; return; }
      event.preventDefault(); event.stopImmediatePropagation();
      try { openMethodPicker(normalStart.dataset.id); } catch (error) { global.alert(error.message || "Observation could not start."); }
      return;
    }
    const normalDownload = event.target.closest && event.target.closest('[data-action="observation-download"][data-id]');
    if (normalDownload) {
      const record = C.getObservations().find((item) => item.id === normalDownload.dataset.id);
      if (record && record.videoObservationV1) {
        event.preventDefault(); event.stopImmediatePropagation();
        try { await exportRecord(record); } catch (error) { global.alert(error.message || "The video observation ZIP could not be created."); }
        return;
      }
    }
    const actionButton = event.target.closest && event.target.closest("[data-mvo-action]");
    if (!actionButton) {
      const statusButton = event.target.closest && event.target.closest("[data-mvo-status]");
      if (statusButton) { event.preventDefault(); chooseStatus(statusButton.dataset.mvoStatus); }
      return;
    }
    event.preventDefault();
    const action = actionButton.dataset.mvoAction;
    try {
      if (action === "close") { closeLayer(); return; }
      if (action === "written-method") { continueWrittenObservation(); return; }
      if (action === "video-method") { await launch(state.profile.id, "assessor"); return; }
      if (action === "witness-method") { await launch(state.profile.id, "witness"); return; }
      if (action === "choose-unit") { state.unit = actionButton.dataset.unit; state.unitTitle = unitTitle(state.unit); renderIntroduction(); return; }
      if (action === "record-intro") { await beginRecording("intro"); return; }
      if (action === "record-intro-again") { renderIntroduction(); return; }
      if (action === "stop-intro") { await stopIntroRecording(); return; }
      if (action === "choose-lo") { renderLoReady(actionButton.dataset.lo); return; }
      if (action === "record-lo") { await beginRecording("lo"); return; }
      if (action === "next-ac") { await advanceAc(false); return; }
      if (action === "finish-lo-here") { await advanceAc(true); return; }
      if (action === "back-hub") { renderHub(); return; }
      if (action === "finish-observation") { renderSignatures(); return; }
      if (action === "clear-signature") { const pad = state.signaturePads[actionButton.dataset.pad]; if (pad) pad.clear(); return; }
      if (action === "complete-observation") { await completeObservation(); return; }
      if (action === "download-complete") { if (state.savedRecord) await exportRecord(state.savedRecord); return; }
      if (action === "start-witness-after") { const id = state.savedRecord && state.savedRecord.profileId; await launch(id, "witness"); return; }
      if (action === "done") { closeLayer(); global.location.reload(); return; }
    } catch (error) { showError(error.message || "That action could not be completed."); }
  }, true);

  global.addEventListener("beforeunload", () => { stopStream(); clearInterval(state.timerId); });
  global.MilosVideoObservation = Object.freeze({ version: VERSION, videoBitsPerSecond: VIDEO_BITS_PER_SECOND, audioBitsPerSecond: AUDIO_BITS_PER_SECOND, softWarningSeconds: SOFT_WARNING_SECONDS, burstTargetSeconds: BURST_TARGET_SECONDS, exactWordingMapping: true, mappedOutcome: "Partially observed", acTimestamping: true, normaliseWords, exactMatchesForCodes });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observeUi, { once: true }); else observeUi();
})(window);
