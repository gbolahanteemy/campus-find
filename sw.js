// =========================================================
// Campus Lost & Found — service worker
// Lets the site be installed as an app and load faster.
// "Network first": always tries to get the newest files; uses the saved
// copy only when there's no internet. Firebase/Google requests are never touched.
// =========================================================
const CACHE = "campusfound-v1";
const FILES = [
  "./", "./index.html", "./admin.html", "./style.css",
  "./core.js", "./app.js", "./admin.js", "./settings.js", "./firebase-config.js",
  "./manifest.webmanifest", "./admin.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(FILES.map((f) => cache.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only our own files. Firebase, Google sign-in and fonts go straight to the internet.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined))
      )
  );
});
