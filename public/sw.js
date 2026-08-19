// StoryLingo service worker.
//
// Deliberately does not precache the JS/CSS bundle by filename: Vite content-
// hashes those at build time, and hardcoding a list here would drift out of
// sync with every deploy and break in a way this file could never detect.
// Instead it caches what a reader actually visits, as they visit it, which
// is enough to make chapters already read work offline and keeps this file
// correct regardless of how the app is built.
const VERSION = "v1";
const RUNTIME_CACHE = `storylingo-runtime-${VERSION}`;
const IMAGE_CACHE = `storylingo-art-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(RUNTIME_CACHE).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = new Set([RUNTIME_CACHE, IMAGE_CACHE]);
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("storylingo-") && !keep.has(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Illustrations are served with an immutable cache-control already, so a
 * plain cache-first strategy matches what the server itself promises. */
function isArt(url) {
  return url.pathname.startsWith("/api/public/art/");
}

/** Vite's own hashed build output — safe to cache forever once fetched. */
function isBuiltAsset(url) {
  return /\.(js|mjs|css|woff2?)$/.test(url.pathname);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(RUNTIME_CACHE);
    return (await cache.match(OFFLINE_URL)) ?? new Response("Offline", { status: 503 });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Server functions, /api/tts and anything else non-GET must reach the
  // network untouched — /api/tts also keeps its own IndexedDB cache in
  // src/lib/audio.ts, so duplicating that here would only waste storage.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Cross-origin requests (Google Fonts, the hanzi-writer CDN) are left to
  // the browser's ordinary HTTP cache rather than duplicated here.
  if (url.origin !== self.location.origin) return;

  if (isArt(url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }
  if (isBuiltAsset(url)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
  }
});
