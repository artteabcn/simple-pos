// Service worker for the till only (scope is the whole site, but only /<locale>/app/ pages and the
// static assets they load are handled specially — everything else just passes through to the network).
//
// Goal: a till that has been opened at least once while online can be opened again with no connection
// at all. Sales themselves are already kept offline by the app's own localStorage store; this only
// covers *starting* the app offline. Bump CACHE_VERSION to force every device to drop its old cache.
const CACHE_VERSION = "spos-v1";

const isAppNavigation = (url) => /^\/[a-z]{2}\/app\/?$/.test(url.pathname);
const isCacheableAsset = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/_astro/") ||
    url.pathname.endsWith(".webmanifest") ||
    ["/favicon.svg", "/icon-192.png", "/icon-512.png"].includes(url.pathname));

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept POSTs (sync, checkout, etc.)
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return; // always real network; the app already handles offline here

  if (req.mode === "navigate" && isAppNavigation(url)) {
    // Network first so an online visit always sees the latest build; cache as a fallback for offline starts.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  if (isCacheableAsset(url)) {
    // Cache first: hashed build assets never change under the same URL, and icons/manifest rarely do.
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
