(function () {
  "use strict";

  const root = document.getElementById("milosApp");
  if (!root) return;

  let proxying = false;

  function replayAvatarAction() {
    if (proxying) return;
    const proxy = document.createElement("button");
    proxy.type = "button";
    proxy.hidden = true;
    proxy.dataset.action = "avatar";
    proxying = true;
    root.appendChild(proxy);
    try { proxy.click(); }
    finally {
      proxy.remove();
      proxying = false;
    }
  }

  root.addEventListener("click", (event) => {
    const anchor = event.target && event.target.closest ? event.target.closest(".milos-anchor[data-action=\"avatar\"]") : null;
    if (!anchor || proxying) return;

    const wasOpen = root.classList.contains("is-open");
    window.setTimeout(() => {
      const isOpen = root.classList.contains("is-open");
      if (isOpen === wasOpen) replayAvatarAction();
    }, 0);
  }, true);

  window.MilosHomeOpen = Object.freeze({ version: "2.33", replayAvatarAction });
})();
