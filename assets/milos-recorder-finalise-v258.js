(()=>{
'use strict';
const NativeMediaRecorder=window.MediaRecorder;
if(!NativeMediaRecorder)return;
const VERSION='2.58',STOP_TIMEOUT=1200,FIX_TIMEOUT=1800;
let active=null;
function visible(){const l=document.getElementById('milosVideoObservationLayer');return !!(l&&!l.hidden);}
function fmt(ms){const s=Math.max(0,Math.floor(Number(ms||0)/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function paint(meta){if(!meta?.unexpected)return;const l=document.getElementById('milosVideoObservationLayer');if(!l||l.hidden)return;const rec=l.querySelector('.mvo-rec-badge'),mic=l.querySelector('.mve-mic-badge'),timer=l.querySelector('#mveTimer'),hint=l.querySelector('#mveRecordingHint');if(rec)rec.textContent='REC STOPPED';if(mic)mic.textContent='CLIP HELD';if(timer&&meta.startedAt&&meta.stoppedAt)timer.textContent=fmt(meta.stoppedAt-meta.startedAt);if(hint)hint.textContent='Recording stopped unexpectedly. The clip is held. Choose a judgement and finish this LO.';}
function wrap(native){const meta={evidence:visible(),startedAt:0,stoppedAt:0,stopRequested:false,stopSeen:false,unexpected:false,synthetic:false,ui:0,timer:0};
 const proxy=new Proxy(native,{get(target,prop){
   if(prop==='state'){const actual=Reflect.get(target,prop,target);if(meta.evidence&&meta.unexpected&&actual==='inactive')return'recording';return actual;}
   if(prop==='start')return(...args)=>{meta.startedAt=Date.now();return target.start(...args);};
   if(prop==='requestData')return(...args)=>{if(target.state==='inactive')return;try{return target.requestData(...args);}catch(_){return;}};
   if(prop==='stop')return()=>{
     if(meta.stopRequested&&!meta.unexpected)return;
     meta.stopRequested=true;meta.stopSeen=false;clearInterval(meta.ui);clearTimeout(meta.timer);
     const syntheticStop=()=>{if(meta.stopSeen)return;meta.synthetic=true;try{target.dispatchEvent(new Event('stop'));}catch(_){}finally{meta.synthetic=false;meta.unexpected=false;}};
     if(meta.unexpected||target.state==='inactive'){queueMicrotask(syntheticStop);return;}
     meta.timer=setTimeout(syntheticStop,STOP_TIMEOUT);
     try{target.stop();}catch(_){syntheticStop();}
   };
   const v=Reflect.get(target,prop,target);return typeof v==='function'?v.bind(target):v;
 }});
 native.addEventListener('stop',()=>{meta.stopSeen=true;clearTimeout(meta.timer);if(!meta.evidence||meta.stopRequested||meta.synthetic)return;meta.unexpected=true;meta.stoppedAt=Date.now();active={proxy,meta};paint(meta);clearInterval(meta.ui);meta.ui=setInterval(()=>paint(meta),250);});
 if(meta.evidence)active={proxy,meta};return proxy;}
function MilosMediaRecorder(stream,options){const native=arguments.length>1?new NativeMediaRecorder(stream,options):new NativeMediaRecorder(stream);return wrap(native);}
Object.setPrototypeOf(MilosMediaRecorder,NativeMediaRecorder);MilosMediaRecorder.prototype=NativeMediaRecorder.prototype;window.MediaRecorder=MilosMediaRecorder;
const nativeFix=window.ysFixWebmDuration;
if(typeof nativeFix==='function')window.ysFixWebmDuration=(blob,duration,options)=>new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;resolve(value instanceof Blob?value:blob);};const timer=setTimeout(()=>finish(blob),FIX_TIMEOUT);Promise.resolve().then(()=>nativeFix(blob,duration,options)).then(value=>{clearTimeout(timer);finish(value);}).catch(()=>{clearTimeout(timer);finish(blob);});});
document.addEventListener('click',e=>{const b=e.target?.closest?.('[data-mve-status],[data-mve-action="next-ac"],[data-mve-action="finish-lo-here"],[data-mve-action="finish-opp"],[data-mve-action="stop-intro"]');if(!b)return;const pair=active;if(pair?.meta?.unexpected)paint(pair.meta);const isFinish=b.matches('[data-mve-action="finish-lo-here"],[data-mve-action="finish-opp"],[data-mve-action="stop-intro"]')||(b.matches('[data-mve-action="next-ac"]')&&/^Finish\b/i.test(String(b.textContent||'').trim()));if(!isFinish)return;if(b.dataset.milosSaving258==='1'){e.preventDefault();e.stopImmediatePropagation();return;}b.dataset.milosSaving258='1';const old=String(b.textContent||'').trim();b.textContent='Saving clip…';setTimeout(()=>{if(b.isConnected&&b.dataset.milosSaving258==='1'){delete b.dataset.milosSaving258;b.textContent=old;}},6000);},true);
window.MilosRecorderFinalise258=Object.freeze({version:VERSION,stopTimeoutMs:STOP_TIMEOUT,durationFixTimeoutMs:FIX_TIMEOUT});
})();
