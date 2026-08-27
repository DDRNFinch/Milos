(function (global) {
  "use strict";

  const prior = global.MilosObservationBundle;
  if (!prior || typeof prior.makeZip !== "function") return;

  const mp4Tools = global.MilosMp4Faststart;
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }

  function updateCrc(crc, bytes) {
    let value = crc >>> 0;
    for (let i = 0; i < bytes.length; i += 1) value = crcTable[(value ^ bytes[i]) & 0xff] ^ (value >>> 8);
    return value >>> 0;
  }

  async function crc32(blob) {
    let crc = 0xffffffff;
    if (blob && typeof blob.stream === "function") {
      const reader = blob.stream().getReader();
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          crc = updateCrc(crc, part.value);
        }
      } finally { try { reader.releaseLock(); } catch (_) {} }
    } else {
      crc = updateCrc(crc, new Uint8Array(await blob.arrayBuffer()));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(value) {
    const date = value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    return {
      time: ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xffff,
      date: (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff,
    };
  }

  async function compressionStream(blob, format) {
    return new Response(blob.stream().pipeThrough(new CompressionStream(format))).blob();
  }

  async function deflateRaw(blob) {
    if (typeof global.CompressionStream !== "function") {
      throw new Error("This browser cannot create compressed ZIP files. Update the browser or installed Milos app before exporting.");
    }
    try {
      return await compressionStream(blob, "deflate-raw");
    } catch (_) {
      try {
        const wrapped = await compressionStream(blob, "deflate");
        const bytes = new Uint8Array(await wrapped.arrayBuffer());
        if (bytes.length <= 6) throw new Error("Compressed data was incomplete.");
        return new Blob([bytes.slice(2, bytes.length - 4)], { type: "application/octet-stream" });
      } catch (_) {
        throw new Error("This browser cannot create DEFLATE-compressed ZIP files. Update the browser or installed Milos app before exporting.");
      }
    }
  }

  function header(nameBytes, stamp, crc, compressedSize, originalSize, method, central, offset) {
    const bytes = new Uint8Array((central ? 46 : 30) + nameBytes.length);
    const view = new DataView(bytes.buffer);
    if (central) {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, method, true);
      view.setUint16(12, stamp.time, true);
      view.setUint16(14, stamp.date, true);
      view.setUint32(16, crc >>> 0, true);
      view.setUint32(20, compressedSize >>> 0, true);
      view.setUint32(24, originalSize >>> 0, true);
      view.setUint16(28, nameBytes.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, offset >>> 0, true);
      bytes.set(nameBytes, 46);
    } else {
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, method, true);
      view.setUint16(10, stamp.time, true);
      view.setUint16(12, stamp.date, true);
      view.setUint32(14, crc >>> 0, true);
      view.setUint32(18, compressedSize >>> 0, true);
      view.setUint32(22, originalSize >>> 0, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      bytes.set(nameBytes, 30);
    }
    return bytes;
  }

  function endRecord(entryCount, centralSize, centralOffset) {
    const bytes = new Uint8Array(22), view = new DataView(bytes.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entryCount, true);
    view.setUint16(10, entryCount, true);
    view.setUint32(12, centralSize >>> 0, true);
    view.setUint32(16, centralOffset >>> 0, true);
    view.setUint16(20, 0, true);
    return bytes;
  }

  function entryKind(entry, blob) {
    const type = String(blob && blob.type || "").toLowerCase();
    const name = String(entry && entry.name || "").toLowerCase();
    if (type.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(name)) return "video";
    if (type.startsWith("audio/") || /\.(m4a|aac|mp3|wav|ogg|opus)$/i.test(name)) return "audio";
    return "other";
  }

  function isMp4(entry, blob) {
    const type = String(blob && blob.type || "").toLowerCase();
    const name = String(entry && entry.name || "").toLowerCase();
    return type.includes("mp4") || /\.(mp4|m4v)$/i.test(name);
  }

  async function prepareEntryBlob(entry) {
    let blob = entry.blob instanceof Blob ? entry.blob : new Blob([entry.blob]);
    if (!isMp4(entry, blob) || !mp4Tools || typeof mp4Tools.optimise !== "function") return blob;
    try {
      const candidate = String(blob.type || "").toLowerCase().includes("mp4") ? blob : new Blob([blob], { type: "video/mp4" });
      const fixed = await mp4Tools.optimise(candidate);
      return fixed instanceof Blob ? fixed : blob;
    } catch (_) {
      return blob;
    }
  }

  async function makeZip(entries) {
    if (!entries || !entries.length) throw new Error("There is nothing to export.");
    if (entries.length > 65535) throw new Error("This ZIP contains too many files.");

    const parts = [], central = [];
    let offset = 0;
    for (const entry of entries) {
      const originalBlob = await prepareEntryBlob(entry);
      if (originalBlob.size > 0xffffffff) throw new Error("One observation file is too large for the ZIP export.");

      const kind = entryKind(entry, originalBlob);
      const method = kind === "video" || kind === "audio" ? 0 : 8;
      const payload = method === 0 ? originalBlob : await deflateRaw(originalBlob);
      if (payload.size > 0xffffffff) throw new Error("One observation file is too large for the ZIP export.");

      const nameBytes = encoder.encode(String(entry.name || "Milos-file"));
      const stamp = dosDateTime(entry.date);
      const crc = await crc32(originalBlob);
      const local = header(nameBytes, stamp, crc, payload.size, originalBlob.size, method, false, 0);
      parts.push(local, payload);
      central.push(header(nameBytes, stamp, crc, payload.size, originalBlob.size, method, true, offset));
      offset += local.byteLength + payload.size;
      if (offset > 0xffffffff) throw new Error("This observation is too large for one ZIP export.");
    }

    const centralOffset = offset;
    const centralSize = central.reduce((total, part) => total + part.byteLength, 0);
    parts.push(...central, endRecord(entries.length, centralSize, centralOffset));
    return new Blob(parts, { type: "application/zip" });
  }

  global.MilosObservationBundle = Object.freeze(Object.assign({}, prior, {
    version: "2.39",
    compressed: true,
    compressionMethod: "DEFLATE documents / STORE media",
    videoCompressionMethod: "STORE",
    seekableVideoEntries: true,
    fastStartMp4AtZipBoundary: true,
    makeZip,
  }));

  global.MilosEvidenceCompatibility = Object.freeze({
    version: "2.39",
    crossPlatformEvidenceZip: true,
    videoZipMethod: "STORE",
    mp4FastStartAtExport: true,
  });
})(typeof window !== "undefined" ? window : globalThis);
