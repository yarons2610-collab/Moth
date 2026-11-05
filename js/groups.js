"use strict";
/* ── groups ── a board with every group and who's in it, to see them at a
   glance and put characters in them. Two boards: factions (kingdoms,
   guilds…) and knots (the numbered groups of the competition).

   Who's in a group comes from what the codex already says: its Leader or
   Captain, its Notable members or Members field, and, for factions, each
   character's Allegiance. Adding someone puts them in the group's members
   list; removing someone takes them off whatever put them there. Nothing
   else in either entry changes.

   Participant (a yes/no on characters) is about the competition only: the
   knots board's "not in any knot" column lists participants, and joining a
   knot, or being made on the knots board, makes someone one. Factions have
   nothing to do with it. */

const GRP = { q: "", type: "", board: "faction" };
const fieldNamed = (k, names, types) => k?.fields.find(f => names.includes(norm(f.name)) && (!types || types.includes(f.type)));
function groupFields(kindId = GRP.board) {
  const fk = byId(DB.kinds, kindId), ck = byId(DB.kinds, "character"), knot = kindId === "knot";
  return {
    fk, ck, knot,
    mem: fieldNamed(fk, ["members", "notable members"], ["links"]),
    lead: fieldNamed(fk, ["captain", "leader", "leaders"], ["link", "links"]),
    alleg: knot ? null : fieldNamed(ck, ["allegiance", "allegiances", "faction", "factions"], ["link", "links"]),
    type: fieldNamed(fk, knot ? ["status"] : ["type"], ["choice", "text"]),
    num: knot ? fieldNamed(fk, ["number"], ["number", "text"]) : null,
  };
}
const asList = v => Array.isArray(v) ? v : v ? [v] : [];
const groupKindOf = fac => fac?.kind === "knot" ? "knot" : "faction";
// a group's members, each with what puts them there
function groupMembers(fac, G = groupFields(groupKindOf(fac))) {
  const out = new Map();
  const add = (id, why) => { const e = byId(DB.entries, id); if (!e || e.id === fac.id) return; (out.get(id) || out.set(id, { e, why: new Set() }).get(id)).why.add(why); };
  if (G.lead) for (const id of asList(fac.fields?.[G.lead.id])) add(id, "leader");
  if (G.mem) for (const id of asList(fac.fields?.[G.mem.id])) add(id, "member");
  if (G.alleg) for (const e of DB.entries) if (e.kind === G.ck?.id && asList(e.fields?.[G.alleg.id]).includes(fac.id)) add(e.id, "allegiance");
  return [...out.values()].sort((a, b) => (b.why.has("leader") - a.why.has("leader")) || a.e.name.localeCompare(b.e.name));
}
// a kind without a members field gets one (Members) the first time it's needed
function membersField(G) {
  if (G.mem) return G.mem;
  const f = { id: uid(), name: "Members", type: "links", sec: G.knot ? "" : "Structure" };
  G.fk.fields.push(f);
  return (G.mem = f);
}
function joinGroup(charId, fac, G = groupFields(groupKindOf(fac))) {
  if (G.knot) markParticipant(byId(DB.entries, charId));
  if (groupMembers(fac, G).some(m => m.e.id === charId)) return false;
  const f = membersField(G);
  fac.fields ||= {};
  fac.fields[f.id] = [...asList(fac.fields[f.id]), charId];
  fac.updated = Date.now();
  return true;
}
function leaveGroup(charId, fac, G = groupFields(groupKindOf(fac))) {
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

/* the Participant field: made once (beside Role), and everyone already in a
   knot is one */
function ensureParticipants(db = DB) {
  const ck = db.kinds.find(k => k.id === "character"), kk = db.kinds.find(k => k.id === "knot");
  if (!ck) return;
  let f = ck.fields.find(x => norm(x.name) === "participant");
  if (f) return;
  const role = ck.fields.findIndex(x => norm(x.name) === "role");
  f = { id: uid(), name: "Participant", type: "yesno", sec: role >= 0 ? ck.fields[role].sec || "" : "In the story" };
  ck.fields.splice(role >= 0 ? role + 1 : ck.fields.length, 0, f);
  if (!kk) return;
  const named = names => kk.fields.find(x => names.includes(norm(x.name)) && ["link", "links"].includes(x.type));
  const ids = new Set();
  for (const e of db.entries) if (e.kind === "knot") for (const x of [named(["members", "notable members"]), named(["captain", "leader"])]) if (x) asList(e.fields?.[x.id]).forEach(id => ids.add(id));
  for (const e of db.entries) if (e.kind === ck.id && ids.has(e.id)) (e.fields ||= {})[f.id] = true;
}
const participantField = () => byId(DB.kinds, "character")?.fields.find(f => norm(f.name) === "participant");
const isParticipant = e => { const f = participantField(); return !!(f && e.fields?.[f.id]); };
function markParticipant(e) { const f = participantField(); if (f && e && e.kind === "character" && !e.fields?.[f.id]) { (e.fields ||= {})[f.id] = true; e.updated = Date.now(); } }

addRoute("groups", "web", board => {
  if (board !== undefined) GRP.board = board === "knot" ? "knot" : "faction";
  if (GRP.lastBoard !== GRP.board) { GRP.type = ""; GRP.lastBoard = GRP.board; }
  const G = groupFields();
  const boards = `<div class="seg board-seg"><a class="${G.knot ? "" : "on"}" href="#/groups/faction">⚑ Factions</a><a class="${G.knot ? "on" : ""}" href="#/groups/knot">⚔ Knots</a></div>`;
  if (!G.fk || !G.ck) return `<div class="page">${webTabs("groups")}${boards}${empty("This board needs the Character kind and the " + (G.knot ? "Knot" : "Faction") + " kind.")}</div>`;
  const q = norm(GRP.q);
  const types = G.type ? [...new Set(DB.entries.filter(e => e.kind === G.fk.id).map(e => e.fields?.[G.type.id]).filter(Boolean))].sort() : [];
  const numOf = e => { const v = G.num && e.fields?.[G.num.id]; const n = parseFloat(v ?? String(e.name).match(/\d+/)?.[0]); return isNaN(n) ? Infinity : n; };
  const facs = DB.entries.filter(e => e.kind === G.fk.id && (!GRP.type || e.fields?.[G.type.id] === GRP.type))
    .sort((a, b) => G.knot ? numOf(a) - numOf(b) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  const all = DB.entries.filter(e => e.kind === G.ck.id).sort((a, b) => a.name.localeCompare(b.name));
  // "not in any": of the groups shown now (all of them, or one kind)
  const inSome = new Set(facs.flatMap(f => groupMembers(f, G).map(m => m.e.id)));
  const match = e => !q || norm(e.name).includes(q) || (e.aliases || []).some(a => norm(a).includes(q));
  // on the knots board, only participants wait to be put in a knot
  const free = all.filter(e => (!G.knot || isParticipant(e)) && !inSome.has(e.id) && match(e));
  const others = G.knot ? all.filter(e => !isParticipant(e)).length : 0;
  const what = G.knot ? "knot" : "group";
  const candidates = G.knot ? DB.entries.filter(e => e.kind === "faction" && /^(knot|group)\s*#?\s*\d+\b/i.test(e.name.trim())) : [];
  const person = (e, fac, why) => `<span class="gchip" data-char="${e.id}" ${fac ? `data-from="${fac.id}"` : ""} style="--c:${entryColor(e)}" title="${esc(e.summary ? plainLinks(e.summary) : e.name)}">
    <span class="g-grip" aria-hidden="true">⠿</span><a href="#/e/${e.id}" draggable="false">${e.portrait ? assetImg(e.portrait, "g-pic") : `<span class="g-ic">${esc(initials(e.name))}</span>`}${esc(e.name)}</a>
    ${why?.has("leader") ? `<small class="g-why" title="${G.knot ? "Captain" : "Leader"}">★</small>` : ""}${why && !why.has("member") && !why.has("leader") ? `<small class="g-why" title="Through their Allegiance">⚑</small>` : ""}
    ${fac ? `<button class="mini" data-act="grpLeave" data-char="${e.id}" data-fac="${fac.id}" title="Take ${esc(e.name)} out of ${esc(fac.name)}">✕</button>` : ""}</span>`;
  return [`<div class="page wide groups-page">${webTabs("groups")}
    <div class="page-h"><h2>${G.knot ? "Knots" : "Groups"}</h2>${boards}<div class="spacer"></div>
      ${searchBox("grpFilter", GRP.q, "Find a character…")}
      ${types.length ? `<select data-change="grpType"><option value="">${G.knot ? "Every status" : "All kinds of group"}</option>${types.map(t => `<option ${t === GRP.type ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>` : ""}
      ${candidates.length ? `<button class="btn" data-act="knotConvert">Make some factions knots…</button>` : ""}
      <button class="btn accent" data-act="grpNew">+ New ${what}</button></div>
    <p class="muted small">Drag a character onto a ${what} to add them (from one ${what} to another to move them; hold Ctrl or ⌘ to add them to both), or use + Add. ★ ${G.knot ? "captains the knot" : "leads the group; ⚑ is there through their own Allegiance"}.${G.knot ? " Everyone in a knot is a participant in the competition." : ""}</p>
    <div class="groups-board">
      <section class="gcol free" data-fac="">
        <div class="gcol-h"><b>${G.knot ? (GRP.type ? `Participants not in a ${esc(GRP.type.toLowerCase())} knot` : "Participants not in a knot") : GRP.type ? `Not in any ${esc(GRP.type.toLowerCase())}` : "Not in any group"}</b><small>${free.length}</small></div>
        <div class="gcol-list">${free.map(e => person(e)).join("") || `<p class="muted small">${q ? "No one by that name." : G.knot ? "Every participant is in a knot." : "Everyone belongs somewhere."}</p>`}</div>
        ${G.knot ? `<p class="muted small">Only participants are listed${others ? `; ${plural(others, "other character")} aren't (+ Add on a knot lists everyone, or tick Participant on a character's page)` : ""}.</p>` : ""}
        <button class="btn small ghost" data-act="grpNewChar" data-fac="">+ New ${G.knot ? "participant" : "character"}</button>
      </section>
      ${facs.map(f => {
        const ms = groupMembers(f, G).filter(m => match(m.e) || !q);
        return `<section class="gcol" data-fac="${f.id}" style="--c:${entryColor(f)}">
          <div class="gcol-h"><a href="#/e/${f.id}">${f.portrait ? assetImg(f.portrait, "g-pic") : `<span>${kindOf(f).icon}</span>`} <b>${esc(f.name)}</b></a><small>${ms.length}</small></div>
          ${G.knot && (G.type && f.fields?.[G.type.id] || f.fields?.[fieldNamed(G.fk, ["score"])?.id] != null) ? `<div class="gcol-meta">${G.type && f.fields?.[G.type.id] ? `<span class="pill">${esc(f.fields[G.type.id])}</span>` : ""}${(() => { const sf = fieldNamed(G.fk, ["score"]); return sf && f.fields?.[sf.id] != null ? `<span class="pill">Score ${esc(f.fields[sf.id])}</span>` : ""; })()}</div>` : ""}
          ${f.summary ? `<p class="gcol-sum">${esc(plainLinks(f.summary))}</p>` : ""}
          <div class="gcol-list">${ms.map(m => person(m.e, f, m.why)).join("") || `<p class="muted small">No members yet.</p>`}</div>
          <div class="gcol-f"><button class="btn small" data-act="grpPick" data-fac="${f.id}">+ Add</button><button class="btn small ghost" data-act="grpNewChar" data-fac="${f.id}">+ New ${G.knot ? "participant" : "character"}</button></div>
        </section>`;
      }).join("") || empty(G.knot ? "No knots yet: + New knot" + (candidates.length ? ", or make some of your factions knots." : ".") : "No factions yet: + New group.")}
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
// a new character, already in the group (on the knots board: a participant)
ACT.grpNewChar = el => {
  const G = groupFields(), fac = byId(DB.entries, el.dataset.fac), pf = G.knot && participantField();
  entryEditor(newEntry({ kind: G.ck.id, fields: pf ? { [pf.id]: true } : {} }), true, { after: e => {
    if (G.knot) markParticipant(e);
    if (fac) joinGroup(e.id, fac, G);
    toast(fac ? `${e.name} joined ${fac.name}` : `${e.name} added${G.knot ? " as a participant" : ""}`);
  } });
};
// a new group; a new knot comes numbered
ACT.grpNew = () => {
  const G = groupFields();
  if (!G.knot) return entryEditor(newEntry({ kind: G.fk.id }), true, { after: () => {} });
  const nums = DB.entries.filter(e => e.kind === "knot").map(e => parseFloat(G.num && e.fields?.[G.num.id]) || parseFloat(e.name.match(/\d+/)?.[0])).filter(n => !isNaN(n));
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  entryEditor(newEntry({ kind: "knot", name: "Knot " + n, fields: G.num ? { [G.num.id]: n } : {} }), true, { after: () => {} });
};
/* factions that are really knots become knots: the same entries, with their
   members, captain and everything else kept (a faction field a knot doesn't
   have is kept as one of the entry's own fields), and their members become
   participants */
ACT.knotConvert = () => {
  const facs = DB.entries.filter(e => e.kind === "faction").sort((a, b) => a.name.localeCompare(b.name));
  const guess = e => /^(knot|group)\s*#?\s*\d+\b/i.test(e.name.trim());
  modal({ title: "Make some factions knots", wide: true,
    body: `<p class="muted">Tick the factions that are knots of the competition. They stay the same entries, with everything in them; their members become participants. The numbered ones are ticked for you.</p>
      <div class="g-pick">${facs.map(e => `<label class="check"><input type="checkbox" name="f_${e.id}" ${guess(e) ? "checked" : ""}> ${esc(e.name)}${e.summary ? ` <small class="muted">${esc(plainLinks(e.summary).slice(0, 70))}</small>` : ""}</label>`).join("")}</div>`,
    buttons: [{ label: "Cancel" }, { label: "Make them knots", cls: "accent", act: w => {
      const v = formVals(w), pick = facs.filter(e => v["f_" + e.id]);
      if (!pick.length) return;
      const snap = JSON.stringify(DB);
      const fk = byId(DB.kinds, "faction"), kk = byId(DB.kinds, "knot");
      const alias = { "notable members": "members", leader: "captain", leaders: "captain" };
      const num = kk.fields.find(f => norm(f.name) === "number");
      for (const e of pick) {
        const out = {}, extra = [...(e.extra || [])];
        for (const [fid, val] of Object.entries(e.fields || {})) {
          const f = fk.fields.find(x => x.id === fid);
          if (!f) { out[fid] = val; continue; }
          const n = alias[norm(f.name)] || norm(f.name), to = kk.fields.find(x => norm(x.name) === n && (x.type === f.type || (["link", "links"].includes(x.type) && ["link", "links"].includes(f.type))));
          if (to) out[to.id] = to.type === "links" && !Array.isArray(val) ? asList(val) : to.type === "link" && Array.isArray(val) ? val[0] : val;
          else if (!isEmptyVal(val)) extra.push({ name: f.name, value: ["link", "links"].includes(f.type) ? asList(val).map(id => byId(DB.entries, id)?.name).filter(Boolean).map(n => `[[${n}]]`).join(", ") : f.type === "date" ? fmtDate(val) : f.type === "yesno" ? (val ? "Yes" : "No") : String(val) });
        }
        const n = parseFloat(e.name.match(/\d+/)?.[0]);
        if (num && out[num.id] == null && !isNaN(n)) out[num.id] = n;
        e.kind = "knot"; e.fields = out; e.extra = extra; e.updated = Date.now();
        for (const m of groupMembers(e, groupFields("knot"))) markParticipant(m.e);
      }
      commit();
      toast(`${plural(pick.length, "faction")} made knots`, { undo: () => { DB = normalizeDB(JSON.parse(snap)); commit(); } });
    } }] });
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
