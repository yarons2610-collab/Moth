"use strict";
/* ── images ──
   Maps, portraits, battlemaps and tokens are far too big for localStorage, so
   they live in IndexedDB (moth-assets) as data URLs, and DB only holds their
   ids. Only the ids are read at startup; an image is read from disk the first
   time a page shows it, so memory use grows with what's on screen, not with
   the size of the world. Pages draw images with assetImg() (or a data-asset-bg
   attribute for backgrounds), which fill in once the image has been read. */

const ASSET_DB = "moth-assets";
const ASSET_IDS = new Set();   // every image stored on this device
const ASSET_URLS = new Map();  // id → object URL, for images already shown
const ASSET_LOADING = new Set();
const BLANK_IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
let assetDbP = null;

function assetDb() {
  return assetDbP ||= new Promise((res, rej) => {
    const r = indexedDB.open(ASSET_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("imgs");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function assetTx(mode, fn) {
  const db = await assetDb();
  return new Promise((res, rej) => {
    const tx = db.transaction("imgs", mode), st = tx.objectStore("imgs");
    const out = fn(st);
    tx.oncomplete = () => res(out?.result ?? out);
    tx.onerror = () => rej(tx.error);
  });
}
function dataToBlob(data) {
  const [head, b64] = data.split(",");
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: head.match(/data:([^;]+)/)?.[1] || "image/png" });
}
async function loadAssets() {
  try { for (const k of await assetTx("readonly", st => st.getAllKeys())) ASSET_IDS.add(k); }
  catch (e) { console.warn("Images couldn't be read", e); }
}
const hasAsset = id => ASSET_IDS.has(id);
// the stored data URL (for sync and export); read from disk, not kept in memory
async function assetData(id) {
  if (!ASSET_IDS.has(id)) return null;
  try { return await assetTx("readonly", st => st.get(id)) || null; } catch { return null; }
}
function showAsset(id, url) {
  for (const el of $$(`[data-asset="${id}"]`)) el.src = url;
  for (const el of $$(`[data-asset-bg="${id}"]`)) el.style.backgroundImage = `url(${url})`;
}
// The image's URL if it's been read already; otherwise "" and it's read now,
// and everything on the page waiting for it is filled in when it arrives.
function assetSrc(id) {
  if (!id) return "";
  if (ASSET_URLS.has(id)) return ASSET_URLS.get(id);
  if (ASSET_IDS.has(id) && !ASSET_LOADING.has(id)) {
    ASSET_LOADING.add(id);
    assetData(id).then(d => {
      ASSET_LOADING.delete(id);
      if (!d) return;
      const url = URL.createObjectURL(dataToBlob(d));
      ASSET_URLS.set(id, url);
      showAsset(id, url);
    });
  }
  return "";
}
const assetImg = (id, cls = "", attrs = "") => `<img class="${cls}" src="${assetSrc(id) || BLANK_IMG}" data-asset="${id}" alt="" ${attrs}>`;

async function assetPut(data, id = "img" + uid()) {
  await assetTx("readwrite", st => st.put(data, id));
  ASSET_IDS.add(id);
  const old = ASSET_URLS.get(id);
  if (old) URL.revokeObjectURL(old);
  ASSET_URLS.set(id, URL.createObjectURL(dataToBlob(data)));
  showAsset(id, ASSET_URLS.get(id));
  return id;
}
async function assetDelete(id) {
  const u = ASSET_URLS.get(id);
  if (u) URL.revokeObjectURL(u);
  ASSET_URLS.delete(id);
  ASSET_IDS.delete(id);
  await assetTx("readwrite", st => st.delete(id));
}

// Every image the world still uses. Images nobody uses are kept on this device
// for a while (so a delete can be undone) but are not synced or exported.
function usedAssets(db = DB) {
  const s = new Set();
  for (const e of db.entries) { if (e.portrait) s.add(e.portrait); if (e.token) s.add(e.token); }
  for (const m of db.maps) if (m.asset) s.add(m.asset);
  for (const x of db.encounters) if (x.battle?.asset) s.add(x.battle.asset);
  return s;
}
// Images left over from deletes, once they're old enough not to be undone.
async function pruneAssets() {
  const used = usedAssets();
  for (const id of [...ASSET_IDS]) if (!used.has(id) && !ASSET_URLS.has(id)) await assetDelete(id).catch(() => {});
}
// How much this world takes up, for Settings.
async function assetSizes() {
  let bytes = 0, n = 0;
  const used = usedAssets();
  await assetTx("readonly", st => {
    const r = st.openCursor();
    r.onsuccess = () => { const c = r.result; if (!c) return; if (used.has(c.key)) { bytes += c.value.length * 0.75; n++; } c.continue(); };
  });
  return { bytes, n };
}

// Shrink an upload so a phone can hold a whole atlas: maps and battlemaps up to
// 4096px on the long side, portraits 640px, tokens 256px. PNGs that stay small
// keep their transparency; everything else becomes a JPEG.
function readImage(file, maxPx) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      let data = file.type === "image/png" ? c.toDataURL("image/png") : "";
      if (!data || data.length > Math.max(400e3, maxPx * maxPx * 0.12)) data = c.toDataURL("image/jpeg", 0.85);
      res({ data, w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("That file isn't an image this browser can read")); };
    img.src = url;
  });
}
function pickImage(maxPx) {
  return new Promise(res => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return res(null);
      try {
        const { data, w, h } = await readImage(f, maxPx);
        res({ id: await assetPut(data), w, h });
      } catch (e) { toast(e.message); res(null); }
    };
    inp.click();
  });
}
