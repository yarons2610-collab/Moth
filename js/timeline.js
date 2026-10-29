"use strict";
/* ── timeline ── the world's history in its own calendar. Events are the
   timeline's own records; other modules add their dated things (scenes,
   sessions) through TIMELINE_SOURCES, and codex lifespans show up too. */

const TL = { follow: "", q: "", show: { event: true, life: true, story: true, play: true } };
// each source: () → [{ date, end?, title, href, icon, color, kind, ids: [entry ids], sub? }]
const TIMELINE_SOURCES = [];

/* ── events are codex entries ── every timeline event has an entry of the
   Event kind in the codex, and that entry is what it says: its name, dates,
   article, tags, colour and who was involved are what the timeline shows.
   Edit it in either place and it's the same thing. Events from before this
   each got their entry once, made from the event word for word. An event
   tied to an entry of another kind (Lore, say) stays on the timeline and
   follows that entry the same way. */
function syncEvents(db = DB) {
  const evKind = db.kinds.find(k => k.id === "event");
  if (!evKind) return;
  const inv = evKind.fields.find(f => norm(f.name) === "involved")?.id;
  const entries = new Map(db.entries.map(e => [e.id, e]));
  const linked = new Map();
  for (const ev of db.events) {
    let e = ev.entry && entries.get(ev.entry);
    if (!e) {
      e = { id: uid(), kind: "event", name: ev.title || "Untitled event", aliases: [], tags: [...(ev.tags || [])], color: ev.color || "", summary: "",
        body: ev.body || "", fields: inv && (ev.involves || []).length ? { [inv]: [...ev.involves] } : {}, rels: [],
        start: ev.date ? { ...ev.date } : null, end: ev.end ? { ...ev.end } : null, created: Date.now() };
      db.entries.push(e); entries.set(e.id, e); ev.entry = e.id;
    }
    linked.set(e.id, ev);
  }
  for (const e of db.entries) {
    let ev = linked.get(e.id);
    if (!ev) { if (e.kind !== "event") continue; ev = { id: uid(), entry: e.id }; db.events.push(ev); }
    ev.title = e.name; ev.body = e.body || ""; ev.tags = [...(e.tags || [])]; ev.color = e.color || "";
    ev.date = e.start ? { ...e.start } : null; ev.end = e.end ? { ...e.end } : null;
    if (e.kind === "event") ev.involves = inv ? [...(Array.isArray(e.fields?.[inv]) ? e.fields[inv] : [])] : [];
  }
}
const evEntry = ev => byId(DB.entries, ev.entry);
linkType("ev", {
  list: () => DB.events,
  names: () => [], // [[links]] find the codex entry by its name instead
  info: ev => ({ title: ev.title, sub: fmtDate(ev.date) || "Event", icon: "⏳", color: ev.color || "#c9b27a" }),
  href: ev => ev.entry ? "#/e/" + ev.entry : "#/timeline",
  text: () => "",
  edges: () => [],
});

TIMELINE_SOURCES.push(() => DB.events.filter(ev => ev.date).map(ev => ({
  date: ev.date, end: ev.end, title: ev.title, href: "#/e/" + ev.entry, icon: evEntry(ev) && evEntry(ev).kind !== "event" ? kindOf(evEntry(ev)).icon : "⏳", color: ev.color, kind: "event",
  ids: [...new Set([...(ev.involves || []), ...mentionsIn(ev.body).filter(m => m.t === "e").map(m => m.it.id)])], sub: ev.body,
})));
TIMELINE_SOURCES.push(() => DB.entries.flatMap(e => {
  const k = kindOf(e), out = [];
  if (DB.events.some(ev => ev.entry === e.id)) return out; // it's on the line as an event already
  if (e.start) out.push({ date: e.start, title: `${e.name}: ${(k.startLabel || "begins").toLowerCase()}`, href: "#/e/" + e.id, icon: k.icon, color: entryColor(e), kind: "life", ids: [e.id, ...famGet("parents", e.id)] });
  if (e.end) out.push({ date: e.end, title: `${e.name}: ${(k.endLabel || "ends").toLowerCase()}`, href: "#/e/" + e.id, icon: k.icon, color: entryColor(e), kind: "life", ids: [e.id] });
  return out;
}));

ENTITY_PANELS.push(e => {
  const items = TIMELINE_SOURCES.flatMap(f => f()).filter(x => x.kind === "event" && x.ids.includes(e.id)).sort((a, b) => dateKey(a.date) - dateKey(b.date));
  if (!items.length) return "";
  return `<section class="panel"><div class="panel-h"><h4>History</h4><a class="btn small" href="#/timeline" data-act="followOnTimeline" data-id="${e.id}">On the timeline →</a></div>
    <ul class="mini-tl">${items.slice(0, 8).map(x => `<li><small>${esc(fmtDate(x.date))}${ageNote(e, x.date)}</small> <a href="${x.href}">${esc(x.title)}</a></li>`).join("")}</ul>
    ${items.length > 8 ? `<small class="muted">and ${items.length - 8} more</small>` : ""}</section>`;
});
function ageNote(e, date) {
  if (!e || e.kind !== "character" || !e.start || !date) return "";
  const a = ageAt(e.start, date);
  return a != null && a >= 0 && (!e.end || dateKey(date) <= dateKey(e.end)) ? ` · age ${a}` : "";
}
ACT.followOnTimeline = el => { TL.follow = el.dataset.id; go("#/timeline"); };

addRoute("timeline", "timeline", () => {
  const who = byId(DB.entries, TL.follow);
  const q = norm(TL.q);
  let items = TIMELINE_SOURCES.flatMap(f => f()).filter(x => TL.show[x.kind] !== false && x.date);
  if (who) items = items.filter(x => x.ids?.includes(who.id));
  if (q) items = items.filter(x => norm(x.title + " " + (x.sub || "")).includes(q));
  items.sort((a, b) => dateKey(a.date) - dateKey(b.date) || a.title.localeCompare(b.title));
  const now = NOW();
  let html = "", lastEra = null, nowShown = false;
  const nowRow = `<div class="tl-now"><span>Now · ${esc(fmtDate(now))}</span></div>`;
  for (const x of items) {
    if (!nowShown && dateKey(x.date) > dateKey(now)) { html += nowRow; nowShown = true; }
    const era = eraOf(x.date.y);
    if (era !== lastEra) { html += `<h3 class="tl-era">${esc(era.name)}</h3>`; lastEra = era; }
    html += `<a class="tl-item k-${x.kind}" href="${x.href}" style="--c:${x.color || "var(--accent)"}">
      <div class="tl-date">${esc(fmtDate(x.date))}${x.end ? `<small>to ${esc(fmtDate(x.end))}</small>` : ""}${who ? `<small>${ageNote(who, x.date).replace(" · ", "")}</small>` : ""}</div>
      <div class="tl-dot">${x.icon || "•"}</div>
      <div class="tl-body"><b>${esc(x.title)}</b>${x.sub ? `<p>${esc(x.sub.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (m, a, b, c) => c || a).slice(0, 160))}</p>` : ""}</div></a>`;
  }
  if (items.length && !nowShown) html += nowRow;
  // events with no date yet can't sit on the line, but mustn't vanish either
  const undated = TL.show.event === false ? [] : DB.events.filter(ev => !ev.date &&
    (!who || (ev.involves || []).includes(who.id) || mentionsIn(ev.body).some(m => m.it === who)) &&
    (!q || norm(ev.title + " " + ev.body).includes(q)));
  const people = DB.entries.filter(e => e.kind !== "event").sort((a, b) => a.name.localeCompare(b.name));
  const kinds = { event: "Events", life: "Lifespans", story: "Scenes", play: "Sessions" };
  return `<div class="page">
    <div class="page-h"><h2>Timeline</h2><div class="spacer"></div>
      ${searchBox("tlFilter", TL.q, "Filter events…")}
      <button class="btn" data-act="setNow">Now: ${esc(fmtDate(now))}</button>
      <button class="btn accent" data-act="newEvent">+ Event</button></div>
    <div class="chips-row">
      <select data-change="tlFollow"><option value="">Everyone and everything</option>${people.map(p => `<option value="${p.id}" ${p.id === TL.follow ? "selected" : ""}>Follow ${esc(p.name)}</option>`).join("")}</select>
      ${Object.entries(kinds).map(([k, l]) => `<button class="fchip ${TL.show[k] ? "on" : ""}" data-act="tlKind" data-k="${k}">${l}</button>`).join("")}
    </div>
    ${who ? `<div class="follow-note">Following ${chip("e", who)}${who.start ? `, ${esc(lifespan(who))}` : ""}. Ages are shown at each event.</div>` : ""}
    <div class="tl">${html || (undated.length ? "" : empty("Nothing dated yet. Add an event, or give codex entries a date."))}</div>
    ${undated.length ? `<section class="panel undated"><div class="panel-h"><h4>Not dated yet</h4></div>
      <p class="muted small">These events have no date, so they can't go on the line. Give one a date and it takes its place.</p>
      <div class="list">${undated.map(ev => `<div class="row-card"><a href="#/e/${ev.entry}"><b>⏳ ${esc(ev.title)}</b></a>
        ${ev.body ? `<small>${esc(plainLinks(ev.body).slice(0, 100))}</small>` : ""}<span class="spacer"></span>
        <button class="btn small" data-act="editEntry" data-id="${ev.entry}">Give it a date</button></div>`).join("")}</div></section>` : ""}</div>`;
});
ACT.tlFilter = el => { TL.q = el.value; rerender(); refocus(".page-h .search"); };
ACT.tlFollow = el => { TL.follow = el.value; rerender(); };
ACT.tlKind = el => { TL.show[el.dataset.k] = !TL.show[el.dataset.k]; rerender(); };
ACT.setNow = () => modal({
  title: "The world's “now”",
  body: `<p class="muted">Ages in the codex are counted to this date, and the timeline marks it.</p>${dateField("Now", "now", NOW())}`,
  buttons: [{ label: "Cancel" }, { label: "Set", cls: "accent", act: w => {
    const d = parseDate(formVals(w).now);
    if (!d) { toast("That isn't a date I can read"); return false; }
    DB.world.now = d; commit();
  } }],
});

/* an event's old address opens its codex entry */
addRoute("ev", "timeline", id => {
  const ev = byId(DB.events, id);
  if (!ev) return `<div class="page">${empty("That event doesn't exist any more.")}</div>`;
  return [`<div class="page">${empty("Opening…")}</div>`, () => location.replace("#/e/" + ev.entry)];
});
// a new event is a new Event entry; it's on the timeline as soon as it's saved
const newEventEntry = (p = {}) => {
  const k = byId(DB.kinds, "event"), inv = k?.fields.find(f => norm(f.name) === "involved")?.id;
  return newEntry({ kind: "event", ...(TL.follow && inv ? { fields: { [inv]: [TL.follow] } } : {}), ...p });
};
ACT.newEvent = () => entryEditor(newEventEntry(), true);
ACT.editEvent = el => { const ev = byId(DB.events, el.dataset.id); if (ev) entryEditor(evEntry(ev), false); };
NEW_FROM_LINK.event = { label: "⏳ Timeline event", make: title => entryEditor(newEventEntry({ name: title }), true) };
// an event's page in the codex: where it sits on the timeline, and the scenes that show it
ENTITY_PANELS.push(e => {
  const ev = DB.events.find(x => x.entry === e.id);
  if (!ev) return "";
  const scenes = allScenes().filter(x => (x.sc.events || []).includes(ev.id));
  return `<section class="panel"><div class="panel-h"><h4>⏳ On the timeline</h4><a class="btn small" href="#/timeline" data-act="tlShowEvent" data-id="${ev.id}">See it on the timeline →</a></div>
    <p class="muted small">${ev.date ? esc(fmtDate(ev.date)) + (ev.end ? " to " + esc(fmtDate(ev.end)) : "") : "Not dated yet: give it a date (Edit) and it takes its place on the line."}</p>
    ${scenes.length ? `<h5>Shown in the story</h5><div class="chips">${scenes.map(x => chip("sc", x.sc)).join("")}</div>` : ""}</section>`;
});
ACT.tlShowEvent = el => { TL.follow = ""; TL.q = byId(DB.events, el.dataset.id)?.title || ""; go("#/timeline"); };
// deleting an Event entry takes it off the timeline
ENTITY_DELETE_HOOKS.push(id => { DB.events = DB.events.filter(ev => ev.entry !== id); });
ENTITY_DELETE_HOOKS.push(id => { for (const ev of DB.events) ev.involves = (ev.involves || []).filter(x => x !== id); });
