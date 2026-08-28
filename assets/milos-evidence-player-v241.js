(function (global) {
  "use strict";

  const prior = global.MilosObservationBundle;
  if (!prior || typeof prior.makeZip !== "function" || typeof Blob === "undefined") return;

  const VERSION = "2.41";
  const PLAYER_NAME = "00_OPEN_EVIDENCE.html";

  function isMedia(entry) {
    const blob = entry && entry.blob;
    const type = String(blob && blob.type || "").toLowerCase();
    const name = String(entry && entry.name || "").toLowerCase();
    return type.startsWith("video/") || type.startsWith("audio/") || /\.(mp4|m4v|mov|webm|mkv|avi|m4a|aac|mp3|wav|ogg|opus)$/i.test(name);
  }

  function playerHtml(mediaNames) {
    const namesJson = JSON.stringify(mediaNames).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Milos Evidence Player</title>
<style>
:root{font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#f3f6fa}*{box-sizing:border-box}body{margin:0;padding:24px}.wrap{max-width:980px;margin:auto;background:#fff;border:1px solid #dbe3ec;border-radius:16px;padding:24px;box-shadow:0 8px 28px rgba(30,55,85,.08)}h1{margin:0 0 6px;color:#254973;font-size:26px}p{line-height:1.5}.notice{background:#eef5fc;border-left:4px solid #254973;padding:12px 14px;margin:18px 0;border-radius:8px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}select,input[type=text],button,.pick{font:inherit;border:1px solid #c7d1dc;border-radius:9px;padding:10px 12px;background:#fff}select{min-width:280px;flex:1}button,.pick{cursor:pointer;font-weight:700}.primary{background:#254973;color:#fff;border-color:#254973}.zipPick{display:block;text-align:center;font-size:17px;padding:13px 16px}.pick input{display:none}video,audio{width:100%;background:#000;border-radius:12px;margin-top:12px;min-height:56px}.seek{display:grid;grid-template-columns:auto 120px auto auto;gap:10px;align-items:center;margin-top:14px}.seek input[type=range]{grid-column:1/-1;width:100%}.time{font-variant-numeric:tabular-nums;font-weight:700;color:#42556b}.status{min-height:24px;color:#5b6674}.error{color:#9b1c1c;font-weight:700}.help{font-size:14px;color:#516173}@media(max-width:640px){body{padding:10px}.wrap{padding:16px}.seek{grid-template-columns:1fr 1fr}.seek input[type=range]{grid-column:1/-1}.seek input[type=text]{width:100%}select{min-width:0;width:100%}}
</style>
</head>
<body>
<main class="wrap">
<h1>Milos Evidence Player</h1>
<p>Offline playback for assessor evidence. No evidence is uploaded anywhere.</p>
<div class="notice"><strong>Android / phone:</strong> tap <b>Open complete evidence ZIP</b> and choose the ZIP this player came from. Milos then reads the videos directly from the ZIP on your device — you do not need to extract them first.</div>
<label class="pick primary zipPick">Open complete evidence ZIP<input id="zipPicker" type="file" accept=".zip,application/zip,application/x-zip-compressed"></label>
<div class="row"><select id="files" aria-label="Evidence video"></select><button id="load" class="primary" type="button">Load selected video</button><label class="pick">Choose one video manually<input id="picker" type="file" accept="video/*,audio/*"></label></div>
<video id="player" controls playsinline preload="metadata"></video>
<div class="seek">
<button id="back" type="button">−10 seconds</button>
<input id="jump" type="text" inputmode="numeric" placeholder="04:18" aria-label="Timestamp">
<button id="go" class="primary" type="button">Go to timestamp</button>
<button id="forward" type="button">+10 seconds</button>
<input id="scrub" type="range" min="0" max="1000" value="0" aria-label="Video timeline">
</div>
<div class="row"><span class="time" id="clock">00:00 / 00:00</span><span class="status" id="status"></span></div>
<p><strong>Using the PDF timestamps:</strong> type the time shown in the evidence PDF, for example <b>04:18</b>, then choose <b>Go to timestamp</b>. The slider above can also be dragged to any point in the recording.</p>
<p class="help">On computers where sibling-file playback is allowed, the player will still try to load the selected video automatically. The ZIP button is the reliable phone-safe route.</p>
</main>
<script>
(function(){
  "use strict";
  const expectedMedia=${namesJson};
  const files=document.getElementById("files"), player=document.getElementById("player"), status=document.getElementById("status"), scrub=document.getElementById("scrub"), clock=document.getElementById("clock"), jump=document.getElementById("jump");
  let objectUrl="", zipFile=null, zipEntries=new Map(), durationProbe=false;

  function fmt(value){const n=Math.max(0,Math.floor(Number(value)||0)),h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=n%60;return h?String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
  function parseTime(value){const parts=String(value||"").trim().split(":").map(Number);if(!parts.length||parts.some(function(n){return !Number.isFinite(n)||n<0}))return NaN;if(parts.length===1)return parts[0];if(parts.length===2)return parts[0]*60+parts[1];if(parts.length===3)return parts[0]*3600+parts[1]*60+parts[2];return NaN}
  function setStatus(text,error){status.textContent=text||"";status.className=error?"status error":"status"}
  function clearObject(){if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=""}}
  function mediaMime(name){const value=String(name||"").toLowerCase();if(/\.webm$/.test(value))return "video/webm";if(/\.(mp4|m4v)$/.test(value))return "video/mp4";if(/\.mov$/.test(value))return "video/quicktime";if(/\.mp3$/.test(value))return "audio/mpeg";if(/\.wav$/.test(value))return "audio/wav";if(/\.(ogg|opus)$/.test(value))return "audio/ogg";if(/\.(m4a|aac)$/.test(value))return "audio/mp4";return "application/octet-stream"}
  function updateClock(){const finite=Number.isFinite(player.duration)&&player.duration>0;clock.textContent=fmt(player.currentTime)+" / "+(finite?fmt(player.duration):"00:00");if(finite)scrub.value=String(Math.round((player.currentTime/player.duration)*1000))}
  function resetPlayer(){durationProbe=false;scrub.value="0";clock.textContent="00:00 / 00:00"}

  function populate(names){files.innerHTML="";(names||[]).forEach(function(name){const option=document.createElement("option");option.value=name;option.textContent=name;files.appendChild(option)})}
  populate(expectedMedia);

  function loadRelative(){clearObject();resetPlayer();const name=files.value;if(!name)return;setStatus("Trying "+name+" …");player.src=encodeURIComponent(name);player.load()}

  async function readZipDirectory(file){
    const tailSize=Math.min(file.size,65557),tailStart=file.size-tailSize,tail=new Uint8Array(await file.slice(tailStart).arrayBuffer()),tailView=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
    let eocd=-1;for(let i=tail.length-22;i>=0;i--){if(tailView.getUint32(i,true)===0x06054b50){eocd=i;break}}
    if(eocd<0)throw new Error("This does not look like a complete ZIP file.");
    const count=tailView.getUint16(eocd+10,true),centralSize=tailView.getUint32(eocd+12,true),centralOffset=tailView.getUint32(eocd+16,true);
    if(count===65535||centralSize===0xffffffff||centralOffset===0xffffffff)throw new Error("ZIP64 evidence packages are not supported by this player.");
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
    throw new Error("This ZIP uses a video compression method the Evidence Player does not support.");
  }

  async function loadFromZip(){
    const name=files.value,entry=zipEntries.get(name);if(!zipFile||!entry){setStatus("Choose the complete evidence ZIP first.",true);return}
    setStatus("Opening "+name+" directly from the ZIP …");
    try{const blob=await entryBlob(entry);clearObject();resetPlayer();objectUrl=URL.createObjectURL(blob);player.src=objectUrl;player.load();setStatus("Loaded from the ZIP — nothing was uploaded.")}
    catch(error){setStatus(error&&error.message?error.message:"This video could not be read from the ZIP.",true)}
  }

  async function openZip(file){
    zipFile=file;zipEntries=new Map();setStatus("Reading "+file.name+" …");
    try{
      zipEntries=await readZipDirectory(file);
      let names=expectedMedia.filter(function(name){return zipEntries.has(name)});
      if(!names.length)names=Array.from(zipEntries.keys()).filter(function(name){return /\.(mp4|m4v|mov|webm|mkv|avi|m4a|aac|mp3|wav|ogg|opus)$/i.test(name)});
      if(!names.length)throw new Error("No video or audio files were found in this ZIP.");
      populate(names);setStatus("Evidence ZIP ready — loading the first video.");await loadFromZip();
    }catch(error){zipFile=null;zipEntries=new Map();setStatus(error&&error.message?error.message:"This evidence ZIP could not be opened.",true)}
  }

  document.getElementById("zipPicker").addEventListener("change",function(event){const file=event.target.files&&event.target.files[0];if(file)openZip(file)});
  document.getElementById("load").addEventListener("click",function(){if(zipFile)loadFromZip();else loadRelative()});
  files.addEventListener("change",function(){if(zipFile)loadFromZip()});
  document.getElementById("picker").addEventListener("change",function(event){const file=event.target.files&&event.target.files[0];if(!file)return;zipFile=null;zipEntries=new Map();clearObject();resetPlayer();objectUrl=URL.createObjectURL(file);player.src=objectUrl;player.load();setStatus("Loaded "+file.name+" directly from your device.")});
  document.getElementById("back").addEventListener("click",function(){if(Number.isFinite(player.duration))player.currentTime=Math.max(0,player.currentTime-10)});
  document.getElementById("forward").addEventListener("click",function(){if(Number.isFinite(player.duration))player.currentTime=Math.min(player.duration,player.currentTime+10)});
  document.getElementById("go").addEventListener("click",function(){const target=parseTime(jump.value);if(!Number.isFinite(target)){setStatus("Enter a timestamp such as 04:18.",true);return}if(!Number.isFinite(player.duration)||player.duration<=0){setStatus("Load the video first so Milos can read its duration.",true);return}player.currentTime=Math.min(Math.max(0,target),player.duration);player.play().catch(function(){});setStatus("Jumped to "+fmt(player.currentTime))});
  scrub.addEventListener("input",function(){if(Number.isFinite(player.duration)&&player.duration>0)player.currentTime=player.duration*(Number(scrub.value)/1000)});
  player.addEventListener("loadedmetadata",function(){
    if(!Number.isFinite(player.duration)&&!durationProbe){durationProbe=true;try{player.currentTime=1e10}catch(_){}}
    if(Number.isFinite(player.duration)&&player.duration>0)setStatus("Ready — drag the timeline or enter a PDF timestamp.");
    updateClock();
  });
  player.addEventListener("durationchange",function(){if(durationProbe&&Number.isFinite(player.duration)&&player.duration>0){durationProbe=false;try{player.currentTime=0}catch(_){}}updateClock()});
  player.addEventListener("timeupdate",updateClock);
  player.addEventListener("error",function(){if(zipFile){setStatus("This video entry could not be decoded by this browser. Try ‘Choose one video manually’.",true)}else{setStatus("Your phone blocked direct access to the neighbouring video. Tap ‘Open complete evidence ZIP’ above and choose this evidence ZIP once.",true)}});
  if(expectedMedia.length)loadRelative();else setStatus("No video files were listed in this evidence package.",true);
})();
</script>
</body>
</html>`;
  }

  async function makeZip(entries) {
    const list = Array.isArray(entries) ? entries.slice() : [];
    const mediaNames = list.filter(isMedia).map((entry) => String(entry.name || "")).filter(Boolean);
    if (mediaNames.length && !list.some((entry) => String(entry.name || "").toLowerCase() === PLAYER_NAME.toLowerCase())) {
      list.unshift({
        name: PLAYER_NAME,
        blob: new Blob([playerHtml(mediaNames)], { type: "text/html;charset=utf-8" }),
        date: new Date(),
      });
    }
    return prior.makeZip(list);
  }

  global.MilosObservationBundle = Object.freeze(Object.assign({}, prior, {
    version: VERSION,
    portableEvidencePlayer: true,
    evidencePlayerName: PLAYER_NAME,
    directZipPlayback: true,
    localOnlyZipReader: true,
    makeZip,
  }));

  global.MilosEvidencePlayer = Object.freeze({
    version: VERSION,
    filename: PLAYER_NAME,
    offline: true,
    manualTimestampJump: true,
    draggableTimeline: true,
    directZipPlayback: true,
    filePickerFallback: true,
    evidenceNeverUploaded: true,
  });
})(typeof window !== "undefined" ? window : globalThis);
