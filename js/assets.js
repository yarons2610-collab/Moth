"use strict";
/* ── images ──
   Maps, portraits, battlemaps and tokens are far too big for localStorage, so
   they live in IndexedDB (moth-assets) as data URLs, and DB only holds their
   ids. Only the ids are read at startup; an image is read from disk the first
   time a page shows it, so memory use grows with what's on screen, not with
   the size of the world. Pages draw images with assetImg() (or a data-asset-bg
   attribute for backgrounds), which fill in once the image has been read. */

const ASSET_DB = "moth-assets"; // also holds drawings (as JSON), see draw.js
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
      if (!d || !d.startsWith("data:")) return;
      const url = URL.createObjectURL(dataToBlob(d));
      ASSET_URLS.set(id, url);
      showAsset(id, url);
    });
  }
  return "";
}
const assetImg = (id, cls = "", attrs = "") => `<img class="${cls}" src="${assetSrc(id) || BLANK_IMG}" data-asset="${id}" alt="" ${attrs}>`;

async function assetPut(data, id = "img" + uid()) {
  if (!keepStorage.asked) { keepStorage.asked = true; keepStorage(); }
  await assetTx("readwrite", st => st.put(data, id));
  ASSET_IDS.add(id);
  if (!String(data).startsWith("data:")) return id; // a drawing, not a picture
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
  for (const e of db.entries) {
    if (e.portrait) s.add(e.portrait); if (e.token) s.add(e.token);
    // pictures of versions that aren't live are still in use
    for (const v of e.versions || []) { if (v.data?.portrait) s.add(v.data.portrait); if (v.data?.token) s.add(v.data.token); }
  }
  for (const m of db.maps) { if (m.asset) s.add(m.asset); if (m.draw) s.add(m.draw); }
  for (const x of db.encounters) { if (x.battle?.asset) s.add(x.battle.asset); if (x.battle?.draw) s.add(x.battle.draw); }
  for (const st of db.stamps || []) if (st.asset) s.add(st.asset);
  for (const h of db.handouts || []) if (h.asset) s.add(h.asset);
  return s;
}
// Images left over from deletes, once they're old enough not to be undone.
async function pruneAssets() {
  const used = usedAssets();
  // drafts (unfinished drawings) are kept until they're finished or thrown away
  for (const id of [...ASSET_IDS]) if (!used.has(id) && !ASSET_URLS.has(id) && !String(id).startsWith("draft:")) await assetDelete(id).catch(() => {});
}
// How much this world takes up, for Settings.
async function assetSizes() {
  let bytes = 0, n = 0;
  const used = usedAssets();
  await assetTx("readonly", st => {
    const r = st.openCursor();
    r.onsuccess = () => { const c = r.result; if (!c) return; if (used.has(c.key)) { bytes += c.value.length * (c.value.startsWith("data:") ? 0.75 : 1); n++; } c.continue(); };
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
      // a PNG stays a PNG only if it has see-through parts (a token, a stamp) and
      // isn't huge; otherwise whichever is smaller, which for photos and
      // screenshots is nearly always the JPEG
      const jpeg = c.toDataURL("image/jpeg", 0.85);
      let data = jpeg;
      if (/png|webp|gif/.test(file.type)) {
        const png = c.toDataURL("image/png"), px = c.getContext("2d").getImageData(0, 0, w, h).data;
        let clear = false;
        for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { clear = true; break; }
        if (clear ? png.length <= Math.max(400e3, maxPx * maxPx * 0.12) : png.length < jpeg.length) data = png;
      }
      res({ data, w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("That file isn't an image this browser can read")); };
    img.src = url;
  });
}
/* ── adding a picture ── a small window that takes it however it comes:
   pasted (Ctrl+V / ⌘V, or the Paste button), dropped onto it, or chosen
   from a file. Every way goes through readImage, so a pasted screenshot is
   shrunk just like a file would be. */
// the image in a paste or drop, if there is one; else a picture's web address
function clipImage(dt) {
  for (const it of dt?.items || []) if (it.kind === "file" && it.type.startsWith("image/")) return { blob: it.getAsFile() };
  for (const f of dt?.files || []) if (f.type.startsWith("image/")) return { blob: f };
  const html = dt?.getData?.("text/html") || "", src = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  const url = src || (dt?.getData?.("text/plain") || "").trim();
  return /^(https?:|data:image\/)/.test(url) ? { url: url.replace(/&amp;/g, "&") } : null;
}
// a picture copied as a link: fetch it if the site allows it
async function urlImage(url) {
  const r = await fetch(url).catch(() => null);
  const b = r?.ok ? await r.blob().catch(() => null) : null;
  if (!b?.type.startsWith("image/")) throw new Error("That copied the picture's address, and its site won't let Moth fetch it. Right-click the picture and choose “Copy image” instead.");
  return b;
}
function pickImage(maxPx) {
  return new Promise(res => {
    let done = false, win = null;
    const take = async got => {
      if (done || !got) return;
      try {
        const blob = got.blob || await urlImage(got.url);
        done = true;
        win?.close();
        const { data, w, h } = await readImage(blob, maxPx);
        res({ id: await assetPut(data), w, h });
      } catch (e) { done = false; toast(e.message); }
    };
    const onPaste = e => { const got = clipImage(e.clipboardData); if (got) { e.preventDefault(); take(got); } else toast("There's no picture to paste. Copy one first (right-click it → Copy image), then paste."); };
    win = modal({ title: "Add a picture",
      body: `<div class="img-drop" tabindex="0" aria-label="Paste or drop a picture here">
          <div class="img-drop-big">📋</div>
          <b>Paste a picture: ${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘V" : "Ctrl+V"}</b>
          <span class="muted small">or drop one here. Copy it from anywhere first: a website (right-click → Copy image), a screenshot, another app.</span>
        </div>
        <div class="btn-row img-drop-btns">
          ${navigator.clipboard?.read ? `<button class="btn accent" data-pb="paste">📋 Paste</button>` : ""}
          <button class="btn" data-pb="file">📁 Choose a file…</button>
        </div>`,
      buttons: [{ label: "Cancel" }],
      onClose: () => { document.removeEventListener("paste", onPaste); if (!done) res(null); },
      onOpen: w => {
        document.addEventListener("paste", onPaste);
        const zone = w.querySelector(".img-drop");
        zone.focus();
        w.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("over"); });
        w.addEventListener("dragleave", e => { if (!w.contains(e.relatedTarget)) zone.classList.remove("over"); });
        w.addEventListener("drop", e => { e.preventDefault(); zone.classList.remove("over"); take(clipImage(e.dataTransfer)); });
        w.addEventListener("click", async e => {
          const b = e.target.closest("[data-pb]");
          if (!b) return;
          if (b.dataset.pb === "file") {
            const inp = document.createElement("input");
            inp.type = "file"; inp.accept = "image/*";
            inp.onchange = () => inp.files[0] && take({ blob: inp.files[0] });
            inp.click();
            return;
          }
          // the Paste button: reads the clipboard (the browser may ask first)
          try {
            for (const it of await navigator.clipboard.read()) {
              const t = it.types.find(x => x.startsWith("image/"));
              if (t) return take({ blob: await it.getType(t) });
            }
            toast("There's no picture on the clipboard. Copy one first (right-click it → Copy image).");
          } catch { toast("The browser didn't allow reading the clipboard. Press " + (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘V" : "Ctrl+V") + " instead."); }
        });
      } });
  });
}
// Ask the browser to keep Moth's storage even when the disk gets full, so
// hundreds of pictures aren't cleared away to make room. Asked once, quietly.
function keepStorage() { try { navigator.storage?.persist?.().catch(() => {}); } catch {} }
