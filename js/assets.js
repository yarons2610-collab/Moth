"use strict";
/* ── images ──
   Maps and portraits are far too big for localStorage, so they live in
   IndexedDB (moth-assets) as data URLs, and DB only holds their ids. All of
   them are read into memory at startup so pages can draw them straight away. */

const ASSET_DB = "moth-assets";
const ASSETS = new Map(); // id → { data (data URL), url (object URL) }
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
function remember(id, data) {
  const old = ASSETS.get(id);
  if (old?.data === data) return;
  if (old) URL.revokeObjectURL(old.url);
  ASSETS.set(id, { data, url: URL.createObjectURL(dataToBlob(data)) });
}
async function loadAssets() {
  try {
    const keys = await assetTx("readonly", st => st.getAllKeys());
    const vals = await assetTx("readonly", st => st.getAll());
    keys.forEach((k, i) => remember(k, vals[i]));
  } catch (e) { console.warn("Images couldn't be read", e); }
}
async function assetPut(data, id = "img" + uid()) {
  remember(id, data);
  await assetTx("readwrite", st => st.put(data, id));
  emit("assets");
  return id;
}
async function assetDelete(id) {
  const a = ASSETS.get(id);
  if (a) URL.revokeObjectURL(a.url);
  ASSETS.delete(id);
  await assetTx("readwrite", st => st.delete(id));
}
const assetSrc = id => ASSETS.get(id)?.url || "";
const assetData = id => ASSETS.get(id)?.data || null;

// Every image the world still uses. Images nobody uses are kept on this device
// (so a delete can be undone) but are not synced or exported.
function usedAssets(db = DB) {
  const s = new Set();
  for (const e of db.entries) if (e.portrait) s.add(e.portrait);
  for (const m of db.maps) if (m.asset) s.add(m.asset);
  return s;
}

// Shrink an upload so a phone can hold a whole atlas: maps up to 4096px on the
// long side, portraits up to 640px. PNGs that stay small keep their transparency.
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
      if (!data || data.length > 1.5e6) data = c.toDataURL("image/jpeg", 0.86);
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
