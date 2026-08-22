(()=>{
"use strict";
const VERSION="2.15";
let queued=false;
function reviewForm(){return document.querySelector('form[data-form="review-targets"]')}
function sync(form){if(!form)return;const next=form.querySelector('[name="nextReviewDate"]');const date=String(next?.value||"").slice(0,10);form.querySelectorAll('[name="targetDue"]').forEach(input=>{if(date&&input.value!==date){input.value=date;input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}))}const label=input.closest("label");if(label){label.hidden=true;label.setAttribute("aria-hidden","true")}});const guide=form.querySelector(".milos-guidance p");if(guide)guide.textContent="Agree the actions now. Every action is due by the next review date shown below.";const nextLabel=next?.closest("label")?.querySelector("span");if(nextLabel)nextLabel.textContent="Next review date · all actions due"}
function run(){queued=false;sync(reviewForm())}
function queue(){if(queued)return;queued=true;requestAnimationFrame(run)}
document.addEventListener("input",event=>{const form=event.target?.closest?.('form[data-form="review-targets"]');if(!form||event.target?.name!=="nextReviewDate")return;sync(form)},true);
document.addEventListener("change",event=>{const form=event.target?.closest?.('form[data-form="review-targets"]');if(!form||event.target?.name!=="nextReviewDate")return;sync(form)},true);
document.addEventListener("submit",event=>{const form=event.target?.matches?.('form[data-form="review-targets"]')?event.target:null;if(form)sync(form)},true);
function start(){run();const root=document.getElementById("viewPanel")||document.getElementById("milosApp");if(!root||root.__milosReviewDeadlinesV215)return;root.__milosReviewDeadlinesV215=true;new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes||[]){if(node.nodeType===1&&(node.matches?.('form[data-form="review-targets"]')||node.querySelector?.('form[data-form="review-targets"]'))){queue();return}}}}).observe(root,{childList:true,subtree:true})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.MilosReviewDeadlines=Object.freeze({version:VERSION,sync});
})();