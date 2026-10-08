"use strict";
/* ── notes ── loose notes: ideas, rules, questions for later. They link and
   are linked like everything else. */

const NOTES = { q: "", edit: false };

linkType("n", {
  list: () => DB.notes,
  names: n => [n.title],
  info: n => ({ title: n.title, sub: "Note", icon: "🗒", color: "#a3a3b8" }),
  href: n => "#/note/" + n.id,
  text: n => n.body,
});

addRoute("notes", "notes", () => {
  const q = norm(NOTES.q);
  const list = DB.notes.filter(n => !q || norm(n.title + " " + n.body + " " + (n.tags || []).join(" ")).includes(q))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || 0) - (a.updated || 0));
  return `<div class="page"><div class="page-h"><h2>Notes</h2><div class="spacer"></div>${searchBox("notesFilter", NOTES.q, "Search notes…")}
    <button class="btn accent" data-act="newNote">+ Note</button></div>
    <div class="cards notes">${list.map(n => `<a class="card note-card" href="#/note/${n.id}"><div class="card-b"><b>${n.pinned ? "📌 " : ""}${esc(n.title)}</b>
      <small>${n.updated ? new Date(n.updated).toLocaleDateString() : ""}</small><p>${esc(plainLinks(n.body).slice(0, 220))}</p><div class="tags">${tagsHtml(n.tags)}</div></div></a>`).join("") || empty("No notes yet.")}</div></div>`;
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
ACT.notePin = el => { const n = byId(DB.notes, el.dataset.id); n.pinned = !n.pinned; commit(); };
function makeNote(title = "") {
  const n = { id: uid(), title: title || "Untitled note", body: "", tags: [], updated: Date.now() };
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
NEW_FROM_LINK.note = { label: "🗒 Note", make: makeNote };
