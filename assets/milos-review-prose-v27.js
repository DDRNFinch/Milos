(function (global) {
  "use strict";
  const C = global.MilosCore;
  if (!C || !global.document) return;

  const FIELDS = Object.freeze(["previousActions","trainingEvidence","overallProgress","learningProgress","qualifications","trainingPlanChanges","supportNeeds","wellbeing","apprenticeComments","providerComments"]);
  const PROFILE_KEY = "milos-auto-review-profile-v1";
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
    return `${a.slice(0,-1).join(", ")}, and ${a[a.length-1]}`;
  }
  function lowerFirst(v) { const t=clean(v); return t ? t[0].toLowerCase()+t.slice(1) : ""; }
  function strip(v) { return clean(v).replace(/^(?:AC\s*)?(?:[KSB]\s*)?\d+(?:\.\d+){0,3}[A-Z]?\s*(?:[-–—:·]\s*)?/i,"").replace(/[.;]+$/g,"").trim(); }
  function stage(toc) {
    const n=Math.max(0,Math.min(100,Math.round(Number(toc)||0)));
    if(n<20)return"early part"; if(n<45)return"developing part"; if(n<70)return"middle part"; if(n<90)return"later part"; return"final part";
  }
  function status(metrics) {
    const toc=Math.max(0,Math.min(100,Math.round(Number(metrics.toc)||0)));
    const coverage=Math.max(0,Math.min(100,Math.round(Number(metrics.coverage)||0)));
    const learning=Math.max(0,Math.min(100,Math.round(Number(metrics.learningPercent)||0)));
    if(toc-coverage>25||toc-learning>20)return"Off track";
    if(toc-coverage>12||toc-learning>10)return"Attention required";
    return"On track";
  }
  function topicPhrase(v) {
    let t=strip(v);
    t=t.replace(/^Set out\b/i,"Setting out").replace(/^Construct\b/i,"Constructing").replace(/^Build\b/i,"Building")
      .replace(/^Prepare\b/i,"Preparing").replace(/^Use\b/i,"Using").replace(/^Check\b/i,"Checking")
      .replace(/^Maintain\b/i,"Maintaining").replace(/^Select\b/i,"Selecting").replace(/^Interpret\b/i,"Interpreting")
      .replace(/^Comply with\b/i,"Working in line with");
    return lowerFirst(t.length>135?`${t.slice(0,132).trim()}…`:t);
  }
  function topics(codes,course,limit=4) {
    const d=course?.descriptions&&typeof course.descriptions==="object"?course.descriptions:{};
    const seen=new Set(),out=[];
    for(const code of C.cleanCodes(codes||[])) {
      const t=topicPhrase(d[code]); if(!t)continue;
      const lead=t.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(Boolean).slice(0,2).join(" ");
      if(lead&&seen.has(lead))continue; if(lead)seen.add(lead); out.push(t); if(out.length>=limit)break;
    }
    return out;
  }
  function targetTitles(xs,limit=4) { return unique((Array.isArray(xs)?xs:[]).map((x)=>clean(x?.title)).filter(Boolean)).slice(0,limit); }
  async function context() {
    let id=profileId; if(!id){try{id=clean(sessionStorage.getItem(PROFILE_KEY))}catch(_){}}
    const profile=id?C.getProfile(id):null; if(!profile)return null;
    const snapshot=C.latestSnapshot(profile); if(!snapshot)return null;
    let course; try{course=await C.loadCourse(profile.courseRouteId||snapshot.courseRouteId)}catch(_){return null}
    const metrics=C.metricsFor(profile,course); const previous=C.reviewsForProfile(profile.id)[0]||null;
    return{profile,snapshot,course,metrics,previous};
  }
  function build(profile,snapshot,course,metrics,previous) {
    const learner=first(profile?.name);
    const learningLabel=clean(course?.learningLabel)||"learning";
    const coverageLabel=clean(course?.coverageLabel).toUpperCase();
    const coverageName=coverageLabel==="AC"?"assessment criteria":"course";
    const toc=Math.max(0,Math.min(100,Math.round(Number(metrics.toc)||0)));
    const coverage=Math.max(0,Math.min(100,Math.round(Number(metrics.coverage)||0)));
    const learning=Math.max(0,Math.min(100,Math.round(Number(metrics.learningPercent)||0)));
    const completed=Math.max(0,Number(metrics.completed||0)); const total=Math.max(0,Number(metrics.total||0));
    const hours=Math.max(0,Number(metrics.learningHours||0)); const targetHours=Math.max(0,Number(metrics.learningTarget||0));
    const evidenceCount=Math.max(0,Number(snapshot?.evidenceCount||0));
    const changed=unique([...C.cleanCodes(snapshot?.changedCodes||[]),...C.cleanCodes(C.codesSinceLastReview(profile.id,snapshot?.completedCodes||[]))]);
    const newTopics=topics(changed,course,4); const currentTargets=targetTitles(snapshot?.targets,4); const previousTargets=targetTitles(previous?.targets,4);
    const position=status(metrics); const point=stage(toc);

    let previousActions;
    if(previousTargets.length){
      previousActions=`At the last review, ${learner} agreed to focus on ${list(previousTargets.map(lowerFirst))}. Since then, the course record shows continued progress. I would use this review to confirm which of those actions are complete and only carry forward anything that is still relevant.`;
    }else{
      previousActions=`This is the first review held in Milos for ${learner}, so there are no previous review actions to close. ${currentTargets.length?`The current priorities are ${list(currentTargets.map(lowerFirst))}.`:"The next actions should be agreed from the progress discussed during this meeting."}`;
    }
    const progressText=position==="On track"
      ? `${learner} is broadly where I would expect at this stage of the programme.`
      : position==="Attention required"
        ? `${learner} has continued to make progress, although there is a small gap between the planned point in the programme and the progress currently recorded.`
        : `${learner} has made progress, but the current record is behind the point expected at this stage and needs a clear recovery plan.`;
    const learningText=learning>=toc-5
      ? `${learningLabel} is keeping pace with time on programme.`
      : learning>=toc-10
        ? `${learningLabel} is slightly behind the planned position and should be monitored over the next review period.`
        : `${learningLabel} is behind the planned position and should form part of the recovery actions agreed today.`;
    const evidenceText=newTopics.length
      ? `The clearest new progress since the last review is around ${list(newTopics)}.`
      : `No new course area stands out in the latest update, so the focus should be on consolidating current work and agreeing the next priorities.`;

    return{
      previousActions,
      trainingEvidence:`${learner} now has ${evidenceCount} evidence ${evidenceCount===1?"record":"records"} in the portfolio, with ${completed} of ${total} ${coverageName} areas covered overall. ${evidenceText} The pattern of evidence shows what ${learner} has been working on without needing to repeat the individual criteria in the review narrative.`,
      overallProgress:`${learner} is around ${toc}% through the planned programme. Course coverage is currently ${coverage}% and ${learningLabel} progress is ${learning}%. ${progressText} My overall judgement for this review is ${position.toLowerCase()}, with the next period focused on keeping practical evidence, planned learning and course progress moving together.`,
      learningProgress:`${learner} has recorded ${hours.toFixed(1)} hours of ${learningLabel} against a programme target of ${targetHours.toFixed(0)} hours. That is ${learning}% of the requirement compared with about ${toc}% time on programme. ${learningText} Any learning already completed but not yet recorded should be added before the next review.`,
      qualifications:`English, maths and any separate mandatory qualification progress are not included in the Evia course-progress scan. I would confirm the current position with ${learner} during the review and record the outcome here before the review is signed.`,
      trainingPlanChanges:position==="On track"
        ? `${learner}'s current position does not suggest that a major change to the training plan is needed. The plan should continue through the ${point} of the programme, with the current targets reviewed and the next practical and knowledge areas agreed for the period ahead.`
        : `${learner}'s training plan should be adjusted to close the gap between the planned stage and the progress currently recorded. The next period should prioritise the outstanding course areas, bring ${learningLabel} back towards the planned position and set realistic dates for the next evidence.`,
      supportNeeds:`The course-progress scan does not contain personal or support information. I would check directly with ${learner} whether anything at work, college or outside the programme is affecting progress and record any support or reasonable adjustment agreed during the meeting.`,
      wellbeing:`Wellbeing and safeguarding information is deliberately not transferred through the progress QR. I would complete this check directly with ${learner} during the review and record the learner's actual response, together with any support or signposting needed.`,
      apprenticeComments:`${learner}'s current course position is ${coverage}% coverage and ${learning}% ${learningLabel} progress at around ${toc}% through the programme. ${currentTargets.length?`The current priorities are ${list(currentTargets.map(lowerFirst))}.`:"New priorities should be agreed during this review."} ${learner}'s own view should be added here during the meeting so the review reflects the learner's experience as well as the recorded data.`,
      providerComments:`From my review of the current progress, ${learner} is in the ${point} of the programme with ${coverage}% course coverage and ${learning}% ${learningLabel} progress. ${progressText} The next review period should concentrate on ${currentTargets.length?list(currentTargets.map(lowerFirst)):"the next planned practical and knowledge areas"}, while keeping evidence and recorded learning aligned with the training plan.`,
      overallStatus:position
    };
  }
  function field(form,name){return form.elements?.[name]||form.querySelector(`[name="${name}"]`)}
  function setField(el,value){if(!el)return;writing=true;try{el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}finally{writing=false}}
  function signature(ctx){return[ctx.profile.id,ctx.snapshot.importedAt||0,ctx.metrics.coverage,ctx.metrics.learningHours,ctx.metrics.toc,(ctx.snapshot.targets||[]).length].join("|")}
  async function fill(overwrite){
    const form=document.querySelector('form[data-form^="review-"]');if(!form)return;const ctx=await context();if(!ctx)return;
    const reports=build(ctx.profile,ctx.snapshot,ctx.course,ctx.metrics,ctx.previous);
    FIELDS.forEach((name)=>{if(!overwrite&&edited.has(name))return;setField(field(form,name),reports[name])});
    const overall=field(form,"overallStatus");if(overall&&(overwrite||!edited.has("overallStatus")))setField(overall,reports.overallStatus);lastSignature=signature(ctx);
  }
  function schedule(overwrite){
    if(!active)return;if(timer)clearTimeout(timer);
    timer=setTimeout(async()=>{timer=null;const form=document.querySelector('form[data-form^="review-"]');if(!form)return;const ctx=await context();if(!ctx)return;fill(!!overwrite||signature(ctx)!==lastSignature).catch(()=>{})},55);
  }
  function activate(){active=true;edited.clear();lastSignature="";schedule(true);setTimeout(()=>schedule(true),230);setTimeout(()=>schedule(false),700)}
  document.addEventListener("click",(event)=>{
    const start=event.target?.closest?.('[data-action="start-review"][data-id]');
    if(start){profileId=clean(start.dataset.id);active=false;edited.clear();tapCount=0;lastTapAt=0;lastSignature="";try{sessionStorage.setItem(PROFILE_KEY,profileId)}catch(_){}}
    const mark=event.target?.closest?.(".milos-guidance > span");if(!mark)return;
    const form=mark.closest?.('form[data-form^="review-"]'),page=mark.closest?.(".milos-page");
    if(!form&&!(page&&(page.querySelector('[data-action="review-next"]')||page.querySelector('[data-action^="review-"]'))))return;
    const now=Date.now();if(!lastTapAt||now-lastTapAt>TAP_RESET_MS)tapCount=0;tapCount+=1;lastTapAt=now;if(tapCount<TAP_TARGET)return;tapCount=0;lastTapAt=0;activate();
  },true);
  document.addEventListener("input",(event)=>{
    if(!active||writing)return;const form=event.target?.closest?.('form[data-form^="review-"]');if(!form)return;const name=clean(event.target.name);
    if(event.isTrusted&&(FIELDS.includes(name)||name==="overallStatus"))edited.add(name);else if(!event.isTrusted)schedule(false);
  },true);
  new MutationObserver(()=>schedule(false)).observe(document.documentElement,{childList:true,subtree:true});
  global.MilosReviewProse=Object.freeze({version:"2.7",build,status,stage});
})(window);
