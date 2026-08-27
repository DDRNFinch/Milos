(()=>{
  'use strict';
  const root=document.getElementById('milosApp');
  if(!root)return;
  let queued=false;
  function brandWord(){return 'M<span class="app-brand-i">i</span>los';}
  function patch(){
    queued=false;
    root.classList.add('standard-ui');
    let header=root.querySelector('.std-app-header');
    if(!header){
      header=document.createElement('div');
      header.className='std-app-header';
      header.setAttribute('aria-label','Milos assessor assistant');
      header.innerHTML=`<div class="std-brand-lockup"><strong>${brandWord()}</strong><small>Assessor assistant</small></div>`;
      root.prepend(header);
    }
    const home=root.querySelector('.milos-home-copy>strong');
    if(home&&!home.querySelector('.app-brand-i'))home.innerHTML=brandWord();
  }
  function schedule(){if(queued)return;queued=true;queueMicrotask(patch);}
  function start(){
    patch();
    new MutationObserver(records=>{if(records.some(r=>r.type==='childList'&&(r.addedNodes.length||r.removedNodes.length)))schedule();}).observe(root,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.MilosStandardUI=Object.freeze({version:'2.29',patch});
})();
