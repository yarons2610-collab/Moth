"use strict";
/* ── settings ── the world's name and calendar, kinds of codex entry and their
   fields, sync, export and import. */


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
        <small class="muted">${k.fields.length ? `${plural(k.fields.length, "field")}${fieldSections(k.fields).length > 1 ? ` in ${fieldSections(k.fields).length} sections` : ""}` : "no fields"}</small><span class="spacer"></span>
        <button class="btn small" data-act="editKind" data-id="${k.id}">Edit</button></li>`).join("")}</ul></section>

    <section class="panel"><div class="panel-h"><h4>Sync between devices</h4><span class="sync-state ${SYNC.state}">${esc(syncLabel())}</span></div>
      ${syncOn() ? syncConnectedHtml() : syncSetupHtml()}</section>

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
  if (syncOn() && backendName() === "gist") lines.push(`<div style="margin-top:8px"><b>Sync</b> ${imgs.n} of about ${GIST_FILES - 1} pictures a Gist can hold${bar(imgs.n / (GIST_FILES - 1))}${imgs.n > 150 ? `<span class="small">Moving to a repository (above) removes this limit.</span>` : ""}</div>`);
  if (syncOn() && backendName() === "repo") lines.push(`<div style="margin-top:8px"><b>Sync</b> through a repository: no file limit. GitHub is happy up to about 1 GB; this world is about ${mb(text / 2 + imgs.bytes)}.</div>`);
  if (!kept) lines.push(`<p class="small">${standalone ? "The browser hasn't promised to keep Moth's data." : "Install Moth (Add to Home Screen) so the browser keeps its data: Safari can clear the data of websites you haven't opened for a week, but not of installed apps."} Export now and then, or turn on sync, so there's always a copy.</p>`);
  box.innerHTML = lines.join("");
  box.classList.remove("muted");
}
function syncConnectedHtml() {
  const be = backend(), where = be.where();
  const name = backendName() === "repo" ? `the private repository <b>${esc(ls.get("repo"))}</b>` : "a private GitHub Gist";
  return `<p>Syncing through ${name}${where ? ` (<a href="${where}" target="_blank" rel="noopener">open it</a>)` : ""}.</p>
    <div class="btn-row"><button class="btn" data-act="syncNow">Sync now</button><button class="btn ghost" data-act="syncOff">Stop syncing on this device</button></div>
    ${backendName() === "gist" ? `<div class="move-box"><b>Move to a GitHub repository</b>
      <p class="muted small">A Gist holds about 300 files, and every picture is one. A private repository has no such limit, stores pictures as real image files (a quarter smaller) and saves each sync in one go.
        Your other devices follow the move by themselves; they just need a token that can use the repository (the steps are below the button).</p>
      <div class="row-inline"><input id="moveRepo" value="moth-world" placeholder="moth-world"><button class="btn accent" data-act="syncMove">Move</button></div>
      ${tokenHelp("repo")}</div>` : ""}`;
}
function syncSetupHtml() {
  return `<p class="muted">Your world lives in this browser. To have it on your phone and your computer, Moth keeps a copy on GitHub (free) and each device syncs with it. Do this once on each device, with the same token.</p>
    <div class="sync-choice">
      <label class="check"><input type="radio" name="syncKind" value="repo" checked data-change="syncKind"> <span><b>A private repository</b> (recommended): no real limit on maps and pictures</span></label>
      <label class="check"><input type="radio" name="syncKind" value="gist" data-change="syncKind"> <span><b>A Gist</b>: fine for a world with up to about 300 pictures</span></label>
    </div>
    <div id="syncHelp">${tokenHelp("repo")}</div>
    <div class="row-inline" id="repoRow"><label class="inline">Repository</label><input id="repoName" value="moth-world" placeholder="moth-world"></div>
    <div class="row-inline"><input id="ghToken" type="password" placeholder="Paste the token (github_pat_… or ghp_…)" autocomplete="off"><button class="btn accent" data-act="syncConnect">Connect</button></div>`;
}
function tokenHelp(kind) {
  if (kind === "gist") return `<p class="small">Make a token with only the <b>gist</b> permission (<a href="https://github.com/settings/tokens/new?scopes=gist&description=Moth" target="_blank" rel="noopener">make one here</a>), and paste it below. It's stored only on this device.</p>`;
  return `<ol class="small token-steps">
    <li>Easiest: <a href="https://github.com/settings/tokens/new?scopes=repo&description=Moth" target="_blank" rel="noopener">make a token with the “repo” permission</a>. Moth creates the private repository for you. (That token can reach all your repositories.)</li>
    <li>Safer: <a href="https://github.com/new?name=moth-world&visibility=private" target="_blank" rel="noopener">create a private repository</a> called <b>moth-world</b> (tick “Add a README”), then
      <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">make a fine-grained token</a> with access to only that repository and <b>Contents: Read and write</b>.</li>
  </ol><p class="small muted">The token is stored only on this device.</p>`;
}
ACT.syncKind = el => {
  $("#syncHelp").innerHTML = tokenHelp(el.value);
  $("#repoRow").hidden = el.value !== "repo";
};
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

// one row of the field editor
function kfRow(f) {
  return `<div class="kf-row" data-id="${f.id || ""}">
    <input class="kf-sec" list="kfSecs" value="${esc(f.sec || "")}" placeholder="Section" title="Section (blank: the basics, beside the article)">
    <input class="kf-name" value="${esc(f.name || "")}" placeholder="Field name">
    <select class="kf-type" data-change="kfType">${Object.entries(FIELD_TYPES).map(([t, l]) => `<option value="${t}" ${t === (f.type || "text") ? "selected" : ""}>${l}</option>`).join("")}</select>
    <input class="kf-opts" value="${esc((f.opts || []).join(", "))}" placeholder="Choices, with commas" ${f.type === "choice" ? "" : "hidden"}>
    <label class="kf-secret" title="Secret: only you see it; never on the player screen"><input type="checkbox" ${f.secret ? "checked" : ""}>🙈</label>
    <span class="kf-tools"><button type="button" class="mini" data-act="kfMove" data-d="-1" title="Up">↑</button><button type="button" class="mini" data-act="kfMove" data-d="1" title="Down">↓</button><button type="button" class="mini" data-act="kfDel" title="Remove">✕</button></span>
  </div>`;
}
ACT.kfType = el => { el.parentElement.querySelector(".kf-opts").hidden = el.value !== "choice"; };
ACT.kfMove = el => { const r = el.closest(".kf-row"), d = +el.dataset.d; d < 0 ? r.previousElementSibling?.before(r) : r.nextElementSibling?.after(r); };
ACT.kfDel = el => el.closest(".kf-row").remove();
ACT.kfAdd = el => { $("#kfList").insertAdjacentHTML("beforeend", kfRow({ sec: $$("#kfList .kf-sec").pop()?.value || "" })); $$("#kfList .kf-name").pop().focus(); };
ACT.kfSuggest = el => {
  const have = new Set($$("#kfList .kf-name").map(i => norm(i.value)));
  const k = byId(DB.kinds, el.dataset.id), gone = new Map((k?.gone || []).map(f => [norm(f.name), f.id]));
  const add = templateFields(el.dataset.id).filter(f => !have.has(norm(f.name))).map(f => ({ ...f, id: gone.get(norm(f.name)) || "" }));
  $("#kfList").insertAdjacentHTML("beforeend", add.map(kfRow).join(""));
  toast(add.length ? `Added ${plural(add.length, "suggested field")}. Save to keep them.` : "It already has all the suggested fields.");
};
ACT.editKind = el => {
  const isNew = !el.dataset.id;
  const k = isNew ? { id: "", name: "", icon: "◆", color: COLORS[DB.kinds.length % COLORS.length], startLabel: "From", endLabel: "Until", fields: [] } : byId(DB.kinds, el.dataset.id);
  const used = DB.entries.filter(e => e.kind === k.id).length;
  const secs = [...new Set(DB.kinds.flatMap(x => x.fields.map(f => f.sec)).filter(Boolean))];
  modal({ title: isNew ? "New kind of entry" : "Edit " + k.name, wide: true,
    body: `<div class="row3">${textField("Name", "name", k.name, "autofocus")}${textField("Icon (an emoji)", "icon", k.icon)}${field("Colour", `<input type="color" name="color" value="${k.color}">`)}</div>
      <div class="row2">${textField("Start date is called", "startLabel", k.startLabel)}${textField("End date is called", "endLabel", k.endLabel)}</div>
      <h4 class="screen-h">Fields</h4>
      <p class="muted small">Fields with the same section are shown together; ones with no section sit beside the article. 🙈 marks a secret: only you see it, and it never goes on the player screen. Empty fields don't show on an entry's page.</p>
      <datalist id="kfSecs">${secs.map(x => `<option value="${esc(x)}">`).join("")}</datalist>
      <div class="kf-list" id="kfList">${k.fields.map(kfRow).join("")}</div>
      <div class="btn-row"><button type="button" class="btn small" data-act="kfAdd">+ Field</button>
        ${KIND_TEMPLATES[k.id] ? `<button type="button" class="btn small" data-act="kfSuggest" data-id="${k.id}">Add the suggested fields</button>` : ""}</div>
      ${!isNew ? `<p class="muted small">${plural(used, "entry")} of this kind. Renaming a field keeps what's in it; removing one hides it (put it back with the same name to see it again).</p>` : ""}`,
    buttons: [
      ...(!isNew ? [{ label: "Delete kind", cls: "danger", act: () => {
        if (used) { toast(`${plural(used, "entry")} still use this kind. Change their kind first.`); return false; }
        withUndo("Kind deleted", () => { DB.kinds = DB.kinds.filter(x => x !== k); });
      } }] : []),
      { label: "Cancel" },
      { label: "Save", cls: "accent", act: w => {
        const v = formVals(w);
        if (!v.name.trim()) { toast("Give it a name"); return false; }
        // a removed field that comes back by name gets its old id, and so its
        // values: removed fields are remembered (k.gone) for exactly that
        const byName = new Map([...(k.gone || []), ...k.fields].map(f => [norm(f.name), f.id]));
        const before = k.fields;
        k.fields = $$(".kf-row", w).map(r => {
          const name = $(".kf-name", r).value.trim(), type = $(".kf-type", r).value;
          if (!name) return null;
          const f = { id: r.dataset.id || byName.get(norm(name)) || uid(), name, type, sec: $(".kf-sec", r).value.trim() };
          if (type === "choice") f.opts = splitList($(".kf-opts", r).value);
          if ($(".kf-secret input", r).checked) f.secret = true;
          return f;
        }).filter(Boolean);
        const kept = new Set(k.fields.map(f => f.id));
        const gone = [...(k.gone || []), ...before.filter(f => !kept.has(f.id)).map(f => ({ id: f.id, name: f.name }))];
        k.gone = [...new Map(gone.filter(f => !kept.has(f.id)).map(f => [norm(f.name), f])).values()];
        Object.assign(k, { name: v.name.trim(), icon: v.icon.trim() || "◆", color: v.color, startLabel: v.startLabel.trim() || "From", endLabel: v.endLabel.trim() || "Until" });
        if (isNew) { k.id = fileSlug(k.name) + "-" + uid().slice(0, 4); DB.kinds.push(k); }
        commit();
      } }] });
};

ACT.syncConnect = async () => {
  const t = $("#ghToken").value.trim(), kind = $("input[name=syncKind]:checked")?.value || "repo";
  if (!t) return toast("Paste a token first");
  try {
    await connectSync(t, kind, kind === "repo" ? $("#repoName").value.trim() || "moth-world" : "");
    toast(SYNC.state === "err" ? "Connected, but: " + SYNC.msg : `Connected. This world now syncs through ${kind === "repo" ? ls.get("repo") : "a private Gist"}.`, { ms: 6000 });
  } catch (e) { toast(e.message); }
  rerender();
};
ACT.syncMove = async el => {
  const repo = $("#moveRepo").value.trim() || "moth-world";
  el.disabled = true; el.textContent = "Moving…";
  try { await moveToRepo(repo); toast(`Moved. This world now syncs through ${ls.get("repo")}.`, { ms: 6000 }); }
  catch (e) { toast("Couldn't move: " + e.message, { ms: 9000 }); }
  rerender();
};
ACT.syncNow = async () => { await pull(); if (ls.get("dirty")) await push(); rerender(); };
ACT.syncOff = async () => { if (await ask("Stop syncing on this device?", "The world stays here and on GitHub; they just stop talking.", "Stop syncing", "")) { disconnectSync(); rerender(); } };

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
