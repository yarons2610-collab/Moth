"use strict";
/* ── alternative versions ── an entry can hold several named versions of
   itself ("Canon", "Darker backstory", "Original idea"). One is live: it's
   what the entry is everywhere in Moth (its page, links, the timeline,
   search, the player screen). The others wait in entry.versions, secret,
   until you switch to one, compare it with the live one, or copy a field
   across. The name and relationships belong to the entry, not a version.

   entry.versionName: the live version's name
   entry.versions: [{ id, name, created, data }] where data holds the
   versioned parts (VERSIONED below) */

const VERSIONED = ["summary", "body", "fields", "extra", "aliases", "tags", "start", "end", "portrait", "token", "color", "stats", "pc"];
const snapshot = e => structuredClone(Object.fromEntries(VERSIONED.map(k => [k, e[k] ?? null])));
const liveName = e => e.versionName || "Main";

// every difference between two versions, as rows { label, a, b, apply }:
// a and b are HTML for each side, apply(e, data) copies b's value into e
function versionDiff(e, a, b) {
  const rows = [], same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  const k = kindOf(e), txt = v => v == null || v === "" ? `<span class="muted">—</span>` : esc(v);
  const add = (label, x, y, show, apply) => { if (!same(x, y)) rows.push({ label, a: show(x), b: show(y), apply }); };
  add("Summary", a.summary, b.summary, v => v ? inline(v) : txt(v), (e, d) => { e.summary = d.summary; });
  add(k.startLabel || "From", a.start, b.start, v => txt(fmtDate(v)), (e, d) => { e.start = structuredClone(d.start); });
  add(k.endLabel || "Until", a.end, b.end, v => txt(fmtDate(v)), (e, d) => { e.end = structuredClone(d.end); });
  for (const f of k.fields) add((f.secret ? "🙈 " : "") + f.name, a.fields?.[f.id], b.fields?.[f.id], v => isEmptyVal(v) ? txt("") : fieldShow(f, v),
    (e, d) => { e.fields ||= {}; if (isEmptyVal(d.fields?.[f.id])) delete e.fields[f.id]; else e.fields[f.id] = structuredClone(d.fields[f.id]); });
  const names = [...new Set([...(a.extra || []), ...(b.extra || [])].map(x => x.name))];
  for (const n of names) {
    const xa = (a.extra || []).find(x => x.name === n), xb = (b.extra || []).find(x => x.name === n);
    add(n, xa?.value, xb?.value, v => v ? `<div class="prose">${md(v)}</div>` : txt(""), (e, d) => {
      e.extra = (e.extra || []).filter(x => x.name !== n);
      const x = (d.extra || []).find(x => x.name === n);
      if (x) e.extra.push({ ...x });
    });
  }
  add("Also known as", a.aliases, b.aliases, v => txt((v || []).join(", ")), (e, d) => { e.aliases = [...(d.aliases || [])]; });
  add("Tags", a.tags, b.tags, v => txt((v || []).map(t => "#" + t).join(" ")), (e, d) => { e.tags = [...(d.tags || [])]; });
  add("Picture", a.portrait, b.portrait, v => v ? assetImg(v, "ver-pic") : txt(""), (e, d) => { e.portrait = d.portrait; });
  add("Game stats", a.stats, b.stats, v => v ? txt(Object.entries(v).filter(([k]) => k !== "block").map(([k, x]) => `${k} ${x}`).join(", ")) : txt(""), (e, d) => { e.stats = structuredClone(d.stats); });
  add("Article", a.body, b.body, v => v ? `<div class="prose ver-article">${md(v)}</div>` : txt(""), (e, d) => { e.body = d.body; });
  return rows;
}
const diffSummary = (e, v) => { const r = versionDiff(e, snapshot(e), v.data).map(x => x.label.replace("🙈 ", "")); return r.length ? (r.length > 4 ? r.slice(0, 4).join(", ") + ` and ${r.length - 4} more` : r.join(", ")) : "the same as the live one"; };

// the entry page shows which version is live when there are others
function versionBadge(e) {
  const n = (e.versions || []).length;
  return n ? `<button class="ver-badge" data-act="versions" data-id="${e.id}" title="Versions of this entry">⎇ ${esc(liveName(e))} <small>+${n} other${n === 1 ? "" : "s"}</small></button>` : "";
}

ACT.versions = el => versionsModal(byId(DB.entries, el.dataset.id));
function versionsModal(e) {
  const list = e.versions || [];
  modal({ title: "Versions of " + e.name, wide: true,
    body: `<p class="muted small">The live version is what this entry is everywhere in Moth. The others stay here, unseen by players, until you switch to one or copy parts of it across. The name and relationships are shared by all versions.</p>
      <div class="ver-list">
        <div class="ver-row live"><span class="ver-name"><b>${esc(liveName(e))}</b> <span class="now-badge">Live</span></span>
          <span class="ver-tools"><button class="btn small" data-act="verRenameLive" data-id="${e.id}">Rename</button></span></div>
        ${list.map(v => `<div class="ver-row"><span class="ver-name"><b>${esc(v.name)}</b><small class="muted">${new Date(v.created).toLocaleDateString()} · differs in ${esc(diffSummary(e, v))}</small></span>
          <span class="ver-tools"><button class="btn small" data-act="verCompare" data-id="${e.id}" data-v="${v.id}">Compare</button>
          <button class="btn small accent" data-act="verLive" data-id="${e.id}" data-v="${v.id}">Make live</button>
          <button class="mini" data-act="verRename" data-id="${e.id}" data-v="${v.id}" title="Rename">✎</button><button class="mini" data-act="verDelete" data-id="${e.id}" data-v="${v.id}" title="Delete">🗑</button></span></div>`).join("")}
      </div>`,
    buttons: [{ label: "Close" }, { label: "+ New version", cls: "accent", act: () => { setTimeout(() => newVersionModal(e)); } }] });
}
function newVersionModal(e) {
  modal({ title: "New version of " + e.name,
    body: `${textField("Name it", "name", "", `placeholder="e.g. Darker backstory, Original idea, Draft 2" autofocus`)}
      ${!e.versions?.length ? textField("And the version it is now (the current one) is called", "live", liveName(e) === "Main" ? "Canon" : liveName(e)) : ""}
      <label class="check"><input type="radio" name="from" value="copy" checked> Start from a copy of “${esc(liveName(e))}”</label>
      <label class="check"><input type="radio" name="from" value="blank"> Start blank (keep only the name and kind)</label>
      <p class="muted small">The new version becomes the live one, ready to edit. “${esc(liveName(e))}” is kept, and you can switch back any time.</p>`,
    buttons: [{ label: "Cancel" }, { label: "Create and edit", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.name.trim()) { toast("Give the new version a name"); return false; }
      if (v.live?.trim()) e.versionName = v.live.trim();
      (e.versions ||= []).push({ id: uid(), name: liveName(e), created: Date.now(), data: snapshot(e) });
      e.versionName = v.name.trim();
      if (v.from === "blank") Object.assign(e, { summary: "", body: "", fields: {}, extra: [], aliases: [], tags: [], start: null, end: null, portrait: null, token: null, stats: null });
      commit();
      setTimeout(() => entryEditor(e, false));
    } }] });
}
// switching: the live content goes into the list, the chosen one comes out
ACT.verLive = el => {
  const e = byId(DB.entries, el.dataset.id), v = e.versions.find(x => x.id === el.dataset.v);
  [...MODALS].forEach(m => m.close());
  withUndo(`“${v.name}” is now the live version`, () => {
    const was = { id: uid(), name: liveName(e), created: Date.now(), data: snapshot(e) };
    e.versions = e.versions.filter(x => x !== v).concat(was);
    Object.assign(e, structuredClone(v.data));
    e.versionName = v.name;
  });
};
ACT.verCompare = el => {
  const e = byId(DB.entries, el.dataset.id), v = e.versions.find(x => x.id === el.dataset.v);
  const rows = versionDiff(e, snapshot(e), v.data);
  modal({ title: `${liveName(e)} and ${v.name}`, wide: true, cls: "ver-compare",
    body: rows.length ? `<p class="muted small">Only what differs. “Use this” copies one thing from “${esc(v.name)}” into the live version; “${esc(v.name)}” itself stays as it is.</p>
      <table class="ver-table"><tr><th></th><th>${esc(liveName(e))} <span class="now-badge">Live</span></th><th>${esc(v.name)}</th></tr>
      ${rows.map((r, i) => `<tr><td class="ver-label">${esc(r.label)}</td><td>${r.a}</td><td>${r.b}<div><button class="btn small" data-act="verTake" data-id="${e.id}" data-v="${v.id}" data-i="${i}">← Use this</button></div></td></tr>`).join("")}</table>`
      : `<p>These two versions are the same.</p>`,
    buttons: [{ label: "Close" }, { label: `Make “${v.name}” live`, cls: "accent", act: () => { setTimeout(() => ACT.verLive(el)); } }] });
};
ACT.verTake = el => {
  const e = byId(DB.entries, el.dataset.id), v = e.versions.find(x => x.id === el.dataset.v);
  const row = versionDiff(e, snapshot(e), v.data)[+el.dataset.i];
  if (!row) return;
  [...MODALS].forEach(m => m.close());
  withUndo(`Copied ${row.label.replace("🙈 ", "")} from “${v.name}”`, () => row.apply(e, v.data));
  ACT.verCompare(el);
};
const renameIn = (title, value, done) => modal({ title, body: textField("Name", "name", value, "autofocus"),
  buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => { const n = formVals(w).name.trim(); if (!n) return false; done(n); commit(); } }] });
ACT.verRenameLive = el => { const e = byId(DB.entries, el.dataset.id); [...MODALS].forEach(m => m.close()); renameIn("Rename the live version", liveName(e), n => { e.versionName = n; }); };
ACT.verRename = el => { const e = byId(DB.entries, el.dataset.id), v = e.versions.find(x => x.id === el.dataset.v); [...MODALS].forEach(m => m.close()); renameIn("Rename version", v.name, n => { v.name = n; }); };
ACT.verDelete = async el => {
  const e = byId(DB.entries, el.dataset.id), v = e.versions.find(x => x.id === el.dataset.v);
  [...MODALS].forEach(m => m.close());
  if (!await ask(`Delete the version “${v.name}”?`, "The live version isn't touched. You can undo this straight afterwards.")) return;
  withUndo("Version deleted", () => { e.versions = e.versions.filter(x => x !== v); });
};
