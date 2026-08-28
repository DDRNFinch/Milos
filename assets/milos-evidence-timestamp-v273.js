(function (global) {
  "use strict";

  const VERSION = "2.73";
  const PLAYER_NAME = "00_OPEN_EVIDENCE.html";
  const bundle = global.MilosObservationBundle;
  if (!bundle || typeof bundle.makeZip !== "function" || typeof Blob === "undefined") return;

  const baseMakeZip = bundle.makeZip.bind(bundle);

  function repairScript() {
    return `
<script id="milosEvidenceTimestampRuntimeV273">
(function(){
  "use strict";
  const dataNode=document.getElementById("milosEvidenceDataV272");
  const criteriaBox=document.querySelector(".criteriaBox");
  const player=document.getElementById("player");
  const files=document.getElementById("files");
  const zipPicker=document.getElementById("zipPicker");
  const loadButton=document.getElementById("load");
  const status=document.getElementById("status");
  if(!dataNode||!criteriaBox||!player||!files||!zipPicker)return;

  let evidence=null;
  try{evidence=JSON.parse(dataNode.textContent||"{}")}catch(_){return}
  if(!evidence||!Array.isArray(evidence.criteria))return;

  let loadedFile=player.readyState>=1?(files.value||""):"";
  let pending=null;

  function zipReady(){return !!(zipPicker.files&&zipPicker.files.length)}
  function restrictedLocal(){return location.protocol==="content:"||/Android/i.test(navigator.userAgent||"")}
  function highlight(button){
    criteriaBox.querySelectorAll(".mev-timeline-row.is-active").forEach(function(node){node.classList.remove("is-active")});
    if(button)button.classList.add("is-active");
  }
  function setStatus(text){
    if(!status)return;
    status.textContent=text||"";
    status.className="status";
  }
  function stamp(seconds){
    const target=Math.max(0,Number(seconds)||0);
    return Math.floor(target/60).toString().padStart(2,"0")+":"+Math.floor(target%60).toString().padStart(2,"0");
  }
  function seek(seconds,code){
    const target=Math.max(0,Number(seconds)||0);
    try{
      if(Number.isFinite(player.duration)&&player.duration>0)player.currentTime=Math.min(target,player.duration);
      else player.currentTime=target;
    }catch(_){return false}
    setStatus(code?"Showing "+code+" at "+stamp(target)+".":"");
    return true;
  }
  function applyPending(){
    if(!pending||loadedFile!==pending.file||player.readyState<1)return;
    const target=pending;
    pending=null;
    seek(target.seconds,target.code);
  }
  function loadTarget(file,seconds,code){
    if(!file)return;
    pending={file:file,seconds:seconds,code:code||""};
    files.value=file;

    if(loadedFile===file&&player.readyState>=1){applyPending();return}

    if(!zipReady()&&restrictedLocal()){
      try{zipPicker.click()}catch(_){}
      return;
    }

    if(zipReady()){
      files.dispatchEvent(new Event("change",{bubbles:true}));
      return;
    }

    if(loadButton){
      try{loadButton.click()}catch(_){}
    }
  }

  criteriaBox.addEventListener("click",function(event){
    const criterionButton=event.target.closest&&event.target.closest("[data-open-evidence]");
    if(criterionButton){
      const item=evidence.criteria.find(function(entry){return entry.id===criterionButton.dataset.openEvidence});
      if(!item)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      highlight(criterionButton);
      loadTarget(item.file,item.seconds,item.code);
      return;
    }

    const clipButton=event.target.closest&&event.target.closest("[data-open-clip]");
    if(clipButton){
      const file=clipButton.dataset.file||"";
      if(!file)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      highlight(clipButton);
      loadTarget(file,0,"");
    }
  },true);

  player.addEventListener("loadedmetadata",function(){
    loadedFile=files.value||"";
    applyPending();
  });
  player.addEventListener("durationchange",applyPending);

  global.MilosEvidenceTimestampRuntime={version:"2.73",directSeek:true,preservesZipFlow:true};
})();
</script>`;
  }

  function patchHtml(html) {
    const text = String(html || "");
    if (!text.includes("Milos Evidence Viewer") || !text.includes("milosEvidenceViewerRuntimeV272") || text.includes("milosEvidenceTimestampRuntimeV273")) return text;
    return text.replace("</body>", `${repairScript()}\n</body>`);
  }

  async function makeZip(entries) {
    const result = await baseMakeZip(entries);
    const list = Array.isArray(result) ? result.slice() : result;
    if (!Array.isArray(list)) return result;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || String(entry.name || "").toLowerCase() !== PLAYER_NAME.toLowerCase() || !(entry.blob instanceof Blob)) continue;
      try {
        const html = await entry.blob.text();
        const next = patchHtml(html);
        if (next !== html) list[i] = Object.assign({}, entry, { blob: new Blob([next], { type: "text/html;charset=utf-8" }) });
      } catch (_) {}
    }
    return list;
  }

  global.MilosObservationBundle = Object.freeze(Object.assign({}, bundle, {
    makeZip,
    evidenceTimestampV273: true,
    directEvidenceSeek: true
  }));

  global.MilosEvidenceTimestamp273 = Object.freeze({
    version: VERSION,
    playerName: PLAYER_NAME,
    directSeek: true,
    preservesCameraStack: true
  });
})(typeof window !== "undefined" ? window : globalThis);
