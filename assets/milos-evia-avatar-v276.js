(function (global) {
  "use strict";

  const VERSION = "2.79";
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
  const accents = ["accent-wobble", "accent-squish", "accent-lean"];

  let accentBusy = false;
  let lastLook = 0;
  let stopped = false;

  function reduced(app) {
    return !!(app && app.classList.contains("is-reduced-motion")) ||
      !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function pickDifferentLook() {
    let next = lastLook;
    while (next === lastLook) next = Math.floor(Math.random() * looks.length);
    lastLook = next;
    return looks[next];
  }

  function init() {
    const app = document.getElementById("milosApp");
    const anchor = app && app.querySelector(".milos-anchor");
    const float = anchor && anchor.querySelector(".evia-float");
    if (!app || !anchor || !float || anchor.dataset.eviaAvatarParity === VERSION) return;
    anchor.dataset.eviaAvatarParity = VERSION;

    /* Current Evia DOM structure. milosFace remains only as Milos's existing pose hook. */
    float.innerHTML = `
      <span id="milosFace" class="evia-face expression-idle" aria-hidden="true">
        <span class="evia-character" id="milosEviaCharacter">
          <span class="evia-body">
            <span class="eyes">
              <span class="eye"></span>
              <span class="eye"></span>
            </span>
          </span>
        </span>
      </span>`;

    const character = document.getElementById("milosEviaCharacter");
    if (!character) return;

    function applyLook() {
      if (stopped || reduced(app) || accentBusy || character.classList.contains("talking")) return;
      const look = pickDifferentLook();
      anchor.style.setProperty("--milos-eye-x", `${look.x}em`);
      anchor.style.setProperty("--milos-eye-y", `${look.y}em`);
      anchor.style.setProperty("--milos-char-tilt", `${look.tilt}deg`);
    }

    function blink(doubleBlink = false) {
      if (stopped || reduced(app) || character.classList.contains("talking") || character.classList.contains("blink")) return;
      character.classList.add("blink");
      setTimeout(() => {
        character.classList.remove("blink");
        if (doubleBlink) {
          setTimeout(() => {
            character.classList.add("blink");
            setTimeout(() => character.classList.remove("blink"), 130);
          }, 110);
        }
      }, 130);
    }

    function runAccent() {
      if (stopped || reduced(app) || accentBusy || app.classList.contains("is-open") || character.classList.contains("talking")) return;
      accentBusy = true;
      const accent = accents[Math.floor(Math.random() * accents.length)];
      character.classList.add(accent);
      const duration = accent === "accent-lean" ? 1350 : accent === "accent-squish" ? 1150 : 1200;
      setTimeout(() => {
        character.classList.remove(accent);
        accentBusy = false;
      }, duration + 50);
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

    function scheduleAccents() {
      if (stopped) return;
      runAccent();
      setTimeout(scheduleAccents, 6200 + Math.random() * 2600);
    }

    setTimeout(scheduleLooks, 1800);
    setTimeout(scheduleBlinks, 2200);
    setTimeout(scheduleAccents, 4200);

    global.MilosEviaAvatarParity = Object.freeze({
      version: VERSION,
      blue: "#2C85F7",
      exactCurrentEviaStructure: true,
      stop() { stopped = true; },
      look: applyLook,
      blink,
      accent: runAccent,
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
