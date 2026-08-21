(function(global){
"use strict";
const original=global.MilosCore;
if(!original||typeof original.loadCourse!=="function")return;
const cache=new Map(),TRANSFERABLE=new Set([102,300,303,502]);
const STOP=new Set(["about","after","again","against","also","another","around","based","before","being","between","carry","could","doing","from","give","have","into","needed","other","relevant","same","should","show","that","their","these","they","this","through","using","what","when","where","which","with","work","working","your"]);
function clone(x){return JSON.parse(JSON.stringify(x))}
function words(value){return new Set(String(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(w=>w.length>3&&!STOP.has(w)))}
function unitOf(code,meta){return Number(meta?.codeUnit?.[code]||String(code||"").split(".")[0]||0)}
function themeOf(code,meta){return String(meta?.codeTheme?.[code]||"")}
function score(op,code,meta,units,descriptions){
  const ac=words(descriptions?.[code]||""),prompt=words(`${op.title||""} ${op.instruction||""} ${op.question||""}`),unit=unitOf(code,meta);
  let n=units.has(unit)?8:TRANSFERABLE.has(unit)?4:0;
  prompt.forEach(w=>{if(ac.has(w))n+=2});
  words(op.title||"").forEach(w=>{if(ac.has(w))n+=2});
  return n
}
function choose(op,codes,meta,units,descriptions){
  const themes=new Set(Array.isArray(op.themes)?op.themes.map(String):[]),candidates=codes.filter(code=>themes.has(themeOf(code,meta)));
  if(!candidates.length)throw new Error(`No NVQ AC candidates for ${op.title||op.id||"area"}`);
  const ranked=candidates.map(code=>({code,score:score(op,code,meta,units,descriptions)})).sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code,undefined,{numeric:true}));
  const best=ranked[0]?.score||0;
  let selected=ranked.filter(x=>x.score>0&&x.score>=best-2).slice(0,12).map(x=>x.code);
  if(!selected.length){
    const local=ranked.filter(x=>units.has(unitOf(x.code,meta))||TRANSFERABLE.has(unitOf(x.code,meta))).slice(0,8).map(x=>x.code);
    selected=local.length?local:ranked.slice(0,4).map(x=>x.code)
  }
  return selected
}
function repair(course,meta){
  if(course?.courseType!=="nvq"||course?.route?.courseId!=="6570-05")return course;
  const next=clone(course),allowed=[...new Set((next.codes||[]).map(String))],allowedSet=new Set(allowed),descriptions=next.descriptions||{},site=Array.isArray(next.siteData)?next.siteData:[];
  const contexts=[];
  for(const cat of site){
    const categoryUnits=new Set();
    for(const job of cat.jobs||[])for(const op of job.opps||[])for(const code of op.codes||[])if(allowedSet.has(String(code)))categoryUnits.add(unitOf(String(code),meta));
    for(const job of cat.jobs||[]){
      const jobUnits=new Set();
      for(const op of job.opps||[])for(const code of op.codes||[])if(allowedSet.has(String(code)))jobUnits.add(unitOf(String(code),meta));
      const effectiveUnits=jobUnits.size?jobUnits:categoryUnits;
      for(const op of job.opps||[]){
        const themes=new Set(Array.isArray(op.themes)?op.themes.map(String):[]);
        const local=allowed.filter(code=>themes.has(themeOf(code,meta))&&(effectiveUnits.has(unitOf(code,meta))||TRANSFERABLE.has(unitOf(code,meta))));
        const existing=(op.codes||[]).map(String).filter(code=>allowedSet.has(code));
        let mapped=[...new Set([...existing,...local])];
        if(!mapped.length)mapped=choose(op,allowed,meta,effectiveUnits,descriptions);
        op.codes=[...new Set(mapped)];
        if(!op.codes.length)throw new Error(`Milos NVQ area has no ACs: ${cat.title} / ${job.title} / ${op.title}`);
        if(op.holistic===true&&op.codes.length)delete op.holistic;
        contexts.push({op,units:effectiveUnits});
      }
    }
  }
  const mapped=new Set(contexts.flatMap(x=>x.op.codes.map(String)));
  for(const code of allowed){
    if(mapped.has(code))continue;
    const theme=themeOf(code,meta),unit=unitOf(code,meta),matches=contexts.filter(x=>(x.op.themes||[]).map(String).includes(theme));
    const target=matches.find(x=>x.units.has(unit))||matches.find(x=>TRANSFERABLE.has(unit))||matches[0];
    if(!target)throw new Error(`Milos has no evidence/observation route for ${code}`);
    target.op.codes.push(code);mapped.add(code)
  }
  const empty=contexts.filter(x=>!x.op.codes.length),unknown=[...mapped].filter(code=>!allowedSet.has(code)),missing=allowed.filter(code=>!mapped.has(code));
  if(empty.length||unknown.length||missing.length)throw new Error(`Milos holistic AC mapping audit failed: empty ${empty.length}, unknown ${unknown.length}, missing ${missing.length}`);
  next.siteData=site;next.mappingRevision=4;next.mappingRule="holistic-no-empty-v22";
  return next
}
async function metaFor(route){
  const key=route?.file||"";if(cache.has(`meta:${key}`))return cache.get(`meta:${key}`);
  const response=await fetch(key,{cache:"force-cache"});if(!response.ok)throw new Error("Milos could not open the NVQ mapping metadata.");
  const pack=await response.json(),meta=pack.nvqMeta||{};cache.set(`meta:${key}`,meta);return meta
}
async function loadCourse(routeId){
  if(cache.has(routeId))return clone(cache.get(routeId));
  const course=await original.loadCourse(routeId);
  if(course?.courseType!=="nvq"||course?.route?.courseId!=="6570-05"){cache.set(routeId,course);return course}
  const repaired=repair(course,await metaFor(course.route));cache.set(routeId,repaired);return clone(repaired)
}
global.MilosCore=Object.freeze(Object.assign({},original,{loadCourse}));
global.MilosNvqMapping=Object.freeze({version:"2.2",repair});
})(window);
