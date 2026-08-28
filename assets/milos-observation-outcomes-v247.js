(function (global) {
  "use strict";

  const C = global.MilosCore;
  const M = global.MilosMedia;
  const B = global.MilosObservationBundle;
  const originalVideo = global.MilosVideoEvidence;
  if (!C || !M || !B || !originalVideo) return;

  const VERSION = "2.47";
  const UNIT_TITLES = Object.freeze({
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

  let exporting = false;

  function clean(value, max) {
    return C.cleanText ? C.cleanText(value, max || 500) : String(value == null ? "" : value).trim().slice(0, max || 500);
  }
  function pad(value) { return String(value).padStart(2, "0"); }
  function localDate(timestamp) { const d = new Date(timestamp || Date.now()); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function localClock(timestamp, seconds) { const d = new Date(timestamp || Date.now()); return [pad(d.getHours()), pad(d.getMinutes()), ...(seconds ? [pad(d.getSeconds())] : [])].join(":"); }
  function durationLabel(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds || 0))), hours = Math.floor(total / 3600), mins = Math.floor((total % 3600) / 60), secs = total % 60;
    return hours ? `${pad(hours)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  }
  function offsetLabel(ms) { return durationLabel(Math.floor(Math.max(0, Number(ms || 0)) / 1000)); }
  function safeName(value) { return clean(value, 100).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 72) || "Evidence"; }
  function codeParts(code) {
    const match = String(code || "").match(/^(\d+)\.(\d+)\.(\d+)$/);
    return match ? { unit: match[1], lo: Number(match[2]), ac: Number(match[3]) } : null;
  }
  function decisionLabel(value) {
    const text = String(value || "").trim();
    if (/^(action|further|more|required)$/i.test(text)) return "More required";
    if (/competent with actions|further evidence required|more required/i.test(text)) return "More required";
    return text;
  }

  function moreRequiredCodes(layer) {
    return Array.from(layer.querySelectorAll(".mve-decision-summary li")).filter((item) => {
      const result = item.querySelector("span");
      return result && decisionLabel(result.textContent) !== "Competent";
    }).map((item) => clean(item.querySelector("b") && item.querySelector("b").textContent, 40)).filter(Boolean);
  }
  function feedbackContext(codes, layer) {
    const first = codes[0] || "", part = codeParts(first);
    if (part) return `Unit ${part.unit} – ${UNIT_TITLES[part.unit] || `Unit ${part.unit}`}`;
    const title = clean(layer.querySelector(".mvo-summary-mini strong") && layer.querySelector(".mvo-summary-mini strong").textContent, 180);
    return title || "This section";
  }
  function writeFeedback(route) {
    const layer = document.getElementById("milosVideoObservationLayer");
    if (!layer) return;
    const textarea = layer.querySelector('[data-mve-field="clipAction"]');
    if (!textarea) return;
    const codes = moreRequiredCodes(layer), context = feedbackContext(codes, layer), codeText = codes.length ? ` against ${codes.join(", ")}` : "";
    textarea.value = route === "learner"
      ? `${context} needs a little more evidence${codeText}. The learner will provide suitable additional evidence, such as a statement, photo, video or supporting document.`
      : `${context} needs a little more evidence${codeText}. We will cover this in a future observation.`;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    layer.querySelectorAll("[data-milos-more-route]").forEach((button) => button.classList.toggle("is-selected", button.dataset.milosMoreRoute === route));
  }

  function patchDecisionBar(layer) {
    const bar = layer.querySelector(".mvo-decision-bar");
    if (!bar || bar.dataset.milosV247 === "1") return;
    bar.dataset.milosV247 = "1";
    const action = bar.querySelector('[data-mve-status="action"]');
    if (action) action.remove();
    const competent = bar.querySelector('[data-mve-status="competent"]');
    const more = bar.querySelector('[data-mve-status="further"]');
    if (competent) competent.innerHTML = "<small>Competent</small>";
    if (more) more.innerHTML = "<small>More required</small>";
  }

  function patchClipReview(layer) {
    const textarea = layer.querySelector('[data-mve-field="clipAction"]');
    if (!textarea || textarea.dataset.milosV247 === "1") return;
    textarea.dataset.milosV247 = "1";
    layer.querySelectorAll(".mve-decision-summary li span").forEach((node) => { node.textContent = decisionLabel(node.textContent); });
    const codes = moreRequiredCodes(layer), label = textarea.closest("label"), labelText = label && label.querySelector("span");
    const kicker = layer.querySelector(".mvo-top small");
    if (!codes.length) {
      if (kicker) kicker.textContent = "Review feedback after recording";
      if (labelText) labelText.textContent = "Feedback note (optional)";
      textarea.placeholder = "Add an optional feedback note for this section";
      return;
    }
    if (kicker) kicker.textContent = "Choose how to complete the evidence";
    if (labelText) labelText.textContent = "Feedback";
    textarea.placeholder = "Choose how the additional evidence will be completed";
    const picker = document.createElement("div");
    picker.className = "milos-more-route-v247";
    picker.innerHTML = `<strong>How will this be completed?</strong><small>More required: ${codes.join(" · ")}</small><div><button type="button" data-milos-more-route="observation">Future observation</button><button type="button" data-milos-more-route="learner">Learner evidence</button></div><small>Milos will write the feedback for you. You can edit it before saving.</small>`;
    if (label) label.parentNode.insertBefore(picker, label);
  }

  function normaliseLayerText(layer) {
    layer.querySelectorAll(".mvo-summary-mini strong, .mve-decision-summary li span").forEach((node) => {
      node.textContent = String(node.textContent || "").replace(/Competent with actions|Further evidence required/gi, "More required");
    });
  }
  function patchLayer() {
    const layer = document.getElementById("milosVideoObservationLayer");
    if (!layer || layer.hidden) return;
    patchDecisionBar(layer);
    patchClipReview(layer);
    normaliseLayerText(layer);
    if (layer.querySelector(".mvo-complete-mark")) setTimeout(() => syncFeedbackRecord(), 0);
  }

  function syncFeedbackRecord(recordId) {
    const storageKey = C.STORAGE && C.STORAGE.observations;
    if (!storageKey || !global.localStorage) return null;
    let records;
    try { records = JSON.parse(global.localStorage.getItem(storageKey) || "[]"); } catch (_) { return null; }
    if (!Array.isArray(records) || !records.length) return null;
    let index = -1, newest = -Infinity;
    records.forEach((record, i) => {
      if (!record || !(record.videoEvidenceV231 || record.videoObservationV1)) return;
      if (recordId && record.id === recordId) { index = i; newest = Infinity; return; }
      if (recordId || newest === Infinity) return;
      const stamp = Number(record.completedAt || record.sessionEndedAt || 0);
      if (stamp > newest) { newest = stamp; index = i; }
    });
    if (index < 0) return null;
    const record = records[index];
    record.rating = decisionLabel(record.rating);
    if (Array.isArray(record.criteria)) record.criteria = record.criteria.map((item) => Object.assign({}, item, { competence: decisionLabel(item && item.competence) }));
    if (record.actions) record.feedback = record.actions;
    records[index] = record;
    try { global.localStorage.setItem(storageKey, JSON.stringify(records)); } catch (_) { return null; }
    return record;
  }

  function latestVideoRecord() {
    const records = C.getObservations ? C.getObservations() : [];
    return (records || []).filter((record) => record && (record.videoEvidenceV231 || record.videoObservationV1)).sort((a, b) => Number(b.completedAt || b.sessionEndedAt || 0) - Number(a.completedAt || a.sessionEndedAt || 0))[0] || null;
  }
  function legacyLinkedWitnesses(record) {
    if (!record || record.mode === "witness") return [];
    const end = Number(record.sessionEndedAt || record.completedAt || 0);
    return (C.getObservations ? C.getObservations() : []).filter((item) => item.id !== record.id && item.mode === "witness" && item.profileId === record.profileId && item.observationDate === record.observationDate && String(item.unitNumber || "") === String(record.unitNumber || "") && Math.abs(Number(item.sessionStartedAt || item.createdAt || 0) - end) <= 4 * 60 * 60 * 1000);
  }
  function exportView(record) {
    const legacyWitnesses = legacyLinkedWitnesses(record);
    if (!legacyWitnesses.length) return record;
    return Object.assign({}, record, {
      witnessEvidence: [...(record.witnessEvidence || []), ...legacyWitnesses.map((item) => ({ witnessName: item.witnessName, witnessRole: item.witnessRole, location: item.location, activityObserved: item.activityObserved, startedAt: item.sessionStartedAt, endedAt: item.sessionEndedAt, videoTimeline: item.videoTimeline || [], media: item.media || [], criteria: item.criteria || [], mappedEvidence: item.mappedEvidence || [], actions: item.actions || "", feedback: item.feedback || item.actions || "", witnessSignature: item.witnessSignature || "" }))],
      media: [...(record.media || []), ...legacyWitnesses.flatMap((item) => item.media || [])].filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
    });
  }
  function groupMapped(items) {
    return (items || []).reduce((groups, item) => {
      const unit = item.unit || (codeParts(item.mappedCode) || {}).unit || "Other";
      (groups[unit] ||= []).push(item);
      return groups;
    }, {});
  }
  function compactMappedCode(code, unit) {
    const part = codeParts(code);
    if (part && String(part.unit) === String(unit)) return `${part.lo}.${part.ac}`;
    return clean(code, 40);
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
    function evidenceCard(clip, witnessName) {
      const acs = clip.acTimeline || [], heading = clip.kind === "intro" ? "Introduction" : (clip.lo ? `LO${clip.lo} · ${clip.loTitle || ""}` : clip.loTitle || "Evidence clip");
      const statusLines = acs.map((ac) => {
        const start = offsetLabel(ac.startedOffsetMs), end = offsetLabel(ac.endedOffsetMs == null ? ac.startedOffsetMs : ac.endedOffsetMs);
        return `${ac.code} — Video ${start}${end !== start ? `–${end}` : ""} — ${decisionLabel(ac.status)}`;
      });
      const estimated = 19 + Math.min(32, statusLines.length * 4); ensure(estimated);
      doc.setDrawColor(...line); doc.setFillColor(252, 253, 255); doc.roundedRect(margin, y, contentW, Math.max(20, estimated), 2, 2, "FD");
      let cy = y + 6; doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...navy); doc.text(heading, margin + 4, cy); cy += 5; doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...grey);
      const meta = `${localDate(clip.startedAt)} ${localClock(clip.startedAt, true)} · ${durationLabel(clip.durationSeconds)} · ${clip.filename || "video"}${witnessName ? ` · Witness: ${witnessName}` : ""}`;
      const metaLines = doc.splitTextToSize(meta, contentW - 8); doc.text(metaLines, margin + 4, cy); cy += metaLines.length * 3.8 + 2;
      doc.setTextColor(35, 39, 46); doc.setFontSize(9);
      statusLines.forEach((text) => { const lines = doc.splitTextToSize(text, contentW - 12); doc.text(lines, margin + 6, cy); cy += lines.length * 4; });
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
    infoRow("Date / time", `${record.observationDate || ""} · ${record.startTime || ""}–${record.endTime || ""}`); infoRow("Location", record.location); infoRow("Work / activity", record.activityObserved); infoRow("Overall decision", decisionLabel(record.rating));

    section("Recorded evidence");
    (record.videoTimeline || []).filter((clip) => clip.source !== "witness").forEach((clip) => evidenceCard(clip, ""));
    (record.witnessEvidence || []).forEach((witness, index) => {
      section(`Witness testimony${record.witnessEvidence.length > 1 ? ` ${index + 1}` : ""}`);
      infoRow("Witness", witness.witnessName); infoRow("Witness role", witness.witnessRole); if (witness.location) infoRow("Location", witness.location);
      (witness.videoTimeline || []).forEach((clip) => evidenceCard(clip, witness.witnessName));
      if (witness.feedback || witness.actions) { ensure(12); doc.setFont("helvetica", "bold"); doc.text("Witness feedback", margin, y); y += 5; paragraph(witness.feedback || witness.actions, margin, contentW, 9.5); }
      signature("Witness signature", witness.witnessSignature, witness.witnessName);
    });

    const mapped = record.mappedEvidence || [];
    if (mapped.length) {
      section("Additional mapped criteria");
      const groups = groupMapped(mapped);
      Object.keys(groups).sort((a, b) => Number(a) - Number(b)).forEach((unit) => {
        const codes = [...new Set(groups[unit].map((item) => compactMappedCode(item.mappedCode, unit)).filter(Boolean))];
        if (!codes.length) return;
        ensure(8); doc.setFont("helvetica", "bold"); doc.setFontSize(9.2); doc.text(`Unit ${unit}`, margin, y); doc.setFont("helvetica", "normal"); doc.setFontSize(9); paragraph(codes.join(" · "), margin + 25, contentW - 25, 9); y += 1;
      });
      ensure(7); doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...grey); paragraph("Mapped supporting evidence only; competence is not copied automatically.", margin, contentW, 8); doc.setTextColor(35, 39, 46);
    }

    const feedback = clean(record.feedback || record.actions || "", 6000);
    if (feedback) { section("Feedback / more required"); paragraph(feedback, margin, contentW, 9.5); }
    section("Signatures"); signature("Assessor", record.assessorSignature, record.assessorName); signature("Learner", record.learnerSignature, profile && profile.name || ""); if (record.mode === "witness" && record.witnessSignature) signature("Witness", record.witnessSignature, record.witnessName);

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page); doc.setDrawColor(...line); doc.line(margin, 286, W - margin, 286); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...grey); doc.text(`Created in Milos ${VERSION} · Page ${page} of ${pages}`, margin, 291); doc.text("Video timestamps use the actual recording time for each file.", W - margin, 291, { align: "right" });
    }
    return doc.output("blob");
  }

  function mediaDurationMs(record, mediaId) {
    const timelines = [record && record.videoTimeline || [], ...(record && record.witnessEvidence || []).map((item) => item.videoTimeline || [])];
    const clip = timelines.flat().find((item) => item && item.mediaId === mediaId);
    if (!clip) return 0;
    const explicit = Number(clip.durationSeconds || 0) * 1000;
    if (explicit > 0) return explicit;
    return Math.max(0, Number(clip.endedAt || 0) - Number(clip.startedAt || 0));
  }
  async function seekableEvidenceBlob(blob, record, mediaId) {
    if (!blob || !String(blob.type || "").toLowerCase().includes("webm") || typeof global.ysFixWebmDuration !== "function") return blob;
    const durationMs = mediaDurationMs(record, mediaId);
    if (!durationMs) return blob;
    try { return await global.ysFixWebmDuration(blob, durationMs, { logger: false }); } catch (_) { return blob; }
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function exportRecord(input) {
    if (exporting) return;
    exporting = true;
    const synced = syncFeedbackRecord(input && input.id), record = exportView(synced || input), profile = C.getProfile(record && record.profileId);
    if (!record || !profile) { exporting = false; throw new Error("The learner profile for this observation is no longer available."); }
    try {
      const base = safeName(`${record.jobTitle || (record.unitNumber ? `Unit${record.unitNumber}` : "Observation")}_${record.observationDate || localDate()}`);
      const entries = [{ name: `${base}_Evidence_Record.pdf`, blob: buildProfessionalPdf(record, profile), date: new Date(record.completedAt || Date.now()) }], missing = [];
      for (const item of (record.media || [])) {
        let stored = null; try { stored = await M.getFile(item.id); } catch (_) {}
        if (!stored || !(stored.blob instanceof Blob)) { missing.push(item.name || item.id); continue; }
        const exportBlob = await seekableEvidenceBlob(stored.blob, record, item.id);
        entries.push({ name: clean(item.name || stored.name, 170) || "video", blob: exportBlob, date: new Date(Number(stored.createdAt || item.startedAt || Date.now())) });
      }
      if (missing.length) throw new Error(`${missing.length} video file${missing.length === 1 ? " is" : "s are"} missing from this device, so a complete ZIP was not created.`);
      if (!B || typeof B.makeZip !== "function") throw new Error("Compressed ZIP export is unavailable. Update Milos and try again.");
      const zip = await B.makeZip(entries); downloadBlob(zip, `${base}_Complete_Evidence.zip`);
    } finally { exporting = false; }
  }

  function interceptClicks(event) {
    const target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    const route = target.closest("[data-milos-more-route]");
    if (route) { event.preventDefault(); writeFeedback(route.dataset.milosMoreRoute); return; }

    const history = target.closest('[data-action="observation-download"][data-id]');
    if (history) {
      const record = (C.getObservations ? C.getObservations() : []).find((item) => item.id === history.dataset.id);
      if (record && (record.videoEvidenceV231 || record.videoObservationV1)) {
        event.preventDefault(); event.stopImmediatePropagation();
        exportRecord(record).catch((error) => global.alert(error.message || "The evidence ZIP could not be created."));
      }
      return;
    }
    const complete = target.closest('[data-mve-action="download-complete"]');
    if (complete) {
      const record = syncFeedbackRecord() || latestVideoRecord();
      if (record) {
        event.preventDefault(); event.stopImmediatePropagation();
        exportRecord(record).catch((error) => global.alert(error.message || "The evidence ZIP could not be created."));
      }
    }
  }

  function start() {
    patchLayer();
    global.addEventListener("click", interceptClicks, true);
    if (!global.MutationObserver) return;
    new MutationObserver(() => patchLayer()).observe(document.body, { childList: true, subtree: true });
  }

  global.MilosVideoEvidence = Object.freeze(Object.assign({}, originalVideo, {
    version: VERSION,
    simplifiedDecisions: true,
    moreRequiredFeedback: true,
    compactMappedPdf: true,
    exportRecord,
    buildProfessionalPdf
  }));

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})(window);
