(function (global) {
  "use strict";

  const originalQr = global.MilosQR;
  const originalCore = global.MilosCore;
  if (!originalQr || !originalCore) return;

  const OPTIONAL_SHARED_ID = "__MILOS_OPTIONAL_NO_EVIA__";
  let optionalCompletionWindow = false;

  function originalSnapshot(profile) {
    return originalCore.latestSnapshot(profile) || null;
  }

  function hasEviaIdentity(observation, profile) {
    const snapshot = originalSnapshot(profile) || {};
    const value = originalCore.cleanText((observation && observation.eviaSharedId) || snapshot.sharedId, 80);
    return Boolean(value && value !== OPTIONAL_SHARED_ID);
  }

  function beginOptionalCompletion() {
    optionalCompletionWindow = true;
    if (typeof global.setTimeout === "function") {
      global.setTimeout(function () { optionalCompletionWindow = false; }, 0);
    }
  }

  function latestSnapshot(profile) {
    const snapshot = originalSnapshot(profile);
    if (snapshot || !optionalCompletionWindow) return snapshot;
    return {
      sharedId: OPTIONAL_SHARED_ID,
      completedCodes: [],
      changedCodes: [],
      targets: [],
      learningHours: 0,
      learningTarget: 0,
      importedAt: Date.now(),
      optionalObservationOnly: true,
    };
  }

  function saveObservation(record) {
    const value = Object.assign({}, record || {});
    if (value.eviaSharedId === OPTIONAL_SHARED_ID) value.eviaSharedId = "";
    return originalCore.saveObservation(value);
  }

  global.MilosCore = Object.freeze(Object.assign({}, originalCore, {
    latestSnapshot,
    saveObservation,
  }));

  function observationPayload(observation, profile, course) {
    if (!hasEviaIdentity(observation, profile)) return "";
    return originalQr.observationPayload(observation, profile, course);
  }

  function requireReturnPayload(payload) {
    if (!String(payload == null ? "" : payload).trim()) {
      throw new Error("Scan Evia progress to create a return QR. The observation PDF is still available without it.");
    }
  }

  function render(container, payload, options) {
    requireReturnPayload(payload);
    return originalQr.render(container, payload, options);
  }

  function dataUrl(payload, requestedSize) {
    requireReturnPayload(payload);
    return originalQr.dataUrl(payload, requestedSize);
  }

  global.MilosQR = Object.freeze(Object.assign({}, originalQr, {
    observationPayload,
    render,
    dataUrl,
  }));

  global.MilosObservationOptional = Object.freeze({
    version: "2.1",
    beginOptionalCompletion,
    optionalSharedId: OPTIONAL_SHARED_ID,
  });

  if (!global.document) return;

  document.addEventListener("click", function (event) {
    const button = event.target && event.target.closest ? event.target.closest('[data-action="observation-complete"]') : null;
    if (button) beginOptionalCompletion();
  }, true);

  const textReplacements = new Map([
    [
      "Scan Evia first, then select every category, job and opportunity section you personally observe. More sections can be added during the visit.",
      "An Evia scan is recommended, not required. Select every category, job and opportunity section you personally observe. More sections can be added during the visit.",
    ],
    [
      "You can draft the record using the selected course, but a full Evia QR scan is required before Milos can create the return QR.",
      "You can complete and download the observation using the selected course. Scan Evia only if you also want to return observed criteria to the learner by QR.",
    ],
    ["scan required", "scan recommended"],
    [
      "Observation saved, QR created and PDF downloaded.",
      "Observation saved and PDF downloaded. A return QR is added when Evia progress has been scanned.",
    ],
  ]);

  function updateText(root) {
    if (!root || !document.createTreeWalker) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach((textNode) => {
      const current = textNode.nodeValue;
      if (!current) return;
      let next = current;
      textReplacements.forEach((replacement, source) => {
        next = next.split(source).join(replacement);
      });
      if (next !== current) textNode.nodeValue = next;
    });
  }

  function updateCompletedObservation(root) {
    const complete = root && root.querySelector ? root.querySelector(".milos-complete-view") : null;
    if (!complete || complete.dataset.optionalScanChecked === "true") return;
    const qr = complete.querySelector("#completedObservationQr");
    if (!qr || qr.querySelector("svg") || qr.querySelector(".milos-error")) return;

    complete.dataset.optionalScanChecked = "true";
    const heading = Array.from(complete.querySelectorAll("h4")).find((item) => item.textContent.trim() === "Return this result to Evia");
    if (heading) heading.hidden = true;
    if (heading && heading.nextElementSibling) heading.nextElementSibling.hidden = true;

    const qrButton = complete.querySelector('[data-action="observation-download-qr"]');
    if (qrButton) qrButton.hidden = true;
    const privacy = complete.querySelector(".milos-privacy-pill");
    if (privacy) privacy.hidden = true;

    qr.innerHTML = '<p class="milos-muted">Evia scan not used. This observation is complete and the PDF can be downloaded normally. A return QR is only created when Evia progress has been scanned.</p>';
  }

  function refreshUi() {
    const root = document.getElementById("milosApp");
    if (!root) return;
    updateText(root);
    updateCompletedObservation(root);
  }

  if (global.MutationObserver) {
    const root = document.getElementById("milosApp");
    if (root) {
      new MutationObserver(refreshUi).observe(root, { childList: true, subtree: true, characterData: true });
    }
  }
  document.addEventListener("DOMContentLoaded", refreshUi, { once: true });
})(window);
