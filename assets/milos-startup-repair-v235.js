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

  repairLegacyOnboarding();

  global.MilosStartupRepair = Object.freeze({
    version: "2.35",
    repairLegacyOnboarding,
    syntheticTapHandlers: false,
  });
})(window);
