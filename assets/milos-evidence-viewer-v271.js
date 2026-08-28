(function (global) {
  "use strict";

  const VERSION = "2.71";
  const PLAYER_NAME = "00_OPEN_EVIDENCE.html";
  const bundle = global.MilosObservationBundle;
  if (!bundle || typeof bundle.makeZip !== "function" || typeof Blob === "undefined") return;

  const baseMakeZip = bundle.makeZip.bind(bundle);

  function extractEvidenceJson(html) {
    const match = String(html || "").match(/const evidence=(\{[\s\S]*?\});\s*const files=/);
    if (!match || !match[1]) return "";
    try {
      JSON.parse(match[1]);
      return match[1];
    } catch (_) {
      return "";
    }
  }

  function viewerCss() {
    return `
<style id="milosEvidenceViewerV271">
.mev-ready .videoCol>.row:first-of-type,
.mev-ready .seek,
.mev-ready .help,
.mev-ready .criteriaHead,
.mev-ready .filter,
.mev-ready .criteriaList{display:none!important}
.mev-ready .viewer{grid-template-columns:minmax(0,1.45fr) minmax(350px,.82fr);gap:16px;align-items:start}
.mev-ready .videoCol{position:sticky;top:16px;align-self:start;min-width:0}
.mev-ready .videoCol>video,.mev-ready .videoCol>audio{margin:0;width:100%;background:#000}
.mev-ready .videoCol>.row:last-of-type{display:flex!important;margin:7px 0 0!important}
.mev-ready .criteriaBox{display:flex;flex-direction:column;max-height:calc(100vh - 32px);overflow:hidden;background:#fbfdff}
.mev-section-panel{display:flex;flex-direction:column;min-height:0;max-height:inherit;background:#fbfdff}
.mev-section-heading{padding:12px 13px 9px;border-bottom:1px solid var(--line)}
.mev-section-heading strong{display:block;color:var(--navy);font-size:17px}
.mev-section-heading small{display:block;color:var(--muted);font-size:12px;margin-top:2px;line-height:1.35}
.mev-section-list{overflow:auto;min-height:0;padding:5px}
.mev-section{border-bottom:1px solid #e7edf3}
.mev-section:last-child{border-bottom:0}
.mev-section-button{width:100%;border:0;background:transparent;color:#1f2937;border-radius:9px;padding:11px 10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;text-align:left;font:inherit;cursor:pointer}
.mev-section-button:hover,.mev-section-button:focus-visible,.mev-section.is-open>.mev-section-button{background:var(--pale);outline:none}
.mev-section-button strong{display:block;color:#1e3e63;font-size:14px;line-height:1.3}
.mev-section-button small{display:block;color:var(--muted);font-size:11px;margin-top:3px}
.mev-chevron{font-size:18px;color:#68809b;align-self:center;transition:transform .15s ease;font-style:normal}
.mev-section.is-open .mev-chevron{transform:rotate(90deg)}
.mev-section-items{display:none;padding:0 7px 8px}
.mev-section.is-open .mev-section-items{display:grid;gap:5px}
.mev-timeline-row{width:100%;border:1px solid #d9e3ee;background:#fff;border-radius:10px;padding:9px 10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;text-align:left;align-items:center;font:inherit;cursor:pointer;color:#1f2937}
.mev-timeline-row:hover,.mev-timeline-row:focus-visible,.mev-timeline-row.is-active{border-color:#8fb0d2;background:#f4f8fd;outline:none}
.mev-timeline-row b{display:block;color:#203f65;font-size:12.5px;line-height:1.25}
.mev-timeline-row span{display:block;font-size:11.5px;line-height:1.28;color:#46566c;margin-top:2px}
.mev-timeline-row time{display:inline-grid;place-items:center;min-width:58px;padding:7px 8px;border-radius:9px;background:var(--navy);color:#fff;font-weight:800;font-variant-numeric:tabular-nums}
.mev-zip-note{font-size:12px;color:#516173;margin:5px 0 0;text-align:center}
@media(max-width:820px){
  .mev-ready{background:#fff}
  .mev-ready .wrap{border:0;border-radius:0;box-shadow:none;padding:10px 10px 22px;max-width:none}
  .mev-ready h1{font-size:22px}
  .mev-ready .notice{font-size:12.5px;margin:9px 0}
  .mev-ready .zipPick{position:relative;z-index:7;margin-bottom:8px}
  .mev-ready .viewer{display:block;margin-top:0}
  .mev-ready .videoCol{position:sticky;top:0;z-index:6;background:#fff;padding:0 0 7px}
  .mev-ready .videoCol>video,.mev-ready .videoCol>audio{display:block;width:100%;height:min(42dvh,62vw);min-height:210px;max-height:420px;object-fit:contain;border-radius:0 0 12px 12px;background:#000}
  .mev-ready .videoCol>.row:last-of-type{display:flex!important;margin:5px 4px 0!important;padding:0 2px}
  .mev-ready .criteriaBox{margin-top:8px;max-height:none;border-radius:12px;overflow:hidden}
  .mev-section-panel{height:auto;max-height:none}
  .mev-section-list{overflow:visible;padding:4px}
  .mev-section-button{padding:12px 9px}
  .mev-section-items{padding:0 5px 9px}
  .mev-timeline-row{padding:10px 9px}
}
@media(max-width:520px){
  .mev-ready .wrap{padding-left:7px;padding-right:7px}
  .mev-ready .videoCol>video,.mev-ready .videoCol>audio{height:min(40dvh,68vw);min-height:190px}
}
</style>`;
  }

  function viewerScript() {
    return `
<script id="milosEvidenceViewerRuntimeV271">
(function(){
  "use strict";
  const VERSION="2.71";
  const dataNode=document.getElementById("milosEvidenceDataV271");
  const zipPicker=document.getElementById("zipPicker");
  const player=document.getElementById("player");
  const status=document.getElementById("status");
  const files=document.getElementById("files");
  const criteriaBox=document.querySelector(".criteriaBox");
  const originalList=document.getElementById("criteriaList");
  if(!dataNode||!zipPicker||!player||!status||!files||!criteriaBox||!originalList)return;

  let evidence=null;
  try{evidence=JSON.parse(dataNode.textContent||"{}")}catch(_){return}
  if(!evidence||!Array.isArray(evidence.clips)||!Array.isArray(evidence.criteria))return;

  function fmt(value){
    const n=Math.max(0,Math.floor(Number(value)||0)),h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=n%60;
    return h?String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
  }
  function esc(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(ch){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"}[ch];
    });
  }
  function isWitness(value){return value&&(value.source==="witness"||value.witnessName)}

  const clips=evidence.clips;
  const criteria=evidence.criteria;
  const sections=[];
  let pendingEvidenceId="";
  let pendingClipFile="";
  let activeEvidenceId="";
  let openSectionId="";

  const intros=clips.filter(function(clip){return clip&&clip.kind==="intro"&&!isWitness(clip)});
  if(intros.length){
    sections.push({id:"intro",label:"Introduction",subtitle:intros.length===1?"Recorded introduction":intros.length+" introduction clips",kind:"intro",clips:intros,items:[]});
  }

  const directCriteria=criteria.filter(function(item){return item&&!isWitness(item)});
  const loOrder=[];
  directCriteria.forEach(function(item){
    const lo=String(item.lo||"");
    if(lo&&!loOrder.includes(lo))loOrder.push(lo);
  });
  clips.forEach(function(clip){
    if(!clip||isWitness(clip)||clip.kind==="intro")return;
    const lo=String(clip.lo||"");
    if(lo&&!loOrder.includes(lo))loOrder.push(lo);
  });

  loOrder.forEach(function(lo){
    const loClips=clips.filter(function(clip){return clip&&!isWitness(clip)&&String(clip.lo||"")===lo});
    const loCriteria=directCriteria.filter(function(item){return String(item.lo||"")===lo});
    const title=(loClips[0]&&loClips[0].title)||(loCriteria[0]&&loCriteria[0].loTitle)||"Recorded learning outcome";
    sections.push({id:"lo-"+lo,label:"LO"+lo+" "+title,subtitle:loCriteria.length+" assessment criteria",kind:"lo",clips:loClips,items:loCriteria});
  });

  const otherClips=clips.filter(function(clip){return clip&&!isWitness(clip)&&clip.kind!=="intro"&&!String(clip.lo||"")});
  otherClips.forEach(function(clip,index){
    const itemCriteria=directCriteria.filter(function(item){return item.file===clip.file});
    sections.push({id:"clip-"+index,label:clip.title||"Recorded evidence",subtitle:itemCriteria.length?itemCriteria.length+" evidence criteria":"Recorded evidence",kind:"clip",clips:[clip],items:itemCriteria});
  });

  const witnessClips=clips.filter(isWitness);
  if(witnessClips.length){
    const witnessCriteria=criteria.filter(isWitness);
    sections.push({id:"witness",label:"Witness testimony",subtitle:witnessCriteria.length?witnessCriteria.length+" mapped criteria":"Recorded witness evidence",kind:"witness",clips:witnessClips,items:witnessCriteria});
  }

  if(!sections.length)return;

  function rowsFor(section){
    const rows=[];
    if(section.kind==="intro"){
      (section.clips||[]).forEach(function(clip,index){rows.push({type:"clip",clip:clip,label:"Introduction",index:index})});
      return rows;
    }
    if(section.kind==="witness"){
      (section.clips||[]).forEach(function(clip,index){
        if(clip.kind==="intro")rows.push({type:"clip",clip:clip,label:clip.witnessName?("Witness introduction · "+clip.witnessName):"Witness introduction",index:index});
      });
      (section.items||[]).forEach(function(item){rows.push({type:"criterion",item:item})});
      if(rows.length)return rows;
    }
    if(section.items&&section.items.length)return section.items.map(function(item){return {type:"criterion",item:item}});
    return (section.clips||[]).map(function(clip,index){
      const label=section.kind==="witness"?(clip.witnessName?("Witness · "+clip.witnessName):(clip.title||"Witness testimony")):(clip.title||"Recorded evidence");
      return {type:"clip",clip:clip,label:label,index:index};
    });
  }

  function render(){
    criteriaBox.innerHTML='<div class="mev-section-panel"><div class="mev-section-heading"><strong>Recorded evidence</strong><small>Choose a section, then tap an AC timestamp. The video stays in place while the evidence list scrolls.</small></div><div class="mev-section-list">'+sections.map(function(section){
      const rows=rowsFor(section);
      return '<section class="mev-section '+(section.id===openSectionId?'is-open':'')+'" data-section="'+esc(section.id)+'"><button type="button" class="mev-section-button" data-open-section="'+esc(section.id)+'"><span><strong>'+esc(section.label)+'</strong><small>'+esc(section.subtitle||"")+'</small></span><i class="mev-chevron">›</i></button><div class="mev-section-items">'+rows.map(function(row){
        if(row.type==="criterion"){
          const item=row.item;
          return '<button type="button" class="mev-timeline-row '+(item.id===activeEvidenceId?'is-active':'')+'" data-open-evidence="'+esc(item.id)+'"><span><b>'+esc(item.code)+'</b><span>'+esc(item.description||"Assessment criterion")+'</span></span><time>'+fmt(item.seconds)+'</time></button>';
        }
        const clip=row.clip||{};
        return '<button type="button" class="mev-timeline-row" data-open-clip="1" data-file="'+esc(clip.file||"")+'"><span><b>'+esc(row.label||"Recorded evidence")+'</b><span>'+esc(clip.title||clip.file||"Video clip")+'</span></span><time>00:00</time></button>';
      }).join("")+'</div></section>';
    }).join("")+'</div></div>';
  }

  function hiddenCriterion(id){
    return Array.from(originalList.querySelectorAll("[data-evidence-id]")).find(function(button){return button.dataset.evidenceId===id})||null;
  }
  function chooseFile(file){
    if(!file)return;
    const option=Array.from(files.options).find(function(item){return item.value===file});
    if(option)files.value=file;
  }
  function zipReady(){return !!(zipPicker.files&&zipPicker.files.length)}

  function openCriterion(id){
    const item=criteria.find(function(entry){return entry.id===id});
    if(!item)return;
    activeEvidenceId=id;
    pendingEvidenceId=id;
    pendingClipFile="";
    const section=sections.find(function(group){return (group.items||[]).some(function(entry){return entry.id===id})});
    if(section)openSectionId=section.id;
    chooseFile(item.file);
    render();
    const button=hiddenCriterion(id);
    if(button)button.click();
  }

  function openClip(file){
    if(!file)return;
    activeEvidenceId="";
    pendingEvidenceId="";
    pendingClipFile=file;
    chooseFile(file);
    render();
    files.dispatchEvent(new Event("change",{bubbles:true}));
    const reset=function(){try{player.currentTime=0}catch(_){}};
    player.addEventListener("loadedmetadata",reset,{once:true});
  }

  criteriaBox.addEventListener("click",function(event){
    const sectionButton=event.target.closest&&event.target.closest("[data-open-section]");
    if(sectionButton){
      const id=sectionButton.dataset.openSection;
      openSectionId=openSectionId===id?"":id;
      render();
      return;
    }
    const evidenceButton=event.target.closest&&event.target.closest("[data-open-evidence]");
    if(evidenceButton){openCriterion(evidenceButton.dataset.openEvidence);return}
    const clipButton=event.target.closest&&event.target.closest("[data-open-clip]");
    if(clipButton){openClip(clipButton.dataset.file);return}
  });

  function waitForZip(attempt){
    if(!zipReady()){
      if(attempt<40)setTimeout(function(){waitForZip(attempt+1)},100);
      return;
    }
    const loaded=String(player.src||"").startsWith("blob:")||/loaded from the zip|ready/i.test(status.textContent||"");
    if(!loaded){
      if(attempt<40)setTimeout(function(){waitForZip(attempt+1)},100);
      return;
    }
    if(pendingEvidenceId){
      const id=pendingEvidenceId;
      pendingEvidenceId="";
      openCriterion(id);
      return;
    }
    if(pendingClipFile){
      const file=pendingClipFile;
      pendingClipFile="";
      openClip(file);
    }
  }

  zipPicker.addEventListener("change",function(){setTimeout(function(){waitForZip(0)},50)});

  player.addEventListener("loadedmetadata",function(){
    if(!zipReady()){
      pendingEvidenceId="";
      pendingClipFile="";
    }
  });

  player.addEventListener("error",function(){
    setTimeout(function(){
      if(!zipReady()){
        status.textContent="This browser blocks automatic access to neighbouring video files. Tap Open evidence ZIP once; Milos will then load the recordings and timestamps automatically.";
        status.className="status error";
      }
    },0);
  });

  const notice=document.querySelector(".notice");
  if(notice)notice.innerHTML="<strong>IQA / EQA:</strong> on desktop, extracted evidence loads automatically where the browser permits local file access. On phones, tap <b>Open evidence ZIP</b> once; Milos then loads every recording and timestamp automatically from that ZIP.";
  const pickText=zipPicker.parentElement;
  if(pickText&&pickText.firstChild&&pickText.firstChild.nodeType===3)pickText.firstChild.textContent="Open evidence ZIP";
  const help=document.createElement("p");
  help.className="mev-zip-note";
  help.textContent="One ZIP selection unlocks Introduction, every recorded LO and Witness testimony.";
  if(pickText&&pickText.parentNode&&!document.querySelector(".mev-zip-note"))pickText.parentNode.insertBefore(help,pickText.nextSibling);

  openSectionId=sections[0].id;
  render();
  document.body.classList.add("mev-ready");

  global.MilosEvidenceViewerRuntime={version:VERSION,responsiveDesktop:true,stickyMobileVideo:true,desktopAutoRelative:true,phoneZipUnlock:true};
})();
</script>`;
  }

  function patchHtml(html) {
    if (!String(html || "").includes("Milos Evidence Viewer") || String(html || "").includes("milosEvidenceViewerV271")) return html;
    const evidenceJson = extractEvidenceJson(html);
    if (!evidenceJson) return html;
    let next = String(html);
    next = next.replace("</head>", `${viewerCss()}\n</head>`);
    next = next.replace("</body>", `<script type="application/json" id="milosEvidenceDataV271">${evidenceJson}</script>\n${viewerScript()}\n</body>`);
    return next;
  }

  async function makeZip(entries) {
    const list = Array.isArray(entries) ? entries.slice() : [];
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || String(entry.name || "").toLowerCase() !== PLAYER_NAME.toLowerCase() || !(entry.blob instanceof Blob)) continue;
      try {
        const html = await entry.blob.text();
        const nextHtml = patchHtml(html);
        if (nextHtml !== html) list[i] = Object.assign({}, entry, { blob: new Blob([nextHtml], { type: "text/html;charset=utf-8" }) });
      } catch (_) {}
    }
    return baseMakeZip(list);
  }

  global.MilosObservationBundle = Object.freeze(Object.assign({}, bundle, {
    makeZip,
    evidenceViewerV271: true,
    responsiveEvidenceViewer: true,
    desktopAutoRelativeMedia: true,
    phoneZipUnlock: true
  }));

  global.MilosEvidenceViewer271 = Object.freeze({
    version: VERSION,
    playerName: PLAYER_NAME,
    safeFallbackToTimeline: true,
    desktopStickyVideo: true,
    mobileStickyVideo: true,
    desktopAutoRelativeMedia: true,
    phoneRequiresOneFilePermission: true
  });
})(typeof window !== "undefined" ? window : globalThis);
