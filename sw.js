const CACHE_NAME = "milos-assessor-shell-v2.47";
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
  "./assets/milos-startup-repair-v235.js",
  "./assets/milos-nvq-mapping-v22.js",
  "./assets/milos-evia-course-packs-v217.js",
  "./assets/milos-qr.js",
  "./assets/milos-coach-v222.js",
  "./assets/milos-attendance-v224.js",
  "./assets/milos-coach-qr-v222.js",
  "./assets/milos-course-pack-share-v220.js",
  "./assets/milos-app-links-v221.js",
  "./assets/milos-observation-optional.js",
  "./assets/milos-media.js",
  "./assets/milos-mp4-faststart-v238.js",
  "./assets/milos-media-optimize-v24.js",
  "./assets/milos-media-export-safe-v225.js",
  "./assets/milos-pdf.js",
  "./assets/milos-observation-pdf-source-v225.js",
  "./assets/milos-observation-bundle-v22.js",
  "./assets/milos-evidence-compat-v239.js",
  "./assets/milos-evidence-player-v241.js",
  "./assets/milos-evidence-navigator-v245.js",
  "./assets/milos-square-evidence-v244.js",
  "./assets/milos-evidence-timeline-v242.js",
  "./assets/milos-observation-export-v225.js",
  "./assets/milos-review-compliance-v223.js",
  "./assets/milos-review-compliance-v223.css",
  "./assets/milos-app.js",
  "./assets/fix-webm-duration-1.0.6.js",
  "./assets/milos-video-observation-v226.css",
  "./assets/milos-ksb-video-v230.css",
  "./assets/milos-video-evidence-v231.js",
  "./assets/milos-video-evidence-v231.css",
  "./assets/milos-square-evidence-v244.css",
  "./assets/milos-full-criteria-prompts-v243.js",
  "./assets/milos-full-criteria-prompts-v243.css",
  "./assets/milos-video-layout-v245.css",
  "./assets/milos-observation-outcomes-v247.js",
  "./assets/milos-observation-outcomes-v247.css",
  "./assets/milos-week-calendar-v228.js",
  "./assets/milos-week-calendar-v228.css",
  "./assets/milos-calendar-manager-v230.css",
  "./assets/milos-standard-ui-v229.js",
  "./assets/milos-standard-ui-v229.css",
  "./assets/milos-review-deadlines-v215.js",
  "./assets/milos-uk-dates-v215.js",
  "./assets/milos-planning-v213.js",
  "./assets/milos-auto-trigger-v211.js",
  "./assets/milos-auto-v29.js",
  "./assets/milos-record-management-v28.js",
  "./assets/milos-evia-v2.js",
  "./assets/milos-ui-current-v219.js",
  "./assets/milos-updater-v236.js",
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

  const freshVersionCheck = url.searchParams.has("check") && url.pathname.endsWith("/index.html");
  if (url.pathname.endsWith("/sw.js") || url.pathname.endsWith("/update.json") || freshVersionCheck) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = (await cache.match("./index.html")) || (await cache.match("./"));
      if (cached) return cached;
      try {
        return await fetch(request, { cache: "no-store" });
      } catch (_) {
        return Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request, { cache: "no-store" });
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
