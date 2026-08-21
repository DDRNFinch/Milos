(function (global) {
  "use strict";

  const C = global.MilosCore;
  if (!C || !global.document) return;

  const TAP_TARGET = 7;
  const TAP_RESET_MS = 5000;
  const PROFILE_SESSION_KEY = "milos-auto-observation-profile-v1";
  const NARRATIVE_FIELDS = Object.freeze([
    "activityObserved",
    "safetyNotes",
    "qualityNotes",
    "questionsAndAnswers",
    "feedback",
    "actions",
  ]);

  let currentProfileId = "";
  let tapCount = 0;
  let lastTapAt = 0;
  let autoModeActive = false;
  let lastSectionSignature = "";
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

  function sentenceList(values) {
    const items = unique(values);
    if (!items.length) return "the selected observation work";
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  }

  function quotedList(values) {
    return sentenceList(unique(values).map((value) => `“${value}”`));
  }

  function activityPhrase(value) {
    const title = clean(value);
    if (!title) return "the selected work";
    const patterns = [
      [/^show\s+/i, ""],
      [/^check\s+/i, "checking "],
      [/^build\s+/i, "building "],
      [/^construct\s+/i, "constructing "],
      [/^set\s+out\s+/i, "setting out "],
      [/^install\s+/i, "installing "],
      [/^fit\s+/i, "fitting "],
      [/^prepare\s+/i, "preparing "],
      [/^mix\s+/i, "mixing "],
      [/^demonstrate\s+/i, "demonstrating "],
      [/^explain\s+/i, "explaining "],
    ];
    for (const pair of patterns) {
      if (pair[0].test(title)) return title.replace(pair[0], pair[1]).replace(/^./, (letter) => letter.toLowerCase());
    }
    return title.replace(/^./, (letter) => letter.toLowerCase());
  }

  function selectedSectionKeys(form) {
    return unique([...form.querySelectorAll('.milos-selected-section [data-action="observation-remove-section"][data-id]')]
      .map((button) => button.dataset.id));
  }

  function domSections(form) {
    return [...form.querySelectorAll(".milos-selected-section")].map((card) => {
      const context = clean(card.querySelector("small") && card.querySelector("small").textContent);
      const parts = context.split("·").map(clean).filter(Boolean);
      const title = clean(card.querySelector("strong") && card.querySelector("strong").textContent);
      const countText = clean(card.querySelector("em") && card.querySelector("em").textContent);
      const keyButton = card.querySelector('[data-action="observation-remove-section"][data-id]');
      return {
        key: keyButton ? clean(keyButton.dataset.id) : title,
        categoryTitle: parts[0] || "",
        jobTitle: parts.slice(1).join(" · ") || "",
        opportunityTitle: title,
        instruction: "",
        question: "",
        codes: [],
        descriptions: [],
        countText,
      };
    }).filter((section) => section.opportunityTitle);
  }

  function courseSections(course, keys) {
    const selected = new Set(keys || []);
    const output = [];
    const categories = Array.isArray(course && course.siteData) ? course.siteData : [];
    const descriptions = course && course.descriptions && typeof course.descriptions === "object" ? course.descriptions : {};
    categories.forEach((category) => {
      const jobs = Array.isArray(category && category.jobs) ? category.jobs : [];
      jobs.forEach((job) => {
        const opportunities = Array.isArray(job && job.opps) ? job.opps : [];
        opportunities.forEach((opportunity) => {
          const key = [category.id, job.id, opportunity.id].map(clean).filter(Boolean).join("::");
          if (!selected.has(key)) return;
          const codes = C.cleanCodes(opportunity && opportunity.codes || []);
          output.push({
            key,
            categoryTitle: clean(category.title),
            jobTitle: clean(job.title),
            opportunityTitle: clean(opportunity.title),
            instruction: clean(opportunity.instruction),
            question: clean(opportunity.question),
            codes,
            descriptions: codes.map((code) => clean(descriptions[code])).filter(Boolean),
          });
        });
      });
    });
    return output;
  }

  async function selectedSections(form, profile) {
    const keys = selectedSectionKeys(form);
    if (profile && profile.courseRouteId && keys.length) {
      try {
        const course = await C.loadCourse(profile.courseRouteId);
        const matched = courseSections(course, keys);
        if (matched.length) return { sections: matched, course };
      } catch (_) {}
    }
    return { sections: domSections(form), course: null };
  }

  function descriptionsMatching(sections, pattern, limit) {
    const all = unique((sections || []).flatMap((section) => section.descriptions || []));
    return all.filter((text) => pattern.test(text)).slice(0, limit || 3);
  }

  function compactFocus(texts, fallback) {
    const items = unique(texts).slice(0, 3).map((text) => {
      const value = text.replace(/[.;]+$/g, "");
      return value.length > 155 ? `${value.slice(0, 152).trim()}…` : value;
    });
    return items.length ? sentenceList(items) : fallback;
  }

  function buildReports(name, sections, course) {
    const learner = firstName(name);
    const titles = unique(sections.map((section) => section.opportunityTitle));
    const activities = unique(titles.map(activityPhrase));
    const jobs = unique(sections.map((section) => [section.categoryTitle, section.jobTitle].filter(Boolean).join(" — ")));
    const questions = unique(sections.map((section) => section.question).filter(Boolean));
    const instructions = unique(sections.map((section) => section.instruction).filter(Boolean));
    const codeCount = unique(sections.flatMap((section) => section.codes || [])).length;
    const coverageLabel = clean(course && course.coverageLabel) || "course";
    const sectionText = sentenceList(activities);
    const exactSections = quotedList(titles);
    const jobText = sentenceList(jobs);

    const safetyFocus = compactFocus(
      descriptionsMatching(sections, /safe|safety|hazard|risk|ppe|rpe|control|protect|manual handling|working area|housekeeping/i, 3),
      "the controls, PPE/RPE where required, safe use of tools and materials, and keeping the work area controlled and tidy"
    );
    const qualityFocus = compactFocus(
      descriptionsMatching(sections, /quality|tolerance|specification|check|accuracy|level|plumb|line|gauge|measure|finish|set out|setting out|workmanship/i, 3),
      "accuracy, workmanship, appropriate checks, and completing the work to the required job specification"
    );
    const knowledgeFocus = compactFocus(
      descriptionsMatching(sections, /know|understand|method|sequence|information|drawing|specification|component|material|reason|procedure/i, 3),
      instructions.length ? sentenceList(instructions.slice(0, 2)) : "the method, sequence, checks and reasons behind the work being carried out"
    );

    const mappedText = codeCount
      ? ` The selected sections map to ${codeCount} ${coverageLabel} ${codeCount === 1 ? "item" : "items"}, and this narrative is written around those selected areas only.`
      : " The narrative is written around the selected observation sections only.";

    const questionText = questions.length
      ? ` Knowledge questioning was linked to the section prompts, including ${quotedList(questions.slice(0, 3))}.`
      : ` Knowledge questioning was linked directly to ${exactSections}.`;

    return {
      activityObserved: `${learner} was observed carrying out work covering ${sectionText}. The observation was undertaken within ${jobText} and followed the selected sections ${exactSections}. The record focused on what ${learner} personally demonstrated during these activities, including the practical sequence, use of resources, checks and completion of the work.${mappedText}`,
      safetyNotes: `${learner}'s safe working was assessed throughout ${sectionText}. The observation considered ${safetyFocus}. Safe practice was considered in the context of the actual selected work rather than as a separate generic check, with the assessment remaining linked to ${exactSections}.`,
      qualityNotes: `${learner}'s performance and quality were assessed through ${sectionText}. Particular attention was given to ${qualityFocus}. The quality judgement was based on the work demonstrated within ${exactSections}, including the checks that formed part of the selected observation activities and the standard of the work presented for assessment.`,
      questionsAndAnswers: `${questionText} ${learner}'s responses were considered against ${knowledgeFocus}. The discussion was used to confirm understanding of the work observed and to connect the practical activity to the mapped ${coverageLabel} requirements for the selected sections.`,
      feedback: `${learner} demonstrated the selected observation areas covering ${sectionText}. Feedback was based directly on ${exactSections}, with emphasis on maintaining safe working, completing the required practical activity, carrying out appropriate quality checks and explaining the reasons behind the work. The observation evidence and feedback remain tied to the sections selected for this visit.${mappedText}`,
      actions: `${learner} should continue to consolidate the work covered in ${exactSections} and apply the same approach on future workplace tasks. Any mapped ${coverageLabel} requirements that were not fully demonstrated during this visit should be completed through further workplace evidence or a future observation. Actions can be edited to record any specific target agreed with ${learner}.`,
    };
  }

  function field(form, name) {
    return form.elements && form.elements[name] ? form.elements[name] : form.querySelector(`[name="${name}"]`);
  }

  function setFieldValue(element, value) {
    if (!element) return;
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
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

  function markActivated(form) {
    const mark = form.querySelector(".milos-guidance > span");
    if (!mark) return;
    mark.classList.remove("milos-auto-mode-pulse");
    void mark.offsetWidth;
    mark.classList.add("milos-auto-mode-pulse");
    setTimeout(() => mark.classList.remove("milos-auto-mode-pulse"), 900);
  }

  function sectionSignature(form) {
    const keys = selectedSectionKeys(form);
    if (keys.length) return keys.join("|");
    return unique(domSections(form).map((section) => section.key)).join("|");
  }

  async function fillAutomaticReport(form, overwriteAll) {
    if (!form || !form.matches('form[data-form="observation-record"]')) return false;
    const profile = currentProfileId ? C.getProfile(currentProfileId) : null;
    if (!profile) {
      showToast("Milos Automatic Mode could not identify the current learner.", true);
      return false;
    }
    const resolved = await selectedSections(form, profile);
    if (!resolved.sections.length) {
      showToast("Select at least one observation section first.", true);
      return false;
    }
    const reports = buildReports(profile.name, resolved.sections, resolved.course);
    NARRATIVE_FIELDS.forEach((name) => {
      const element = field(form, name);
      if (!element) return;
      if (!overwriteAll && userEditedFields.has(name)) return;
      setFieldValue(element, reports[name]);
    });
    lastSectionSignature = sectionSignature(form);
    markActivated(form);
    return true;
  }

  async function activateAutomaticMode(form) {
    autoModeActive = true;
    userEditedFields.clear();
    const filled = await fillAutomaticReport(form, true);
    if (!filled) {
      autoModeActive = false;
      return;
    }
    showToast("Milos Automatic Mode filled the observation. Every field is still editable.", false);
  }

  function rememberProfile(id) {
    currentProfileId = clean(id);
    autoModeActive = false;
    tapCount = 0;
    lastTapAt = 0;
    lastSectionSignature = "";
    userEditedFields.clear();
    try {
      if (currentProfileId) global.sessionStorage.setItem(PROFILE_SESSION_KEY, currentProfileId);
      else global.sessionStorage.removeItem(PROFILE_SESSION_KEY);
    } catch (_) {}
  }

  function scheduleActiveRefresh() {
    if (!autoModeActive) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      refreshTimer = null;
      const form = document.querySelector('form[data-form="observation-record"]');
      if (!form) return;
      const signature = sectionSignature(form);
      if (!signature || signature === lastSectionSignature) return;
      const filled = await fillAutomaticReport(form, false);
      if (filled) showToast("Automatic Mode updated the untouched fields for the new observation sections.", false);
    }, 80);
  }

  document.addEventListener("click", (event) => {
    const start = event.target && event.target.closest ? event.target.closest('[data-action="start-observation"][data-id]') : null;
    if (start) rememberProfile(start.dataset.id);

    const mark = event.target && event.target.closest ? event.target.closest('form[data-form="observation-record"] .milos-guidance > span') : null;
    if (!mark) return;
    const form = mark.closest('form[data-form="observation-record"]');
    if (!form) return;
    event.preventDefault();
    const now = Date.now();
    if (!lastTapAt || now - lastTapAt > TAP_RESET_MS) tapCount = 0;
    tapCount += 1;
    lastTapAt = now;
    if (tapCount < TAP_TARGET) return;
    tapCount = 0;
    lastTapAt = 0;
    activateAutomaticMode(form).catch(() => showToast("Milos Automatic Mode could not prepare this observation.", true));
  }, true);

  document.addEventListener("input", (event) => {
    if (!autoModeActive || !event.isTrusted) return;
    const form = event.target && event.target.closest ? event.target.closest('form[data-form="observation-record"]') : null;
    if (!form) return;
    const name = clean(event.target.name);
    if (NARRATIVE_FIELDS.includes(name)) userEditedFields.add(name);
  }, true);

  const observer = new MutationObserver(() => scheduleActiveRefresh());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const style = document.createElement("style");
  style.id = "milos-observation-auto-v25-style";
  style.textContent = `
form[data-form="observation-record"] .milos-guidance>span{touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
form[data-form="observation-record"] .milos-guidance>span.milos-auto-mode-pulse{animation:milosAutoModePulse .8s ease}
@keyframes milosAutoModePulse{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(47,143,239,.35)}45%{transform:scale(1.08);box-shadow:0 0 0 14px rgba(47,143,239,0)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(47,143,239,0)}}`;
  document.head.appendChild(style);

  global.MilosObservationAuto = Object.freeze({
    version: "2.5",
    tapTarget: TAP_TARGET,
    narrativeFields: NARRATIVE_FIELDS.slice(),
    buildReports,
  });
})(window);
