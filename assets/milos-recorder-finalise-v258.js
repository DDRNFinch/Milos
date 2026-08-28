(()=>{
'use strict';
const NativeMediaRecorder=window.MediaRecorder;
if(!NativeMediaRecorder)return;
const VERSION='2.61';
const STOP_GRACE_MS=1800;
const FORCE_TRACKS_MS=4500;
const HARD_STOP_MS=7000;
const DATA_QUIET_MS=140;
const LIVE_SAVE_BYPASS_MS=10000;
const FIX_TIMEOUT_MS=1800;
const FIX_MAX_BYTES=12*1024*1024;
let active=null;
function visible(){const l=document.getElementById('milosVideoObservationLayer');return !!(l&&!l.hidden);}
function fmt(ms){const s=Math.max(0,Math.floor(Number(ms||0)/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function paint(meta){if(!meta?.unexpected)return;const l=document.getElementById('milosVideoObservationLayer');if(!l||l.hidden)return;const rec=l.querySelector('.mvo-rec-badge'),mic=l.querySelector('.mve-mic-badge'),timer=l.querySelector('#mveTimer'),hint=l.querySelector('#mveRecordingHint');if(rec)rec.textContent='REC STOPPED';if(mic)mic.textContent='CLIP HELD';if(timer&&meta.startedAt&&meta.stoppedAt)timer.textContent=fmt(meta.stoppedAt-meta.startedAt);if(hint)hint.textContent='Recording stopped unexpectedly. The captured clip is held. Choose a judgement and finish this LO.';}
function dispatchRecoveredStop(target,meta,reason){if(meta.stopSeen)return;meta.synthetic=true;meta.recoveryReason=reason||'recovered';try{target.dispatchEvent(new Event('stop'));}catch(_){}finally{meta.synthetic=false;meta.unexpected=false;meta.recoveryWindow=false;}}
function startStopWatch(target,stream,meta){const requestedAt=Date.now();
 const check=()=>{
   if(meta.stopSeen)return;
   const elapsed=Date.now()-requestedAt;
   if(target.state==='inactive'){
     const quiet=meta.lastDataAt?Date.now()-meta.lastDataAt:DATA_QUIET_MS;
     if(quiet<DATA_QUIET_MS){meta.stopTimer=setTimeout(check,DATA_QUIET_MS-quiet);return;}
     dispatchRecoveredStop(target,meta,'inactive-without-stop-event');return;
   }
   if(elapsed>=FORCE_TRACKS_MS&&!meta.tracksForced){meta.tracksForced=true;try{target.requestData();}catch(_){}try{stream?.getTracks?.().forEach(track=>{try{track.stop();}catch(_){}});}catch(_){} }
   if(elapsed>=HARD_STOP_MS){
     try{target.requestData();}catch(_){}
     meta.stopTimer=setTimeout(()=>{if(!meta.stopSeen)dispatchRecoveredStop(target,meta,'hard-stop-timeout');},DATA_QUIET_MS);
     return;
   }
   meta.stopTimer=setTimeout(check,100);
 };
 meta.stopTimer=setTimeout(check,STOP_GRACE_MS);
}
function wrap(native,stream){const meta={evidence:visible(),startedAt:0,stoppedAt:0,stopRequested:false,stopSeen:false,unexpected:false,synthetic:false,recoveryWindow:false,recoveryReason:'',tracksForced:false,lastDataAt:0,liveSaveUntil:0,stopTimer:0,uiTimer:0};
 const proxy=new Proxy(native,{get(target,prop){
   if(prop==='state'){const actual=Reflect.get(target,prop,target);if(meta.evidence&&meta.unexpected&&meta.recoveryWindow&&actual==='inactive')return'recording';return actual;}
   if(prop==='start')return(...args)=>{meta.startedAt=Date.now();return target.start(...args);};
   if(prop==='requestData')return(...args)=>{if(target.state!=='recording')return;try{return target.requestData(...args);}catch(_){return;}};
   if(prop==='stop')return()=>{
     if(meta.stopRequested)return;
     meta.stopRequested=true;meta.liveSaveUntil=Date.now()+LIVE_SAVE_BYPASS_MS;clearInterval(meta.uiTimer);clearTimeout(meta.stopTimer);meta.stopSeen=false;
     if(meta.unexpected&&target.state==='inactive'){queueMicrotask(()=>dispatchRecoveredStop(target,meta,'already-stopped'));return;}
     try{target.stop();}catch(_){
       if(target.state==='inactive'){queueMicrotask(()=>dispatchRecoveredStop(target,meta,'stop-threw-after-inactive'));return;}
     }
     startStopWatch(target,stream,meta);
   };
   const v=Reflect.get(target,prop,target);return typeof v==='function'?v.bind(target):v;
 }});
 native.addEventListener('dataavailable',event=>{if(event?.data?.size)meta.lastDataAt=Date.now();});
 native.addEventListener('stop',()=>{meta.stopSeen=true;clearTimeout(meta.stopTimer);if(!meta.evidence||meta.stopRequested||meta.synthetic)return;meta.unexpected=true;meta.stoppedAt=Date.now();active={proxy,meta};paint(meta);clearInterval(meta.uiTimer);meta.uiTimer=setInterval(()=>paint(meta),250);});
 if(meta.evidence)active={proxy,meta};return proxy;}
function MilosMediaRecorder(stream,options){const native=arguments.length>1?new NativeMediaRecorder(stream,options):new NativeMediaRecorder(stream);return wrap(native,stream);}
Object.setPrototypeOf(MilosMediaRecorder,NativeMediaRecorder);MilosMediaRecorder.prototype=NativeMediaRecorder.prototype;window.MediaRecorder=MilosMediaRecorder;
const nativeFix=window.ysFixWebmDuration;
if(typeof nativeFix==='function')window.ysFixWebmDuration=(blob,duration,options)=>{
  if(!(blob instanceof Blob))return Promise.resolve(blob);
  const liveSave=!!(active?.meta?.liveSaveUntil&&Date.now()<=active.meta.liveSaveUntil);
  if(liveSave||blob.size>FIX_MAX_BYTES)return Promise.resolve(blob);
  return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;resolve(value instanceof Blob?value:blob);};const timer=setTimeout(()=>finish(blob),FIX_TIMEOUT_MS);Promise.resolve().then(()=>nativeFix(blob,duration,options)).then(value=>{clearTimeout(timer);finish(value);}).catch(()=>{clearTimeout(timer);finish(blob);});});
};
document.addEventListener('click',e=>{const b=e.target?.closest?.('[data-mve-status],[data-mve-action="next-ac"],[data-mve-action="finish-lo-here"],[data-mve-action="finish-opp"],[data-mve-action="stop-intro"]');if(!b)return;const pair=active;if(pair?.meta?.unexpected){pair.meta.recoveryWindow=true;paint(pair.meta);setTimeout(()=>{if(pair.meta.unexpected)pair.meta.recoveryWindow=false;},0);}const isFinish=b.matches('[data-mve-action="finish-lo-here"],[data-mve-action="finish-opp"],[data-mve-action="stop-intro"]')||(b.matches('[data-mve-action="next-ac"]')&&/^Finish\b/i.test(String(b.textContent||'').trim()));if(!isFinish)return;if(b.dataset.milosSaving258==='1'){e.preventDefault();e.stopImmediatePropagation();return;}b.dataset.milosSaving258='1';const old=String(b.textContent||'').trim();b.textContent='Saving clip…';setTimeout(()=>{if(b.isConnected&&b.dataset.milosSaving258==='1'){delete b.dataset.milosSaving258;b.textContent=old;}},8000);},true);
window.MilosRecorderFinalise258=Object.freeze({version:VERSION,stopGraceMs:STOP_GRACE_MS,forceTracksMs:FORCE_TRACKS_MS,hardStopMs:HARD_STOP_MS,liveSaveBypassMs:LIVE_SAVE_BYPASS_MS,durationFixTimeoutMs:FIX_TIMEOUT_MS,durationFixMaxBytes:FIX_MAX_BYTES});
})();
