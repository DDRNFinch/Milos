(function(global){
"use strict";
const VERSION="2.16";
const base=global.MilosCore;
if(!base)return;
const REGISTRY_URL=new URL("/Evia/course-delivery/registry-v1.json",location.origin).href;
const EVIA_BASE=new URL("/Evia/",location.origin).href;
const REGISTRY_KEY="milos-evia-course-registry-v1";
const PACK_CACHE_NAME="milos-evia-course-packs-v1";
const packCache=new Map();
const routes=[];
const localFiles={
  "ST0095":"./course-packs/Bricklayer_ST0095_v1.2.nisi",
  "ST0264-SITE":"./course-packs/Carpentry_Joinery_ST0264_v1.4.nisi",
  "ST0264-AJ":"./course-packs/Carpentry_Joinery_ST0264_v1.4.nisi",
  "6570-05-THIN":"./course-packs/Trowel_Occupations_6570-05_v1.nisi",
  "6570-05-REPAIR":"./course-packs/Trowel_Occupations_6570-05_v1.nisi",
  "6570-05-SPECIALIST":"./course-packs/Trowel_Occupations_6570-05_v1.nisi",
  "6570-05-DRAINAGE":"./course-packs/Trowel_Occupations_6570-05_v1.nisi"
};
const fallbackRegistry={eviaCourseRegistry:1,courses:[
  {enrolmentId:"ST0095",title:"Bricklayer — ST0095",shortTitle:"Bricklayer",courseType:"apprenticeship",qualificationId:"ST0095",packageFamilyId:"ST0095",packageId:"st0095-v1-2",currentPackageVersion:"1.2",packagePath:"../course-packs/Bricklayer_ST0095_v1.2.nisi",publishable:true},
  {enrolmentId:"ST0264-SITE",title:"Site Carpenter — ST0264",shortTitle:"Site Carpenter",courseType:"apprenticeship",qualificationId:"ST0264",pathwayId:"site-carpenter",packageFamilyId:"ST0264",packageId:"st0264-v1-4",currentPackageVersion:"1.4",packagePath:"../course-packs/Carpentry_Joinery_ST0264_v1.4.nisi",publishable:true},
  {enrolmentId:"ST0264-AJ",title:"Architectural Joiner — ST0264",shortTitle:"Architectural Joiner",courseType:"apprenticeship",qualificationId:"ST0264",pathwayId:"architectural-joiner",packageFamilyId:"ST0264",packageId:"st0264-v1-4",currentPackageVersion:"1.4",packagePath:"../course-packs/Carpentry_Joinery_ST0264_v1.4.nisi",publishable:true},
  {enrolmentId:"6570-05-THIN",title:"Trowel Occupations Level 3 — Thin Joint",shortTitle:"Thin Joint",courseType:"nvq",qualificationId:"6570-05",pathwayId:"thin",packageFamilyId:"6570-05",packageId:"6570-05",currentPackageVersion:"1",packagePath:"../course-packs/Trowel_Occupations_6570-05_v1.nisi",publishable:true},
  {enrolmentId:"6570-05-REPAIR",title:"Trowel Occupations Level 3 — Repair & Maintenance",shortTitle:"Repair & Maintenance",courseType:"nvq",qualificationId:"6570-05",pathwayId:"repair",packageFamilyId:"6570-05",packageId:"6570-05",currentPackageVersion:"1",packagePath:"../course-packs/Trowel_Occupations_6570-05_v1.nisi",publishable:true},
  {enrolmentId:"6570-05-SPECIALIST",title:"Trowel Occupations Level 3 — Specialist Masonry",shortTitle:"Specialist Masonry",courseType:"nvq",qualificationId:"6570-05",pathwayId:"specialist",packageFamilyId:"6570-05",packageId:"6570-05",currentPackageVersion:"1",packagePath:"../course-packs/Trowel_Occupations_6570-05_v1.nisi",publishable:true},
  {enrolmentId:"6570-05-DRAINAGE",title:"Trowel Occupations Level 3 — Drainage",shortTitle:"Drainage",courseType:"nvq",qualificationId:"6570-05",pathwayId:"drainage",packageFamilyId:"6570-05",packageId:"6570-05",currentPackageVersion:"1",packagePath:"../course-packs/Trowel_Occupations_6570-05_v1.nisi",publishable:true},
  {enrolmentId:"ST0171",title:"Property Maintenance Operative — ST0171",shortTitle:"Property Maintenance",courseType:"apprenticeship",qualificationId:"ST0171",packageFamilyId:"ST0171",packageId:"st0171-v1-1",currentPackageVersion:"1.1",packagePath:"inline:ST0171",publishable:true}
]};
function clone(x){return x===undefined?undefined:JSON.parse(JSON.stringify(x))}
function norm(v){return String(v||"").trim().toUpperCase().replace(/_/g,"-")}
function readCache(){try{const x=JSON.parse(localStorage.getItem(REGISTRY_KEY)||"null");return x&&Array.isArray(x.courses)?x:null}catch{return null}}
function writeCache(x){try{localStorage.setItem(REGISTRY_KEY,JSON.stringify(x))}catch{}}
function learningDefaults(id,type){
  if(id==="ST0095")return 578;
  if(id.startsWith("ST0264"))return 557;
  if(id.startsWith("6570-05"))return 847;
  if(id==="ST0171")return 418;
  return 0;
}
function resolvePackPath(item){
  const id=norm(item?.enrolmentId);
  if(localFiles[id])return localFiles[id];
  const path=String(item?.packagePath||"").trim();
  if(!path||/^inline:/i.test(path))return path;
  try{return new URL(path,REGISTRY_URL).href}catch{return path}
}
function toRoute(item){
  const id=norm(item?.enrolmentId);
  if(!id)return null;
  const type=String(item?.courseType||"apprenticeship").toLowerCase();
  return {
    id,
    courseId:String(item?.packageId||item?.qualificationId||id),
    familyId:String(item?.packageFamilyId||item?.qualificationId||id),
    qualificationId:String(item?.qualificationId||item?.packageFamilyId||id),
    pathway:String(item?.pathwayId||""),
    title:String(item?.title||item?.shortTitle||id),
    shortTitle:String(item?.shortTitle||item?.title||id),
    courseType:type,
    coverageLabel:type==="nvq"?"AC":"KSB",
    learningLabel:type==="nvq"?"GLH":"OTJ",
    learningTarget:learningDefaults(id,type),
    file:resolvePackPath(item),
    packagePath:String(item?.packagePath||""),
    packageVersion:String(item?.currentPackageVersion||""),
    source:"evia-registry",
    publishable:item?.publishable===true
  };
}
function applyRegistry(registry){
  const published=(registry?.courses||[]).filter(x=>x&&x.publishable===true).map(toRoute).filter(Boolean);
  const by=new Map();
  for(const route of published)by.set(route.id,route);
  for(const route of base.COURSE_ROUTES||[]){
    const existing=by.get(route.id);
    if(existing)by.set(route.id,Object.assign({},route,existing,{file:localFiles[route.id]||existing.file}));
    else by.set(route.id,Object.assign({},route,{source:"milos-local",publishable:true}));
  }
  routes.splice(0,routes.length,...by.values());
  global.dispatchEvent(new CustomEvent("milos:course-packs-updated",{detail:{count:routes.length}}));
  return routes;
}
applyRegistry(readCache()||fallbackRegistry);
async function refresh(force=false){
  if(!navigator.onLine&&!force)return routes;
  try{
    const response=await fetch(`${REGISTRY_URL}?milos=${Date.now()}`,{cache:"no-store",headers:{"cache-control":"no-cache"}});
    if(!response.ok)throw Error(`registry ${response.status}`);
    const data=await response.json();
    if(data?.eviaCourseRegistry!==1||!Array.isArray(data.courses))throw Error("invalid registry");
    writeCache(data);applyRegistry(data);return routes
  }catch(error){console.debug("Milos Evia course registry",error);return routes}
}
function routeById(id){const key=norm(id);return routes.find(r=>r.id===key)||null}
function routeFromIdentifier(course,pathway){
  const raw=norm(course),path=String(pathway||"").trim().toLowerCase();
  if(!raw)return null;
  let hit=routeById(raw);if(hit)return hit;
  const exact=routes.filter(r=>[norm(r.courseId),norm(r.familyId),norm(r.qualificationId)].includes(raw));
  if(exact.length===1)return exact[0];
  if(exact.length>1){
    hit=exact.find(r=>r.pathway&&path&&r.pathway.toLowerCase()===path)||exact.find(r=>path&&(`${r.id} ${r.title} ${r.shortTitle} ${r.pathway}`).toLowerCase().includes(path));
    if(hit)return hit
  }
  hit=routes.find(r=>raw.includes(norm(r.id))||norm(r.title).includes(raw)||raw.includes(norm(r.shortTitle)));
  if(hit)return hit;
  return typeof base.routeFromIdentifier==="function"?base.routeFromIdentifier(course,pathway):null
}
async function cachedFetch(url,options){
  const request=new Request(url,{method:"GET"});
  if("caches" in global){const cached=await caches.match(request,{ignoreSearch:true});if(cached)return cached.clone()}
  const response=await fetch(url,options||{cache:"no-store"});
  if(response.ok&&"caches" in global){try{const cache=await caches.open(PACK_CACHE_NAME);await cache.put(request,response.clone())}catch{}}
  return response
}
function inlineToken(route){return String(route?.packagePath||route?.file||"").replace(/^inline:/i,"").trim()||String(route?.qualificationId||route?.id||"")}
function globalStem(token){return String(token||"").toUpperCase().replace(/[^A-Z0-9]/g,"")}
async function executeTrustedScript(url){
  const response=await cachedFetch(url,{cache:"no-store"});if(!response.ok)throw Error(`course asset ${response.status}`);
  const text=await response.text();
  (0,eval)(`${text}\n//# sourceURL=${url}`)
}
async function loadInlinePack(route){
  const token=inlineToken(route),stem=globalStem(token),packName=`Evia${stem}Pack`,metaName=`Evia${stem}Meta`,mapName=`Evia${stem}Map`;
  if(global[packName]?.build)return global[packName].build();
  const indexResponse=await cachedFetch(new URL("index.html",EVIA_BASE).href,{cache:"no-store"});
  if(!indexResponse.ok)throw Error("Milos could not inspect the Evia course assets.");
  const html=await indexResponse.text(),needle=String(token).toLowerCase().replace(/[^a-z0-9]/g,"");
  const all=[...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)].map(m=>new URL(m[1],EVIA_BASE).href);
  const matches=all.filter(src=>src.toLowerCase().replace(/[^a-z0-9]/g,"").includes(needle)).filter(src=>/-(?:meta|map)-/i.test(src));
  for(const src of matches)await executeTrustedScript(src);
  if(global[packName]?.build)return global[packName].build();
  if(global[metaName]&&Array.isArray(global[mapName]))return Object.assign({},clone(global[metaName]),{siteData:clone(global[mapName])});
  throw Error(`The ${route.shortTitle||route.id} course pack is listed by Evia but its inline pack data could not be loaded.`)
}
async function rawPack(route){
  if(/^inline:/i.test(route.packagePath||route.file||""))return loadInlinePack(route);
  const url=route.file;if(!url)throw Error("This Evia course pack has no package source.");
  const response=await cachedFetch(url,{cache:"force-cache"});if(!response.ok)throw Error("Milos could not open this Evia course pack.");return response.json()
}
async function loadCourse(routeId){
  const route=routeById(routeId);if(!route)throw Error("Choose the learner's course first.");
  const originalRoute=typeof base.routeById==="function"?base.routeById(route.id):null;
  if(originalRoute&&typeof base.loadCourse==="function")return base.loadCourse(route.id);
  if(packCache.has(route.id))return clone(packCache.get(route.id));
  const pack=await rawPack(route),pathway=route.pathway&&Array.isArray(pack.pathways)?pack.pathways.find(x=>String(x.id)===route.pathway):null,source=pathway||pack;
  const result={
    route:clone(route),packId:String(pack.id||route.courseId),title:route.title,shortTitle:route.shortTitle,
    courseType:route.courseType,coverageLabel:route.coverageLabel,learningLabel:route.learningLabel,
    learningTarget:base.finiteNumber(source.glhTargetHours||pack.glhTargetHours||pack.otjMinimumHours,route.learningTarget),
    codes:base.cleanCodes(source.codes||pack.codes),descriptions:clone(source.codeDescriptions||pack.codeDescriptions||{}),
    siteData:clone(source.siteData||pack.siteData||[]),units:clone(source.units||pack.units||[])
  };
  if(!result.codes.length||!result.siteData.length)throw Error("This Evia course pack is missing its mapped course content.");
  packCache.set(route.id,result);return clone(result)
}
function readProfiles(){try{const x=JSON.parse(localStorage.getItem(base.STORAGE.profiles)||"[]");return Array.isArray(x)?x:[]}catch{return[]}}
function writeProfiles(xs){localStorage.setItem(base.STORAGE.profiles,JSON.stringify(xs))}
function forceProfileRoute(profileId,routeId){const xs=readProfiles(),i=xs.findIndex(p=>p.id===profileId);if(i<0)return null;xs[i]=Object.assign({},xs[i],{courseRouteId:routeId,updatedAt:Date.now()});writeProfiles(xs);return clone(xs[i])}
function createProfile(input){
  const requested=routeById(input?.courseRouteId);
  if(!requested)return base.createProfile(input);
  if(base.routeById?.(requested.id))return base.createProfile(input);
  const created=base.createProfile(Object.assign({},input,{courseRouteId:""}));return forceProfileRoute(created.id,requested.id)
}
function updateProfile(id,patch){
  if(!patch||!Object.prototype.hasOwnProperty.call(patch,"courseRouteId"))return base.updateProfile(id,patch);
  const requested=routeById(patch.courseRouteId);
  if(!requested)return base.updateProfile(id,Object.assign({},patch,{courseRouteId:""}));
  if(base.routeById?.(requested.id))return base.updateProfile(id,patch);
  const updated=base.updateProfile(id,Object.assign({},patch,{courseRouteId:""}));return forceProfileRoute(updated.id,requested.id)
}
function dateValue(value){const s=String(value||"").slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:""}
function uid(prefix){try{return `${prefix}-${crypto.randomUUID()}`}catch{return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`}}
function dynamicAttachProgress(profileId,raw,route){
  const xs=readProfiles(),i=xs.findIndex(p=>p.id===profileId);if(i<0)throw Error("Select a learner before importing progress.");
  const learningHours=Math.max(0,base.finiteNumber(raw.learningHours??raw.loggedHours??raw.otjHours??raw.glhHours??raw.l,0));
  const learningTarget=Math.max(0,base.finiteNumber(raw.learningTarget??raw.requiredHours??raw.lt,route.learningTarget));
  const completedCodes=base.cleanCodes(raw.completedCodes??raw.evidencedCodes??raw.coveredCodes??raw.z??raw.codes);
  const changedCodes=base.cleanCodes(raw.changedCodes??raw.newCodes??raw.d);
  const snapshot={
    id:uid("snapshot"),source:"evia-qr",protocolVersion:Math.max(1,base.finiteNumber(raw.protocolVersion??raw.version??raw.v,1)),
    courseRouteId:route.id,courseId:route.courseId,pathway:route.pathway,
    sharedId:base.cleanText(raw.sharedId??raw.learnerRef??raw.deviceRef??raw.r??raw.sid,80),
    startDate:dateValue(raw.startDate??raw.s),endDate:dateValue(raw.endDate??raw.e),learningHours,learningTarget,
    completedCodes,changedCodes,targets:base.cleanTargets(raw.targets??raw.tg),lastReviewAt:dateValue(raw.lastReviewAt??raw.lr),
    evidenceCount:Math.max(0,base.finiteNumber(raw.evidenceCount??raw.ec,0)),exportedAt:base.finiteNumber(raw.exportedAt??raw.u,Date.now()),
    sourceBreakdown:clone(raw.zs||{}),ignoredPersonalFields:[]
  };
  const profile=Object.assign({},xs[i]);profile.courseRouteId=route.id;profile.startDate=snapshot.startDate||profile.startDate||"";profile.endDate=snapshot.endDate||profile.endDate||"";if(snapshot.sharedId)profile.sharedId=snapshot.sharedId;profile.snapshots=[snapshot,...(Array.isArray(profile.snapshots)?profile.snapshots:[])].slice(0,30);profile.updatedAt=Date.now();xs[i]=profile;writeProfiles(xs);return clone(profile)
}
function attachProgress(profileId,raw){
  const route=routeFromIdentifier(raw?.courseRouteId||raw?.route||raw?.courseId||raw?.course||raw?.c||raw?.standard||raw?.standardId,raw?.pathway||raw?.path||raw?.p);
  if(!route)throw Error("The course in this Evia QR is not recognised.");
  if(base.routeById?.(route.id))return base.attachProgress(profileId,raw);
  return dynamicAttachProgress(profileId,raw,route)
}
const enhanced=Object.freeze(Object.assign({},base,{COURSE_ROUTES:routes,routeById,routeFromIdentifier,loadCourse,createProfile,updateProfile,attachProgress}));
global.MilosCore=enhanced;
function esc(v){return base.escapeHtml?base.escapeHtml(v):String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function style(){if(document.getElementById("milos-evia-packs-v216-style"))return;const s=document.createElement("style");s.id="milos-evia-packs-v216-style";s.textContent=`
.milos-evia-packs-layer{position:fixed;inset:0;z-index:12000;background:rgba(246,249,255,.97);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);overflow:auto;color:#20252b}.milos-evia-packs-screen{width:min(36rem,100%);min-height:100%;margin:0 auto;padding:max(1rem,env(safe-area-inset-top)) 1rem max(2rem,env(safe-area-inset-bottom));box-sizing:border-box}.milos-evia-packs-head{display:grid;grid-template-columns:5rem 1fr 5rem;align-items:center;margin:.2rem 0 1.3rem}.milos-evia-packs-head button{justify-self:start;border:1px solid rgba(63,131,206,.18);background:rgba(255,255,255,.82);color:#3b6f9f;border-radius:999px;padding:.55rem .78rem;font:inherit}.milos-evia-packs-head b{text-align:center}.milos-evia-packs-intro{background:rgba(255,255,255,.76);border:1px solid rgba(63,131,206,.08);border-radius:1.2rem;padding:1rem;margin-bottom:.8rem}.milos-evia-packs-intro strong{display:block;font-size:1rem;margin-bottom:.25rem}.milos-evia-packs-intro p{margin:0;color:#6d7680;font-size:.78rem;line-height:1.45}.milos-evia-packs-status{font-size:.68rem;color:#7b8490;margin:.55rem .15rem}.milos-evia-packs-list{display:grid;gap:.55rem}.milos-evia-pack-card{display:grid;grid-template-columns:1fr auto;gap:.35rem .7rem;align-items:center;background:rgba(255,255,255,.86);border:1px solid rgba(63,131,206,.09);border-radius:1.05rem;padding:.86rem .95rem;box-shadow:0 8px 22px rgba(47,86,128,.05)}.milos-evia-pack-card b{font-size:.84rem}.milos-evia-pack-card small{display:block;color:#7b828b;font-size:.66rem;margin-top:.12rem}.milos-evia-pack-card em{font-style:normal;font-size:.62rem;color:#2f6fab;background:#edf5fd;border-radius:999px;padding:.34rem .55rem}.milos-evia-packs-foot{margin:1rem .2rem 0;color:#8a9199;font-size:.64rem;line-height:1.45;text-align:center}
`;document.head.appendChild(s)}
function packRows(){return routes.map(r=>`<article class="milos-evia-pack-card"><span><b>${esc(r.shortTitle||r.title)}</b><small>${esc(r.id)}${r.packageVersion?` · v${esc(r.packageVersion)}`:""} · ${r.courseType==="nvq"?"NVQ":"Apprenticeship"}</small></span><em>Ready</em></article>`).join("")}
function renderLayer(){const layer=document.querySelector(".milos-evia-packs-layer");if(!layer)return;const list=layer.querySelector("[data-pack-list]");if(list)list.innerHTML=packRows();const status=layer.querySelector("[data-pack-status]");if(status)status.textContent=`${routes.length} Evia course route${routes.length===1?"":"s"} available in Milos`}
function openLayer(){style();document.querySelector(".milos-evia-packs-layer")?.remove();const layer=document.createElement("div");layer.className="milos-evia-packs-layer";layer.innerHTML=`<section class="milos-evia-packs-screen"><div class="milos-evia-packs-head"><button type="button" data-pack-back>‹ Back</button><b>Evia Course Packs</b><span></span></div><div class="milos-evia-packs-intro"><strong>Courses shared with Evia</strong><p>Milos reads Evia's published course registry. Existing packs are ready here, and newly published Evia course packs are added automatically.</p></div><div class="milos-evia-packs-status" data-pack-status></div><div class="milos-evia-packs-list" data-pack-list></div><p class="milos-evia-packs-foot">Course definitions contain qualification structure only. Learner names and personal data are never downloaded from Evia.</p></section>`;document.body.appendChild(layer);layer.querySelector("[data-pack-back]").onclick=()=>layer.remove();renderLayer();refresh(true).then(renderLayer);return layer}
function patchMore(){const button=document.querySelector('[data-action="future-tools"]');if(!button)return;const title=button.querySelector(".option-row-copy span"),note=button.querySelector(".option-row-copy small");if(title)title.textContent="Evia Course Packs";if(note)note.textContent="All current and future Evia courses";button.setAttribute("aria-label","Open Evia Course Packs")}
document.addEventListener("click",e=>{const button=e.target instanceof Element?e.target.closest('[data-action="future-tools"]'):null;if(!button)return;e.preventDefault();e.stopImmediatePropagation();openLayer()},true);
function start(){style();patchMore();new MutationObserver(patchMore).observe(document.body,{subtree:true,childList:true});refresh(false);window.addEventListener("focus",()=>refresh(false));window.addEventListener("online",()=>refresh(true));global.addEventListener("milos:course-packs-updated",renderLayer)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
global.MilosEviaCoursePacks=Object.freeze({version:VERSION,routes:()=>clone(routes),refresh,open:openLayer,routeById,loadCourse});
})(window);
