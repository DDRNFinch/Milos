(function () {
  "use strict";

  const root = document.getElementById("milosApp");
  if (!root) return;

  let activating = false;
  let lastActivation = 0;

  function anchor() {
    return root.querySelector('.milos-anchor[data-action="avatar"]');
  }

  function activateMenu(event) {
    const target = anchor();
    if (!target || activating) return;
    const now = Date.now();
    if (now - lastActivation < 450) return;
    lastActivation = now;

    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    }

    activating = true;
    try {
      target.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    } finally {
      activating = false;
    }
  }

  function bind() {
    const target = anchor();
    if (!target || target.dataset.milosDirectOpen === "1") return;
    target.dataset.milosDirectOpen = "1";
    target.style.touchAction = "manipulation";

    if ("PointerEvent" in window) {
      target.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        activateMenu(event);
      }, { passive: false });
    } else {
      target.addEventListener("touchstart", activateMenu, { passive: false });
    }
  }

  bind();
  new MutationObserver(bind).observe(root, { childList: true, subtree: true });

  window.MilosHomeOpen = Object.freeze({ version: "2.33", activateMenu, bind });
})();
