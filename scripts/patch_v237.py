from pathlib import Path
import json
import subprocess
import tarfile
import tempfile
import shutil

root = Path(__file__).resolve().parents[1]
js_path = root / "assets/milos-video-evidence-v231.js"
text = js_path.read_text(encoding="utf-8")


def replace_once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f"Missing patch target: {label}")
    text = text.replace(old, new, 1)


# Vendor the small MIT WebM metadata repair library for fully offline use.
with tempfile.TemporaryDirectory() as tmp:
    tmp_path = Path(tmp)
    result = subprocess.run(
        ["npm", "pack", "fix-webm-duration@1.0.6", "--silent"],
        cwd=tmp_path,
        check=True,
        capture_output=True,
        text=True,
    )
    archive = tmp_path / result.stdout.strip().splitlines()[-1]
    with tarfile.open(archive, "r:gz") as tf:
        tf.extractall(tmp_path)
    package = tmp_path / "package"
    shutil.copyfile(package / "fix-webm-duration.js", root / "assets/fix-webm-duration-1.0.6.js")
    licence = package / "LICENSE"
    if not licence.exists():
        licence = package / "LICENSE.md"
    out_licence = root / "third-party-licenses/fix-webm-duration-MIT.txt"
    if licence.exists():
        shutil.copyfile(licence, out_licence)
    else:
        out_licence.write_text(
            "fix-webm-duration 1.0.6 — MIT licensed. Source: https://github.com/yusitnikov/fix-webm-duration\n",
            encoding="utf-8",
        )

replace_once('const VERSION = "2.31";', 'const VERSION = "2.37";', "engine version")

old_candidates = '''    const candidates = apple
      ? ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"]
      : ["video/webm;codecs=vp8,opus", "video/webm", "video/webm;codecs=vp9,opus", "video/mp4;codecs=h264,aac", "video/mp4"];'''
new_candidates = '''    const candidates = apple
      ? ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"]
      : ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=h264,aac", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];'''
replace_once(old_candidates, new_candidates, "MP4-first recording")

old_blob = '''    const type = recorder.mimeType || (state.chunks[0] && state.chunks[0].type) || "video/webm", blob = new Blob(state.chunks, { type });
    if (!blob.size) { stopStream(); state.recorder = null; throw new Error("The recording file was empty. Record this section again."); }
    const ext = extensionForMime(type), filename = recordingName(kind, item, state.recordStartedAt, ext);
    let file; try { file = new File([blob], filename, { type, lastModified: state.recordStartedAt }); } catch (_) { file = blob; file.name = filename; }
    const media = await M.putFile(file);
    const result = { media, filename, mimeType: type, startedAt: state.recordStartedAt, endedAt, durationSeconds: Math.max(1, Math.round((endedAt - state.recordStartedAt) / 1000)) };'''
new_blob = '''    const type = recorder.mimeType || (state.chunks[0] && state.chunks[0].type) || "video/webm";
    let blob = new Blob(state.chunks, { type });
    if (!blob.size) { stopStream(); state.recorder = null; throw new Error("The recording file was empty. Record this section again."); }
    const durationMs = Math.max(1, endedAt - state.recordStartedAt);
    if (String(type).toLowerCase().includes("webm") && typeof global.ysFixWebmDuration === "function") {
      try { blob = await global.ysFixWebmDuration(blob, durationMs, { logger: false }); } catch (_) {}
    }
    const ext = extensionForMime(type), filename = recordingName(kind, item, state.recordStartedAt, ext);
    let file; try { file = new File([blob], filename, { type, lastModified: state.recordStartedAt }); } catch (_) { file = blob; file.name = filename; }
    const media = await M.putFile(file);
    const result = { media, filename, mimeType: type, startedAt: state.recordStartedAt, endedAt, durationSeconds: Math.max(1, Math.round(durationMs / 1000)) };'''
replace_once(old_blob, new_blob, "save-time WebM duration repair")

old_status = '''      const statusLines = acs.map((ac) => `${ac.code} — ${decisionLabel(ac.status)}`);'''
new_status = '''      const statusLines = acs.map((ac) => {
        const start = offsetLabel(ac.startedOffsetMs);
        const end = offsetLabel(ac.endedOffsetMs == null ? ac.startedOffsetMs : ac.endedOffsetMs);
        return `${ac.code} — Video ${start}${end !== start ? `–${end}` : ""} — ${decisionLabel(ac.status)}`;
      });'''
replace_once(old_status, new_status, "AC timestamps in PDF")

export_anchor = '''  function downloadBlob(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
  async function exportRecord(input) {'''
export_helpers = '''  function mediaDurationMs(record, mediaId) {
    const timelines = [record && record.videoTimeline || [], ...(record && record.witnessEvidence || []).map((item) => item.videoTimeline || [])];
    const clip = timelines.flat().find((item) => item && item.mediaId === mediaId);
    if (!clip) return 0;
    const explicit = Number(clip.durationSeconds || 0) * 1000;
    if (explicit > 0) return explicit;
    return Math.max(0, Number(clip.endedAt || 0) - Number(clip.startedAt || 0));
  }
  async function seekableEvidenceBlob(blob, record, mediaId) {
    if (!blob || !String(blob.type || "").toLowerCase().includes("webm") || typeof global.ysFixWebmDuration !== "function") return blob;
    const durationMs = mediaDurationMs(record, mediaId);
    if (!durationMs) return blob;
    try { return await global.ysFixWebmDuration(blob, durationMs, { logger: false }); } catch (_) { return blob; }
  }

  function downloadBlob(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
  async function exportRecord(input) {'''
replace_once(export_anchor, export_helpers, "existing-evidence duration helper")

old_entry = '''        entries.push({ name: clean(item.name || stored.name, 170) || "video", blob: stored.blob, date: new Date(Number(stored.createdAt || item.startedAt || Date.now())) });'''
new_entry = '''        const exportBlob = await seekableEvidenceBlob(stored.blob, record, item.id);
        entries.push({ name: clean(item.name || stored.name, 170) || "video", blob: exportBlob, date: new Date(Number(stored.createdAt || item.startedAt || Date.now())) });'''
replace_once(old_entry, new_entry, "existing WebM export repair")

replace_once(
    "stablePreview: true, exportRecord, buildProfessionalPdf",
    "stablePreview: true, seekableMedia: true, acTimestampsInPdf: true, exportRecord, buildProfessionalPdf",
    "capability flags",
)
js_path.write_text(text, encoding="utf-8")

index_path = root / "index.html"
index = index_path.read_text(encoding="utf-8")
if 'content="2.36"' not in index:
    raise SystemExit("Expected Milos 2.36 index before patch")
index = index.replace('content="2.36"', 'content="2.37"', 1).replace("?v=2.36", "?v=2.37")
needle = '  <script defer src="./assets/milos-app.js?v=2.37"></script>\n  <script defer src="./assets/milos-video-evidence-v231.js?v=2.37"></script>'
replacement = '  <script defer src="./assets/milos-app.js?v=2.37"></script>\n  <script defer src="./assets/fix-webm-duration-1.0.6.js?v=2.37"></script>\n  <script defer src="./assets/milos-video-evidence-v231.js?v=2.37"></script>'
if needle not in index:
    raise SystemExit("Missing index insertion target")
index_path.write_text(index.replace(needle, replacement, 1), encoding="utf-8")

sw_path = root / "sw.js"
sw = sw_path.read_text(encoding="utf-8")
if "milos-assessor-shell-v2.36" not in sw:
    raise SystemExit("Expected 2.36 service worker before patch")
sw = sw.replace("milos-assessor-shell-v2.36", "milos-assessor-shell-v2.37", 1)
needle = '  "./assets/milos-app.js",\n  "./assets/milos-video-observation-v226.css",'
replacement = '  "./assets/milos-app.js",\n  "./assets/fix-webm-duration-1.0.6.js",\n  "./assets/milos-video-observation-v226.css",'
if needle not in sw:
    raise SystemExit("Missing service worker insertion target")
sw_path.write_text(sw.replace(needle, replacement, 1), encoding="utf-8")

pkg_path = root / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
pkg["version"] = "2.37.0"
check = pkg["scripts"]["check"]
if "assets/fix-webm-duration-1.0.6.js" not in check:
    check = check.replace(
        "node --check assets/milos-video-evidence-v231.js",
        "node --check assets/fix-webm-duration-1.0.6.js && node --check assets/milos-video-evidence-v231.js",
    )
pkg["scripts"]["check"] = check
pkg_path.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")

update = {
    "version": "2.37",
    "title": "Evidence timestamps and seekable video",
    "details": [
        "Every observed AC now shows its exact video start and end timestamp on the professional PDF",
        "New Android recordings prefer MP4 when the device supports it so evidence can be scrubbed and fast-forwarded normally",
        "WebM recordings are repaired without transcoding so duration metadata is present and the progress bar can seek",
        "Existing video observations are repaired when their evidence ZIP is downloaded, so previously recorded evidence does not need to be recorded again",
        "Video quality is unchanged by the seekability repair; Milos only fixes container metadata",
    ],
}
(root / "update.json").write_text(json.dumps(update, indent=2) + "\n", encoding="utf-8")

# Existing release assertions should follow the shell version, while updater implementation stays v236.
for path in (root / "tests").glob("*.test.mjs"):
    test_text = path.read_text(encoding="utf-8")
    test_text = test_text.replace("2\\.36", "2\\.37").replace("2.36", "2.37")
    path.write_text(test_text, encoding="utf-8")

new_test = root / "tests/milos-evidence-seek-v237.test.mjs"
new_test.write_text(
    r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js=readFileSync(new URL('../assets/milos-video-evidence-v231.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

test('AC timestamps are printed in the professional evidence PDF',()=>{
  assert.match(js,/Video \$\{start\}/);
  assert.match(js,/startedOffsetMs/);
  assert.match(js,/endedOffsetMs/);
  assert.match(js,/acTimestampsInPdf: true/);
});

test('new recordings prefer MP4 when MediaRecorder supports it',()=>{
  const base=js.indexOf('const candidates');
  const mp4=js.indexOf('video/mp4;codecs=avc1.42E01E,mp4a.40.2',base);
  const webm=js.indexOf('video/webm;codecs=vp8,opus',base);
  assert.ok(mp4>=0&&webm>=0&&mp4<webm);
});

test('WebM is repaired at save and export without transcoding',()=>{
  assert.match(js,/ysFixWebmDuration\(blob, durationMs/);
  assert.match(js,/seekableEvidenceBlob/);
  assert.match(js,/seekableMedia: true/);
  assert.doesNotMatch(js,/prepareVideoForExport/);
});

test('offline shell contains duration repair library',()=>{
  assert.match(index,/fix-webm-duration-1\.0\.6\.js\?v=2\.37/);
  assert.ok(index.indexOf('fix-webm-duration-1.0.6.js')<index.indexOf('milos-video-evidence-v231.js'));
  assert.match(sw,/fix-webm-duration-1\.0\.6\.js/);
  assert.match(sw,/milos-assessor-shell-v2\.37/);
});
''',
    encoding="utf-8",
)
