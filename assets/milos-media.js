(function (global) {
  "use strict";

  const DB_NAME = "milos-assessor-media-v1";
  const STORE_NAME = "files";
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error("This device does not provide private media storage."));
        return;
      }
      const request = global.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Private media storage could not be opened."));
    });
    return dbPromise;
  }

  async function putFile(file) {
    if (!file || !(file instanceof Blob)) throw new Error("Choose a photo, video or audio file first.");
    const db = await openDb();
    const record = {
      id: global.MilosCore.uid("media"),
      blob: file,
      name: global.MilosCore.cleanText(file.name || "observation-media", 160),
      type: global.MilosCore.cleanText(file.type || "application/octet-stream", 100),
      size: Number(file.size || 0),
      createdAt: Date.now(),
    };
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("The media could not be stored."));
      transaction.onabort = () => reject(transaction.error || new Error("The media save was interrupted."));
    });
    return Object.assign({}, record, { blob: undefined });
  }

  async function putFiles(files) {
    const list = Array.from(files || []).slice(0, 12);
    const saved = [];
    for (const file of list) saved.push(await putFile(file));
    return saved;
  }

  async function getFile(id) {
    if (!id) return null;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("The media could not be opened."));
    });
  }

  async function removeFile(id) {
    if (!id) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("The media could not be removed."));
    });
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
        reject(new Error("The media preview could not be prepared."));
      };
      target.addEventListener(event, done, { once: true });
      target.addEventListener("error", fail, { once: true });
      timer = setTimeout(fail, timeout || 6000);
    });
  }

  async function imageDataUrl(blob, maxDimension, quality) {
    if (!blob || !String(blob.type || "").startsWith("image/")) return "";
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await waitFor(image, "load", 7000);
      const max = maxDimension || 1400;
      const scale = Math.min(1, max / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", quality == null ? 0.76 : quality);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function videoThumbnail(blob) {
    if (!blob || !String(blob.type || "").startsWith("video/")) return "";
    const url = URL.createObjectURL(blob);
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = url;
      await waitFor(video, "loadedmetadata", 7000);
      try {
        video.currentTime = Math.min(0.35, Math.max(0, Number(video.duration || 1) / 4));
        await waitFor(video, "seeked", 3500);
      } catch (_) {}
      const width = video.videoWidth || 960;
      const height = video.videoHeight || 540;
      const max = 1000;
      const scale = Math.min(1, max / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#101214";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.72);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function mediaPreviewDataUrl(record) {
    if (!record || !record.blob) return "";
    if (String(record.type || record.blob.type).startsWith("image/")) return imageDataUrl(record.blob, 1100, 0.72);
    if (String(record.type || record.blob.type).startsWith("video/")) return videoThumbnail(record.blob);
    return "";
  }

  function signaturePad(canvas, options) {
    const opts = options || {};
    const context = canvas.getContext("2d");
    let drawing = false;
    let signed = false;
    let ratio = 1;

    function drawInitial() {
      if (!opts.initialDataUrl) return;
      const image = new Image();
      image.onload = () => {
        context.drawImage(image, 0, 0, canvas.width / ratio, canvas.height / ratio);
        signed = true;
        notify();
      };
      image.src = opts.initialDataUrl;
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      ratio = Math.max(1, global.devicePixelRatio || 1);
      canvas.width = Math.max(320, Math.round(rect.width * ratio));
      canvas.height = Math.max(120, Math.round(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width / ratio, canvas.height / ratio);
      context.strokeStyle = "#22242a";
      context.lineWidth = 2.15;
      context.lineCap = "round";
      context.lineJoin = "round";
      signed = false;
      drawInitial();
    }

    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function notify() {
      if (typeof opts.onChange === "function") opts.onChange(signed ? toDataUrl() : "", signed);
    }

    function down(event) {
      event.preventDefault();
      drawing = true;
      signed = true;
      canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId);
      const value = point(event);
      context.beginPath();
      context.moveTo(value.x, value.y);
    }

    function move(event) {
      if (!drawing) return;
      event.preventDefault();
      const value = point(event);
      context.lineTo(value.x, value.y);
      context.stroke();
    }

    function up(event) {
      if (!drawing) return;
      event && event.preventDefault();
      drawing = false;
      notify();
    }

    function clear() {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
      signed = false;
      notify();
    }

    function toDataUrl() {
      if (!signed) return "";
      const output = document.createElement("canvas");
      output.width = 720;
      output.height = 210;
      const outputContext = output.getContext("2d", { alpha: false });
      outputContext.fillStyle = "#ffffff";
      outputContext.fillRect(0, 0, output.width, output.height);
      outputContext.drawImage(canvas, 0, 0, output.width, output.height);
      return output.toDataURL("image/jpeg", 0.7);
    }

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    resize();

    return Object.freeze({
      clear,
      isEmpty: () => !signed,
      toDataUrl,
    });
  }

  global.MilosMedia = Object.freeze({
    getFile,
    imageDataUrl,
    mediaPreviewDataUrl,
    putFile,
    putFiles,
    removeFile,
    signaturePad,
    videoThumbnail,
  });
})(window);
