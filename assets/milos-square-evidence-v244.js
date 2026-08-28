(function (global) {
  "use strict";

  const VERSION = "2.44";
  const SQUARE_SIZE = 720;
  const SQUARE_VIDEO_BITS = 1100000;
  const PLAYER_NAME = "00_OPEN_EVIDENCE.html";
  const mediaDevices = global.navigator && global.navigator.mediaDevices;
  const NativeMediaRecorder = global.MediaRecorder;

  function numericConstraint(value, key) {
    if (typeof value === "number") return value;
    if (!value || typeof value !== "object") return 0;
    return Number(value[key] == null ? value.exact == null ? 0 : value.exact : value[key]) || 0;
  }

  function looksLikeMilosObservationRequest(constraints) {
    if (!constraints || !constraints.audio || !constraints.video || typeof constraints.video !== "object") return false;
    const width = numericConstraint(constraints.video.width, "ideal");
    const height = numericConstraint(constraints.video.height, "ideal");
    return width === 1280 && height === 720;
  }

  function squareSettings(track) {
    if (!track || typeof track.getSettings !== "function") return false;
    const settings = track.getSettings() || {};
    const width = Number(settings.width || 0);
    const height = Number(settings.height || 0);
    if (!width || !height) return false;
    return Math.abs((width / height) - 1) <= 0.04;
  }

  function squareVideoConstraints(video) {
    const next = Object.assign({}, video || {});
    next.facingMode = next.facingMode || { ideal: "environment" };
    next.width = { ideal: SQUARE_SIZE, max: SQUARE_SIZE };
    next.height = { ideal: SQUARE_SIZE, max: SQUARE_SIZE };
    next.aspectRatio = { ideal: 1 };
    next.resizeMode = { ideal: "crop-and-scale" };
    return next;
  }

  async function ensureSquareTrack(stream) {
    const track = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
    if (!track) throw new Error("Camera video is unavailable.");
    if (squareSettings(track)) return stream;

    if (typeof track.applyConstraints === "function") {
      try {
        await track.applyConstraints({
          width: { ideal: SQUARE_SIZE, max: SQUARE_SIZE },
          height: { ideal: SQUARE_SIZE, max: SQUARE_SIZE },
          aspectRatio: { exact: 1 },
          resizeMode: { ideal: "crop-and-scale" }
        });
      } catch (_) {}
    }

    if (squareSettings(track)) return stream;
    try { stream.getTracks().forEach((item) => item.stop()); } catch (_) {}
    throw new Error("This camera could not provide Milos's 1:1 evidence frame. Try reopening the camera or switching camera before recording.");
  }

  let nativeGetUserMedia = null;
  let observationFallbackUntil = 0;

  if (mediaDevices && typeof mediaDevices.getUserMedia === "function") {
    nativeGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);

    async function requestSquare(constraints) {
      const next = Object.assign({}, constraints, { video: squareVideoConstraints(constraints && constraints.video) });
      let stream;
      try {
        stream = await nativeGetUserMedia(next);
      } catch (_) {
        const relaxed = Object.assign({}, next, {
          video: Object.assign({}, next.video, {
            width: { ideal: SQUARE_SIZE },
            height: { ideal: SQUARE_SIZE },
            aspectRatio: { ideal: 1 }
          })
        });
        stream = await nativeGetUserMedia(relaxed);
      }
      return ensureSquareTrack(stream);
    }

    mediaDevices.getUserMedia = function (constraints) {
      if (looksLikeMilosObservationRequest(constraints)) {
        observationFallbackUntil = Date.now() + 6000;
        return requestSquare(constraints);
      }

      const fallback = constraints && constraints.audio === true && constraints.video && typeof constraints.video === "object" && constraints.video.facingMode;
      if (fallback && Date.now() < observationFallbackUntil) return requestSquare(constraints);
      return nativeGetUserMedia(constraints);
    };
  }

  if (NativeMediaRecorder) {
    function MilosMediaRecorder(stream, options) {
      let next = options;
      try {
        const track = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
        const square = squareSettings(track);
        if (square && options && Number(options.videoBitsPerSecond || 0) >= 1500000) {
          next = Object.assign({}, options, { videoBitsPerSecond: SQUARE_VIDEO_BITS });
        }
      } catch (_) {}
      return new NativeMediaRecorder(stream, next);
    }

    MilosMediaRecorder.prototype = NativeMediaRecorder.prototype;
    try { Object.setPrototypeOf(MilosMediaRecorder, NativeMediaRecorder); } catch (_) {}
    if (typeof NativeMediaRecorder.isTypeSupported === "function") {
      MilosMediaRecorder.isTypeSupported = NativeMediaRecorder.isTypeSupported.bind(NativeMediaRecorder);
    }
    global.MediaRecorder = MilosMediaRecorder;
  }

  function desktopViewerCss() {
    return `
<style id="milosEvidenceDesktopV244">
@media (min-width:821px){
  html,body{height:100%;overflow:hidden}
  body{padding:10px}
  .wrap{max-width:1480px;height:calc(100vh - 20px);padding:14px 16px;display:flex;flex-direction:column;overflow:hidden}
  h1{font-size:22px;margin-bottom:2px}
  .summary{font-size:13px;margin-bottom:6px}
  .notice{font-size:13px;line-height:1.3;margin:7px 0;padding:8px 11px}
  .zipPick{font-size:14px;padding:8px 12px}
  .viewer{flex:1 1 auto;min-height:0;grid-template-columns:minmax(0,1fr) minmax(340px,420px);gap:14px;align-items:stretch;margin-top:8px}
  .videoCol{min-width:0;min-height:0;height:100%;display:flex;flex-direction:column;overflow:hidden}
  .videoCol>.row{flex:0 0 auto;margin:0 0 7px;gap:7px}
  .videoCol>video,.videoCol>audio{display:block;flex:1 1 auto;min-height:0;height:100%;max-height:100%;width:100%;object-fit:contain;margin:0;background:#000;border-radius:12px}
  .seek{flex:0 0 auto;margin-top:7px}
  .status,.help{flex:0 0 auto;margin-top:4px;font-size:12px;line-height:1.25}
  .criteriaBox{min-height:0;height:100%;display:flex;flex-direction:column}
  .criteriaHead,.filter{flex:0 0 auto}
  .criteriaList{flex:1 1 auto;min-height:0;max-height:none;overflow:auto}
}
@media (min-width:821px) and (max-height:800px){
  .wrap{padding:10px 12px}
  h1{font-size:20px}
  .notice{margin:5px 0;padding:6px 9px}
  .zipPick{padding:7px 10px}
  .viewer{margin-top:6px;gap:10px;grid-template-columns:minmax(0,1fr) minmax(320px,390px)}
  .videoCol>.row{margin-bottom:5px}
  select,input[type=text],button,.pick{padding:7px 9px}
  .criteriaHead{padding:9px 11px}.filter{padding:7px 9px}
}
</style>`;
  }

  const bundle = global.MilosObservationBundle;
  if (bundle && typeof bundle.makeZip === "function" && typeof Blob !== "undefined") {
    const baseMakeZip = bundle.makeZip.bind(bundle);
    async function makeZip(entries) {
      const list = Array.isArray(entries) ? entries.slice() : [];
      for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        if (!entry || String(entry.name || "").toLowerCase() !== PLAYER_NAME.toLowerCase() || !(entry.blob instanceof Blob)) continue;
        try {
          const html = await entry.blob.text();
          if (!html.includes("Milos Evidence Viewer") || html.includes("milosEvidenceDesktopV244")) continue;
          const nextHtml = html.replace("</head>", `${desktopViewerCss()}\n</head>`);
          list[i] = Object.assign({}, entry, { blob: new Blob([nextHtml], { type: "text/html;charset=utf-8" }) });
        } catch (_) {}
      }
      return baseMakeZip(list);
    }

    global.MilosObservationBundle = Object.freeze(Object.assign({}, bundle, {
      makeZip,
      squareEvidenceV244: true,
      desktopEvidenceFitV244: true
    }));
  }

  global.MilosSquareEvidence = Object.freeze({
    version: VERSION,
    squareSize: SQUARE_SIZE,
    videoBitsPerSecond: SQUARE_VIDEO_BITS,
    trueSquareCapture: true,
    previewMatchesCapture: true,
    desktopEvidenceFit: true,
    noReencode: true
  });
})(typeof window !== "undefined" ? window : globalThis);
