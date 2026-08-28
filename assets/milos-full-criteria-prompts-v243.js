(function (global) {
  "use strict";

  const VERSION = "2.43";
  let currentKsbCriteria = [];
  let layerObserver = null;
  let bodyObserver = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function typeForCode(code) {
    const first = String(code || "").charAt(0).toUpperCase();
    if (first === "K") return "Knowledge · theory";
    if (first === "S") return "Skill · practical";
    if (first === "B") return "Behaviour";
    return "Criterion";
  }

  function parseKsbCriteriaText(value) {
    const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    const criteria = [];
    const expression = /\b([KSB]\d+)\s*:\s*([\s\S]*?)(?=\s+\|\s+[KSB]\d+\s*:|$)/gi;
    let match;
    while ((match = expression.exec(text))) {
      const code = String(match[1] || "").toUpperCase();
      const description = String(match[2] || "").trim();
      if (code && description) criteria.push({ code, description, type: typeForCode(code) });
    }
    return criteria;
  }

  function criteriaHtml(criteria) {
    return `<span class="mve-full-criteria">${(criteria || []).map((item) => `<span class="mve-criterion-row"><b>${escapeHtml(item.code)}<small>${escapeHtml(item.type)}</small></b><em>${escapeHtml(item.description)}</em></span>`).join("")}</span>`;
  }

  function patchKsbReady(layer) {
    const context = layer.querySelector(".mvo-page .mvo-context");
    const details = context && context.querySelector("small");
    if (!details) return;

    const parsed = parseKsbCriteriaText(details.textContent);
    if (!parsed.length) return;
    currentKsbCriteria = parsed;

    const card = layer.querySelector(".mvo-page .mvo-prompt-card");
    if (!card || card.dataset.fullCriteria === "1") return;

    const heading = card.querySelector("strong");
    const existingCue = Array.from(card.querySelectorAll("p")).map((node) => node.textContent.trim()).filter(Boolean).join(" ");
    if (heading) heading.textContent = "Full KSB criteria";
    card.querySelectorAll("p").forEach((node) => node.remove());
    card.insertAdjacentHTML("beforeend", criteriaHtml(parsed));
    if (/witness/i.test(existingCue)) {
      card.insertAdjacentHTML("beforeend", `<p class="mve-secondary-cue">${escapeHtml(existingCue)}</p>`);
    }
    card.dataset.fullCriteria = "1";
  }

  function patchNvqRecording(layer) {
    const description = layer.querySelector("#mveAcDescription");
    if (!description) return false;
    const head = description.closest(".mvo-ac-head");
    if (!head) return true;
    head.classList.add("mve-full-ac-head");
    if (!head.querySelector(".mve-full-criterion-label")) {
      const label = document.createElement("small");
      label.className = "mve-full-criterion-label";
      label.textContent = "Full AC criterion";
      description.parentNode.insertBefore(label, description);
    }
    return true;
  }

  function patchKsbRecording(layer) {
    const prompt = layer.querySelector(".mvo-ac-head .ksbv-question");
    if (!prompt || !currentKsbCriteria.length) return;
    const head = prompt.closest(".mvo-ac-head");
    if (!head) return;

    head.classList.add("mve-full-ksb-head");
    const original = prompt.textContent.trim();
    prompt.innerHTML = criteriaHtml(currentKsbCriteria);
    if (/^witness prompt:/i.test(original)) {
      prompt.insertAdjacentHTML("beforeend", `<span class="mve-secondary-cue">${escapeHtml(original)}</span>`);
    }
    prompt.dataset.fullCriteria = "1";
  }

  function patchLayer(layer) {
    if (!layer || layer.hidden) return;
    patchKsbReady(layer);
    if (!patchNvqRecording(layer)) patchKsbRecording(layer);
  }

  function observeLayer(layer) {
    if (!layer || layerObserver) return;
    layerObserver = new MutationObserver(() => patchLayer(layer));
    layerObserver.observe(layer, { childList: true, subtree: true });
    patchLayer(layer);
  }

  function start() {
    const existing = document.getElementById("milosVideoObservationLayer");
    if (existing) {
      observeLayer(existing);
      return;
    }
    bodyObserver = new MutationObserver(() => {
      const layer = document.getElementById("milosVideoObservationLayer");
      if (!layer) return;
      bodyObserver.disconnect();
      bodyObserver = null;
      observeLayer(layer);
    });
    bodyObserver.observe(document.body, { childList: true });
  }

  global.MilosFullCriteriaPrompts = Object.freeze({
    version: VERSION,
    parseKsbCriteriaText,
    typeForCode,
    exactNvqWording: true,
    exactKsbWording: true
  });

  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})(typeof window !== "undefined" ? window : globalThis);
