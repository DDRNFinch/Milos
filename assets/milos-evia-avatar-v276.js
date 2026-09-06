(function (global) {
  "use strict";

  const VERSION = "2.76";
  const looks = [
    { x: 0, y: 0, tilt: 0 },
    { x: -0.038, y: 0, tilt: -1.2 },
    { x: 0.038, y: 0, tilt: 1.2 },
    { x: 0, y: -0.029, tilt: 0 },
    { x: 0, y: 0.029, tilt: 0.3 },
    { x: -0.029, y: -0.019, tilt: -1.6 },
    { x: 0.029, y: -0.019, tilt: 1.6 },
    { x: -0.029, y: 0.019, tilt: -1 },
    { x: 0.029, y: 0.019, tilt: 1 },
  ];

  let lastLook = 0;
  let stopped = false;

  function reduced(app) {
    return !!(app && app.classList.contains("is-reduced-motion")) ||
      !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function pickDifferentLook() {
    let next = Math.floor(Math.random() * looks.length);
    while (looks.length > 1 && next === lastLook) next = Math.floor(Math.random() * looks.length);
    lastLook = next;
    return looks[next];
  }

  function init() {
    const app = document.getElementById("milosApp");
    const anchor = app && app.querySelector(".milos-anchor");
    if (!app || !anchor || anchor.dataset.eviaAvatarParity === "2.76") return;
    anchor.dataset.eviaAvatarParity = "2.76";

    function applyLook() {
      if (stopped || reduced(app)) return;
      const look = pickDifferentLook();
      anchor.style.setProperty("--milos-eye-x", `${look.x}em`);
      anchor.style.setProperty("--milos-eye-y", `${look.y}em`);
      anchor.style.setProperty("--milos-char-tilt", `${look.tilt}deg`);
    }

    function blink(doubleBlink) {
      if (stopped || reduced(app) || anchor.classList.contains("milos-parity-blink")) return;
      anchor.classList.add("milos-parity-blink");
      setTimeout(() => {
        anchor.classList.remove("milos-parity-blink");
        if (doubleBlink) {
          setTimeout(() => {
            anchor.classList.add("milos-parity-blink");
            setTimeout(() => anchor.classList.remove("milos-parity-blink"), 130);
          }, 110);
        }
      }, 130);
    }

    function scheduleLooks() {
      if (stopped) return;
      applyLook();
      setTimeout(scheduleLooks, 2800 + Math.random() * 2200);
    }

    function scheduleBlinks() {
      if (stopped) return;
      blink(Math.random() < 0.22);
      setTimeout(scheduleBlinks, 3200 + Math.random() * 2600);
    }

    scheduleLooks();
    scheduleBlinks();

    global.MilosEviaAvatarParity = Object.freeze({
      version: VERSION,
      blue: "#2C85F7",
      stop() { stopped = true; },
      look: applyLook,
      blink,
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
