(function (global) {
  "use strict";

  const C = global.MilosCore;
  const root = document.getElementById("milosApp");
  if (!C || !root) return;

  const MIGRATION_KEY = "milos-home-repair-v234";

  function hasExistingWork() {
    const value = C.getSettings ? C.getSettings() : {};
    return !!(
      value.assessorName ||
      (C.getProfiles && C.getProfiles().length) ||
      (C.getReviews && C.getReviews().length) ||
      (C.getObservations && C.getObservations().length)
    );
  }

  function repairLegacyOnboarding() {
    const value = C.getSettings ? C.getSettings() : {};
    if (value.onboardingComplete || !hasExistingWork()) return false;
    C.saveSettings({ onboardingComplete: true });
    try { sessionStorage.setItem(MIGRATION_KEY, "1"); } catch (_) {}
    return true;
  }

  if (repairLegacyOnboarding()) {
    const next = new URL(global.location.href);
    next.searchParams.set("milosRepair", "2.34");
    global.location.replace(next.toString());
    return;
  }

  function bindDirectTap() {
    const target = root.querySelector('.milos-anchor[data-action="avatar"]');
    if (!target || target.dataset.milosDirectTap234 === "1") return;
    target.dataset.milosDirectTap234 = "1";
    target.style.touchAction = "manipulation";

    const activate = (event) => {
      if (event && event.pointerType === "mouse" && event.button !== 0) return;
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      }
      target.click();
    };

    if ("PointerEvent" in global) target.addEventListener("pointerdown", activate, { passive: false });
    else target.addEventListener("touchstart", activate, { passive: false });
  }

  bindDirectTap();
  new MutationObserver(bindDirectTap).observe(root, { childList: true, subtree: true });

  global.MilosHomeRepair = Object.freeze({ version: "2.34", repairLegacyOnboarding, bindDirectTap });
})(window);
