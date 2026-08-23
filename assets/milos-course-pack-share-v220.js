(()=>{
"use strict";
const VERSION="2.20";
const REGISTRY_URL=new URL("/Evia/course-delivery/registry-v1.json",location.origin).href;
let registry=null;
let decorating=false;
function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function loadRegistry(){
  try{
    const response=await fetch(`${REGISTRY_URL}?share=${Date.now()}`,{cache:"no-store",headers:{"cache-control":"no-cache"}});
    if(!response.ok)throw Error(`registry ${response.status}`);
    const data=await response.json();
    if(data?.eviaCourseRegistry!==1||!Array.isArray(data.courses))throw Error("invalid registry");
    registry=data;return data;
  }catch(error){console.debug("Milos course share registry",error);return registry}
}
function routeList(){try{return window.MilosEviaCoursePacks?.routes?.()||[]}catch{return[]}}
function registryItem(id){const key=String(id||"").trim().toUpperCase();return registry?.courses?.find(item=>String(item?.enrolmentId||"").trim().toUpperCase()===key)||null}
function payloadFor(route){const item=registryItem(route?.id);return String(item?.qrPayload||`EVIA1:${route?.id||""}`).trim()}
function ensureStyle(){
  if(document.getElementById("milos-course-share-v220-style"))return;
  const style=document.createElement("style");
  style.id="milos-course-share-v220-style";
  style.textContent=`
  .milos-evia-pack-card[data-share-course]{cursor:pointer;border:1px solid transparent;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.milos-evia-pack-card[data-share-course]:active{transform:scale(.985)}.milos-evia-pack-card[data-share-course] em{display:inline-flex;align-items:center;gap:.3rem}.milos-evia-pack-card[data-share-course] em:after{content:'›';font-size:1rem;line-height:.7}.milos-course-share-layer{position:fixed;inset:0;z-index:12750;background:rgba(244,248,252,.985);backdrop-filter:blur(20px);overflow:auto}.milos-course-share-screen{width:min(100%,560px);min-height:100%;margin:auto;box-sizing:border-box;padding:max(1rem,env(safe-area-inset-top)) 1rem calc(2rem + env(safe-area-inset-bottom));color:#20252b}.milos-course-share-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin-bottom:1.15rem}.milos-course-share-head button{justify-self:start;border:1px solid rgba(52,125,204,.2);background:#fff;border-radius:999px;padding:.62rem .85rem;color:#347dcc;font:600 .78rem system-ui}.milos-course-share-head b{font:700 .98rem system-ui}.milos-course-share-card{background:#fff;border-radius:1.45rem;padding:1.1rem;box-shadow:0 12px 34px rgba(42,83,126,.09);text-align:center}.milos-course-share-card h2{font:750 1.35rem/1.15 system-ui;margin:.2rem 0 .35rem}.milos-course-share-card>p{color:#6a737d;font:.82rem/1.45 system-ui;margin:.25rem auto .9rem;max-width:34rem}.milos-course-share-meta{display:flex;justify-content:center;gap:.45rem;flex-wrap:wrap;margin:.6rem 0 .95rem}.milos-course-share-meta span{background:#edf5fd;color:#347dcc;border-radius:999px;padding:.38rem .58rem;font:700 .69rem system-ui}.milos-course-share-qr{width:min(74vw,310px);aspect-ratio:1;margin:.35rem auto .7rem;display:grid;place-items:center;background:#fff;border-radius:1.15rem}.milos-course-share-qr svg{width:100%;height:100%;display:block}.milos-course-share-code{font:700 .82rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;color:#3c4650;word-break:break-all;margin:.55rem 0}.milos-course-share-actions{display:grid;grid-template-columns:1fr 1fr;gap:.55rem;margin-top:.9rem}.milos-course-share-actions button{border:0;border-radius:999px;padding:.82rem .85rem;font:700 .78rem system-ui}.milos-course-share-actions .primary{grid-column:1/-1;background:#3f83ce;color:#fff}.milos-course-share-actions .secondary{background:#edf1f5;color:#3f5264}.milos-course-share-status{min-height:1.1rem;margin:.7rem 0 0!important;color:#66727d!important;font-size:.75rem!important}.milos-course-share-help{margin:1rem .25rem 0;color:#707a84;font:.78rem/1.5 system-ui;text-align:center}`;
  document.head.appendChild(style);
}
function decorate(){
  if(decorating)return;
  const layer=document.querySelector(".milos-evia-packs-layer");
  if(!layer)return;
  const cards=[...layer.querySelectorAll(".milos-evia-pack-card")];
  const routes=routeList();
  if(!cards.length||!routes.length)return;
  decorating=true;
  cards.forEach((card,index)=>{
    const route=routes[index];if(!route)return;
    if(card.dataset.shareCourse!==route.id)card.dataset.shareCourse=route.id;
    card.setAttribute("role","button");card.tabIndex=0;
    card.setAttribute("aria-label",`Open ${route.shortTitle||route.title} course pack to share with an Evia learner`);
    const state=card.querySelector("em");if(state&&state.textContent!=="Open")state.textContent="Open";
  });
  decorating=false;
}
function routeById(id){return routeList().find(route=>String(route.id)===String(id))||null}
async function copyText(text,status){
  try{await navigator.clipboard.writeText(text);status.textContent="Course code copied."}
  catch{const input=document.createElement("textarea");input.value=text;input.style.position="fixed";input.style.opacity="0";document.body.appendChild(input);input.select();document.execCommand("copy");input.remove();status.textContent="Course code copied."}
}
async function openShare(route){
  if(!route)return;
  ensureStyle();
  if(!registry)await loadRegistry();
  const payload=payloadFor(route);
  document.querySelector(".milos-course-share-layer")?.remove();
  const layer=document.createElement("div");layer.className="milos-course-share-layer";
  layer.innerHTML=`<section class="milos-course-share-screen"><div class="milos-course-share-head"><button type="button" data-share-back>‹ Back</button><b>Evia Course Pack</b><span></span></div><div class="milos-course-share-card"><h2>${esc(route.shortTitle||route.title)}</h2><div class="milos-course-share-meta"><span>${esc(route.id)}</span><span>${route.courseType==="nvq"?"NVQ":"Apprenticeship"}</span>${route.packageVersion?`<span>v${esc(route.packageVersion)}</span>`:""}</div><p>Ask the learner to open Evia's course scanner and scan this QR. Evia will install the matching course pack on their device.</p><div class="milos-course-share-qr" data-share-qr></div><div class="milos-course-share-code">${esc(payload)}</div><div class="milos-course-share-actions"><button type="button" class="primary" data-share-copy>Copy code</button><button type="button" class="secondary" data-share-download>Download QR</button><button type="button" class="secondary" data-share-close>Done</button></div><p class="milos-course-share-status" data-share-status aria-live="polite"></p></div><p class="milos-course-share-help">The QR contains the course enrolment code only. It does not contain learner names, progress, signatures or other personal data.</p></section>`;
  document.body.appendChild(layer);
  const qr=layer.querySelector("[data-share-qr]"),status=layer.querySelector("[data-share-status]");
  try{window.MilosQR.render(qr,payload,{size:300,errorCorrection:"M",label:`${route.shortTitle||route.title} Evia course QR`})}catch(error){status.textContent=error?.message||"The QR code could not be generated."}
  const close=()=>layer.remove();
  layer.querySelector("[data-share-back]").onclick=close;layer.querySelector("[data-share-close]").onclick=close;
  layer.querySelector("[data-share-copy]").onclick=()=>copyText(payload,status);
  layer.querySelector("[data-share-download]").onclick=()=>{try{window.MilosQR.download(qr,`${String(route.shortTitle||route.id).replace(/[^a-z0-9]+/gi,"_")}_Evia_Course_QR.png`);status.textContent="QR image saved."}catch(error){status.textContent=error?.message||"The QR image could not be saved."}};
}
function activate(card){const route=routeById(card?.dataset?.shareCourse);if(route)openShare(route)}
function start(){
  ensureStyle();loadRegistry();decorate();
  const root=document.body;
  new MutationObserver(records=>{if(records.some(record=>record.type==="childList"&&(record.addedNodes.length||record.removedNodes.length)))queueMicrotask(decorate)}).observe(root,{subtree:true,childList:true});
  window.addEventListener("focus",()=>loadRegistry());
}
window.addEventListener("click",event=>{const card=event.target instanceof Element?event.target.closest(".milos-evia-pack-card[data-share-course]"):null;if(!card)return;event.preventDefault();event.stopImmediatePropagation();activate(card)},true);
window.addEventListener("keydown",event=>{if(event.key!=="Enter"&&event.key!==" ")return;const card=event.target instanceof Element?event.target.closest(".milos-evia-pack-card[data-share-course]"):null;if(!card)return;event.preventDefault();activate(card)},true);
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.MilosCoursePackShare=Object.freeze({version:VERSION,open:openShare,payloadFor});
})();
