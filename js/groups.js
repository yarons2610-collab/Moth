"use strict";
/* ── groups ── one board with every faction and who's in it, to see the
   groups at a glance and put characters in them.

   Who's in a group comes from what the codex already says: the faction's
   Leader and its Notable members (or Members) field, and each character's
   Allegiance. Adding someone puts them in the faction's members list;
   removing someone takes them off whatever put them there (members list,
   allegiance, leader). Nothing else in either entry changes. */

const GRP = { q: "", type: "" };
const fieldNamed = (k, names, types) => k?.fields.find(f => names.includes(norm(f.name)) && (!types || types.includes(f.type)));
function groupFields() {
  const fk = byId(DB.kinds, "faction"), ck = byId(DB.kinds, "character");
  return {
    fk, ck,
    mem: fieldNamed(fk, ["notable members", "members"], ["links"]),
    lead: fieldNamed(fk, ["leader", "leaders"], ["link", "links"]),
    alleg: fieldNamed(ck, ["allegiance", "allegiances", "faction", "factions"], ["link", "links"]),
    type: fieldNamed(fk, ["type"], ["choice", "text"]),
  };
}
const asList = v => Array.isArray(v) ? v : v ? [v] : [];
// a group's members, each with what puts them there
function groupMembers(fac, G = groupFields()) {
  const out = new Map();
  const add = (id, why) => { const e = byId(DB.entries, id); if (!e || e.id === fac.id) return; (out.get(id) || out.set(id, { e, why: new Set() }).get(id)).why.add(why); };
  if (G.lead) for (const id of asList(fac.fields?.[G.lead.id])) add(id, "leader");
  if (G.mem) for (const id of asList(fac.fields?.[G.mem.id])) add(id, "member");
  if (G.alleg) for (const e of DB.entries) if (e.kind === G.ck?.id && asList(e.fields?.[G.alleg.id]).includes(fac.id)) add(e.id, "allegiance");
  return [...out.values()].sort((a, b) => (b.why.has("leader") - a.why.has("leader")) || a.e.name.localeCompare(b.e.name));
}
// a faction without a members field gets one (Structure → Members) the first time it's needed
function membersField(G) {
  if (G.mem) return G.mem;
  const f = { id: uid(), name: "Members", type: "links", sec: "Structure" };
  G.fk.fields.push(f);
  return (G.mem = f);
}
function joinGroup(charId, fac, G = groupFields()) {
  if (groupMembers(fac, G).some(m => m.e.id === charId)) return false;
  const f = membersField(G);
  fac.fields ||= {};
  fac.fields[f.id] = [...asList(fac.fields[f.id]), charId];
  fac.updated = Date.now();
  return true;
}
function leaveGroup(charId, fac, G = groupFields()) {
  const c = byId(DB.entries, charId);
  for (const f of [G.mem, G.lead]) if (f && fac.fields?.[f.id] != null) {
    const v = fac.fields[f.id];
    if (Array.isArray(v)) { fac.fields[f.id] = v.filter(x => x !== charId); if (!fac.fields[f.id].length) delete fac.fields[f.id]; }
    else if (v === charId) delete fac.fields[f.id];
  }
  if (G.alleg && c?.fields?.[G.alleg.id] != null) {
    const v = c.fields[G.alleg.id];
    if (Array.isArray(v)) { c.fields[G.alleg.id] = v.filter(x => x !== fac.id); if (!c.fields[G.alleg.id].length) delete c.fields[G.alleg.id]; }
    else if (v === fac.id) delete c.fields[G.alleg.id];
    c.updated = Date.now();
  }
  fac.updated = Date.now();
}

addRoute("groups", "web", () => {
  const G = groupFields();
  if (!G.fk || !G.ck) return `<div class="page">${webTabs("groups")}${empty("Groups need the Faction and Character kinds.")}</div>`;
  const q = norm(GRP.q);
  const types = G.type ? [...new Set(DB.entries.filter(e => e.kind === G.fk.id).map(e => e.fields?.[G.type.id]).filter(Boolean))].sort() : [];
  const facs = DB.entries.filter(e => e.kind === G.fk.id && (!GRP.type || e.fields?.[G.type.id] === GRP.type)).sort((a, b) => a.name.localeCompare(b.name));
  const all = DB.entries.filter(e => e.kind === G.ck.id).sort((a, b) => a.name.localeCompare(b.name));
  const inSome = new Set(DB.entries.filter(e => e.kind === G.fk.id).flatMap(f => groupMembers(f, G).map(m => m.e.id)));
  const match = e => !q || norm(e.name).includes(q) || (e.aliases || []).some(a => norm(a).includes(q));
  const free = all.filter(e => !inSome.has(e.id) && match(e));
  const person = (e, fac, why) => `<span class="gchip" data-char="${e.id}" ${fac ? `data-from="${fac.id}"` : ""} style="--c:${entryColor(e)}" title="${esc(e.summary ? plainLinks(e.summary) : e.name)}">
    <span class="g-grip" aria-hidden="true">⠿</span><a href="#/e/${e.id}" draggable="false">${e.portrait ? assetImg(e.portrait, "g-pic") : `<span class="g-ic">${esc(initials(e.name))}</span>`}${esc(e.name)}</a>
    ${why?.has("leader") ? `<small class="g-why" title="Leader">★</small>` : ""}${why && !why.has("member") && !why.has("leader") ? `<small class="g-why" title="Through their Allegiance">⚑</small>` : ""}
    ${fac ? `<button class="mini" data-act="grpLeave" data-char="${e.id}" data-fac="${fac.id}" title="Take ${esc(e.name)} out of ${esc(fac.name)}">✕</button>` : ""}</span>`;
  return [`<div class="page wide groups-page">${webTabs("groups")}
    <div class="page-h"><h2>Groups</h2><div class="spacer"></div>
      ${searchBox("grpFilter", GRP.q, "Find a character…")}
      ${types.length ? `<select data-change="grpType"><option value="">All kinds of group</option>${types.map(t => `<option ${t === GRP.type ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>` : ""}
      <button class="btn accent" data-act="newEntry" data-kind="${G.fk.id}">+ New group</button></div>
    <p class="muted small">Drag a character onto a group to add them (drag from one group to another to move them, holding Ctrl or ⌘ to add them to both), or use + Add. ★ leads the group; ⚑ is there through their own Allegiance.</p>
    <div class="groups-board">
      <section class="gcol free" data-fac="">
        <div class="gcol-h"><b>Not in any group</b><small>${free.length}</small></div>
        <div class="gcol-list">${free.map(e => person(e)).join("") || `<p class="muted small">${q ? "No one by that name." : "Everyone belongs somewhere."}</p>`}</div>
        <button class="btn small ghost" data-act="grpNewChar" data-fac="">+ New character</button>
      </section>
      ${facs.map(f => {
        const ms = groupMembers(f, G).filter(m => match(m.e) || !q);
        return `<section class="gcol" data-fac="${f.id}" style="--c:${entryColor(f)}">
          <div class="gcol-h"><a href="#/e/${f.id}">${f.portrait ? assetImg(f.portrait, "g-pic") : `<span>${kindOf(f).icon}</span>`} <b>${esc(f.name)}</b></a><small>${ms.length}</small></div>
          ${f.summary ? `<p class="gcol-sum">${esc(plainLinks(f.summary))}</p>` : ""}
          <div class="gcol-list">${ms.map(m => person(m.e, f, m.why)).join("") || `<p class="muted small">No members yet.</p>`}</div>
          <div class="gcol-f"><button class="btn small" data-act="grpPick" data-fac="${f.id}">+ Add</button><button class="btn small ghost" data-act="grpNewChar" data-fac="${f.id}">+ New character</button></div>
        </section>`;
      }).join("") || empty("No factions yet: + New group.")}
    </div></div>`, wireGroupDrag];
});
ACT.grpFilter = el => { GRP.q = el.value; rerender(); refocus(".groups-page .page-h .search"); };
ACT.grpType = el => { GRP.type = el.value; rerender(); };
ACT.grpLeave = el => {
  const fac = byId(DB.entries, el.dataset.fac), c = byId(DB.entries, el.dataset.char);
  withUndo(`${c.name} taken out of ${fac.name}`, () => leaveGroup(c.id, fac));
};
// tick who's in a group
ACT.grpPick = el => {
  const G = groupFields(), fac = byId(DB.entries, el.dataset.fac);
  const now = new Set(groupMembers(fac, G).map(m => m.e.id));
  const chars = DB.entries.filter(e => e.kind === G.ck.id).sort((a, b) => a.name.localeCompare(b.name));
  modal({ title: `Who's in ${fac.name}?`, wide: true,
    body: `<input class="search" placeholder="Find…" data-input="grpPickFilter">
      <div class="g-pick">${chars.map(e => `<label class="check" data-name="${esc(norm(e.name))}"><input type="checkbox" name="c_${e.id}" ${now.has(e.id) ? "checked" : ""}> ${esc(e.name)}${e.summary ? ` <small class="muted">${esc(plainLinks(e.summary).slice(0, 70))}</small>` : ""}</label>`).join("")}</div>`,
    buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
      const v = formVals(w), snap = JSON.stringify(DB);
      let a = 0, r = 0;
      for (const e of chars) {
        const want = v["c_" + e.id];
        if (want && !now.has(e.id)) { joinGroup(e.id, fac, G); a++; }
        if (!want && now.has(e.id)) { leaveGroup(e.id, fac, G); r++; }
      }
      if (!a && !r) return;
      commit();
      toast([a && `${plural(a, "character")} added`, r && `${plural(r, "character")} taken out`].filter(Boolean).join(", "), { undo: () => { DB = normalizeDB(JSON.parse(snap)); commit(); } });
    } }] });
};
ACT.grpPickFilter = el => { const q = norm(el.value); for (const l of $$(".g-pick label", el.closest(".modal"))) l.style.display = q && !l.dataset.name.includes(q) ? "none" : ""; };
// a new character, already in the group
ACT.grpNewChar = el => {
  const G = groupFields(), fac = byId(DB.entries, el.dataset.fac);
  entryEditor(newEntry({ kind: G.ck.id }), true, { after: e => { if (fac) joinGroup(e.id, fac, G); toast(fac ? `${e.name} joined ${fac.name}` : `${e.name} added`); } });
};

/* dragging a character onto a group: with a mouse or pen (on a touch
   screen, + Add, so scrolling the board still works) */
function wireGroupDrag(main) {
  const board = $(".groups-board", main);
  if (!board) return;
  board.addEventListener("pointerdown", e => {
    const chip = e.target.closest(".gchip");
    if (!chip || e.pointerType === "touch" || e.button !== 0 || e.target.closest("button")) return;
    const sx = e.clientX, sy = e.clientY;
    let ghost = null, over = null;
    const move = ev => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        ghost = chip.cloneNode(true); ghost.classList.add("g-ghost"); document.body.append(ghost);
        chip.classList.add("g-lifted");
      }
      ev.preventDefault();
      ghost.style.left = ev.clientX + 8 + "px"; ghost.style.top = ev.clientY + 8 + "px";
      const col = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.(".gcol");
      if (col !== over) { over?.classList.remove("g-over"); over = col; over?.classList.add("g-over"); }
    };
    const up = ev => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (!ghost) return;
      // a drag isn't a click on the name
      const stop = c => { c.preventDefault(); c.stopPropagation(); };
      document.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => document.removeEventListener("click", stop, { capture: true }), 50);
      ghost.remove(); chip.classList.remove("g-lifted"); over?.classList.remove("g-over");
      const to = over?.dataset.fac ?? null, from = chip.dataset.from || "", id = chip.dataset.char;
      if (to === null || to === from) return;
      const G = groupFields(), toF = byId(DB.entries, to), fromF = byId(DB.entries, from), c = byId(DB.entries, id);
      const keep = ev.ctrlKey || ev.metaKey;
      withUndo(toF ? `${c.name} ${fromF && !keep ? "moved to" : "added to"} ${toF.name}` : `${c.name} taken out of ${fromF.name}`, () => {
        if (toF) joinGroup(id, toF, G);
        if (fromF && !keep) leaveGroup(id, fromF, G);
      });
    };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
  });
}
