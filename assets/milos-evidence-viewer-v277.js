(function (global) {
  "use strict";

  const VERSION = "2.77";
  const PLAYER_NAME = "00_OPEN_EVIDENCE.html";
  const prior = global.MilosObservationBundle;
  const core = global.MilosCore;
  if (!prior || typeof prior.makeZip !== "function" || typeof Blob === "undefined") return;

  const baseMakeZip = prior.makeZip.bind(prior);

  function clean(value, max) {
    const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    return text.slice(0, max || 4000);
  }
  function normName(value) { return clean(value, 400).toLowerCase(); }
  function jsonSafe(value, depth, seen) {
    const level = Number(depth || 0), visited = seen || new WeakSet();
    if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Blob || typeof value === "function") return undefined;
    if (level > 6) return clean(value, 2000);
    if (Array.isArray(value)) return value.map((item) => jsonSafe(item, level + 1, visited)).filter((item) => item !== undefined);
    if (typeof value === "object") {
      if (visited.has(value)) return undefined;
      visited.add(value);
      const out = {};
      Object.entries(value).forEach(([key, item]) => {
        if (key === "blob" || key === "dataUrl" || key === "signatureDataUrl") return;
        const safe = jsonSafe(item, level + 1, visited);
        if (safe !== undefined) out[key] = safe;
      });
      return out;
    }
    return clean(value, 2000);
  }
  function isPlayable(entry) {
    const type = String(entry && entry.blob && entry.blob.type || "").toLowerCase();
    const name = String(entry && entry.name || "").toLowerCase();
    return type.startsWith("video/") || type.startsWith("audio/") ||
      /\.(mp4|m4v|mov|webm|mkv|avi|m4a|aac|mp3|wav|ogg|opus)$/i.test(name);
  }
  function mediaName(item) { return clean(item && (item.name || item.filename), 400); }
  function extractEvidenceJson(html) {
    const match = String(html || "").match(/const evidence=(\{[\s\S]*?\});\s*const files=/);
    if (!match || !match[1]) return null;
    try { return JSON.parse(match[1]); } catch (_) { return null; }
  }
  function observations() {
    try {
      const list = core && typeof core.getObservations === "function" ? core.getObservations() : [];
      return Array.isArray(list) ? list : [];
    } catch (_) { return []; }
  }
  function legacyWitnesses(record, all) {
    if (!record || record.mode === "witness") return [];
    const end = Number(record.sessionEndedAt || record.completedAt || 0);
    return (all || []).filter((item) => item && item.id !== record.id && item.mode === "witness" &&
      item.profileId === record.profileId && item.observationDate === record.observationDate &&
      String(item.unitNumber || "") === String(record.unitNumber || "") &&
      Math.abs(Number(item.sessionStartedAt || item.createdAt || 0) - end) <= 4 * 60 * 60 * 1000);
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
          actions: item.actions || ""
        }))
      ]
    });
  }
  function recordMediaNames(record) {
    const names = [];
    (record && record.media || []).forEach((item) => { const name = mediaName(item); if (name) names.push(name); });
    (record && record.videoTimeline || []).forEach((item) => { const name = mediaName(item); if (name) names.push(name); });
    (record && record.witnessEvidence || []).forEach((witness) => {
      (witness.media || []).forEach((item) => { const name = mediaName(item); if (name) names.push(name); });
      (witness.videoTimeline || []).forEach((item) => { const name = mediaName(item); if (name) names.push(name); });
    });
    return [...new Set(names.map(normName).filter(Boolean))];
  }
  function findRecord(entries) {
    const entryNames = new Set((entries || []).filter(isPlayable).map((entry) => normName(entry.name)).filter(Boolean));
    if (!entryNames.size) return null;
    const all = observations();
    let best = null, bestScore = -1;
    all.forEach((original) => {
      if (!original) return;
      const record = exportView(original, all), names = recordMediaNames(record);
      const matches = names.filter((name) => entryNames.has(name)).length;
      if (!matches) return;
      const exact = names.length > 0 && names.length === entryNames.size && names.every((name) => entryNames.has(name));
      if (!exact) return;
      const score = matches * 100 + Number(record.completedAt || record.sessionEndedAt || record.createdAt || 0) / 1e13;
      if (score > bestScore) { best = record; bestScore = score; }
    });
    return best;
  }
  function profileFor(record) {
    try { return record && core && typeof core.getProfile === "function" ? core.getProfile(record.profileId) : null; } catch (_) { return null; }
  }
  function settings() {
    try { return core && typeof core.getSettings === "function" ? core.getSettings() : {}; } catch (_) { return {}; }
  }
  function recordSnapshot(record, evidence) {
    const profile = profileFor(record) || {}, config = settings() || {};
    const witnesses = (record && record.witnessEvidence || []).map((witness) => ({
      name: clean(witness && witness.witnessName, 180),
      role: clean(witness && witness.witnessRole, 180),
      location: clean(witness && witness.location, 220),
      activity: clean(witness && witness.activityObserved, 1200),
      actions: clean(witness && witness.actions, 1800),
      criteria: (witness && witness.criteria || []).map((item) => ({ code: clean(item && item.code, 80), description: clean(item && (item.description || item.title), 1200), outcome: clean(item && (item.outcome || item.status), 120) })),
      mappedEvidence: jsonSafe(witness && witness.mappedEvidence || [])
    })).filter((witness) => witness.name || witness.role || witness.criteria.length);
    return {
      learner: { name: clean(profile.name, 180), localReference: clean(profile.localReference, 120) },
      assessor: { name: clean(config.assessorName, 180), organisation: clean(config.organisation, 220), role: clean(config.role || "Assessor", 120) },
      observation: {
        id: clean(record && (record.publicId || record.id), 160),
        date: clean(record && record.observationDate || evidence && evidence.observationDate, 80),
        courseTitle: clean(record && record.courseTitle || evidence && evidence.courseTitle, 500),
        unitNumber: clean(record && record.unitNumber, 80),
        title: clean(record && (record.jobTitle || record.opportunityTitle) || evidence && evidence.observationTitle, 500),
        location: clean(record && record.location, 240),
        activityObserved: clean(record && record.activityObserved, 1400),
        actions: clean(record && record.actions, 2400),
        sections: jsonSafe(record && record.sections || []),
        criteria: jsonSafe(record && record.criteria || []),
        mappedEvidence: jsonSafe(record && record.mappedEvidence || [])
      },
      witnesses
    };
  }
  async function blobBase64(blob) {
    if (!(blob instanceof Blob) || !blob.size) return "";
    const bytes = new Uint8Array(await blob.arrayBuffer()), chunk = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
    return btoa(binary);
  }
  function mimeFor(entry) {
    const direct = clean(entry && entry.blob && entry.blob.type, 160);
    if (direct) return direct;
    const name = String(entry && entry.name || "").toLowerCase();
    if (/\.pdf$/.test(name)) return "application/pdf";
    if (/\.(jpg|jpeg)$/.test(name)) return "image/jpeg";
    if (/\.png$/.test(name)) return "image/png";
    if (/\.webp$/.test(name)) return "image/webp";
    if (/\.mp4$/.test(name)) return "video/mp4";
    if (/\.webm$/.test(name)) return "video/webm";
    if (/\.mov$/.test(name)) return "video/quicktime";
    if (/\.mp3$/.test(name)) return "audio/mpeg";
    if (/\.wav$/.test(name)) return "audio/wav";
    if (/\.(m4a|aac)$/.test(name)) return "audio/mp4";
    if (/\.(ogg|opus)$/.test(name)) return "audio/ogg";
    return "application/octet-stream";
  }
  function kindFor(entry) {
    const mime = mimeFor(entry), name = String(entry && entry.name || "").toLowerCase();
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("image/")) return "photo";
    if (mime.includes("pdf") || /\.pdf$/.test(name)) return "document";
    return "file";
  }
  function safeJson(value) { return JSON.stringify(value).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e"); }
  function sectionsFor(evidence) {
    const criteria = Array.isArray(evidence && evidence.criteria) ? evidence.criteria : [];
    const clips = Array.isArray(evidence && evidence.clips) ? evidence.clips : [];
    const groups = [];
    const direct = criteria.filter((item) => !(item && (item.source === "witness" || item.witnessName)));
    const loOrder = [];
    direct.forEach((item) => { const lo = clean(item && item.lo, 80); if (lo && !loOrder.includes(lo)) loOrder.push(lo); });
    clips.forEach((clip) => { const lo = clean(clip && clip.lo, 80); if (lo && !(clip && (clip.source === "witness" || clip.witnessName)) && !loOrder.includes(lo)) loOrder.push(lo); });
    const intros = clips.filter((clip) => clip && clip.kind === "intro" && !(clip.source === "witness" || clip.witnessName));
    if (intros.length) groups.push({ id: "intro", title: "Introduction", subtitle: intros.length === 1 ? "Recorded introduction" : `${intros.length} introduction clips`, criteria: [], clips: intros });
    loOrder.forEach((lo) => {
      const items = direct.filter((item) => clean(item && item.lo, 80) === lo);
      const loClips = clips.filter((clip) => !(clip && (clip.source === "witness" || clip.witnessName)) && clean(clip && clip.lo, 80) === lo);
      const title = clean(loClips[0] && loClips[0].title || items[0] && items[0].loTitle || "Recorded learning outcome", 500);
      groups.push({ id: `lo-${lo}`, title: `LO${lo} ${title}`, subtitle: `${items.length} ${evidence && evidence.criteriaLabel || "assessment criteria"}`.trim(), criteria: items, clips: loClips });
    });
    const loose = direct.filter((item) => !clean(item && item.lo, 80));
    if (loose.length) groups.push({ id: "other", title: "Other recorded evidence", subtitle: `${loose.length} mapped criteria`, criteria: loose, clips: clips.filter((clip) => !(clip && (clip.source === "witness" || clip.witnessName)) && clip.kind !== "intro" && !clean(clip.lo, 80)) });
    const witnessCriteria = criteria.filter((item) => item && (item.source === "witness" || item.witnessName));
    const witnessClips = clips.filter((item) => item && (item.source === "witness" || item.witnessName));
    if (witnessCriteria.length || witnessClips.length) groups.push({ id: "witness", title: "Witness testimony", subtitle: witnessCriteria.length ? `${witnessCriteria.length} mapped criteria` : "Recorded witness evidence", criteria: witnessCriteria, clips: witnessClips });
    return groups;
  }
  function readme() {
    return "MILOS SELF-CONTAINED EVIDENCE VIEWER\n\nOpen 00_OPEN_EVIDENCE.html in a modern browser.\n\nThe viewer contains an embedded copy of the observation report and evidence attachments. It does not require Milos, GitHub, Supabase, neighbouring evidence files or an internet connection. The original files remain separately inside the ZIP for audit and transfer.\n";
  }
  function viewerHtml(pack) {
    const payload = safeJson(pack);
    return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light"><title>Milos Evidence Viewer</title><!-- milosEvidenceViewerV272 compatibility marker --><!-- milosSelfContainedEvidenceViewerV277 --><style>
:root{--blue:#2c85f7;--blue-dark:#1f5fad;--soft:#eaf3ff;--ink:#292d34;--muted:#707985;--line:#dfe6ee;--bg:#f5f8fc;--panel:#fff}*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Arial,Helvetica,sans-serif;color:var(--ink);background:var(--bg)}button,input{font:inherit}.app{min-height:100vh;display:grid;grid-template-columns:300px minmax(0,1fr)}.sidebar{background:#fff;border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:100vh;position:sticky;top:0;max-height:100vh}.brand{padding:22px 18px 16px;border-bottom:1px solid var(--line)}.brand-mark{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.mark{width:17px;height:17px;border:2px solid var(--blue);border-radius:50%;position:relative}.mark:before,.mark:after{content:"";position:absolute;width:3px;height:3px;border:1.5px solid var(--blue);border-radius:50%;top:4px}.mark:before{left:3px}.mark:after{right:3px}.brand h1{font-size:18px;line-height:1.2;margin:13px 0 5px}.brand p{font-size:11px;line-height:1.45;color:var(--muted);margin:0}.search-wrap{padding:11px 12px;border-bottom:1px solid var(--line)}.search{width:100%;height:42px;border:1px solid var(--line);border-radius:12px;padding:0 12px;background:#fafcff;outline:none}.search:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(44,133,247,.14)}.nav{padding:7px;overflow:auto;flex:1}.nav-item{width:100%;border:0;background:transparent;border-radius:12px;padding:10px;text-align:left;display:grid;grid-template-columns:32px minmax(0,1fr);gap:8px;color:var(--ink);cursor:pointer}.nav-item.active{background:var(--soft);box-shadow:inset 3px 0 0 var(--blue)}.nav-no{font-size:9px;font-weight:800;color:#8a96a4;padding-top:2px}.nav-copy strong{display:block;font-size:11px;line-height:1.3}.nav-copy small{display:block;margin-top:3px;color:var(--muted);font-size:9px;line-height:1.3}.main{min-width:0;min-height:100vh;display:flex;flex-direction:column}.topbar{height:62px;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;padding:0 20px;position:sticky;top:0;z-index:10}.menu{display:none;width:42px;height:42px;border:1px solid var(--line);border-radius:12px;background:#fff;cursor:pointer}.top-title{min-width:0;flex:1}.top-title strong{font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.top-title span{font-size:9px;color:var(--muted)}.actions{display:flex;gap:7px}.icon-btn{min-height:38px;border:1px solid var(--line);background:#fff;border-radius:11px;padding:0 12px;color:var(--ink);font-size:10px;font-weight:700;cursor:pointer}.stage{flex:1;padding:24px;display:flex;align-items:flex-start;justify-content:center}.slide{width:min(1160px,100%);min-height:calc(100vh - 112px);background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 14px 38px rgba(30,73,120,.07);overflow:hidden;display:flex;flex-direction:column}.slide-head{padding:25px 30px 19px;border-bottom:1px solid var(--line)}.eyebrow{font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7f8995;margin-bottom:8px}.slide-head h2{font-size:clamp(23px,3vw,36px);line-height:1.1;margin:0;max-width:900px}.badges{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}.badge{display:inline-flex;min-height:27px;align-items:center;padding:0 9px;border-radius:999px;background:#f2f5f8;color:#536170;font-size:9px;font-weight:700}.badge.blue{background:var(--soft);color:#174d89;border:1px solid rgba(44,133,247,.28)}.slide-body{padding:22px 30px 28px;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,.7fr);gap:22px;flex:1}.media-panel{min-width:0}.attachment-tabs{display:flex;gap:7px;overflow-x:auto;padding:0 0 10px;scrollbar-width:none}.attachment-tab{flex:0 0 auto;min-height:39px;border:1px solid var(--line);border-radius:999px;background:#fff;padding:0 12px;font-size:10px;font-weight:700;cursor:pointer}.attachment-tab.active{background:var(--blue);border-color:var(--blue);color:#fff}.media-frame{width:100%;min-height:340px;background:#eef2f6;border:1px solid var(--line);border-radius:17px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}.media-frame img,.media-frame video{max-width:100%;width:100%;max-height:65vh;object-fit:contain;background:#111}.media-frame audio{width:min(620px,90%)}.media-frame object{width:100%;height:61vh;border:0;background:#fff}.media-empty{padding:34px;text-align:center;color:var(--muted);font-size:12px;line-height:1.5}.details{display:flex;flex-direction:column;gap:11px;min-width:0}.detail-card{border:1px solid var(--line);border-radius:15px;background:#fff;padding:14px}.detail-card h3{font-size:9px;letter-spacing:.07em;text-transform:uppercase;color:#707985;margin:0 0 8px}.detail-card p{font-size:11px;line-height:1.5;margin:0;color:#475464;white-space:pre-wrap;overflow-wrap:anywhere}.detail-grid{display:grid;gap:7px}.detail-row{display:grid;grid-template-columns:82px minmax(0,1fr);gap:7px;font-size:10px;line-height:1.45}.detail-row span:first-child{color:#8b96a3}.detail-row span:last-child{font-weight:600;overflow-wrap:anywhere}.criteria{margin-top:12px;border:1px solid var(--line);border-radius:15px;overflow:hidden}.criterion{width:100%;border:0;border-bottom:1px solid var(--line);background:#fff;padding:11px 12px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;text-align:left;cursor:pointer}.criterion:last-child{border-bottom:0}.criterion:hover,.criterion.active{background:var(--soft)}.criterion b{display:block;color:#1f5fad;font-size:12px}.criterion span{display:block;font-size:11px;color:#4f5d6c;margin-top:3px;line-height:1.35}.criterion time{align-self:center;display:inline-grid;place-items:center;min-width:62px;padding:7px 8px;border-radius:9px;background:var(--blue-dark);color:#fff;font-size:10px;font-weight:800}.overview{padding:30px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.card{border:1px solid var(--line);border-radius:17px;padding:18px;background:#fff}.card.wide{grid-column:1/-1}.card h3{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#7c8793;margin:0 0 8px}.card strong{font-size:20px;overflow-wrap:anywhere}.card p{font-size:11px;line-height:1.55;color:#566473;margin:7px 0 0}.file-list{display:grid;gap:7px;margin-top:10px}.file-btn{width:100%;min-height:42px;border:1px solid var(--line);border-radius:11px;background:#fff;text-align:left;padding:9px 11px;cursor:pointer;font-size:10px;font-weight:700}.file-btn:hover{background:var(--soft);border-color:#a9c9ee}.footer{min-height:68px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:10px 22px;gap:10px}.nav-btn{min-width:105px;min-height:42px;border:1px solid var(--line);border-radius:13px;background:#fff;font-size:10px;font-weight:800;cursor:pointer}.nav-btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}.nav-btn:disabled{opacity:.3}.counter{font-size:10px;color:var(--muted);font-weight:700}.drawer-shade{display:none}
@media(max-width:760px){.app{display:block}.sidebar{position:fixed;z-index:40;inset:0 15% 0 0;transform:translateX(-105%);transition:transform .22s ease;box-shadow:14px 0 38px rgba(0,0,0,.14)}body.drawer .sidebar{transform:translateX(0)}.drawer-shade{display:block;position:fixed;z-index:35;inset:0;background:rgba(0,0,0,.24);opacity:0;pointer-events:none;transition:opacity .22s ease}body.drawer .drawer-shade{opacity:1;pointer-events:auto}.menu{display:grid;place-items:center}.topbar{height:58px;padding:0 10px}.actions .icon-btn:first-child{display:none}.stage{padding:9px}.slide{border-radius:15px;min-height:calc(100vh - 76px);box-shadow:none}.slide-head{padding:19px 16px 15px}.slide-head h2{font-size:23px}.slide-body{padding:14px 12px 18px;display:block}.details{margin-top:13px}.media-frame{min-height:240px}.media-frame object{height:55vh}.overview{padding:16px 12px;grid-template-columns:1fr}.card.wide{grid-column:auto}.footer{position:sticky;bottom:0;background:rgba(255,255,255,.97);min-height:62px;padding:8px 10px}.nav-btn{min-width:86px}.brand{padding-top:max(22px,env(safe-area-inset-top))}}
@media print{.sidebar,.topbar,.footer,.attachment-tabs{display:none!important}.app{display:block}.stage{padding:0}.slide{border:0;box-shadow:none;min-height:auto}.slide-body{grid-template-columns:1fr 310px}}
</style></head><body><div class="drawer-shade" id="shade"></div><div class="app"><aside class="sidebar"><div class="brand"><div class="brand-mark"><span class="mark"></span>Milos Evidence Viewer</div><h1 id="learner"></h1><p id="sideMeta"></p></div><div class="search-wrap"><input class="search" id="search" type="search" placeholder="Find an AC, KSB, LO or wording" aria-label="Search evidence"></div><nav class="nav" id="nav"></nav></aside><main class="main"><header class="topbar"><button class="menu" id="menu" type="button" aria-label="Open evidence list">☰</button><div class="top-title"><strong id="topTitle">Evidence Viewer</strong><span id="topMeta"></span></div><div class="actions"><button class="icon-btn" id="print" type="button">Print</button><button class="icon-btn" id="full" type="button">Full screen</button></div></header><section class="stage"><article class="slide" id="slide"></article></section></main></div><script>
const PACK=${payload};
const state={index:0,activeFile:"",activeCriterion:"",url:"",filtered:PACK.sections.map((_,i)=>i)};
const $=id=>document.getElementById(id),slide=$("slide"),nav=$("nav"),search=$("search");
function h(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#039;"}[ch]))}
function fmt(value){const n=Math.max(0,Math.floor(Number(value)||0)),hh=Math.floor(n/3600),mm=Math.floor((n%3600)/60),ss=n%60;return hh?String(hh).padStart(2,"0")+":"+String(mm).padStart(2,"0")+":"+String(ss).padStart(2,"0"):String(mm).padStart(2,"0")+":"+String(ss).padStart(2,"0")}
function revoke(){if(state.url){try{URL.revokeObjectURL(state.url)}catch{}state.url=""}}
function attachment(name){return PACK.attachments.find(item=>item.name===name)||null}
function objectUrl(item){revoke();if(!item||!item.base64)return"";try{const raw=atob(item.base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);state.url=URL.createObjectURL(new Blob([bytes],{type:item.mime||"application/octet-stream"}));return state.url}catch{return""}}
function navRender(){const q=search.value.trim().toLowerCase();state.filtered=PACK.sections.map((section,i)=>({section,i})).filter(({section})=>!q||[section.title,section.subtitle,...section.criteria.map(x=>[x.code,x.description,x.lo,x.loTitle,x.status,x.witnessName].join(" "))].join(" ").toLowerCase().includes(q)).map(x=>x.i);nav.innerHTML='<button class="nav-item '+(state.index===0?'active':'')+'" data-index="0"><span class="nav-no">00</span><span class="nav-copy"><strong>Observation overview</strong><small>'+h(PACK.evidence.observationTitle||"Evidence pack")+'</small></span></button>'+state.filtered.map(i=>{const section=PACK.sections[i],n=i+1;return'<button class="nav-item '+(state.index===n?'active':'')+'" data-index="'+n+'"><span class="nav-no">'+String(n).padStart(2,'0')+'</span><span class="nav-copy"><strong>'+h(section.title)+'</strong><small>'+h(section.subtitle)+'</small></span></button>'}).join("");nav.querySelectorAll("[data-index]").forEach(btn=>btn.addEventListener("click",()=>{show(Number(btn.dataset.index));document.body.classList.remove("drawer")}))}
function footer(){return'<div class="footer"><button class="nav-btn" id="prev" type="button" '+(state.index<=0?'disabled':'')+'>Previous</button><span class="counter">'+(state.index===0?'Overview':'Evidence '+state.index+' of '+PACK.sections.length)+'</span><button class="nav-btn primary" id="next" type="button" '+(state.index>=PACK.sections.length?'disabled':'')+'>Next</button></div>'}
function fileButtons(){return PACK.attachments.map(item=>'<button class="file-btn" type="button" data-file="'+h(item.name)+'">'+h(item.name)+' · '+Math.max(1,Math.round((item.size||0)/1024))+' KB</button>').join("")}
function overview(){const m=PACK.meta,w=m.witnesses||[],a=m.assessor||{},l=m.learner||{},o=m.observation||{};return'<div class="slide-head"><div class="eyebrow">Self-contained offline evidence pack</div><h2>'+h(PACK.evidence.observationTitle||o.title||"Observation evidence")+'</h2><div class="badges"><span class="badge blue">'+PACK.sections.length+' evidence sections</span><span class="badge">'+PACK.attachments.length+' embedded files</span><span class="badge">'+PACK.evidence.criteria.length+' mapped criteria</span></div></div><div class="overview"><div class="card"><h3>Learner</h3><strong>'+h(l.name||"Learner")+'</strong><p>'+h(l.localReference||"")+'</p></div><div class="card"><h3>Course</h3><strong>'+h(PACK.evidence.courseTitle||o.courseTitle||"Course")+'</strong><p>'+h(o.unitNumber?"Unit "+o.unitNumber:"")+'</p></div><div class="card"><h3>Observation</h3><strong>'+h(o.date||PACK.evidence.observationDate||"Recorded")+'</strong><p>'+h(o.location||o.activityObserved||"")+'</p></div><div class="card"><h3>Assessor</h3><strong>'+h(a.name||"Assessor")+'</strong><p>'+h([a.role,a.organisation].filter(Boolean).join(" · "))+'</p></div><div class="card"><h3>Witness evidence</h3><strong>'+w.length+'</strong><p>'+h(w.map(x=>[x.name,x.role].filter(Boolean).join(" · ")).filter(Boolean).join("; ")||"No witness details recorded")+'</p></div><div class="card"><h3>Offline</h3><strong>Ready</strong><p>Media and the observation report are embedded in this HTML viewer.</p></div><div class="card wide"><h3>Embedded source files</h3><p>The original files remain separately in the ZIP. These buttons open the embedded copies inside this viewer.</p><div class="file-list">'+fileButtons()+'</div></div></div>'+footer()}
function rows(section){const criteria=section.criteria||[];if(criteria.length)return criteria;return(section.clips||[]).map((clip,i)=>({id:"clip-"+i,code:clip.kind==="intro"?"Introduction":"Recording",description:clip.title||clip.file||"Recorded evidence",file:clip.file,seconds:0,status:"",source:clip.source||"assessor",witnessName:clip.witnessName||""}))}
function detailRows(item){const values=[["Mapped code",item.code],["Status",item.status],["Source",item.witnessName?"Witness · "+item.witnessName:(item.source==="witness"?"Witness":"Direct observation")],["Timestamp",fmt(item.seconds)],["Evidence file",item.file],["Learning outcome",item.lo?"LO"+item.lo:""]];return values.filter(x=>x[1]).map(x=>'<div class="detail-row"><span>'+h(x[0])+'</span><span>'+h(x[1])+'</span></div>').join("")}
function witnessCard(item){if(!(item.source==="witness"||item.witnessName))return"";const w=(PACK.meta.witnesses||[]).find(x=>!item.witnessName||x.name===item.witnessName)||(PACK.meta.witnesses||[])[0];if(!w)return"";return'<div class="detail-card"><h3>Witness details</h3><p>'+h([w.name,w.role,w.location].filter(Boolean).join(" · "))+(w.activity?'\\n\\n'+h(w.activity):'')+'</p></div>'}
function sectionHtml(section){const list=rows(section),active=list.find(x=>x.id===state.activeCriterion)||list[0]||{},tabs=PACK.attachments.filter(x=>x.kind!=="file").map(item=>'<button class="attachment-tab '+(item.name===state.activeFile?'active':'')+'" type="button" data-file="'+h(item.name)+'">'+h(item.kind==='document'?'Observation PDF':item.name)+'</button>').join("");return'<div class="slide-head"><div class="eyebrow">Evidence '+state.index+' of '+PACK.sections.length+'</div><h2>'+h(section.title)+'</h2><div class="badges"><span class="badge blue">'+h(section.subtitle)+'</span>'+(active.witnessName?'<span class="badge">Witness · '+h(active.witnessName)+'</span>':'')+'</div></div><div class="slide-body"><div class="media-panel"><div class="attachment-tabs">'+tabs+'</div><div id="mediaHost"></div><div class="criteria">'+list.map(item=>'<button class="criterion '+(item.id===state.activeCriterion?'active':'')+'" type="button" data-criterion="'+h(item.id)+'"><span><b>'+h(item.code||"Recording")+'</b><span>'+h(item.description||"Recorded evidence")+'</span></span><time>'+fmt(item.seconds)+'</time></button>').join("")+'</div></div><aside class="details"><div class="detail-card"><h3>Evidence information</h3><div class="detail-grid">'+detailRows(active)+'</div></div>'+witnessCard(active)+(active.description?'<div class="detail-card"><h3>Criterion</h3><p>'+h(active.description)+'</p></div>':'')+(PACK.meta.observation.actions?'<div class="detail-card"><h3>Assessor actions</h3><p>'+h(PACK.meta.observation.actions)+'</p></div>':'')+'</aside></div>'+footer()}
function renderMedia(name,seconds){const host=$("mediaHost");if(!host)return;const item=attachment(name)||PACK.attachments.find(x=>["video","audio","photo","document"].includes(x.kind));if(!item){host.innerHTML='<div class="media-frame"><div class="media-empty">No embedded file is linked to this evidence.</div></div>';return}state.activeFile=item.name;const url=objectUrl(item);if(!url){host.innerHTML='<div class="media-frame"><div class="media-empty">The embedded evidence could not be decoded by this browser.</div></div>';return}if(item.kind==="video"){host.innerHTML='<div class="media-frame"><video id="media" controls playsinline preload="metadata"></video></div>';const media=$("media");media.src=url;media.addEventListener("loadedmetadata",()=>{try{media.currentTime=Math.min(Math.max(0,Number(seconds)||0),Number.isFinite(media.duration)?media.duration:Number(seconds)||0)}catch{}},{once:true});try{media.load()}catch{};return}if(item.kind==="audio"){host.innerHTML='<div class="media-frame"><audio id="media" controls preload="metadata"></audio></div>';const media=$("media");media.src=url;media.addEventListener("loadedmetadata",()=>{try{media.currentTime=Math.min(Math.max(0,Number(seconds)||0),Number.isFinite(media.duration)?media.duration:Number(seconds)||0)}catch{}},{once:true});try{media.load()}catch{};return}if(item.kind==="photo"){host.innerHTML='<div class="media-frame"><img id="media" alt="Embedded evidence"></div>';$("media").src=url;return}if(item.kind==="document"&&/pdf/i.test(item.mime+item.name)){host.innerHTML='<div class="media-frame"><object id="media" type="application/pdf"><div class="media-empty">PDF preview is not available in this browser.</div></object></div>';$("media").data=url;return}host.innerHTML='<div class="media-frame"><div class="media-empty">Embedded file ready.</div></div>'}
function bind(){const prev=$("prev"),next=$("next");if(prev)prev.addEventListener("click",()=>show(state.index-1));if(next)next.addEventListener("click",()=>show(state.index+1));slide.querySelectorAll("[data-file]").forEach(btn=>btn.addEventListener("click",()=>{state.activeFile=btn.dataset.file;renderMedia(state.activeFile,0);slide.querySelectorAll("[data-file]").forEach(x=>x.classList.toggle("active",x.dataset.file===state.activeFile))}));slide.querySelectorAll("[data-criterion]").forEach(btn=>btn.addEventListener("click",()=>{const section=PACK.sections[state.index-1],item=rows(section).find(x=>x.id===btn.dataset.criterion);if(!item)return;state.activeCriterion=item.id;state.activeFile=item.file||state.activeFile;slide.innerHTML=sectionHtml(section);bind();renderMedia(state.activeFile,item.seconds)}))}
function show(index){revoke();state.index=Math.max(0,Math.min(PACK.sections.length,index));state.activeCriterion="";state.activeFile="";if(state.index===0)slide.innerHTML=overview();else{const section=PACK.sections[state.index-1],first=rows(section)[0]||{};state.activeCriterion=first.id||"";state.activeFile=first.file||((PACK.attachments.find(x=>x.kind==="video"||x.kind==="audio")||{}).name)||"";slide.innerHTML=sectionHtml(section)}$("topTitle").textContent=state.index===0?(PACK.evidence.observationTitle||"Observation evidence"):PACK.sections[state.index-1].title;$("topMeta").textContent=[PACK.evidence.courseTitle,PACK.evidence.observationDate].filter(Boolean).join(" · ");navRender();bind();if(state.index>0){const item=rows(PACK.sections[state.index-1])[0]||{};renderMedia(state.activeFile,item.seconds)}window.scrollTo(0,0)}
$("learner").textContent=PACK.meta.learner.name||"Learner evidence";$("sideMeta").textContent=[PACK.evidence.courseTitle,PACK.evidence.observationDate].filter(Boolean).join(" · ");search.addEventListener("input",navRender);$("menu").addEventListener("click",()=>document.body.classList.add("drawer"));$("shade").addEventListener("click",()=>document.body.classList.remove("drawer"));$("full").addEventListener("click",()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.()});$("print").addEventListener("click",()=>window.print());document.addEventListener("keydown",event=>{if(event.target===search)return;if(event.key==="ArrowRight")show(state.index+1);if(event.key==="ArrowLeft")show(state.index-1);if(event.key==="Escape")document.body.classList.remove("drawer")});window.addEventListener("beforeunload",revoke);show(0);
</script></body></html>`;
  }

  async function makeZip(entries) {
    const list = Array.isArray(entries) ? entries.slice() : [];
    const playerIndex = list.findIndex((entry) => normName(entry && entry.name) === normName(PLAYER_NAME) && entry && entry.blob instanceof Blob);
    if (playerIndex < 0) return baseMakeZip(list);
    let evidence = null;
    try { evidence = extractEvidenceJson(await list[playerIndex].blob.text()); } catch (_) {}
    if (!evidence || !Array.isArray(evidence.criteria) || !Array.isArray(evidence.clips)) return baseMakeZip(list);

    const record = findRecord(list);
    const attachments = [];
    for (const entry of list) {
      if (!entry || normName(entry.name) === normName(PLAYER_NAME) || !(entry.blob instanceof Blob)) continue;
      attachments.push({
        name: clean(entry.name, 400),
        mime: mimeFor(entry),
        kind: kindFor(entry),
        size: entry.blob.size || 0,
        base64: await blobBase64(entry.blob)
      });
    }
    const pack = {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      evidence: jsonSafe(evidence) || evidence,
      meta: recordSnapshot(record, evidence),
      sections: sectionsFor(evidence),
      attachments
    };
    if (!pack.sections.length) return baseMakeZip(list);

    const next = list.slice();
    next[playerIndex] = Object.assign({}, list[playerIndex], {
      blob: new Blob([viewerHtml(pack)], { type: "text/html;charset=utf-8" }),
      date: new Date()
    });
    if (!next.some((entry) => normName(entry && entry.name) === "evidence viewer - read me.txt")) {
      next.splice(playerIndex + 1, 0, { name: "Evidence Viewer - Read Me.txt", blob: new Blob([readme()], { type: "text/plain;charset=utf-8" }), date: new Date() });
    }
    return baseMakeZip(next);
  }

  global.MilosObservationBundle = Object.freeze(Object.assign({}, prior, {
    version: VERSION,
    makeZip,
    selfContainedEvidenceViewer: true,
    evidenceViewerV277: true
  }));
  global.MilosEvidenceViewer277 = Object.freeze({
    version: VERSION,
    playerName: PLAYER_NAME,
    selfContained: true,
    searchableCriteria: true,
    groupedCriteria: true,
    embedsObservationPdf: true,
    embedsMedia: true,
    preservesTimestampSeek: true,
    localOnly: true
  });
})(typeof window !== "undefined" ? window : globalThis);
