(function (global) {
  "use strict";

  const C = global.MilosCore;
  if (!C || !global.document) return;

  const TAP_TARGET = 7;
  const TAP_RESET_MS = 5000;
  const REVIEW_PROFILE_KEY = "milos-auto-review-profile-v1";
  const OBS_PROFILE_KEY = "milos-auto-observation-profile-v1";
  const REVIEW_FIELDS = Object.freeze([
    "previousActions","trainingEvidence","overallProgress","learningProgress","qualifications",
    "trainingPlanChanges","supportNeeds","wellbeing","apprenticeComments","providerComments"
  ]);
  const OBS_FIELDS = Object.freeze([
    "activityObserved","safetyNotes","qualityNotes","questionsAndAnswers","feedback","actions"
  ]);

  let tapCount = 0;
  let lastTapAt = 0;
  let reviewProfileId = "";
  let observationProfileId = "";
  let activeMode = "";
  let writing = false;
  let refreshTimer = null;
  let lastObservationSignature = "";
  let lastReviewSignature = "";
  const editedReview = new Set();
  const editedObservation = new Set();

  const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const firstName = (value) => clean(value).split(/\s+/)[0] || "the learner";
  const unique = (items) => [...new Set((items || []).map(clean).filter(Boolean))];
  const lowerFirst = (value) => { const text = clean(value); return text ? text[0].toLowerCase() + text.slice(1) : ""; };

  function list(items) {
    const values = unique(items);
    if (!values.length) return "";
    if (values.length === 1) return values[0];
    if (values.length === 2) return `${values[0]} and ${values[1]}`;
    return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
  }

  function stripCode(value) {
    return clean(value)
      .replace(/^(?:AC\s*)?(?:[KSB]\s*)?\d+(?:\.\d+){0,3}[A-Z]?\s*(?:[-–—:·]\s*)?/i, "")
      .replace(/[.;]+$/g, "")
      .trim();
  }

  const TOPICS = [
    [/ppe|rpe|personal protective|safe working|health and safety|hazard|risk|safe system/i, "safe working and site controls"],
    [/environment|sustainab|waste|recycl|contamin/i, "environmental responsibilities and waste control"],
    [/drawing|specification|technical information|contract information/i, "drawings, specifications and job information"],
    [/cavity|wall tie|dpc|lintel|weep|insulation|fire stop/i, "cavity wall construction and components"],
    [/setting out|set out|profile|gauge rod|square/i, "setting out and dimensional checks"],
    [/solid wall|bond|brick on edge|soldier course/i, "brickwork construction and bonding"],
    [/mortar|mixing|mix ratio|gauging/i, "mortar preparation and consistency"],
    [/joint finish|weather struck|recessed|flush joint/i, "joint finishing and presentation"],
    [/tool|equipment|power tool|hand tool/i, "tool selection and safe use"],
    [/estimate|quantity|resources|materials/i, "materials, resources and quantities"],
    [/quality|tolerance|accuracy|level|plumb|line|gauge|workmanship|defect/i, "quality, accuracy and checking work"],
    [/repair|maintenance|protect materials|finished work/i, "protecting and repairing finished work"],
    [/communicat|teamwork|team working/i, "communication and teamwork"],
    [/equality|diversity|inclusion|inclusive/i, "inclusive working practices"],
    [/wellbeing|mental health|physical health/i, "health and wellbeing"],
    [/regulation|standard|guidance|compliance/i, "standards and compliance"],
    [/method|sequence|procedure|planning/i, "planning the method and sequence of work"]
  ];

  function topicFor(value) {
    const text = stripCode(value);
    if (!text) return "";
    const match = TOPICS.find(([rx]) => rx.test(text));
    if (match) return match[1];
    const short = text.split(/[.;]/)[0].replace(/^(?:knowledge of|understanding of|principles of|how to|be able to)\s+/i, "").trim();
    const words = short.split(/\s+/).slice(0, 8).join(" ");
    return lowerFirst(words);
  }

  function topicListFromCodes(codes, course, limit) {
    const descriptions = course && course.descriptions && typeof course.descriptions === "object" ? course.descriptions : {};
    return unique(C.cleanCodes(codes || []).map((code) => topicFor(descriptions[code])).filter(Boolean)).slice(0, limit || 4);
  }

  function targetIntent(targets, learningLabel) {
    const intents = [];
    for (const target of Array.isArray(targets) ? targets : []) {
      const text = clean(target && target.title).toLowerCase();
      if (!text) continue;
      if (/evidence/.test(text) && /course|area|unit|different|spread/.test(text)) intents.push("build a broader spread of evidence across the course");
      else if (/evidence/.test(text)) intents.push("strengthen the portfolio with useful workplace evidence");
      else if (/glh|otj|off.?the.?job|guided learning/.test(text) && /record|log|entry/.test(text)) intents.push(`keep ${learningLabel} records up to date as learning takes place`);
      else if (/glh|otj|off.?the.?job|guided learning|hour/.test(text)) intents.push(`bring recorded ${learningLabel} closer to the planned position`);
      else if (/review|target|action/.test(text)) continue;
      else {
        const simple = text.replace(/^add\s+\d+\s+/i, "").replace(/^record\s+\d+\s+/i, "record ").replace(/^complete\s+\d+\s+/i, "complete ");
        if (simple.length > 4 && simple.length < 100) intents.push(simple);
      }
    }
    return unique(intents).slice(0, 3);
  }

  function programmeStage(percent) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (value < 20) return "early stage";
    if (value < 45) return "developing stage";
    if (value < 70) return "middle stage";
    if (value < 90) return "later stage";
    return "final stage";
  }

  function overallStatus(metrics) {
    const toc = Math.max(0, Math.min(100, Math.round(Number(metrics && metrics.toc) || 0)));
    const coverage = Math.max(0, Math.min(100, Math.round(Number(metrics && metrics.coverage) || 0)));
    const learning = Math.max(0, Math.min(100, Math.round(Number(metrics && metrics.learningPercent) || 0)));
    if (toc - coverage > 25 || toc - learning > 20) return "Off track";
    if (toc - coverage > 12 || toc - learning > 10) return "Attention required";
    return "On track";
  }

  function comparison(learner, toc, coverage) {
    const difference = coverage - toc;
    if (difference >= 10) return `${learner}'s course coverage is ahead of the point normally expected for this stage.`;
    if (difference >= -8) return `${learner}'s course coverage is broadly in line with the point normally expected at this stage.`;
    if (difference >= -15) return `${learner}'s course coverage is slightly behind the planned point and needs a little more focus during the next review period.`;
    return `${learner}'s course coverage is behind the planned point and needs a clear recovery focus.`;
  }

  function buildReview(profile, snapshot, course, metrics, previous) {
    const learner = firstName(profile && profile.name);
    const learningLabel = clean(course && course.learningLabel) || "learning";
    const toc = Math.max(0, Math.min(100, Math.round(Number(metrics && metrics.toc) || 0)));
    const coverage = Math.max(0, Math.min(100, Math.round(Number(metrics && metrics.coverage) || 0)));
    const learning = Math.max(0, Math.min(100, Math.round(Number(metrics && metrics.learningPercent) || 0)));
    const hours = Math.max(0, Number(metrics && metrics.learningHours || 0));
    const targetHours = Math.max(0, Number(metrics && metrics.learningTarget || 0));
    const completed = Math.max(0, Number(metrics && metrics.completed || 0));
    const total = Math.max(0, Number(metrics && metrics.total || 0));
    const evidenceCount = Math.max(0, Number(snapshot && snapshot.evidenceCount || 0));
    const changedCodes = unique([
      ...C.cleanCodes(snapshot && snapshot.changedCodes || []),
      ...C.cleanCodes(C.codesSinceLastReview(profile.id, snapshot && snapshot.completedCodes || []))
    ]);
    const newTopics = topicListFromCodes(changedCodes, course, 4);
    const currentPriorities = targetIntent(snapshot && snapshot.targets, learningLabel);
    const previousPriorities = targetIntent(previous && previous.targets, learningLabel);
    const status = overallStatus(metrics);
    const stage = programmeStage(toc);
    const coverageComparison = comparison(learner, toc, coverage);

    let previousActions;
    if (previousPriorities.length) {
      previousActions = `At the previous review, ${learner} agreed to focus on ${list(previousPriorities)}. The latest progress shows that the programme has continued to move forward. During this review I would confirm what has been completed, close those actions, and only carry forward anything that still needs attention.`;
    } else if (currentPriorities.length) {
      previousActions = `This is ${learner}'s first review in Milos, so there are no previous actions to close. Based on the current course position, the immediate priorities are to ${list(currentPriorities)}. These should be agreed with ${learner} and given realistic timescales for the next review period.`;
    } else {
      previousActions = `This is ${learner}'s first review in Milos, so there are no previous actions to close. I would use this meeting to agree the next practical, knowledge and learning priorities from the progress discussed today.`;
    }

    let trainingEvidence;
    if (newTopics.length) {
      trainingEvidence = `${learner}'s portfolio currently contains ${evidenceCount} evidence ${evidenceCount === 1 ? "record" : "records"}. Since the last progress point, the clearest development has been in ${list(newTopics)}. Overall, ${completed} of ${total} course areas are currently covered. I would check that the evidence shows what ${learner} personally did, the standard achieved and the understanding behind the work.`;
    } else {
      trainingEvidence = `${learner}'s portfolio currently contains ${evidenceCount} evidence ${evidenceCount === 1 ? "record" : "records"}, with ${completed} of ${total} course areas covered. No distinct new course area is showing in the latest Evia update, so I would use this review to check the quality of the evidence already gathered and agree what should be captured next.`;
    }

    const learningPosition = learning >= toc - 5
      ? `${learningLabel} is keeping pace with the programme.`
      : learning >= toc - 10
        ? `${learningLabel} is a little behind the planned position and should be watched over the next review period.`
        : `${learningLabel} is behind the planned position and needs to be addressed as part of the actions from this review.`;

    const learningProgress = hours <= 0
      ? `No ${learningLabel} is currently recorded against the ${targetHours.toFixed(0)}-hour programme requirement. At around ${toc}% through the course, this is behind the expected position. I would first check whether learning has taken place but has not yet been logged, then agree how the record will be brought up to date before the next review.`
      : `${learner} has ${hours.toFixed(1)} hours of ${learningLabel} recorded against the ${targetHours.toFixed(0)}-hour programme requirement. This places the recorded learning at ${learning}% compared with around ${toc}% time on programme. ${learningPosition} Any learning already completed but not yet logged should be added so the next review reflects the full position.`;

    const planChange = status === "On track"
      ? `${learner}'s current position does not indicate a need for a major change to the training plan. I would continue through the ${stage} of the programme, review the current priorities and agree the next practical and knowledge areas to be developed.`
      : `${learner}'s training plan needs a more focused next period. I would prioritise the areas that are behind plan, make sure ${learningLabel} is being recorded properly and agree clear evidence opportunities so progress can be checked again at the next review.`;

    const providerFocus = currentPriorities.length
      ? list(currentPriorities)
      : (newTopics.length ? `building on ${list(newTopics.slice(0, 2))}` : "the next planned practical and knowledge areas");

    return {
      previousActions,
      trainingEvidence,
      overallProgress: `${learner} is around ${toc}% through the planned programme and current course coverage is ${coverage}%. ${coverageComparison} Recorded ${learningLabel} is at ${learning}%, which ${learning >= toc - 8 ? "is reasonably close to the planned point" : "is the main area needing attention"}. My overall judgement at this review is ${status.toLowerCase()}.`,
      learningProgress,
      qualifications: `English, maths and any separate mandatory qualification results are not included in the Evia progress QR. I would confirm the current position with ${learner} during the meeting and update this section with the actual result before the review is signed.`,
      trainingPlanChanges: planChange,
      supportNeeds: `No personal support information is transferred from Evia. I would check directly with ${learner} whether anything at work, college or outside the programme is affecting progress and record any support or reasonable adjustment agreed during the meeting.`,
      wellbeing: `I would complete the wellbeing and safeguarding check directly with ${learner} during this review. The learner's actual response, and any support or signposting needed, should be recorded here before the review is completed.`,
      apprenticeComments: `${learner} has been shown the current course position of ${coverage}% coverage and ${learning}% ${learningLabel} at around ${toc}% through the programme. I would add ${learner}'s own view of progress here during the meeting, including what is going well and anything the learner feels needs more support or opportunity at work.`,
      providerComments: `From the progress available, ${learner} is in the ${stage} of the programme. ${coverageComparison} The next review period should focus on ${providerFocus}, while keeping evidence and ${learningLabel} moving in line with the training plan.`,
      overallStatus: status
    };
  }

  function selectedObservationKeys(form) {
    return unique([...form.querySelectorAll('.milos-selected-section [data-action="observation-remove-section"][data-id]')].map((button) => button.dataset.id));
  }

  function observationSignature(form) {
    const keys = selectedObservationKeys(form);
    if (keys.length) return keys.join("|");
    return unique([...form.querySelectorAll(".milos-selected-section")].map((item) => clean(item.querySelector("strong") && item.querySelector("strong").textContent))).join("|");
  }

  function activityPhrase(value) {
    let text = clean(value);
    const replacements = [
      [/^show the wall being built$/i, "building the wall"],
      [/^show the cavity details$/i, "forming and maintaining the cavity details"],
      [/^check the wall$/i, "checking the wall as the work progressed"],
      [/^show\s+/i, ""], [/^check\s+/i, "checking "], [/^build\s+/i, "building "],
      [/^construct\s+/i, "constructing "], [/^set out\s+/i, "setting out "],
      [/^install\s+/i, "installing "], [/^fit\s+/i, "fitting "], [/^prepare\s+/i, "preparing "],
      [/^mix\s+/i, "mixing "]
    ];
    for (const [rx, replacement] of replacements) {
      if (rx.test(text)) { text = text.replace(rx, replacement); break; }
    }
    return lowerFirst(text);
  }

  function observationSectionsFromDom(form) {
    return [...form.querySelectorAll(".milos-selected-section")].map((card) => {
      const context = clean(card.querySelector("small") && card.querySelector("small").textContent);
      const parts = context.split("·").map(clean).filter(Boolean);
      return { title: clean(card.querySelector("strong") && card.querySelector("strong").textContent), job: parts.slice(1).join(" · "), question: "", requirements: [] };
    }).filter((item) => item.title);
  }

  function observationSectionsFromCourse(course, keys) {
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
            requirements: codes.map((code) => ({ code, text: stripCode(descriptions[code]) })).filter((item) => item.text)
          });
        }
      }
    }
    return output;
  }

  function requirementText(sections, codePattern) {
    const items = [];
    for (const section of sections) {
      for (const requirement of section.requirements || []) {
        const code = clean(requirement.code).toUpperCase();
        if (codePattern && !codePattern.test(code)) continue;
        items.push(requirement.text);
      }
    }
    return unique(items);
  }

  function qualityChecks(text) {
    const checks = [];
    if (/cavity/i.test(text)) checks.push("the cavity details remained correctly formed and clear");
    if (/wall|brick|block|masonry|line|level|gauge/i.test(text)) checks.push("line, level and gauge were checked as the work progressed");
    if (/opening|lintel/i.test(text)) checks.push("the opening position and dimensions were checked before continuing");
    if (/set.?out|profile|square/i.test(text)) checks.push("the setting out, dimensions and square were checked before building on");
    if (/mortar|mix/i.test(text)) checks.push("the mortar was suitable in consistency and use for the task");
    if (/joint|finish/i.test(text)) checks.push("the joint finish was kept consistent and appropriate to the work");
    if (/repair/i.test(text)) checks.push("the repair was checked against the surrounding work and required finish");
    return unique(checks).slice(0, 3);
  }

  function buildObservation(name, sections) {
    const learner = firstName(name);
    const activities = unique(sections.map((section) => activityPhrase(section.title)).filter(Boolean));
    const jobs = unique(sections.map((section) => clean(section.job)).filter(Boolean));
    const activityText = list(activities) || "carrying out the selected workplace task";
    const combined = sections.map((section) => `${section.title} ${section.job} ${(section.requirements || []).map((item) => item.text).join(" ")}`).join(" ");
    const knowledgeTopics = unique(requirementText(sections, /^K/).map(topicFor).filter(Boolean)).slice(0, 3);
    const practicalTopics = unique(requirementText(sections, /^[SB]/).map(topicFor).filter(Boolean)).slice(0, 3);
    const checks = qualityChecks(combined);
    const safetySpecific = /ppe|rpe|safe|safety|hazard|risk|control/i.test(combined);

    const activityDetail = practicalTopics.length
      ? `The work demonstrated ${list(practicalTopics)} in a normal workplace sequence.`
      : `${learner} worked through the task in a logical sequence and made checks before moving on to the next stage.`;
    const questionFocus = knowledgeTopics.length ? list(knowledgeTopics) : "the method used, the order of work and the checks required";
    const qualityDetail = checks.length
      ? `${learner} checked the work as it progressed; in particular, ${list(checks)}.`
      : `${learner} checked accuracy and workmanship at sensible points and made sure the work was suitable before continuing.`;

    return {
      activityObserved: `I observed ${learner} ${activityText}${jobs.length ? ` as part of ${lowerFirst(list(jobs))}` : ""}. ${activityDetail} I followed the activity as it happened and based my judgement on the way ${learner} carried out the job as a whole.`,
      safetyNotes: safetySpecific
        ? `${learner} worked safely throughout the activity, using the controls and PPE appropriate to the work and keeping the area organised as the task progressed. I saw ${learner} continue to manage the work safely when moving between the selected observation sections.`
        : `${learner} maintained a safe and controlled working area throughout the observation. Tools and materials were handled appropriately for the task, the work area remained organised, and ${learner} worked in a way that did not create unnecessary risk to other people nearby.`,
      qualityNotes: `${qualityDetail} The work was approached methodically and ${learner} took responsibility for the standard being produced rather than relying on checks only at the end of the task.`,
      questionsAndAnswers: `I questioned ${learner} about ${questionFocus}. ${learner} related the answers directly to the work being carried out and explained the reasons behind the method and checks used. The responses supported what I had already seen during the practical observation.`,
      feedback: `${learner} approached the observation in a calm and practical way and showed a sound understanding of the work being completed. A key strength was the way the task was checked as it progressed rather than waiting until the end. I discussed the standard achieved with ${learner} and linked the feedback directly to the work seen during the visit.`,
      actions: `The next step is for ${learner} to maintain the same standard on similar work and continue applying the same checking routine independently. At a future visit I would look to observe course areas that were not seen today rather than repeat work that has already been demonstrated.`
    };
  }

  function field(form, name) {
    return form && (form.elements && form.elements[name] || form.querySelector(`[name="${name}"]`));
  }

  function setValue(element, value) {
    if (!element || element.value === value) return;
    writing = true;
    try {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
      writing = false;
    }
  }

  function rememberedProfile(key, fallback) {
    if (fallback) return fallback;
    try { return clean(sessionStorage.getItem(key)); } catch (_) { return ""; }
  }

  async function reviewContext() {
    const id = rememberedProfile(REVIEW_PROFILE_KEY, reviewProfileId);
    const profile = id ? C.getProfile(id) : null;
    if (!profile) return null;
    const snapshot = C.latestSnapshot(profile);
    if (!snapshot) return null;
    let course;
    try { course = await C.loadCourse(profile.courseRouteId || snapshot.courseRouteId); } catch (_) { return null; }
    const metrics = C.metricsFor(profile, course);
    const previous = C.reviewsForProfile(profile.id)[0] || null;
    return { profile, snapshot, course, metrics, previous };
  }

  async function observationContext(form) {
    const id = rememberedProfile(OBS_PROFILE_KEY, observationProfileId);
    const profile = id ? C.getProfile(id) : null;
    if (!profile) return null;
    const keys = selectedObservationKeys(form);
    let sections = [];
    if (keys.length && profile.courseRouteId) {
      try {
        const course = await C.loadCourse(profile.courseRouteId);
        sections = observationSectionsFromCourse(course, keys);
      } catch (_) {}
    }
    if (!sections.length) sections = observationSectionsFromDom(form);
    return { profile, sections };
  }

  function reviewSignature(ctx) {
    return [ctx.profile.id, ctx.snapshot.importedAt || 0, ctx.metrics.coverage, ctx.metrics.learningHours, ctx.metrics.toc, (ctx.snapshot.targets || []).length].join("|");
  }

  async function fillReview(force) {
    const form = document.querySelector('form[data-form^="review-"]');
    if (!form || activeMode !== "review") return;
    const ctx = await reviewContext();
    if (!ctx) return;
    const report = buildReview(ctx.profile, ctx.snapshot, ctx.course, ctx.metrics, ctx.previous);
    for (const name of REVIEW_FIELDS) {
      const element = field(form, name);
      if (!element || (!force && editedReview.has(name))) continue;
      setValue(element, report[name]);
    }
    const status = field(form, "overallStatus");
    if (status && (force || !editedReview.has("overallStatus"))) setValue(status, report.overallStatus);
    lastReviewSignature = reviewSignature(ctx);
  }

  async function fillObservation(force) {
    const form = document.querySelector('form[data-form="observation-record"]');
    if (!form || activeMode !== "observation") return;
    const ctx = await observationContext(form);
    if (!ctx || !ctx.sections.length) return;
    const report = buildObservation(ctx.profile.name, ctx.sections);
    for (const name of OBS_FIELDS) {
      const element = field(form, name);
      if (!element || (!force && editedObservation.has(name))) continue;
      setValue(element, report[name]);
    }
    lastObservationSignature = observationSignature(form);
  }

  function scheduleRefresh(force) {
    if (!activeMode) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      refreshTimer = null;
      try {
        if (activeMode === "review") {
          const ctx = await reviewContext();
          const changed = ctx && reviewSignature(ctx) !== lastReviewSignature;
          await fillReview(!!force || !!changed);
        } else if (activeMode === "observation") {
          const form = document.querySelector('form[data-form="observation-record"]');
          const changed = form && observationSignature(form) !== lastObservationSignature;
          await fillObservation(!!force || !!changed);
        }
      } catch (_) {}
    }, 90);
  }

  function activate(mode, mark) {
    activeMode = mode;
    tapCount = 0;
    lastTapAt = 0;
    if (mode === "review") {
      editedReview.clear();
      lastReviewSignature = "";
    } else {
      editedObservation.clear();
      lastObservationSignature = "";
    }
    if (mark) {
      mark.classList.add("milos-auto-v29-pulse");
      setTimeout(() => mark.classList.remove("milos-auto-v29-pulse"), 900);
    }
    scheduleRefresh(true);
  }

  document.addEventListener("click", (event) => {
    const reviewStart = event.target && event.target.closest && event.target.closest('[data-action="start-review"][data-id]');
    if (reviewStart) {
      reviewProfileId = clean(reviewStart.dataset.id);
      activeMode = "";
      editedReview.clear();
      try { sessionStorage.setItem(REVIEW_PROFILE_KEY, reviewProfileId); } catch (_) {}
    }
    const observationStart = event.target && event.target.closest && event.target.closest('[data-action="start-observation"][data-id]');
    if (observationStart) {
      observationProfileId = clean(observationStart.dataset.id);
      activeMode = "";
      editedObservation.clear();
      try { sessionStorage.setItem(OBS_PROFILE_KEY, observationProfileId); } catch (_) {}
    }

    const mark = event.target && event.target.closest ? event.target.closest(".milos-guidance > span") : null;
    if (!mark) {
      if (activeMode) setTimeout(() => scheduleRefresh(false), 40);
      return;
    }
    const page = mark.closest(".milos-page");
    const mode = page && page.querySelector('form[data-form="observation-record"]')
      ? "observation"
      : page && page.querySelector('form[data-form^="review-"]')
        ? "review"
        : "";
    if (!mode) return;

    const now = Date.now();
    if (!lastTapAt || now - lastTapAt > TAP_RESET_MS) tapCount = 0;
    tapCount += 1;
    lastTapAt = now;
    if (tapCount < TAP_TARGET) return;
    activate(mode, mark);
  }, true);

  document.addEventListener("input", (event) => {
    if (!activeMode || writing || !event.isTrusted) return;
    const name = clean(event.target && event.target.name);
    if (activeMode === "review" && event.target.closest && event.target.closest('form[data-form^="review-"]')) {
      if (REVIEW_FIELDS.includes(name) || name === "overallStatus") editedReview.add(name);
    }
    if (activeMode === "observation" && event.target.closest && event.target.closest('form[data-form="observation-record"]')) {
      if (OBS_FIELDS.includes(name)) editedObservation.add(name);
    }
  }, true);

  function startObserver() {
    const root = document.getElementById("viewPanel") || document.getElementById("milosApp");
    if (!root || root.__milosAutoV29Observer) return;
    root.__milosAutoV29Observer = true;
    new MutationObserver(() => { if (activeMode) scheduleRefresh(false); }).observe(root, { childList: true, subtree: true });
  }

  const style = document.createElement("style");
  style.id = "milos-auto-v29-style";
  style.textContent = `.milos-guidance>span{touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}.milos-guidance>span.milos-auto-v29-pulse{animation:milosAutoV29Pulse .85s ease}@keyframes milosAutoV29Pulse{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(47,143,239,.35)}45%{transform:scale(1.08);box-shadow:0 0 0 14px rgba(47,143,239,0)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(47,143,239,0)}}`;
  document.head.appendChild(style);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  else startObserver();

  global.MilosAutomaticMode = Object.freeze({
    version: "2.9",
    tapTarget: TAP_TARGET,
    buildReview,
    buildObservation,
    overallStatus
  });
})(window);
