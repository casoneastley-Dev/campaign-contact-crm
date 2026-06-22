/* Service worker: precache the app shell so the CRM works offline.
   Network-first so code updates land immediately; cache is the offline fallback.
   Bump CACHE_VERSION whenever any shell file changes. */
const CACHE_VERSION = "v11";
const CACHE_NAME = `campaign-crm-${CACHE_VERSION}`;

const SHELL = [
  ".",
  "index.html",
  "styles.css",
  "lib.js",
  "ai.js",
  "app.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Network-first for same-origin requests: always try the live file, refresh the
  // cache with it, and fall back to the cache only when the network is unavailable.
  // This prevents stale JS/CSS/HTML from being served after a deploy.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
