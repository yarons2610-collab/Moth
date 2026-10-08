// Keeps Moth working with no network. Your world lives on the device either
// way; this is about the app itself (HTML, scripts, fonts) still loading.
// The app's own files are fetched network-first, so a new version reaches an
// installed phone on its next launch, and the cache is the offline fallback.
// Bump the version when the file list changes.
const CACHE = "moth-v6";
const SHELL = [
  "./", "index.html", "manifest.json", "css/moth.css", "vendor/fonts.css",
  "vendor/fonts/jetbrains-mono-latin.woff2", "vendor/fonts/space-grotesk-latin.woff2",
  "icons/moth.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png",
  ...["core", "assets", "fields", "codex", "family", "timeline", "story", "map", "web", "play", "battle", "draw", "screen", "music", "notes", "find", "settings", "sync", "sample", "boot"].map(m => `js/${m}.js`),
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  // only this app's own files; GitHub (sync) must always be live
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
