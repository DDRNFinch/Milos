(function (global) {
  "use strict";
  const C = global.MilosCore;
  if (!C || !global.document) return;

  const FIELDS = Object.freeze(["activityObserved","safetyNotes","qualityNotes","questionsAndAnswers","feedback","actions"]);
  const PROFILE_KEY = "milos-auto-observation-profile-v1";
  const TAP_TARGET = 7;
  const TAP_RESET_MS = 5000;
  let profileId = "";
  let active = false;
  let tapCount = 0;
  let lastTapAt = 0;
  let writing = false;
  let timer = null;
  let lastSignature = "";
  const edited = new Set();

  const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const first = (v) => clean(v).split(/\s+/)[0] || "the learner";
  const unique = (xs) => [...new Set((xs || []).map(clean).filter(Boolean))];
  function list(xs) {
    const a = unique(xs);
    if (!a.length) return "";
    if (a.length === 1) return a[0];
    if (a.length === 2) return `${a[0]} and ${a[1]}`;
    return `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`;
  }
  function lowerFirst(v) { const t = clean(v); return t ? t[0].toLowerCase() + t.slice(1) : ""; }
  function strip(v) {
    return clean(v).replace(/^(?:AC\s*)?(?:[KSB]\s*)?\d+(?:\.\d+){0,3}[A-Z]?\s*(?:[-–—:·]\s*)?/i, "").replace(/[.;]+$/g, "").trim();
  }
  function past(v) {
    let t = strip(v);
    const rules = [
      [/^carry out\b/i,"carried out"],[/^maintain\b/i,"maintained"],[/^comply with\b/i,"worked in line with"],
      [/^identify\b/i,"identified"],[/^select\b/i,"selected"],[/^use\b/i,"used"],[/^check\b/i,"checked"],
      [/^complete\b/i,"completed"],[/^interpret\b/i,"interpreted"],[/^prepare\b/i,"prepared"],
      [/^set out\b/i,"set out"],[/^build\b/i,"built"],[/^construct\b/i,"constructed"],[/^install\b/i,"installed"],
      [/^fit\b/i,"fitted"],[/^apply\b/i,"applied"],[/^follow\b/i,"followed"],[/^produce\b/i,"produced"],
      [/^position\b/i,"positioned"],[/^measure\b/i,"measured"],[/^mix\b/i,"mixed"],[/^take\b/i,"took"],
      [/^put\b/i,"put"],[/^consider\b/i,"considered"],[/^contribute\b/i,"contributed"],[/^seek\b/i,"sought"],
      [/^work\b/i,"worked"]
    ];
    for (const [rx,repl] of rules) { if (rx.test(t)) { t = t.replace(rx,repl); break; } }
    return lowerFirst(t);
  }
  function activity(v) {
    let t = clean(v);
    const rules = [
      [/^show the wall being built$/i,"building the wall"],[/^show the cavity details$/i,"forming and maintaining the cavity details"],
      [/^check the wall$/i,"checking the completed wall"],[/^show\s+/i,""],[/^check\s+/i,"checking "],
      [/^build\s+/i,"building "],[/^construct\s+/i,"constructing "],[/^set out\s+/i,"setting out "],
      [/^install\s+/i,"installing "],[/^fit\s+/i,"fitting "],[/^prepare\s+/i,"preparing "],[/^mix\s+/i,"mixing "]
    ];
    for (const [rx,repl] of rules) { if (rx.test(t)) { t = t.replace(rx,repl); break; } }
    return lowerFirst(t);
  }

  function keys(form) {
    return unique([...form.querySelectorAll('.milos-selected-section [data-action="observation-remove-section"][data-id]')].map((b) => b.dataset.id));
  }
  function signature(form) {
    const k = keys(form);
    if (k.length) return k.join("|");
    return unique([...form.querySelectorAll(".milos-selected-section")].map((x) => clean(x.querySelector("strong")?.textContent))).join("|");
  }
  function domSections(form) {
    return [...form.querySelectorAll(".milos-selected-section")].map((card) => {
      const context = clean(card.querySelector("small")?.textContent);
      const parts = context.split("·").map(clean).filter(Boolean);
      return { title: clean(card.querySelector("strong")?.textContent), job: parts.slice(1).join(" · "), requirements: [], question: "" };
    }).filter((x) => x.title);
  }
  function courseSections(course, selected) {
    const wanted = new Set(selected);
    const desc = course && course.descriptions && typeof course.descriptions === "object" ? course.descriptions : {};
    const out = [];
    (Array.isArray(course?.siteData) ? course.siteData : []).forEach((cat) => {
      (Array.isArray(cat?.jobs) ? cat.jobs : []).forEach((job) => {
        (Array.isArray(job?.opps) ? job.opps : []).forEach((opp) => {
          const key = [cat.id,job.id,opp.id].map(clean).filter(Boolean).join("::");
          if (!wanted.has(key)) return;
          const codes = C.cleanCodes(opp.codes || []);
          out.push({
            title: clean(opp.title), job: clean(job.title), question: clean(opp.question),
            requirements: codes.map((code) => ({code, text: strip(desc[code])})).filter((x) => x.text)
          });
        });
      });
    });
    return out;
  }
  async function context(form) {
    let id = profileId;
    if (!id) { try { id = clean(sessionStorage.getItem(PROFILE_KEY)); } catch (_) {} }
    const profile = id ? C.getProfile(id) : null;
    if (!profile) return null;
    let course = null, sections = [];
    const selected = keys(form);
    if (profile.courseRouteId && selected.length) {
      try { course = await C.loadCourse(profile.courseRouteId); sections = courseSections(course, selected); } catch (_) {}
    }
    if (!sections.length) sections = domSections(form);
    return {profile, sections};
  }
  function req(sections, codeRx, textRx, limit=4) {
    const out = [];
    sections.forEach((s) => (s.requirements || []).forEach((r) => {
      const code = clean(r.code).toUpperCase(), text = clean(r.text);
      if (!text || (codeRx && !codeRx.test(code)) || (textRx && !textRx.test(text))) return;
      out.push(text);
    }));
    return unique(out).slice(0,limit);
  }
  function build(name, sections) {
    const learner = first(name);
    const activities = unique(sections.map((s) => activity(s.title)).filter(Boolean));
    const activityText = list(activities) || "the selected workplace task";
    const jobs = unique(sections.map((s) => clean(s.job)).filter(Boolean));
    const skills = req(sections,/^[SB]/,null,5).map(past).filter(Boolean);
    const safety = req(sections,/^[SB]/,/safe|safety|hazard|risk|ppe|rpe|control|protect|working area|wellbeing/i,4).map(past).filter(Boolean);
    const quality = req(sections,/^[SB]/,/quality|tolerance|specification|check|accuracy|level|plumb|line|gauge|measure|finish|workmanship|ownership/i,4).map(past).filter(Boolean);
    const knowledge = req(sections,/^K/,null,4).map((x) => lowerFirst(strip(x)));
    const practicalSentence = skills.length
      ? `During the task, ${learner} ${list(skills)}.`
      : `${learner} worked through the task in a logical sequence and carried out the relevant checks as the work progressed.`;
    const safetySentence = safety.length
      ? `${learner} ${list(safety)}.`
      : `${learner} maintained a safe working area, used the appropriate PPE and handled tools and materials in a controlled manner throughout the observation.`;
    const qualitySentence = quality.length
      ? `${learner} ${list(quality)}.`
      : `${learner} checked the work as it progressed and maintained an appropriate standard of accuracy and workmanship for the task.`;
    const knowledgeSentence = knowledge.length
      ? `I asked ${learner} to explain ${list(knowledge)}. ${learner}'s answers were clear and related directly to the work being carried out, showing an understanding of why the methods, components and checks were important.`
      : `I questioned ${learner} on the method used, the order of work and the checks required. The responses showed an understanding of the task and the reasons behind the approach taken.`;
    const strengths = quality.length
      ? `A particular strength was the way ${learner} ${list(quality.slice(0,2))}.`
      : `The work was approached methodically, with suitable checks made as the task progressed.`;
    return {
      activityObserved: `I observed ${learner} ${activityText}${jobs.length ? ` as part of ${lowerFirst(list(jobs))}` : ""}. ${practicalSentence} I followed the work as it developed, so the judgement was based on the way ${learner} completed the task as a whole rather than on a list of separate criteria.`,
      safetyNotes: `${safetySentence} Safe working formed part of the normal job throughout the observation. ${learner} kept the work controlled as the task progressed and worked in a way that did not create unnecessary risk to others.`,
      qualityNotes: `${qualitySentence} The checks made during the activity supported the standard of the finished work. ${learner} took responsibility for the quality of the task and checked the work at appropriate points before continuing.`,
      questionsAndAnswers: knowledgeSentence,
      feedback: `${learner} gave a positive account of the practical skills covered during this observation. ${strengths} ${learner} also showed an understanding of why the work was carried out in that way, which supported the practical evidence seen on site.`,
      actions: `The next step is for ${learner} to maintain the same standard on similar work involving ${activityText}. Any areas that were not seen in enough depth during this visit can be picked up naturally on a future job or observation without repeating work already demonstrated.`
    };
  }
  function field(form,name) { return form.elements?.[name] || form.querySelector(`[name="${name}"]`); }
  function setField(el,value) {
    if (!el) return;
    writing = true;
    try { el.value = value; el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true})); }
    finally { writing = false; }
  }
  async function fill(overwrite) {
    const form = document.querySelector('form[data-form="observation-record"]');
    if (!form) return;
    const ctx = await context(form);
    if (!ctx || !ctx.sections.length) return;
    const reports = build(ctx.profile.name,ctx.sections);
    FIELDS.forEach((name) => { if (!overwrite && edited.has(name)) return; setField(field(form,name),reports[name]); });
    lastSignature = signature(form);
  }
  function schedule(overwrite) {
    if (!active) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const form = document.querySelector('form[data-form="observation-record"]');
      if (!form) return;
      fill(!!overwrite || signature(form) !== lastSignature).catch(() => {});
    },55);
  }
  function activate() {
    active = true; edited.clear(); lastSignature = ""; schedule(true);
    setTimeout(() => schedule(true),230); setTimeout(() => schedule(false),700);
  }
  document.addEventListener("click",(event) => {
    const start = event.target?.closest?.('[data-action="start-observation"][data-id]');
    if (start) {
      profileId = clean(start.dataset.id); active = false; edited.clear(); tapCount = 0; lastTapAt = 0; lastSignature = "";
      try { sessionStorage.setItem(PROFILE_KEY,profileId); } catch (_) {}
    }
    const mark = event.target?.closest?.('form[data-form="observation-record"] .milos-guidance > span');
    if (!mark) return;
    const now = Date.now();
    if (!lastTapAt || now-lastTapAt > TAP_RESET_MS) tapCount = 0;
    tapCount += 1; lastTapAt = now;
    if (tapCount < TAP_TARGET) return;
    tapCount = 0; lastTapAt = 0; activate();
  },true);
  document.addEventListener("input",(event) => {
    if (!active || writing) return;
    const form = event.target?.closest?.('form[data-form="observation-record"]');
    if (!form) return;
    const name = clean(event.target.name);
    if (event.isTrusted && FIELDS.includes(name)) edited.add(name);
    else if (!event.isTrusted) schedule(false);
  },true);
  new MutationObserver(() => schedule(false)).observe(document.documentElement,{childList:true,subtree:true});
  global.MilosObservationProse = Object.freeze({version:"2.7",build});
})(window);
