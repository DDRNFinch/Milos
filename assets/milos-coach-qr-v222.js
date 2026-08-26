(()=>{
"use strict";
const VERSION="2.22";
const SINGLE_PREFIX="NISI:EVIA:PROGRESS:1:";
const MULTI_PREFIX="NISI:EVIA:PROGRESS:2:";
const MAX_PARTS=24;
const slots=new Map();
const QR=window.MilosQR;
if(!QR)return;
function receiveCoachFrame(raw){
  const text=String(raw||"").trim();
  if(!text.startsWith(MULTI_PREFIX))return{complete:true,raw:text,legacy:true};
  const match=text.match(/^NISI:EVIA:PROGRESS:2:([A-Za-z0-9_-]{1,80}):(\d+)\/(\d+):([A-Za-z0-9_-]+)$/);
  if(!match)throw Error("This Evia Coach Snapshot part is invalid.");
  const share=match[1],part=Number(match[2]),total=Number(match[3]),chunk=match[4];
  if(!part||!total||part>total||total>MAX_PARTS)throw Error("This Evia Coach Snapshot has an invalid part count.");
  let slot=slots.get(share);
  if(!slot||slot.total!==total){slot={total,parts:new Map(),createdAt:Date.now()};slots.set(share,slot)}
  slot.parts.set(part,chunk);
  const count=slot.parts.size;
  if(count<total)return{complete:false,share,part,total,count};
  const joined=Array.from({length:total},(_,i)=>slot.parts.get(i+1)||"").join("");
  if(!joined||Array.from({length:total},(_,i)=>slot.parts.has(i+1)).some(v=>!v))throw Error("A Coach Snapshot QR part is missing.");
  slots.delete(share);
  return{complete:true,share,total,count,raw:`${SINGLE_PREFIX}${joined}`};
}
function status(message,error=false){const node=document.getElementById("qrStatus")||document.querySelector(".milos-qr-status");if(node){node.textContent=message;node.classList.toggle("is-error",!!error)}}
const originalStartCamera=QR.startCamera;
function startCamera(video,onResult,onError){
  return originalStartCamera.call(QR,video,raw=>{
    let frame;
    try{frame=receiveCoachFrame(raw)}catch(error){status(error.message||"That Coach Snapshot part could not be read.",true);if(typeof onError==="function")onError(error);return}
    if(frame.complete){onResult(frame.raw);return}
    status(`Coach Snapshot ${frame.count} of ${frame.total} received — keep the camera pointed at Evia.`);
    setTimeout(()=>{if(document.body.contains(video))startCamera(video,onResult,onError)},180);
  },onError);
}
const originalParsePayload=QR.parsePayload;
function parsePayload(input){const text=String(input||"").trim();if(text.startsWith(MULTI_PREFIX))throw Error("This is one part of an Evia Coach Snapshot. Use camera scanning so Milos can collect every part automatically.");return originalParsePayload.call(QR,input)}
window.MilosQR=Object.freeze({...QR,startCamera,parsePayload});
window.MilosCoachQR=Object.freeze({version:VERSION,SINGLE_PREFIX,MULTI_PREFIX,receiveCoachFrame,pending:()=>slots.size});
})();
