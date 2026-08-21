(function (global) {
  "use strict";

  const original = global.MilosMedia;
  if (!original) return;

  const MAX_VIDEO_BYTES_PER_MINUTE = 11 * 1000 * 1000;
  const CAPTURE_VIDEO_BITS_PER_SECOND = 1300000;
  const CAPTURE_AUDIO_BITS_PER_SECOND = 96000;
  const CAPTURE_TOTAL_BYTES_PER_MINUTE = Math.round(((CAPTURE_VIDEO_BITS_PER_SECOND + CAPTURE_AUDIO_BITS_PER_SECOND) / 8) * 60);
  const processedVideos = new WeakSet();
  let activeRecorder = null;

  function cleanName(value, fallback) {
    const name = String(value || fallback || "Milos-media")
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    return name || fallback || "Milos-media";
  }

  function extensionFor(type) {
    const mime = String(type || "").toLowerCase();
    if (mime.includes("mp4")) return ".mp4";
    if (mime.includes("webm")) return ".webm";
    if (mime.includes("ogg")) return ".ogg";
    return ".webm";
  }

  function fileFrom(blob, source, name) {
    const type = String(blob.type || source && source.type || "application/octet-stream");
    const filename = cleanName(name || source && source.name, "Milos-media" + extensionFor(type));
    const modified = Number(source && source.lastModified || Date.now());
    try { return new File([blob], filename, { type, lastModified: modified }); }
    catch (_) {
      blob.name = filename;
      blob.lastModified = modified;
      return blob;
    }
  }

  function concat(parts, type) {
    return new Blob(parts, { type: type || "application/octet-stream" });
  }

  function exifOrientation(payload) {
    try {
      if (payload.length < 14) return 0;
      const exif = String.fromCharCode.apply(null, Array.from(payload.slice(0, 6)));
      if (exif !== "Exif\u0000\u0000") return 0;
      const bytes = payload;
      const tiff = 6;
      const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
      const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
      if (!little && !big) return 0;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const u16 = (offset) => view.getUint16(offset, little);
      const u32 = (offset) => view.getUint32(offset, little);
      if (u16(tiff + 2) !== 42) return 0;
      const ifd = tiff + u32(tiff + 4);
      if (ifd < tiff || ifd + 2 > bytes.length) return 0;
      const count = u16(ifd);
      for (let index = 0; index < count; index += 1) {
        const at = ifd + 2 + index * 12;
        if (at + 12 > bytes.length) break;
        if (u16(at) !== 0x0112) continue;
        const type = u16(at + 2);
        const amount = u32(at + 4);
        if (type === 3 && amount >= 1) return u16(at + 8);
      }
    } catch (_) {}
    return 0;
  }

  function isXmp(payload) {
    const marker = "http://ns.adobe.com/xap/1.0/";
    if (!payload || payload.length < marker.length) return false;
    let value = "";
    for (let index = 0; index < marker.length; index += 1) value += String.fromCharCode(payload[index]);
    return value === marker;
  }

  async function minimiseJpeg(file) {
    const source = new Uint8Array(await file.arrayBuffer());
    if (source.length < 4 || source[0] !== 0xff || source[1] !== 0xd8) return file;
    const parts = [source.slice(0, 2)];
    let position = 2;
    let changed = false;

    while (position < source.length) {
      const markerStart = position;
      if (source[position] !== 0xff) {
        parts.push(source.slice(position));
        break;
      }
      while (position < source.length && source[position] === 0xff) position += 1;
      if (position >= source.length) break;
      const marker = source[position];
      position += 1;

      if (marker === 0xd9) {
        parts.push(source.slice(markerStart, position));
        break;
      }
      if (marker === 0xda) {
        parts.push(source.slice(markerStart));
        position = source.length;
        break;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        parts.push(source.slice(markerStart, position));
        continue;
      }
      if (position + 2 > source.length) return file;
      const length = (source[position] << 8) | source[position + 1];
      if (length < 2) return file;
      const end = position + length;
      if (end > source.length) return file;
      const payload = source.slice(position + 2, end);
      let remove = marker === 0xfe || marker === 0xed;
      if (marker === 0xe1) {
        if (isXmp(payload)) remove = true;
        else {
          const orientation = exifOrientation(payload);
          if (orientation === 0 || orientation === 1) remove = true;
        }
      }
      if (remove) changed = true;
      else parts.push(source.slice(markerStart, end));
      position = end;
    }

    if (!changed) return file;
    const output = concat(parts, file.type || "image/jpeg");
    return output.size < file.size ? fileFrom(output, file, file.name) : file;
  }

  async function minimisePng(file) {
    const source = new Uint8Array(await file.arrayBuffer());
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (source.length < 12 || signature.some((value, index) => source[index] !== value)) return file;
    const parts = [source.slice(0, 8)];
    const removable = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
    let position = 8;
    let changed = false;
    while (position + 12 <= source.length) {
      const view = new DataView(source.buffer, source.byteOffset + position, source.byteLength - position);
      const length = view.getUint32(0, false);
      const end = position + 12 + length;
      if (end > source.length) return file;
      const type = String.fromCharCode(source[position + 4], source[position + 5], source[position + 6], source[position + 7]);
      if (removable.has(type)) changed = true;
      else parts.push(source.slice(position, end));
      position = end;
      if (type === "IEND") break;
    }
    if (!changed) return file;
    const output = concat(parts, file.type || "image/png");
    return output.size < file.size ? fileFrom(output, file, file.name) : file;
  }

  async function minimiseImageLossless(file) {
    const type = String(file && file.type || "").toLowerCase();
    try {
      if (type === "image/jpeg" || type === "image/jpg") return await minimiseJpeg(file);
      if (type === "image/png") return await minimisePng(file);
    } catch (_) {}
    return file;
  }

  function waitFor(target, event, timeout) {
    return new Promise((resolve, reject) => {
      let timer = null;
      const done = () => {
        if (timer) clearTimeout(timer);
        target.removeEventListener(event, done);
        target.removeEventListener("error", fail);
        resolve();
      };
      const fail = () => {
        if (timer) clearTimeout(timer);
        target.removeEventListener(event, done);
        target.removeEventListener("error", fail);
        reject(new Error("The video could not be prepared for compression."));
      };
      target.addEventListener(event, done, { once: true });
      target.addEventListener("error", fail, { once: true });
      timer = setTimeout(fail, timeout || 12000);
    });
  }

  async function videoInfo(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.playsInline = true;
      video.muted = true;
      video.src = url;
      await waitFor(video, "loadedmetadata", 15000);
      return {
        duration: Number(video.duration || 0),
        width: Number(video.videoWidth || 0),
        height: Number(video.videoHeight || 0),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function recorderMime() {
    const choices = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/webm",
      "video/mp4",
    ];
    if (!global.MediaRecorder) return "";
    return choices.find((type) => !MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(type)) || "";
  }

  function recorderOptions(mimeType, videoBits) {
    const options = {
      videoBitsPerSecond: Math.max(450000, Math.round(videoBits || CAPTURE_VIDEO_BITS_PER_SECOND)),
      audioBitsPerSecond: CAPTURE_AUDIO_BITS_PER_SECOND,
    };
    if (mimeType) options.mimeType = mimeType;
    return options;
  }

  async function recordStream(stream, options, stopPromise) {
    const chunks = [];
    const recorder = new MediaRecorder(stream, options);
    const stopped = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = (event) => reject(event.error || new Error("Video compression failed."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || options.mimeType || "video/webm" }));
    });
    recorder.start(1000);
    let stopError = null;
    try { await stopPromise; } catch (error) { stopError = error; }
    if (recorder.state !== "inactive") recorder.stop();
    const blob = await stopped;
    if (stopError) throw stopError;
    return blob;
  }

  async function transcodeVideo(source, videoBits) {
    if (!global.MediaRecorder) throw new Error("This browser cannot compress imported videos. Record the video directly in Milos instead.");
    const capture = HTMLMediaElement.prototype.captureStream || HTMLMediaElement.prototype.mozCaptureStream;
    if (typeof capture !== "function") throw new Error("This browser cannot compress imported videos while keeping their audio. Record the video directly in Milos instead.");
    const url = URL.createObjectURL(source);
    const video = document.createElement("video");
    video.playsInline = true;
    video.preload = "auto";
    video.muted = true;
    video.src = url;
    video.style.position = "fixed";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    document.body.appendChild(video);
    try {
      await waitFor(video, "loadeddata", 20000);
      const stream = capture.call(video);
      if (!stream || !stream.getVideoTracks().length) throw new Error("The selected video cannot be compressed on this device.");
      const sourceHasKnownAudio = video.audioTracks && typeof video.audioTracks.length === "number" ? video.audioTracks.length > 0 : null;
      if (sourceHasKnownAudio && !stream.getAudioTracks().length) throw new Error("Milos will not compress this video because this browser would drop its audio. Record it directly in Milos instead.");
      const mimeType = recorderMime();
      const ended = new Promise((resolve, reject) => {
        video.addEventListener("ended", resolve, { once: true });
        video.addEventListener("error", () => reject(new Error("The selected video could not be played for compression.")), { once: true });
      });
      const resultPromise = recordStream(stream, recorderOptions(mimeType, videoBits), ended);
      await video.play();
      const result = await resultPromise;
      stream.getTracks().forEach((track) => track.stop());
      const extension = extensionFor(result.type || mimeType);
      const baseName = cleanName(source.name || "Milos-video", "Milos-video").replace(/\.[a-z0-9]{2,6}$/i, "");
      return fileFrom(result, source, `${baseName}${extension}`);
    } finally {
      try { video.pause(); } catch (_) {}
      video.remove();
      URL.revokeObjectURL(url);
    }
  }

  async function ensureVideoTarget(file) {
    if (!file || !String(file.type || "").startsWith("video/")) return file;
    if (processedVideos.has(file)) return file;
    const info = await videoInfo(file);
    if (!Number.isFinite(info.duration) || info.duration <= 0) {
      throw new Error("Milos could not read the video duration, so it will not save an unverified video.");
    }
    const maximum = Math.max(64 * 1024, (MAX_VIDEO_BYTES_PER_MINUTE * info.duration) / 60);
    if (file.size <= maximum) {
      processedVideos.add(file);
      return file;
    }
    let output = await transcodeVideo(file, CAPTURE_VIDEO_BITS_PER_SECOND);
    if (output.size > maximum) {
      const adjusted = Math.max(450000, Math.floor(CAPTURE_VIDEO_BITS_PER_SECOND * (maximum / output.size) * 0.92));
      output = await transcodeVideo(file, adjusted);
    }
    if (output.size > maximum) {
      throw new Error("This video could not be reduced to 11 MB/min without risking its audio. Record it directly in Milos instead.");
    }
    processedVideos.add(output);
    return output;
  }

  async function putFile(file) {
    if (!file || !(file instanceof Blob)) throw new Error("Choose a photo, video or audio file first.");
    let optimised = file;
    const type = String(file.type || "").toLowerCase();
    if (type.startsWith("image/")) optimised = await minimiseImageLossless(file);
    if (type.startsWith("video/")) optimised = await ensureVideoTarget(file);
    return original.putFile(optimised);
  }

  async function putFiles(files) {
    const list = Array.from(files || []).slice(0, 12);
    const saved = [];
    for (const file of list) saved.push(await putFile(file));
    return saved;
  }

  function stopTracks(stream) {
    if (stream && stream.getTracks) stream.getTracks().forEach((track) => {
      try { track.stop(); } catch (_) {}
    });
  }

  function closeRecorder() {
    if (!activeRecorder) return;
    const current = activeRecorder;
    activeRecorder = null;
    current.cancelled = true;
    try {
      if (current.recorder && current.recorder.state !== "inactive") current.recorder.stop();
    } catch (_) {}
    stopTracks(current.stream);
    if (current.timer) clearInterval(current.timer);
    current.layer && current.layer.remove();
  }

  function recorderStyles() {
    if (document.getElementById("milos-media-optimize-v24-style")) return;
    const style = document.createElement("style");
    style.id = "milos-media-optimize-v24-style";
    style.textContent = `
.milos-video-recorder-layer{position:fixed;inset:0;z-index:12000;background:rgba(10,14,22,.94);display:grid;place-items:center;padding:max(1rem,env(safe-area-inset-top)) 1rem max(1rem,env(safe-area-inset-bottom));box-sizing:border-box}
.milos-video-recorder-card{width:min(100%,620px);max-height:100%;overflow:auto;background:#f6f9ff;border-radius:1.5rem;padding:1rem;box-sizing:border-box;color:#20242b}
.milos-video-recorder-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.8rem}.milos-video-recorder-head strong{font-size:1rem}.milos-video-recorder-close{border:0;background:transparent;font:inherit;font-size:1.5rem;padding:.25rem .5rem}
.milos-video-recorder-preview{width:100%;aspect-ratio:16/9;background:#0c0f14;border-radius:1rem;object-fit:cover;display:block}
.milos-video-recorder-status{display:flex;justify-content:space-between;gap:.75rem;margin:.65rem 0;color:#626a75;font-size:.76rem}.milos-video-recorder-status b{color:#2c85f7}
.milos-video-recorder-actions{display:grid;grid-template-columns:1fr 1fr;gap:.55rem}.milos-video-recorder-actions button{border:0;border-radius:999px;padding:.85rem 1rem;font:inherit}.milos-video-recorder-start{background:#2c85f7;color:#fff}.milos-video-recorder-stop{background:#20242b;color:#fff}.milos-video-recorder-stop:disabled{opacity:.35}.milos-video-recorder-note{font-size:.72rem;line-height:1.4;color:#717884;margin:.75rem .15rem 0}
`;
    document.head.appendChild(style);
  }

  function setInputFile(input, file) {
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function openVideoRecorder(input) {
    if (!input) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !global.MediaRecorder) {
      throw new Error("Milos video capture is not supported by this browser.");
    }
    closeRecorder();
    recorderStyles();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: {
        channelCount: { ideal: 2 },
        sampleRate: { ideal: 48000 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const layer = document.createElement("section");
    layer.className = "milos-video-recorder-layer";
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.innerHTML = `<div class="milos-video-recorder-card"><div class="milos-video-recorder-head"><strong>Record observation video</strong><button type="button" class="milos-video-recorder-close" aria-label="Close">×</button></div><video class="milos-video-recorder-preview" muted autoplay playsinline></video><div class="milos-video-recorder-status"><span data-milos-video-state>Camera ready</span><b data-milos-video-time>00:00</b></div><div class="milos-video-recorder-actions"><button type="button" class="milos-video-recorder-start">Start recording</button><button type="button" class="milos-video-recorder-stop" disabled>Stop & use video</button></div><p class="milos-video-recorder-note">Milos records at approximately ${(CAPTURE_TOTAL_BYTES_PER_MINUTE / 1000000).toFixed(1)} MB/min, keeps the microphone audio and limits the recording before it enters private storage.</p></div>`;
    document.body.appendChild(layer);
    const preview = layer.querySelector("video");
    const start = layer.querySelector(".milos-video-recorder-start");
    const stop = layer.querySelector(".milos-video-recorder-stop");
    const close = layer.querySelector(".milos-video-recorder-close");
    const state = layer.querySelector("[data-milos-video-state]");
    const time = layer.querySelector("[data-milos-video-time]");
    preview.srcObject = stream;
    try { await preview.play(); } catch (_) {}

    const session = { layer, stream, recorder: null, timer: null, startedAt: 0, cancelled: false };
    activeRecorder = session;
    close.addEventListener("click", closeRecorder);

    start.addEventListener("click", () => {
      if (!activeRecorder || activeRecorder !== session) return;
      const mimeType = recorderMime();
      const chunks = [];
      let recorder;
      try { recorder = new MediaRecorder(stream, recorderOptions(mimeType, CAPTURE_VIDEO_BITS_PER_SECOND)); }
      catch (error) {
        state.textContent = error.message || "Recording could not start.";
        return;
      }
      session.recorder = recorder;
      session.startedAt = Date.now();
      recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = (event) => { state.textContent = event.error && event.error.message || "Recording error."; };
      recorder.onstop = async () => {
        if (session.cancelled || !chunks.length) return;
        state.textContent = "Optimising video…";
        start.disabled = true;
        stop.disabled = true;
        try {
          const type = recorder.mimeType || mimeType || "video/webm";
          const blob = new Blob(chunks, { type });
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          let file = fileFrom(blob, null, `Milos-observation-${stamp}${extensionFor(type)}`);
          file = await ensureVideoTarget(file);
          if (!setInputFile(input, file)) throw new Error("Milos could not pass the recorded video into the observation.");
          closeRecorder();
        } catch (error) {
          state.textContent = error.message || "The video could not be saved.";
          start.disabled = false;
        }
      };
      recorder.start(1000);
      start.disabled = true;
      stop.disabled = false;
      state.textContent = "Recording";
      session.timer = setInterval(() => {
        const seconds = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
        time.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      }, 250);
    });

    stop.addEventListener("click", () => {
      if (!session.recorder || session.recorder.state === "inactive") return;
      if (session.timer) { clearInterval(session.timer); session.timer = null; }
      stop.disabled = true;
      state.textContent = "Finishing recording…";
      session.recorder.stop();
    });
  }

  function directVideoInput(label) {
    if (!label || !label.querySelector) return null;
    const input = label.querySelector('input[type="file"][accept="video/*"][capture]');
    return input || null;
  }

  function patchCaptureLabels(scope) {
    const root = scope || document;
    const labels = [];
    if (root.nodeType === 1 && root.matches && root.matches(".milos-media-actions label")) labels.push(root);
    if (root.querySelectorAll) labels.push(...root.querySelectorAll(".milos-media-actions label"));
    labels.forEach((label) => {
      const input = directVideoInput(label);
      if (!input || label.dataset.milosOptimisedVideo === "1") return;
      label.dataset.milosOptimisedVideo = "1";
      label.title = "Record in Milos at about 11 MB/min with audio";
      const textNode = Array.from(label.childNodes).find((node) => node.nodeType === 3 && node.nodeValue.trim());
      if (textNode) textNode.nodeValue = "Record video";
    });
  }

  function startUi() {
    patchCaptureLabels(document);
    document.addEventListener("click", (event) => {
      const label = event.target && event.target.closest ? event.target.closest(".milos-media-actions label") : null;
      const input = directVideoInput(label);
      if (!input) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      openVideoRecorder(input).catch((error) => {
        global.alert && global.alert(error.message || "Milos video capture could not start.");
      });
    }, true);
    if (global.MutationObserver) {
      const root = document.getElementById("milosApp") || document.body;
      new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node.nodeType === 1) patchCaptureLabels(node);
      }))).observe(root, { childList: true, subtree: true });
    }
  }

  global.MilosMedia = Object.freeze(Object.assign({}, original, {
    putFile,
    putFiles,
    minimiseImageLossless,
    ensureVideoTarget,
    openVideoRecorder,
    MAX_VIDEO_BYTES_PER_MINUTE,
    TARGET_CAPTURE_BYTES_PER_MINUTE: CAPTURE_TOTAL_BYTES_PER_MINUTE,
    version: "2.4",
  }));

  if (!global.document) return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startUi, { once: true });
  else startUi();
})(window);
