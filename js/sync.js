"use strict";
/* ── sync ── the whole world goes to one private GitHub Gist as a single
   snapshot (moth_world.json), and each image as its own file (asset_<id>.txt),
   so a change to the text never re-sends the atlas.
   Every Gist revision has a version from GitHub. This device remembers the
   version it last agreed with; if the Gist has moved on while this device also
   has unsent changes, nothing is merged: Moth asks which copy to keep and
   downloads the other as a backup, so nothing is lost. */

const SYNC_KEYS = { token: "moth_gist_token", id: "moth_gist_id", version: "moth_gist_version", dirty: "moth_dirty", assets: "moth_gist_assets" };
const WORLD_FILE = "moth_world.json";
const ls = {
  get: k => { try { return localStorage.getItem(SYNC_KEYS[k]) || ""; } catch { return ""; } },
  set: (k, v) => { try { v === "" || v == null ? localStorage.removeItem(SYNC_KEYS[k]) : localStorage.setItem(SYNC_KEYS[k], v); } catch {} },
};
const SYNC = { busy: false, applying: false, timer: null, state: "off", msg: "", last: 0 };
const syncOn = () => !!ls.get("token");

function setSync(state, msg = "") {
  SYNC.state = state; SYNC.msg = msg;
  const dot = $("#syncDot");
  if (dot) { dot.className = "sync-dot " + state; dot.title = msg; }
  emit("syncState");
}
async function gh(method, path, body) {
  const r = await fetch("https://api.github.com" + path, {
    method, cache: "no-store",
    headers: { Authorization: "token " + ls.get("token"), Accept: "application/vnd.github+json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let m = "";
    try { m = (await r.json()).message; } catch {}
    const err = new Error(r.status === 401 ? "GitHub didn't accept the token" : r.status === 404 ? "The Gist wasn't found (or the token can't see it)" : `GitHub said ${r.status}${m ? ": " + m : ""}`);
    err.status = r.status;
    throw err;
  }
  return r.status === 204 ? null : r.json();
}
const versionOf = g => g?.history?.[0]?.version || "";
async function fileText(f) {
  if (!f) return null;
  if (!f.truncated && f.content != null) return f.content;
  const r = await fetch(f.raw_url, { cache: "no-store" });
  if (!r.ok) throw new Error("Couldn't download " + f.filename);
  return r.text();
}
const assetFiles = g => Object.keys(g?.files || {}).filter(n => /^asset_.+\.txt$/.test(n));
const fileAsset = n => n.replace(/^asset_|\.txt$/g, "");

async function findGist() {
  if (ls.get("id")) return ls.get("id");
  for (let page = 1; page <= 5; page++) {
    const list = await gh("GET", `/gists?per_page=100&page=${page}`);
    const g = list.find(x => x.files?.[WORLD_FILE]);
    if (g) { ls.set("id", g.id); return g.id; }
    if (list.length < 100) break;
  }
  return "";
}

// take the Gist's copy: the world, then any images this device doesn't have
async function applyRemote(g) {
  const text = await fileText(g.files[WORLD_FILE]);
  const data = JSON.parse(text);
  for (const n of assetFiles(g)) {
    const id = fileAsset(n);
    if (!hasAsset(id)) await assetPut(await fileText(g.files[n]), id);
  }
  SYNC.applying = true;
  DB = normalizeDB(data);
  save();
  SYNC.applying = false;
  ls.set("version", versionOf(g));
  ls.set("assets", JSON.stringify(assetFiles(g).map(fileAsset)));
  ls.set("dirty", "");
  rerender();
}

async function pull({ quiet = false } = {}) {
  if (!syncOn() || SYNC.busy) return;
  SYNC.busy = true;
  try {
    const id = await findGist();
    if (!id) { SYNC.busy = false; if (ls.get("dirty") || DB.entries.length) return push(); return setSync("ok", "Nothing in the Gist yet"); }
    setSync("busy", "Checking for changes…");
    const head = await gh("GET", `/gists/${id}/commits?per_page=1`);
    const v = head?.[0]?.version || "";
    if (v && v === ls.get("version")) { SYNC.busy = false; return ls.get("dirty") ? push() : setSync("ok", "Up to date"); }
    const g = await gh("GET", "/gists/" + id);
    if (!ls.get("dirty") || !ls.get("version") && !DB.entries.length) {
      await applyRemote(g);
      if (!quiet) toast("Brought in changes from your other device");
      setSync("ok", "Up to date");
    } else await conflict(g);
  } catch (e) { console.warn(e); setSync("err", e.message); }
  SYNC.busy = false;
}

async function push() {
  if (!syncOn() || SYNC.busy) return;
  // nothing changed here, so nothing to send (pushing anyway would bump the
  // Gist's version and make the other device think there's a conflict)
  if (!ls.get("dirty") && ls.get("id")) return setSync("ok", "Up to date");
  SYNC.busy = true;
  setSync("busy", "Saving to GitHub…");
  try {
    let id = await findGist();
    if (id && ls.get("version")) {
      const head = await gh("GET", `/gists/${id}/commits?per_page=1`);
      if (head?.[0]?.version && head[0].version !== ls.get("version")) {
        const g = await gh("GET", "/gists/" + id);
        SYNC.busy = false;
        return conflict(g);
      }
    }
    if (!id) {
      const g = await gh("POST", "/gists", { description: "Moth world: " + DB.world.name, public: false, files: { [WORLD_FILE]: { content: JSON.stringify(DB) } } });
      id = g.id; ls.set("id", id); ls.set("version", versionOf(g)); ls.set("assets", "[]");
    }
    // images one at a time, so no single request gets huge
    const known = new Set(JSON.parse(ls.get("assets") || "[]")), used = usedAssets();
    let g = null;
    for (const a of used) if (!known.has(a) && hasAsset(a)) {
      g = await gh("PATCH", "/gists/" + id, { files: { [`asset_${a}.txt`]: { content: await assetData(a) } } });
      known.add(a); ls.set("assets", JSON.stringify([...known]));
    }
    const gone = [...known].filter(a => !used.has(a));
    const files = { [WORLD_FILE]: { content: JSON.stringify(DB) } };
    for (const a of gone) files[`asset_${a}.txt`] = null;
    const snapshot = DB.updated;
    g = await gh("PATCH", "/gists/" + id, { description: "Moth world: " + DB.world.name, files });
    gone.forEach(a => known.delete(a));
    ls.set("assets", JSON.stringify([...known]));
    ls.set("version", versionOf(g));
    if (DB.updated === snapshot) ls.set("dirty", "");
    SYNC.last = Date.now();
    setSync(ls.get("dirty") ? "pending" : "ok", "Saved to GitHub");
  } catch (e) { console.warn(e); setSync("err", e.message); }
  SYNC.busy = false;
  if (ls.get("dirty") && SYNC.state !== "err") schedulePush();
}

function conflict(g) {
  return new Promise(res => {
    const other = (() => { try { return JSON.parse(g.files[WORLD_FILE].content); } catch { return null; } })();
    const when = t => t ? new Date(t).toLocaleString() : "unknown";
    setSync("err", "Two devices changed the world");
    modal({ title: "This world changed in two places",
      body: `<p>Since this device last synced, the world was changed on another device, and it has also changed here. Moth doesn't merge them. Pick the copy to keep; the other one is downloaded as a backup file, so nothing is lost.</p>
        <ul><li>This device: last edited ${when(DB.updated)}</li><li>The other device (in the Gist): last edited ${when(other?.updated)}</li></ul>`,
      onClose: () => res(),
      buttons: [
        { label: "Keep the other device's", act: async () => {
          download(fileSlug(DB.world.name) + "-this-device-backup.json", JSON.stringify(await exportBundle()));
          try { await applyRemote(g); setSync("ok", "Up to date"); } catch (e) { setSync("err", e.message); }
        } },
        { label: "Keep this device's", cls: "accent", act: async () => {
          if (other) download(fileSlug(other.world?.name) + "-other-device-backup.json", JSON.stringify({ moth: 1, db: other, assets: {} }));
          ls.set("version", versionOf(g));
          ls.set("assets", JSON.stringify(assetFiles(g).map(fileAsset)));
          ls.set("dirty", "1");
          await push();
        } },
      ] });
  });
}

function schedulePush() {
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(push, 2500);
}
on("saved", () => {
  if (SYNC.applying) return;
  ls.set("dirty", "1");
  if (syncOn()) { setSync("pending", "Changes not sent yet"); schedulePush(); }
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(); });
setInterval(() => { if (document.visibilityState === "visible" && !ls.get("dirty")) pull({ quiet: false }); }, 90000);

async function connectGist(token) {
  const r = await fetch("https://api.github.com/user", { headers: { Authorization: "token " + token }, cache: "no-store" });
  if (!r.ok) throw new Error("GitHub didn't accept that token");
  const scopes = r.headers.get("x-oauth-scopes");
  if (scopes != null && scopes !== "" && !scopes.split(",").map(s => s.trim()).includes("gist")) throw new Error("That token can't write Gists. Give it the “gist” scope.");
  ls.set("token", token);
  ls.set("id", ""); ls.set("version", ""); ls.set("assets", "");
  await pull();
}
function disconnectGist() { for (const k of Object.keys(SYNC_KEYS)) if (k !== "dirty") ls.set(k, ""); setSync("off"); }

// one file holding the world and the images it uses (for export, and backups)
async function exportBundle() {
  const assets = {};
  for (const a of usedAssets()) { const d = await assetData(a); if (d) assets[a] = d; }
  return { moth: 1, exported: new Date().toISOString(), db: DB, assets };
}
