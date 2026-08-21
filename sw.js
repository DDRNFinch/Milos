const CACHE_NAME = "milos-assessor-shell-v2.3";
const CACHE_PREFIX = "milos-assessor-shell-";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./assets/jsQR-1.4.0.js",
  "./assets/qrcode.js",
  "./assets/jspdf.umd.min.js",
  "./assets/milos-core.js",
  "./assets/milos-nvq-mapping-v22.js",
  "./assets/milos-qr.js",
  "./assets/milos-observation-optional.js",
  "./assets/milos-media.js",
  "./assets/milos-pdf.js",
  "./assets/milos-observation-export.js",
  "./assets/milos-app.js",
  "./assets/milos-evia-v2.js",
  "./course-packs/Bricklayer_ST0095_v1.2.nisi",
  "./course-packs/Carpentry_Joinery_ST0264_v1.4.nisi",
  "./course-packs/Trowel_Occupations_6570-05_v1.nisi"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/sw.js")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put("./index.html", response.clone());
        }
        return response;
      } catch (_) {
        return (await caches.match("./index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
