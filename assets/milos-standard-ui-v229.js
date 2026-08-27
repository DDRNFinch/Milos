(()=>{
  'use strict';
  const root=document.getElementById('milosApp');
  if(!root)return;
  function brandWord(){return 'M<span class="app-brand-i">i</span>los';}
  function patch(){
    root.classList.add('standard-ui');
    let header=root.querySelector('.std-app-header');
    if(!header){
      header=document.createElement('div');
      header.className='std-app-header';
      header.setAttribute('aria-label','Milos assessor assistant');
      header.innerHTML=`<div class="std-brand-lockup"><strong>${brandWord()}</strong><small>Assessor assistant</small></div>`;
      root.prepend(header);
    }
    const home=root.querySelector('.milos-home-copy');
    if(home){
      home.querySelectorAll('strong').forEach(el=>el.remove());
      let hint=home.querySelector('span');
      if(!hint){hint=document.createElement('span');home.appendChild(hint);}
      if(hint.textContent!=='Tap me to get started')hint.textContent='Tap me to get started';
      [...home.children].filter(el=>el!==hint).forEach(el=>el.remove());
    }
  }
  function start(){patch();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.MilosStandardUI=Object.freeze({version:'2.36',patch,observer:false});
})();
