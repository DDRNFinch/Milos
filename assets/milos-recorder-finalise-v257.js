(()=>{
'use strict';
const Base=window.MediaRecorder;if(!Base)return;
const VERSION='2.57',STOP_TIMEOUT=900;
function wrap(rec){let stopSeen=false,stopTimer=0,stopCalled=false;const markStop=()=>{stopSeen=true;clearTimeout(stopTimer);};rec.addEventListener('stop',markStop);
return new Proxy(rec,{get(target,prop){if(prop==='stop')return()=>{if(stopCalled)return;stopCalled=true;stopSeen=false;clearTimeout(stopTimer);stopTimer=setTimeout(()=>{if(stopSeen)return;try{target.dispatchEvent(new Event('stop'));}catch(_){ }},STOP_TIMEOUT);try{return target.stop();}catch(err){if(!stopSeen){try{target.dispatchEvent(new Event('stop'));}catch(_){ }}return;}};const value=Reflect.get(target,prop,target);return typeof value==='function'?value.bind(target):value;}});}
function SafeMediaRecorder(stream,options){const rec=arguments.length>1?new Base(stream,options):new Base(stream);return wrap(rec);}
Object.setPrototypeOf(SafeMediaRecorder,Base);SafeMediaRecorder.prototype=Base.prototype;window.MediaRecorder=SafeMediaRecorder;
document.addEventListener('click',e=>{const b=e.target?.closest?.('[data-mve-action="next-ac"],[data-mve-action="finish-lo-here"],[data-mve-action="finish-opp"],[data-mve-action="stop-intro"]');if(!b)return;const text=String(b.textContent||'').trim();const finishes=b.dataset.mveAction!=='next-ac'||/^Finish\b/i.test(text);if(!finishes)return;if(b.dataset.milosSaving257==='1'){e.preventDefault();e.stopImmediatePropagation();return;}b.dataset.milosSaving257='1';b.dataset.milosOldText=text;b.textContent='Saving clip…';setTimeout(()=>{if(b.isConnected){delete b.dataset.milosSaving257;b.textContent=b.dataset.milosOldText||text;}},3500);},true);
window.MilosRecorderFinalise257=Object.freeze({version:VERSION,stopEventTimeoutMs:STOP_TIMEOUT});
})();
