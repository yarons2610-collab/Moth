"use strict";
/* ── settings ── the world's name and calendar, kinds of codex entry and their
   fields, sync, export and import. */

const FIELD_TYPES = { text: "Short text", long: "Long text", number: "Number", date: "World date", link: "Link to an entry" };

addRoute("settings", "", () => {
  const w = DB.world;
  return [`<div class="page narrow settings">
    <h2>Settings</h2>
    <section class="panel"><div class="panel-h"><h4>World</h4></div>
      ${textField("Name", "worldName", w.name, `data-change="setWorldName"`)}
      <div class="kv"><span>Now</span><div>${esc(fmtDate(NOW()))} <button class="btn small" data-act="setNow">Change</button></div></div></section>

    <section class="panel"><div class="panel-h"><h4>Calendar</h4><button class="btn small" data-act="editCalendar">Edit</button></div>
      <p class="muted">Dates are written the world's way, e.g. <b>${esc(fmtDate({ y: NOW().y, m: w.months.length ? 1 : undefined, d: w.months.length ? 1 : undefined }))}</b>.</p>
      <div class="kvs"><div class="kv"><span>Eras</span><div>${eras().map(e => `${esc(e.name)}${e.abbr ? ` (${esc(e.abbr)})` : ""} <small class="muted">from year ${e.start}</small>`).join("<br>")}</div></div>
        <div class="kv"><span>Months</span><div>${w.months.length ? w.months.map(esc).join(", ") : `<span class="muted">None: dates are years only, or month numbers</span>`}</div></div></div></section>

    <section class="panel"><div class="panel-h"><h4>Kinds of entry</h4><button class="btn small" data-act="editKind" data-id="">+ Kind</button></div>
      <ul class="kind-list">${DB.kinds.map(k => `<li style="--c:${k.color}"><span class="k-ic">${k.icon}</span><b>${esc(k.name)}</b>
        <small class="muted">${k.fields.map(f => esc(f.name)).join(", ") || "no extra fields"}</small><span class="spacer"></span>
        <button class="btn small" data-act="editKind" data-id="${k.id}">Edit</button></li>`).join("")}</ul></section>

    <section class="panel"><div class="panel-h"><h4>Sync between devices</h4><span class="sync-state ${SYNC.state}">${esc(syncLabel())}</span></div>
      ${syncOn() ? `<p>Syncing through a private GitHub Gist${ls.get("id") ? ` (<a href="https://gist.github.com/${esc(ls.get("id"))}" target="_blank" rel="noopener">open it</a>)` : ""}. Each image is its own file in the Gist.</p>
        <div class="btn-row"><button class="btn" data-act="syncNow">Sync now</button><button class="btn ghost" data-act="syncOff">Stop syncing on this device</button></div>`
      : `<p class="muted">Your world lives in this browser. To use it on more than one device, make a GitHub token with only the <b>gist</b> permission
          (<a href="https://github.com/settings/tokens/new?scopes=gist&description=Moth" target="_blank" rel="noopener">make one here</a>) and paste it below on each device.
          It is stored only on this device.</p>
        <div class="row-inline"><input id="ghToken" type="password" placeholder="ghp_…" autocomplete="off"><button class="btn accent" data-act="syncConnect">Connect</button></div>`}</section>

    <section class="panel"><div class="panel-h"><h4>Space used</h4></div><div id="storageInfo" class="muted">Measuring…</div></section>

    <section class="panel"><div class="panel-h"><h4>Your data</h4></div>
      <p class="muted">An export is one .json file with the whole world and its images.</p>
      <div class="btn-row"><button class="btn" data-act="exportWorld">Export</button><button class="btn" data-act="importWorld">Import…</button>
        <button class="btn" data-act="loadSample">Load the sample world</button><button class="btn danger" data-act="resetWorld">Start an empty world</button></div></section>
    <p class="muted small">Moth: a play on myth. Works offline, and can be installed from the browser's menu (Add to Home Screen).</p>
  </div>`, showStorage];
});

/* How big the world is, against the limits that matter:
   - the world's text lives in localStorage, which browsers cap at about 5 MB;
   - images live in IndexedDB, limited only by the device's free space;
   - a Gist lists at most 300 files, so sync tops out a little under 300 images. */
const LS_LIMIT = 5e6, GIST_FILES = 300;
const mb = n => (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + " MB";
function bar(frac) { return `<div class="storage-bar"><i class="${frac > 0.75 ? "warn" : ""}" style="width:${clamp(frac, 0.005, 1) * 100}%"></i></div>`; }
async function showStorage(main) {
  const box = $("#storageInfo", main);
  if (!box) return;
  const text = JSON.stringify(DB).length * 2; // localStorage counts UTF-16 characters
  const imgs = await assetSizes().catch(() => ({ bytes: 0, n: 0 }));
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const kept = await navigator.storage?.persisted?.().catch(() => false);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const lines = [
    `<div><b>World text</b> ${mb(text)} of about ${mb(LS_LIMIT)}${bar(text / LS_LIMIT)}</div>`,
    `<div><b>Images</b> ${plural(imgs.n, "image")}, ${mb(imgs.bytes)} (limited by the device's free space${est?.quota ? `: ${mb(est.quota)} available to Moth` : ""})</div>`,
  ];
  if (syncOn()) lines.push(`<div style="margin-top:8px"><b>Sync</b> ${imgs.n} of about ${GIST_FILES - 1} images a Gist can hold${bar(imgs.n / (GIST_FILES - 1))}</div>`);
  if (!kept) lines.push(`<p class="small">${standalone ? "The browser hasn't promised to keep Moth's data." : "Install Moth (Add to Home Screen) so the browser keeps its data: Safari can clear the data of websites you haven't opened for a week, but not of installed apps."} Export now and then, or turn on sync, so there's always a copy.</p>`);
  box.innerHTML = lines.join("");
  box.classList.remove("muted");
}
const syncLabel = () => ({ off: "Off", ok: "Up to date", busy: "Syncing…", pending: "Changes waiting", err: "Problem: " + SYNC.msg })[SYNC.state] || SYNC.state;
on("syncState", () => { if (CUR.prefix === "settings") { const s = $(".sync-state"); if (s) { s.className = "sync-state " + SYNC.state; s.textContent = syncLabel(); } } });

ACT.setWorldName = el => { DB.world.name = el.value.trim() || "Untitled world"; commit(); };
ACT.editCalendar = () => modal({ title: "Calendar", wide: true,
  body: `<p class="muted">One era per line: <b>name | abbreviation | first year</b>. Years are counted from 1 across the whole history; each era starts at one of those years, and dates show the year within their era.</p>
    ${areaField("Eras", "eras", eras().map(e => `${e.name} | ${e.abbr || ""} | ${e.start}`).join("\n"), 4)}
    ${areaField("Month names, in order, separated by commas (leave empty for none)", "months", DB.world.months.join(", "), 3)}`,
  buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
    const v = formVals(w), old = eras();
    const es = v.eras.split("\n").map(l => l.split("|").map(s => s.trim())).filter(p => p[0]).map((p, i) => ({ id: old[i]?.id || uid(), name: p[0], abbr: p[1] || "", start: parseInt(p[2]) || 1 }));
    if (!es.length) { toast("Keep at least one era"); return false; }
    DB.world.eras = es;
    DB.world.months = splitList(v.months);
    commit();
  } }] });

ACT.editKind = el => {
  const isNew = !el.dataset.id;
  const k = isNew ? { id: "", name: "", icon: "◆", color: COLORS[DB.kinds.length % COLORS.length], startLabel: "From", endLabel: "Until", fields: [] } : byId(DB.kinds, el.dataset.id);
  const used = DB.entries.filter(e => e.kind === k.id).length;
  modal({ title: isNew ? "New kind of entry" : "Edit " + k.name, wide: true,
    body: `<div class="row3">${textField("Name", "name", k.name, "autofocus")}${textField("Icon (an emoji)", "icon", k.icon)}${field("Colour", `<input type="color" name="color" value="${k.color}">`)}</div>
      <div class="row2">${textField("Start date is called", "startLabel", k.startLabel)}${textField("End date is called", "endLabel", k.endLabel)}</div>
      ${areaField("Extra fields, one per line: name : type (" + Object.keys(FIELD_TYPES).join(", ") + ")", "fields", k.fields.map(f => `${f.name} : ${f.type}`).join("\n"), 5)}
      ${!isNew ? `<p class="muted">${plural(used, "entry")} of this kind. Renaming a field keeps its values; removing one drops them.</p>` : ""}`,
    buttons: [
      ...(!isNew ? [{ label: "Delete kind", cls: "danger", act: () => {
        if (used) { toast(`${plural(used, "entry")} still use this kind. Change their kind first.`); return false; }
        withUndo("Kind deleted", () => { DB.kinds = DB.kinds.filter(x => x !== k); });
      } }] : []),
      { label: "Cancel" },
      { label: "Save", cls: "accent", act: w => {
        const v = formVals(w);
        if (!v.name.trim()) { toast("Give it a name"); return false; }
        const lines = v.fields.split("\n").map(l => l.split(":").map(s => s.trim())).filter(p => p[0]);
        const bad = lines.find(p => p[1] && !FIELD_TYPES[p[1].toLowerCase()]);
        if (bad) { toast(`“${bad[1]}” isn't a field type. Use one of: ${Object.keys(FIELD_TYPES).join(", ")}`); return false; }
        // fields keep their ids by position, so renaming one keeps its values
        k.fields = lines.map((p, i) => ({ id: k.fields[i]?.id || uid(), name: p[0], type: (p[1] || "text").toLowerCase() }));
        Object.assign(k, { name: v.name.trim(), icon: v.icon.trim() || "◆", color: v.color, startLabel: v.startLabel.trim() || "From", endLabel: v.endLabel.trim() || "Until" });
        if (isNew) { k.id = fileSlug(k.name) + "-" + uid().slice(0, 4); DB.kinds.push(k); }
        commit();
      } }] });
};

ACT.syncConnect = async () => {
  const t = $("#ghToken").value.trim();
  if (!t) return toast("Paste a token first");
  try { await connectGist(t); toast("Connected. This world now syncs through a private Gist."); }
  catch (e) { toast(e.message); }
  rerender();
};
ACT.syncNow = async () => { await pull(); if (ls.get("dirty")) await push(); rerender(); };
ACT.syncOff = async () => { if (await ask("Stop syncing on this device?", "The world stays here and in the Gist; they just stop talking.", "Stop syncing", "")) { disconnectGist(); rerender(); } };

ACT.exportWorld = async () => download(`${fileSlug(DB.world.name)}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportBundle()));
ACT.importWorld = () => {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".json,application/json";
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { return toast("That file isn't a Moth export"); }
    const db = data.db || (data.entries ? data : null);
    if (!db) return toast("That file isn't a Moth export");
    if (!await ask("Replace this world?", `“${esc(db.world?.name || "Untitled")}” replaces “${esc(DB.world.name)}” on this device${syncOn() ? " and in the Gist" : ""}. Export first if you want to keep it.`, "Replace", "danger")) return;
    for (const [id, d] of Object.entries(data.assets || {})) await assetPut(d, id);
    DB = normalizeDB(db);
    commit();
    toast("Imported " + DB.world.name);
  };
  inp.click();
};
ACT.loadSample = async () => {
  if (DB.entries.length && !await ask("Load the sample world?", `“The Drowned Crown” replaces “${esc(DB.world.name)}” on this device. Export first if you want to keep it.`, "Load it", "danger")) return;
  DB = sampleWorld();
  commit();
  go("#/codex");
};
ACT.resetWorld = async () => {
  if (!await ask("Start an empty world?", `“${esc(DB.world.name)}” is cleared from this device${syncOn() ? " and the Gist" : ""}. Export first if you want to keep it.`, "Start empty")) return;
  DB = normalizeDB(null);
  commit();
  go("#/codex");
};
