(function (global) {
  "use strict";

  const C = global.MilosCore;
  if (!C || !global.document) return;

  const TAP_TARGET = 7;
  const TAP_RESET_MS = 5000;
  const PROFILE_SESSION_KEY = "milos-auto-review-profile-v1";
  const AUTO_FIELDS = Object.freeze([
    "previousActions",
    "trainingEvidence",
    "overallProgress",
    "learningProgress",
    "qualifications",
    "trainingPlanChanges",
    "supportNeeds",
    "wellbeing",
    "apprenticeComments",
    "providerComments",
  ]);

  let currentProfileId = "";
  let tapCount = 0;
  let lastTapAt = 0;
  let autoModeActive = false;
  let lastContextSignature = "";
  let refreshTimer = null;
  const userEditedFields = new Set();

  try { currentProfileId = global.sessionStorage.getItem(PROFILE_SESSION_KEY) || ""; } catch (_) {}

  function clean(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function firstName(value) {
    return clean(value).split(/\s+/)[0] || "The learner";
  }

  function unique(values) {
    return [...new Set((values || []).map(clean).filter(Boolean))];
  }

  function list(values) {
    const items = unique(values);
    if (!items.length) return "none recorded";
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  }

  function percent(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  function stageLabel(toc) {
    const value = percent(toc);
    if (value < 20) return "early stage";
    if (value < 45) return "developing stage";
    if (value < 70) return "mid-programme stage";
    if (value < 90) return "advanced stage";
    return "completion stage";
  }

  function statusFrom(metrics) {
    const toc = percent(metrics.toc);
    const coverage = percent(metrics.coverage);
    const learning = percent(metrics.learningPercent);
    const coverageGap = toc - coverage;
    const learningGap = toc - learning;
    if (coverageGap > 25 || learningGap > 20) return "Off track";
    if (coverageGap > 12 || learningGap > 10) return "Attention required";
    return "On track";
  }

  function codeSummary(codes, course, limit) {
    const descriptions = course && course.descriptions && typeof course.descriptions === "object" ? course.descriptions : {};
    const selected = unique(codes).slice(0, limit || 5);
    if (!selected.length) return "no new mapped course items recorded since the previous review";
    return selected.map((code) => {
      const description = clean(descriptions[code]);
      if (!description) return code;
      const short = description.length > 120 ? `${description.slice(0, 117).trim()}…` : description;
      return `${code} (${short})`;
    }).join("; ");
  }

  function targetSummary(targets) {
    const items = Array.isArray(targets) ? targets : [];
    if (!items.length) return "no current Evia targets were included in the QR";
    return list(items.slice(0, 4).map((target) => {
      const title = clean(target && target.title);
      const code = clean(target && target.code);
      return code && title ? `${code}: ${title}` : title || code;
    }));
  }

  function previousActionSummary(previous) {
    const targets = Array.isArray(previous && previous.targets) ? previous.targets : [];
    if (!previous) return "This is the first review stored in Milos, so there are no previous Milos review actions to close.";
    if (!targets.length) return "The previous Milos review contains no recorded actions to close.";
    return `The previous Milos review recorded ${targets.length} agreed ${targets.length === 1 ? "action" : "actions"}: ${list(targets.map((target) => target.title))}. Their completion should be confirmed during this review.`;
  }

  function progressPosition(metrics) {
    const toc = percent(metrics.toc);
    const coverage = percent(metrics.coverage);
    const learning = percent(metrics.learningPercent);
    const status = statusFrom(metrics);
    if (status === "On track") return `The current QR data is broadly in line with the planned stage of the programme.`;
    if (status === "Attention required") return `The current QR data shows some difference between planned time on course and recorded progress, so the training plan should be checked for manageable slippage.`;
    return `The current QR data shows a significant gap against the planned stage of the programme and requires a clear recovery plan.`;
  }

  function buildReports(profile, snapshot, course, metrics, previous) {
    const learner = firstName(profile && profile.name);
    const coverageLabel = clean(course && course.coverageLabel) || "course";
    const learningLabel = clean(course && course.learningLabel) || "learning";
    const toc = percent(metrics.toc);
    const coverage = percent(metrics.coverage);
    const learning = percent(metrics.learningPercent);
    const completed = Number(metrics.completed || 0);
    const total = Number(metrics.total || 0);
    const evidenceCount = Math.max(0, Number(snapshot && snapshot.evidenceCount || 0));
    const hours = Number(metrics.learningHours || 0);
    const targetHours = Number(metrics.learningTarget || 0);
    const changedCodes = C.codesSinceLastReview(profile.id, snapshot && snapshot.completedCodes || []);
    const qrChangedCodes = unique(snapshot && snapshot.changedCodes || []);
    const newCodes = unique([...changedCodes, ...qrChangedCodes]);
    const currentTargets = Array.isArray(snapshot && snapshot.targets) ? snapshot.targets : [];
    const stage = stageLabel(toc);
    const status = statusFrom(metrics);
    const newText = codeSummary(newCodes, course, 5);
    const targetsText = targetSummary(currentTargets);
    const learningGap = toc - learning;

    const learningPosition = learningGap <= 5
      ? `${learner}'s ${learningLabel} is broadly in line with the planned programme position.`
      : learningGap <= 10
        ? `${learner}'s ${learningLabel} is slightly behind the planned programme position and should be monitored before the next review.`
        : `${learner}'s ${learningLabel} is behind the planned programme position and requires an agreed recovery plan.`;

    const targetSentence = currentTargets.length
      ? `The current Evia targets are ${targetsText}.`
      : `The QR contains no current Evia targets, so new actions must be agreed during this review.`;

    return {
      previousActions: `${previousActionSummary(previous)} The latest Evia QR now places ${learner} at the ${stage} of the course. ${targetSentence}`,
      trainingEvidence: `The latest Evia QR records ${evidenceCount} evidence ${evidenceCount === 1 ? "record" : "records"} and ${completed} of ${total} mapped ${coverageLabel} items covered (${coverage}%). Since the previous review, the recorded new or changed course areas are ${newText}. This review should confirm that the evidence is valid, current and sufficient for the stage ${learner} has reached.`,
      overallProgress: `${learner} is currently at approximately ${toc}% of the planned course duration, placing ${learner} in the ${stage}. Evia shows ${coverage}% ${coverageLabel} coverage (${completed}/${total}) and ${learning}% of the planned ${learningLabel} requirement. ${progressPosition(metrics)} On the QR evidence available, Milos rates the current position as ${status.toLowerCase()}.`,
      learningProgress: `${learner} has ${hours.toFixed(1)} hours of ${learningLabel} recorded against a current target of ${targetHours.toFixed(0)} hours, which is ${learning}% of the requirement. The planned course position is approximately ${toc}%. ${learningPosition} Any unrecorded workplace or provider learning should be added before the next progress check so the review reflects the full training position.`,
      qualifications: `The Evia progress QR does not contain personal English, maths or separate mandatory qualification results. These must be confirmed with ${learner} and the provider during the review and added here if applicable; Milos has not assumed a result that was not present in the QR.`,
      trainingPlanChanges: status === "On track"
        ? `The Evia QR does not indicate a major course-stage variance at this review. Keep the training plan aligned to the current ${stage}, close or update the current Evia targets, and confirm whether any delivery dates or planned activities need changing.`
        : `The current Evia QR indicates that the training plan should be checked against the ${stage}. Agree practical recovery actions around ${coverageLabel} coverage and ${learningLabel}, prioritise the current Evia targets, and record any revised delivery dates before the next review.`,
      supportNeeds: `No wellbeing, safeguarding or personal support information is carried in the Evia progress QR. Confirm directly with ${learner} whether any support, reasonable adjustment, workplace issue or change of circumstance is affecting progress, then edit this field to record the discussion accurately.`,
      wellbeing: `Wellbeing and safeguarding information is deliberately not transferred in the Evia progress QR. Complete the check-in directly with ${learner} during this review and replace or expand this text with the learner's actual response and any support or signposting required.`,
      apprenticeComments: `${learner}'s current Evia position is ${coverage}% ${coverageLabel} coverage and ${learning}% of the planned ${learningLabel} requirement at approximately ${toc}% through the course. The current targets are ${targetsText}. This field should be edited during the review so it reflects ${learner}'s own comments on progress, training and the next stage of the course.`,
      providerComments: `The provider review of the latest Evia QR places ${learner} in the ${stage}, with ${coverage}% ${coverageLabel} coverage and ${learning}% ${learningLabel} progress. ${progressPosition(metrics)} The next review period should focus on the current targets, any new mapped areas since the previous review, and keeping recorded training aligned with the planned course stage.`,
      overallStatus: status,
    };
  }

  function showToast(message, isError) {
    const region = document.getElementById("toastRegion");
    if (!region) return;
    region.innerHTML = `<div class="app-toast is-visible${isError ? " is-error" : ""}" role="status"></div>`;
    const item = region.querySelector(".app-toast");
    if (item) item.textContent = message;
    setTimeout(() => {
      const current = region.querySelector(".app-toast");
      if (current) current.classList.remove("is-visible");
      setTimeout(() => { if (region) region.innerHTML = ""; }, 350);
    }, 3000);
  }

  function rememberProfile(id) {
    currentProfileId = clean(id);
    autoModeActive = false;
    tapCount = 0;
    lastTapAt = 0;
    lastContextSignature = "";
    userEditedFields.clear();
    try {
      if (currentProfileId) global.sessionStorage.setItem(PROFILE_SESSION_KEY, currentProfileId);
      else global.sessionStorage.removeItem(PROFILE_SESSION_KEY);
    } catch (_) {}
  }

  function isReviewPage(node) {
    if (!node) return false;
    if (node.closest && node.closest('form[data-form^="review-"]')) return true;
    const page = node.closest && node.closest(".milos-page");
    return !!(page && (page.querySelector('[data-action="review-next"]') || page.querySelector('[data-action^="review-"]')));
  }

  function currentReviewForm() {
    return document.querySelector('form[data-form^="review-"]');
  }

  function setValue(element, value) {
    if (!element || value == null) return;
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function field(form, name) {
    return form && form.elements && form.elements[name] ? form.elements[name] : null;
  }

  async function context() {
    const profile = currentProfileId ? C.getProfile(currentProfileId) : null;
    if (!profile) throw new Error("Milos Automatic Mode could not identify the current learner.");
    const snapshot = C.latestSnapshot(profile);
    if (!snapshot) throw new Error("Scan the learner's current Evia progress QR before using Automatic Mode.");
    const course = await C.loadCourse(profile.courseRouteId || snapshot.courseRouteId);
    const metrics = C.metricsFor(profile, course);
    const previous = C.reviewsForProfile(profile.id)[0] || null;
    return { profile, snapshot, course, metrics, previous };
  }

  function signatureFor(ctx) {
    return [ctx.profile.id, ctx.snapshot.importedAt || 0, ctx.metrics.coverage, ctx.metrics.learningHours, ctx.metrics.toc, (ctx.snapshot.targets || []).length].join("|");
  }

  async function fillForm(form, overwriteAll) {
    if (!form || !form.matches('form[data-form^="review-"]')) return false;
    const ctx = await context();
    const reports = buildReports(ctx.profile, ctx.snapshot, ctx.course, ctx.metrics, ctx.previous);
    AUTO_FIELDS.forEach((name) => {
      if (!overwriteAll && userEditedFields.has(name)) return;
      const element = field(form, name);
      if (element) setValue(element, reports[name]);
    });
    const status = field(form, "overallStatus");
    if (status && (overwriteAll || !userEditedFields.has("overallStatus"))) setValue(status, reports.overallStatus);
    lastContextSignature = signatureFor(ctx);
    return true;
  }

  function pulse(mark) {
    if (!mark) return;
    mark.classList.remove("milos-review-auto-pulse");
    void mark.offsetWidth;
    mark.classList.add("milos-review-auto-pulse");
    setTimeout(() => mark.classList.remove("milos-review-auto-pulse"), 900);
  }

  async function activate(mark) {
    autoModeActive = true;
    userEditedFields.clear();
    let ctx;
    try { ctx = await context(); }
    catch (error) {
      autoModeActive = false;
      showToast(error.message || "Milos Automatic Mode could not prepare this review.", true);
      return;
    }
    lastContextSignature = signatureFor(ctx);
    const form = currentReviewForm();
    if (form) await fillForm(form, true);
    pulse(mark);
    showToast("Milos Automatic Review Mode is on. Review text will be prefilled from the latest Evia QR and remains editable.", false);
  }

  function scheduleFill() {
    if (!autoModeActive) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      refreshTimer = null;
      const form = currentReviewForm();
      if (!form) return;
      try {
        const ctx = await context();
        const signature = signatureFor(ctx);
        const overwriteAll = !lastContextSignature || signature !== lastContextSignature;
        await fillForm(form, overwriteAll);
      } catch (_) {}
    }, 80);
  }

  document.addEventListener("click", (event) => {
    const start = event.target && event.target.closest ? event.target.closest('[data-action="start-review"][data-id]') : null;
    if (start) rememberProfile(start.dataset.id);

    const mark = event.target && event.target.closest ? event.target.closest(".milos-guidance > span") : null;
    if (!mark || !isReviewPage(mark)) return;
    event.preventDefault();
    const now = Date.now();
    if (!lastTapAt || now - lastTapAt > TAP_RESET_MS) tapCount = 0;
    tapCount += 1;
    lastTapAt = now;
    if (tapCount < TAP_TARGET) return;
    tapCount = 0;
    lastTapAt = 0;
    activate(mark).catch(() => showToast("Milos Automatic Mode could not prepare this review.", true));
  }, true);

  document.addEventListener("input", (event) => {
    if (!autoModeActive || !event.isTrusted) return;
    const form = event.target && event.target.closest ? event.target.closest('form[data-form^="review-"]') : null;
    if (!form) return;
    const name = clean(event.target.name);
    if (AUTO_FIELDS.includes(name) || name === "overallStatus") userEditedFields.add(name);
  }, true);

  const observer = new MutationObserver(scheduleFill);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const style = document.createElement("style");
  style.id = "milos-review-auto-v26-style";
  style.textContent = `
.milos-page .milos-guidance>span{touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.milos-page .milos-guidance>span.milos-review-auto-pulse{animation:milosReviewAutoPulse .8s ease}
@keyframes milosReviewAutoPulse{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(47,143,239,.35)}45%{transform:scale(1.08);box-shadow:0 0 0 14px rgba(47,143,239,0)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(47,143,239,0)}}`;
  document.head.appendChild(style);

  global.MilosReviewAuto = Object.freeze({
    version: "2.6",
    tapTarget: TAP_TARGET,
    fields: AUTO_FIELDS.slice(),
    buildReports,
    statusFrom,
    stageLabel,
  });
})(window);
