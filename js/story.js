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

addRoute("story", "story", () => `<div class="page">${storyTabs("story")}
  <div class="page-h"><h2>Books</h2><div class="spacer"></div><button class="btn accent" data-act="newBook">+ Book</button></div>
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
  const chOpts = sel => chs.map((c, i) => `<option value="${i}">→ ${i + 1}. ${esc(c.title)}</option>`).join("");
  return [`<div class="page narrow book-page" data-book="${b.id}">
    <div class="crumbs"><a href="#/story">Story</a> ›</div>
    <div class="page-h"><h2>📖 ${esc(b.title)}</h2><div class="spacer"></div>
      <a class="btn accent" href="#/plan/${b.id}">Plan</a>
      <a class="btn" href="#/read/${b.id}">Read it all</a>
      <button class="btn" data-act="exportBook" data-id="${b.id}">Export…</button>
      <button class="btn" data-act="editBook" data-id="${b.id}">Edit</button>
      <button class="btn ghost" data-act="deleteBook" data-id="${b.id}">🗑</button></div>
    ${mdBlock(b.summary)}
    <div class="muted">${bookWords(b).toLocaleString()} words${b.target ? ` of ${(+b.target).toLocaleString()} <progress max="${b.target}" value="${bookWords(b)}"></progress>` : ""}</div>
    ${chs.length > 1 || chs.some(c => (c.scenes || []).length > 1) ? `<p class="muted small drag-hint">Drag ⠿ to move a chapter or a scene (scenes can go into another chapter), or use “Move to…”.</p>` : ""}
    <div class="chapters">
    ${chs.map((ch, ci) => `<section class="chapter" data-ci="${ci}">
      <div class="chapter-h"><button type="button" class="drag-h" data-drag="ch" aria-label="Drag to move this chapter" title="Drag to move">⠿</button><h3>${ci + 1}. ${esc(ch.title)}</h3>
        <span class="row-tools"><button class="mini" data-act="moveCh" data-b="${b.id}" data-i="${ci}" data-d="-1" title="Move up">↑</button><button class="mini" data-act="moveCh" data-b="${b.id}" data-i="${ci}" data-d="1" title="Move down">↓</button>
        <button class="mini" data-act="renameCh" data-b="${b.id}" data-i="${ci}" title="Edit the title and plan">✎</button><button class="mini" data-act="deleteCh" data-b="${b.id}" data-i="${ci}" title="Delete">🗑</button></span></div>
      ${ch.summary?.trim() ? `<div class="ch-sum prose">${md(ch.summary)}</div>` : ""}
      <ol class="scenes">${(ch.scenes || []).map((sc, si) => {
        const pov = byId(DB.entries, sc.pov), set = byId(DB.entries, sc.setting), st = STATUSES[sc.status || "idea"];
        return `<li data-sid="${sc.id}"><button type="button" class="drag-h" data-drag="sc" aria-label="Drag to move this scene" title="Drag to move">⠿</button><a class="scene-row" href="#/sc/${sc.id}"><span class="status" style="--c:${st[1]}">${st[0]}</span>
          <b>${esc(sc.title)}</b><small>${[pov && "POV " + pov.name, set && set.name, sc.date && fmtDate(sc.date), countWords(sc.body) + " words"].filter(Boolean).map(esc).join(" · ")}</small></a>
          <span class="row-tools"><button class="mini" data-act="moveSc" data-id="${sc.id}" data-d="-1" title="Move up">↑</button><button class="mini" data-act="moveSc" data-id="${sc.id}" data-d="1" title="Move down">↓</button>
            ${chs.length > 1 ? `<select class="sc-move" data-change="scMoveTo" data-id="${sc.id}" title="Move to another chapter" aria-label="Move to another chapter"><option value="">Move to…</option>${chOpts()}</select>` : ""}</span></li>`;
      }).join("")}</ol>
      <button class="btn small ghost" data-act="newScene" data-b="${b.id}" data-i="${ci}">+ Scene</button></section>`).join("")}
    </div>
    <button class="btn" data-act="newChapter" data-id="${b.id}">+ Chapter</button>
    ${notesPanel("book", b.id)}
  </div>`, wireBookDrag];
});

/* ── rearranging by dragging ── the ⠿ handle picks a chapter or a scene up;
   it moves through the page as you drag, and dropping it saves the new
   order. Only the order changes: the chapters and scenes themselves are
   the same objects, put back in their new places. */
function wireBookDrag(main) {
  const page = $(".book-page", main);
  if (!page) return;
  const b = byId(DB.books, page.dataset.book);
  page.addEventListener("pointerdown", e => {
    const h = e.target.closest(".drag-h");
    if (!h || e.button > 0) return;
    e.preventDefault();
    const kind = h.dataset.drag, item = kind === "ch" ? h.closest(".chapter") : h.closest("li");
    const box = $(".chapters", page);
    item.classList.add("dragging");
    if (kind === "ch") page.classList.add("dragging-ch");
    let y = e.clientY, scrollT = null;
    const place = () => {
      if (kind === "ch") {
        const others = $$(".chapter:not(.dragging)", box);
        const before = others.find(c => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
        before ? box.insertBefore(item, before) : box.append(item);
      } else {
        // the chapter under the finger (or the nearest), then the place among its scenes
        const chs = $$(".chapter", box);
        let ch = chs.find(c => { const r = c.getBoundingClientRect(); return y >= r.top && y <= r.bottom; });
        if (!ch) ch = chs.reduce((best, c) => { const r = c.getBoundingClientRect(), d = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom)); return !best || d < best.d ? { c, d } : best; }, null)?.c;
        if (!ch) return;
        const ol = $("ol.scenes", ch), rows = $$("li:not(.dragging)", ol);
        const before = rows.find(li => { const r = li.getBoundingClientRect(); return y < r.top + r.height / 2; });
        before ? ol.insertBefore(item, before) : ol.append(item);
      }
    };
    // near the top or bottom of the screen, keep scrolling while held there
    const edge = () => {
      const zone = 70, v = y < zone ? -(zone - y) / 3 : y > innerHeight - zone ? (y - innerHeight + zone) / 3 : 0;
      if (v) { scrollBy(0, v); place(); }
      scrollT = requestAnimationFrame(edge);
    };
    scrollT = requestAnimationFrame(edge);
    // listened for on the whole page: moving the row through the page would
    // otherwise lose track of the finger
    const move = ev => { if (ev.pointerId === e.pointerId) { ev.preventDefault(); y = ev.clientY; place(); } };
    const up = ev => {
      if (ev.pointerId !== e.pointerId) return;
      cancelAnimationFrame(scrollT);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      item.classList.remove("dragging"); page.classList.remove("dragging-ch");
      applyBookOrder(b, box);
    };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  });
}
// read the order off the page and put the same chapters and scenes in it
function applyBookOrder(b, box) {
  const chs = b.chapters || [], all = chs.flatMap(c => c.scenes || []), byIdSc = new Map(all.map(sc => [sc.id, sc]));
  const sections = $$(".chapter", box);
  const order = sections.map(sec => chs[+sec.dataset.ci]);
  const scenes = sections.map(sec => $$("li[data-sid]", sec).map(li => byIdSc.get(li.dataset.sid)));
  // never lose or double anything: the same chapters, the same scenes, or nothing changes
  const same = order.length === chs.length && new Set(order).size === chs.length && order.every(Boolean)
    && scenes.flat().length === all.length && new Set(scenes.flat()).size === all.length && scenes.flat().every(Boolean);
  if (!same) return rerender();
  const changed = order.some((c, i) => c !== chs[i]) || order.some((c, i) => (c.scenes || []).length !== scenes[i].length || scenes[i].some((sc, j) => c.scenes[j] !== sc));
  if (!changed) return rerender();
  order.forEach((c, i) => { c.scenes = scenes[i]; });
  b.chapters = order;
  commit();
}
ACT.scMoveTo = el => {
  if (el.value === "") return;
  const { ch, book } = sceneCtx(el.dataset.id), to = book.chapters[+el.value];
  if (!to || to === ch) return rerender();
  const i = ch.scenes.findIndex(s => s.id === el.dataset.id);
  const [sc] = ch.scenes.splice(i, 1);
  (to.scenes ||= []).push(sc);
  commit();
  toast(`Moved “${sc.title}” to the end of ${to.title}`);
};

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
    ${chapterPlanHtml(book, ch, sc)}
    ${scenePlanHtml(sc, book)}
    ${STORY.read ? `<div class="prose manuscript">${md(sc.body) || empty("Nothing written yet.")}</div>`
      : `<div class="fmt-host">${fmtBar()}<textarea class="manuscript-ed" data-input="sceneBody" data-id="${sc.id}" placeholder="Write. [[Name]] links to the codex.">${esc(sc.body || "")}</textarea></div>`}
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
// a copy to read or share: a Word document, or plain text. Only reads the book.
ACT.exportBook = el => {
  const b = byId(DB.books, el.dataset.id);
  modal({ title: `Export “${b.title}”`,
    body: `<p class="muted">A copy of the book to read, print or share. Nothing in Moth changes.</p>
      <label class="check"><input type="radio" name="fmt" value="docx" checked> <span><b>Word document (.docx)</b>: opens in Word, Pages, Google Docs or LibreOffice. A title page, each chapter on a new page, scenes separated by ⁂.</span></label>
      <label class="check"><input type="radio" name="fmt" value="md"> <span><b>Plain text (.md)</b>: the words only, for any text editor.</span></label>
      <label class="check"><input type="checkbox" name="summaries"> Put each scene's title and one-line summary above it (a working draft rather than a manuscript)</label>`,
    buttons: [{ label: "Cancel" }, { label: "Export", cls: "accent", act: w => {
      const v = formVals(w);
      if (v.fmt === "docx") return void exportBookDocx(b, { summaries: v.summaries });
      const text = `# ${b.title}\n\n` + (b.chapters || []).map((ch, i) => `## ${i + 1}. ${ch.title}\n\n` + (v.summaries && ch.summary?.trim() ? plainLinks(ch.summary).trim() + "\n\n* * *\n\n" : "") + (ch.scenes || []).map(sc => (v.summaries ? `### ${sc.title}\n\n${sc.summary ? "_" + plainLinks(sc.summary) + "_\n\n" : ""}` : "") + plainLinks(sc.body).trim()).filter(Boolean).join("\n\n* * *\n\n")).join("\n\n");
      download(fileSlug(b.title) + ".md", text, "text/markdown");
    } }] });
};
function nameModal(title, value, done) {
  modal({ title, body: textField("Name", "name", value, "autofocus"), buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
    const v = formVals(w).name.trim();
    if (!v) return false;
    done(v); commit();
  } }] });
}
// a chapter's title and its plan: what happens in it, to look at while writing it
function chapterEditor(b, ch, isNew) {
  modal({ title: isNew ? "New chapter" : "Edit chapter", wide: true,
    body: `${textField("Title", "title", ch.title, "autofocus")}
      ${areaField("Summary or plan: what happens in this chapter (shown above each of its scenes while you write; [[links]] work)", "summary", ch.summary || "", 8, `data-links placeholder="- Lilyon finds the petal\n- The inspector arrives\n- …"`)}`,
    buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.title.trim()) { toast("Give it a title"); return false; }
      ch.title = v.title.trim();
      if (v.summary.trim() || ch.summary) ch.summary = v.summary;
      if (isNew) (b.chapters ||= []).push(ch);
      commit();
    } }] });
}
ACT.newChapter = el => { const b = byId(DB.books, el.dataset.id); chapterEditor(b, { id: uid(), title: "Chapter " + ((b.chapters || []).length + 1), summary: "", scenes: [] }, true); };
ACT.renameCh = el => { const b = byId(DB.books, el.dataset.b); chapterEditor(b, b.chapters[+el.dataset.i], false); };
ACT.editChPlan = el => { const { ch, book } = sceneCtx(el.dataset.sc); chapterEditor(book, ch, false); };
// the chapter's plan above the scene being written, folded away if you like
function chapterPlanHtml(book, ch, sc) {
  const has = ch.summary?.trim();
  return `<details class="ch-plan" ${has && STORY.chPlan !== false ? "open" : ""}>
    <summary>Chapter plan: ${esc(ch.title)}${has ? "" : ` <small class="muted">(none yet)</small>`}</summary>
    ${has ? `<div class="prose">${md(ch.summary)}</div>` : `<p class="muted small">Write what happens in this chapter, to keep in view while you write its scenes.</p>`}
    <button class="btn small ghost" data-act="editChPlan" data-sc="${sc.id}">${has ? "✎ Edit the plan" : "+ Write the chapter's plan"}</button>
  </details>`;
}
document.addEventListener("toggle", e => { if (e.target.matches?.(".ch-plan") && e.target.querySelector(".prose")) STORY.chPlan = e.target.open; }, true);
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
