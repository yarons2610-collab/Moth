"use strict";
/* ── timeline ── the world's history in its own calendar. Events are the
   timeline's own records; other modules add their dated things (scenes,
   sessions) through TIMELINE_SOURCES, and codex lifespans show up too. */

const TL = { follow: "", q: "", show: { event: true, life: true, story: true, play: true } };
// each source: () → [{ date, end?, title, href, icon, color, kind, ids: [entry ids], sub? }]
const TIMELINE_SOURCES = [];

linkType("ev", {
  list: () => DB.events,
  names: ev => [ev.title],
  info: ev => ({ title: ev.title, sub: fmtDate(ev.date) || "Event", icon: "⏳", color: ev.color || "#c9b27a" }),
  href: ev => "#/ev/" + ev.id,
  text: ev => ev.body,
  edges: ev => (ev.involves || []).map(id => ["e", id, "involves"]),
});

TIMELINE_SOURCES.push(() => DB.events.filter(ev => ev.date).map(ev => ({
  date: ev.date, end: ev.end, title: ev.title, href: "#/ev/" + ev.id, icon: "⏳", color: ev.color, kind: "event",
  ids: [...new Set([...(ev.involves || []), ...mentionsIn(ev.body).filter(m => m.t === "e").map(m => m.it.id)])], sub: ev.body,
})));
TIMELINE_SOURCES.push(() => DB.entries.flatMap(e => {
  const k = kindOf(e), out = [];
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
  const people = DB.entries.slice().sort((a, b) => a.name.localeCompare(b.name));
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
    <div class="tl">${html || empty("Nothing dated yet. Add an event, or give codex entries a date.")}</div></div>`;
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

/* ── an event's page ── */
addRoute("ev", "timeline", id => {
  const ev = byId(DB.events, id);
  if (!ev) return `<div class="page">${empty("That event doesn't exist any more.")}</div>`;
  const inv = (ev.involves || []).map(i => byId(DB.entries, i)).filter(Boolean);
  const back = backlinks("ev", ev.id);
  return `<div class="page narrow" style="--c:${ev.color || "var(--accent)"}">
    <div class="page-h"><div><div class="kind-line"><a href="#/timeline">⏳ Event</a></div><h2>${esc(ev.title)}</h2>
      <div class="life">${esc(fmtDate(ev.date) || "Undated")}${ev.end ? " to " + esc(fmtDate(ev.end)) : ""}</div></div>
      <div class="spacer"></div><button class="btn accent" data-act="editEvent" data-id="${ev.id}">Edit</button>
      <button class="btn ghost" data-act="deleteEvent" data-id="${ev.id}">🗑</button></div>
    ${inv.length ? `<div class="chips">${inv.map(e => chip("e", e, ev.date ? `<small>${ageNote(e, ev.date).replace(" · ", " ")}</small>` : "")).join("")}</div>` : ""}
    ${mdBlock(ev.body, empty("Nothing written about it yet."))}
    ${tagsHtml(ev.tags)}
    ${back.length ? `<section class="panel"><div class="panel-h"><h4>Mentioned in</h4></div><div class="chips">${back.map(b => chip(b.t, b.it)).join("")}</div></section>` : ""}
  </div>`;
});
function eventEditor(ev, isNew) {
  modal({
    title: isNew ? "New event" : "Edit event", wide: true,
    body: `${textField("What happened", "title", ev.title, "autofocus")}
      <div class="row2">${dateField("When", "date", ev.date)}${dateField("Until (optional)", "end", ev.end)}</div>
      ${multiPick("Who and where", "involves", ev.involves || [])}
      ${areaField("What happened, in full ([[links]] work)", "body", ev.body, 8)}
      <div class="row2">${textField("Tags", "tags", (ev.tags || []).join(", "))}${colorField("Colour", "color", ev.color)}</div>`,
    buttons: [{ label: "Cancel" }, { label: isNew ? "Create" : "Save", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.title.trim()) { toast("Give it a title"); return false; }
      for (const n of ["date", "end"]) if (v[n].trim() && !parseDate(v[n])) { toast(`“${v[n]}” isn't a date I can read`); return false; }
      Object.assign(ev, { title: v.title.trim(), date: parseDate(v.date), end: parseDate(v.end), involves: multiVals(v.involves), body: v.body, tags: splitList(v.tags), color: v.color });
      if (isNew) DB.events.push(ev);
      commit();
      if (isNew) go("#/ev/" + ev.id);
    } }],
  });
}
const newEventObj = (p = {}) => ({ id: uid(), title: "", date: null, end: null, involves: [], body: "", tags: [], color: "", ...p });
ACT.newEvent = () => eventEditor(newEventObj({ involves: TL.follow ? [TL.follow] : [] }), true);
ACT.editEvent = el => eventEditor(byId(DB.events, el.dataset.id), false);
ACT.deleteEvent = async el => {
  const ev = byId(DB.events, el.dataset.id);
  if (!await ask(`Delete “${ev.title}”?`, "You can undo this straight afterwards.")) return;
  withUndo("Event deleted", () => { DB.events = DB.events.filter(x => x !== ev); });
  go("#/timeline");
};
NEW_FROM_LINK.event = { label: "⏳ Timeline event", make: title => eventEditor(newEventObj({ title }), true) };
ENTITY_DELETE_HOOKS.push(id => { for (const ev of DB.events) ev.involves = (ev.involves || []).filter(x => x !== id); });
