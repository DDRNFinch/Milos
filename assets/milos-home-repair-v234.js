(function (global) {
  "use strict";

  const C = global.MilosCore;
  if (!C) return;

  function hasExistingWork() {
    const value = C.getSettings ? C.getSettings() : {};
    return !!(
      value.assessorName ||
      value.organisation ||
      (C.getProfiles && C.getProfiles().length) ||
      (C.getReviews && C.getReviews().length) ||
      (C.getObservations && C.getObservations().length)
    );
  }

  function repairLegacyOnboarding() {
    const value = C.getSettings ? C.getSettings() : {};
    if (value.onboardingComplete || !hasExistingWork()) return false;
    C.saveSettings({ onboardingComplete: true });
    return true;
  }

  if (repairLegacyOnboarding()) {
    const avatarAlreadyRendered = !!document.querySelector('.milos-anchor[data-action="avatar"]');
    if (avatarAlreadyRendered) {
      const next = new URL(global.location.href);
      next.searchParams.set("milosRepair", "2.34-safe");
      global.location.replace(next.toString());
      return;
    }
  }

  global.MilosHomeRepair = Object.freeze({ version: "2.34-safe", repairLegacyOnboarding });
})(window);
