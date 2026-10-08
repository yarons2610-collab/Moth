"use strict";
/* ── notes ── loose notes: ideas, rules, questions for later. They link and
   are linked like everything else: through [[links]] in the text, and through
   their "Linked to" list (note.links, as "type:id"), which can hold anything
   in the world. A thing's page shows the notes about it (notesPanel). */

const NOTES = { q: "", edit: false };

linkType("n", {
  list: () => DB.notes,
  names: n => [n.title],
  info: n => ({ title: n.title, sub: "Note", icon: "🗒", color: "#a3a3b8" }),
  href: n => "#/note/" + n.id,
  text: n => n.body,
  // straight from the note: the index is still being built when this runs
  edges: n => (n.links || []).map(k => { const i = k.indexOf(":"); return [k.slice(0, i), k.slice(i + 1), "note"]; }),
});
// what a note is linked to, skipping anything since deleted
const noteLinks = n => (n.links || []).map(k => { const i = k.indexOf(":"), t = k.slice(0, i), it = lookup(t, k.slice(i + 1)); return it && { t, it, k }; }).filter(Boolean);

// the notes about a thing: linked to it, or mentioning it in their text
function notesPanel(t, id, { hideEmpty = false } = {}) {
  const it = lookup(t, id);
  if (!it) return "";
  const notes = backlinks(t, id).filter(b => b.t === "n").map(b => b.it).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  if (hideEmpty && !notes.length) return "";
  return `<section class="panel notes-panel"><div class="panel-h"><h4>Notes</h4><button class="btn small" data-act="noteFor" data-k="${t}:${id}">+ Note</button></div>
    ${notes.length ? `<div class="list">${notes.map(n => `<a class="row-card" href="#/note/${n.id}"><b>🗒 ${esc(n.title)}</b><small>${esc(plainLinks(n.body).slice(0, 90))}</small></a>`).join("")}</div>` : `<p class="muted small">No notes about it yet.</p>`}</section>`;
}
ACT.noteFor = el => {
  const k = el.dataset.k, i = k.indexOf(":"), it = lookup(k.slice(0, i), k.slice(i + 1));
  makeNote(it ? "On " + infoOf(k.slice(0, i), it).title : "", [k]);
};

addRoute("notes", "notes", () => {
  const q = norm(NOTES.q);
  const list = DB.notes.filter(n => !q || norm(n.title + " " + n.body + " " + (n.tags || []).join(" ") + " " + noteLinks(n).map(l => infoOf(l.t, l.it).title).join(" ")).includes(q))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || 0) - (a.updated || 0));
  return `<div class="page"><div class="page-h"><h2>Notes</h2><div class="spacer"></div>${searchBox("notesFilter", NOTES.q, "Search notes…")}
    <button class="btn accent" data-act="newNote">+ Note</button></div>
    <div class="cards notes">${list.map(n => `<a class="card note-card" href="#/note/${n.id}"><div class="card-b"><b>${n.pinned ? "📌 " : ""}${esc(n.title)}</b>
      <small>${n.updated ? new Date(n.updated).toLocaleDateString() : ""}</small><p>${esc(plainLinks(n.body).slice(0, 220))}</p>
      ${noteLinks(n).length ? `<div class="note-on">${noteLinks(n).map(({ t, it }) => { const i = infoOf(t, it); return `<span class="chip" style="--c:${i.color || "var(--ink-dim)"}">${i.icon || ""} ${esc(i.title)}</span>`; }).join("")}</div>` : ""}
      <div class="tags">${tagsHtml(n.tags)}</div></div></a>`).join("") || empty("No notes yet.")}</div></div>`;
});
ACT.notesFilter = el => { NOTES.q = el.value; rerender(); refocus(".page-h .search"); };

addRoute("note", "notes", id => {
  const n = byId(DB.notes, id);
  if (!n) return `<div class="page">${empty("That note doesn't exist any more.")}</div>`;
  const back = backlinks("n", n.id);
  return [`<div class="page narrow">
    <div class="crumbs"><a href="#/notes">Notes</a> ›</div>
    <div class="page-h"><input class="scene-title" value="${esc(n.title)}" data-input="noteTitle" data-id="${n.id}" aria-label="Title"><div class="spacer"></div>
      <button class="btn small" data-act="notePin" data-id="${n.id}">${n.pinned ? "Unpin" : "📌 Pin"}</button>
      <button class="btn small" data-act="noteMode">${NOTES.edit ? "📖 Read" : "✎ Write"}</button>
      <button class="btn small ghost" data-act="deleteNote" data-id="${n.id}">🗑</button></div>
    <input class="scene-sum" value="${esc((n.tags || []).join(", "))}" placeholder="tags, with commas" data-input="noteTags" data-id="${n.id}">
    <div class="note-links"><span class="muted small">Linked to</span>
      ${noteLinks(n).map(({ t, it, k }) => chip(t, it, ` <button class="mini" data-act="noteUnlink" data-id="${n.id}" data-k="${esc(k)}" title="Unlink">✕</button>`)).join("")}
      <span class="link-add"><input placeholder="+ Link to…" data-input="noteLinkSearch" data-id="${n.id}" autocomplete="off"><div class="link-results" id="noteLinkResults"></div></span></div>
    ${NOTES.edit ? `<textarea class="manuscript-ed" data-input="noteBody" data-id="${n.id}" placeholder="Write. [[Name]] links to anything.">${esc(n.body)}</textarea>`
      : mdBlock(n.body, `<p class="empty">Empty. <a data-act="noteMode">Start writing</a>.</p>`)}
    ${back.length ? `<section class="panel"><div class="panel-h"><h4>Mentioned in</h4></div><div class="chips">${back.map(b => chip(b.t, b.it)).join("")}</div></section>` : ""}
  </div>`, main => { const t = $(".manuscript-ed", main); if (t) { autoGrow(t); if (!n.body) t.focus(); } }];
});
let noteT = null;
const noteSave = n => { n.updated = Date.now(); clearTimeout(noteT); noteT = setTimeout(() => save({ quiet: true }), 400); };
ACT.noteBody = el => { const n = byId(DB.notes, el.dataset.id); n.body = el.value; autoGrow(el); noteSave(n); };
ACT.noteTitle = el => { const n = byId(DB.notes, el.dataset.id); n.title = el.value; noteSave(n); };
ACT.noteTags = el => { const n = byId(DB.notes, el.dataset.id); n.tags = splitList(el.value); noteSave(n); };
ACT.noteMode = () => { clearTimeout(noteT); save({ quiet: true }); NOTES.edit = !NOTES.edit; rerender(); };
// search everything in the world to link a note to
ACT.noteLinkSearch = el => {
  const n = byId(DB.notes, el.dataset.id), q = norm(el.value), box = $("#noteLinkResults");
  if (!q) { box.innerHTML = ""; return; }
  const have = new Set(n.links || []), hits = [];
  for (const x of idx().items) {
    const k = x.t + ":" + x.it.id;
    if (have.has(k) || x.it === n) continue;
    const ns = LINK_TYPES[x.t].names(x.it).map(norm);
    const s = ns.some(v => v.startsWith(q)) ? 0 : ns.some(v => v.includes(q)) ? 1 : -1;
    if (s >= 0) hits.push([s, x, k]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  box.innerHTML = hits.slice(0, 8).map(([, x, k]) => { const i = infoOf(x.t, x.it); return `<button class="lp-item" data-act="noteLink" data-id="${n.id}" data-k="${esc(k)}">${i.icon || ""} ${esc(i.title)} <small>${esc(i.sub || "")}</small></button>`; }).join("") || `<div class="lp-item muted">Nothing called that</div>`;
};
ACT.noteLink = el => { const n = byId(DB.notes, el.dataset.id); (n.links ||= []).push(el.dataset.k); n.updated = Date.now(); commit(); $("[data-input=noteLinkSearch]")?.focus(); };
ACT.noteUnlink = el => { const n = byId(DB.notes, el.dataset.id); n.links = (n.links || []).filter(k => k !== el.dataset.k); n.updated = Date.now(); commit(); };
document.addEventListener("keydown", e => {
  if (e.target.dataset?.input !== "noteLinkSearch") return;
  if (e.key === "Enter") { e.preventDefault(); $("#noteLinkResults [data-act=noteLink]")?.click(); }
  if (e.key === "Escape") { e.target.value = ""; $("#noteLinkResults").innerHTML = ""; }
});
ACT.notePin = el => { const n = byId(DB.notes, el.dataset.id); n.pinned = !n.pinned; commit(); };
function makeNote(title = "", links = []) {
  const n = { id: uid(), title: title || "Untitled note", body: "", tags: [], links, updated: Date.now() };
  DB.notes.push(n);
  save();
  NOTES.edit = true;
  go("#/note/" + n.id);
}
ACT.newNote = () => makeNote();
ACT.deleteNote = async el => {
  const n = byId(DB.notes, el.dataset.id);
  if (!await ask(`Delete “${n.title}”?`, "You can undo this straight afterwards.")) return;
  withUndo("Note deleted", () => { DB.notes = DB.notes.filter(x => x !== n); });
  go("#/notes");
};
NEW_FROM_LINK.note = { label: "🗒 Note", make: t => makeNote(t) };
