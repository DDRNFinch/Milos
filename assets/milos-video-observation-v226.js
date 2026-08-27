(function (global) {
  "use strict";

  const C = global.MilosCore;
  const M = global.MilosMedia;
  const Q = global.MilosQR;
  const B = global.MilosObservationBundle;
  if (!C || !M) return;

  const VERSION = "2.26";
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
    step: "",
    unit: "",
    unitTitle: "",
    sessionStartedAt: 0,
    location: "",
    activity: "",
    witnessName: "",
    witnessRole: "",
    introduction: null,
    clips: [],
    currentLo: null,
    pendingClip: null,
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

  function clean(value, max) {
    return C.cleanText ? C.cleanText(value, max || 500) : String(value == null ? "" : value).trim().slice(0, max || 500);
  }

  function localDate(timestamp) {
    const d = new Date(timestamp || Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function localClock(timestamp, withSeconds) {
    const d = new Date(timestamp || Date.now());
    return [String(d.getHours()).padStart(2, "0"), String(d.getMinutes()).padStart(2, "0"), ...(withSeconds ? [String(d.getSeconds()).padStart(2, "0")] : [])].join(":");
  }

  function fileStamp(timestamp) {
    return `${localDate(timestamp)}_${localClock(timestamp, true).replace(/:/g, "-")}`;
  }

  function formatOffset(milliseconds) {
    const total = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function durationLabel(seconds) {
    return formatOffset(Math.max(0, Number(seconds || 0)) * 1000);
  }

  function normaliseWords(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function codeParts(code) {
    const match = String(code || "").match(/^(\d+)\.(\d+)\.(\d+)$/);
    return match ? { unit: match[1], lo: Number(match[2]), ac: Number(match[3]) } : null;
  }

  function allUnitCodes(course, unit) {
    return (Array.isArray(course && course.codes) ? course.codes : [])
      .filter((code) => {
        const part = codeParts(code);
        return part && part.unit === String(unit);
      })
      .sort((a, b) => {
        const pa = codeParts(a), pb = codeParts(b);
        return (pa.lo - pb.lo) || (pa.ac - pb.ac);
      });
  }

  function availableUnits(course) {
    const fromPack = Array.isArray(course && course.units)
      ? course.units.map((item) => typeof item === "object" ? String(item.id || item.unit || item.number || "") : String(item)).filter(Boolean)
      : [];
    const fromCodes = (Array.isArray(course && course.codes) ? course.codes : []).map((code) => codeParts(code)).filter(Boolean).map((part) => part.unit);
    return [...new Set([...fromPack, ...fromCodes])].sort((a, b) => Number(a) - Number(b));
  }

  function description(code) {
    return clean(state.course && state.course.descriptions && state.course.descriptions[code] || "Assessment criterion", 1200);
  }

  function losForUnit(unit) {
    const grouped = new Map();
    allUnitCodes(state.course, unit).forEach((code) => {
      const part = codeParts(code);
      if (!part) return;
      if (!grouped.has(part.lo)) grouped.set(part.lo, []);
      grouped.get(part.lo).push(code);
    });
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([number, codes]) => {
      const descriptions = codes.map(description).filter(Boolean);
      return {
        number,
        id: `LO${number}`,
        codes,
        title: descriptions[0] || `Learning outcome ${number}`,
        descriptions,
        mapped: exactMatchesForCodes(codes, unit)
      };
    });
  }

  function exactMatchesForCodes(codes, sourceUnit) {
    const descriptions = state.course && state.course.descriptions || {};
    const entries = Object.keys(descriptions).map((code) => ({ code, part: codeParts(code), words: normaliseWords(descriptions[code]), text: clean(descriptions[code], 1200) })).filter((item) => item.part && item.words);
    const matches = [];
    const seen = new Set();
    codes.forEach((sourceCode) => {
      const sourceWords = normaliseWords(descriptions[sourceCode]);
      if (!sourceWords) return;
      entries.forEach((item) => {
        if (item.code === sourceCode || item.part.unit === String(sourceUnit) || item.words !== sourceWords) return;
        const key = `${sourceCode}=>${item.code}`;
        if (seen.has(key)) return;
        seen.add(key);
        matches.push({ sourceCode, mappedCode: item.code, unit: item.part.unit, description: item.text, mapping: "100% wording match", status: "mapped-supporting-evidence" });
      });
    });
    return matches;
  }

  function unitTitle(unit) {
    return NVQ_UNIT_TITLES[String(unit)] || `Unit ${unit}`;
  }

  function statusForLo(loNumber) {
    const clips = state.clips.filter((clip) => Number(clip.lo) === Number(loNumber)).sort((a, b) => b.startedAt - a.startedAt);
    return clips[0] ? clips[0].status : "";
  }

  function clipsForLo(loNumber) {
    return state.clips.filter((clip) => Number(clip.lo) === Number(loNumber)).sort((a, b) => a.startedAt - b.startedAt);
  }

  function layer() {
    let el = document.getElementById("milosVideoObservationLayer");
    if (!el) {
      el = document.createElement("section");
      el.id = "milosVideoObservationLayer";
      el.className = "mvo-layer";
      el.hidden = true;
      el.setAttribute("aria-label", "Milos video observation");
      document.body.appendChild(el);
    }
    return el;
  }

  function show(html) {
    const el = layer();
    el.hidden = false;
    el.innerHTML = html;
    el.scrollTop = 0;
  }

  function closeLayer() {
    if (state.recorder && state.recorder.state !== "inactive") return;
    stopStream();
    const el = layer();
    el.hidden = true;
    el.innerHTML = "";
    resetState();
  }

  function resetState() {
    Object.assign(state, {
      profile: null,
      course: null,
      mode: "assessor",
      step: "",
      unit: "",
      unitTitle: "",
      sessionStartedAt: 0,
      location: "",
      activity: "",
      witnessName: "",
      witnessRole: "",
      introduction: null,
      clips: [],
      currentLo: null,
      pendingClip: null,
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
    });
  }

  function shellHeader(title, kicker, allowClose) {
    return `<header class="mvo-top"><div><small>${h(kicker || "Video observation")}</small><strong>${h(title)}</strong></div>${allowClose !== false ? '<button type="button" class="mvo-icon-button" data-mvo-action="close" aria-label="Close video observation">×</button>' : ""}</header>`;
  }

  function showError(message) {
    const existing = layer().querySelector(".mvo-error");
    if (existing) existing.textContent = message;
    else {
      const note = document.createElement("div");
      note.className = "mvo-error";
      note.textContent = message;
      layer().prepend(note);
    }
  }

  async function launch(profileId, mode) {
    resetState();
    const profile = C.getProfile(profileId);
    if (!profile) throw new Error("Choose a learner first.");
    if (!profile.courseRouteId) throw new Error("Set the learner course or scan Evia before starting a video observation.");
    const course = await C.loadCourse(profile.courseRouteId);
    state.profile = profile;
    state.course = course;
    state.mode = mode === "witness" ? "witness" : "assessor";
    state.step = "unit";
    renderUnitPicker();
  }

  function renderUnitPicker() {
    const units = availableUnits(state.course);
    const modeLabel = state.mode === "witness" ? "Video witness testimony" : "Video observation";
    show(`${shellHeader("Choose main unit", modeLabel)}<div class="mvo-page"><div class="mvo-context"><span>${h(state.profile.name)}</span><strong>${h(state.course.title)}</strong><small>Introduction first, then choose LOs in any order.</small></div>${units.length ? `<div class="mvo-unit-list">${units.map((unit) => `<button type="button" data-mvo-action="choose-unit" data-unit="${h(unit)}"><span><strong>Unit ${h(unit)}</strong><small>${h(unitTitle(unit))}</small></span><i>›</i></button>`).join("")}</div>` : '<div class="mvo-empty"><strong>No NVQ units found</strong><p>This guided video method needs unit.LO.AC codes in the learner course pack.</p></div>'}</div>`);
  }

  function renderIntroduction() {
    const witnessFields = state.mode === "witness" ? `<div class="mvo-grid"><label><span>Witness name</span><input data-mvo-field="witnessName" value="${h(state.witnessName)}" maxlength="100"></label><label><span>Witness role</span><input data-mvo-field="witnessRole" value="${h(state.witnessRole)}" maxlength="120"></label></div>` : "";
    show(`${shellHeader(`Unit ${state.unit}`, state.mode === "witness" ? "Witness introduction" : "Observation introduction")}<div class="mvo-page"><div class="mvo-context"><span>${h(state.profile.name)}</span><strong>${h(state.unitTitle)}</strong><small>${h(localDate(Date.now()))}</small></div><div class="mvo-grid"><label><span>Location</span><input data-mvo-field="location" value="${h(state.location)}" maxlength="180" placeholder="Site, workshop or workplace"></label><label><span>Work/activity</span><input data-mvo-field="activity" value="${h(state.activity)}" maxlength="220" placeholder="What is being carried out"></label></div>${witnessFields}<div class="mvo-prompt-card"><strong>Introduction prompts</strong><ul><li>State assessor, learner, location and date.</li><li>Confirm Unit ${h(state.unit)} and the work being observed.</li>${state.mode === "witness" ? "<li>Ask the witness to state their role and relationship to the learner.</li>" : "<li>Briefly explain the observation context and site conditions.</li>"}</ul></div><button type="button" class="mvo-primary" data-mvo-action="record-intro">Record introduction</button><p class="mvo-note">The introduction is saved as its own timestamped video file.</p></div>`);
  }

  function renderHub() {
    state.step = "hub";
    const los = losForUnit(state.unit);
    const totalClips = state.clips.length;
    show(`${shellHeader(`Unit ${state.unit}`, state.mode === "witness" ? "Witness testimony · choose any LO" : "Choose any LO to observe")}<div class="mvo-page"><div class="mvo-session-strip"><span><strong>Introduction ✓</strong><small>${state.introduction ? `${localClock(state.introduction.startedAt, true)} · ${durationLabel(state.introduction.durationSeconds)}` : "Recorded"}</small></span><button type="button" data-mvo-action="record-intro-again">Record again</button></div><div class="mvo-lo-list">${los.map((lo) => {
      const status = statusForLo(lo.number);
      const clips = clipsForLo(lo.number);
      const marker = status ? STATUS[status].symbol : "";
      return `<button type="button" data-mvo-action="choose-lo" data-lo="${lo.number}"><span class="mvo-lo-main"><b>LO${lo.number}</b><span><strong>${h(lo.title)}</strong><small>${lo.codes.length} ACs${lo.mapped.length ? ` · ${lo.mapped.length} exact mapped AC${lo.mapped.length === 1 ? "" : "s"}` : ""}${clips.length ? ` · ${clips.length} clip${clips.length === 1 ? "" : "s"}` : ""}</small></span></span><i class="mvo-status-mark" aria-label="${status ? h(STATUS[status].label) : "Not yet recorded"}">${marker || "›"}</i></button>`;
    }).join("")}</div><div class="mvo-footer-actions"><button type="button" class="mvo-secondary" data-mvo-action="record-intro-again">New introduction</button><button type="button" class="mvo-primary" data-mvo-action="finish-observation" ${totalClips ? "" : "disabled"}>Finish observation</button></div><p class="mvo-note">No LO order is required. Select the area that is happening on site now. You can record the same LO more than once.</p></div>`);
  }

  function promptSummary(lo) {
    const shown = lo.descriptions.slice(0, 3);
    return shown.map((text, index) => `<li><b>${h(lo.codes[index] || "AC")}</b> ${h(text)}</li>`).join("");
  }

  function renderLoReady(loNumber) {
    state.currentLo = losForUnit(state.unit).find((item) => Number(item.number) === Number(loNumber)) || null;
    if (!state.currentLo) return renderHub();
    const lo = state.currentLo;
    show(`${shellHeader(`LO${lo.number}`, `Unit ${state.unit} · ${lo.codes.length} ACs`)}<div class="mvo-page"><div class="mvo-prompt-card is-compact"><strong>${state.mode === "witness" ? "Ask witness / establish" : "Ask / observe"}</strong>${state.mode === "witness" ? "<p class=\"mvo-witness-cue\">What have you seen the learner do? How independently? Give a recent example.</p>" : ""}<ul>${promptSummary(lo)}</ul>${lo.descriptions.length > 3 ? `<details><summary>All ${lo.codes.length} AC prompts</summary><ul>${lo.descriptions.map((text, index) => `<li><b>${h(lo.codes[index])}</b> ${h(text)}</li>`).join("")}</ul></details>` : ""}</div>${lo.mapped.length ? `<div class="mvo-map-strip"><strong>${lo.mapped.length} exact wording match${lo.mapped.length === 1 ? "" : "es"}</strong><small>These will be added automatically as mapped supporting evidence. No competence is copied across.</small></div>` : ""}<button type="button" class="mvo-primary" data-mvo-action="record-lo">Start LO${lo.number} recording</button><button type="button" class="mvo-secondary" data-mvo-action="back-hub">Back to LO list</button><p class="mvo-note">Target: short LO clips. At 9 minutes Milos will gently warn you; it will not stop the recording automatically.</p></div>`);
  }

  function chooseMimeType() {
    if (!global.MediaRecorder) return "";
    const choices = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    return choices.find((type) => global.MediaRecorder.isTypeSupported && global.MediaRecorder.isTypeSupported(type)) || "";
  }

  function extensionForMime(type) {
    return String(type || "").toLowerCase().includes("mp4") ? "mp4" : "webm";
  }

  async function openStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Camera recording is not available on this device/browser.");
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 854, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 24, max: 30 }
      }
    });
  }

  function recordingName(kind, lo, timestamp, extension) {
    const prefix = String(state.unit || "Unit");
    const section = kind === "intro" ? "Introduction" : `LO${lo}`;
    return `${prefix}_${section}_${fileStamp(timestamp)}.${extension}`;
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
    const stream = await openStream();
    state.stream = stream;
    state.chunks = [];
    state.currentStatus = "";
    state.currentAction = "";
    state.recordStartedAt = Date.now();
    if (!state.sessionStartedAt) state.sessionStartedAt = state.recordStartedAt;
    const mimeType = chooseMimeType();
    const options = { videoBitsPerSecond: VIDEO_BITS_PER_SECOND, audioBitsPerSecond: AUDIO_BITS_PER_SECOND };
    if (mimeType) options.mimeType = mimeType;
    const recorder = new MediaRecorder(stream, options);
    state.recorder = recorder;
    recorder.addEventListener("dataavailable", (event) => { if (event.data && event.data.size) state.chunks.push(event.data); });
    recorder.start(1000);
    renderRecording(kind);
    const preview = document.getElementById("mvoVideoPreview");
    if (preview) {
      preview.srcObject = stream;
      preview.muted = true;
      preview.playsInline = true;
      preview.play().catch(() => {});
    }
    startTimer();
  }

  function renderRecording(kind) {
    const isIntro = kind === "intro";
    const lo = state.currentLo;
    const prompt = isIntro
      ? `<div class="mvo-record-prompt"><b>Introduction</b><span>Assessor · learner · location · date · Unit ${h(state.unit)} · activity${state.mode === "witness" ? " · witness role" : ""}</span></div>`
      : `<div class="mvo-record-prompt"><b>LO${lo.number}</b><span>${state.mode === "witness" ? "Ask what the witness has personally seen, how independently, and for a recent example. · " : ""}${h(lo.descriptions.slice(0, 2).join(" · "))}</span><details><summary>AC prompts</summary>${lo.codes.map((code, index) => `<p><strong>${h(code)}</strong> ${h(lo.descriptions[index])}</p>`).join("")}</details></div>`;
    const decisions = isIntro ? "" : `<div class="mvo-decision-bar" aria-label="Competence decision"><button type="button" data-mvo-status="competent" aria-label="Competent"><span>●</span><small>Competent</small></button><button type="button" data-mvo-status="action" aria-label="Competent with actions"><span>◐</span><small>Action</small></button><button type="button" data-mvo-status="further" aria-label="Further evidence required"><span>○</span><small>Further</small></button></div>`;
    show(`${shellHeader(isIntro ? "Introduction" : `LO${lo.number}`, "Recording", false)}<div class="mvo-recording-page"><div class="mvo-video-wrap"><video id="mvoVideoPreview" autoplay muted playsinline></video><span class="mvo-rec-badge">REC</span><span id="mvoTimer" class="mvo-timer">00:00</span></div>${prompt}${decisions}<button type="button" class="mvo-stop" data-mvo-action="stop-recording" data-kind="${isIntro ? "intro" : "lo"}">Stop & save ${isIntro ? "introduction" : `LO${lo.number}`}</button><p id="mvoRecordingHint" class="mvo-recording-hint">Short LO clips keep storage and ZIP sizes manageable.</p></div>`);
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.timerId = global.setInterval(() => {
      const seconds = Math.floor((Date.now() - state.recordStartedAt) / 1000);
      const timer = document.getElementById("mvoTimer");
      if (timer) {
        timer.textContent = durationLabel(seconds);
        timer.classList.toggle("is-warning", seconds >= SOFT_WARNING_SECONDS);
      }
      const hint = document.getElementById("mvoRecordingHint");
      if (hint && seconds >= SOFT_WARNING_SECONDS) hint.textContent = seconds >= BURST_TARGET_SECONDS ? "10-minute target reached. Finish this LO clip when practical; Milos will keep recording until you stop." : "Approaching 10 minutes. Consider finishing this LO clip when practical.";
    }, 500);
  }

  function chooseStatus(status) {
    if (!STATUS[status]) return;
    state.currentStatus = status;
    layer().querySelectorAll("[data-mvo-status]").forEach((button) => button.classList.toggle("is-selected", button.dataset.mvoStatus === status));
    const hint = document.getElementById("mvoRecordingHint");
    if (hint) hint.textContent = STATUS[status].label;
  }

  async function stopRecording(kind) {
    const recorder = state.recorder;
    if (!recorder || recorder.state === "inactive") return;
    clearInterval(state.timerId);
    const stoppedAt = Date.now();
    const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
    recorder.stop();
    await stopped;
    const type = recorder.mimeType || (state.chunks[0] && state.chunks[0].type) || "video/webm";
    const blob = new Blob(state.chunks, { type });
    const ext = extensionForMime(type);
    const loNumber = kind === "intro" ? 0 : state.currentLo.number;
    const filename = recordingName(kind, loNumber, state.recordStartedAt, ext);
    let file;
    try { file = new File([blob], filename, { type, lastModified: state.recordStartedAt }); }
    catch (_) { file = blob; file.name = filename; }
    const media = await M.putFile(file);
    const clip = {
      kind,
      lo: loNumber || null,
      loTitle: kind === "intro" ? "Introduction" : state.currentLo.title,
      codes: kind === "intro" ? [] : state.currentLo.codes.slice(),
      mapped: kind === "intro" ? [] : state.currentLo.mapped.slice(),
      media,
      filename,
      mimeType: type,
      startedAt: state.recordStartedAt,
      endedAt: stoppedAt,
      durationSeconds: Math.max(1, Math.round((stoppedAt - state.recordStartedAt) / 1000)),
      status: kind === "intro" ? "" : state.currentStatus,
      action: ""
    };
    stopStream();
    state.recorder = null;
    state.chunks = [];
    if (kind === "intro") {
      if (state.introduction && state.introduction.media && state.introduction.media.id) {
        try { await M.removeFile(state.introduction.media.id); } catch (_) {}
      }
      state.introduction = clip;
      renderHub();
      return;
    }
    state.pendingClip = clip;
    if (clip.status === "competent") {
      state.clips.push(clip);
      state.pendingClip = null;
      renderHub();
    } else {
      renderClipDecision();
    }
  }

  function stopStream() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => { try { track.stop(); } catch (_) {} });
    }
    state.stream = null;
  }

  function renderClipDecision() {
    const clip = state.pendingClip;
    if (!clip) return renderHub();
    show(`${shellHeader(`LO${clip.lo}`, "Save competence decision", false)}<div class="mvo-page"><div class="mvo-context"><span>${h(clip.filename)}</span><strong>${h(clip.loTitle)}</strong><small>${durationLabel(clip.durationSeconds)} · recorded ${h(localClock(clip.startedAt, true))}</small></div><div class="mvo-big-decisions"><button type="button" data-mvo-post-status="competent" class="${clip.status === "competent" ? "is-selected" : ""}"><span>●</span><strong>Competent</strong></button><button type="button" data-mvo-post-status="action" class="${clip.status === "action" ? "is-selected" : ""}"><span>◐</span><strong>Competent with actions</strong></button><button type="button" data-mvo-post-status="further" class="${clip.status === "further" ? "is-selected" : ""}"><span>○</span><strong>Further evidence required</strong></button></div><label id="mvoActionField" class="mvo-action-field" ${clip.status === "action" || clip.status === "further" ? "" : "hidden"}><span>Action / further evidence</span><textarea data-mvo-field="clipAction" rows="4" placeholder="Add the action required">${h(clip.action || "")}</textarea></label><button type="button" class="mvo-primary" data-mvo-action="save-lo-clip" ${clip.status ? "" : "disabled"}>Save & return to LO list</button></div>`);
  }

  function choosePostStatus(status) {
    if (!state.pendingClip || !STATUS[status]) return;
    state.pendingClip.status = status;
    layer().querySelectorAll("[data-mvo-post-status]").forEach((button) => button.classList.toggle("is-selected", button.dataset.mvoPostStatus === status));
    const field = document.getElementById("mvoActionField");
    if (field) field.hidden = status === "competent";
    const save = layer().querySelector('[data-mvo-action="save-lo-clip"]');
    if (save) save.disabled = false;
  }

  function savePendingClip() {
    if (!state.pendingClip || !state.pendingClip.status) return;
    if (state.pendingClip.status !== "competent") {
      const area = layer().querySelector('[data-mvo-field="clipAction"]');
      state.pendingClip.action = clean(area && area.value, 2000);
    }
    state.clips.push(state.pendingClip);
    state.pendingClip = null;
    renderHub();
  }

  function renderSignatures() {
    state.step = "signatures";
    const assessor = C.getSettings ? C.getSettings() : {};
    const assessorName = clean(assessor.assessorName || "", 100);
    const witnessRequired = state.mode === "witness";
    show(`${shellHeader("Sign observation", `Unit ${state.unit} · ${state.clips.length} LO clip${state.clips.length === 1 ? "" : "s"}`)}<div class="mvo-page"><div class="mvo-summary-mini"><span>${h(state.profile.name)}</span><strong>${h(state.unitTitle)}</strong><small>${h(localDate(state.sessionStartedAt))} · ${h(state.location || "Location not entered")}</small></div><label class="mvo-name-field"><span>Assessor name</span><input data-mvo-field="assessorName" value="${h(assessorName)}" maxlength="100"></label><div class="mvo-signature"><div><strong>Assessor signature</strong><button type="button" data-mvo-action="clear-signature" data-pad="assessor">Clear</button></div><canvas id="mvoAssessorSignature"></canvas></div><div class="mvo-signature"><div><strong>Learner signature</strong><button type="button" data-mvo-action="clear-signature" data-pad="learner">Clear</button></div><canvas id="mvoLearnerSignature"></canvas></div><label class="mvo-name-field"><span>Witness name ${witnessRequired ? "" : "(optional)"}</span><input data-mvo-field="finalWitnessName" value="${h(state.witnessName)}" maxlength="100"></label><div class="mvo-signature"><div><strong>Witness signature ${witnessRequired ? "" : "(optional)"}</strong><button type="button" data-mvo-action="clear-signature" data-pad="witness">Clear</button></div><canvas id="mvoWitnessSignature"></canvas></div><button type="button" class="mvo-primary" data-mvo-action="complete-observation">Complete observation</button><p class="mvo-note">Assessor and learner signatures are required. Witness signature is required for a video witness testimony.</p></div>`);
    global.requestAnimationFrame(initSignaturePads);
  }

  function initSignaturePads() {
    const assessorCanvas = document.getElementById("mvoAssessorSignature");
    const learnerCanvas = document.getElementById("mvoLearnerSignature");
    const witnessCanvas = document.getElementById("mvoWitnessSignature");
    state.signaturePads = {
      assessor: assessorCanvas ? M.signaturePad(assessorCanvas) : null,
      learner: learnerCanvas ? M.signaturePad(learnerCanvas) : null,
      witness: witnessCanvas ? M.signaturePad(witnessCanvas) : null
    };
  }

  function aggregateRating(clips) {
    if (clips.some((clip) => clip.status === "further")) return "Further evidence required";
    if (clips.some((clip) => clip.status === "action")) return "Competent with actions";
    return "Competent";
  }

  function allMappedEvidence() {
    const map = new Map();
    state.clips.forEach((clip) => (clip.mapped || []).forEach((item) => {
      const key = item.mappedCode;
      if (!map.has(key)) map.set(key, Object.assign({}, item, { lo: clip.lo, clipStartedAt: clip.startedAt }));
    }));
    return [...map.values()].sort((a, b) => a.mappedCode.localeCompare(b.mappedCode, undefined, { numeric: true }));
  }

  async function completeObservation() {
    const assessorPad = state.signaturePads.assessor;
    const learnerPad = state.signaturePads.learner;
    const witnessPad = state.signaturePads.witness;
    const assessorName = clean(layer().querySelector('[data-mvo-field="assessorName"]') && layer().querySelector('[data-mvo-field="assessorName"]').value, 100);
    const witnessName = clean(layer().querySelector('[data-mvo-field="finalWitnessName"]') && layer().querySelector('[data-mvo-field="finalWitnessName"]').value, 100);
    if (!assessorName) return showError("Add the assessor name.");
    if (!assessorPad || assessorPad.isEmpty()) return showError("Assessor signature is required.");
    if (!learnerPad || learnerPad.isEmpty()) return showError("Learner signature is required.");
    if (state.mode === "witness" && (!witnessName || !witnessPad || witnessPad.isEmpty())) return showError("Witness name and signature are required for a witness testimony.");

    const observedCodes = [...new Set(state.clips.flatMap((clip) => clip.codes || []))];
    const mappedEvidence = allMappedEvidence();
    const sections = state.clips.map((clip, index) => ({
      key: `video::${state.unit}::lo${clip.lo}::${index + 1}`,
      categoryId: "video-observation",
      categoryTitle: state.mode === "witness" ? "Video witness testimony" : "Video observation",
      jobId: `unit-${state.unit}`,
      jobTitle: `Unit ${state.unit}`,
      opportunityId: `lo-${clip.lo}-${index + 1}`,
      opportunityTitle: `LO${clip.lo} · ${clip.loTitle}`,
      instruction: "Timestamped video evidence",
      question: "",
      codes: clip.codes.slice()
    }));
    const criteria = observedCodes.map((code) => ({ code, description: description(code), outcome: "Observed", included: true }));
    const endedAt = Math.max(...state.clips.map((clip) => clip.endedAt), state.introduction.endedAt);
    const record = {
      videoObservationV1: true,
      videoObservationVersion: 1,
      method: state.mode === "witness" ? "Video witness testimony" : "Video observation",
      mode: state.mode,
      profileId: state.profile.id,
      courseRouteId: state.profile.courseRouteId,
      courseId: state.course.id || state.course.courseId || "",
      courseTitle: state.course.title || "",
      coverageLabel: state.course.coverageLabel || "AC",
      observationDate: localDate(state.sessionStartedAt),
      startTime: localClock(state.sessionStartedAt, false),
      endTime: localClock(endedAt, false),
      sessionStartedAt: state.sessionStartedAt,
      sessionEndedAt: endedAt,
      location: state.location,
      activityObserved: state.activity || `${state.mode === "witness" ? "Witness testimony for" : "Video observation of"} Unit ${state.unit}`,
      unitNumber: state.unit,
      unitTitle: state.unitTitle,
      jobTitle: `Unit ${state.unit}`,
      opportunityTitle: `${state.mode === "witness" ? "Witness video" : "Video observation"} · Unit ${state.unit}`,
      sections,
      criteria,
      observedCodes,
      mappedEvidence,
      videoTimeline: [state.introduction, ...state.clips].map((clip) => ({
        kind: clip.kind,
        lo: clip.lo,
        loTitle: clip.loTitle,
        codes: clip.codes,
        mapped: clip.mapped,
        mediaId: clip.media.id,
        filename: clip.filename,
        startedAt: clip.startedAt,
        endedAt: clip.endedAt,
        durationSeconds: clip.durationSeconds,
        offsetMs: clip.startedAt - state.sessionStartedAt,
        status: clip.status,
        action: clip.action
      })),
      media: [state.introduction, ...state.clips].map((clip) => Object.assign({}, clip.media, { name: clip.filename, startedAt: clip.startedAt, lo: clip.lo, kind: clip.kind })),
      rating: aggregateRating(state.clips),
      actions: state.clips.filter((clip) => clip.action).map((clip) => `LO${clip.lo}: ${clip.action}`).join("\n"),
      assessorName,
      witnessName,
      witnessRole: state.witnessRole,
      assessorSignature: assessorPad.toDataUrl(),
      learnerSignature: learnerPad.toDataUrl(),
      witnessSignature: witnessPad && !witnessPad.isEmpty() ? witnessPad.toDataUrl() : "",
      completedAt: Date.now()
    };
    let saved = C.saveObservation(record);
    if (Q && typeof Q.observationPayload === "function") {
      try {
        const qrPayload = Q.observationPayload(saved, state.profile, state.course);
        saved = C.saveObservation(Object.assign({}, saved, { qrPayload }));
      } catch (_) {}
    }
    state.savedRecord = saved;
    renderComplete(saved);
  }

  function renderComplete(record) {
    const mappedByUnit = groupMapped(record.mappedEvidence || []);
    show(`${shellHeader("Observation complete", record.method)}<div class="mvo-page"><div class="mvo-complete-mark">✓</div><div class="mvo-summary-mini"><span>${h(state.profile ? state.profile.name : "Learner")}</span><strong>Unit ${h(record.unitNumber)} · ${h(record.rating)}</strong><small>${record.videoTimeline.length - 1} LO clip${record.videoTimeline.length - 1 === 1 ? "" : "s"} · ${(record.mappedEvidence || []).length} exact mapped AC${(record.mappedEvidence || []).length === 1 ? "" : "s"}</small></div>${Object.keys(mappedByUnit).length ? `<div class="mvo-map-summary"><strong>Mapped supporting evidence</strong>${Object.keys(mappedByUnit).map((unit) => `<p><b>Unit ${h(unit)}</b> ${h(mappedByUnit[unit].map((item) => item.mappedCode).join(" · "))}</p>`).join("")}</div>` : ""}<button type="button" class="mvo-primary" data-mvo-action="download-complete">Download compressed ZIP</button><button type="button" class="mvo-secondary" data-mvo-action="done">Done</button><p class="mvo-note">ZIP contains the timestamped PDF plus every introduction and LO video file.</p></div>`);
  }

  function groupMapped(items) {
    return (items || []).reduce((groups, item) => {
      const unit = item.unit || (codeParts(item.mappedCode) || {}).unit || "Other";
      (groups[unit] ||= []).push(item);
      return groups;
    }, {});
  }

  function addPdfText(doc, text, x, y, width, options) {
    const lines = doc.splitTextToSize(String(text || ""), width);
    doc.text(lines, x, y, options || {});
    return y + lines.length * 5;
  }

  function videoPdfBlob(record, profile) {
    const JsPDF = global.jspdf && global.jspdf.jsPDF;
    if (typeof JsPDF !== "function") throw new Error("The offline PDF builder is unavailable.");
    const doc = new JsPDF({ unit: "mm", format: "a4" });
    const left = 16, right = 194, width = right - left;
    let y = 18;
    function ensure(space) { if (y + space > 278) { doc.addPage(); y = 18; } }
    function heading(text) { ensure(12); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(text, left, y); y += 7; doc.setFont("helvetica", "normal"); doc.setFontSize(9); }
    function row(label, value) { ensure(9); doc.setFont("helvetica", "bold"); doc.text(`${label}:`, left, y); doc.setFont("helvetica", "normal"); y = addPdfText(doc, value || "—", left + 32, y, width - 32); y += 2; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("Milos Video Observation", left, y); y += 8;
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text(record.method || "Video observation", left, y); y += 8;
    row("Learner", profile && profile.name || "");
    row("Assessor", record.assessorName);
    row("Course", record.courseTitle);
    row("Main unit", `Unit ${record.unitNumber} — ${record.unitTitle}`);
    row("Date", record.observationDate);
    row("Location", record.location);
    if (record.mode === "witness") { row("Witness", record.witnessName); row("Witness role", record.witnessRole); }
    row("Overall", record.rating);
    heading("Timestamped video evidence");
    (record.videoTimeline || []).forEach((clip) => {
      ensure(14);
      const offset = formatOffset(clip.offsetMs || 0);
      const title = clip.kind === "intro" ? "Introduction" : `LO${clip.lo} — ${clip.loTitle}`;
      doc.setFont("helvetica", "bold"); doc.text(`${offset}  ${title}`, left, y); y += 5;
      doc.setFont("helvetica", "normal");
      y = addPdfText(doc, `${localDate(clip.startedAt)} ${localClock(clip.startedAt, true)} · ${durationLabel(clip.durationSeconds)} · ${clip.filename}`, left, y, width); y += 1;
      if (clip.kind !== "intro") {
        const status = STATUS[clip.status] ? `${STATUS[clip.status].symbol} ${STATUS[clip.status].label}` : "Decision not recorded";
        y = addPdfText(doc, `Decision: ${status}`, left, y, width); y += 1;
        y = addPdfText(doc, `Primary ACs: ${(clip.codes || []).join(" · ")}`, left, y, width); y += 1;
        if (clip.action) { y = addPdfText(doc, `Action: ${clip.action}`, left, y, width); y += 1; }
      }
      y += 3;
    });
    const mapped = record.mappedEvidence || [];
    if (mapped.length) {
      heading("Automatically mapped supporting evidence — 100% wording match");
      const groups = groupMapped(mapped);
      Object.keys(groups).sort((a, b) => Number(a) - Number(b)).forEach((unit) => {
        ensure(10);
        doc.setFont("helvetica", "bold"); doc.text(`Unit ${unit}`, left, y); y += 5; doc.setFont("helvetica", "normal");
        y = addPdfText(doc, groups[unit].map((item) => item.mappedCode).join(" · "), left, y, width); y += 2;
      });
      y += 2;
      y = addPdfText(doc, "Mapped ACs are supporting evidence only. No competence decision is copied from the main unit.", left, y, width); y += 4;
    }
    heading("Actions");
    y = addPdfText(doc, record.actions || "No actions recorded.", left, y, width); y += 6;
    heading("Signatures");
    const signatures = [
      ["Assessor", record.assessorSignature],
      ["Learner", record.learnerSignature],
      ["Witness", record.witnessSignature]
    ].filter((item) => item[1]);
    signatures.forEach(([label, data]) => {
      ensure(28);
      doc.setFont("helvetica", "bold"); doc.text(label, left, y); y += 3;
      try { doc.addImage(data, "JPEG", left, y, 55, 16); } catch (_) {}
      y += 20;
    });
    ensure(12); doc.setFont("helvetica", "normal"); doc.setFontSize(8); y = addPdfText(doc, `Created in Milos ${VERSION}. Video media remains in the accompanying ZIP and is referenced by timestamp and filename above.`, left, y, width);
    return doc.output("blob");
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function exportRecord(record) {
    if (state.exporting) return;
    state.exporting = true;
    const profile = C.getProfile(record.profileId);
    if (!profile) { state.exporting = false; throw new Error("The learner profile for this observation is no longer available."); }
    try {
      const pdfBlob = videoPdfBlob(record, profile);
      const pdfName = `Unit${record.unitNumber}_${record.mode === "witness" ? "Witness" : "VideoObservation"}_${record.observationDate}.pdf`;
      const entries = [{ name: pdfName, blob: pdfBlob, date: new Date(record.completedAt || Date.now()) }];
      const missing = [];
      for (const item of (record.media || [])) {
        let stored = null;
        try { stored = await M.getFile(item.id); } catch (_) {}
        if (!stored || !(stored.blob instanceof Blob)) { missing.push(item.name || item.id); continue; }
        entries.push({ name: clean(item.name || stored.name, 160) || "video", blob: stored.blob, date: new Date(Number(stored.createdAt || item.startedAt || Date.now())) });
      }
      if (missing.length) throw new Error(`${missing.length} video file${missing.length === 1 ? " is" : "s are"} missing from this device, so a complete ZIP was not created.`);
      if (!B || typeof B.makeZip !== "function") throw new Error("Compressed ZIP export is unavailable. Update Milos and try again.");
      const zip = await B.makeZip(entries);
      downloadBlob(zip, `Unit${record.unitNumber}_${record.mode === "witness" ? "Witness" : "VideoObservation"}_${record.observationDate}.zip`);
    } finally {
      state.exporting = false;
    }
  }

  function patchLaunchButtons(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-action="start-observation"][data-id]').forEach((button) => {
      if (button.dataset.mvoEnhanced === "1") return;
      button.dataset.mvoEnhanced = "1";
      const tools = document.createElement("div");
      tools.className = "mvo-method-buttons";
      tools.innerHTML = `<button type="button" data-mvo-mode="assessor" data-profile-id="${h(button.dataset.id)}"><span>●</span> Video observation</button><button type="button" data-mvo-mode="witness" data-profile-id="${h(button.dataset.id)}"><span>○</span> Witness video</button>`;
      button.insertAdjacentElement("afterend", tools);
    });
  }

  function patchHistoryButtons(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-action="observation-download"][data-id]').forEach((button) => {
      const record = C.getObservations().find((item) => item.id === button.dataset.id);
      if (record && record.videoObservationV1) button.textContent = "Download compressed ZIP";
    });
  }

  function observeUi() {
    patchLaunchButtons(document);
    patchHistoryButtons(document);
    if (!global.MutationObserver) return;
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      patchLaunchButtons(node);
      patchHistoryButtons(node);
    }))).observe(document.getElementById("milosApp") || document.body, { childList: true, subtree: true });
  }

  document.addEventListener("click", async (event) => {
    const modeButton = event.target.closest && event.target.closest("[data-mvo-mode]");
    if (modeButton) {
      event.preventDefault();
      try { await launch(modeButton.dataset.profileId, modeButton.dataset.mvoMode); }
      catch (error) { global.alert(error.message || "Video observation could not start."); }
      return;
    }

    const normalDownload = event.target.closest && event.target.closest('[data-action="observation-download"][data-id]');
    if (normalDownload) {
      const record = C.getObservations().find((item) => item.id === normalDownload.dataset.id);
      if (record && record.videoObservationV1) {
        event.preventDefault();
        event.stopImmediatePropagation();
        try { await exportRecord(record); }
        catch (error) { global.alert(error.message || "The video observation ZIP could not be created."); }
        return;
      }
    }

    const actionButton = event.target.closest && event.target.closest("[data-mvo-action]");
    if (actionButton) {
      const action = actionButton.dataset.mvoAction;
      event.preventDefault();
      try {
        if (action === "close") { closeLayer(); return; }
        if (action === "choose-unit") { state.unit = actionButton.dataset.unit; state.unitTitle = unitTitle(state.unit); state.step = "intro"; renderIntroduction(); return; }
        if (action === "record-intro" || action === "record-intro-again") { if (action === "record-intro-again") renderIntroduction(); else await beginRecording("intro"); return; }
        if (action === "choose-lo") { renderLoReady(actionButton.dataset.lo); return; }
        if (action === "record-lo") { await beginRecording("lo"); return; }
        if (action === "stop-recording") { await stopRecording(actionButton.dataset.kind); return; }
        if (action === "save-lo-clip") { savePendingClip(); return; }
        if (action === "back-hub") { renderHub(); return; }
        if (action === "finish-observation") { renderSignatures(); return; }
        if (action === "clear-signature") { const pad = state.signaturePads[actionButton.dataset.pad]; if (pad) pad.clear(); return; }
        if (action === "complete-observation") { await completeObservation(); return; }
        if (action === "download-complete") { if (state.savedRecord) await exportRecord(state.savedRecord); return; }
        if (action === "done") { closeLayer(); global.location.reload(); return; }
      } catch (error) { showError(error.message || "That action could not be completed."); }
      return;
    }

    const statusButton = event.target.closest && event.target.closest("[data-mvo-status]");
    if (statusButton) { event.preventDefault(); chooseStatus(statusButton.dataset.mvoStatus); return; }
    const postStatusButton = event.target.closest && event.target.closest("[data-mvo-post-status]");
    if (postStatusButton) { event.preventDefault(); choosePostStatus(postStatusButton.dataset.mvoPostStatus); }
  }, true);

  global.addEventListener("beforeunload", () => { stopStream(); clearInterval(state.timerId); });

  global.MilosVideoObservation = Object.freeze({
    version: VERSION,
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    softWarningSeconds: SOFT_WARNING_SECONDS,
    burstTargetSeconds: BURST_TARGET_SECONDS,
    exactWordingMapping: true,
    competenceSymbols: cloneStatus(),
    normaliseWords,
    exactMatchesForCodes
  });

  function cloneStatus() {
    return Object.keys(STATUS).reduce((out, key) => { out[key] = Object.assign({}, STATUS[key]); return out; }, {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observeUi, { once: true });
  else observeUi();
})(window);
