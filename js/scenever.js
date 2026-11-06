"use strict";
/* ── versions of scenes and chapters ── like an entry's versions: one is
   live, and the others wait beside it, named ("First draft", "Darker
   ending"), until you compare them, switch to one, or delete it.

   A scene's version holds its title, one-line summary and text. A
   chapter's version holds its title, its plan, and all of its scenes as
   they were. Only the live version counts anywhere else: reading, exports,
   word counts, search, the plan.

   scene.versionName / chapter.versionName: the live version's name
   scene.versions / chapter.versions: [{ id, name, created, data }] */

const SV = {
  sc: {
    get: id => sceneCtx(id)?.sc,
    what: "scene", title: o => o.title,
    snap: sc => structuredClone({ title: sc.title || "", summary: sc.summary || "", body: sc.body || "" }),
    blank: sc => ({ title: sc.title, summary: "", body: "" }),
    apply: (sc, d) => { Object.assign(sc, structuredClone(d)); },
    words: d => countWords(d.body),
    rows: (a, b) => [
      ["Title", a.title, b.title, v => esc(v || "—")],
      ["In a line", a.summary, b.summary, v => v ? inline(v) : `<span class="muted">—</span>`],
      ["Text", a.body, b.body, v => v ? `<div class="prose ver-article">${md(v)}</div><small class="muted">${countWords(v).toLocaleString()} words</small>` : `<span class="muted">Nothing written</span>`],
    ],
  },
  ch: {
    get: id => DB.books.flatMap(b => b.chapters || []).find(c => c.id === id),
    what: "chapter", title: o => o.title,
    snap: ch => structuredClone({ title: ch.title || "", summary: ch.summary || "", scenes: ch.scenes || [] }),
    blank: ch => ({ title: ch.title, summary: "", scenes: [] }),
    apply: (ch, d) => { ch.title = d.title; ch.summary = d.summary; ch.scenes = structuredClone(d.scenes || []); },
    words: d => (d.scenes || []).reduce((n, s) => n + countWords(s.body), 0),
    rows: (a, b) => [
      ["Title", a.title, b.title, v => esc(v || "—")],
      ["Plan", a.summary, b.summary, v => v ? `<div class="prose">${md(v)}</div>` : `<span class="muted">—</span>`],
      ["Scenes", a.scenes, b.scenes, v => (v || []).length ? `<ol class="ver-scenes">${v.map(s => `<li><details><summary><b>${esc(s.title || "Untitled")}</b> <small class="muted">${countWords(s.body).toLocaleString()} words</small></summary>${s.summary ? `<p class="muted"><i>${inline(s.summary)}</i></p>` : ""}<div class="prose ver-article">${md(s.body || "") || `<span class="muted">Nothing written</span>`}</div></details></li>`).join("")}</ol>` : `<span class="muted">No scenes</span>`],
    ],
  },
};
const svLive = o => o.versionName || "Main";
const svSame = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
function svDiffers(t, o, v) {
  const rows = SV[t].rows(SV[t].snap(o), v.data).filter(r => !svSame(r[1], r[2])).map(r => r[0].toLowerCase());
  return rows.length ? "differs in " + rows.join(", ") : "the same as the live one";
}
// the badge and the button: on the writing view, and on the book's page
function svButton(t, o, cls = "") {
  const n = (o.versions || []).length;
  return `<button class="btn small ${cls} ${n ? "has-ver" : ""}" data-act="svOpen" data-t="${t}" data-id="${o.id}" title="Versions of this ${SV[t].what}">⎇${n ? ` ${esc(svLive(o))} <small>+${n}</small>` : " Versions"}</button>`;
}
const svBadge = (t, o) => (o.versions || []).length ? `<button class="ver-badge" data-act="svOpen" data-t="${t}" data-id="${o.id}" title="This ${SV[t].what} has other versions">⎇ ${(o.versions || []).length + 1}</button>` : "";

ACT.svOpen = el => svModal(el.dataset.t, el.dataset.id);
function svModal(t, id) {
  const o = SV[t].get(id), S = SV[t];
  if (!o) return;
  // any typing in the scene is saved before versions are taken or switched
  clearTimeout(typeof sceneSaveT !== "undefined" ? sceneSaveT : 0); save({ quiet: true });
  const list = o.versions || [];
  modal({ title: `Versions of “${S.title(o) || "Untitled"}”`, wide: true,
    body: `<p class="muted small">The live version is the ${S.what} everywhere in Moth: reading, exports, word counts. The others are kept here, until you compare them, make one live, or delete them.${t === "ch" ? " A chapter's version keeps its title, its plan and all of its scenes." : " A scene's version keeps its title, its line and its text."}</p>
      <div class="ver-list">
        <div class="ver-row live"><span class="ver-name"><b>${esc(svLive(o))}</b> <span class="now-badge">Live</span><small class="muted">${S.words(S.snap(o)).toLocaleString()} words</small></span>
          <span class="ver-tools"><button class="btn small" data-act="svRenameLive" data-t="${t}" data-id="${o.id}">Rename</button></span></div>
        ${list.map(v => `<div class="ver-row"><span class="ver-name"><b>${esc(v.name)}</b><small class="muted">${new Date(v.created).toLocaleDateString()} · ${S.words(v.data).toLocaleString()} words · ${esc(svDiffers(t, o, v))}</small></span>
          <span class="ver-tools"><button class="btn small" data-act="svCompare" data-t="${t}" data-id="${o.id}" data-v="${v.id}">Compare</button>
          <button class="btn small accent" data-act="svLiveSet" data-t="${t}" data-id="${o.id}" data-v="${v.id}">Make live</button>
          <button class="mini" data-act="svRename" data-t="${t}" data-id="${o.id}" data-v="${v.id}" title="Rename">✎</button><button class="mini" data-act="svDelete" data-t="${t}" data-id="${o.id}" data-v="${v.id}" title="Delete">🗑</button></span></div>`).join("")}
      </div>`,
    buttons: [{ label: "Close" }, { label: "+ New version", cls: "accent", act: () => { setTimeout(() => svNew(t, id)); } }] });
}
function svNew(t, id) {
  const o = SV[t].get(id), S = SV[t];
  modal({ title: `New version of “${S.title(o) || "Untitled"}”`,
    body: `${textField("Name it", "name", "", `placeholder="e.g. Second draft, Darker ending, From Hyacinth's eyes" autofocus`)}
      ${!o.versions?.length ? textField("And the version it is now is called", "live", svLive(o) === "Main" ? "First draft" : svLive(o)) : ""}
      <label class="check"><input type="radio" name="from" value="copy" checked> Start from a copy of “${esc(svLive(o))}”</label>
      <label class="check"><input type="radio" name="from" value="blank"> Start blank${t === "ch" ? " (no plan, no scenes)" : " (keep only the title)"}</label>
      <p class="muted small">The new version becomes the live one, ready to write in. “${esc(svLive(o))}” is kept exactly as it is, and you can switch back at any time.</p>`,
    buttons: [{ label: "Cancel" }, { label: "Create", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.name.trim()) { toast("Give the new version a name"); return false; }
      if (v.live?.trim()) o.versionName = v.live.trim();
      (o.versions ||= []).push({ id: uid(), name: svLive(o), created: Date.now(), data: S.snap(o) });
      o.versionName = v.name.trim();
      // a copy keeps the same scenes (and so whatever links to them); blank starts afresh
      if (v.from === "blank") S.apply(o, S.blank(o));
      commit();
      toast(`Now writing “${o.versionName}”; “${o.versions[o.versions.length - 1].name}” is kept`);
    } }] });
}
// switching: the live one goes into the list, the chosen one comes out
ACT.svLiveSet = el => {
  const t = el.dataset.t, o = SV[t].get(el.dataset.id), v = o.versions.find(x => x.id === el.dataset.v), S = SV[t];
  [...MODALS].forEach(m => m.close());
  withUndo(`“${v.name}” is now the live version`, () => {
    const was = { id: uid(), name: svLive(o), created: Date.now(), data: S.snap(o) };
    o.versions = o.versions.filter(x => x !== v).concat(was);
    S.apply(o, v.data);
    o.versionName = v.name;
  });
};
ACT.svCompare = el => {
  const t = el.dataset.t, o = SV[t].get(el.dataset.id), v = o.versions.find(x => x.id === el.dataset.v), S = SV[t];
  const rows = S.rows(S.snap(o), v.data);
  modal({ title: `${svLive(o)} and ${v.name}`, wide: true, cls: "ver-compare",
    body: `<table class="ver-table"><tr><th></th><th>${esc(svLive(o))} <span class="now-badge">Live</span></th><th>${esc(v.name)}</th></tr>
      ${rows.map(([label, a, b, show]) => `<tr class="${svSame(a, b) ? "same" : ""}"><td class="ver-label">${esc(label)}${svSame(a, b) ? ` <small class="muted">same</small>` : ""}</td><td>${show(a)}</td><td>${show(b)}</td></tr>`).join("")}</table>`,
    buttons: [{ label: "Close" }, { label: `Make “${v.name}” live`, cls: "accent", act: () => { setTimeout(() => ACT.svLiveSet(el)); } }] });
};
ACT.svRenameLive = el => { const o = SV[el.dataset.t].get(el.dataset.id); [...MODALS].forEach(m => m.close()); renameIn("Rename the live version", svLive(o), n => { o.versionName = n; }); };
ACT.svRename = el => { const o = SV[el.dataset.t].get(el.dataset.id), v = o.versions.find(x => x.id === el.dataset.v); [...MODALS].forEach(m => m.close()); renameIn("Rename version", v.name, n => { v.name = n; }); };
ACT.svDelete = async el => {
  const o = SV[el.dataset.t].get(el.dataset.id), v = o.versions.find(x => x.id === el.dataset.v);
  [...MODALS].forEach(m => m.close());
  if (!await ask(`Delete the version “${v.name}”?`, "The live version isn't touched. You can undo this straight afterwards.")) return;
  withUndo("Version deleted", () => { o.versions = o.versions.filter(x => x !== v); });
};
