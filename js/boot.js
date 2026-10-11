"use strict";
/* ── startup ── read the world and its images, show the page, then sync. A
   first visit opens on the sample world so there's something to explore. */

(async () => {
  if (PLAYER_MODE) return playerBoot();
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
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    // a home-screen app can stay open for days: look for a new version on
    // every launch and every return to it, and switch to it straight away
    // (once; not while something's being typed)
    const hadOne = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" }).then(reg => {
      reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadOne || reloaded) return;
      reloaded = true;
      const reload = () => { if (!/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName) && !MODALS.some(m => !/changed in two places/.test(m.el.textContent))) location.reload(); else setTimeout(reload, 2000); };
      setTimeout(reload, 300);
    });
  }
})();
