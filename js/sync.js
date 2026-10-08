"use strict";
/* ── sync ── keeps phones and computers in step through GitHub, with no server.
   Two places it can sync to (a "backend"):
   - a private GitHub repository (recommended): world.json, plus each image as
     a real image file under images/ and each drawing under drawings/. Every
     sync is one commit, so it's all-or-nothing, and there's no limit on the
     number of files worth worrying about.
   - a private Gist (the original way): moth_world.json plus one text file per
     image. Simple, but a Gist lists at most 300 files.
   Pictures and drawings never change once stored (an edited drawing is saved
   under a new id), so each one is uploaded once and never again.
   Every revision has a version from GitHub. This device remembers the one it
   last agreed with; if GitHub has moved on while this device also has unsent
   changes, nothing is merged: Moth asks which copy to keep and downloads the
   other as a backup, so nothing is lost. */

const SYNC_KEYS = { token: "moth_gist_token", backend: "moth_sync_backend", id: "moth_gist_id", repo: "moth_sync_repo",
  version: "moth_gist_version", dirty: "moth_dirty", assets: "moth_gist_assets" };
const WORLD_FILE = "moth_world.json";
const ls = {
  get: k => { try { return localStorage.getItem(SYNC_KEYS[k]) || ""; } catch { return ""; } },
  set: (k, v) => { try { v === "" || v == null ? localStorage.removeItem(SYNC_KEYS[k]) : localStorage.setItem(SYNC_KEYS[k], v); } catch {} },
};
const SYNC = { busy: false, applying: false, timer: null, state: "off", msg: "", last: 0 };
// the player screen never syncs: it only reads what your window saves
const syncOn = () => !PLAYER_MODE && !!ls.get("token");
const backendName = () => ls.get("backend") || "gist";
const backend = () => BACKENDS[backendName()];
// what this device knows is stored remotely: { asset id: file path }
function knownFiles() {
  const raw = ls.get("assets");
  if (!raw) return {};
  const v = JSON.parse(raw);
  return Array.isArray(v) ? Object.fromEntries(v.map(id => [id, `asset_${id}.txt`])) : v;
}
const setKnown = o => ls.set("assets", JSON.stringify(o));

function setSync(state, msg = "") {
  SYNC.state = state; SYNC.msg = msg;
  const dot = $("#syncDot");
  if (dot) { dot.className = "sync-dot " + state; dot.title = msg; }
  emit("syncState");
}
async function gh(method, path, body, what = "That") {
  const r = await fetch("https://api.github.com" + path, {
    method, cache: "no-store",
    headers: { Authorization: "token " + ls.get("token"), Accept: "application/vnd.github+json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let m = "";
    try { m = (await r.json()).message; } catch {}
    const err = new Error(r.status === 401 ? "GitHub didn't accept the token" : r.status === 404 ? `${what} wasn't found (or the token can't see it)` : `GitHub said ${r.status}${m ? ": " + m : ""}`);
    err.status = r.status;
    throw err;
  }
  return r.status === 204 ? null : r.json();
}
class Conflict extends Error {}

/* text ⇄ base64, safely for any language */
const utf8ToB64 = s => { const b = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };
const b64ToUtf8 = b64 => { const bin = atob(b64.replace(/\s/g, "")); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); };
const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]));

/* A backend: ensure() finds or creates the place, head() is its current
   version, read() gets {version, world, files: {id: ref}}, readAsset(ref) one
   file's contents, write({world, add, remove, base}) stores a change and
   returns the new version, or throws Conflict if someone got there first. */
const BACKENDS = {};

BACKENDS.gist = {
  label: "Gist",
  where: () => ls.get("id") ? `https://gist.github.com/${ls.get("id")}` : "",
  async ensure(create) {
    if (ls.get("id")) return true;
    for (let page = 1; page <= 5; page++) {
      const list = await gh("GET", `/gists?per_page=100&page=${page}`);
      const g = list.find(x => x.files?.[WORLD_FILE]);
      if (g) { ls.set("id", g.id); return true; }
      if (list.length < 100) break;
    }
    if (!create) return false;
    const g = await gh("POST", "/gists", { description: "Moth world: " + DB.world.name, public: false, files: { [WORLD_FILE]: { content: "{}" } } });
    ls.set("id", g.id);
    return true;
  },
  async head() { return (await gh("GET", `/gists/${ls.get("id")}/commits?per_page=1`, null, "The Gist"))?.[0]?.version || ""; },
  async read() {
    const g = await gh("GET", "/gists/" + ls.get("id"), null, "The Gist");
    const files = {};
    for (const n of Object.keys(g.files)) { const m = n.match(/^asset_(.+)\.txt$/); if (m) files[m[1]] = { path: n, f: g.files[n] }; }
    return { version: g.history?.[0]?.version || "", world: await this.fileText(g.files[WORLD_FILE]), files };
  },
  async fileText(f) {
    if (!f) return null;
    if (!f.truncated && f.content != null) return f.content;
    const r = await fetch(f.raw_url, { cache: "no-store" });
    if (!r.ok) throw new Error("Couldn't download " + f.filename);
    return r.text();
  },
  readAsset(ref) { return this.fileText(ref.f); },
  async write({ world, add, remove }) {
    const id = ls.get("id"), known = knownFiles(), paths = {};
    // pictures one at a time, so no single request gets huge; each one is
    // remembered as it lands, so an interrupted sync picks up where it stopped
    for (const [a, data] of add) {
      await gh("PATCH", "/gists/" + id, { files: { [`asset_${a}.txt`]: { content: data } } });
      known[a] = paths[a] = `asset_${a}.txt`; setKnown(known);
    }
    const files = { [WORLD_FILE]: { content: world } };
    for (const a of remove) files[known[a] || `asset_${a}.txt`] = null;
    const g = await gh("PATCH", "/gists/" + id, { description: "Moth world: " + DB.world.name, files });
    return { version: g.history?.[0]?.version || "", paths };
  },
};

BACKENDS.repo = {
  label: "repository",
  where: () => ls.get("repo") ? `https://github.com/${ls.get("repo")}` : "",
  branch: null,
  async ensure(create) {
    let full = ls.get("repo");
    if (!full.includes("/")) { full = (await gh("GET", "/user")).login + "/" + (full || "moth-world"); ls.set("repo", full); }
    let info;
    try { info = await gh("GET", "/repos/" + full, null, "The repository"); }
    catch (e) {
      if (e.status !== 404) throw e;
      if (!create) return false;
      try { info = await gh("POST", "/user/repos", { name: full.split("/")[1], private: true, auto_init: true, description: "Moth world: " + DB.world.name }); }
      catch (e2) { throw new Error(`Couldn't create ${full}. Create a private repository with that name on GitHub (with a README), give the token access to it, and try again.`); }
      ls.set("repo", info.full_name);
    }
    if (!info.private) toast(`Heads up: ${info.full_name} is public, so anyone can read your world. Make it private on GitHub (Settings → General → Danger zone).`, { ms: 12000 });
    this.branch = info.default_branch || "main";
    // the Git Data API needs at least one commit
    try { await this.head(); }
    catch (e) { if (e.status !== 409 && e.status !== 404) throw e; await gh("PUT", `/repos/${full}/contents/README.md`, { message: "Start", content: utf8ToB64("# Moth world\n\nSynced by Moth. Edit it in Moth, not here.\n") }); }
    return true;
  },
  api(p) { return `/repos/${ls.get("repo")}${p}`; },
  async head() { return (await gh("GET", this.api(`/git/ref/heads/${this.branch}`), null, "The repository")).object.sha; },
  async read() {
    const version = await this.head();
    const commit = await gh("GET", this.api(`/git/commits/${version}`));
    const tree = await gh("GET", this.api(`/git/trees/${commit.tree.sha}?recursive=1`));
    const files = {};
    let world = null;
    for (const t of tree.tree) {
      if (t.type !== "blob") continue;
      if (t.path === "world.json") world = t;
      const m = t.path.match(/^(images|drawings)\/([^/.]+)\.(\w+)$/);
      if (m) files[m[2]] = { path: t.path, sha: t.sha, ext: m[3] };
    }
    return { version, world: world ? b64ToUtf8((await gh("GET", this.api(`/git/blobs/${world.sha}`))).content) : null, files };
  },
  async readAsset(ref) {
    const b64 = (await gh("GET", this.api(`/git/blobs/${ref.sha}`))).content.replace(/\s/g, "");
    return EXT_MIME[ref.ext] ? `data:${EXT_MIME[ref.ext]};base64,${b64}` : b64ToUtf8(b64);
  },
  async write({ world, add, remove, base }) {
    const known = knownFiles(), entries = [], paths = {};
    for (const [a, data] of add) {
      // pictures go up as real image files (a quarter smaller than as text)
      const img = data.match(/^data:([^;]+);base64,(.*)$/s);
      const path = img ? `images/${a}.${MIME_EXT[img[1]] || "bin"}` : `drawings/${a}.json`;
      const blob = await gh("POST", this.api("/git/blobs"), img ? { content: img[2], encoding: "base64" } : { content: data, encoding: "utf-8" });
      entries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
      paths[a] = path;
    }
    for (const a of remove) if (known[a]) entries.push({ path: known[a], mode: "100644", type: "blob", sha: null });
    const wb = await gh("POST", this.api("/git/blobs"), { content: world, encoding: "utf-8" });
    entries.push({ path: "world.json", mode: "100644", type: "blob", sha: wb.sha });
    const parent = await gh("GET", this.api(`/git/commits/${base}`));
    const tree = await gh("POST", this.api("/git/trees"), { base_tree: parent.tree.sha, tree: entries });
    const commit = await gh("POST", this.api("/git/commits"), { message: `Moth: ${DB.world.name}, ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, tree: tree.sha, parents: [base] });
    // only moves forward from the version we started from: if another device
    // synced in between, GitHub refuses, and that's a conflict
    try { await gh("PATCH", this.api(`/git/refs/heads/${this.branch}`), { sha: commit.sha, force: false }); }
    catch (e) { if (e.status === 422 || e.status === 409) throw new Conflict(); throw e; }
    return { version: commit.sha, paths };
  },
};

// take the remote copy: any pictures this device doesn't have, then the world
async function applyRemote(remote) {
  const data = JSON.parse(remote.world);
  if (data.movedTo) return followMove(data.movedTo);
  for (const [id, ref] of Object.entries(remote.files)) if (!hasAsset(id)) await assetPut(await backend().readAsset(ref), id);
  SYNC.applying = true;
  DB = normalizeDB(data);
  save();
  SYNC.applying = false;
  ls.set("version", remote.version);
  setKnown(Object.fromEntries(Object.entries(remote.files).map(([id, r]) => [id, r.path])));
  ls.set("dirty", "");
  rerender();
}
const remoteWorld = r => { try { return r.world ? JSON.parse(r.world) : null; } catch { return null; } };
const isEmptyWorld = w => !w || !w.world;

async function pull({ quiet = false } = {}) {
  if (!syncOn() || SYNC.busy) return;
  SYNC.busy = true;
  try {
    setSync("busy", "Checking for changes…");
    if (!await backend().ensure(false)) { SYNC.busy = false; return push(); }
    const v = await backend().head();
    if (v && v === ls.get("version")) { SYNC.busy = false; return ls.get("dirty") ? push() : setSync("ok", "Up to date"); }
    const remote = await backend().read();
    const w = remoteWorld(remote);
    if (isEmptyWorld(w)) { SYNC.busy = false; ls.set("dirty", "1"); return push(); }
    if (w.movedTo) { SYNC.busy = false; return followMove(w.movedTo); }
    if (!ls.get("dirty") || (!ls.get("version") && !DB.entries.length)) {
      await applyRemote(remote);
      if (!quiet) toast("Brought in changes from your other device");
      setSync("ok", "Up to date");
    } else { SYNC.busy = false; return conflict(remote); }
  } catch (e) { console.warn(e); setSync("err", e.message); }
  SYNC.busy = false;
}

async function push() {
  if (!syncOn() || SYNC.busy) return;
  // nothing changed here, so nothing to send (sending anyway would make the
  // other device think there's a conflict)
  if (!ls.get("dirty") && ls.get("version")) return setSync("ok", "Up to date");
  SYNC.busy = true;
  setSync("busy", "Saving to GitHub…");
  try {
    const be = backend();
    await be.ensure(true);
    const head = await be.head();
    if (head && head !== ls.get("version")) {
      // GitHub moved on since we last agreed (or we never have): unless what's
      // there is empty, that's a conflict to settle first
      const remote = await be.read();
      const w = remoteWorld(remote);
      if (!isEmptyWorld(w) && !w.movedTo) { SYNC.busy = false; return conflict(remote); }
      ls.set("version", remote.version);
      setKnown(Object.fromEntries(Object.entries(remote.files).map(([id, r]) => [id, r.path])));
    }
    const known = knownFiles(), used = usedAssets(), add = [];
    for (const a of used) if (!known[a] && hasAsset(a)) add.push([a, await assetData(a)]);
    const remove = Object.keys(known).filter(a => !used.has(a));
    const snapshot = DB.updated;
    const { version, paths } = await be.write({ world: JSON.stringify(DB), add: add.filter(x => x[1]), remove, base: ls.get("version") || head });
    const k2 = Object.assign(knownFiles(), paths);
    for (const a of remove) delete k2[a];
    setKnown(k2);
    ls.set("version", version);
    if (DB.updated === snapshot) ls.set("dirty", "");
    SYNC.last = Date.now();
    setSync(ls.get("dirty") ? "pending" : "ok", "Saved to GitHub");
  } catch (e) {
    if (e instanceof Conflict) { SYNC.busy = false; return conflict(await backend().read()); }
    console.warn(e); setSync("err", e.message);
  }
  SYNC.busy = false;
  if (ls.get("dirty") && SYNC.state !== "err") schedulePush();
}

function conflict(remote) {
  return new Promise(res => {
    const other = remoteWorld(remote);
    const when = t => t ? new Date(t).toLocaleString() : "unknown";
    setSync("err", "Two devices changed the world");
    modal({ title: "This world changed in two places",
      body: `<p>Since this device last synced, the world was changed on another device, and it has also changed here. Moth doesn't merge them. Pick the copy to keep; the other one is downloaded as a backup file, so nothing is lost.</p>
        <ul><li>This device: last edited ${when(DB.updated)}</li><li>The other device (on GitHub): last edited ${when(other?.updated)}</li></ul>`,
      onClose: () => res(),
      buttons: [
        { label: "Keep the other device's", act: async () => {
          download(fileSlug(DB.world.name) + "-this-device-backup.json", JSON.stringify(await exportBundle()));
          try { await applyRemote(remote); setSync("ok", "Up to date"); } catch (e) { setSync("err", e.message); }
        } },
        { label: "Keep this device's", cls: "accent", act: async () => {
          if (other) download(fileSlug(other.world?.name) + "-other-device-backup.json", JSON.stringify({ moth: 1, db: other, assets: {} }));
          ls.set("version", remote.version);
          setKnown(Object.fromEntries(Object.entries(remote.files).map(([id, r]) => [id, r.path])));
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
if (!PLAYER_MODE) {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(); });
  setInterval(() => { if (document.visibilityState === "visible" && !ls.get("dirty")) pull(); }, 90000);
}

/* ── connecting ── */
async function connectSync(token, kind, repo = "") {
  const r = await fetch("https://api.github.com/user", { headers: { Authorization: "token " + token }, cache: "no-store" });
  if (!r.ok) throw new Error("GitHub didn't accept that token");
  const scopes = r.headers.get("x-oauth-scopes");
  const has = s => scopes == null || scopes === "" || scopes.split(",").map(x => x.trim()).includes(s);
  if (kind === "gist" && !has("gist")) throw new Error("That token can't write Gists. Give it the “gist” scope.");
  if (kind === "repo" && !has("repo")) throw new Error("That token can't write repositories. Give it the “repo” scope, or use a fine-grained token with access to the repository.");
  for (const k of ["id", "version", "assets"]) ls.set(k, "");
  ls.set("token", token); ls.set("backend", kind); ls.set("repo", repo.trim().replace(/^https:\/\/github.com\//, "").replace(/\/$/, ""));
  await pull();
}
function disconnectSync() { for (const k of Object.keys(SYNC_KEYS)) if (k !== "dirty") ls.set(k, ""); setSync("off"); }

// Move from a Gist to a repository: everything goes up to the repository,
// and the Gist is left holding a note that sends other devices there too.
async function moveToRepo(repo) {
  if (SYNC.busy) throw new Error("Wait for the current sync to finish");
  await pull();
  if (SYNC.state === "err") throw new Error("Sort out the sync problem first: " + SYNC.msg);
  const gistId = ls.get("id");
  ls.set("backend", "repo"); ls.set("repo", repo.trim()); ls.set("version", ""); ls.set("assets", ""); ls.set("dirty", "1");
  await push();
  if (SYNC.state === "err") { ls.set("backend", "gist"); ls.set("id", gistId); throw new Error(SYNC.msg); }
  try {
    await gh("PATCH", "/gists/" + gistId, { files: { [WORLD_FILE]: { content: JSON.stringify({ movedTo: ls.get("repo"), world: DB.world.name, updated: Date.now() }) } } });
  } catch (e) { console.warn("Couldn't leave a note in the old Gist", e); }
}
// another device moved the world to a repository: follow it there
async function followMove(repo) {
  for (const k of ["version", "assets"]) ls.set(k, "");
  ls.set("backend", "repo"); ls.set("repo", repo);
  SYNC.busy = false;
  toast(`This world now syncs through the repository ${repo}. Following it there.`, { ms: 8000 });
  try { await pull({ quiet: true }); }
  catch (e) { setSync("err", e.message); }
  if (SYNC.state === "err") toast(`Couldn't reach ${repo}. In Settings, connect again with a token that can use that repository.`, { ms: 12000 });
}

// one file holding the world and the pictures it uses (for export, and backups)
async function exportBundle() {
  const assets = {};
  for (const a of usedAssets()) { const d = await assetData(a); if (d) assets[a] = d; }
  return { moth: 1, exported: new Date().toISOString(), db: DB, assets };
}
