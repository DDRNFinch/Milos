(function (global) {
  "use strict";

  const originalPdf = global.MilosPDF;
  const mediaStore = global.MilosMedia;
  const JsPDF = global.jspdf && global.jspdf.jsPDF;
  if (!originalPdf || !mediaStore || !JsPDF || !JsPDF.prototype) return;

  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }

  function safeName(value, fallback) {
    const cleaned = String(value == null ? "" : value)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^\.+|\.+$/g, "")
      .trim()
      .slice(0, 140);
    return cleaned || fallback || "Milos-file";
  }

  function uniqueName(value, used) {
    const name = safeName(value, "Milos-media");
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let output = name;
    let suffix = 2;
    while (used.has(output.toLowerCase())) {
      output = `${stem}-${suffix}${ext}`;
      suffix += 1;
    }
    used.add(output.toLowerCase());
    return output;
  }

  function extensionFor(type) {
    const mime = String(type || "").toLowerCase();
    if (mime.includes("mp4")) return ".mp4";
    if (mime.includes("webm")) return ".webm";
    if (mime.includes("ogg")) return ".ogg";
    if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
    if (mime.includes("wav")) return ".wav";
    if (mime.includes("aac")) return ".aac";
    if (mime.includes("m4a")) return ".m4a";
    return "";
  }

  function hasExtension(name) {
    return /\.[a-z0-9]{2,6}$/i.test(String(name || ""));
  }

  function updateCrc(crc, bytes) {
    let value = crc >>> 0;
    for (let i = 0; i < bytes.length; i += 1) value = crcTable[(value ^ bytes[i]) & 0xFF] ^ (value >>> 8);
    return value >>> 0;
  }

  async function crc32(blob) {
    let crc = 0xFFFFFFFF;
    if (blob && typeof blob.stream === "function") {
      const reader = blob.stream().getReader();
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          crc = updateCrc(crc, part.value);
        }
      } finally {
        try { reader.releaseLock(); } catch (_) {}
      }
    } else {
      crc = updateCrc(crc, new Uint8Array(await blob.arrayBuffer()));
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(value) {
    const date = value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);
    return {
      time: ((hours << 11) | (minutes << 5) | seconds) & 0xFFFF,
      date: (((year - 1980) << 9) | (month << 5) | day) & 0xFFFF,
    };
  }

  function localHeader(nameBytes, stamp) {
    const bytes = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x04034B50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0808, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, stamp.time, true);
    view.setUint16(12, stamp.date, true);
    view.setUint32(14, 0, true);
    view.setUint32(18, 0, true);
    view.setUint32(22, 0, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    bytes.set(nameBytes, 30);
    return bytes;
  }

  function dataDescriptor(crc, size) {
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x08074B50, true);
    view.setUint32(4, crc >>> 0, true);
    view.setUint32(8, size >>> 0, true);
    view.setUint32(12, size >>> 0, true);
    return bytes;
  }

  function centralHeader(nameBytes, stamp, crc, size, offset) {
    const bytes = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x02014B50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0808, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, stamp.time, true);
    view.setUint16(14, stamp.date, true);
    view.setUint32(16, crc >>> 0, true);
    view.setUint32(20, size >>> 0, true);
    view.setUint32(24, size >>> 0, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, offset >>> 0, true);
    bytes.set(nameBytes, 46);
    return bytes;
  }

  function endRecord(entryCount, centralSize, centralOffset) {
    const bytes = new Uint8Array(22);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x06054B50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entryCount, true);
    view.setUint16(10, entryCount, true);
    view.setUint32(12, centralSize >>> 0, true);
    view.setUint32(16, centralOffset >>> 0, true);
    view.setUint16(20, 0, true);
    return bytes;
  }

  async function makeZip(entries) {
    const parts = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
      const blob = entry.blob instanceof Blob ? entry.blob : new Blob([entry.blob]);
      if (blob.size > 0xFFFFFFFF) throw new Error("One observation media file is too large for the ZIP export.");
      const nameBytes = encoder.encode(entry.name);
      const stamp = dosDateTime(entry.date);
      const crc = await crc32(blob);
      const local = localHeader(nameBytes, stamp);
      const descriptor = dataDescriptor(crc, blob.size);
      parts.push(local, blob, descriptor);
      central.push(centralHeader(nameBytes, stamp, crc, blob.size, offset));
      offset += local.byteLength + blob.size + descriptor.byteLength;
      if (offset > 0xFFFFFFFF) throw new Error("This observation is too large for one ZIP export.");
    }
    const centralOffset = offset;
    const centralSize = central.reduce((total, part) => total + part.byteLength, 0);
    parts.push(...central, endRecord(entries.length, centralSize, centralOffset));
    return new Blob(parts, { type: "application/zip" });
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function captureObservationPdf(args) {
    const proto = JsPDF.prototype;
    const originalSave = proto.save;
    let pdfBlob = null;
    let pdfName = "Milos-Observation.pdf";
    proto.save = function (name) {
      pdfName = safeName(name, pdfName);
      pdfBlob = this.output("blob");
      return this;
    };
    try {
      const returnedName = await originalPdf.observationPdf.apply(originalPdf, args);
      if (returnedName) pdfName = safeName(returnedName, pdfName);
    } finally {
      proto.save = originalSave;
    }
    if (!(pdfBlob instanceof Blob)) throw new Error("The observation PDF could not be prepared for the ZIP export.");
    return { blob: pdfBlob, name: pdfName };
  }

  async function recordingEntries(observation, used) {
    const entries = [];
    const media = Array.isArray(observation && observation.media) ? observation.media : [];
    let number = 1;
    for (const item of media) {
      if (!item || !item.id) continue;
      let stored = null;
      try { stored = await mediaStore.getFile(item.id); } catch (_) {}
      if (!stored || !(stored.blob instanceof Blob)) continue;
      const type = String(stored.type || stored.blob.type || item.type || "").toLowerCase();
      if (!type.startsWith("video/") && !type.startsWith("audio/")) continue;
      let base = safeName(stored.name || item.name, type.startsWith("audio/") ? `Voice-recording-${number}` : `Video-${number}`);
      if (!hasExtension(base)) base += extensionFor(type);
      entries.push({
        name: uniqueName(base, used),
        blob: stored.blob,
        date: new Date(Number(stored.createdAt || item.createdAt || Date.now())),
      });
      number += 1;
    }
    return entries;
  }

  async function observationZip(observation, profile, course, qrPayload) {
    const pdf = await captureObservationPdf([observation, profile, course, qrPayload]);
    const used = new Set();
    const pdfName = uniqueName(pdf.name, used);
    const recordings = await recordingEntries(observation, used);
    const zip = await makeZip([
      { name: pdfName, blob: pdf.blob, date: new Date() },
      ...recordings,
    ]);
    const zipName = safeName(pdfName.replace(/\.pdf$/i, "") + ".zip", "Milos-Observation.zip");
    download(zip, zipName);
    return zipName;
  }

  global.MilosPDF = Object.freeze(Object.assign({}, originalPdf, {
    observationPdf: observationZip,
  }));

  if (!global.document || !global.MutationObserver) return;
  const replacements = new Map([
    ["Observation saved, QR created and PDF downloaded.", "Observation saved. ZIP downloaded with the PDF and original video/voice recordings."],
    ["Observation saved and PDF downloaded. A return QR is added when Evia progress has been scanned.", "Observation saved. ZIP downloaded with the PDF and original video/voice recordings. A return QR is added when Evia progress has been scanned."],
    ["Observation PDF downloaded.", "Observation ZIP downloaded with the PDF and original video/voice recordings."],
  ]);
  function refreshText(root) {
    if (!root || !document.createTreeWalker) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach((textNode) => {
      let value = textNode.nodeValue || "";
      replacements.forEach((replacement, source) => { value = value.split(source).join(replacement); });
      if (value !== textNode.nodeValue) textNode.nodeValue = value;
    });
  }
  const app = document.getElementById("milosApp");
  if (app) new MutationObserver(() => refreshText(app)).observe(app, { childList: true, subtree: true, characterData: true });
})(window);
