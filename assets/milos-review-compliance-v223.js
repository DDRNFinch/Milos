(()=>{
"use strict";
const VERSION="2.23";
const Core=window.MilosCore;
const Pdf=window.MilosPDF;
if(!Core||!Pdf)return;

const session={active:false,profileId:"",fields:{},targets:[],signaturesReady:false};
const ITEMS=[
  ["previousActions","Previous actions"],
  ["trainingEvidence","Training delivered and evidence"],
  ["overallProgress","Occupational progress"],
  ["learningProgress","OTJ / GLH progress and slippage"],
  ["apprenticeComments","Apprentice contribution"],
  ["employerContribution","Employer contribution"],
  ["supportWellbeing","Support and wellbeing"],
  ["trainingPlanChanges","Training-plan changes"],
  ["epaReadiness","EPA / assessment readiness"],
  ["assessorJudgement","Assessor judgement"],
  ["targets","Agreed dated actions"],
  ["nextReviewDate","Next review date"],
  ["providerComments","Final review summary"],
  ["signatures","Required signatures"]
];

function text(value){return String(value==null?"":value).trim()}
function value(scope,name){return text(scope?.elements?.[name]?.value??scope?.querySelector?.(`[name="${name}"]`)?.value)}
function escapeHtml(value){return text(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]))}
function setText(node,next){if(node&&node.textContent!==String(next))node.textContent=String(next)}
function reset(profileId){session.active=true;session.profileId=profileId||"";session.fields={};session.targets=[];session.signaturesReady=false}
function supportWellbeing(){return !!(text(session.fields.supportNeeds)&&text(session.fields.wellbeing))}
function targetsReady(){return session.targets.length>0&&session.targets.every(item=>text(item.title)&&text(item.dueDate))}
function check(key){
  if(key==="supportWellbeing")return supportWellbeing();
  if(key==="targets")return targetsReady();
  if(key==="signatures")return !!session.signaturesReady;
  return !!text(session.fields[key]);
}
function missing(includeSignatures=true){return ITEMS.filter(([key])=>includeSignatures||key!=="signatures").filter(([key])=>!check(key))}
function count(){return ITEMS.reduce((total,[key])=>total+(check(key)?1:0),0)}

function setMessage(message,tone="error"){
  const panel=document.querySelector(".milos-compliance-panel");
  if(!panel)return;
  let note=panel.querySelector(".milos-compliance-message");
  if(!note){note=document.createElement("p");note.className="milos-compliance-message";panel.appendChild(note)}
  setText(note,message);note.dataset.tone=tone;
}

function captureMeeting(form){
  const contribution=value(form,"employerContribution");
  if(!contribution)throw Error("Record the employer contribution, or how they were given the opportunity to contribute.");
  ["reviewDate","meetingFormat","providerName","employerName","employerAttendance","employerContribution"].forEach(name=>session.fields[name]=value(form,name));
}
function captureProgress(form){
  const epa=value(form,"epaReadiness");
  if(!epa)throw Error("Record EPA or assessment readiness before continuing.");
  ["previousActions","trainingEvidence","overallProgress","learningProgress","qualifications","trainingPlanChanges","overallStatus","epaReadiness"].forEach(name=>session.fields[name]=value(form,name));
}
function captureSupport(form){
  const judgement=value(form,"assessorJudgement");
  if(!judgement)throw Error("Record the assessor judgement before continuing.");
  ["supportNeeds","wellbeing","apprenticeComments","employerComments","providerComments","assessorJudgement"].forEach(name=>session.fields[name]=value(form,name));
}
function captureTargets(form){
  const rows=Array.from(form.querySelectorAll(".milos-target-edit-row"));
  const targets=rows.map(row=>({title:value(row,"targetTitle"),dueDate:value(row,"targetDue"),code:value(row,"targetCode")})).filter(item=>item.title||item.dueDate||item.code);
  if(!targets.length)throw Error("Add at least one agreed action.");
  if(targets.some(item=>!item.title||!item.dueDate))throw Error("Every agreed action needs a description and due date.");
  const next=value(form,"nextReviewDate");
  if(!next)throw Error("Choose the next review date.");
  session.targets=targets;session.fields.nextReviewDate=next;
}

function patchRequired(input,labelText){
  if(!input)return;
  input.required=true;
  const label=input.closest("label");
  if(label){label.classList.add("is-required");const span=label.querySelector(":scope > span");if(span&&labelText)setText(span,labelText)}
}
function fieldMarkup(name,label,placeholder,rows=4){
  const stored=escapeHtml(session.fields[name]||"");
  return `<label class="milos-field is-required" data-compliance-field="${name}"><span>${label}</span><textarea required name="${name}" rows="${rows}" placeholder="${placeholder}">${stored}</textarea></label>`;
}
function insertAfter(reference,node){reference?.parentNode?.insertBefore(node,reference.nextSibling)}
function makeNode(html){const box=document.createElement("div");box.innerHTML=html.trim();return box.firstElementChild}

function patchMeeting(form){
  const input=form.elements.employerContribution;
  patchRequired(input,"Employer contribution / opportunity offered");
  if(input&&!input.dataset.complianceHelp){input.dataset.complianceHelp="1";input.placeholder="Record what the employer contributed. If they could not contribute, record how and when they were invited."}
}
function patchProgress(form){
  if(!form.querySelector('[name="epaReadiness"]')){
    const overall=form.elements.overallStatus?.closest("label")||form.querySelector('button[type="submit"]');
    const node=makeNode(fieldMarkup("epaReadiness","EPA / assessment readiness","Record EPA readiness, gateway position, assessment preparation, or the relevant qualification assessment position where EPA does not apply.",4));
    overall?.parentNode?.insertBefore(node,overall);
  }
}
function patchSupport(form){
  if(!form.querySelector('[name="assessorJudgement"]')){
    const provider=form.elements.providerComments?.closest("label")||form.querySelector('button[type="submit"]');
    const node=makeNode(fieldMarkup("assessorJudgement","Assessor judgement","Give the assessor's professional judgement on progress, risks, readiness and the priority before the next review.",4));
    provider?.parentNode?.insertBefore(node,provider);
  }
  const provider=form.elements.providerComments;
  if(provider){const label=provider.closest("label");const span=label?.querySelector(":scope > span");if(span)setText(span,"Final review summary");provider.placeholder="Summarise the agreed position, key discussion points and what happens next."}
}
function patchTargets(form){
  Array.from(form.querySelectorAll('[name="targetDue"]')).forEach(input=>patchRequired(input,"Due date"));
  if(!form.querySelector(".milos-compliance-target-note")){
    const note=document.createElement("p");note.className="milos-form-note milos-compliance-target-note";note.textContent="Each agreed action needs a due date before the review can be completed.";
    insertAfter(form.querySelector('[data-action="review-add-target"]'),note);
  }
}

function stripMarkup(){return `<div class="milos-compliance-strip" data-compliance-strip><span>Review check</span><strong>${count()}/${ITEMS.length}</strong><small>required elements complete</small></div>`}
function patchStrip(form){if(form.querySelector("[data-compliance-strip]"))return;const heading=form.querySelector(".milos-wizard-heading");if(heading)insertAfter(heading,makeNode(stripMarkup()))}
function panelMarkup(){
  return `<section class="milos-compliance-panel" aria-label="Review completion check"><div class="milos-compliance-heading"><span>Review completion check</span><strong>${count()}/${ITEMS.length}</strong></div><div class="milos-compliance-list">${ITEMS.map(([key,label])=>`<div class="milos-compliance-row${check(key)?" is-complete":""}" data-compliance-item="${key}"><i aria-hidden="true">${check(key)?"✓":""}</i><span>${label}</span><small>${check(key)?"Complete":"Required"}</small></div>`).join("")}</div><p class="milos-compliance-message" data-tone="info"></p></section>`;
}
function refreshPanel(panel){
  if(!panel)return;
  setText(panel.querySelector(".milos-compliance-heading strong"),`${count()}/${ITEMS.length}`);
  ITEMS.forEach(([key])=>{
    const row=panel.querySelector(`[data-compliance-item="${key}"]`);if(!row)return;
    const complete=check(key);row.classList.toggle("is-complete",complete);setText(row.querySelector("i"),complete?"✓":"");setText(row.querySelector("small"),complete?"Complete":"Required");
  });
  const contentMissing=missing(false);
  const message=contentMissing.length?`${contentMissing.length} review element${contentMissing.length===1?" is":"s are"} still missing.`:session.signaturesReady?"All required review elements are complete.":"Review content complete. Add the required signatures to finish.";
  const note=panel.querySelector(".milos-compliance-message");setText(note,message);if(note)note.dataset.tone=contentMissing.length?"error":"info";
}
function refreshFinal(){
  const button=document.getElementById("completeReviewButton");if(!button)return;
  session.signaturesReady=!button.disabled;
  let panel=document.querySelector(".milos-compliance-panel");
  if(!panel){const summary=document.querySelector(".milos-review-summary");const fresh=makeNode(panelMarkup());if(summary)insertAfter(summary,fresh);panel=fresh}
  refreshPanel(panel);
  const contentMissing=missing(false);
  button.classList.toggle("is-compliance-locked",contentMissing.length>0);
  button.setAttribute("aria-disabled",button.disabled||contentMissing.length?"true":"false");
  if(contentMissing.length)button.title=`Complete ${contentMissing.length} required review element${contentMissing.length===1?"":"s"} first`;else button.removeAttribute("title");
}

function patch(){
  const meeting=document.querySelector('form[data-form="review-meeting"]');
  const progress=document.querySelector('form[data-form="review-progress"]');
  const support=document.querySelector('form[data-form="review-support"]');
  const targets=document.querySelector('form[data-form="review-targets"]');
  [meeting,progress,support,targets].filter(Boolean).forEach(patchStrip);
  if(meeting)patchMeeting(meeting);if(progress)patchProgress(progress);if(support)patchSupport(support);if(targets)patchTargets(targets);
  if(document.getElementById("completeReviewButton"))refreshFinal();
}

function captureSubmit(event){
  const form=event.target;if(!(form instanceof HTMLFormElement))return;
  const kind=form.dataset.form||"";if(!kind.startsWith("review-"))return;
  try{
    if(kind==="review-meeting")captureMeeting(form);
    else if(kind==="review-progress")captureProgress(form);
    else if(kind==="review-support")captureSupport(form);
    else if(kind==="review-targets")captureTargets(form);
  }catch(error){event.preventDefault();event.stopImmediatePropagation();const target=form.querySelector(":invalid")||form.querySelector("textarea, input, select");target?.focus();return}
}
function captureClick(event){
  const button=event.target.closest?.("[data-action]");if(!button)return;
  const action=button.dataset.action;
  if(action==="start-review"){reset(button.dataset.id||"");return}
  if(action==="review-complete"){
    const outstanding=missing(false);
    if(outstanding.length){event.preventDefault();event.stopImmediatePropagation();setMessage(`Complete: ${outstanding.map(item=>item[1]).join(", ")}.`);refreshFinal()}
  }
}

function recordComplete(source,extras,key){
  if(key==="supportWellbeing")return !!(text(source.supportNeeds)&&text(source.wellbeing));
  if(key==="targets")return Array.isArray(source.targets)&&source.targets.length>0&&source.targets.every(item=>text(item.title)&&text(item.dueDate));
  if(key==="epaReadiness")return !!extras.epaReadiness;
  if(key==="assessorJudgement")return !!extras.assessorJudgement;
  if(key==="signatures")return !!(source.signatures?.provider?.dataUrl&&source.signatures?.apprentice?.dataUrl);
  return !!text(source[key]);
}
function complianceRecord(record){
  const source=record||{};
  const extras={epaReadiness:text(session.fields.epaReadiness||source.epaReadiness),assessorJudgement:text(session.fields.assessorJudgement||source.assessorJudgement)};
  const rows=ITEMS.map(([key,label])=>({key,label,complete:recordComplete(source,extras,key)}));
  return Object.assign({},source,extras,{reviewCompliance:{version:VERSION,checkedAt:Date.now(),complete:rows.every(item=>item.complete),items:rows}});
}
const originalSaveReview=Core.saveReview.bind(Core);
window.MilosCore=Object.freeze(Object.assign({},Core,{saveReview(record){return originalSaveReview(complianceRecord(record))}}));

function wrapLines(doc,value,width){return doc.splitTextToSize(text(value)||"Not recorded",width)}
function addCompliancePage(doc,review){
  if(!review)return;
  doc.addPage();doc.setFont("helvetica","bold");doc.setFontSize(15);doc.text("Review compliance record",16,22);
  doc.setFont("helvetica","normal");doc.setFontSize(8);doc.text(`Milos ${VERSION} · completion evidence`,16,28);doc.setDrawColor(44,133,247);doc.line(16,33,194,33);
  let y=43;
  const paragraph=(label,body)=>{const lines=wrapLines(doc,body,174);if(y+lines.length*4.3+13>278){doc.addPage();y=22}doc.setFont("helvetica","bold");doc.setFontSize(7);doc.text(label.toUpperCase(),16,y);y+=5;doc.setFont("helvetica","normal");doc.setFontSize(8.2);doc.text(lines,16,y,{lineHeightFactor:1.3});y+=lines.length*4.3+8};
  paragraph("EPA / assessment readiness",review.epaReadiness);paragraph("Assessor judgement",review.assessorJudgement);paragraph("Final review summary",review.providerComments);
  const compliance=review.reviewCompliance;
  if(compliance&&Array.isArray(compliance.items)){
    if(y+28>278){doc.addPage();y=22}doc.setFont("helvetica","bold");doc.setFontSize(7);doc.text("COMPLETION CHECK",16,y);y+=6;doc.setFont("helvetica","normal");doc.setFontSize(7.6);
    compliance.items.forEach(item=>{if(y>278){doc.addPage();y=22}doc.text(`${item.complete?"[x]":"[ ]"} ${text(item.label)}`,18,y);y+=5});
  }
}
const originalReviewPdf=Pdf.reviewPdf.bind(Pdf);
async function reviewPdf(review){
  const args=Array.from(arguments);const Real=window.jspdf&&window.jspdf.jsPDF;if(typeof Real!=="function")return originalReviewPdf(...args);
  function ComplianceJsPDF(){const doc=Reflect.construct(Real,Array.from(arguments));const save=doc.save.bind(doc);let added=false;doc.save=function(name){if(!added){addCompliancePage(doc,review);added=true}return save(name)};return doc}
  ComplianceJsPDF.prototype=Real.prototype;try{ComplianceJsPDF.API=Real.API}catch(_){ }
  window.jspdf.jsPDF=ComplianceJsPDF;try{return await originalReviewPdf(...args)}finally{window.jspdf.jsPDF=Real}
}
window.MilosPDF=Object.freeze(Object.assign({},Pdf,{reviewPdf}));
window.MilosReviewCompliance=Object.freeze({version:VERSION,items:ITEMS.map(item=>item[1]),missing:()=>missing().map(item=>item[1]),count});

document.addEventListener("submit",captureSubmit,true);
document.addEventListener("click",captureClick,true);
document.addEventListener("DOMContentLoaded",()=>{
  const root=document.getElementById("milosApp")||document.body;
  const observer=new MutationObserver(()=>patch());observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["disabled"]});patch();
},{once:true});
})();
