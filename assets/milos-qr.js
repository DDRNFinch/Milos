(function (global) {
  "use strict";

  const EVIA_PROGRESS_PREFIX = "NISI:EVIA:PROGRESS:1:";
  const EVIA_PROGRESS_ALIASES = [EVIA_PROGRESS_PREFIX, "EVIA-PROGRESS:1:", "EVIA1:PROGRESS:"];
  const MILOS_OBSERVATION_PREFIX = "NISI:MILOS:OBS:1:";
  const renderedQr = new WeakMap();
  let activeCamera = null;

  function bytesToBase64Url(bytes) {
    let binary = "";
    const stride = 0x8000;
    for (let index = 0; index < bytes.length; index += stride) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + stride));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    const padded = String(value).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(value).length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function encodeObject(value) {
    return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  }

  function decodeObject(value) {
    const text = new TextDecoder().decode(base64UrlToBytes(value));
    return JSON.parse(text);
  }

  function progressPayload(data) {
    const source = data || {};
    const compact = {
      v: 1,
      t: "progress",
      r: source.sharedId || "",
      c: source.courseRouteId || source.course || "",
      s: source.startDate || "",
      e: source.endDate || "",
      l: Number(source.learningHours || 0),
      lt: Number(source.learningTarget || 0),
      z: Array.isArray(source.completedCodes) ? source.completedCodes : [],
      d: Array.isArray(source.changedCodes) ? source.changedCodes : [],
      tg: Array.isArray(source.targets) ? source.targets.map((target) => ({
        title: target.title || target.text || String(target || ""),
        dueDate: target.dueDate || target.due || "",
        code: target.code || "",
      })) : [],
      lr: source.lastReviewAt || "",
      ec: Number(source.evidenceCount || 0),
      u: source.exportedAt || Date.now(),
    };
    return `${EVIA_PROGRESS_PREFIX}${encodeObject(compact)}`;
  }

  function observationPayload(observation, profile, course) {
    const observedCodes = global.MilosCore.cleanCodes(observation && (observation.observedCodes || observation.codes));
    const snapshot = global.MilosCore.latestSnapshot(profile) || {};
    const sharedId = global.MilosCore.cleanText(observation && observation.eviaSharedId || snapshot.sharedId, 80);
    if (!sharedId) throw new Error("A full Evia progress QR must be scanned before creating an observation return QR.");
    const compact = {
      v: 1,
      t: "observation",
      a: "mark-observed",
      r: sharedId,
      c: global.MilosCore.cleanText(course && course.route && course.route.id, 60),
      o: global.MilosCore.cleanText(observation && observation.publicId, 80) || global.MilosCore.cleanText(observation && observation.id, 80),
      d: global.MilosCore.validDate(observation && observation.observationDate),
      z: observedCodes,
      m: "blue-o",
      u: observation && observation.completedAt || Date.now(),
    };
    const payload = `${MILOS_OBSERVATION_PREFIX}${encodeObject(compact)}`;
    if (new TextEncoder().encode(payload).length > 2800) {
      throw new Error("This observation contains too many criteria for one QR code. Split it into two observations.");
    }
    return payload;
  }

  function parsePayload(input) {
    const text = String(input == null ? "" : input).trim();
    if (!text) throw new Error("No QR code was detected.");

    const progressPrefix = EVIA_PROGRESS_ALIASES.find((prefix) => text.toUpperCase().startsWith(prefix));
    if (progressPrefix) {
      try {
        const value = decodeObject(text.slice(progressPrefix.length));
        if (!value || (value.t && value.t !== "progress")) throw new Error("Wrong record type");
        return { type: "progress", value, raw: text };
      } catch (_) {
        throw new Error("This Evia progress QR could not be read.");
      }
    }

    if (text.toUpperCase().startsWith(MILOS_OBSERVATION_PREFIX)) {
      try {
        return { type: "observation", value: decodeObject(text.slice(MILOS_OBSERVATION_PREFIX.length)), raw: text };
      } catch (_) {
        throw new Error("This Milos observation QR could not be read.");
      }
    }

    if (/^EVIA1:/i.test(text)) {
      const course = text.slice(6).trim();
      if (!course) throw new Error("This Evia QR does not contain a course code.");
      return { type: "progress", value: { v: 1, t: "progress", c: course, u: Date.now() }, raw: text, courseOnly: true };
    }

    if (text[0] === "{") {
      try {
        const value = JSON.parse(text);
        const type = value.t || value.type;
        if (type === "observation") return { type: "observation", value, raw: text };
        return { type: "progress", value, raw: text };
      } catch (_) {
        throw new Error("The pasted QR data is not valid JSON.");
      }
    }

    throw new Error("This is not a supported Evia progress QR code.");
  }

  function makeQr(payload, errorCorrection) {
    if (typeof global.qrcode !== "function") throw new Error("The offline QR generator is unavailable.");
    const qr = global.qrcode(0, errorCorrection || "L");
    qr.addData(String(payload), "Byte");
    qr.make();
    return qr;
  }

  function render(container, payload, options) {
    const opts = options || {};
    const qr = makeQr(payload, opts.errorCorrection || "L");
    const cells = qr.getModuleCount();
    const size = Math.max(180, Number(opts.size || 256));
    const cellSize = Math.max(2, Math.floor(size / (cells + 8)));
    container.innerHTML = qr.createSvgTag({
      cellSize,
      margin: cellSize * 4,
      scalable: true,
    });
    const svg = container.querySelector("svg");
    if (svg) {
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", opts.label || "QR code");
    }
    renderedQr.set(container, { qr, payload: String(payload) });
    return qr;
  }

  function download(container, filename) {
    const record = renderedQr.get(container);
    if (!record) throw new Error("Generate the QR code first.");
    const qr = record.qr;
    const count = qr.getModuleCount();
    const quiet = 4;
    const scale = Math.max(6, Math.floor(960 / (count + quiet * 2)));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = (count + quiet * 2) * scale;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111214";
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (qr.isDark(row, column)) {
          context.fillRect((column + quiet) * scale, (row + quiet) * scale, scale, scale);
        }
      }
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || "Milos-Observation-QR.png";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }

  function dataUrl(payload, requestedSize) {
    const qr = makeQr(payload, "L");
    const count = qr.getModuleCount();
    const quiet = 4;
    const scale = Math.max(4, Math.floor(Math.max(320, Number(requestedSize || 720)) / (count + quiet * 2)));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = (count + quiet * 2) * scale;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111214";
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (qr.isDark(row, column)) context.fillRect((column + quiet) * scale, (row + quiet) * scale, scale, scale);
      }
    }
    return canvas.toDataURL("image/png");
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("The selected image could not be opened."));
      };
      image.src = url;
    });
  }

  async function decodeImage(file) {
    if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Choose an image containing the QR code.");
    if (typeof global.jsQR !== "function") throw new Error("The offline QR reader is unavailable.");
    const image = await loadImage(file);
    const maximum = 1800;
    const scale = Math.min(1, maximum / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const result = global.jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" });
    if (!result || !result.data) throw new Error("No readable QR code was found in that image.");
    return result.data;
  }

  async function startCamera(video, onResult, onError) {
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Camera scanning is not available here. Choose a QR image instead.");
    }
    if (typeof global.jsQR !== "function") throw new Error("The offline QR reader is unavailable.");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    await video.play();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let stopped = false;
    let frameId = 0;
    let lastRead = 0;

    const tick = (now) => {
      if (stopped) return;
      frameId = requestAnimationFrame(tick);
      if (now - lastRead < 160 || video.readyState < 2) return;
      lastRead = now;
      const sourceWidth = video.videoWidth || 640;
      const sourceHeight = video.videoHeight || 480;
      const maximum = 960;
      const ratio = Math.min(1, maximum / Math.max(sourceWidth, sourceHeight));
      canvas.width = Math.round(sourceWidth * ratio);
      canvas.height = Math.round(sourceHeight * ratio);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = global.jsQR(pixels.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" });
        if (result && result.data) {
          stopCamera();
          onResult(result.data);
        }
      } catch (error) {
        if (typeof onError === "function") onError(error);
      }
    };

    frameId = requestAnimationFrame(tick);
    activeCamera = {
      stop() {
        stopped = true;
        if (frameId) cancelAnimationFrame(frameId);
        stream.getTracks().forEach((track) => track.stop());
        try { video.pause(); } catch (_) {}
        video.srcObject = null;
      },
    };
    return activeCamera;
  }

  function stopCamera() {
    if (!activeCamera) return;
    const camera = activeCamera;
    activeCamera = null;
    camera.stop();
  }

  global.MilosQR = Object.freeze({
    EVIA_PROGRESS_PREFIX,
    MILOS_OBSERVATION_PREFIX,
    dataUrl,
    decodeImage,
    decodeObject,
    download,
    encodeObject,
    observationPayload,
    parsePayload,
    progressPayload,
    render,
    startCamera,
    stopCamera,
  });
})(window);
