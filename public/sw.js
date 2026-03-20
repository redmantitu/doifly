const APP_CACHE = "doifly-shell-v3";
const STATIC_ASSETS = new Set([
  "/manifest.webmanifest",
  "/doifly-icon.svg",
  "/doifly-maskable.svg",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) =>
      cache.addAll(Array.from(STATIC_ASSETS)),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  // Never intercept Next.js runtime/build assets.
  if (requestUrl.pathname.startsWith("/_next/")) {
    return;
  }

  if (!STATIC_ASSETS.has(requestUrl.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(APP_CACHE).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      });
    }),
  );
});
