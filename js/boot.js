"use strict";
/* ── startup ── read the world and its images, show the page, then sync. A
   first visit opens on the sample world so there's something to explore. */

(async () => {
  const had = loadDB();
  await loadAssets();
  if (!had) {
    DB = sampleWorld();
    SYNC.applying = true; save(); SYNC.applying = false;
    setTimeout(() => toast(`Welcome to Moth. This is a sample world to explore; start your own from <a href="#/settings">Settings</a>.`, { html: true, ms: 9000 }), 400);
  }
  window.addEventListener("hashchange", () => { acClose(); route(); $("#main").scrollTop = 0; });
  route();
  setSync(syncOn() ? (ls.get("dirty") ? "pending" : "ok") : "off");
  if (syncOn()) pull({ quiet: true });
  navigator.storage?.persist?.().catch(() => {});
  // clear out images nothing uses any more (deletes are past undoing by now)
  setTimeout(() => pruneAssets().catch(() => {}), 15000);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("service-worker.js").catch(() => {});
})();
