(function (global) {
  "use strict";

  const C = global.MilosCore;
  if (!C || !global.document) return;

  const VERSION = "2.7";
  const TAP_TARGET = 7;
  const TAP_RESET_MS = 5000;
  const OBS_FIELDS = Object.freeze([
    "activityObserved",
    "safetyNotes",
    "qualityNotes",
    "questionsAndAnswers",
    "feedback",
    "actions",
  ]);
  const REVIEW_FIELDS = Object.freeze([
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

  let mode = "";
  let profileId = "";
  let tapCount = 0;
  let lastTapAt = 0;
  let writing = false;
  let timer = null;
  let lastObservationSignature = "";
  let lastReviewSignature = "";
  const edited = new Set();

  function clean(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function firstName(value) {
    return clean(value).split(/\s+/)[0] || "the learner";
  }

  function unique(values) {
    return [...new Set((values || []).map(clean).filter(Boolean))];
  }

  function list(values) {
    const items = unique(values);
    if (!items.length) return "";
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  }

  function lowerFirst(value) {
    const text = clean(value);
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
  }

  function stripCode(value) {
    return clean(value)
      .replace(/^(?:AC\s*)?(?:[KSB]\s*)?\d+(?:\.\d+){0,3}[A-Z]?\s*(?:[-–—:·]\s*)?/i, "")
      .replace(/^\([^)]+\)\s*/, "")
      .replace(/[.;]+$/g, "")
      .trim();
  }

  function requirementPast(value) {
    let text = stripCode(value);
    const replacements = [
      [/^carry out\b/i, "carried out"],
      [/^maintain\b/i, "maintained"],
      [/^comply with\b/i, "worked in line with"],
      [/^select\b/i, "selected"],
      [/^use\b/i, "used"],
      [/^check\b/i, "checked"],
      [/^complete\b/i, "completed"],
      [/^interpret\b/i, "interpreted"],
      [/^demonstrate\b/i, "demonstrated"],
      [/^prepare\b/i, "prepared"],
      [/^set out\b/i, "set out"],
      [/^build\b/i, "built"],
      [/^construct\b/i, "constructed"],
      [/^install\b/i, "installed"],
      [/^fit\b/i, "fitted"],
      [/^apply\b/i, "applied"],
      [/^follow\b/i, "followed"],
      [/^identify\b/i, "identified"],
      [/^explain\b/i, "explained"],
      [/^produce\b/i, "produced"],
      [/^position\b/i, "positioned"],
      [/^measure\b/i, "measured"],
      [/^mix\b/i, "mixed"],
    ];
    for (const [pattern, replacement] of replacements) {
      if (pattern.test(text)) {
        text = text.replace(pattern, replacement);
        break;
      }
    }
    return lowerFirst(text);
  }

  function activityPhrase(value) {
    let text = clean(value);
    if (!text) return "";
    const replacements = [
      [/^show the wall being built$/i, "building the wall"],
      [/^show the cavity details$/i, "forming and maintaining the cavity details"],
      [/^check the wall$/i, "checking the completed wall"],
      [/^show\s+/i, ""],
      [/^check\s+/i, "checking "],
      [/^build\s+/i, "building "],
      [/^construct\s+/i, "constructing "],
      [/^set out\s+/i, "setting out "],
      [/^install\s+/i, "installing "],
      [/^fit\s+/i, "fitting "],
      [/^prepare\s+/i, "preparing "],
      [/^mix\s+/i, "mixing "],
      [/^demonstrate\s+/i, ""],
    ];
    for (const [pattern, replacement] of replacements) {
      if (pattern.test(text)) {
        text = text.replace(pattern, replacement);
        break;
      }
    }
    return lowerFirst(text);
  }

  function indirectQuestion(value) {
    const q = clean(value).replace(/[?]+$/g, "");
    return q ? lowerFirst(q) : "";
  }

  function field(form, name) {
    return form && form.elements && form.elements[name]
      ? form.elements[name]
      : form && form.querySelector
        ? form.querySelector(`[name="${name}"]`)
        : null;
  }

  function setValue(element, value) {
    if (!element || value == null) return;
    writing = true;
    try {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
      writing = false;
    }
  }

  function currentProfileId(kind) {
    if (profileId) return profileId;
    try {
      const key = kind === "observation" ? "milos-auto-observation-profile-v1" : "milos-auto-review-profile-v1";
      return clean(global.sessionStorage.getItem(key));
    } catch (_) {
      return "";
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
      const title = clean(card.querySelector("strong") && card.querySelector("strong").textContent);
      const button = card.querySelector('[data-action="observation-remove-section"][data-id]');
      return {
        key: button ? clean(button.dataset.id) : title,
        categoryTitle: parts[0] || "",
        jobTitle: parts.slice(1).join(" · ") || "",
        opportunityTitle: title,
        instruction: "",
        question: "",
        codes: [],
        descriptions: [],
      };
    }).filter((item) => item.opportunityTitle);
  }

  function observationSectionsFromCourse(course, keys) {
    const wanted = new Set(keys || []);
    const descriptions = course && course.descriptions && typeof course.descriptions === "object" ? course.descriptions : {};
    const output = [];
    (Array.isArray(course && course.siteData) ? course.siteData : []).forEach((category) => {
      (Array.isArray(category && category.jobs) ? category.jobs : []).forEach((job) => {
        (Array.isArray(job && job.opps) ? job.opps : []).forEach((opp) => {
          const key = [category.id, job.id, opp.id].map(clean).filter(Boolean).join("::");
          if (!wanted.has(key)) return;
          const codes = C.cleanCodes(opp && opp.codes || []);
          output.push({
            key,
            categoryTitle: clean(category.title),
            jobTitle: clean(job.title),
            opportunityTitle: clean(opp.title),
            instruction: clean(opp.instruction),
            question: clean(opp.question),
            codes,
            descriptions: codes.map((code) => stripCode(descriptions[code])).filter(Boolean),
          });
        });
      });
    });
    return output;
  }

  async function observationContext(form) {
    const id = currentProfileId("observation");
    const profile = id ? C.getProfile(id) : null;
    if (!profile) return null;
    const keys = selectedObservationKeys(form);
    let course = null;
    let sections = [];
    if (profile.courseRouteId && keys.length) {
      try {
        course = await C.loadCourse(profile.courseRouteId);
        sections = observationSectionsFromCourse(course, keys);
      } catch (_) {}
    }
    if (!sections.length) sections = observationSectionsFromDom(form);
    return { profile, course, sections };
  }

  function matchingDescriptions(sections, pattern, limit) {
    return unique((sections || []).flatMap((section) => section.descriptions || []))
      .filter((text) => pattern.test(text))
      .slice(0, limit || 4);
  }

  function humanClauses(values, limit) {
    return unique(values).slice(0, limit || 4).map(requirementPast).filter(Boolean);
  }

  function buildObservationReports(name, sections) {
    const learner = firstName(name);
    const activities = unique(sections.map((section) => activityPhrase(section.opportunityTitle)).filter(Boolean));
    const activityText = list(activities) || "the selected workplace activity";
    const jobTitles = unique(sections.map((section) => clean(section.jobTitle)).filter(Boolean));
    const jobText = list(jobTitles);
    const allDescriptions = unique(sections.flatMap((section) => section.descriptions || []));
    const practical = humanClauses(allDescriptions, 4);
    const safety = humanClauses(matchingDescriptions(sections, /safe|safety|hazard|risk|ppe|rpe|control|protect|manual handling|working area|housekeeping|welfare/i, 4), 4);
    const quality = humanClauses(matchingDescriptions(sections, /quality|tolerance|specification|check|accuracy|level|plumb|line|gauge|measure|finish|workmanship|setting out|set out/i, 4), 4);
    const knowledge = humanClauses(matchingDescriptions(sections, /know|understand|method|sequence|information|drawing|specification|component|material|reason|procedure|principle/i, 4), 4);
    const questions = unique(sections.map((section) => indirectQuestion(section.question)).filter(Boolean));
    const instructions = unique(sections.map((section) => stripCode(section.instruction)).filter(Boolean));

    const practicalSentence = practical.length
      ? `During the task, ${learner} ${list(practical)}.`
      : `${learner} worked through the task in a logical sequence and carried out the relevant checks as the work progressed.`;
    const safetySentence = safety.length
      ? `${learner} ${list(safety)}.`
      : `${learner} maintained a safe working area, used the appropriate PPE and handled tools and materials in a controlled manner throughout the observation.`;
    const qualitySentence = quality.length
      ? `${learner} ${list(quality)}.`
      : `${learner} checked the work as it progressed and maintained an appropriate standard of accuracy and workmanship for the task.`;
    const questionSentence = questions.length
      ? `I questioned ${learner} about ${list(questions.slice(0, 3))}. ${learner} was able to relate the answers back to the work being carried out and explain why the checks and methods were important.`
      : knowledge.length
        ? `I questioned ${learner} on the method, sequence and checks used during the task. ${learner} showed an understanding of ${list(knowledge)} and was able to relate this to the work observed.`
        : `I questioned ${learner} on the method used, the order of work and the checks required. The responses showed an understanding of the task and the reasons behind the approach taken.`;
    const feedbackFocus = quality.length
      ? `Particular strengths were the way ${learner} ${list(quality.slice(0, 2))}.`
      : `The work was approached methodically, with suitable checks made as the task progressed.`;
    const actionFocus = instructions.length
      ? `The next step is to keep applying the same approach when ${list(instructions.slice(0, 2).map(lowerFirst))}.`
      : `The next step is to maintain the same standard on future workplace tasks and continue building evidence across the wider course.`;

    return {
      activityObserved: `I observed ${learner} ${activityText}${jobText ? ` as part of ${lowerFirst(jobText)}` : ""}. ${practicalSentence} The observation followed the work as it developed rather than treating each assessment point separately, so the judgement was based on the overall way ${learner} completed the task.`,
      safetyNotes: `${safetySentence} Safe working was evident throughout the activity and was considered as part of the normal job rather than as a separate exercise. Where the work changed, ${learner} continued to keep the area controlled and worked in a way that did not create unnecessary risk to others.`,
      qualityNotes: `${qualitySentence} The finished work and the checks made during the activity were consistent with the requirements of the task. ${learner} took responsibility for the standard of the work and made checks at appropriate points before continuing.`,
      questionsAndAnswers: questionSentence,
      feedback: `${learner} gave a positive account of the practical skills covered during this observation. ${feedbackFocus} ${learner} also demonstrated an understanding of why the work was carried out in that way, which supported the practical evidence seen on site.`,
      actions: `${actionFocus} Any areas not seen in enough depth during this visit can be picked up naturally on a future job or observation rather than repeating work that has already been demonstrated.`,
    };
  }

  function stageLabel(toc) {
    const value = Math.max(0, Math.min(100, Math.round(Number(toc) || 0)));
    if (value < 20) return "early part";
    if (value < 45) return "developing part";
    if (value < 70) return "middle part";
    if (value < 90) return "later part";
    return "final part";
  }

  function statusFrom(metrics) {
    const toc = Math.max(0, Math.min(100, Math.round(Number(metrics.toc) || 0)));
    const coverage = Math.max(0, Math.min(100, Math.round(Number(metrics.coverage) || 0)));
    const learning = Math.max(0, Math.min(100, Math.round(Number(metrics.learningPercent) || 0)));
    if (toc - coverage > 25 || toc - learning > 20) return "Off track";
    if (toc - coverage > 12 || toc - learning > 10) return "Attention required";
    return "On track";
  }

  function descriptionTopics(codes, course, limit) {
    const descriptions = course && course.descriptions && typeof course.descriptions === "object" ? course.descriptions : {};
    return unique(C.cleanCodes(codes).map((code) => stripCode(descriptions[code])).filter(Boolean))
      .slice(0, limit || 5)
      .map((text) => lowerFirst(text.length > 145 ? `${text.slice(0, 142).trim()}…` : text));
  }

  function targetTitles(targets, limit) {
    return unique((Array.isArray(targets) ? targets : []).map((target) => clean(target && target.title)).filter(Boolean)).slice(0, limit || 4);
  }

  function buildReviewReports(profile, snapshot, course, metrics, previous) {
    const learner = firstName(profile && profile.name);
    const coverageLabel = clean(course && course.coverageLabel) || "course";
    const learningLabel = clean(course && course.learningLabel) || "learning";
    const toc = Math.max(0, Math.min(100, Math.round(Number(metrics.toc) || 0)));
    const coverage = Math.max(0, Math.min(100, Math.round(Number(metrics.coverage) || 0)));
    const learning = Math.max(0, Math.min(100, Math.round(Number(metrics.learningPercent) || 0)));
    const completed = Math.max(0, Number(metrics.completed || 0));
    const total = Math.max(0, Number(metrics.total || 0));
    const evidenceCount = Math.max(0, Number(snapshot && snapshot.evidenceCount || 0));
    const hours = Math.max(0, Number(metrics.learningHours || 0));
    const targetHours = Math.max(0, Number(metrics.learningTarget || 0));
    const changed = unique([...C.cleanCodes(snapshot && snapshot.changedCodes || []), ...C.cleanCodes(C.codesSinceLastReview(profile.id, snapshot && snapshot.completedCodes || []))]);
    const newTopics = descriptionTopics(changed, course, 4);
    const currentTargets = targetTitles(snapshot && snapshot.targets, 4);
    const previousTargets = targetTitles(previous && previous.targets, 4);
    const stage = stageLabel(toc);
    const status = statusFrom(metrics);

    let previousActions;
    if (previousTargets.length) {
      previousActions = `At the previous review, ${learner} was working towards ${list(previousTargets.map(lowerFirst))}. The current progress shows that the programme has continued to move forward since then. These actions should be closed where completed and carried forward only where they are still relevant to the next review period.`;
    } else {
      previousActions = `This is the first review in Milos for ${learner}, so there are no previous review actions to close. ${currentTargets.length ? `The current priorities are ${list(currentTargets.map(lowerFirst))}.` : "The next actions should be agreed from the progress discussed during this meeting."}`;
    }

    const progressComparison = status === "On track"
      ? `${learner}'s progress is broadly where I would expect it to be at this point in the programme.`
      : status === "Attention required"
        ? `${learner} has made progress, although there is a small gap between the planned point in the programme and the progress currently recorded.`
        : `${learner} has made some progress, but the recorded position is behind the point expected at this stage and needs a clear recovery plan.`;
    const evidenceProgress = newTopics.length
      ? `Since the last review, the main areas of new progress have been around ${list(newTopics)}.`
      : `There are no newly identified course areas in the latest progress update, so the review should focus on consolidating current work and agreeing the next priorities.`;
    const learningPosition = learning >= toc - 5
      ? `${learningLabel} is keeping pace with the programme.`
      : learning >= toc - 10
        ? `${learningLabel} is slightly behind the planned position and should be monitored over the next review period.`
        : `${learningLabel} is behind the planned position and should be included in the recovery actions agreed at this review.`;

    return {
      previousActions,
      trainingEvidence: `${learner} now has ${evidenceCount} evidence ${evidenceCount === 1 ? "record" : "records"} recorded, with ${completed} of ${total} ${coverageLabel} areas covered overall. ${evidenceProgress} The evidence gathered so far should be checked for quality and sufficiency, but the pattern of progress gives a clear indication of the practical and knowledge areas ${learner} has been working on.`,
      overallProgress: `${learner} is around ${toc}% through the planned programme. Current ${coverageLabel} coverage is ${coverage}% and ${learningLabel} progress is ${learning}%. ${progressComparison} The overall position for this review is ${status.toLowerCase()}, with the next period focused on keeping practical evidence, planned learning and course progress moving together.`,
      learningProgress: `${learner} has recorded ${hours.toFixed(1)} hours of ${learningLabel} against a current programme target of ${targetHours.toFixed(0)} hours. This represents ${learning}% of the requirement compared with approximately ${toc}% time on programme. ${learningPosition} Any learning completed but not yet recorded should be added so that the next review reflects the full picture.`,
      qualifications: `English, maths and any separate mandatory qualification progress should be confirmed during the meeting with ${learner}, as these results are not included in the Evia course-progress scan. This section should be updated with the current position before the review is signed.`,
      trainingPlanChanges: status === "On track"
        ? `${learner}'s current progress does not suggest that a major change to the training plan is needed. The plan should continue to follow the ${stage} of the programme, with the current targets reviewed and the next practical and knowledge areas agreed for the period ahead.`
        : `${learner}'s training plan should be adjusted to address the gap between the planned stage and the progress currently recorded. The next period should prioritise the areas still outstanding, bring ${learningLabel} back towards the planned position and set realistic dates for the next pieces of evidence.`,
      supportNeeds: `There is no support or personal information included in the Evia progress scan. I would therefore check directly with ${learner} whether anything at work, college or outside the programme is affecting progress, and record any support or reasonable adjustment agreed during the meeting.`,
      wellbeing: `${learner}'s wellbeing and safeguarding check needs to be completed directly during the review because this information is deliberately not transferred in the progress QR. The learner's actual response and any support or signposting should be recorded here before the review is completed.`,
      apprenticeComments: `${learner}'s current position shows ${coverage}% ${coverageLabel} coverage and ${learning}% ${learningLabel} progress at around ${toc}% through the programme. ${currentTargets.length ? `The current priorities are ${list(currentTargets.map(lowerFirst))}.` : "New priorities should be agreed during this review."} ${learner}'s own view of progress should be added to confirm how this matches the experience at work and in training.`,
      providerComments: `From the progress available, ${learner} is in the ${stage} of the programme with ${coverage}% ${coverageLabel} coverage and ${learning}% ${learningLabel} progress. ${progressComparison} The next review period should concentrate on ${currentTargets.length ? list(currentTargets.map(lowerFirst)) : "the next planned practical and knowledge areas"}, while making sure evidence and recorded learning keep pace with the training plan.`,
      overallStatus: status,
    };
  }

  async function reviewContext() {
    const id = currentProfileId("review");
    const profile = id ? C.getProfile(id) : null;
    if (!profile) return null;
    const snapshot = C.latestSnapshot(profile);
    if (!snapshot) return null;
    let course;
    try { course = await C.loadCourse(profile.courseRouteId || snapshot.courseRouteId); }
    catch (_) { return null; }
    const metrics = C.metricsFor(profile, course);
    const previous = C.reviewsForProfile(profile.id)[0] || null;
    return { profile, snapshot, course, metrics, previous };
  }

  function observationSignature(form) {
    return selectedObservationKeys(form).join("|") || unique(observationSectionsFromDom(form).map((section) => section.key)).join("|");
  }

  function reviewSignature(ctx) {
    return [ctx.profile.id, ctx.snapshot.importedAt || 0, ctx.metrics.coverage, ctx.metrics.learningHours, ctx.metrics.toc, (ctx.snapshot.targets || []).length].join("|");
  }

  async function writeObservation(overwrite) {
    const form = document.querySelector('form[data-form="observation-record"]');
    if (!form) return false;
    const ctx = await observationContext(form);
    if (!ctx || !ctx.sections.length) return false;
    const reports = buildObservationReports(ctx.profile.name, ctx.sections);
    OBS_FIELDS.forEach((name) => {
      if (!overwrite && edited.has(`observation:${name}`)) return;
      const element = field(form, name);
      if (element) setValue(element, reports[name]);
    });
    lastObservationSignature = observationSignature(form);
    return true;
  }

  async function writeReview(overwrite) {
    const form = document.querySelector('form[data-form^="review-"]');
    if (!form) return false;
    const ctx = await reviewContext();
    if (!ctx) return false;
    const reports = buildReviewReports(ctx.profile, ctx.snapshot, ctx.course, ctx.metrics, ctx.previous);
    REVIEW_FIELDS.forEach((name) => {
      if (!overwrite && edited.has(`review:${name}`)) return;
      const element = field(form, name);
      if (element) setValue(element, reports[name]);
    });
    const status = field(form, "overallStatus");
    if (status && (overwrite || !edited.has("review:overallStatus"))) setValue(status, reports.overallStatus);
    lastReviewSignature = reviewSignature(ctx);
    return true;
  }

  function scheduleRewrite(overwrite) {
    if (!mode) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      try {
        if (mode === "observation") {
          const form = document.querySelector('form[data-form="observation-record"]');
          if (!form) return;
          const signature = observationSignature(form);
          const force = !!overwrite || (!!signature && signature !== lastObservationSignature);
          await writeObservation(force);
        } else if (mode === "review") {
          const ctx = await reviewContext();
          if (!ctx) return;
          const signature = reviewSignature(ctx);
          const force = !!overwrite || (!!signature && signature !== lastReviewSignature);
          await writeReview(force);
        }
      } catch (_) {}
    }, 45);
  }

  function activate(kind, mark) {
    mode = kind;
    edited.clear();
    lastObservationSignature = "";
    lastReviewSignature = "";
    scheduleRewrite(true);
    setTimeout(() => scheduleRewrite(true), 220);
    setTimeout(() => scheduleRewrite(false), 650);
    if (mark) {
      mark.classList.remove("milos-natural-pulse");
      void mark.offsetWidth;
      mark.classList.add("milos-natural-pulse");
      setTimeout(() => mark.classList.remove("milos-natural-pulse"), 900);
    }
  }

  function remember(kind, id) {
    mode = "";
    profileId = clean(id);
    edited.clear();
    tapCount = 0;
    lastTapAt = 0;
    lastObservationSignature = "";
    lastReviewSignature = "";
    try {
      global.sessionStorage.setItem(kind === "observation" ? "milos-auto-observation-profile-v1" : "milos-auto-review-profile-v1", profileId);
    } catch (_) {}
  }

  document.addEventListener("click", (event) => {
    const startObservation = event.target && event.target.closest ? event.target.closest('[data-action="start-observation"][data-id]') : null;
    if (startObservation) remember("observation", startObservation.dataset.id);
    const startReview = event.target && event.target.closest ? event.target.closest('[data-action="start-review"][data-id]') : null;
    if (startReview) remember("review", startReview.dataset.id);

    const mark = event.target && event.target.closest ? event.target.closest(".milos-guidance > span") : null;
    if (!mark) return;
    const observationForm = mark.closest('form[data-form="observation-record"]');
    const reviewForm = mark.closest('form[data-form^="review-"]');
    const reviewPage = mark.closest(".milos-page");
    const kind = observationForm
      ? "observation"
      : reviewForm || (reviewPage && (reviewPage.querySelector('[data-action="review-next"]') || reviewPage.querySelector('[data-action^="review-"]')))
        ? "review"
        : "";
    if (!kind) return;

    const now = Date.now();
    if (!lastTapAt || now - lastTapAt > TAP_RESET_MS) tapCount = 0;
    tapCount += 1;
    lastTapAt = now;
    if (tapCount < TAP_TARGET) return;
    tapCount = 0;
    lastTapAt = 0;
    activate(kind, mark);
  }, true);

  document.addEventListener("input", (event) => {
    if (!mode || writing) return;
    const target = event.target;
    if (!target) return;
    const name = clean(target.name);
    if (event.isTrusted) {
      if (mode === "observation" && target.closest('form[data-form="observation-record"]') && OBS_FIELDS.includes(name)) edited.add(`observation:${name}`);
      if (mode === "review" && target.closest('form[data-form^="review-"]') && (REVIEW_FIELDS.includes(name) || name === "overallStatus")) edited.add(`review:${name}`);
      return;
    }
    scheduleRewrite(false);
  }, true);

  new MutationObserver(() => scheduleRewrite(false)).observe(document.documentElement, { childList: true, subtree: true });

  const style = document.createElement("style");
  style.id = "milos-natural-narrative-v27-style";
  style.textContent = `.milos-guidance>span.milos-natural-pulse{animation:milosNaturalPulse .8s ease}@keyframes milosNaturalPulse{0%{transform:scale(1)}45%{transform:scale(1.08)}100%{transform:scale(1)}}`;
  document.head.appendChild(style);

  global.MilosNaturalNarrative = Object.freeze({
    version: VERSION,
    tapTarget: TAP_TARGET,
    buildObservationReports,
    buildReviewReports,
    statusFrom,
    stageLabel,
  });
})(window);
