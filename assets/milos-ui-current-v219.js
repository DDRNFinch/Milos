(()=>{
"use strict";
const CURRENT=document.querySelector('meta[name="milos-app-version"]')?.content||"";
function ensureStyle(){
  if(document.getElementById('milos-ui-current-v219-style'))return;
  const style=document.createElement('style');
  style.id='milos-ui-current-v219-style';
  style.textContent='.milos-current-version{margin:1.35rem 0 0;text-align:center;color:rgba(66,88,111,.52);font:500 .76rem/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.milos-version[data-stale-version]{display:none!important}';
  document.head.appendChild(style);
}
function patch(){
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
window.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target.closest('[data-action]'):null;
  if(!target)return;
  if(target.dataset.action==='future-tools'){
    const packs=window.MilosEviaCoursePacks;
    if(!packs||typeof packs.open!=="function")return;
    event.preventDefault();
    event.stopImmediatePropagation();
    packs.open();
    return;
  }
  setTimeout(patch,0);
},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patch,{once:true});else patch();
window.MilosCurrentUI=Object.freeze({version:"2.36",patch,observer:false});
})();
