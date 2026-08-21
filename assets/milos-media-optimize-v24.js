(function (global) {
  "use strict";

  const original = global.MilosMedia;
  if (!original) return;

  const MAX_VIDEO_BYTES_PER_MINUTE = 11 * 1000 * 1000;
  const EXPORT_VIDEO_BITS_PER_SECOND = 1280000;
  const EXPORT_AUDIO_BITS_PER_SECOND = 96000;

  function cleanName(value, fallback) {
    const name = String(value || fallback || "Milos-media")
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
      .replace(/\s+/g, " ").trim().slice(0, 140);
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
    try { return new File([blob], filename, { type, lastModified: Number(source && source.lastModified || Date.now()) }); }
    catch (_) { blob.name = filename; return blob; }
  }

  function concat(parts, type) { return new Blob(parts, { type: type || "application/octet-stream" }); }

  function exifOrientation(payload) {
    try {
      if (payload.length < 14) return 0;
      let prefix = "";
      for (let i = 0; i < 6; i += 1) prefix += String.fromCharCode(payload[i]);
      if (prefix !== "Exif\u0000\u0000") return 0;
      const tiff = 6, little = payload[tiff] === 0x49 && payload[tiff + 1] === 0x49;
      if (!little && !(payload[tiff] === 0x4d && payload[tiff + 1] === 0x4d)) return 0;
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      const u16 = o => view.getUint16(o, little), u32 = o => view.getUint32(o, little);
      if (u16(tiff + 2) !== 42) return 0;
      const ifd = tiff + u32(tiff + 4), count = u16(ifd);
      for (let i = 0; i < count; i += 1) {
        const at = ifd + 2 + i * 12;
        if (at + 12 > payload.length) break;
        if (u16(at) === 0x0112 && u16(at + 2) === 3 && u32(at + 4) >= 1) return u16(at + 8);
      }
    } catch (_) {}
    return 0;
  }

  function isXmp(payload) {
    const marker = "http://ns.adobe.com/xap/1.0/";
    if (!payload || payload.length < marker.length) return false;
    let value = "";
    for (let i = 0; i < marker.length; i += 1) value += String.fromCharCode(payload[i]);
    return value === marker;
  }

  async function minimiseJpeg(file) {
    const source = new Uint8Array(await file.arrayBuffer());
    if (source.length < 4 || source[0] !== 0xff || source[1] !== 0xd8) return file;
    const parts = [source.slice(0, 2)];
    let position = 2, changed = false;
    while (position < source.length) {
      const start = position;
      if (source[position] !== 0xff) { parts.push(source.slice(position)); break; }
      while (position < source.length && source[position] === 0xff) position += 1;
      if (position >= source.length) break;
      const marker = source[position++];
      if (marker === 0xd9) { parts.push(source.slice(start, position)); break; }
      if (marker === 0xda) { parts.push(source.slice(start)); break; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { parts.push(source.slice(start, position)); continue; }
      if (position + 2 > source.length) return file;
      const length = (source[position] << 8) | source[position + 1], end = position + length;
      if (length < 2 || end > source.length) return file;
      const payload = source.slice(position + 2, end);
      let remove = marker === 0xfe || marker === 0xed;
      if (marker === 0xe1) remove = isXmp(payload) || [0, 1].includes(exifOrientation(payload));
      if (remove) changed = true; else parts.push(source.slice(start, end));
      position = end;
    }
    if (!changed) return file;
    const output = concat(parts, file.type || "image/jpeg");
    return output.size < file.size ? fileFrom(output, file, file.name) : file;
  }

  async function minimisePng(file) {
    const source = new Uint8Array(await file.arrayBuffer());
    const signature = [137,80,78,71,13,10,26,10];
    if (source.length < 12 || signature.some((v,i) => source[i] !== v)) return file;
    const parts = [source.slice(0, 8)], removable = new Set(["tEXt","zTXt","iTXt","eXIf","tIME"]);
    let position = 8, changed = false;
    while (position + 12 <= source.length) {
      const length = new DataView(source.buffer, source.byteOffset + position, 4).getUint32(0, false);
      const end = position + 12 + length;
      if (end > source.length) return file;
      const type = String.fromCharCode(source[position+4],source[position+5],source[position+6],source[position+7]);
      if (removable.has(type)) changed = true; else parts.push(source.slice(position, end));
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
      let timer;
      const cleanup = () => { target.removeEventListener(event, done); target.removeEventListener("error", fail); };
      const done = () => { clearTimeout(timer); cleanup(); resolve(); };
      const fail = () => { clearTimeout(timer); cleanup(); reject(new Error("The video could not be prepared.")); };
      target.addEventListener(event, done, { once: true });
      target.addEventListener("error", fail, { once: true });
      timer = setTimeout(fail, timeout || 18000);
    });
  }

  async function videoInfo(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const video = document.createElement("video");
      video.preload = "metadata"; video.playsInline = true; video.muted = true; video.src = url;
      await waitFor(video, "loadedmetadata", 18000);
      return { duration: Number(video.duration || 0), width: Number(video.videoWidth || 0), height: Number(video.videoHeight || 0) };
    } finally { URL.revokeObjectURL(url); }
  }

  function recorderMime() {
    if (!global.MediaRecorder) return "";
    const choices = ["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/webm","video/mp4"];
    return choices.find(type => !MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(type)) || "";
  }

  function recorderOptions(videoBits) {
    const options = { videoBitsPerSecond: Math.max(420000, Math.round(videoBits || EXPORT_VIDEO_BITS_PER_SECOND)), audioBitsPerSecond: EXPORT_AUDIO_BITS_PER_SECOND };
    const mimeType = recorderMime();
    if (mimeType) options.mimeType = mimeType;
    return options;
  }

  async function recordPlayedStream(stream, video, videoBits) {
    const chunks = [], options = recorderOptions(videoBits), recorder = new MediaRecorder(stream, options);
    const stopped = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = event => reject(event.error || new Error("Video compression failed."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || options.mimeType || "video/webm" }));
    });
    const ended = new Promise((resolve, reject) => {
      video.addEventListener("ended", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("The recorded video could not be played for export.")), { once: true });
    });
    recorder.start(1000);
    await video.play();
    await ended;
    if (recorder.state !== "inactive") recorder.stop();
    return stopped;
  }

  async function captureViaMediaElement(video) {
    const capture = HTMLMediaElement.prototype.captureStream || HTMLMediaElement.prototype.mozCaptureStream;
    if (typeof capture !== "function") return null;
    const stream = capture.call(video);
    return stream && stream.getVideoTracks().length ? { stream, cleanup: () => stream.getTracks().forEach(t => t.stop()) } : null;
  }

  async function captureViaCanvas(video, info) {
    if (!HTMLCanvasElement.prototype.captureStream) return null;
    const maxSide = 1920, scale = Math.min(1, maxSide / Math.max(1, info.width, info.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(info.width * scale));
    canvas.height = Math.max(2, Math.round(info.height * scale));
    const ctx = canvas.getContext("2d", { alpha: false });
    const canvasStream = canvas.captureStream(30);
    let raf = 0, stopped = false, audioContext = null, sourceNode = null, destination = null;
    const draw = () => {
      if (stopped) return;
      try { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); } catch (_) {}
      raf = requestAnimationFrame(draw);
    };
    draw();
    const tracks = [...canvasStream.getVideoTracks()];
    try {
      const AudioContextCtor = global.AudioContext || global.webkitAudioContext;
      if (AudioContextCtor) {
        audioContext = new AudioContextCtor();
        sourceNode = audioContext.createMediaElementSource(video);
        destination = audioContext.createMediaStreamDestination();
        sourceNode.connect(destination);
        destination.stream.getAudioTracks().forEach(track => tracks.push(track));
      }
    } catch (_) {}
    const stream = new MediaStream(tracks);
    return {
      stream,
      cleanup: async () => {
        stopped = true; cancelAnimationFrame(raf); stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        try { sourceNode && sourceNode.disconnect(); } catch (_) {}
        try { audioContext && await audioContext.close(); } catch (_) {}
      }
    };
  }

  async function transcodeVideo(source, videoBits) {
    if (!global.MediaRecorder) throw new Error("This browser cannot reduce video size during ZIP export.");
    const info = await videoInfo(source);
    if (!info.duration || !info.width || !info.height) throw new Error("Milos could not read this video for ZIP export.");
    const url = URL.createObjectURL(source);
    const video = document.createElement("video");
    video.playsInline = true; video.preload = "auto"; video.src = url; video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px";
    document.body.appendChild(video);
    let captured = null;
    try {
      await waitFor(video, "loadeddata", 22000);
      captured = await captureViaMediaElement(video);
      if (!captured || (video.audioTracks && video.audioTracks.length && !captured.stream.getAudioTracks().length)) {
        if (captured) await captured.cleanup();
        captured = await captureViaCanvas(video, info);
      }
      if (!captured || !captured.stream.getVideoTracks().length) throw new Error("This device cannot reduce the video during ZIP export.");
      const blob = await recordPlayedStream(captured.stream, video, videoBits);
      const base = cleanName(source.name || "Milos-video", "Milos-video").replace(/\.[a-z0-9]{2,6}$/i, "");
      return fileFrom(blob, source, base + extensionFor(blob.type));
    } finally {
      try { video.pause(); } catch (_) {}
      if (captured) await captured.cleanup();
      video.remove(); URL.revokeObjectURL(url);
    }
  }

  async function prepareVideoForExport(source) {
    if (!source || !String(source.type || "").toLowerCase().startsWith("video/")) return source;
    const info = await videoInfo(source);
    if (!Number.isFinite(info.duration) || info.duration <= 0) return source;
    const maximum = Math.max(128 * 1024, MAX_VIDEO_BYTES_PER_MINUTE * info.duration / 60);
    if (source.size <= maximum) return source;
    let result = await transcodeVideo(source, EXPORT_VIDEO_BITS_PER_SECOND);
    if (result.size > maximum) {
      const adjusted = Math.max(420000, Math.floor(EXPORT_VIDEO_BITS_PER_SECOND * (maximum / result.size) * 0.9));
      result = await transcodeVideo(source, adjusted);
    }
    if (result.size > maximum) throw new Error("Milos could not reduce this video to the 11 MB/min export target on this device.");
    return result;
  }

  async function putFile(file) {
    if (!file || !(file instanceof Blob)) throw new Error("Choose a photo, video or audio file first.");
    const type = String(file.type || "").toLowerCase();
    const savedFile = type.startsWith("image/") ? await minimiseImageLossless(file) : file;
    return original.putFile(savedFile);
  }

  async function putFiles(files) {
    const list = Array.from(files || []).slice(0, 12), saved = [];
    for (const file of list) saved.push(await putFile(file));
    return saved;
  }

  global.MilosMedia = Object.freeze(Object.assign({}, original, { putFile, putFiles }));
  global.MilosMediaOptimize = Object.freeze({
    version: "2.8",
    nativeCameraCapture: true,
    compressVideoOnSave: false,
    compressVideoOnExport: true,
    maxVideoBytesPerMinute: MAX_VIDEO_BYTES_PER_MINUTE,
    minimiseImageLossless,
    prepareVideoForExport,
    videoInfo,
  });
})(window);
