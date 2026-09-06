(function (global) {
  "use strict";

  const VERSION = "2.79-evia-exact";
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

    /* Exact current Evia avatar DOM structure. */
    float.innerHTML = `
      <span class="evia-character" id="milosEviaCharacter" aria-hidden="true">
        <span class="evia-body">
          <span class="eyes">
            <span class="eye"></span>
            <span class="eye"></span>
          </span>
        </span>
      </span>`;

    const evia = document.getElementById("milosEviaCharacter");
    if (!evia) return;

    function applyLook() {
      if (accentBusy || evia.classList.contains("talking")) return;
      const look = pickDifferentLook();
      anchor.style.setProperty("--eye-x", `${look.x}em`);
      anchor.style.setProperty("--eye-y", `${look.y}em`);
      anchor.style.setProperty("--char-tilt", `${look.tilt}deg`);
    }

    function blink(doubleBlink = false) {
      if (evia.classList.contains("talking")) return;
      evia.classList.add("blink");
      setTimeout(() => {
        evia.classList.remove("blink");
        if (doubleBlink) {
          setTimeout(() => {
            evia.classList.add("blink");
            setTimeout(() => evia.classList.remove("blink"), 130);
          }, 110);
        }
      }, 130);
    }

    function runAccent() {
      if (accentBusy || app.classList.contains("is-open") || evia.classList.contains("talking")) return;
      accentBusy = true;
      const accent = accents[Math.floor(Math.random() * accents.length)];
      evia.classList.add(accent);
      const duration = accent === "accent-lean" ? 1350 : accent === "accent-squish" ? 1150 : 1200;
      setTimeout(() => {
        evia.classList.remove(accent);
        accentBusy = false;
      }, duration + 50);
    }

    function scheduleLooks() {
      applyLook();
      setTimeout(scheduleLooks, 2800 + Math.random() * 2200);
    }

    function scheduleBlinks() {
      blink(Math.random() < 0.22);
      setTimeout(scheduleBlinks, 3200 + Math.random() * 2600);
    }

    function scheduleAccents() {
      runAccent();
      setTimeout(scheduleAccents, 6200 + Math.random() * 2600);
    }

    applyLook();
    setTimeout(scheduleLooks, 1800);
    setTimeout(scheduleBlinks, 2200);
    setTimeout(scheduleAccents, 4200);

    global.MilosEviaAvatarParity = Object.freeze({
      version: VERSION,
      blue: "#2C85F7",
      exactCurrentEviaStructure: true,
      look: applyLook,
      blink,
      accent: runAccent,
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
