(()=>{
'use strict';
const NativeMediaRecorder=window.MediaRecorder;
if(!NativeMediaRecorder)return;
const VERSION='2.63';
const LIVE_SAVE_BYPASS_MS=10000;
const FIX_TIMEOUT_MS=1800;
const FIX_MAX_BYTES=12*1024*1024;
const ANDROID_DRAIN_MS=1600;
const DATA_QUIET_MS=180;
const ANDROID_TIMESLICE_MS=1000;
const IS_ANDROID=/Android/i.test(navigator.userAgent||'');
let active=null;
function visible(){const l=document.getElementById('milosVideoObservationLayer');return !!(l&&!l.hidden);}
function fmt(ms){const s=Math.max(0,Math.floor(Number(ms||0)/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function paintUnexpected(meta){
  if(!meta?.unexpected)return;
  const l=document.getElementById('milosVideoObservationLayer');if(!l||l.hidden)return;
  const rec=l.querySelector('.mvo-rec-badge'),mic=l.querySelector('.mve-mic-badge'),timer=l.querySelector('#mveTimer'),hint=l.querySelector('#mveRecordingHint');
  if(rec)rec.textContent='REC STOPPED';
  if(mic)mic.textContent='CLIP HELD';
  if(timer&&meta.startedAt&&meta.stoppedAt)timer.textContent=fmt(meta.stoppedAt-meta.startedAt);
  if(hint)hint.textContent='Recording stopped unexpectedly. The captured clip is held. Choose a judgement and finish this LO.';
}
function deliverRecoveredStop(target,meta,reason){
  if(meta.stopSeen||meta.replayedStop)return;
  meta.replayedStop=true;
  meta.syntheticFinalised=true;
  meta.recoveryReason=reason||'tracks-ended';
  try{target.dispatchEvent(new Event('stop'));}catch(_){}
}
function endAndroidTracks(target,meta){
  const started=Date.now();
  const tracks=target.stream?.getTracks?.()||[];
  for(const track of tracks){try{track.stop();}catch(_){}}
  const check=()=>{
    if(meta.stopSeen||meta.replayedStop)return;
    const quiet=meta.lastDataAt?Date.now()-meta.lastDataAt:DATA_QUIET_MS;
    if(target.state==='inactive'){
      if(quiet<DATA_QUIET_MS){setTimeout(check,DATA_QUIET_MS-quiet);return;}
      deliverRecoveredStop(target,meta,'inactive-after-tracks-ended');
      return;
    }
    if(Date.now()-started>=ANDROID_DRAIN_MS){
      if(quiet<DATA_QUIET_MS){setTimeout(check,DATA_QUIET_MS-quiet);return;}
      deliverRecoveredStop(target,meta,'tracks-ended-timeout');
      return;
    }
    setTimeout(check,80);
  };
  setTimeout(check,DATA_QUIET_MS);
}
function wrap(native){
  const meta={evidence:visible(),startedAt:0,stoppedAt:0,stopRequested:false,stopSeen:false,unexpected:false,replayedStop:false,syntheticFinalised:false,recoveryReason:'',liveSaveUntil:0,lastDataAt:0};
  let proxy=null;
  proxy=new Proxy(native,{get(target,prop){
    if(prop==='state'){
      const actual=Reflect.get(target,prop,target);
      if(meta.syntheticFinalised)return'inactive';
      if(meta.evidence&&meta.unexpected&&!meta.stopRequested&&actual==='inactive')return'recording';
      return actual;
    }
    if(prop==='start')return(...args)=>{
      meta.startedAt=Date.now();
      if(IS_ANDROID&&meta.evidence&&args.length&&Number(args[0])>ANDROID_TIMESLICE_MS)args[0]=ANDROID_TIMESLICE_MS;
      return target.start(...args);
    };
    if(prop==='requestData')return(...args)=>{
      if(meta.evidence)return;
      if(target.state!=='recording')return;
      try{return target.requestData(...args);}catch(_){return;}
    };
    if(prop==='stop')return()=>{
      if(meta.stopRequested)return;
      meta.stopRequested=true;
      meta.liveSaveUntil=Date.now()+LIVE_SAVE_BYPASS_MS;
      if(target.state==='inactive'){
        queueMicrotask(()=>deliverRecoveredStop(target,meta,'already-inactive'));
        return;
      }
      if(IS_ANDROID&&meta.evidence){
        endAndroidTracks(target,meta);
        return;
      }
      return target.stop();
    };
    const value=Reflect.get(target,prop,target);
    return typeof value==='function'?value.bind(target):value;
  }});
  native.addEventListener('dataavailable',event=>{if(event?.data?.size)meta.lastDataAt=Date.now();});
  native.addEventListener('stop',()=>{
    meta.stopSeen=true;
    if(!meta.evidence||meta.stopRequested)return;
    meta.unexpected=true;
    meta.stoppedAt=Date.now();
    active={proxy,meta};
    paintUnexpected(meta);
  });
  if(meta.evidence)active={proxy,meta};
  return proxy;
}
function MilosMediaRecorder(stream,options){
  const native=arguments.length>1?new NativeMediaRecorder(stream,options):new NativeMediaRecorder(stream);
  return wrap(native);
}
Object.setPrototypeOf(MilosMediaRecorder,NativeMediaRecorder);
MilosMediaRecorder.prototype=NativeMediaRecorder.prototype;
MilosMediaRecorder.isTypeSupported=(type)=>{
  const value=String(type||'').toLowerCase();
  if(IS_ANDROID&&value.includes('video/mp4'))return false;
  return typeof NativeMediaRecorder.isTypeSupported==='function'?NativeMediaRecorder.isTypeSupported(type):true;
};
window.MediaRecorder=MilosMediaRecorder;
const nativeFix=window.ysFixWebmDuration;
if(typeof nativeFix==='function')window.ysFixWebmDuration=(blob,duration,options)=>{
  if(!(blob instanceof Blob))return Promise.resolve(blob);
  const liveSave=!!(active?.meta?.liveSaveUntil&&Date.now()<=active.meta.liveSaveUntil);
  if(liveSave||blob.size>FIX_MAX_BYTES)return Promise.resolve(blob);
  return new Promise(resolve=>{
    let done=false;
    const finish=value=>{if(done)return;done=true;resolve(value instanceof Blob?value:blob);};
    const timer=setTimeout(()=>finish(blob),FIX_TIMEOUT_MS);
    Promise.resolve().then(()=>nativeFix(blob,duration,options)).then(value=>{clearTimeout(timer);finish(value);}).catch(()=>{clearTimeout(timer);finish(blob);});
  });
};
document.addEventListener('click',event=>{
  const button=event.target?.closest?.('[data-mve-action="next-ac"],[data-mve-action="finish-lo-here"],[data-mve-action="finish-opp"],[data-mve-action="stop-intro"]');
  if(!button)return;
  if(active?.meta?.unexpected)paintUnexpected(active.meta);
  const isFinish=button.matches('[data-mve-action="finish-lo-here"],[data-mve-action="finish-opp"],[data-mve-action="stop-intro"]')||(button.matches('[data-mve-action="next-ac"]')&&/^Finish\b/i.test(String(button.textContent||'').trim()));
  if(!isFinish)return;
  const old=String(button.textContent||'').trim();
  button.disabled=true;
  button.textContent='Finishing recording…';
  setTimeout(()=>{if(button.isConnected&&button.textContent==='Finishing recording…'){button.disabled=false;button.textContent=old;}},6000);
},true);
const meta=document.querySelector?.('meta[name="milos-app-version"]');if(meta)meta.setAttribute('content',VERSION);
window.MilosRecorderFinalise258=Object.freeze({version:VERSION,androidWebmPreferred:IS_ANDROID,androidStopStrategy:IS_ANDROID?'end-media-tracks':'native-stop',androidTimesliceMs:ANDROID_TIMESLICE_MS,androidDrainMs:ANDROID_DRAIN_MS,observationRequestDataSuppressed:true,liveSaveBypassMs:LIVE_SAVE_BYPASS_MS,durationFixTimeoutMs:FIX_TIMEOUT_MS,durationFixMaxBytes:FIX_MAX_BYTES});
})();