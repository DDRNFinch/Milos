(()=>{
"use strict";
const VERSION="2.21";
const APPS=Object.freeze([
  {name:"Evia",url:"https://ddrnfinch.github.io/Evia/",note:"Learner app"},
  {name:"Milos",url:"https://ddrnfinch.github.io/Milos/",note:"Assessor app"},
  {name:"Symi",url:"https://ddrnfinch.github.io/Symi/",note:"Tutor app"},
  {name:"Tinos",url:"https://ddrnfinch.github.io/Tinos/",note:"Employer app"}
]);
let queued=false;
function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function ensureStyle(){
  if(document.getElementById("milos-app-links-v221-style"))return;
  const style=document.createElement("style");
  style.id="milos-app-links-v221-style";
  style.textContent=`
  .milos-app-links{margin:0 0 1rem;background:#fff;border-radius:1.35rem;padding:1rem;box-shadow:0 10px 28px rgba(42,83,126,.08)}
  .milos-app-links-head{margin:0 0 .85rem;text-align:left}.milos-app-links-head strong{display:block;font:750 1.08rem/1.15 system-ui;color:#20252b}.milos-app-links-head span{display:block;margin-top:.22rem;color:#69717a;font:.78rem/1.35 system-ui}
  .milos-app-links-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}
  .milos-app-link-card{min-width:0;border:1px solid rgba(52,125,204,.12);border-radius:1rem;background:#f9fbfe;padding:.7rem;text-align:center;box-sizing:border-box}
  .milos-app-link-card h3{margin:0;color:#20252b;font:750 .92rem/1.15 system-ui}.milos-app-link-card small{display:block;margin:.14rem 0 .55rem;color:#6f7882;font:.65rem/1.2 system-ui}
  .milos-app-link-qr{width:min(100%,132px);aspect-ratio:1;margin:0 auto .5rem;background:#fff;border-radius:.7rem;display:grid;place-items:center;overflow:hidden}.milos-app-link-qr svg{width:100%;height:100%;display:block}
  .milos-app-link-url{display:block;min-height:2.35rem;color:#347dcc;text-decoration:none;font:600 .58rem/1.28 system-ui;overflow-wrap:anywhere;word-break:break-word}.milos-app-link-url:focus-visible{outline:2px solid #347dcc;outline-offset:2px;border-radius:.3rem}
  .milos-app-link-copy{width:100%;margin-top:.45rem;border:0;border-radius:999px;background:#edf5fd;color:#347dcc;padding:.55rem .45rem;font:700 .66rem system-ui}.milos-app-link-status{min-height:.8rem;margin:.3rem 0 0;color:#69717a;font:.58rem/1.2 system-ui}
  @media(max-width:350px){.milos-app-links-grid{grid-template-columns:1fr}.milos-app-link-qr{width:145px}}
  `;
  document.head.appendChild(style);
}
async function copy(text,status){
  try{await navigator.clipboard.writeText(text);status.textContent="Link copied."}
  catch{
    const field=document.createElement("textarea");field.value=text;field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();document.execCommand("copy");field.remove();status.textContent="Link copied.";
  }
  setTimeout(()=>{if(status.isConnected)status.textContent=""},1800);
}
function card(app,index){return `<article class="milos-app-link-card" data-app-card="${index}"><h3>${esc(app.name)}</h3><small>${esc(app.note)}</small><div class="milos-app-link-qr" data-app-qr="${index}" aria-label="${esc(app.name)} website QR"></div><a class="milos-app-link-url" href="${esc(app.url)}" target="_blank" rel="noopener noreferrer">${esc(app.url)}</a><button type="button" class="milos-app-link-copy" data-app-copy="${index}">Copy link</button><p class="milos-app-link-status" data-app-status="${index}" aria-live="polite"></p></article>`}
function renderQrs(section){
  APPS.forEach((app,index)=>{
    const target=section.querySelector(`[data-app-qr="${index}"]`);if(!target||target.dataset.rendered==="1")return;
    try{window.MilosQR?.render?.(target,app.url,{size:132,errorCorrection:"M",label:`${app.name} website QR code`});target.dataset.rendered="1"}
    catch(error){target.textContent="QR unavailable";target.dataset.rendered="error";console.debug("Milos app link QR",app.name,error)}
  });
}
function inject(){
  queued=false;ensureStyle();
  const screen=document.querySelector(".milos-evia-packs-screen");if(!screen)return;
  let section=screen.querySelector("[data-milos-app-links]");
  if(!section){
    section=document.createElement("section");section.className="milos-app-links";section.dataset.milosAppLinks="1";section.setAttribute("aria-label","Share Evia, Milos, Symi and Tinos");
    section.innerHTML=`<div class="milos-app-links-head"><strong>Share the apps</strong><span>Scan the QR or use the website link.</span></div><div class="milos-app-links-grid">${APPS.map(card).join("")}</div>`;
    const head=screen.querySelector(".milos-evia-packs-head");if(head)head.insertAdjacentElement("afterend",section);else screen.prepend(section);
    section.addEventListener("click",event=>{
      const button=event.target instanceof Element?event.target.closest("[data-app-copy]"):null;if(!button)return;
      const index=Number(button.dataset.appCopy);const app=APPS[index];const status=section.querySelector(`[data-app-status="${index}"]`);if(app&&status)copy(app.url,status);
    });
  }
  renderQrs(section);
}
function schedule(){if(queued)return;queued=true;queueMicrotask(inject)}
function start(){
  inject();
  new MutationObserver(records=>{
    if(records.some(record=>record.type==="childList"&&[...record.addedNodes].some(node=>node.nodeType===1&&(node.matches?.(".milos-evia-packs-layer,.milos-evia-packs-screen")||node.querySelector?.(".milos-evia-packs-screen")))))schedule();
  }).observe(document.body,{subtree:true,childList:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.MilosAppLinks=Object.freeze({version:VERSION,apps:APPS,refresh:inject});
})();
