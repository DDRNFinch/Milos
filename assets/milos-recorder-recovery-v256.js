(()=>{
  'use strict';

  const NativeMediaRecorder=window.MediaRecorder;
  if(!NativeMediaRecorder||!window.document)return;

  const VERSION='2.56';
  let current=null;

  function evidenceLayerVisible(){
    const layer=document.getElementById('milosVideoObservationLayer');
    return !!(layer&&!layer.hidden);
  }

  function durationLabel(ms){
    const total=Math.max(0,Math.floor(Number(ms||0)/1000));
    const mins=Math.floor(total/60),secs=total%60;
    return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }

  function paintStopped(meta){
    if(!meta||!meta.unexpected)return;
    const layer=document.getElementById('milosVideoObservationLayer');
    if(!layer||layer.hidden)return;
    const badge=layer.querySelector('.mvo-rec-badge');
    const mic=layer.querySelector('.mve-mic-badge');
    const timer=layer.querySelector('#mveTimer');
    const hint=layer.querySelector('#mveRecordingHint');
    if(badge)badge.textContent='REC STOPPED';
    if(mic)mic.textContent='CLIP HELD';
    if(timer&&meta.startedAt&&meta.stoppedAt)timer.textContent=durationLabel(meta.stoppedAt-meta.startedAt);
    if(hint)hint.textContent='The camera stopped unexpectedly. Your recorded clip is still held. Choose Competent or More required, then finish this LO.';
  }

  function keepStoppedUi(meta){
    clearInterval(meta.uiTimer);
    paintStopped(meta);
    meta.uiTimer=setInterval(()=>paintStopped(meta),250);
  }

  function maybeAutoFinish(meta){
    setTimeout(()=>{
      if(!meta||!meta.unexpected)return;
      const layer=document.getElementById('milosVideoObservationLayer');
      if(!layer||layer.hidden)return;
      const intro=layer.querySelector('[data-mve-action="stop-intro"]');
      if(intro){intro.click();return;}
      const selected=layer.querySelector('[data-mve-status].is-selected');
      if(!selected)return;
      const finalNvq=layer.querySelector('[data-mve-action="next-ac"]:not([disabled])');
      if(finalNvq&&/^Finish\b/i.test(String(finalNvq.textContent||'').trim())){finalNvq.click();return;}
      const finalKsb=layer.querySelector('[data-mve-action="finish-opp"]:not([disabled])');
      if(finalKsb)finalKsb.click();
    },80);
  }

  function decorate(native){
    const meta={
      evidence:evidenceLayerVisible(),
      unexpected:false,
      stopRequested:false,
      pretend:false,
      synthetic:false,
      startedAt:0,
      stoppedAt:0,
      uiTimer:0,
    };

    const proxy=new Proxy(native,{
      get(target,prop){
        if(prop==='state'){
          const actual=Reflect.get(target,prop,target);
          if(meta.evidence&&meta.unexpected&&meta.pretend&&actual==='inactive')return'recording';
          return actual;
        }
        if(prop==='start')return(...args)=>{
          meta.startedAt=Date.now();
          return target.start(...args);
        };
        if(prop==='requestData')return(...args)=>{
          if(meta.evidence&&meta.unexpected&&target.state==='inactive')return;
          return target.requestData(...args);
        };
        if(prop==='stop')return(...args)=>{
          meta.stopRequested=true;
          clearInterval(meta.uiTimer);
          if(meta.evidence&&meta.unexpected&&target.state==='inactive'){
            meta.synthetic=true;
            queueMicrotask(()=>{
              try{target.dispatchEvent(new Event('stop'));}
              finally{
                meta.pretend=false;
                meta.unexpected=false;
                meta.synthetic=false;
              }
            });
            return;
          }
          return target.stop(...args);
        };
        const value=Reflect.get(target,prop,target);
        return typeof value==='function'?value.bind(target):value;
      }
    });

    native.addEventListener('stop',()=>{
      if(!meta.evidence||meta.stopRequested||meta.synthetic)return;
      meta.unexpected=true;
      meta.stoppedAt=Date.now();
      current={proxy,meta};
      keepStoppedUi(meta);
      maybeAutoFinish(meta);
    });

    if(meta.evidence)current={proxy,meta};
    return proxy;
  }

  function MilosMediaRecorder(stream,options){
    const native=arguments.length>1?new NativeMediaRecorder(stream,options):new NativeMediaRecorder(stream);
    return decorate(native);
  }

  Object.setPrototypeOf(MilosMediaRecorder,NativeMediaRecorder);
  MilosMediaRecorder.prototype=NativeMediaRecorder.prototype;
  window.MediaRecorder=MilosMediaRecorder;

  document.addEventListener('click',event=>{
    const control=event.target?.closest?.('[data-mve-status],[data-mve-action="next-ac"],[data-mve-action="finish-lo-here"],[data-mve-action="finish-opp"],[data-mve-action="stop-intro"]');
    const pair=current;
    if(!control||!pair?.meta?.unexpected)return;
    pair.meta.pretend=true;
    setTimeout(()=>{if(pair.meta.unexpected)pair.meta.pretend=false;},0);
  },true);

  window.MilosRecorderRecovery256=Object.freeze({version:VERSION,unexpectedStopRecovery:true});
})();
