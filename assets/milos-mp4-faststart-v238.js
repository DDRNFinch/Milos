(function (global) {
  "use strict";

  const VERSION = "2.38";
  const baseMedia = global.MilosMedia;
  if (!baseMedia || typeof Blob === "undefined") return;

  const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "udta", "meta", "ilst", "mvex"]);

  function boxType(bytes, offset) {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  }

  function readU64(view, offset) {
    return (BigInt(view.getUint32(offset, false)) << 32n) | BigInt(view.getUint32(offset + 4, false));
  }

  function writeU64(view, offset, value) {
    const n = BigInt(value);
    view.setUint32(offset, Number((n >> 32n) & 0xffffffffn), false);
    view.setUint32(offset + 4, Number(n & 0xffffffffn), false);
  }

  function isMp4(value) {
    const type = String(value && (value.type || (value.blob && value.blob.type)) || "").toLowerCase();
    const name = String(value && value.name || "").toLowerCase();
    return type.includes("mp4") || /\.mp4(?:$|\?)/.test(name);
  }

  async function readTopLevelBoxes(blob) {
    const boxes = [];
    let position = 0;
    let guard = 0;
    while (position + 8 <= blob.size && guard++ < 2048) {
      const head = new Uint8Array(await blob.slice(position, Math.min(blob.size, position + 16)).arrayBuffer());
      if (head.byteLength < 8) break;
      const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
      let size = view.getUint32(0, false);
      const type = boxType(head, 4);
      let header = 8;
      if (size === 1) {
        if (head.byteLength < 16) break;
        const large = readU64(view, 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("MP4 box is too large for local optimisation.");
        size = Number(large);
        header = 16;
      } else if (size === 0) {
        size = blob.size - position;
      }
      if (!Number.isFinite(size) || size < header || position + size > blob.size) break;
      boxes.push({ type, start: position, size, end: position + size, header });
      position += size;
    }
    return boxes;
  }

  function patchChunkOffsets(buffer, insertAt, removeAt, delta) {
    const bytes = new Uint8Array(buffer.slice(0));
    const view = new DataView(bytes.buffer);

    function boxHeader(position, end) {
      if (position + 8 > end) return null;
      let size = view.getUint32(position, false);
      const type = boxType(bytes, position + 4);
      let header = 8;
      if (size === 1) {
        if (position + 16 > end) return null;
        const large = readU64(view, position + 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
        size = Number(large);
        header = 16;
      } else if (size === 0) {
        size = end - position;
      }
      if (!Number.isFinite(size) || size < header || position + size > end) return null;
      return { type, start: position, end: position + size, size, header };
    }

    function patchStco(box) {
      const payload = box.start + box.header;
      if (payload + 8 > box.end) return;
      const count = view.getUint32(payload + 4, false);
      let offset = payload + 8;
      if (offset + count * 4 > box.end) return;
      for (let i = 0; i < count; i++, offset += 4) {
        const oldValue = view.getUint32(offset, false);
        if (oldValue < insertAt || oldValue >= removeAt) continue;
        const next = oldValue + delta;
        if (next > 0xffffffff) throw new Error("MP4 requires 64-bit chunk offsets after optimisation.");
        view.setUint32(offset, next, false);
      }
    }

    function patchCo64(box) {
      const payload = box.start + box.header;
      if (payload + 8 > box.end) return;
      const count = view.getUint32(payload + 4, false);
      let offset = payload + 8;
      if (offset + count * 8 > box.end) return;
      const insert = BigInt(insertAt), remove = BigInt(removeAt), shift = BigInt(delta);
      for (let i = 0; i < count; i++, offset += 8) {
        const oldValue = readU64(view, offset);
        if (oldValue < insert || oldValue >= remove) continue;
        writeU64(view, offset, oldValue + shift);
      }
    }

    function walk(start, end) {
      let position = start;
      let guard = 0;
      while (position + 8 <= end && guard++ < 100000) {
        const box = boxHeader(position, end);
        if (!box) break;
        if (box.type === "stco") patchStco(box);
        else if (box.type === "co64") patchCo64(box);
        if (CONTAINERS.has(box.type)) {
          let childStart = box.start + box.header;
          if (box.type === "meta") childStart += 4;
          if (childStart < box.end) walk(childStart, box.end);
        }
        position = box.end;
      }
    }

    const root = boxHeader(0, bytes.byteLength);
    if (!root || root.type !== "moov") throw new Error("MP4 metadata box could not be parsed.");
    walk(root.start + root.header, root.end);
    return bytes;
  }

  async function optimise(blob) {
    if (!(blob instanceof Blob) || !isMp4(blob) || blob.size < 24) return blob;
    const boxes = await readTopLevelBoxes(blob);
    const moov = boxes.find((box) => box.type === "moov");
    const firstMdat = boxes.find((box) => box.type === "mdat");
    if (!moov || !firstMdat || moov.start < firstMdat.start) return blob;

    const moovBuffer = await blob.slice(moov.start, moov.end).arrayBuffer();
    const patchedMoov = patchChunkOffsets(moovBuffer, firstMdat.start, moov.start, moov.size);
    const type = blob.type || "video/mp4";
    return new Blob([
      blob.slice(0, firstMdat.start),
      patchedMoov,
      blob.slice(firstMdat.start, moov.start),
      blob.slice(moov.end)
    ], { type });
  }

  async function putFile(file) {
    if (!file || !(file instanceof Blob) || !isMp4(file)) return baseMedia.putFile(file);
    let fixed = file;
    try { fixed = await optimise(file); } catch (_) { fixed = file; }
    if (fixed === file) return baseMedia.putFile(file);
    const name = file.name || "observation-video.mp4";
    let ready;
    try {
      ready = new File([fixed], name, { type: file.type || fixed.type || "video/mp4", lastModified: Number(file.lastModified || Date.now()) });
    } catch (_) {
      ready = fixed;
      try { ready.name = name; } catch (_) {}
    }
    return baseMedia.putFile(ready);
  }

  async function getFile(id) {
    const record = await baseMedia.getFile(id);
    if (!record || !(record.blob instanceof Blob) || !isMp4(record)) return record;
    try {
      const fixed = await optimise(record.blob);
      if (fixed === record.blob) return record;
      return Object.assign({}, record, { blob: fixed, size: fixed.size, type: record.type || fixed.type || "video/mp4" });
    } catch (_) {
      return record;
    }
  }

  global.MilosMedia = Object.freeze(Object.assign({}, baseMedia, { putFile, getFile }));
  global.MilosMp4Faststart = Object.freeze({ version: VERSION, optimise, seekableLocalMp4: true, noReencode: true });
})(typeof window !== "undefined" ? window : globalThis);
