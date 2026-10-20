// Minimal service worker: makes the app installable and shows the last loaded
// page if the phone is briefly offline. It never touches API calls (Supabase),
// only same-origin page and asset requests.
const CACHE = "terima-shell-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (req.mode === "navigate" || url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/"))) {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "/" : req, copy));
      }
      return res;
    }).catch(() => caches.match(req.mode === "navigate" ? "/" : req))
  );
});
