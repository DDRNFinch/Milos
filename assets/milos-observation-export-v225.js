(function (global) {
  "use strict";

  const sourcePdf = global.MilosObservationPdfSource;
  const mediaStore = global.MilosMedia;
  const zipTools = global.MilosObservationBundle;
  const currentPdf = global.MilosPDF;
  if (!sourcePdf || typeof sourcePdf.observationPdf !== "function" || !mediaStore || !zipTools || typeof zipTools.makeZip !== "function" || !currentPdf) return;

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
    while (used.has(output.toLowerCase())) output = `${stem}-${suffix++}${ext}`;
    used.add(output.toLowerCase());
    return output;
  }

  function extensionFor(type) {
    const mime = String(type || "").toLowerCase();
    if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
    if (mime.includes("png")) return ".png";
    if (mime.includes("webp")) return ".webp";
    if (mime.includes("heic")) return ".heic";
    if (mime.includes("mp4")) return ".mp4";
    if (mime.includes("webm")) return ".webm";
    if (mime.includes("quicktime")) return ".mov";
    if (mime.includes("ogg")) return ".ogg";
    if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
    if (mime.includes("wav")) return ".wav";
    if (mime.includes("aac")) return ".aac";
    if (mime.includes("m4a")) return ".m4a";
    if (mime.includes("pdf")) return ".pdf";
    return "";
  }

  function hasExtension(name) {
    return /\.[a-z0-9]{2,6}$/i.test(String(name || ""));
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function captureObservationPdf(args) {
    const RealJsPDF = global.jspdf && global.jspdf.jsPDF;
    if (typeof RealJsPDF !== "function") throw new Error("The offline PDF builder is unavailable.");

    let captured = null;
    function CaptureJsPDF() {
      const doc = Reflect.construct(RealJsPDF, Array.from(arguments));
      doc.save = function (name) {
        captured = {
          name: safeName(name, "Milos-Observation.pdf"),
          blob: doc.output("blob"),
        };
        return doc;
      };
      return doc;
    }

    CaptureJsPDF.prototype = RealJsPDF.prototype;
    try { CaptureJsPDF.API = RealJsPDF.API; } catch (_) {}

    global.jspdf.jsPDF = CaptureJsPDF;
    try {
      await sourcePdf.observationPdf.apply(sourcePdf, args);
    } finally {
      global.jspdf.jsPDF = RealJsPDF;
    }

    if (!captured || !(captured.blob instanceof Blob)) throw new Error("The observation PDF could not be prepared for the ZIP export.");
    return captured;
  }

  async function mediaEntries(observation, used) {
    const entries = [];
    const media = Array.isArray(observation && observation.media) ? observation.media : [];
    const missing = [];
    let number = 1;

    for (const item of media) {
      if (!item || !item.id) continue;
      let stored = null;
      try { stored = await mediaStore.getFile(item.id); } catch (_) {}
      if (!stored || !(stored.blob instanceof Blob)) {
        missing.push(item);
        continue;
      }

      const type = String(stored.type || stored.blob.type || item.type || "application/octet-stream").toLowerCase();
      let name = safeName(stored.name || item.name, `Observation-media-${number}`);
      if (!hasExtension(name)) name += extensionFor(type);
      entries.push({
        name: uniqueName(name, used),
        blob: stored.blob,
        date: new Date(Number(stored.createdAt || item.createdAt || Date.now())),
      });
      number += 1;
    }

    if (missing.length) {
      const count = missing.length;
      throw new Error(`${count} observation ${count === 1 ? "attachment is" : "attachments are"} missing from this device, so a complete ZIP was not created.`);
    }

    return entries;
  }

  async function observationZip(observation, profile, course, qrPayload) {
    const used = new Set();
    const pdf = await captureObservationPdf([observation, profile, course, qrPayload]);
    const pdfName = uniqueName(pdf.name || "Milos-Observation.pdf", used);
    const attachments = await mediaEntries(observation, used);
    const entries = [
      { name: pdfName, blob: pdf.blob, date: new Date() },
      ...attachments,
    ];
    const zip = await zipTools.makeZip(entries);
    const zipName = safeName(pdfName.replace(/\.pdf$/i, "") + ".zip", "Milos-Observation.zip");
    download(zip, zipName);
    return zipName;
  }

  global.MilosPDF = Object.freeze(Object.assign({}, currentPdf, { observationPdf: observationZip }));
  global.MilosObservationExport = Object.freeze({
    version: "2.25",
    includesObservationPdf: true,
    includesAllStoredMedia: true,
    playsVideoDuringExport: false,
  });
})(window);
