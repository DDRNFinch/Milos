(function (global) {
  "use strict";

  const prior = global.MilosObservationBundle;
  const core = global.MilosCore;
  if (!prior || typeof prior.makeZip !== "function" || !core || typeof Blob === "undefined") return;

  const VERSION = "2.42";
  const PLAYER_NAME = "00_OPEN_EVIDENCE.html";
  const STATUS = Object.freeze({
    competent: "Competent",
    action: "Competent with actions",
    further: "Further evidence required",
  });

  function clean(value, max) {
    const text = String(value == null ? "" : value).trim().replace(/\s+/g, " ");
    return text.slice(0, max || 2000);
  }

  function normName(value) {
    return clean(value, 300).toLowerCase();
  }

  function isMedia(entry) {
    const blob = entry && entry.blob;
    const type = String(blob && blob.type || "").toLowerCase();
    const name = String(entry && entry.name || "").toLowerCase();
    return type.startsWith("video/") || type.startsWith("audio/") ||
      /\.(mp4|m4v|mov|webm|mkv|avi|m4a|aac|mp3|wav|ogg|opus)$/i.test(name);
  }

  function mediaName(item) {
    return clean(item && (item.name || item.filename), 300);
  }

  function observations() {
    try {
      const list = typeof core.getObservations === "function" ? core.getObservations() : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function legacyWitnesses(record, all) {
    if (!record || record.mode === "witness") return [];
    const end = Number(record.sessionEndedAt || record.completedAt || 0);
    return (all || []).filter((item) =>
      item && item.id !== record.id &&
      item.mode === "witness" &&
      item.profileId === record.profileId &&
      item.observationDate === record.observationDate &&
      String(item.unitNumber || "") === String(record.unitNumber || "") &&
      Math.abs(Number(item.sessionStartedAt || item.createdAt || 0) - end) <= 4 * 60 * 60 * 1000
    );
  }

  function exportView(record, all) {
    const legacy = legacyWitnesses(record, all);
    if (!legacy.length) return record;
    return Object.assign({}, record, {
      witnessEvidence: [
        ...(record.witnessEvidence || []),
        ...legacy.map((item) => ({
          witnessName: item.witnessName || "",
          witnessRole: item.witnessRole || "",
          location: item.location || "",
          activityObserved: item.activityObserved || "",
          startedAt: item.sessionStartedAt || item.createdAt || 0,
          endedAt: item.sessionEndedAt || item.completedAt || 0,
          videoTimeline: item.videoTimeline || [],
          media: item.media || [],
          criteria: item.criteria || [],
          mappedEvidence: item.mappedEvidence || [],
          actions: item.actions || "",
        })),
      ],
      media: [
        ...(record.media || []),
        ...legacy.flatMap((item) => item.media || []),
      ].filter((item, index, list) =>
        item && item.id &&
        list.findIndex((other) => other && other.id === item.id) === index
      ),
    });
  }

  function recordMediaNames(record) {
    const names = [];
    (record && record.media || []).forEach((item) => {
      const name = mediaName(item);
      if (name) names.push(name);
    });
    (record && record.videoTimeline || []).forEach((clip) => {
      const name = mediaName(clip);
      if (name) names.push(name);
    });
    (record && record.witnessEvidence || []).forEach((witness) => {
      (witness.media || []).forEach((item) => {
        const name = mediaName(item);
        if (name) names.push(name);
      });
      (witness.videoTimeline || []).forEach((clip) => {
        const name = mediaName(clip);
        if (name) names.push(name);
      });
    });
    return [...new Set(names.map(normName).filter(Boolean))];
  }

  function findRecord(entries) {
    const entryNames = new Set((entries || []).filter(isMedia).map((entry) => normName(entry.name)).filter(Boolean));
    if (!entryNames.size) return null;

    const all = observations();
    let best = null;
    let bestScore = -1;

    for (const original of all) {
      if (!original || !(original.videoEvidenceV231 || original.videoObservationV1 || Array.isArray(original.videoTimeline))) continue;
      const record = exportView(original, all);
      const names = recordMediaNames(record);
      const matches = names.filter((name) => entryNames.has(name)).length;
      if (!matches) continue;

      const exact = names.length > 0 && names.length === entryNames.size && names.every((name) => entryNames.has(name));
      if (!exact) continue;
      const recent = Number(record.completedAt || record.sessionEndedAt || record.createdAt || 0) / 1e13;
      const score = matches * 100 + recent;

      if (score > bestScore) {
        best = record;
        bestScore = score;
      }
    }
    return best;
  }

  function clipMediaName(clip, record) {
    const direct = mediaName(clip);
    if (direct) return direct;
    const id = clip && clip.mediaId;
    if (!id) return "";
    const item = (record && record.media || []).find((media) => media && media.id === id);
    return mediaName(item);
  }

  function statusLabel(value) {
    const key = String(value || "");
    return STATUS[key] || clean(value, 120) || "Decision recorded";
  }

  function collectTimelines(record) {
    const list = [];
    (record && record.videoTimeline || []).forEach((clip) => list.push(Object.assign({ witnessName: "" }, clip)));
    (record && record.witnessEvidence || []).forEach((witness) => {
      (witness.videoTimeline || []).forEach((clip) => list.push(Object.assign({
        source: clip && clip.source || "witness",
        witnessName: witness.witnessName || "",
      }, clip)));
    });

    const seen = new Set();
    return list.filter((clip) => {
      if (!clip) return false;
      const key = [
        clip.mediaId || "",
        clip.filename || "",
        Number(clip.startedAt || 0),
        clip.kind || "",
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
  }

  function criteriaDescriptionMap(record) {
    const map = new Map();
    (record && record.criteria || []).forEach((item) => {
      if (item && item.code) map.set(String(item.code), clean(item.description || item.title, 1800));
    });
    (record && record.witnessEvidence || []).forEach((witness) => {
      (witness.criteria || []).forEach((item) => {
        if (item && item.code && !map.has(String(item.code))) map.set(String(item.code), clean(item.description || item.title, 1800));
      });
    });
    return map;
  }

  function buildEvidenceIndex(record, entries) {
    const mediaSet = new Set((entries || []).filter(isMedia).map((entry) => normName(entry.name)));
    const descriptions = criteriaDescriptionMap(record);
    const criteria = [];
    const clips = [];

    collectTimelines(record).forEach((clip, clipIndex) => {
      const file = clipMediaName(clip, record);
      if (!file || !mediaSet.has(normName(file))) return;
      const acs = Array.isArray(clip.acTimeline) ? clip.acTimeline : [];
      clips.push({
        file,
        kind: clean(clip.kind || "video", 40),
        lo: clip.lo == null ? "" : String(clip.lo),
        title: clean(clip.loTitle || clip.opportunityTitle || (clip.kind === "intro" ? "Introduction" : "Evidence clip"), 500),
        durationSeconds: Math.max(0, Number(clip.durationSeconds || 0)),
        source: clean(clip.source || "assessor", 60),
        witnessName: clean(clip.witnessName || "", 180),
      });

      acs.forEach((ac, acIndex) => {
        if (!ac || !ac.code) return;
        const startMs = Math.max(0, Number(ac.startedOffsetMs || 0));
        const endMs = Math.max(startMs, Number(ac.endedOffsetMs == null ? startMs : ac.endedOffsetMs));
        const code = clean(ac.code, 100);
        criteria.push({
          id: `${clipIndex}-${acIndex}-${code}`,
          code,
          description: clean(ac.title || descriptions.get(code) || "Assessment criterion", 1800),
          status: statusLabel(ac.status),
          file,
          seconds: startMs / 1000,
          endSeconds: endMs / 1000,
          lo: clip.lo == null ? "" : String(clip.lo),
          loTitle: clean(clip.loTitle || "", 500),
          source: clean(clip.source || "assessor", 60),
          witnessName: clean(clip.witnessName || "", 180),
        });
      });
    });

    criteria.sort((a, b) => {
      const fileDiff = clips.findIndex((clip) => clip.file === a.file) - clips.findIndex((clip) => clip.file === b.file);
      return fileDiff || a.seconds - b.seconds || a.code.localeCompare(b.code, undefined, { numeric: true });
    });

    return {
      version: VERSION,
      courseTitle: clean(record && record.courseTitle, 500),
      observationTitle: clean(record && (record.jobTitle || record.opportunityTitle || (record.unitNumber ? `Unit ${record.unitNumber}` : "Video observation")), 500),
      observationDate: clean(record && record.observationDate, 80),
      criteriaLabel: record && record.courseType === "ksb" ? "Evidence criteria" : "Assessment criteria",
      criteria,
      clips,
    };
  }

  function playerHtml(mediaNames, evidence) {
    const namesJson = JSON.stringify(mediaNames).replace(/</g, "\\u003c");
    const evidenceJson = JSON.stringify(evidence).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Milos Evidence Viewer</title>
<style>
:root{font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#f3f6fa;--navy:#254973;--line:#dbe3ec;--pale:#eef5fc;--muted:#5b6674}*{box-sizing:border-box}body{margin:0;padding:20px}.wrap{max-width:1180px;margin:auto;background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 8px 28px rgba(30,55,85,.08)}h1{margin:0 0 4px;color:var(--navy);font-size:26px}h2{margin:0;color:var(--navy);font-size:18px}p{line-height:1.45}.summary{color:var(--muted);margin:0 0 14px}.notice{background:var(--pale);border-left:4px solid var(--navy);padding:11px 13px;margin:14px 0;border-radius:8px}.row{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:10px 0}select,input[type=text],button,.pick{font:inherit;border:1px solid #c7d1dc;border-radius:9px;padding:9px 11px;background:#fff}select{min-width:260px;flex:1}button,.pick{cursor:pointer;font-weight:700}.primary{background:var(--navy);color:#fff;border-color:var(--navy)}.zipPick{display:block;text-align:center;font-size:16px;padding:12px 15px}.pick input{display:none}.viewer{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,.8fr);gap:18px;align-items:start;margin-top:14px}.videoCol{min-width:0}video,audio{width:100%;background:#000;border-radius:12px;margin-top:4px;min-height:56px}.seek{display:grid;grid-template-columns:auto 110px auto auto;gap:8px;align-items:center;margin-top:10px}.seek input[type=range]{grid-column:1/-1;width:100%}.time{font-variant-numeric:tabular-nums;font-weight:700;color:#42556b}.status{min-height:22px;color:var(--muted)}.error{color:#9b1c1c;font-weight:700}.criteriaBox{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fbfdff}.criteriaHead{padding:13px 14px;border-bottom:1px solid var(--line);display:flex;gap:8px;justify-content:space-between;align-items:center}.criteriaHead span{font-size:13px;color:var(--muted)}.filter{padding:10px 12px;border-bottom:1px solid var(--line)}.filter input{width:100%;padding:9px 10px;border:1px solid #c7d1dc;border-radius:8px;font:inherit}.criteriaList{max-height:570px;overflow:auto}.criterion{padding:11px 12px;border-bottom:1px solid #e7edf3;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start}.criterion:last-child{border-bottom:0}.criterion.is-active{background:var(--pale)}.criterion strong{display:block;color:#1e3e63;margin-bottom:3px}.criterion p{margin:0 0 5px;font-size:13px;line-height:1.35}.criterion small{display:block;color:var(--muted);font-size:11.5px;line-height:1.35}.stamp{background:var(--navy);border-color:var(--navy);color:#fff;min-width:68px;font-variant-numeric:tabular-nums;padding:8px 9px}.stamp:hover,.stamp:focus{outline:2px solid #8db5df;outline-offset:2px}.empty{padding:18px;color:var(--muted);text-align:center}.help{font-size:13px;color:#516173;margin-bottom:0}.sourceWitness{color:#6b4b00;font-weight:700}@media(max-width:820px){body{padding:9px}.wrap{padding:14px}.viewer{grid-template-columns:1fr}.criteriaList{max-height:none}.seek{grid-template-columns:1fr 1fr}.seek input[type=range]{grid-column:1/-1}.seek input[type=text]{width:100%}select{min-width:0;width:100%}.criterion{grid-template-columns:minmax(0,1fr) auto}}
</style>
</head>
<body>
<main class="wrap">
<h1>Milos Evidence Viewer</h1>
<p class="summary" id="summary"></p>
<div class="notice"><strong>IQA / EQA:</strong> choose the complete evidence ZIP once, then tap any AC timestamp. Milos loads the correct video and jumps straight to that point. Everything stays on this device.</div>
<label class="pick primary zipPick">Open complete evidence ZIP<input id="zipPicker" type="file" accept=".zip,application/zip,application/x-zip-compressed"></label>
<div class="viewer">
<section class="videoCol">
<div class="row"><select id="files" aria-label="Evidence video"></select><button id="load" class="primary" type="button">Load selected video</button><label class="pick">Choose video manually<input id="picker" type="file" accept="video/*,audio/*"></label></div>
<video id="player" controls playsinline preload="metadata"></video>
<div class="seek">
<button id="back" type="button">−10 seconds</button>
<input id="jump" type="text" inputmode="numeric" placeholder="04:18" aria-label="Timestamp">
<button id="go" class="primary" type="button">Go to timestamp</button>
<button id="forward" type="button">+10 seconds</button>
<input id="scrub" type="range" min="0" max="1000" value="0" aria-label="Video timeline">
</div>
<div class="row"><span class="time" id="clock">00:00 / 00:00</span><span class="status" id="status"></span></div>
</section>
<section class="criteriaBox">
<div class="criteriaHead"><h2 id="criteriaTitle">Assessment criteria</h2><span id="criteriaCount"></span></div>
<div class="filter"><input id="criteriaFilter" type="search" placeholder="Find an AC, LO or wording" aria-label="Filter assessment criteria"></div>
<div id="criteriaList" class="criteriaList"></div>
</section>
</div>
<p class="help">The timestamp buttons use the exact start point recorded for each criterion. The manual timestamp box and video selector remain available as a fallback.</p>
</main>
<script>
(function(){
  "use strict";
  const expectedMedia=${namesJson};
  const evidence=${evidenceJson};
  const files=document.getElementById("files"),player=document.getElementById("player"),status=document.getElementById("status"),scrub=document.getElementById("scrub"),clock=document.getElementById("clock"),jump=document.getElementById("jump"),criteriaList=document.getElementById("criteriaList"),criteriaFilter=document.getElementById("criteriaFilter");
  let objectUrl="",zipFile=null,zipEntries=new Map(),durationProbe=false,currentMedia="",pendingSeek=null,activeId="";

  function fmt(value){const n=Math.max(0,Math.floor(Number(value)||0)),h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=n%60;return h?String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
  function parseTime(value){const parts=String(value||"").trim().split(":").map(Number);if(!parts.length||parts.some(function(n){return !Number.isFinite(n)||n<0}))return NaN;if(parts.length===1)return parts[0];if(parts.length===2)return parts[0]*60+parts[1];if(parts.length===3)return parts[0]*3600+parts[1]*60+parts[2];return NaN}
  function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(ch){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"}[ch]})}
  function setStatus(text,error){status.textContent=text||"";status.className=error?"status error":"status"}
  function clearObject(){if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=""}}
  function mediaMime(name){const value=String(name||"").toLowerCase();if(/\.webm$/.test(value))return"video/webm";if(/\.(mp4|m4v)$/.test(value))return"video/mp4";if(/\.mov$/.test(value))return"video/quicktime";if(/\.mp3$/.test(value))return"audio/mpeg";if(/\.wav$/.test(value))return"audio/wav";if(/\.(ogg|opus)$/.test(value))return"audio/ogg";if(/\.(m4a|aac)$/.test(value))return"audio/mp4";return"application/octet-stream"}
  function updateClock(){const finite=Number.isFinite(player.duration)&&player.duration>0;clock.textContent=fmt(player.currentTime)+" / "+(finite?fmt(player.duration):"00:00");if(finite)scrub.value=String(Math.round((player.currentTime/player.duration)*1000))}
  function resetPlayer(){durationProbe=false;scrub.value="0";clock.textContent="00:00 / 00:00"}
  function populate(names,preferred){files.innerHTML="";(names||[]).forEach(function(name){const option=document.createElement("option");option.value=name;option.textContent=name;files.appendChild(option)});if(preferred&&Array.from(files.options).some(function(option){return option.value===preferred}))files.value=preferred}
  function mediaLabel(item){const lo=item.lo?"LO"+item.lo:"";const source=item.source==="witness"||item.witnessName?("Witness"+(item.witnessName?" · "+item.witnessName:"")):"Direct observation";return[lo,source,item.status].filter(Boolean).join(" · ")}
  function renderCriteria(){
    const query=String(criteriaFilter.value||"").toLowerCase().trim();
    const items=(evidence.criteria||[]).filter(function(item){return !query||[item.code,item.description,item.lo,item.loTitle,item.status,item.witnessName].join(" ").toLowerCase().includes(query)});
    document.getElementById("criteriaTitle").textContent=evidence.criteriaLabel||"Assessment criteria";
    document.getElementById("criteriaCount").textContent=items.length+" of "+(evidence.criteria||[]).length;
    if(!items.length){criteriaList.innerHTML='<div class="empty">No matching criteria.</div>';return}
    criteriaList.innerHTML=items.map(function(item){
      const range=Number(item.endSeconds)>Number(item.seconds)?(" · to "+fmt(item.endSeconds)):"";
      const witness=item.source==="witness"||item.witnessName;
      return '<div class="criterion '+(item.id===activeId?'is-active':'')+'" data-row-id="'+esc(item.id)+'"><div><strong>'+esc(item.code)+'</strong><p>'+esc(item.description)+'</p><small class="'+(witness?'sourceWitness':'')+'">'+esc(mediaLabel(item))+range+'</small></div><button type="button" class="stamp" data-evidence-id="'+esc(item.id)+'" aria-label="Play '+esc(item.code)+' at '+fmt(item.seconds)+'">'+fmt(item.seconds)+'</button></div>'
    }).join("");
  }
  document.getElementById("summary").textContent=[evidence.courseTitle,evidence.observationTitle,evidence.observationDate].filter(Boolean).join(" · ");
  renderCriteria();
  criteriaFilter.addEventListener("input",renderCriteria);
  populate(expectedMedia,"");

  function seekPending(){
    if(!pendingSeek||!Number.isFinite(player.duration)||player.duration<=0)return false;
    const target=Math.min(Math.max(0,Number(pendingSeek.seconds)||0),player.duration);
    try{player.currentTime=target}catch(_){}
    jump.value=fmt(target);
    setStatus("Showing "+pendingSeek.code+" at "+fmt(target)+".");
    player.play().catch(function(){});
    pendingSeek=null;updateClock();return true;
  }
  function loadRelative(name){
    clearObject();resetPlayer();currentMedia=name||files.value;if(!currentMedia)return;
    files.value=currentMedia;setStatus("Trying "+currentMedia+" …");player.src=encodeURIComponent(currentMedia);player.load()
  }

  async function readZipDirectory(file){
    const tailSize=Math.min(file.size,65557),tailStart=file.size-tailSize,tail=new Uint8Array(await file.slice(tailStart).arrayBuffer()),tailView=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
    let eocd=-1;for(let i=tail.length-22;i>=0;i--){if(tailView.getUint32(i,true)===0x06054b50){eocd=i;break}}
    if(eocd<0)throw new Error("This does not look like a complete ZIP file.");
    const count=tailView.getUint16(eocd+10,true),centralSize=tailView.getUint32(eocd+12,true),centralOffset=tailView.getUint32(eocd+16,true);
    if(count===65535||centralSize===0xffffffff||centralOffset===0xffffffff)throw new Error("ZIP64 evidence packages are not supported by this viewer.");
    const centralBytes=new Uint8Array(await file.slice(centralOffset,centralOffset+centralSize).arrayBuffer()),view=new DataView(centralBytes.buffer,centralBytes.byteOffset,centralBytes.byteLength),decoder=new TextDecoder("utf-8");
    const map=new Map();let pos=0;
    for(let n=0;n<count&&pos+46<=centralBytes.length;n++){
      if(view.getUint32(pos,true)!==0x02014b50)break;
      const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),compressedSize=view.getUint32(pos+20,true),size=view.getUint32(pos+24,true),nameLen=view.getUint16(pos+28,true),extraLen=view.getUint16(pos+30,true),commentLen=view.getUint16(pos+32,true),localOffset=view.getUint32(pos+42,true),nameStart=pos+46,nameEnd=nameStart+nameLen;
      if(nameEnd>centralBytes.length)break;
      const name=decoder.decode(centralBytes.slice(nameStart,nameEnd));
      map.set(name,{name:name,flags:flags,method:method,compressedSize:compressedSize,size:size,localOffset:localOffset});
      pos=nameEnd+extraLen+commentLen;
    }
    if(!map.size)throw new Error("The ZIP directory could not be read.");
    return map;
  }

  async function inflateRaw(blob){
    if(typeof DecompressionStream!=="function")throw new Error("This older evidence ZIP compresses its video. Use a current Milos export or choose the video manually.");
    try{return await new Response(blob.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob()}catch(_){throw new Error("This compressed video could not be opened directly from the ZIP. Choose the video manually.")}
  }

  async function entryBlob(entry){
    const head=new Uint8Array(await zipFile.slice(entry.localOffset,entry.localOffset+30).arrayBuffer());
    if(head.length<30||new DataView(head.buffer,head.byteOffset,head.byteLength).getUint32(0,true)!==0x04034b50)throw new Error("The selected video entry is damaged.");
    const view=new DataView(head.buffer,head.byteOffset,head.byteLength),nameLen=view.getUint16(26,true),extraLen=view.getUint16(28,true),start=entry.localOffset+30+nameLen+extraLen,end=start+entry.compressedSize;
    let payload=zipFile.slice(start,end,mediaMime(entry.name));
    if(entry.method===0)return payload;
    if(entry.method===8){payload=await inflateRaw(payload);return new Blob([payload],{type:mediaMime(entry.name)})}
    throw new Error("This ZIP uses a video compression method the Evidence Viewer does not support.");
  }

  async function loadFromZip(name){
    const selected=name||files.value,entry=zipEntries.get(selected);if(!zipFile||!entry){setStatus("Choose the complete evidence ZIP first.",true);return}
    currentMedia=selected;files.value=selected;setStatus("Opening "+selected+" directly from the ZIP …");
    try{const blob=await entryBlob(entry);clearObject();resetPlayer();objectUrl=URL.createObjectURL(blob);player.src=objectUrl;player.load();setStatus("Loaded from the ZIP — nothing was uploaded.")}
    catch(error){setStatus(error&&error.message?error.message:"This video could not be read from the ZIP.",true)}
  }

  async function openZip(file){
    const preferred=files.value;zipFile=file;zipEntries=new Map();setStatus("Reading "+file.name+" …");
    try{
      zipEntries=await readZipDirectory(file);
      let names=expectedMedia.filter(function(name){return zipEntries.has(name)});
      if(!names.length)names=Array.from(zipEntries.keys()).filter(function(name){return /\.(mp4|m4v|mov|webm|mkv|avi|m4a|aac|mp3|wav|ogg|opus)$/i.test(name)});
      if(!names.length)throw new Error("No video or audio files were found in this ZIP.");
      populate(names,preferred);setStatus("Evidence ZIP ready.");
      await loadFromZip(files.value);
    }catch(error){zipFile=null;zipEntries=new Map();setStatus(error&&error.message?error.message:"This evidence ZIP could not be opened.",true)}
  }

  function activateCriterion(item){
    activeId=item.id;renderCriteria();pendingSeek={seconds:item.seconds,code:item.code};
    const name=item.file;
    files.value=name;
    if(currentMedia===name&&player.readyState>=1&&Number.isFinite(player.duration)){seekPending();return}
    if(zipFile&&zipEntries.has(name))loadFromZip(name);else loadRelative(name);
  }

  criteriaList.addEventListener("click",function(event){
    const button=event.target.closest&&event.target.closest("[data-evidence-id]");if(!button)return;
    const item=(evidence.criteria||[]).find(function(entry){return entry.id===button.dataset.evidenceId});if(!item)return;
    activateCriterion(item);
  });
  document.getElementById("zipPicker").addEventListener("change",function(event){const file=event.target.files&&event.target.files[0];if(file)openZip(file)});
  document.getElementById("load").addEventListener("click",function(){pendingSeek=null;if(zipFile)loadFromZip(files.value);else loadRelative(files.value)});
  files.addEventListener("change",function(){pendingSeek=null;if(zipFile)loadFromZip(files.value)});
  document.getElementById("picker").addEventListener("change",function(event){const file=event.target.files&&event.target.files[0];if(!file)return;zipFile=null;zipEntries=new Map();clearObject();resetPlayer();currentMedia=file.name;objectUrl=URL.createObjectURL(file);player.src=objectUrl;player.load();setStatus("Loaded "+file.name+" directly from your device.")});
  document.getElementById("back").addEventListener("click",function(){if(Number.isFinite(player.duration))player.currentTime=Math.max(0,player.currentTime-10)});
  document.getElementById("forward").addEventListener("click",function(){if(Number.isFinite(player.duration))player.currentTime=Math.min(player.duration,player.currentTime+10)});
  document.getElementById("go").addEventListener("click",function(){const target=parseTime(jump.value);if(!Number.isFinite(target)){setStatus("Enter a timestamp such as 04:18.",true);return}if(!Number.isFinite(player.duration)||player.duration<=0){setStatus("Load the video first so Milos can read its duration.",true);return}pendingSeek={seconds:target,code:"timestamp"};seekPending()});
  scrub.addEventListener("input",function(){if(Number.isFinite(player.duration)&&player.duration>0)player.currentTime=player.duration*(Number(scrub.value)/1000)});
  player.addEventListener("loadedmetadata",function(){
    if(!Number.isFinite(player.duration)&&!durationProbe){durationProbe=true;try{player.currentTime=1e10}catch(_){}}
    if(Number.isFinite(player.duration)&&player.duration>0){if(!seekPending())setStatus("Ready — tap an AC timestamp or use the timeline.");}
    updateClock();
  });
  player.addEventListener("durationchange",function(){if(durationProbe&&Number.isFinite(player.duration)&&player.duration>0){durationProbe=false;try{player.currentTime=0}catch(_){}}seekPending();updateClock()});
  player.addEventListener("timeupdate",updateClock);
  player.addEventListener("error",function(){if(zipFile){setStatus("This video entry could not be decoded by this browser. Try ‘Choose video manually’.",true)}else{setStatus("Your phone blocked direct access to the neighbouring video. Tap ‘Open complete evidence ZIP’ above once; your selected AC will then open at its timestamp.",true)}});

  if(expectedMedia.length)loadRelative(expectedMedia[0]);else setStatus("No video files were listed in this evidence package.",true);
})();
</script>
</body>
</html>`;
  }

  async function makeZip(entries) {
    const list = Array.isArray(entries) ? entries.slice() : [];
    const mediaNames = list.filter(isMedia).map((entry) => clean(entry.name, 300)).filter(Boolean);
    if (!mediaNames.length) return prior.makeZip(list);

    const record = findRecord(list);
    if (!record) return prior.makeZip(list);

    const evidence = buildEvidenceIndex(record, list);
    if (!evidence.criteria.length) return prior.makeZip(list);

    const withoutOldPlayer = list.filter((entry) => normName(entry && entry.name) !== normName(PLAYER_NAME));
    withoutOldPlayer.unshift({
      name: PLAYER_NAME,
      blob: new Blob([playerHtml(mediaNames, evidence)], { type: "text/html;charset=utf-8" }),
      date: new Date(),
    });
    return prior.makeZip(withoutOldPlayer);
  }

  global.MilosObservationBundle = Object.freeze(Object.assign({}, prior, {
    version: VERSION,
    makeZip,
    clickableAcTimeline: true,
    evidenceTimelinePlayer: true,
  }));

  global.MilosEvidenceTimeline = Object.freeze({
    version: VERSION,
    playerName: PLAYER_NAME,
    clickableAcTimestamps: true,
    correctClipAutoSelect: true,
    localOnly: true,
  });
})(typeof window !== "undefined" ? window : globalThis);
