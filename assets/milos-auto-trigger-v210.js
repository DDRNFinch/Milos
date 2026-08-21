(function (global) {
  "use strict";

  if (!global.document) return;

  const TAP_TARGET = 7;
  const TAP_RESET_MS = 5000;
  const REVIEW_PROFILE_KEY = "milos-auto-review-profile-v1";
  const OBS_PROFILE_KEY = "milos-auto-observation-profile-v1";
  const MARK_SELECTOR = ".milos-guidance > span";

  let tapCount = 0;
  let lastTapAt = 0;
  let lastTouchAt = 0;

  function clean(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function showToast(message, isError) {
    const region = document.getElementById("toastRegion");
    if (!region) return;
    region.innerHTML = `<div class="app-toast is-visible${isError ? " is-error" : ""}" role="status"></div>`;
    const item = region.querySelector(".app-toast");
    if (item) item.textContent = message;
    setTimeout(() => {
      const current = region.querySelector(".app-toast");
      if (current) current.classList.remove("is-visible");
      setTimeout(() => { if (region) region.innerHTML = ""; }, 350);
    }, 2600);
  }

  function relevantForm(mark) {
    const page = mark && mark.closest ? mark.closest(".milos-page") : null;
    if (!page) return null;
    return page.querySelector('form[data-form="observation-record"], form[data-form^="review-"]');
  }

  function targetMark(event) {
    const mark = event && event.target && event.target.closest ? event.target.closest(MARK_SELECTOR) : null;
    return mark && relevantForm(mark) ? mark : null;
  }

  function decorateMark(mark) {
    if (!mark || !relevantForm(mark)) return;
    if (mark.dataset.milosAutoTrigger === "true") return;
    mark.dataset.milosAutoTrigger = "true";
    mark.setAttribute("role", "button");
    mark.setAttribute("tabindex", "0");
    mark.setAttribute("aria-label", "Milos Automatic Mode. Tap seven times to activate.");
  }

  function decorateTree(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(MARK_SELECTOR)) decorateMark(root);
    if (root.querySelectorAll) root.querySelectorAll(MARK_SELECTOR).forEach(decorateMark);
  }

  function rememberProfile(event) {
    const target = event.target && event.target.closest ? event.target.closest('[data-action][data-id]') : null;
    if (!target) return;
    const id = clean(target.dataset.id);
    if (!id) return;
    try {
      if (target.dataset.action === "start-review") sessionStorage.setItem(REVIEW_PROFILE_KEY, id);
      if (target.dataset.action === "start-observation") sessionStorage.setItem(OBS_PROFILE_KEY, id);
    } catch (_) {}
  }

  function profileIsKnown(mark) {
    const form = relevantForm(mark);
    if (!form) return false;
    const isObservation = form.matches('form[data-form="observation-record"]');
    const key = isObservation ? OBS_PROFILE_KEY : REVIEW_PROFILE_KEY;
    try { return !!clean(sessionStorage.getItem(key)); } catch (_) { return false; }
  }

  function replayWriterActivation(mark) {
    for (let index = 0; index < TAP_TARGET; index += 1) {
      mark.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: global,
      }));
    }
  }

  function countTap(mark) {
    if (!mark || !relevantForm(mark)) return;
    const now = Date.now();
    if (!lastTapAt || now - lastTapAt > TAP_RESET_MS) tapCount = 0;
    tapCount += 1;
    lastTapAt = now;
    if (tapCount < TAP_TARGET) return;

    tapCount = 0;
    lastTapAt = 0;

    if (!profileIsKnown(mark)) {
      showToast("Milos Automatic Mode could not identify the current learner. Go back and reopen this review or observation.", true);
      return;
    }

    replayWriterActivation(mark);
    showToast("Milos Automatic Mode activated. The generated text remains editable.", false);
  }

  document.addEventListener("pointerup", (event) => {
    const mark = targetMark(event);
    if (!mark) return;
    event.preventDefault();
    lastTouchAt = Date.now();
    countTap(mark);
  }, true);

  document.addEventListener("touchend", (event) => {
    if (global.PointerEvent || Date.now() - lastTouchAt < 750) return;
    const mark = targetMark(event);
    if (!mark) return;
    event.preventDefault();
    lastTouchAt = Date.now();
    countTap(mark);
  }, { capture: true, passive: false });

  document.addEventListener("click", (event) => {
    rememberProfile(event);

    const mark = targetMark(event);
    if (!mark || !event.isTrusted) return;

    // Physical mobile clicks are suppressed so the v2.9 writer only receives
    // the seven synthetic clicks sent after seven pointer/touch taps.
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const mark = targetMark(event);
    if (!mark) return;
    event.preventDefault();
    countTap(mark);
  }, true);

  function startObserver() {
    const root = document.getElementById("viewPanel") || document.getElementById("milosApp");
    if (!root || root.__milosAutoTriggerV210) return;
    root.__milosAutoTriggerV210 = true;
    decorateTree(root);
    new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => decorateTree(node));
      });
    }).observe(root, { childList: true, subtree: true });
  }

  const style = document.createElement("style");
  style.id = "milos-auto-trigger-v210-style";
  style.textContent = `${MARK_SELECTOR}{cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}`;
  document.head.appendChild(style);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  else startObserver();

  global.MilosAutoTrigger = Object.freeze({ version: "2.10", tapTarget: TAP_TARGET });
})(window);
