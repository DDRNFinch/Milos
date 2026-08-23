(()=>{
"use strict";
const CURRENT=document.querySelector('meta[name="milos-app-version"]')?.content||"";
let queued=false;
function ensureStyle(){
  if(document.getElementById('milos-ui-current-v219-style'))return;
  const style=document.createElement('style');
  style.id='milos-ui-current-v219-style';
  style.textContent='.milos-current-version{margin:1.35rem 0 0;text-align:center;color:rgba(66,88,111,.52);font:500 .76rem/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.milos-version[data-stale-version]{display:none!important}';
  document.head.appendChild(style);
}
function patch(){
  queued=false;
  ensureStyle();
  const legacy=document.querySelector('.milos-version');
  if(legacy){
    legacy.dataset.staleVersion='1';
    legacy.setAttribute('aria-hidden','true');
    let live=legacy.parentElement?.querySelector('.milos-current-version');
    if(!live){
      live=document.createElement('div');
      live.className='milos-current-version';
      legacy.insertAdjacentElement('afterend',live);
    }
    const wanted=CURRENT?`Milos Beta · v${CURRENT}`:'Milos Beta';
    if(live.textContent!==wanted)live.textContent=wanted;
  }
  const button=document.querySelector('[data-action="future-tools"]');
  if(button){
    const title=button.querySelector('.option-row-copy span');
    const note=button.querySelector('.option-row-copy small');
    if(title&&title.textContent!=="Evia Course Packs")title.textContent="Evia Course Packs";
    if(note&&note.textContent!=="All current and future Evia courses")note.textContent="All current and future Evia courses";
    if(button.getAttribute('aria-label')!=="Open Evia Course Packs")button.setAttribute('aria-label',"Open Evia Course Packs");
  }
}
function schedule(){if(queued)return;queued=true;queueMicrotask(patch)}
function start(){
  patch();
  const root=document.getElementById('milosApp')||document.body;
  if(root)new MutationObserver(records=>{
    if(records.some(record=>record.type==='childList'&&(record.addedNodes.length||record.removedNodes.length)))schedule();
  }).observe(root,{childList:true,subtree:true});
}
window.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target.closest('[data-action="future-tools"]'):null;
  if(!target)return;
  const packs=window.MilosEviaCoursePacks;
  if(!packs||typeof packs.open!=="function")return;
  event.preventDefault();
  event.stopImmediatePropagation();
  packs.open();
},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.MilosCurrentUI=Object.freeze({version:"2.19",patch});
})();
