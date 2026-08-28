(function (global) {
  "use strict";

  const prior = global.MilosObservationBundle;
  if (!prior || typeof prior.makeZip !== "function" || typeof Blob === "undefined") return;

  const VERSION = "2.40";
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
:root{font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#f3f6fa}*{box-sizing:border-box}body{margin:0;padding:24px}.wrap{max-width:980px;margin:auto;background:#fff;border:1px solid #dbe3ec;border-radius:16px;padding:24px;box-shadow:0 8px 28px rgba(30,55,85,.08)}h1{margin:0 0 6px;color:#254973;font-size:26px}p{line-height:1.5}.notice{background:#eef5fc;border-left:4px solid #254973;padding:12px 14px;margin:18px 0;border-radius:8px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}select,input[type=text],button,.pick{font:inherit;border:1px solid #c7d1dc;border-radius:9px;padding:10px 12px;background:#fff}select{min-width:280px;flex:1}button,.pick{cursor:pointer;font-weight:700}.primary{background:#254973;color:#fff;border-color:#254973}.pick input{display:none}video,audio{width:100%;background:#000;border-radius:12px;margin-top:12px;min-height:56px}.seek{display:grid;grid-template-columns:auto 120px auto auto;gap:10px;align-items:center;margin-top:14px}.seek input[type=range]{grid-column:1/-1;width:100%}.time{font-variant-numeric:tabular-nums;font-weight:700;color:#42556b}.status{min-height:24px;color:#5b6674}.error{color:#9b1c1c;font-weight:700}@media(max-width:640px){body{padding:10px}.wrap{padding:16px}.seek{grid-template-columns:1fr 1fr}.seek input[type=range]{grid-column:1/-1}.seek input[type=text]{width:100%}}
</style>
</head>
<body>
<main class="wrap">
<h1>Milos Evidence Player</h1>
<p>Offline playback for assessor evidence. No internet connection is required.</p>
<div class="notice"><strong>For reliable timeline seeking:</strong> extract the complete ZIP to a normal folder first, then open this file. Opening a video directly inside a ZIP can make some Windows, Android and archive viewers play it as a one-way stream.</div>
<div class="row"><select id="files" aria-label="Evidence video"></select><button id="load" class="primary" type="button">Load selected video</button><label class="pick">Choose a video manually<input id="picker" type="file" accept="video/*,audio/*"></label></div>
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
</main>
<script>
(function(){
  "use strict";
  const mediaNames=${namesJson};
  const files=document.getElementById("files"), player=document.getElementById("player"), status=document.getElementById("status"), scrub=document.getElementById("scrub"), clock=document.getElementById("clock"), jump=document.getElementById("jump");
  let objectUrl="";
  function fmt(value){const n=Math.max(0,Math.floor(Number(value)||0)),h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=n%60;return h?String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
  function parseTime(value){const parts=String(value||"").trim().split(":").map(Number);if(!parts.length||parts.some(n=>!Number.isFinite(n)||n<0))return NaN;if(parts.length===1)return parts[0];if(parts.length===2)return parts[0]*60+parts[1];if(parts.length===3)return parts[0]*3600+parts[1]*60+parts[2];return NaN}
  function setStatus(text,error){status.textContent=text||"";status.className=error?"status error":"status"}
  function clearObject(){if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=""}}
  function loadRelative(){clearObject();const name=files.value;if(!name)return;setStatus("Loading "+name+" …");player.src=encodeURIComponent(name);player.load()}
  mediaNames.forEach((name)=>{const option=document.createElement("option");option.value=name;option.textContent=name;files.appendChild(option)});
  document.getElementById("load").addEventListener("click",loadRelative);
  document.getElementById("picker").addEventListener("change",(event)=>{const file=event.target.files&&event.target.files[0];if(!file)return;clearObject();objectUrl=URL.createObjectURL(file);player.src=objectUrl;player.load();setStatus("Loaded "+file.name)});
  document.getElementById("back").addEventListener("click",()=>{if(Number.isFinite(player.duration))player.currentTime=Math.max(0,player.currentTime-10)});
  document.getElementById("forward").addEventListener("click",()=>{if(Number.isFinite(player.duration))player.currentTime=Math.min(player.duration,player.currentTime+10)});
  document.getElementById("go").addEventListener("click",()=>{const target=parseTime(jump.value);if(!Number.isFinite(target)){setStatus("Enter a timestamp such as 04:18.",true);return}if(!Number.isFinite(player.duration)){setStatus("Load a video first.",true);return}player.currentTime=Math.min(Math.max(0,target),player.duration);player.play().catch(()=>{});setStatus("Jumped to "+fmt(player.currentTime))});
  scrub.addEventListener("input",()=>{if(Number.isFinite(player.duration)&&player.duration>0)player.currentTime=player.duration*(Number(scrub.value)/1000)});
  player.addEventListener("loadedmetadata",()=>{setStatus("Ready — drag the timeline or enter a PDF timestamp.");clock.textContent=fmt(player.currentTime)+" / "+fmt(player.duration)});
  player.addEventListener("timeupdate",()=>{if(Number.isFinite(player.duration)&&player.duration>0)scrub.value=String(Math.round((player.currentTime/player.duration)*1000));clock.textContent=fmt(player.currentTime)+" / "+fmt(player.duration)});
  player.addEventListener("error",()=>setStatus("This video could not be opened from its current location. Extract the whole ZIP first, reopen this Evidence Player, or use ‘Choose a video manually’.",true));
  if(mediaNames.length)loadRelative();else setStatus("No video files were listed in this evidence package.",true);
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
    makeZip,
  }));

  global.MilosEvidencePlayer = Object.freeze({
    version: VERSION,
    filename: PLAYER_NAME,
    offline: true,
    manualTimestampJump: true,
    draggableTimeline: true,
    filePickerFallback: true,
  });
})(typeof window !== "undefined" ? window : globalThis);
