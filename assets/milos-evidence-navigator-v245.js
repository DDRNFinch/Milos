(function (global) {
  "use strict";

  const VERSION = "2.45";
  const PLAYER_NAME = "00_OPEN_EVIDENCE.html";
  const bundle = global.MilosObservationBundle;
  if (!bundle || typeof bundle.makeZip !== "function" || typeof Blob === "undefined") return;

  const baseMakeZip = bundle.makeZip.bind(bundle);

  function viewerCss() {
    return `
<style id="milosEvidenceNavigatorV245">
.notice{margin-bottom:10px}
.videoCol>.row,.seek,.help,.criteriaHead,.filter,.criteriaList{display:none!important}
.viewer{grid-template-columns:minmax(0,1.45fr) minmax(330px,.85fr);gap:14px}
.videoCol{min-width:0}
.videoCol>video,.videoCol>audio{margin:0}
.videoCol>.row:last-of-type{display:flex!important;margin:7px 0 0!important}
.mve-section-panel{height:100%;display:flex;flex-direction:column;min-height:0;background:#fbfdff}
.mve-section-heading{padding:12px 13px 9px;border-bottom:1px solid var(--line)}
.mve-section-heading strong{display:block;color:var(--navy);font-size:17px}
.mve-section-heading small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.mve-section-list{overflow:auto;min-height:0;padding:5px}
.mve-section{border-bottom:1px solid #e7edf3}
.mve-section:last-child{border-bottom:0}
.mve-section-button{width:100%;border:0;background:transparent;color:#1f2937;border-radius:9px;padding:11px 10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;text-align:left;font:inherit;cursor:pointer}
.mve-section-button:hover,.mve-section-button:focus-visible,.mve-section.is-open>.mve-section-button{background:var(--pale);outline:none}
.mve-section-button strong{display:block;color:#1e3e63;font-size:14px;line-height:1.3}
.mve-section-button small{display:block;color:var(--muted);font-size:11px;margin-top:3px}
.mve-chevron{font-size:18px;color:#68809b;align-self:center;transition:transform .15s ease}
.mve-section.is-open .mve-chevron{transform:rotate(90deg)}
.mve-section-items{display:none;padding:0 7px 8px}
.mve-section.is-open .mve-section-items{display:grid;gap:5px}
.mve-timeline-row{width:100%;border:1px solid #d9e3ee;background:#fff;border-radius:10px;padding:9px 10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;text-align:left;align-items:center;font:inherit;cursor:pointer;color:#1f2937}
.mve-timeline-row:hover,.mve-timeline-row:focus-visible,.mve-timeline-row.is-active{border-color:#8fb0d2;background:#f4f8fd;outline:none}
.mve-timeline-row b{display:block;color:#203f65;font-size:12.5px;line-height:1.25}
.mve-timeline-row span{display:block;font-size:11.5px;line-height:1.28;color:#46566c;margin-top:2px}
.mve-timeline-row time{display:inline-grid;place-items:center;min-width:58px;padding:7px 8px;border-radius:9px;background:var(--navy);color:#fff;font-weight:800;font-variant-numeric:tabular-nums}
.mve-zip-note{font-size:12px;color:#516173;margin:5px 0 0;text-align:center}
@media(max-width:820px){
  body{padding:0;background:#fff}
  .wrap{border:0;border-radius:0;box-shadow:none;padding:10px 10px 22px;max-width:none}
  h1{font-size:22px}
  .notice{font-size:12.5px;margin:9px 0}
  .zipPick{position:relative;z-index:7;margin-bottom:8px}
  .viewer{display:block;margin-top:0}
  .videoCol{position:sticky;top:0;z-index:6;background:#fff;padding:0 0 7px}
  .videoCol>video,.videoCol>audio{display:block;width:100%;height:min(42dvh,62vw);min-height:210px;max-height:420px;object-fit:contain;border-radius:0 0 12px 12px;background:#000}
  .videoCol>.row:last-of-type{display:flex!important;margin:5px 4px 0!important;padding:0 2px}
  .criteriaBox{margin-top:8px;border-radius:12px}
  .mve-section-panel{height:auto;max-height:none}
  .mve-section-list{overflow:visible;padding:4px}
  .mve-section-button{padding:12px 9px}
  .mve-section-items{padding:0 5px 9px}
  .mve-timeline-row{padding:10px 9px}
}
@media(max-width:520px){
  .wrap{padding-left:7px;padding-right:7px}
  .videoCol>video,.videoCol>audio{height:min(40dvh,68vw);min-height:190px}
}
</style>`;
  }

  function viewerScript() {
    return `
<script id="milosEvidenceNavigatorRuntimeV245">
(function(){
  "use strict";
  const VERSION="2.45";
  const zipPicker=document.getElementById("zipPicker");
  const player=document.getElementById("player");
  const status=document.getElementById("status");
  const files=document.getElementById("files");
  const criteriaBox=document.querySelector(".criteriaBox");
  const originalList=document.getElementById("criteriaList");
  if(!zipPicker||!player||!status||!files||!criteriaBox||!originalList)return;

  function fmt(value){
    const n=Math.max(0,Math.floor(Number(value)||0)),h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=n%60;
    return h?String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
  }
  function esc(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(ch){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch];
    });
  }
  function readEvidence(){
    const script=Array.from(document.scripts).find(function(item){return item!==document.currentScript&&String(item.textContent||"").includes("const evidence=")});
    if(!script)return null;
    const match=String(script.textContent||"").match(/const evidence=(\{[\s\S]*?\});\s*const files=/);
    if(!match)return null;
    try{return JSON.parse(match[1])}catch(_){return null}
  }

  const evidence=readEvidence();
  if(!evidence)return;

  let pendingEvidenceId="";
  let activeEvidenceId="";
  let openSectionId="";

  const notice=document.querySelector(".notice");
  if(notice)notice.innerHTML="<strong>IQA / EQA:</strong> open the complete evidence ZIP once. Milos reads every recording directly from the ZIP on this device — the videos are not uploaded anywhere.";
  const pickText=zipPicker.parentElement;
  if(pickText&&pickText.firstChild&&pickText.firstChild.nodeType===3)pickText.firstChild.textContent="Open evidence ZIP";
  const help=document.createElement("p");
  help.className="mve-zip-note";
  help.textContent="One ZIP selection unlocks Introduction, every recorded LO and Witness testimony.";
  if(pickText&&pickText.parentNode)pickText.parentNode.insertBefore(help,pickText.nextSibling);

  try{player.pause();player.removeAttribute("src");player.load()}catch(_){}
  status.textContent="Open the evidence ZIP to start.";
  status.className="status";

  const clips=Array.isArray(evidence.clips)?evidence.clips:[];
  const criteria=Array.isArray(evidence.criteria)?evidence.criteria:[];

  function isWitness(value){return value&&(value.source==="witness"||value.witnessName)}
  function directIntroClips(){return clips.filter(function(clip){return clip&&clip.kind==="intro"&&!isWitness(clip)})}
  function witnessClips(){return clips.filter(isWitness)}

  const sections=[];
  const intros=directIntroClips();
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

  const directOtherClips=clips.filter(function(clip){return clip&&!isWitness(clip)&&clip.kind!=="intro"&&!String(clip.lo||"")});
  directOtherClips.forEach(function(clip,index){
    const itemCriteria=directCriteria.filter(function(item){return item.file===clip.file});
    sections.push({id:"clip-"+index,label:clip.title||"Recorded evidence",subtitle:itemCriteria.length?itemCriteria.length+" evidence criteria":"Recorded evidence",kind:"clip",clips:[clip],items:itemCriteria});
  });

  const witnesses=witnessClips();
  if(witnesses.length){
    const witnessCriteria=criteria.filter(isWitness);
    sections.push({id:"witness",label:"Witness testimony",subtitle:witnessCriteria.length?witnessCriteria.length+" mapped criteria":"Recorded witness evidence",kind:"witness",clips:witnesses,items:witnessCriteria});
  }

  if(!sections.length){
    criteriaBox.innerHTML='<div class="empty">No recorded video sections were found in this evidence package.</div>';
    return;
  }

  function fallbackRows(section){
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
    criteriaBox.innerHTML='<div class="mve-section-panel"><div class="mve-section-heading"><strong>Recorded evidence</strong><small>Select an LO, then tap the AC timestamp you want to review.</small></div><div class="mve-section-list">'+sections.map(function(section){
      const rows=fallbackRows(section);
      return '<section class="mve-section '+(section.id===openSectionId?'is-open':'')+'" data-section="'+esc(section.id)+'"><button type="button" class="mve-section-button" data-open-section="'+esc(section.id)+'"><span><strong>'+esc(section.label)+'</strong><small>'+esc(section.subtitle||"")+'</small></span><i class="mve-chevron">›</i></button><div class="mve-section-items">'+rows.map(function(row){
        if(row.type==="criterion"){
          const item=row.item;
          return '<button type="button" class="mve-timeline-row '+(item.id===activeEvidenceId?'is-active':'')+'" data-open-evidence="'+esc(item.id)+'"><span><b>'+esc(item.code)+'</b><span>'+esc(item.description||"Assessment criterion")+'</span></span><time>'+fmt(item.seconds)+'</time></button>';
        }
        const clip=row.clip||{};
        const key=section.id+"-clip-"+row.index;
        return '<button type="button" class="mve-timeline-row" data-open-clip="'+esc(key)+'" data-file="'+esc(clip.file||"")+'"><span><b>'+esc(row.label||"Recorded evidence")+'</b><span>'+esc(clip.title||clip.file||"Video clip")+'</span></span><time>00:00</time></button>';
      }).join("")+'</div></section>';
    }).join("")+'</div></div>';
  }

  openSectionId=sections[0].id;
  render();

  function hiddenCriterion(id){
    return Array.from(originalList.querySelectorAll("[data-evidence-id]")).find(function(button){return button.dataset.evidenceId===id})||null;
  }
  function zipReady(){
    return !!(zipPicker.files&&zipPicker.files.length);
  }
  function chooseFile(file){
    if(!file)return;
    const option=Array.from(files.options).find(function(item){return item.value===file});
    if(option)files.value=file;
  }
  function openCriterion(id){
    const item=criteria.find(function(entry){return entry.id===id});
    if(!item)return;
    activeEvidenceId=id;
    const section=sections.find(function(group){return (group.items||[]).some(function(entry){return entry.id===id})});
    if(section)openSectionId=section.id;
    chooseFile(item.file);
    render();
    if(!zipReady()){
      pendingEvidenceId=id;
      status.textContent="Open the evidence ZIP once, then this AC will open at "+fmt(item.seconds)+".";
      status.className="status";
      return;
    }
    const button=hiddenCriterion(id);
    if(button)button.click();
  }
  function openClip(file){
    if(!file)return;
    chooseFile(file);
    activeEvidenceId="";
    render();
    if(!zipReady()){
      status.textContent="Open the evidence ZIP once, then this recording will open.";
      status.className="status";
      return;
    }
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
    if(!pendingEvidenceId)return;
    if((String(player.src||"").startsWith("blob:")||/loaded from the zip|ready/i.test(status.textContent||""))&&zipReady()){
      const id=pendingEvidenceId;pendingEvidenceId="";openCriterion(id);return;
    }
    if(attempt<40)setTimeout(function(){waitForZip(attempt+1)},100);
  }
  zipPicker.addEventListener("change",function(){setTimeout(function(){waitForZip(0)},50)});

  player.addEventListener("error",function(){
    setTimeout(function(){
      if(!zipReady()){
        status.textContent="Open the evidence ZIP to view the recorded clips.";
        status.className="status";
      }
    },0);
  });

  global.MilosEvidenceNavigatorRuntime={version:VERSION,hierarchicalSections:true,stickyMobileVideo:true,zipOnlyMediaAccess:true};
})();
</script>`;
  }

  function patchHtml(html) {
    if (!html.includes("Milos Evidence Viewer") || html.includes("milosEvidenceNavigatorV245")) return html;
    let next = html.replace(
      'if(expectedMedia.length)loadRelative(expectedMedia[0]);else setStatus("No video files were listed in this evidence package.",true);',
      'if(expectedMedia.length)setStatus("Open the evidence ZIP to start.");else setStatus("No video files were listed in this evidence package.",true);'
    );
    next = next.replace("</head>", `${viewerCss()}\n</head>`);
    next = next.replace("</body>", `${viewerScript()}\n</body>`);
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
    evidenceNavigatorV245: true,
    hierarchicalEvidenceSections: true,
    zipOnlyEvidenceMedia: true
  }));

  global.MilosEvidenceNavigator = Object.freeze({
    version: VERSION,
    playerName: PLAYER_NAME,
    introductionInSectionList: true,
    learningOutcomePages: true,
    witnessSection: true,
    stickyMobileVideo: true,
    noManualVideoUpload: true
  });
})(typeof window !== "undefined" ? window : globalThis);
