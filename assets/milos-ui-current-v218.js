(()=>{
"use strict";
const CURRENT=document.querySelector('meta[name="milos-app-version"]')?.content||"";
let queued=false;
function patch(){
  queued=false;
  const version=document.querySelector('.milos-version');
  if(version&&CURRENT){
    const wanted=`Milos Beta · v${CURRENT}`;
    if(version.textContent!==wanted)version.textContent=wanted;
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
window.MilosCurrentUI=Object.freeze({version:"2.18",patch});
})();
