"use strict";
/* ── story ── books → chapters → scenes. A scene has a status, a POV
   character, a setting and an in-world date, and is written in a distraction-
   free view that saves as you type. */

const STATUSES = { idea: ["Idea", "#7c7c92"], outline: ["Outline", "#7ea8f8"], draft: ["Draft", "#e3c27a"], revised: ["Revised", "#b9a6ff"], done: ["Done", "#81b29a"] };
const STORY = { read: false };

// not cached in the index: the index itself lists scenes through this
function allScenes() {
  return DB.books.flatMap(book => (book.chapters || []).flatMap(ch => (ch.scenes || []).map(sc => ({ sc, ch, book }))));
}
const sceneCtx = id => allScenes().find(x => x.sc.id === id) || null;
const bookWords = b => (b.chapters || []).reduce((n, ch) => n + (ch.scenes || []).reduce((m, sc) => m + countWords(sc.body), 0), 0);
const plainLinks = s => String(s || "").replace(LINK_RE, (m, a, b) => (b || a).trim());

linkType("book", {
  list: () => DB.books,
  names: b => [b.title],
  info: b => ({ title: b.title, sub: "Book", icon: "📖", color: "#e3c27a" }),
  href: b => "#/book/" + b.id,
  text: b => b.summary,
});
linkType("sc", {
  list: () => allScenes().map(x => x.sc),
  names: sc => [sc.title],
  info: sc => ({ title: sc.title, sub: "Scene · " + (sceneCtx(sc.id)?.book.title || ""), icon: "✒", color: STATUSES[sc.status]?.[1] }),
  href: sc => "#/sc/" + sc.id,
  text: sc => sc.summary + "\n" + sc.body,
  edges: sc => [sc.pov && ["e", sc.pov, "POV"], sc.setting && ["e", sc.setting, "setting"]].filter(Boolean),
});

TIMELINE_SOURCES.push(() => allScenes().filter(x => x.sc.date).map(({ sc, book }) => ({
  date: sc.date, title: sc.title, href: "#/sc/" + sc.id, icon: "✒", color: STATUSES[sc.status]?.[1], kind: "story",
  ids: [sc.pov, sc.setting, ...mentionsIn(sc.body).filter(m => m.t === "e").map(m => m.it.id)].filter(Boolean), sub: book.title + (sc.summary ? " · " + sc.summary : ""),
})));

ENTITY_PANELS.push(e => {
  const list = allScenes().filter(({ sc }) => sc.pov === e.id || sc.setting === e.id || mentionsIn(sc.body).some(m => m.it === e));
  if (!list.length) return "";
  return `<section class="panel"><div class="panel-h"><h4>In the story</h4></div><ul class="scene-list">${list.map(({ sc, book }) =>
    `<li><a href="#/sc/${sc.id}">✒ ${esc(sc.title)}</a> <small class="muted">${esc(book.title)}${sc.pov === e.id ? " · POV" : ""}${sc.setting === e.id ? " · set here" : ""}</small></li>`).join("")}</ul></section>`;
});
ENTITY_DELETE_HOOKS.push(id => { for (const { sc } of allScenes()) { if (sc.pov === id) sc.pov = ""; if (sc.setting === id) sc.setting = ""; } });

function statusBar(scenes) {
  const n = scenes.length || 1;
  return `<div class="status-bar">${Object.entries(STATUSES).map(([k, [, c]]) => { const m = scenes.filter(s => (s.status || "idea") === k).length; return m ? `<i style="flex:${m / n};background:${c}" title="${m} ${k}"></i>` : ""; }).join("")}</div>`;
}

addRoute("story", "story", () => `<div class="page">
  <div class="page-h"><h2>Story</h2><div class="spacer"></div><button class="btn accent" data-act="newBook">+ Book</button></div>
  <div class="cards books">${DB.books.map(b => {
    const scenes = (b.chapters || []).flatMap(c => c.scenes || []), w = bookWords(b);
    return `<a class="card book-card" href="#/book/${b.id}"><div class="card-b"><b>📖 ${esc(b.title)}</b>
      <small>${plural((b.chapters || []).length, "chapter")} · ${plural(scenes.length, "scene")} · ${w.toLocaleString()} words${b.target ? " of " + (+b.target).toLocaleString() : ""}</small>
      ${b.summary ? `<p>${esc(plainLinks(b.summary))}</p>` : ""}${statusBar(scenes)}</div></a>`;
  }).join("") || empty("No books yet. A book holds chapters, and chapters hold scenes.")}</div></div>`);

addRoute("book", "story", id => {
  const b = byId(DB.books, id);
  if (!b) return `<div class="page">${empty("That book doesn't exist any more.")}</div>`;
  const chs = b.chapters || [];
  return `<div class="page narrow">
    <div class="crumbs"><a href="#/story">Story</a> ›</div>
    <div class="page-h"><h2>📖 ${esc(b.title)}</h2><div class="spacer"></div>
      <a class="btn" href="#/read/${b.id}">Read it all</a>
      <button class="btn" data-act="exportBook" data-id="${b.id}">Export .md</button>
      <button class="btn" data-act="editBook" data-id="${b.id}">Edit</button>
      <button class="btn ghost" data-act="deleteBook" data-id="${b.id}">🗑</button></div>
    ${mdBlock(b.summary)}
    <div class="muted">${bookWords(b).toLocaleString()} words${b.target ? ` of ${(+b.target).toLocaleString()} <progress max="${b.target}" value="${bookWords(b)}"></progress>` : ""}</div>
    ${chs.map((ch, ci) => `<section class="chapter">
      <div class="chapter-h"><h3>${ci + 1}. ${esc(ch.title)}</h3>
        <span class="row-tools"><button class="mini" data-act="moveCh" data-b="${b.id}" data-i="${ci}" data-d="-1" title="Move up">↑</button><button class="mini" data-act="moveCh" data-b="${b.id}" data-i="${ci}" data-d="1" title="Move down">↓</button>
        <button class="mini" data-act="renameCh" data-b="${b.id}" data-i="${ci}" title="Rename">✎</button><button class="mini" data-act="deleteCh" data-b="${b.id}" data-i="${ci}" title="Delete">🗑</button></span></div>
      <ol class="scenes">${(ch.scenes || []).map((sc, si) => {
        const pov = byId(DB.entries, sc.pov), set = byId(DB.entries, sc.setting), st = STATUSES[sc.status || "idea"];
        return `<li><a class="scene-row" href="#/sc/${sc.id}"><span class="status" style="--c:${st[1]}">${st[0]}</span>
          <b>${esc(sc.title)}</b><small>${[pov && "POV " + pov.name, set && set.name, sc.date && fmtDate(sc.date), countWords(sc.body) + " words"].filter(Boolean).map(esc).join(" · ")}</small></a>
          <span class="row-tools"><button class="mini" data-act="moveSc" data-id="${sc.id}" data-d="-1">↑</button><button class="mini" data-act="moveSc" data-id="${sc.id}" data-d="1">↓</button></span></li>`;
      }).join("")}</ol>
      <button class="btn small ghost" data-act="newScene" data-b="${b.id}" data-i="${ci}">+ Scene</button></section>`).join("")}
    <button class="btn" data-act="newChapter" data-id="${b.id}">+ Chapter</button>
  </div>`;
});

/* ── the writing view ── */
addRoute("sc", "story", id => {
  const ctx = sceneCtx(id);
  if (!ctx) return `<div class="page">${empty("That scene doesn't exist any more.")}</div>`;
  const { sc, ch, book } = ctx;
  const flat = allScenes().filter(x => x.book === book), i = flat.findIndex(x => x.sc === sc);
  const prev = flat[i - 1], next = flat[i + 1];
  return [`<div class="page writer ${STORY.read ? "reading" : ""}">
    <div class="crumbs"><a href="#/story">Story</a> › <a href="#/book/${book.id}">${esc(book.title)}</a> › ${esc(ch.title)}</div>
    <input class="scene-title" value="${esc(sc.title)}" data-input="sceneTitle" data-id="${sc.id}" aria-label="Scene title">
    <div class="scene-meta">
      <select data-change="sceneMeta" data-k="status" data-id="${sc.id}">${Object.entries(STATUSES).map(([k, [l]]) => `<option value="${k}" ${k === (sc.status || "idea") ? "selected" : ""}>${l}</option>`).join("")}</select>
      <label>POV <select data-change="sceneMeta" data-k="pov" data-id="${sc.id}">${entryOptions(sc.pov, { kind: "character" })}</select></label>
      <label>Setting <select data-change="sceneMeta" data-k="setting" data-id="${sc.id}">${entryOptions(sc.setting, { kind: "place" })}</select></label>
      <label>When <input data-change="sceneDate" data-id="${sc.id}" value="${esc(fmtDate(sc.date))}" placeholder="in-world date" size="12"></label>
      <label>Target <input type="number" data-change="sceneMeta" data-k="target" data-id="${sc.id}" value="${sc.target || ""}" placeholder="words" style="width:6em"></label>
      <button class="btn small" data-act="toggleRead">${STORY.read ? "✎ Write" : "📖 Read"}</button>
      <button class="btn small ghost" data-act="deleteScene" data-id="${sc.id}" title="Delete scene">🗑</button>
    </div>
    <input class="scene-sum" value="${esc(sc.summary || "")}" placeholder="What happens, in a line" data-input="sceneSummary" data-id="${sc.id}" data-links>
    ${STORY.read ? `<div class="prose manuscript">${md(sc.body) || empty("Nothing written yet.")}</div>`
      : `<textarea class="manuscript-ed" data-input="sceneBody" data-id="${sc.id}" placeholder="Write. [[Name]] links to the codex.">${esc(sc.body || "")}</textarea>`}
    <div class="writer-foot"><span id="wc">${wcText(sc)}</span><span id="saved" class="muted"></span><span class="spacer"></span>
      ${prev ? `<a class="btn small" href="#/sc/${prev.sc.id}">← ${esc(prev.sc.title)}</a>` : ""}
      ${next ? `<a class="btn small" href="#/sc/${next.sc.id}">${esc(next.sc.title)} →</a>` : ""}</div>
  </div>`, main => { const t = $(".manuscript-ed", main); if (t) autoGrow(t); }];
});
function wcText(sc) {
  const n = countWords(sc.body);
  return sc.target ? `${n.toLocaleString()} / ${(+sc.target).toLocaleString()} words <progress max="${sc.target}" value="${n}"></progress>` : `${n.toLocaleString()} words`;
}
function autoGrow(t) { t.style.height = "auto"; t.style.height = Math.max(t.scrollHeight, 320) + "px"; }
let sceneSaveT = null;
function sceneQuietSave(sc) {
  clearTimeout(sceneSaveT);
  $("#saved") && ($("#saved").textContent = "…");
  sceneSaveT = setTimeout(() => { save({ quiet: true }); $("#saved") && ($("#saved").textContent = "Saved"); }, 400);
}
ACT.sceneBody = el => { const sc = sceneCtx(el.dataset.id).sc; sc.body = el.value; autoGrow(el); $("#wc").innerHTML = wcText(sc); sceneQuietSave(sc); };
ACT.sceneTitle = el => { const sc = sceneCtx(el.dataset.id).sc; sc.title = el.value; sceneQuietSave(sc); };
ACT.sceneSummary = el => { const sc = sceneCtx(el.dataset.id).sc; sc.summary = el.value; sceneQuietSave(sc); };
ACT.sceneMeta = el => { const sc = sceneCtx(el.dataset.id).sc; sc[el.dataset.k] = el.value; save({ quiet: true }); if (el.dataset.k === "target") $("#wc").innerHTML = wcText(sc); };
ACT.sceneDate = el => {
  const sc = sceneCtx(el.dataset.id).sc, d = parseDate(el.value);
  if (el.value.trim() && !d) return toast("That isn't a date I can read");
  sc.date = d; el.value = fmtDate(d); save({ quiet: true });
};
ACT.toggleRead = () => { clearTimeout(sceneSaveT); save({ quiet: true }); STORY.read = !STORY.read; rerender(); };

addRoute("read", "story", id => {
  const b = byId(DB.books, id);
  if (!b) return `<div class="page">${empty("That book doesn't exist any more.")}</div>`;
  return `<div class="page narrow reader"><div class="crumbs"><a href="#/book/${b.id}">← ${esc(b.title)}</a></div>
    <h1 class="book-title">${esc(b.title)}</h1>
    ${(b.chapters || []).map((ch, i) => `<h2 class="ch-title">${i + 1}. ${esc(ch.title)}</h2>${(ch.scenes || []).map(sc => `<div class="prose manuscript">${md(sc.body)}</div>`).join(`<p class="scene-break">⁂</p>`)}`).join("")}</div>`;
});

/* ── editing books, chapters, scenes ── */
function bookEditor(b, isNew) {
  modal({ title: isNew ? "New book" : "Edit book",
    body: textField("Title", "title", b.title, "autofocus") + areaField("What it's about", "summary", b.summary, 4) + textField("Word target", "target", b.target || "", `type="number"`),
    buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.title.trim()) { toast("Give it a title"); return false; }
      Object.assign(b, { title: v.title.trim(), summary: v.summary, target: +v.target || 0 });
      if (isNew) DB.books.push(b);
      commit();
      if (isNew) go("#/book/" + b.id);
    } }] });
}
ACT.newBook = () => bookEditor({ id: uid(), title: "", summary: "", chapters: [] }, true);
ACT.editBook = el => bookEditor(byId(DB.books, el.dataset.id), false);
ACT.deleteBook = async el => {
  const b = byId(DB.books, el.dataset.id);
  if (!await ask(`Delete “${b.title}”?`, `All its chapters and scenes (${bookWords(b).toLocaleString()} words) go with it. You can undo this straight afterwards.`)) return;
  withUndo("Book deleted", () => { DB.books = DB.books.filter(x => x !== b); });
  go("#/story");
};
ACT.exportBook = el => {
  const b = byId(DB.books, el.dataset.id);
  const text = `# ${b.title}\n\n` + (b.chapters || []).map((ch, i) => `## ${i + 1}. ${ch.title}\n\n` + (ch.scenes || []).map(sc => plainLinks(sc.body).trim()).filter(Boolean).join("\n\n* * *\n\n")).join("\n\n");
  download(fileSlug(b.title) + ".md", text, "text/markdown");
};
function nameModal(title, value, done) {
  modal({ title, body: textField("Name", "name", value, "autofocus"), buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
    const v = formVals(w).name.trim();
    if (!v) return false;
    done(v); commit();
  } }] });
}
ACT.newChapter = el => { const b = byId(DB.books, el.dataset.id); nameModal("New chapter", "Chapter " + ((b.chapters || []).length + 1), t => (b.chapters ||= []).push({ id: uid(), title: t, scenes: [] })); };
ACT.renameCh = el => { const ch = byId(DB.books, el.dataset.b).chapters[+el.dataset.i]; nameModal("Rename chapter", ch.title, t => { ch.title = t; }); };
ACT.deleteCh = async el => {
  const b = byId(DB.books, el.dataset.b), ch = b.chapters[+el.dataset.i];
  if (!await ask(`Delete “${ch.title}”?`, `Its ${plural((ch.scenes || []).length, "scene")} go with it. You can undo this straight afterwards.`)) return;
  withUndo("Chapter deleted", () => b.chapters.splice(+el.dataset.i, 1));
};
const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };
ACT.moveCh = el => { if (move(byId(DB.books, el.dataset.b).chapters, +el.dataset.i, +el.dataset.d)) commit(); };
ACT.moveSc = el => {
  const { ch, book } = sceneCtx(el.dataset.id), i = ch.scenes.findIndex(s => s.id === el.dataset.id), d = +el.dataset.d;
  if (move(ch.scenes, i, d)) return commit();
  // past the end of a chapter, a scene moves into the next (or previous) one
  const ci = book.chapters.indexOf(ch), to = book.chapters[ci + d];
  if (!to) return;
  const [sc] = ch.scenes.splice(i, 1);
  (to.scenes ||= [])[d > 0 ? "unshift" : "push"](sc);
  commit();
};
ACT.newScene = el => {
  const ch = byId(DB.books, el.dataset.b).chapters[+el.dataset.i];
  nameModal("New scene", "", t => { const sc = { id: uid(), title: t, status: "idea", pov: "", setting: "", date: null, body: "", summary: "" }; (ch.scenes ||= []).push(sc); setTimeout(() => go("#/sc/" + sc.id)); });
};
ACT.deleteScene = async el => {
  const { sc, ch, book } = sceneCtx(el.dataset.id);
  if (!await ask(`Delete “${sc.title}”?`, `${countWords(sc.body).toLocaleString()} words go with it. You can undo this straight afterwards.`)) return;
  withUndo("Scene deleted", () => { ch.scenes = ch.scenes.filter(x => x !== sc); });
  go("#/book/" + book.id);
};
