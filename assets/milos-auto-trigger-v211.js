(function (global) {
  "use strict";

  if (!global.document) return;

  const TAP_TARGET = 7;
  const TAP_RESET_MS = 5000;
  const REVIEW_PROFILE_KEY = "milos-auto-review-profile-v1";
  const OBS_PROFILE_KEY = "milos-auto-observation-profile-v1";
  const FORM_SELECTOR = 'form[data-form="observation-record"], form[data-form^="review-"]';
  const MARK_SELECTOR = ".milos-guidance > span";
  const REVIEW_FIELDS = [
    "previousActions", "trainingEvidence", "overallProgress", "learningProgress", "qualifications",
    "trainingPlanChanges", "supportNeeds", "wellbeing", "apprenticeComments", "providerComments", "overallStatus"
  ];
  const OBS_FIELDS = [
    "activityObserved", "safetyNotes", "qualityNotes", "questionsAndAnswers", "feedback", "actions"
  ];

  let tapCount = 0;
  let lastTapAt = 0;
  let lastPointerAt = 0;
  let activeMode = "";
  let refreshing = false;
  let refreshTimer = null;
  let lastSignature = "";
  const editedFields = new Set();

  function clean(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function unique(items) {
    return [...new Set((items || []).map(clean).filter(Boolean))];
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
    }, 2800);
  }

  function relevantForm(mark) {
    return mark && mark.closest ? mark.closest(FORM_SELECTOR) : null;
  }

  function targetMark(event) {
    const mark = event && event.target && event.target.closest ? event.target.closest(MARK_SELECTOR) : null;
    return mark && relevantForm(mark) ? mark : null;
  }

  function modeForForm(form) {
    if (!form) return "";
    return form.matches('form[data-form="observation-record"]') ? "observation" : "review";
  }

  function profileKeyForMode(mode) {
    return mode === "observation" ? OBS_PROFILE_KEY : REVIEW_PROFILE_KEY;
  }

  function rememberedProfileId(mode) {
    try { return clean(sessionStorage.getItem(profileKeyForMode(mode))); } catch (_) { return ""; }
  }

  function rememberProfile(event) {
    const target = event.target && event.target.closest ? event.target.closest('[data-action][data-id]') : null;
    if (!target) return;
    const id = clean(target.dataset.id);
    if (!id) return;
    try {
      if (target.dataset.action === "start-review") sessionStorage.setItem(REVIEW_PROFILE_KEY, id);
      if (target.dataset.action === "start-observation") sessionStorage.setItem(OBS_PROFILE_KEY, id);
    } catch (_) {}
    if (target.dataset.action === "start-review" || target.dataset.action === "start-observation") {
      activeMode = "";
      editedFields.clear();
      lastSignature = "";
    }
  }

  function selectedObservationKeys(form) {
    return unique([...form.querySelectorAll('.milos-selected-section [data-action="observation-remove-section"][data-id]')]
      .map((button) => button.dataset.id));
  }

  function observationSectionsFromDom(form) {
    return [...form.querySelectorAll(".milos-selected-section")].map((card) => {
      const context = clean(card.querySelector("small") && card.querySelector("small").textContent);
      const parts = context.split("·").map(clean).filter(Boolean);
      return {
        title: clean(card.querySelector("strong") && card.querySelector("strong").textContent),
        job: parts.slice(1).join(" · "),
        question: "",
        requirements: []
      };
    }).filter((section) => section.title);
  }

  function observationSectionsFromCourse(C, course, keys) {
    const wanted = new Set(keys);
    const descriptions = course && course.descriptions && typeof course.descriptions === "object" ? course.descriptions : {};
    const output = [];
    for (const category of Array.isArray(course && course.siteData) ? course.siteData : []) {
      for (const job of Array.isArray(category && category.jobs) ? category.jobs : []) {
        for (const opportunity of Array.isArray(job && job.opps) ? job.opps : []) {
          const key = [category.id, job.id, opportunity.id].map(clean).filter(Boolean).join("::");
          if (!wanted.has(key)) continue;
          const codes = C.cleanCodes(opportunity.codes || []);
          output.push({
            title: clean(opportunity.title),
            job: clean(job.title),
            question: clean(opportunity.question),
            requirements: codes.map((code) => ({ code, text: clean(descriptions[code]) })).filter((item) => item.text)
          });
        }
      }
    }
    return output;
  }

  function formSignature(form, mode) {
    if (!form) return "";
    if (mode === "observation") return selectedObservationKeys(form).join("|") || observationSectionsFromDom(form).map((item) => item.title).join("|");
    return clean(form.dataset.form);
  }

  function field(form, name) {
    return form && ((form.elements && form.elements[name]) || form.querySelector(`[name="${name}"]`));
  }

  function setValue(element, value) {
    if (!element || value == null || element.value === value) return;
    refreshing = true;
    try {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
      refreshing = false;
    }
  }

  async function fillObservation(form, force) {
    const C = global.MilosCore;
    const A = global.MilosAutomaticMode;
    if (!C || !A || typeof A.buildObservation !== "function") throw new Error("Automatic Mode is not ready yet.");
    const id = rememberedProfileId("observation");
    const profile = id ? C.getProfile(id) : null;
    if (!profile) throw new Error("Milos could not identify the current learner. Go back once and reopen this observation.");

    const keys = selectedObservationKeys(form);
    let sections = [];
    if (keys.length && profile.courseRouteId) {
      try {
        const course = await C.loadCourse(profile.courseRouteId);
        sections = observationSectionsFromCourse(C, course, keys);
      } catch (_) {}
    }
    if (!sections.length) sections = observationSectionsFromDom(form);
    if (!sections.length) throw new Error("Select at least one observation section before using Automatic Mode.");

    const report = A.buildObservation(profile.name, sections);
    for (const name of OBS_FIELDS) {
      if (!force && editedFields.has(name)) continue;
      setValue(field(form, name), report[name]);
    }
    lastSignature = formSignature(form, "observation");
  }

  async function fillReview(form, force) {
    const C = global.MilosCore;
    const A = global.MilosAutomaticMode;
    if (!C || !A || typeof A.buildReview !== "function") throw new Error("Automatic Mode is not ready yet.");
    const id = rememberedProfileId("review");
    const profile = id ? C.getProfile(id) : null;
    if (!profile) throw new Error("Milos could not identify the current learner. Go back once and reopen this review.");
    const snapshot = C.latestSnapshot(profile);
    if (!snapshot) throw new Error("Scan the learner's Evia progress before using Automatic Mode for a review.");
    const course = await C.loadCourse(profile.courseRouteId || snapshot.courseRouteId);
    const metrics = C.metricsFor(profile, course);
    const previous = C.reviewsForProfile(profile.id)[0] || null;
    const report = A.buildReview(profile, snapshot, course, metrics, previous);
    for (const name of REVIEW_FIELDS) {
      if (!force && editedFields.has(name)) continue;
      const element = field(form, name);
      if (element) setValue(element, report[name]);
    }
    lastSignature = formSignature(form, "review");
  }

  async function fillCurrent(force) {
    if (!activeMode) return;
    const form = document.querySelector(activeMode === "observation" ? 'form[data-form="observation-record"]' : 'form[data-form^="review-"]');
    if (!form) return;
    if (activeMode === "observation") await fillObservation(form, force);
    else await fillReview(form, force);
  }

  function scheduleRefresh(force) {
    if (!activeMode) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      refreshTimer = null;
      try {
        const form = document.querySelector(activeMode === "observation" ? 'form[data-form="observation-record"]' : 'form[data-form^="review-"]');
        if (!form) return;
        const changed = formSignature(form, activeMode) !== lastSignature;
        if (force || changed) await fillCurrent(!!force);
      } catch (_) {}
    }, 120);
  }

  async function activate(mark) {
    const form = relevantForm(mark);
    const mode = modeForForm(form);
    if (!form || !mode) return;

    const profileId = rememberedProfileId(mode);
    if (!profileId) {
      showToast("Milos could not identify the current learner. Go back once and reopen this review or observation.", true);
      return;
    }

    activeMode = mode;
    editedFields.clear();
    lastSignature = "";
    mark.classList.add("milos-auto-trigger-v211-pulse");
    setTimeout(() => mark.classList.remove("milos-auto-trigger-v211-pulse"), 900);

    try {
      await fillCurrent(true);
      showToast("Milos Automatic Mode filled the report. Every field remains editable.", false);
    } catch (error) {
      activeMode = "";
      showToast(error && error.message ? error.message : "Automatic Mode could not fill this report.", true);
    }
  }

  function countTap(mark) {
    if (!mark || !relevantForm(mark)) return;
    const now = Date.now();
    if (!lastTapAt || now - lastTapAt > TAP_RESET_MS) tapCount = 0;
    tapCount += 1;
    lastTapAt = now;
    if (tapCount < TAP_TARGET) return;
    tapCount = 0;
    lastTapAt = 0;
    activate(mark);
  }

  document.addEventListener("pointerup", (event) => {
    const mark = targetMark(event);
    if (!mark) return;
    event.preventDefault();
    lastPointerAt = Date.now();
    countTap(mark);
  }, true);

  document.addEventListener("touchend", (event) => {
    if (global.PointerEvent || Date.now() - lastPointerAt < 750) return;
    const mark = targetMark(event);
    if (!mark) return;
    event.preventDefault();
    lastPointerAt = Date.now();
    countTap(mark);
  }, { capture: true, passive: false });

  document.addEventListener("click", (event) => {
    rememberProfile(event);
    const mark = targetMark(event);
    if (!mark || !event.isTrusted) return;

    // Pointer/touch taps are counted above. Suppress the follow-up click so the
    // older v2.9 click counter cannot double-count or interfere with activation.
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!global.PointerEvent && Date.now() - lastPointerAt > 750) countTap(mark);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const mark = targetMark(event);
    if (!mark) return;
    event.preventDefault();
    countTap(mark);
  }, true);

  document.addEventListener("input", (event) => {
    if (!activeMode || refreshing || !event.isTrusted) return;
    const form = event.target && event.target.closest ? event.target.closest(FORM_SELECTOR) : null;
    if (!form || modeForForm(form) !== activeMode) return;
    const name = clean(event.target && event.target.name);
    const allowed = activeMode === "observation" ? OBS_FIELDS : REVIEW_FIELDS;
    if (allowed.includes(name)) editedFields.add(name);
  }, true);

  function decorateMark(mark) {
    if (!mark || !relevantForm(mark) || mark.dataset.milosAutoTrigger === "2.11") return;
    mark.dataset.milosAutoTrigger = "2.11";
    mark.setAttribute("role", "button");
    mark.setAttribute("tabindex", "0");
    mark.setAttribute("aria-label", "Milos Automatic Mode. Tap seven times to activate.");
  }

  function decorateTree(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(MARK_SELECTOR)) decorateMark(root);
    if (root.querySelectorAll) root.querySelectorAll(MARK_SELECTOR).forEach(decorateMark);
  }

  function startObserver() {
    const root = document.getElementById("viewPanel") || document.getElementById("milosApp");
    if (!root || root.__milosAutoTriggerV211) return;
    root.__milosAutoTriggerV211 = true;
    decorateTree(root);
    new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => decorateTree(node)));
      if (activeMode) scheduleRefresh(false);
    }).observe(root, { childList: true, subtree: true });
  }

  const style = document.createElement("style");
  style.id = "milos-auto-trigger-v211-style";
  style.textContent = `${MARK_SELECTOR}{cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}${MARK_SELECTOR}.milos-auto-trigger-v211-pulse{animation:milosAutoTriggerV211Pulse .85s ease}@keyframes milosAutoTriggerV211Pulse{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(47,143,239,.4)}45%{transform:scale(1.12);box-shadow:0 0 0 14px rgba(47,143,239,0)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(47,143,239,0)}}`;
  document.head.appendChild(style);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  else startObserver();

  global.MilosAutoTrigger = Object.freeze({ version: "2.11", tapTarget: TAP_TARGET });
})(window);
