"use strict";
/* ── plotting ── the planning side of the story:
   - threads: arcs and plot lines (the main plot, subplots, character arcs,
     relationships, mysteries…), each with beats that can be tied to scenes;
   - themes: what the story is about underneath, with its question, its
     answer, and the motifs and symbols that carry it;
   - structure: a book follows a template (three acts, Save the Cat, the
     hero's journey…) or beats of its own; scenes are placed on its beats;
   - setups and payoffs: what's planted, and where it's paid off (or not yet).
   Scenes carry the planning: goal, conflict, outcome, tension, which threads
   and themes they move, which beat they are, and the world events they show.
   The book's plan page draws it all together: the structure, a tension
   curve, the plot grid (scenes against threads) and the setups. */

const THREAD_KINDS = {
  main: ["Main plot", "🜲"], sub: ["Subplot", "〰"], character: ["Character arc", "👤"], relationship: ["Relationship", "💞"],
  mystery: ["Mystery", "❓"], conflict: ["Conflict / war", "⚔"], quest: ["Quest / journey", "🧭"], other: ["Other", "◆"],
};
// what each kind of thread asks of you
const ARC_FIELDS = {
  character: [["want", "Wants"], ["need", "Needs (but doesn't know it)"], ["lie", "The lie they believe"], ["truth", "The truth they learn"], ["from", "Starts as"], ["to", "Ends as"]],
  relationship: [["from", "Where they start"], ["obstacle", "What keeps them apart"], ["to", "Where they end up"]],
  mystery: [["question", "The question"], ["answer", "The answer (secret)"], ["clues", "Clues and red herrings"]],
  conflict: [["sides", "Who against whom"], ["stakes", "What's at stake"], ["outcome", "How it ends"]],
  quest: [["goal", "The goal"], ["obstacle", "What stands in the way"], ["outcome", "How it ends"]],
  main: [["question", "The dramatic question"], ["stakes", "What's at stake"], ["outcome", "How it ends"]],
  sub: [["question", "What it's about"], ["stakes", "Why it matters"], ["outcome", "How it ends"]],
  other: [["question", "What it's about"], ["outcome", "How it ends"]],
};
const THREAD_STATES = { planned: "Planned", open: "Running", resolved: "Resolved", dropped: "Dropped" };

// [name, act, where in the book it usually falls (0…1), what it is]
const STRUCTURES = {
  three: ["Three acts", [
    ["Hook", "Act I", .01, "The opening image or moment that pulls the reader in."], ["Inciting incident", "Act I", .1, "Something happens that the story can't come back from."],
    ["First plot point", "Act I", .25, "The hero commits; the world of Act II opens."], ["Rising action", "Act II", .37, "Trials, allies, enemies; the stakes climb."],
    ["Midpoint", "Act II", .5, "A reversal or revelation: the hero goes from reacting to acting."], ["Crisis", "Act II", .65, "Things close in; plans fail."],
    ["Second plot point", "Act II", .75, "The lowest point, and the last piece the hero needs."], ["Climax", "Act III", .9, "The final confrontation; the dramatic question is answered."],
    ["Resolution", "Act III", .98, "The new normal."]]],
  cat: ["Save the Cat", [
    ["Opening image", "Act I", .01, "A snapshot of the hero's world before."], ["Theme stated", "Act I", .05, "Someone says what the story is about; the hero doesn't get it yet."],
    ["Set-up", "Act I", .06, "The hero's world, flaws, and what's missing."], ["Catalyst", "Act I", .1, "The life-changing event."],
    ["Debate", "Act I", .15, "Should I? The hero hesitates."], ["Break into two", "Act II", .2, "The hero chooses, and enters the upside-down world."],
    ["B story", "Act II", .22, "A new relationship that carries the theme."], ["Fun and games", "Act II", .3, "The promise of the premise."],
    ["Midpoint", "Act II", .5, "False victory or false defeat; the stakes rise."], ["Bad guys close in", "Act II", .6, "Doubt and enemies, inside and out."],
    ["All is lost", "Act II", .75, "The opposite of the midpoint; a whiff of death."], ["Dark night of the soul", "Act II", .8, "The hero wallows, then understands."],
    ["Break into three", "Act III", .8, "The solution, thanks to the B story."], ["Finale", "Act III", .9, "The hero proves they've changed."],
    ["Final image", "Act III", .99, "The opposite of the opening image."]]],
  hero: ["The hero's journey", [
    ["Ordinary world", "Departure", .02, "Who the hero is before."], ["Call to adventure", "Departure", .08, "A problem or challenge appears."],
    ["Refusal of the call", "Departure", .12, "Fear or duty holds them back."], ["Meeting the mentor", "Departure", .17, "Advice, a gift, courage."],
    ["Crossing the threshold", "Departure", .25, "Into the special world."], ["Tests, allies, enemies", "Initiation", .35, "Learning the rules of the new world."],
    ["Approach to the inmost cave", "Initiation", .45, "Preparing for the great ordeal."], ["The ordeal", "Initiation", .55, "Facing the greatest fear; a death and rebirth."],
    ["The reward", "Initiation", .65, "Seizing the sword."], ["The road back", "Return", .75, "The cost of going home."],
    ["Resurrection", "Return", .9, "A final test, using everything learned."], ["Return with the elixir", "Return", .98, "Home, changed, with something for others."]]],
  seven: ["Seven-point structure", [
    ["Hook", "", .02, "The hero's starting state, the opposite of the resolution."], ["Plot turn 1", "", .2, "The call that sets things moving."],
    ["Pinch 1", "", .35, "Pressure: the antagonist shows their strength."], ["Midpoint", "", .5, "The hero moves from reacting to acting."],
    ["Pinch 2", "", .65, "Worse pressure; something is lost."], ["Plot turn 2", "", .8, "The hero gets the last thing they need."],
    ["Resolution", "", .97, "The climax and its outcome."]]],
  freytag: ["Freytag's pyramid", [
    ["Exposition", "", .05, "The world and people as they are."], ["Rising action", "", .3, "Complications build."], ["Climax", "", .5, "The turning point."],
    ["Falling action", "", .75, "Consequences unravel."], ["Dénouement", "", .95, "Things settle."]]],
  kisho: ["Kishōtenketsu", [
    ["Ki: introduction", "", .1, "The people and the setting."], ["Shō: development", "", .35, "Things deepen, without conflict needed."],
    ["Ten: twist", "", .65, "Something unexpected recasts it all."], ["Ketsu: reconciliation", "", .92, "The parts come together in a new light."]]],
  fichte: ["Fichtean curve", [
    ["Crisis 1", "", .1, "Straight into trouble."], ["Crisis 2", "", .3, "Worse."], ["Crisis 3", "", .5, "Worse still."], ["Crisis 4", "", .7, "Everything at once."],
    ["Climax", "", .85, "The final crisis."], ["Falling action", "", .96, "Brief aftermath."]]],
  custom: ["My own beats", []],
};
// a book's beats: a template's, or its own list
function bookBeats(b) {
  if (b.structure === "custom") return (b.beatsOwn || []).map((x, i) => ({ id: x.id, name: x.name, act: x.act || "", at: x.at ?? (i + .5) / Math.max(1, b.beatsOwn.length), hint: "" }));
  const s = STRUCTURES[b.structure];
  return s ? s[1].map(([name, act, at, hint]) => ({ id: b.structure + ":" + fileSlug(name), name, act, at, hint })) : [];
}
const bookScenes = b => (b.chapters || []).flatMap(ch => (ch.scenes || []).map(sc => ({ sc, ch })));
const bookOf = sc => sceneCtx(sc.id)?.book;

/* ── links: threads and themes can be [[linked]], noted, found ── */
linkType("thread", {
  list: () => DB.threads,
  names: t => [t.name],
  info: t => ({ title: t.name, sub: THREAD_KINDS[t.kind]?.[0] || "Thread", icon: THREAD_KINDS[t.kind]?.[1] || "〰", color: t.color || "#b9a6ff" }),
  href: t => "#/thread/" + t.id,
  text: t => [t.summary, ...Object.values(t.arc || {}), ...(t.beats || []).map(x => x.text)].join("\n"),
  edges: t => [t.character && ["e", t.character, "arc"], ...(t.people || []).map(id => ["e", id, "in the thread"]), ...(t.themes || []).map(id => ["theme", id, "carries"])].filter(Boolean),
});
linkType("theme", {
  list: () => DB.themes,
  names: t => [t.name],
  info: t => ({ title: t.name, sub: "Theme", icon: "❦", color: t.color || "#e3c27a" }),
  href: t => "#/theme/" + t.id,
  text: t => [t.question, t.statement, t.counter, t.motifs, t.notes].join("\n"),
  edges: t => (t.symbols || []).map(id => ["e", id, "symbol of"]),
});
// scenes link to what they move
const sceneLinks = sc => [...(sc.threads || []).map(id => ["thread", id, "moves"]), ...(sc.themes || []).map(id => ["theme", id, "touches"]), ...(sc.events || []).map(id => ["ev", id, "shows"])];
{
  const s = LINK_TYPES.sc, old = s.edges;
  s.edges = sc => [...old(sc), ...sceneLinks(sc)];
  s.text = sc => [sc.summary, sc.body, sc.goal, sc.conflict, sc.outcome].join("\n");
}

ENTITY_DELETE_HOOKS.push(id => {
  for (const t of DB.threads) { if (t.character === id) t.character = ""; t.people = (t.people || []).filter(x => x !== id); }
  for (const t of DB.themes) t.symbols = (t.symbols || []).filter(x => x !== id);
});
// a character's arcs, on their codex page
ENTITY_PANELS.push(e => {
  const list = DB.threads.filter(t => t.character === e.id || (t.people || []).includes(e.id));
  if (!list.length) return "";
  return `<section class="panel"><div class="panel-h"><h4>Arcs and threads</h4></div><div class="chips">${list.map(t => chip("thread", t, ` <small>${esc(threadProgress(t))}</small>`)).join("")}</div></section>`;
});

/* ── the story's tabs ── */
const storyTabs = on => `<div class="subtabs">${[["story", "Books"], ["arcs", "Arcs & threads"], ["themes", "Themes"], ["setups", "Setups & payoffs"]]
  .map(([k, l]) => `<a class="${on === k ? "on" : ""}" href="#/${k}">${l}</a>`).join("")}</div>`;
const threadScenes = t => allScenes().filter(x => (x.sc.threads || []).includes(t.id));
function threadProgress(t) {
  const n = (t.beats || []).length, d = (t.beats || []).filter(b => b.done).length;
  return [THREAD_STATES[t.state || "planned"], n ? `${d}/${n} beats` : ""].filter(Boolean).join(" · ");
}

addRoute("arcs", "story", () => {
  const groups = Object.entries(THREAD_KINDS).map(([k, [name, icon]]) => [k, name, icon, DB.threads.filter(t => (t.kind || "other") === k)]).filter(g => g[3].length);
  return `<div class="page">${storyTabs("arcs")}
    <div class="page-h"><h2>Arcs & threads</h2><div class="spacer"></div><button class="btn accent" data-act="newThread">+ Thread</button></div>
    <p class="muted">Every line the story follows: the main plot, subplots, each character's change, relationships, mysteries. Give each its beats, then mark which scenes move it.</p>
    ${groups.map(([k, name, icon, list]) => `<h3 class="codex-group" style="--c:var(--ink)"><span>${icon} ${esc(name)}</span> <small>${list.length}</small></h3>
      <div class="cards">${list.map(threadCard).join("")}</div>`).join("") || empty("No threads yet. Start with the main plot, then each main character's arc.")}
  </div>`;
});
function threadCard(t) {
  const sc = threadScenes(t).length, beats = t.beats || [], done = beats.filter(b => b.done).length, ch = byId(DB.entries, t.character);
  return `<a class="card thread-card" href="#/thread/${t.id}" style="--c:${t.color || "#b9a6ff"}"><div class="card-b">
    <b>${THREAD_KINDS[t.kind]?.[1] || "〰"} ${esc(t.name)}</b>
    <small>${esc(THREAD_STATES[t.state || "planned"])}${ch ? " · " + esc(ch.name) : ""} · ${plural(sc, "scene")}</small>
    ${t.summary ? `<p>${esc(plainLinks(t.summary))}</p>` : ""}
    ${beats.length ? `<div class="beat-meter" title="${done} of ${beats.length} beats written"><i style="width:${done / beats.length * 100}%"></i></div>` : ""}</div></a>`;
}

addRoute("thread", "story", id => {
  const t = byId(DB.threads, id);
  if (!t) return `<div class="page">${empty("That thread doesn't exist any more.")}</div>`;
  const ch = byId(DB.entries, t.character), scenes = threadScenes(t);
  const arc = (ARC_FIELDS[t.kind || "other"] || []).filter(([k]) => t.arc?.[k]);
  const scOpts = sel => `<option value="">— no scene yet —</option>${DB.books.map(b => `<optgroup label="${esc(b.title)}">${bookScenes(b).map(({ sc, ch }) => `<option value="${sc.id}" ${sc.id === sel ? "selected" : ""}>${esc(ch.title)} · ${esc(sc.title)}</option>`).join("")}</optgroup>`).join("")}`;
  return `<div class="page narrow">
    <div class="crumbs"><a href="#/arcs">Arcs & threads</a> ›</div>
    <div class="page-h"><div><div class="kind-line" style="color:${t.color || "#b9a6ff"}">${THREAD_KINDS[t.kind]?.[1] || "〰"} ${esc(THREAD_KINDS[t.kind]?.[0] || "Thread")} · ${esc(THREAD_STATES[t.state || "planned"])}</div><h2>${esc(t.name)}</h2></div><div class="spacer"></div>
      <button class="btn" data-act="editThread" data-id="${t.id}">Edit</button><button class="btn ghost" data-act="deleteThread" data-id="${t.id}">🗑</button></div>
    ${ch || (t.people || []).length ? `<div class="chips">${chip("e", ch, " <small>whose arc</small>")}${(t.people || []).map(p => chip("e", byId(DB.entries, p))).join("")}</div>` : ""}
    ${mdBlock(t.summary)}
    ${arc.length ? `<div class="kvs arc-kvs">${arc.map(([k, l]) => `<div class="kv"><span>${esc(l)}</span><div>${inline(t.arc[k])}</div></div>`).join("")}</div>` : ""}
    ${(t.themes || []).length ? `<div class="kv"><span>Themes</span><div class="chips">${t.themes.map(x => chip("theme", byId(DB.themes, x))).join("")}</div></div>` : ""}
    <section class="panel"><div class="panel-h"><h4>Beats</h4><small class="muted">the steps this thread goes through, in order</small></div>
      <ol class="beats">${(t.beats || []).map((b, i) => `<li class="${b.done ? "done" : ""}">
        <label class="check"><input type="checkbox" data-change="beatDone" data-t="${t.id}" data-i="${i}" ${b.done ? "checked" : ""} title="Written"></label>
        <input class="beat-text" value="${esc(b.text)}" data-change="beatText" data-t="${t.id}" data-i="${i}" placeholder="What happens">
        <select data-change="beatScene" data-t="${t.id}" data-i="${i}" title="The scene where it happens">${scOpts(b.scene)}</select>
        <span class="row-tools"><button class="mini" data-act="beatMove" data-t="${t.id}" data-i="${i}" data-d="-1">↑</button><button class="mini" data-act="beatMove" data-t="${t.id}" data-i="${i}" data-d="1">↓</button><button class="mini" data-act="beatDel" data-t="${t.id}" data-i="${i}">✕</button></span></li>`).join("")}</ol>
      <div class="beat-add"><input name="text" placeholder="+ a beat (Enter)" data-t="${t.id}"><button class="btn small" data-act="beatAdd" data-t="${t.id}">Add</button></div></section>
    <section class="panel"><div class="panel-h"><h4>Scenes that move it</h4><small class="muted">in reading order; mark scenes in their Planning, or on a book's plot grid</small></div>
      ${scenes.length ? `<ol class="thread-read">${scenes.map(({ sc, ch, book }) => `<li><a href="#/sc/${sc.id}">✒ ${esc(sc.title)}</a> <small class="muted">${esc(book.title)} · ${esc(ch.title)}</small>${sc.summary ? `<div class="muted">${inline(sc.summary)}</div>` : ""}</li>`).join("")}</ol>` : `<p class="muted">None yet.</p>`}</section>
    ${notesPanel("thread", t.id)}
  </div>`;
});

function threadEditor(t, isNew) {
  const kindSel = `<select name="kind" data-change="threadKindPick">${Object.entries(THREAD_KINDS).map(([k, [n, i]]) => `<option value="${k}" ${k === (t.kind || "main") ? "selected" : ""}>${i} ${n}</option>`).join("")}</select>`;
  const arcBox = kind => (ARC_FIELDS[kind] || []).map(([k, l]) => areaField(l, "arc_" + k, t.arc?.[k] || "", 2, "data-links")).join("");
  modal({ title: isNew ? "New thread" : "Edit thread",
    body: `<div class="row2">${textField("Name", "name", t.name, `autofocus placeholder="e.g. Lilyon learns to trust"`)}${field("Kind", kindSel)}</div>
      <div class="row2">${field("Whose arc", `<select name="character">${entryOptions(t.character, { blank: "—", kind: "character" })}</select>`)}
        ${field("State", `<select name="state">${Object.entries(THREAD_STATES).map(([k, l]) => `<option value="${k}" ${k === (t.state || "planned") ? "selected" : ""}>${l}</option>`).join("")}</select>`)}</div>
      ${areaField("In short", "summary", t.summary || "", 3, "data-links")}
      <div class="arc-box">${arcBox(t.kind || "main")}</div>
      ${multiPick("Others in it", "people", t.people || [])}
      ${DB.themes.length ? field("Themes it carries", `<div class="chips">${DB.themes.map(x => `<label class="check chip-check"><input type="checkbox" name="th_${x.id}" ${(t.themes || []).includes(x.id) ? "checked" : ""}> ${esc(x.name)}</label>`).join("")}</div>`) : ""}
      ${colorField("Colour", "color", t.color)}`,
    buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.name.trim()) { toast("Give it a name"); return false; }
      t.name = v.name.trim(); t.kind = v.kind; t.character = v.character; t.state = v.state; t.summary = v.summary; t.color = v.color;
      t.people = multiVals(v.people);
      t.arc = {};
      for (const [k] of ARC_FIELDS[t.kind] || []) if (v["arc_" + k]?.trim()) t.arc[k] = v["arc_" + k].trim();
      t.themes = DB.themes.filter(x => v["th_" + x.id]).map(x => x.id);
      if (isNew) DB.threads.push(t);
      commit();
      if (isNew) go("#/thread/" + t.id);
    } }] });
  // the questions change with the kind of thread
  ACT.threadKindPick = el => { const box = $(".arc-box", el.closest(".modal")); if (box) box.innerHTML = arcBox(el.value); };
}
ACT.newThread = el => threadEditor({ id: uid(), name: "", kind: el?.dataset?.kind || "main", state: "planned", summary: "", beats: [], color: "" }, true);
ACT.editThread = el => threadEditor(byId(DB.threads, el.dataset.id), false);
ACT.deleteThread = async el => {
  const t = byId(DB.threads, el.dataset.id);
  if (!await ask(`Delete “${t.name}”?`, "Its beats go with it; scenes stay as they are. You can undo this straight afterwards.")) return;
  withUndo("Thread deleted", () => { DB.threads = DB.threads.filter(x => x !== t); for (const { sc } of allScenes()) if (sc.threads) sc.threads = sc.threads.filter(x => x !== t.id); });
  go("#/arcs");
};
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches?.(".beat-add input")) { e.preventDefault(); ACT.beatAdd(e.target); } });
const beatOf = el => byId(DB.threads, el.dataset.t).beats[+el.dataset.i];
ACT.beatAdd = el => {
  const t = byId(DB.threads, el.dataset.t), inp = $("[name=text]", el.closest(".beat-add")), text = inp.value.trim();
  if (!text) return;
  (t.beats ||= []).push({ id: uid(), text, scene: "", done: false });
  commit();
  setTimeout(() => $(".beat-add [name=text]")?.focus());
};
ACT.beatText = el => { beatOf(el).text = el.value; save({ quiet: true }); };
ACT.beatDone = el => { beatOf(el).done = el.checked; commit(); };
ACT.beatScene = el => { beatOf(el).scene = el.value; commit(); };
ACT.beatDel = el => { const t = byId(DB.threads, el.dataset.t); withUndo("Beat removed", () => t.beats.splice(+el.dataset.i, 1)); };
ACT.beatMove = el => { if (move(byId(DB.threads, el.dataset.t).beats, +el.dataset.i, +el.dataset.d)) commit(); };

/* ── themes ── */
addRoute("themes", "story", () => `<div class="page">${storyTabs("themes")}
  <div class="page-h"><h2>Themes</h2><div class="spacer"></div><button class="btn accent" data-act="newTheme">+ Theme</button></div>
  <p class="muted">What the story is about underneath: the question it asks, what it answers, and the motifs and symbols that carry it.</p>
  <div class="cards">${DB.themes.map(t => {
    const n = allScenes().filter(x => (x.sc.themes || []).includes(t.id)).length;
    return `<a class="card" href="#/theme/${t.id}" style="--c:${t.color || "#e3c27a"}"><div class="card-b"><b>❦ ${esc(t.name)}</b><small>${plural(n, "scene")}</small>
      ${t.question ? `<p>${esc(plainLinks(t.question))}</p>` : ""}</div></a>`;
  }).join("") || empty("No themes yet. Try one as a question: “Can you belong to two places?”")}</div></div>`);

addRoute("theme", "story", id => {
  const t = byId(DB.themes, id);
  if (!t) return `<div class="page">${empty("That theme doesn't exist any more.")}</div>`;
  const scenes = allScenes().filter(x => (x.sc.themes || []).includes(t.id)), threads = DB.threads.filter(x => (x.themes || []).includes(t.id));
  const kv = (l, v) => v ? `<div class="kv"><span>${l}</span><div class="prose">${md(v)}</div></div>` : "";
  return `<div class="page narrow">
    <div class="crumbs"><a href="#/themes">Themes</a> ›</div>
    <div class="page-h"><div><div class="kind-line" style="color:${t.color || "#e3c27a"}">❦ Theme</div><h2>${esc(t.name)}</h2></div><div class="spacer"></div>
      <button class="btn" data-act="editTheme" data-id="${t.id}">Edit</button><button class="btn ghost" data-act="deleteTheme" data-id="${t.id}">🗑</button></div>
    <div class="kvs">${kv("The question", t.question)}${kv("What the story says", t.statement)}${kv("The other side", t.counter)}${kv("Motifs and images", t.motifs)}${kv("Notes", t.notes)}</div>
    ${(t.symbols || []).length ? `<div class="kv"><span>Symbols</span><div class="chips">${t.symbols.map(x => chip("e", byId(DB.entries, x))).join("")}</div></div>` : ""}
    ${threads.length ? `<section class="panel"><div class="panel-h"><h4>Threads that carry it</h4></div><div class="chips">${threads.map(x => chip("thread", x)).join("")}</div></section>` : ""}
    <section class="panel"><div class="panel-h"><h4>Scenes that touch it</h4></div>
      ${scenes.length ? `<ol class="thread-read">${scenes.map(({ sc, ch, book }) => `<li><a href="#/sc/${sc.id}">✒ ${esc(sc.title)}</a> <small class="muted">${esc(book.title)} · ${esc(ch.title)}</small></li>`).join("")}</ol>` : `<p class="muted">None yet. Mark them in a scene's Planning, or on a book's plot grid.</p>`}</section>
    ${notesPanel("theme", t.id)}</div>`;
});
function themeEditor(t, isNew) {
  modal({ title: isNew ? "New theme" : "Edit theme",
    body: `${textField("Name", "name", t.name, `autofocus placeholder="e.g. Belonging"`)}
      ${areaField("The question it asks", "question", t.question || "", 2, "data-links")}
      ${areaField("What the story says", "statement", t.statement || "", 2, "data-links")}
      ${areaField("The other side (what argues against it)", "counter", t.counter || "", 2, "data-links")}
      ${areaField("Motifs and recurring images", "motifs", t.motifs || "", 3, "data-links")}
      ${multiPick("Symbols in the codex", "symbols", t.symbols || [])}
      ${areaField("Notes", "notes", t.notes || "", 3, "data-links")}${colorField("Colour", "color", t.color)}`,
    buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.name.trim()) { toast("Give it a name"); return false; }
      Object.assign(t, { name: v.name.trim(), question: v.question, statement: v.statement, counter: v.counter, motifs: v.motifs, notes: v.notes, color: v.color, symbols: multiVals(v.symbols) });
      if (isNew) DB.themes.push(t);
      commit();
      if (isNew) go("#/theme/" + t.id);
    } }] });
}
ACT.newTheme = () => themeEditor({ id: uid(), name: "" }, true);
ACT.editTheme = el => themeEditor(byId(DB.themes, el.dataset.id), false);
ACT.deleteTheme = async el => {
  const t = byId(DB.themes, el.dataset.id);
  if (!await ask(`Delete “${t.name}”?`, "Scenes and threads stay as they are. You can undo this straight afterwards.")) return;
  withUndo("Theme deleted", () => {
    DB.themes = DB.themes.filter(x => x !== t);
    for (const { sc } of allScenes()) if (sc.themes) sc.themes = sc.themes.filter(x => x !== t.id);
    for (const th of DB.threads) if (th.themes) th.themes = th.themes.filter(x => x !== t.id);
  });
  go("#/themes");
};

/* ── setups and payoffs ── */
const sceneLabel = id => { const c = sceneCtx(id); return c ? `<a href="#/sc/${id}">✒ ${esc(c.sc.title)}</a> <small class="muted">${esc(c.ch.title)}</small>` : ""; };
function setupsHtml(list) {
  if (!list.length) return `<p class="muted">Nothing planted yet. A setup is anything the reader should remember later: Chekhov's gun, a prophecy, a scar, a promise.</p>`;
  return `<ul class="setups">${list.map(s => `<li class="${s.payoff ? "" : "open"}">
    <div class="su-text"><b>${inline(s.text)}</b><span class="row-tools"><button class="mini" data-act="editSetup" data-id="${s.id}">✎</button><button class="mini" data-act="deleteSetup" data-id="${s.id}">✕</button></span></div>
    <div class="su-path"><span>Planted: ${sceneLabel(s.setup) || `<i class="muted">not placed yet</i>`}</span><span>→</span>
      <span>${s.payoff ? "Paid off: " + sceneLabel(s.payoff) : `<span class="warn">⚠ not paid off yet</span>`}</span></div></li>`).join("")}</ul>`;
}
addRoute("setups", "story", () => {
  const open = DB.setups.filter(s => !s.payoff).length;
  return `<div class="page narrow">${storyTabs("setups")}
    <div class="page-h"><h2>Setups & payoffs</h2><div class="spacer"></div><button class="btn accent" data-act="newSetup">+ Setup</button></div>
    ${open ? `<p class="muted">${plural(open, "setup")} still waiting for a payoff.</p>` : ""}
    ${setupsHtml(DB.setups)}</div>`;
});
function sceneOptions(sel, blank) {
  return `<option value="">${blank}</option>${DB.books.map(b => `<optgroup label="${esc(b.title)}">${bookScenes(b).map(({ sc, ch }) => `<option value="${sc.id}" ${sc.id === sel ? "selected" : ""}>${esc(ch.title)} · ${esc(sc.title)}</option>`).join("")}</optgroup>`).join("")}`;
}
function setupEditor(s, isNew) {
  modal({ title: isNew ? "New setup" : "Edit setup",
    body: `${textField("What's planted", "text", s.text, `autofocus placeholder="e.g. The locket that won't open" data-links`)}
      <div class="row2">${field("Planted in", `<select name="setup">${sceneOptions(s.setup, "— not placed yet —")}</select>`)}${field("Paid off in", `<select name="payoff">${sceneOptions(s.payoff, "— not yet —")}</select>`)}</div>`,
    buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.text.trim()) { toast("Say what's planted"); return false; }
      Object.assign(s, { text: v.text.trim(), setup: v.setup, payoff: v.payoff });
      if (isNew) DB.setups.push(s);
      commit();
    } }] });
}
ACT.newSetup = el => setupEditor({ id: uid(), text: "", setup: el?.dataset?.sc || "", payoff: "" }, true);
ACT.editSetup = el => setupEditor(byId(DB.setups, el.dataset.id), false);
ACT.deleteSetup = el => withUndo("Setup removed", () => { DB.setups = DB.setups.filter(s => s.id !== el.dataset.id); });

/* ── a book's plan: structure, tension, the plot grid, setups ── */
addRoute("plan", "story", id => {
  const b = byId(DB.books, id);
  if (!b) return `<div class="page">${empty("That book doesn't exist any more.")}</div>`;
  const scs = bookScenes(b), beats = bookBeats(b), n = scs.length;
  const pos = new Map(scs.map(({ sc }, i) => [sc.id, n ? (i + .5) / n : 0]));
  // structure, act by act
  const acts = [...new Set(beats.map(x => x.act))];
  const structure = `<section class="panel"><div class="panel-h"><h4>Structure</h4>
      <select data-change="bookStructure" data-id="${b.id}"><option value="">— none —</option>${Object.entries(STRUCTURES).map(([k, [l]]) => `<option value="${k}" ${k === b.structure ? "selected" : ""}>${l}</option>`).join("")}</select>
      ${b.structure === "custom" ? `<button class="btn small" data-act="ownBeat" data-id="${b.id}">+ Beat</button>` : ""}</div>
    ${!b.structure ? `<p class="muted">Pick a structure to lay the book's beats out, then put scenes on them (in a scene's Planning). Or make your own beats.</p>` : ""}
    <div class="acts">${acts.map(a => `<div class="act">${a ? `<h5>${esc(a)}</h5>` : ""}${beats.filter(x => x.act === a).map(x => {
      const on = scs.filter(({ sc }) => sc.beat === x.id), lands = on.length ? on.map(({ sc }) => pos.get(sc.id)).reduce((s, v) => s + v, 0) / on.length : null;
      const off = lands != null && Math.abs(lands - x.at) > .15;
      return `<div class="beat-card ${on.length ? "has" : ""}">
        <div class="bc-h"><b>${esc(x.name)}</b><small class="muted" title="Where it usually falls">~${Math.round(x.at * 100)}%</small>${b.structure === "custom" ? `<button class="mini" data-act="ownBeatDel" data-b="${b.id}" data-id="${x.id}">✕</button>` : ""}</div>
        ${x.hint ? `<p class="muted small">${esc(x.hint)}</p>` : ""}
        <textarea rows="2" placeholder="What happens here in your book" data-input="beatNote" data-b="${b.id}" data-k="${x.id}">${esc(b.beatNotes?.[x.id] || "")}</textarea>
        ${on.length ? `<div class="chips">${on.map(({ sc }) => `<a class="chip" href="#/sc/${sc.id}">✒ ${esc(sc.title)}</a>`).join("")}</div>${off ? `<small class="warn">lands at ${Math.round(lands * 100)}% of the book</small>` : ""}` : ""}</div>`;
    }).join("")}</div>`).join("")}</div></section>`;
  // tension, scene by scene
  const W = Math.max(600, n * 46), H = 170, px = i => 30 + (n > 1 ? i * (W - 60) / (n - 1) : (W - 60) / 2), py = v => H - 26 - v * (H - 50) / 10;
  const pts = scs.map(({ sc }, i) => sc.tension != null && sc.tension !== "" ? [px(i), py(+sc.tension), sc, i] : null).filter(Boolean);
  let chStart = 0;
  const chLines = (b.chapters || []).map(ch => { const x = chStart; chStart += (ch.scenes || []).length; return x && x < n ? `<line class="tc-ch" x1="${(px(x - 1) + px(x)) / 2}" x2="${(px(x - 1) + px(x)) / 2}" y1="10" y2="${H - 20}"/>` : ""; }).join("");
  const tension = `<section class="panel"><div class="panel-h"><h4>Tension</h4><small class="muted">set each scene's tension in its Planning (0 calm, 10 unbearable)</small></div>
    ${n ? `<div class="tension-wrap"><svg class="tension" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      ${[0, 5, 10].map(v => `<line class="tc-grid" x1="20" x2="${W - 10}" y1="${py(v)}" y2="${py(v)}"/><text class="tc-ax" x="4" y="${py(v) + 4}">${v}</text>`).join("")}${chLines}
      ${beats.map(x => { const on = scs.findIndex(({ sc }) => sc.beat === x.id); return on >= 0 ? `<line class="tc-beat" x1="${px(on)}" x2="${px(on)}" y1="12" y2="${H - 20}"/><text class="tc-bl" x="${px(on) + 3}" y="20">${esc(x.name)}</text>` : ""; }).join("")}
      ${pts.length > 1 ? `<polyline class="tc-line" points="${pts.map(p => p[0] + "," + p[1]).join(" ")}"/>` : ""}
      ${pts.map(([x, y, sc]) => `<a href="#/sc/${sc.id}"><circle class="tc-dot" cx="${x}" cy="${y}" r="5" style="--c:${STATUSES[sc.status || "idea"][1]}"><title>${esc(sc.title)}: ${sc.tension}</title></circle></a>`).join("")}
      ${scs.map((x, i) => `<text class="tc-n" x="${px(i)}" y="${H - 6}">${i + 1}</text>`).join("")}</svg></div>` : `<p class="muted">No scenes yet.</p>`}</section>`;
  // the plot grid: scenes across, threads and themes down
  const rows = [...DB.threads.map(t => ["thread", t, THREAD_KINDS[t.kind]?.[1] || "〰", t.color || "#b9a6ff"]), ...DB.themes.map(t => ["theme", t, "❦", t.color || "#e3c27a"])];
  const grid = `<section class="panel"><div class="panel-h"><h4>Plot grid</h4><small class="muted">tap a square to say the scene moves that thread or touches that theme</small>
      <button class="btn small" data-act="newThread">+ Thread</button><button class="btn small" data-act="newTheme">+ Theme</button></div>
    ${!n || !rows.length ? `<p class="muted">${!n ? "No scenes yet." : "No threads or themes yet."}</p>` : `<div class="grid-wrap"><table class="plot-grid"><thead><tr><th></th>
      ${(b.chapters || []).map(ch => (ch.scenes || []).length ? `<th colspan="${ch.scenes.length}" class="pg-ch">${esc(ch.title)}</th>` : "").join("")}</tr>
      <tr><th></th>${scs.map(({ sc }, i) => `<th class="pg-sc"><a href="#/sc/${sc.id}" title="${esc(sc.title)}">${i + 1}</a></th>`).join("")}</tr></thead>
      <tbody>${rows.map(([t, it, icon, c]) => `<tr style="--c:${c}"><th class="pg-row"><a href="#/${t}/${it.id}">${icon} ${esc(it.name)}</a></th>
        ${scs.map(({ sc }) => { const on = (sc[t === "thread" ? "threads" : "themes"] || []).includes(it.id); return `<td><button class="pg-cell ${on ? "on" : ""}" data-act="gridToggle" data-sc="${sc.id}" data-t="${t}" data-id="${it.id}" aria-label="${esc(sc.title)}: ${esc(it.name)}"></button></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`}</section>`;
  const setups = DB.setups.filter(s => [s.setup, s.payoff].some(x => x && bookOf({ id: x }) === b) || (!s.setup && !s.payoff));
  return `<div class="page wide">
    <div class="crumbs"><a href="#/story">Story</a> › <a href="#/book/${b.id}">${esc(b.title)}</a> ›</div>
    <div class="page-h"><h2>Plan of ${esc(b.title)}</h2><div class="spacer"></div><a class="btn" href="#/book/${b.id}">Chapters and scenes</a></div>
    ${structure}${tension}${grid}
    <section class="panel"><div class="panel-h"><h4>Setups & payoffs</h4><button class="btn small" data-act="newSetup">+ Setup</button></div>${setupsHtml(setups)}</section>
  </div>`;
});
ACT.bookStructure = el => { const b = byId(DB.books, el.dataset.id); b.structure = el.value; if (b.structure === "custom" && !(b.beatsOwn || []).length) b.beatsOwn = []; commit(); };
let beatNoteT = null;
ACT.beatNote = el => { const b = byId(DB.books, el.dataset.b); (b.beatNotes ||= {})[el.dataset.k] = el.value; clearTimeout(beatNoteT); beatNoteT = setTimeout(() => save({ quiet: true }), 400); };
ACT.ownBeat = el => {
  const b = byId(DB.books, el.dataset.id);
  modal({ title: "New beat", body: `${textField("Name", "name", "", "autofocus")}${textField("Part or act (optional)", "act", "")}${textField("Where it falls (% of the book)", "at", "", `type="number" min="0" max="100"`)}`,
    buttons: [{ label: "Cancel" }, { label: "Add", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.name.trim()) return false;
      (b.beatsOwn ||= []).push({ id: "own:" + uid(), name: v.name.trim(), act: v.act.trim(), at: v.at === "" ? undefined : clamp(+v.at, 0, 100) / 100 });
      b.beatsOwn.sort((x, y) => (x.at ?? 2) - (y.at ?? 2));
      commit();
    } }] });
};
ACT.ownBeatDel = el => { const b = byId(DB.books, el.dataset.b); withUndo("Beat removed", () => { b.beatsOwn = b.beatsOwn.filter(x => x.id !== el.dataset.id); }); };
ACT.gridToggle = el => {
  const sc = sceneCtx(el.dataset.sc).sc, k = el.dataset.t === "thread" ? "threads" : "themes", list = sc[k] ||= [];
  const i = list.indexOf(el.dataset.id);
  if (i >= 0) list.splice(i, 1); else list.push(el.dataset.id);
  commit();
};

/* ── a scene's planning, under its title in the writing view ── */
function scenePlanHtml(sc, book) {
  const beats = bookBeats(book), open = STORY.plan;
  const tog = (k, list, t, icon) => list.map(it => `<button class="pchip ${(sc[k] || []).includes(it.id) ? "on" : ""}" data-act="scenePlanToggle" data-id="${sc.id}" data-k="${k}" data-v="${it.id}" style="--c:${it.color || "var(--accent)"}">${icon(it)} ${esc(it.name || it.title)}</button>`).join("");
  const filled = [sc.goal, sc.conflict, sc.outcome, sc.tension, sc.beat, ...(sc.threads || []), ...(sc.themes || []), ...(sc.events || [])].filter(x => x != null && x !== "").length;
  return `<details class="scene-plan" ${open ? "open" : ""}><summary>Planning${filled ? ` <small class="muted">${filled}</small>` : ""}</summary>
    <div class="sp-grid">
      <label>Goal <input data-change="scenePlan" data-k="goal" data-id="${sc.id}" value="${esc(sc.goal || "")}" placeholder="What the POV character wants here"></label>
      <label>Conflict <input data-change="scenePlan" data-k="conflict" data-id="${sc.id}" value="${esc(sc.conflict || "")}" placeholder="What's in the way"></label>
      <label>Outcome <input data-change="scenePlan" data-k="outcome" data-id="${sc.id}" value="${esc(sc.outcome || "")}" placeholder="Yes, no, yes-but, no-and…" list="outcomes"></label>
      <label>Tension <span class="sp-tension"><input type="range" min="0" max="10" step="1" value="${sc.tension ?? 5}" data-change="scenePlan" data-k="tension" data-id="${sc.id}"><b>${sc.tension ?? "—"}</b></span></label>
      ${beats.length ? `<label>Beat <select data-change="scenePlan" data-k="beat" data-id="${sc.id}"><option value="">—</option>${beats.map(x => `<option value="${x.id}" ${x.id === sc.beat ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>` : `<span class="muted small">Give the book a structure (<a href="#/plan/${book.id}">its plan</a>) to put this scene on a beat.</span>`}
    </div>
    <datalist id="outcomes"><option>Yes</option><option>No</option><option>Yes, but…</option><option>No, and…</option></datalist>
    <div class="sp-row"><span>Threads</span>${tog("threads", DB.threads, "thread", t => THREAD_KINDS[t.kind]?.[1] || "〰")}<button class="pchip add" data-act="newThread">+</button></div>
    <div class="sp-row"><span>Themes</span>${tog("themes", DB.themes, "theme", () => "❦")}<button class="pchip add" data-act="newTheme">+</button></div>
    ${DB.events.length ? `<div class="sp-row"><span>Shows</span>${(sc.events || []).map(id => byId(DB.events, id)).filter(Boolean).map(ev => `<button class="pchip on" data-act="scenePlanToggle" data-id="${sc.id}" data-k="events" data-v="${ev.id}">⏳ ${esc(ev.title)} ✕</button>`).join("")}
      <select data-change="scenePlanEvent" data-id="${sc.id}"><option value="">+ a world event…</option>${DB.events.filter(ev => !(sc.events || []).includes(ev.id)).map(ev => `<option value="${ev.id}">${esc(ev.title)}${ev.date ? " · " + esc(fmtDate(ev.date)) : ""}</option>`).join("")}</select></div>` : ""}
    <div class="sp-row"><span>Setups</span>${DB.setups.filter(s => s.setup === sc.id || s.payoff === sc.id).map(s => `<button class="pchip on" data-act="editSetup" data-id="${s.id}">${s.setup === sc.id ? "🌱" : "🎯"} ${esc(plainLinks(s.text))}</button>`).join("")}
      <button class="pchip add" data-act="newSetup" data-sc="${sc.id}">+ plant something here</button></div>
  </details>`;
}
document.addEventListener("toggle", e => { if (e.target.matches?.(".scene-plan")) STORY.plan = e.target.open; }, true);
ACT.scenePlan = el => {
  const sc = sceneCtx(el.dataset.id).sc, k = el.dataset.k;
  sc[k] = k === "tension" ? +el.value : el.value.trim();
  if (sc[k] === "") delete sc[k];
  if (k === "tension") { const b = el.parentElement.querySelector("b"); if (b) b.textContent = el.value; }
  save({ quiet: true });
};
ACT.scenePlanToggle = el => {
  const sc = sceneCtx(el.dataset.id).sc, list = sc[el.dataset.k] ||= [], i = list.indexOf(el.dataset.v);
  if (i >= 0) list.splice(i, 1); else list.push(el.dataset.v);
  STORY.plan = true;
  commit();
};
ACT.scenePlanEvent = el => { if (!el.value) return; const sc = sceneCtx(el.dataset.id).sc; (sc.events ||= []).push(el.value); STORY.plan = true; commit(); };
