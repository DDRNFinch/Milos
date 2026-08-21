(function (global) {
  "use strict";

  const C = global.MilosCore;
  const M = global.MilosMedia;
  if (!C || !global.document) return;

  const REVIEW_KEY = "milos-reviews-v1";
  const OBS_KEY = "milos-observations-v1";
  let layer = null;

  function h(value) { return C.escapeHtml(value == null ? "" : value); }
  function clean(value, max) { return C.cleanText(value, max || 6000); }
  function multiline(value, max) { return C.cleanMultiline(value, max || 10000); }
  function read(key) { try { const v = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function reviewById(id) { return C.getReviews().find(item => item.id === id) || null; }
  function observationById(id) { return C.getObservations().find(item => item.id === id) || null; }

  function toast(message, error) {
    const region = document.getElementById("toastRegion");
    if (!region) return;
    region.innerHTML = `<div class="app-toast is-visible${error ? " is-error" : ""}" role="status">${h(message)}</div>`;
    setTimeout(() => { const item = region.querySelector(".app-toast"); if (item) item.classList.remove("is-visible"); }, 2600);
  }

  function closeEditor() { if (layer) layer.remove(); layer = null; }

  function field(label, name, value, type, options) {
    if (type === "textarea") return `<label class="milos-field"><span>${h(label)}</span><textarea name="${h(name)}" rows="5">${h(value || "")}</textarea></label>`;
    if (type === "select") return `<label class="milos-field"><span>${h(label)}</span><select name="${h(name)}">${(options || []).map(option => `<option value="${h(option)}"${String(value || "") === String(option) ? " selected" : ""}>${h(option)}</option>`).join("")}</select></label>`;
    return `<label class="milos-field"><span>${h(label)}</span><input name="${h(name)}" type="${h(type || "text")}" value="${h(value || "")}"></label>`;
  }

  function reviewTargets(record) {
    const targets = Array.isArray(record.targets) ? record.targets : [];
    return `<section class="milos-record-targets"><div class="milos-section-heading"><span>Agreed actions</span><small>${targets.length}</small></div><div data-record-target-list>${targets.map((target, index) => targetRow(target, index)).join("")}</div><button type="button" class="milos-secondary" data-record-add-target>Add action</button></section>`;
  }

  function targetRow(target, index) {
    return `<div class="milos-record-target" data-record-target>
      ${field(`Action ${index + 1}`, "targetTitle", target && target.title || "", "textarea")}
      <div class="milos-record-split">${field("Course code", "targetCode", target && target.code || "")}${field("Due date", "targetDue", target && target.dueDate || "", "date")}</div>
      <input type="hidden" name="targetId" value="${h(target && target.id || "")}">
      <button type="button" class="milos-record-remove" data-record-remove-target>Remove action</button>
    </div>`;
  }

  function reviewForm(record) {
    return `<form class="milos-record-form" data-record-form="review" data-id="${h(record.id)}">
      <p class="milos-record-note">Edit the saved review below. Existing signatures are retained.</p>
      <div class="milos-record-split">${field("Review date", "reviewDate", record.reviewDate, "date")}${field("Next review date", "nextReviewDate", record.nextReviewDate, "date")}</div>
      ${field("Overall status", "overallStatus", record.overallStatus || "On track", "select", ["On track","Attention required","Off track"])}
      ${field("Meeting format", "meetingFormat", record.meetingFormat || "Face to face", "select", ["Face to face","Virtual","Email"])}
      ${field("Location / meeting link", "location", record.location)}
      <div class="milos-record-split">${field("Provider representative", "providerName", record.providerName)}${field("Employer representative", "employerName", record.employerName)}</div>
      ${field("Employer attendance", "employerAttendance", record.employerAttendance || "Attended", "select", ["Attended","Contributed before the review","Contributed after the review","Unable to contribute"])}
      ${field("Employer contribution / opportunity offered", "employerContribution", record.employerContribution, "textarea")}
      ${field("Previous actions and training delivered", "previousActions", record.previousActions, "textarea")}
      ${field("Evidence and training discussed or collected", "trainingEvidence", record.trainingEvidence, "textarea")}
      ${field("Overall progress against the training plan", "overallProgress", record.overallProgress, "textarea")}
      ${field("Learning progress and any slippage", "learningProgress", record.learningProgress, "textarea")}
      ${field("English, maths and qualifications", "qualifications", record.qualifications, "textarea")}
      ${field("Training plan changes", "trainingPlanChanges", record.trainingPlanChanges, "textarea")}
      ${field("Support needs", "supportNeeds", record.supportNeeds, "textarea")}
      ${field("Wellbeing and safeguarding", "wellbeing", record.wellbeing, "textarea")}
      ${field("Apprentice comments", "apprenticeComments", record.apprenticeComments, "textarea")}
      ${field("Employer comments", "employerComments", record.employerComments, "textarea")}
      ${field("Provider comments", "providerComments", record.providerComments, "textarea")}
      ${reviewTargets(record)}
      <button type="submit" class="milos-primary">Save review changes</button>
    </form>`;
  }

  function observationForm(record) {
    const mediaCount = Array.isArray(record.media) ? record.media.length : 0;
    const sections = Array.isArray(record.sections) ? record.sections : [];
    return `<form class="milos-record-form" data-record-form="observation" data-id="${h(record.id)}">
      <p class="milos-record-note">Edit the saved observation below. Signatures, selected observation mapping and stored media are retained.</p>
      <div class="milos-record-split">${field("Observation date", "observationDate", record.observationDate, "date")}${field("Location", "location", record.location)}</div>
      <div class="milos-record-split">${field("Start time", "startTime", record.startTime, "time")}${field("Finish time", "endTime", record.endTime, "time")}</div>
      ${field("Overall assessment", "rating", record.rating || "Competent", "select", ["Competent","Competent with actions","Further evidence required"])}
      ${field("Activity personally observed", "activityObserved", record.activityObserved, "textarea")}
      ${field("Safe working, PPE and controls", "safetyNotes", record.safetyNotes, "textarea")}
      ${field("Performance, quality and checks", "qualityNotes", record.qualityNotes, "textarea")}
      ${field("Knowledge questions and responses", "questionsAndAnswers", record.questionsAndAnswers, "textarea")}
      ${field("Assessor feedback", "feedback", record.feedback, "textarea")}
      ${field("Actions or further evidence required", "actions", record.actions, "textarea")}
      <section class="milos-record-summary"><b>Observation mapping retained</b><span>${sections.length} selected section${sections.length === 1 ? "" : "s"} · ${Array.isArray(record.observedCodes) ? record.observedCodes.length : 0} observed course item${Array.isArray(record.observedCodes) && record.observedCodes.length === 1 ? "" : "s"} · ${mediaCount} media file${mediaCount === 1 ? "" : "s"}</span></section>
      <button type="submit" class="milos-primary">Save observation changes</button>
    </form>`;
  }

  function openEditor(kind, id) {
    closeEditor();
    const record = kind === "review" ? reviewById(id) : observationById(id);
    if (!record) { toast("That saved record could not be found.", true); return; }
    layer = document.createElement("div");
    layer.className = "milos-record-layer";
    layer.innerHTML = `<section class="milos-record-screen"><div class="milos-record-head"><button type="button" data-record-close>‹ Back</button><b>Edit ${kind === "review" ? "review" : "observation"}</b><span></span></div>${kind === "review" ? reviewForm(record) : observationForm(record)}</section>`;
    document.body.appendChild(layer);
  }

  function collectTargets(form) {
    return [...form.querySelectorAll("[data-record-target]")].map(row => ({
      id: clean(row.querySelector('[name="targetId"]')?.value, 80) || C.uid("target"),
      title: clean(row.querySelector('[name="targetTitle"]')?.value, 220),
      code: clean(row.querySelector('[name="targetCode"]')?.value, 32).toUpperCase(),
      dueDate: C.validDate(row.querySelector('[name="targetDue"]')?.value),
      status: "Agreed"
    })).filter(target => target.title);
  }

  function values(form) {
    const out = {};
    new FormData(form).forEach((value, key) => { if (!key.startsWith("target")) out[key] = typeof value === "string" ? value : ""; });
    return out;
  }

  function saveReviewEdit(form) {
    const record = reviewById(form.dataset.id);
    if (!record) throw new Error("The saved review no longer exists.");
    const v = values(form), next = Object.assign({}, record);
    ["meetingFormat","location","providerName","employerName","employerAttendance"].forEach(key => { next[key] = clean(v[key], 180); });
    ["employerContribution","previousActions","trainingEvidence","overallProgress","learningProgress","qualifications","trainingPlanChanges","supportNeeds","wellbeing","apprenticeComments","employerComments","providerComments"].forEach(key => { next[key] = multiline(v[key], 10000); });
    next.reviewDate = C.validDate(v.reviewDate) || record.reviewDate;
    next.nextReviewDate = C.validDate(v.nextReviewDate) || record.nextReviewDate;
    next.overallStatus = ["On track","Attention required","Off track"].includes(v.overallStatus) ? v.overallStatus : record.overallStatus;
    next.targets = collectTargets(form);
    C.saveReview(next);
  }

  function saveObservationEdit(form) {
    const record = observationById(form.dataset.id);
    if (!record) throw new Error("The saved observation no longer exists.");
    const v = values(form), next = Object.assign({}, record);
    next.observationDate = C.validDate(v.observationDate) || record.observationDate;
    next.location = clean(v.location, 220);
    next.startTime = clean(v.startTime, 12);
    next.endTime = clean(v.endTime, 12);
    next.rating = ["Competent","Competent with actions","Further evidence required"].includes(v.rating) ? v.rating : record.rating;
    ["activityObserved","safetyNotes","qualityNotes","questionsAndAnswers","feedback","actions"].forEach(key => { next[key] = multiline(v[key], 10000); });
    delete next.qrPayload;
    C.saveObservation(next);
  }

  async function deleteRecord(kind, id) {
    const record = kind === "review" ? reviewById(id) : observationById(id);
    if (!record) return;
    if (!confirm(`Delete this saved ${kind}? This cannot be undone.`)) return;
    if (kind === "observation" && M && typeof M.removeFile === "function") {
      for (const item of Array.isArray(record.media) ? record.media : []) {
        if (item && item.id) { try { await M.removeFile(item.id); } catch (_) {} }
      }
    }
    const key = kind === "review" ? REVIEW_KEY : OBS_KEY;
    write(key, read(key).filter(item => item.id !== id));
    try { sessionStorage.setItem("milos-record-message-v28", `${kind === "review" ? "Review" : "Observation"} deleted.`); } catch (_) {}
    location.reload();
  }

  function injectControls() {
    document.querySelectorAll('.milos-complete-view [data-action="review-download"][data-id]').forEach(download => {
      const view = download.closest(".milos-complete-view");
      if (!view || view.querySelector("[data-record-actions=review]")) return;
      const box = document.createElement("div");
      box.className = "milos-record-actions"; box.dataset.recordActions = "review";
      box.innerHTML = `<button type="button" class="milos-secondary" data-record-edit="review" data-id="${h(download.dataset.id)}">Edit review</button><button type="button" class="milos-record-delete" data-record-delete="review" data-id="${h(download.dataset.id)}">Delete review</button>`;
      download.insertAdjacentElement("afterend", box);
    });
    document.querySelectorAll('.milos-complete-view [data-action="observation-download"][data-id]').forEach(download => {
      const view = download.closest(".milos-complete-view");
      if (!view || view.querySelector("[data-record-actions=observation]")) return;
      const box = document.createElement("div");
      box.className = "milos-record-actions"; box.dataset.recordActions = "observation";
      box.innerHTML = `<button type="button" class="milos-secondary" data-record-edit="observation" data-id="${h(download.dataset.id)}">Edit observation</button><button type="button" class="milos-record-delete" data-record-delete="observation" data-id="${h(download.dataset.id)}">Delete observation</button>`;
      const actionGrid = download.closest(".milos-action-grid");
      (actionGrid || download).insertAdjacentElement("afterend", box);
    });
  }

  document.addEventListener("click", event => {
    const close = event.target.closest?.("[data-record-close]");
    if (close) { event.preventDefault(); closeEditor(); return; }
    const edit = event.target.closest?.("[data-record-edit][data-id]");
    if (edit) { event.preventDefault(); event.stopPropagation(); openEditor(edit.dataset.recordEdit, edit.dataset.id); return; }
    const del = event.target.closest?.("[data-record-delete][data-id]");
    if (del) { event.preventDefault(); event.stopPropagation(); deleteRecord(del.dataset.recordDelete, del.dataset.id).catch(error => toast(error.message || "The record could not be deleted.", true)); return; }
    const addTarget = event.target.closest?.("[data-record-add-target]");
    if (addTarget) {
      event.preventDefault();
      const list = addTarget.closest("form")?.querySelector("[data-record-target-list]");
      if (list) list.insertAdjacentHTML("beforeend", targetRow({ id: C.uid("target"), title: "", code: "", dueDate: "" }, list.children.length));
      return;
    }
    const removeTarget = event.target.closest?.("[data-record-remove-target]");
    if (removeTarget) { event.preventDefault(); removeTarget.closest("[data-record-target]")?.remove(); }
  }, true);

  document.addEventListener("submit", event => {
    const form = event.target.closest?.("[data-record-form]");
    if (!form) return;
    event.preventDefault();
    try {
      if (form.dataset.recordForm === "review") saveReviewEdit(form); else saveObservationEdit(form);
      try { sessionStorage.setItem("milos-record-message-v28", `${form.dataset.recordForm === "review" ? "Review" : "Observation"} updated.`); } catch (_) {}
      location.reload();
    } catch (error) { toast(error.message || "The changes could not be saved.", true); }
  }, true);

  const style = document.createElement("style");
  style.textContent = `
.milos-record-actions{display:grid;grid-template-columns:1fr 1fr;gap:.55rem;margin:.6rem 0}.milos-record-delete{border:1px solid rgba(170,48,48,.24);background:rgba(255,255,255,.72);color:#a43c3c;border-radius:999px;padding:.9rem 1rem;font:inherit}.milos-record-layer{position:fixed;inset:0;z-index:13000;background:rgba(246,249,255,.98);backdrop-filter:blur(20px);overflow:auto;color:#1f2328}.milos-record-screen{width:min(100%,680px);min-height:100%;margin:0 auto;padding:max(1rem,env(safe-area-inset-top)) 1rem max(2.5rem,env(safe-area-inset-bottom));box-sizing:border-box}.milos-record-head{display:grid;grid-template-columns:4rem 1fr 4rem;align-items:center;margin:0 0 1.2rem}.milos-record-head b{text-align:center}.milos-record-head button{border:0;background:transparent;font:inherit;text-align:left;padding:.7rem 0}.milos-record-form{display:grid;gap:.72rem}.milos-record-note{margin:0 0 .35rem;color:#686f78;font-size:.79rem;line-height:1.45}.milos-record-split{display:grid;grid-template-columns:1fr 1fr;gap:.65rem}.milos-record-targets{display:grid;gap:.65rem;margin:.4rem 0}.milos-record-target{padding:.8rem;border-radius:1rem;background:rgba(255,255,255,.7);border:1px solid rgba(35,56,85,.08)}.milos-record-remove{border:0;background:transparent;color:#a43c3c;padding:.45rem .2rem;font:inherit;font-size:.76rem}.milos-record-summary{padding:.85rem 1rem;border-radius:1rem;background:rgba(58,134,218,.08);color:#3b4858}.milos-record-summary b,.milos-record-summary span{display:block}.milos-record-summary span{margin-top:.25rem;font-size:.75rem;line-height:1.4;color:#657080}@media(max-width:520px){.milos-record-split{grid-template-columns:1fr}.milos-record-actions{grid-template-columns:1fr 1fr}}
`;
  document.head.appendChild(style);

  new MutationObserver(injectControls).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectControls, { once: true }); else injectControls();
  setTimeout(() => {
    try {
      const message = sessionStorage.getItem("milos-record-message-v28");
      if (message) { sessionStorage.removeItem("milos-record-message-v28"); toast(message); }
    } catch (_) {}
  }, 600);

  global.MilosRecordManagement = Object.freeze({ version: "2.8", openEditor, deleteRecord });
})(window);
