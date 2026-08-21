(function (global) {
  "use strict";

  const original = global.MilosQR;
  const core = global.MilosCore;
  if (!original || !core) return;

  function hasEviaIdentity(observation, profile) {
    const snapshot = core.latestSnapshot(profile) || {};
    return Boolean(core.cleanText((observation && observation.eviaSharedId) || snapshot.sharedId, 80));
  }

  function observationPayload(observation, profile, course) {
    if (!hasEviaIdentity(observation, profile)) return "";
    return original.observationPayload(observation, profile, course);
  }

  function requireReturnPayload(payload) {
    if (!String(payload == null ? "" : payload).trim()) {
      throw new Error("Scan Evia progress to create a return QR. The observation PDF is still available without it.");
    }
  }

  function render(container, payload, options) {
    requireReturnPayload(payload);
    return original.render(container, payload, options);
  }

  function dataUrl(payload, requestedSize) {
    requireReturnPayload(payload);
    return original.dataUrl(payload, requestedSize);
  }

  global.MilosQR = Object.freeze(Object.assign({}, original, {
    observationPayload,
    render,
    dataUrl,
  }));

  const textReplacements = new Map([
    [
      "Scan Evia first, then select every category, job and opportunity section you personally observe. More sections can be added during the visit.",
      "An Evia scan is recommended, not required. Select every category, job and opportunity section you personally observe. More sections can be added during the visit.",
    ],
    ["scan required", "scan recommended"],
    [
      "Observation saved, QR created and PDF downloaded.",
      "Observation saved and PDF downloaded. A return QR is added when Evia progress has been scanned.",
    ],
  ]);

  function updateText(root) {
    if (!root || !global.document || !document.createTreeWalker) return;
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
