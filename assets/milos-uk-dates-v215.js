(()=>{
"use strict";
const VERSION="2.15";
const MONTHS={jan:"01",january:"01",feb:"02",february:"02",mar:"03",march:"03",apr:"04",april:"04",may:"05",jun:"06",june:"06",jul:"07",july:"07",aug:"08",august:"08",sep:"09",sept:"09",september:"09",oct:"10",october:"10",nov:"11",november:"11",dec:"12",december:"12"};
let queued=false;
function convert(text){return String(text??"").replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,(_,y,m,d)=>`${d}/${m}/${y}`).replace(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{4})\b/gi,(_,d,m,y)=>`${String(d).padStart(2,"0")}/${MONTHS[m.toLowerCase()]}/${y}`)}
function patch(root){if(!root||root.nodeType!==1)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(node.parentElement?.closest("script,style,textarea"))continue;const next=convert(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next}}
function run(){queued=false;patch(document.getElementById("milosApp"));document.querySelectorAll(".milos-v2-layer").forEach(patch)}
function queue(){if(queued)return;queued=true;requestAnimationFrame(run)}
function relevant(node){return node&&node.nodeType===1&&(node.id==="milosApp"||node.matches?.(".view-panel,.milos-page,.milos-v2-layer,.milos-history-list,.milos-complete-view,.milos-target-list")||node.querySelector?.(".milos-page,.milos-v2-layer,.milos-history-list,.milos-complete-view,.milos-target-list"))}
function start(){run();const root=document.body;if(!root||root.__milosUkDatesV215)return;root.__milosUkDatesV215=true;new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes||[]){if(relevant(node)){queue();return}}}}).observe(root,{childList:true,subtree:true})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.MilosUKDates=Object.freeze({version:VERSION,convert});
})();