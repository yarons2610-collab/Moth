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

const GRP = { q: "", type: "", board: "faction", sort: "num" };
try { GRP.sort = localStorage.getItem("moth_knot_sort") || "num"; } catch {}
// how the knots board can be ordered
const KNOT_SORTS = { num: "Number, ascending", numdown: "Number, descending", status: "Current status", middle: "Middle status", final: "Final status", score: "Score, highest first", name: "Name, A to Z" };
const fieldNamed = (k, names, types) => k?.fields.find(f => names.includes(norm(f.name)) && (!types || types.includes(f.type)));
function groupFields(kindId = GRP.board) {
  const fk = byId(DB.kinds, kindId), ck = byId(DB.kinds, "character"), knot = kindId === "knot";
  return {
    fk, ck, knot,
    mem: fieldNamed(fk, ["members", "notable members"], ["links"]),
    lead: fieldNamed(fk, ["captain", "leader", "leaders"], ["link", "links"]),
    alleg: knot ? null : fieldNamed(ck, ["allegiance", "allegiances", "faction", "factions"], ["link", "links"]),
    type: fieldNamed(fk, knot ? ["current status", "status"] : ["type"], ["choice", "text"]),
    middle: knot ? fieldNamed(fk, ["middle status"], ["choice", "text"]) : null,
    final: knot ? fieldNamed(fk, ["final status"], ["choice", "text"]) : null,
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
// a knot of one is captained by that one (unless it has a captain already)
function soloCaptains(db = DB) {
  const kk = db.kinds.find(k => k.id === "knot");
  if (!kk) return;
  const mem = kk.fields.find(f => ["members", "notable members"].includes(norm(f.name)) && f.type === "links");
  const cap = kk.fields.find(f => ["captain", "leader"].includes(norm(f.name)) && ["link", "links"].includes(f.type));
  if (!mem || !cap) return;
  for (const e of db.entries) {
    if (e.kind !== "knot" || asList(e.fields?.[cap.id]).length) continue;
    const ms = asList(e.fields?.[mem.id]).filter(id => db.entries.some(x => x.id === id));
    if (ms.length === 1) e.fields[cap.id] = cap.type === "links" ? [ms[0]] : ms[0];
  }
}
/* what's shown beside a name on the board: ♂ / ♀ (from Gender, or else from
   Pronouns), and the emoji of each of the three specialties */
const SPECS = [["magical", "Magical"], ["martial", "Martial"], ["utility", "Utility"]];
const specField = key => byId(DB.kinds, "character")?.fields.find(f => norm(f.name) === key + " specialty");
function genderOf(e) {
  const ck = byId(DB.kinds, "character"), f = ck?.fields.find(x => ["gender", "sex"].includes(norm(x.name)));
  const v = norm(f && e.fields?.[f.id] || "");
  if (/^(m|male|man|boy)$/.test(v)) return "m";
  if (/^(f|female|woman|girl)$/.test(v)) return "f";
  if (v) return "";
  const pr = ck?.fields.find(x => norm(x.name) === "pronouns"), p = norm(pr && e.fields?.[pr.id] || "");
  return /^he\b/.test(p) ? "m" : /^she\b/.test(p) ? "f" : "";
}
function charMarks(e) {
  const g = genderOf(e);
  const specs = SPECS.map(([k, label]) => { const f = specField(k), v = f && e.fields?.[f.id]; return v ? `<span class="g-spec" title="${label}: ${esc(v)}">${f.icons?.[v] || "•"}</span>` : ""; }).join("");
  return `${g ? `<span class="g-sex ${g}" title="${g === "m" ? "Male" : "Female"}">${g === "m" ? "♂" : "♀"}</span>` : ""}${specs ? `<span class="g-specs">${specs}</span>` : ""}`;
}
// the three specialties' options, each with its emoji
ACT.specManage = () => {
  const row = (o = "", icon = "") => `<div class="spec-row" data-old="${esc(o)}">${emojiPicker(icon, { name: "", lazy: true, blank: "＋" })}<input class="spec-name" value="${esc(o)}" placeholder="e.g. Fire weaving"><button type="button" class="mini" data-act="specDel" title="Remove this option">✕</button></div>`;
  modal({ title: "Specialties", wide: true,
    body: `<p class="muted">Every character can have one specialty of each kind. Make the options here and give each an emoji: they show beside names on the knots board. Renaming an option renames it for everyone who has it.</p>
      <div class="spec-cols">${SPECS.map(([k, label]) => { const f = specField(k); return `<section class="spec-col" data-k="${k}"><h4>${label}</h4>
        <div class="spec-list">${(f?.opts || []).map(o => row(o, f.icons?.[o] || "")).join("")}</div>
        <button type="button" class="btn small" data-act="specAdd">+ Option</button></section>`; }).join("")}</div>`,
    onOpen: w => { w._row = row; },
    buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
      const snap = JSON.stringify(DB);
      let renamed = 0, orphan = 0;
      for (const [k] of SPECS) {
        const f = specField(k);
        if (!f) continue;
        const rows = $$(`.spec-col[data-k="${k}"] .spec-row`, w).map(r => ({ old: r.dataset.old, name: $(".spec-name", r).value.trim(), icon: $(".icon-input", r).value.trim() })).filter(r => r.name);
        const names = rows.map(r => r.name);
        if (new Set(names.map(norm)).size !== names.length) { toast(`Two ${k} options have the same name`); return false; }
        // renamed options follow everyone who has them
        const map = new Map(rows.filter(r => r.old && r.old !== r.name).map(r => [r.old, r.name]));
        for (const e of DB.entries) { const v = e.fields?.[f.id]; if (v && map.has(v)) { e.fields[f.id] = map.get(v); renamed++; } }
        f.opts = names;
        f.icons = Object.fromEntries(rows.filter(r => r.icon).map(r => [r.name, r.icon]));
        orphan += DB.entries.filter(e => { const v = e.fields?.[f.id]; return v && !names.includes(v); }).length;
      }
      commit();
      toast(["Specialties saved", renamed && `${plural(renamed, "character")} renamed with them`, orphan && `${plural(orphan, "character")} still have an option you removed (it stays on their page)`].filter(Boolean).join("; "), { undo: () => { DB = normalizeDB(JSON.parse(snap)); commit(); } });
    } }] });
};
ACT.specAdd = el => { const w = el.closest(".modal-wrap"), list = $(".spec-list", el.closest(".spec-col")); list.insertAdjacentHTML("beforeend", w._row()); $$(".spec-name", list).pop().focus(); };
ACT.specDel = el => el.closest(".spec-row").remove();
/* the ▾ beside a name: set gender and the three specialties right there.
   Each tap saves at once and updates the marks beside the name. */
const genderField = () => byId(DB.kinds, "character")?.fields.find(x => ["gender", "sex"].includes(norm(x.name)));
function quickPanel(e) {
  const gf = genderField(), gv = gf && e.fields?.[gf.id];
  const gopts = gf?.type === "choice" && gf.opts?.length ? gf.opts : ["Male", "Female", "Other"];
  const sym = o => /^m(ale)?$/i.test(o) ? "♂ " : /^f(emale)?$/i.test(o) ? "♀ " : "";
  return `<div class="qp-h"><b>${esc(e.name)}</b><button class="mini" data-act="quickClose" aria-label="Close">×</button></div>
    ${gf ? `<div class="qp-row"><span>Gender</span><div class="qp-opts">${gopts.map(o => `<button class="qp-opt ${o === gv ? "on" : ""} ${/^m/i.test(o) ? "m" : /^f/i.test(o) ? "f" : ""}" data-act="quickSet" data-f="${gf.id}" data-v="${esc(o)}">${sym(o)}${esc(o)}</button>`).join("")}</div></div>` : ""}
    ${SPECS.map(([k, label]) => {
      const f = specField(k), v = f && e.fields?.[f.id];
      if (!f) return "";
      return `<div class="qp-row"><span>${label}</span><div class="qp-opts">${(f.opts || []).map(o => `<button class="qp-opt ${o === v ? "on" : ""}" data-act="quickSet" data-f="${f.id}" data-v="${esc(o)}" title="${esc(o)}">${f.icons?.[o] ? `<span class="qp-ic">${f.icons[o]}</span>` : ""}${esc(o)}</button>`).join("") || `<small class="muted">No options yet: <a data-act="specManage">⚙ Specialties</a></small>`}</div></div>`;
    }).join("")}
    <a class="qp-link" href="#/e/${e.id}">Open ${esc(e.name)}'s page →</a>`;
}
ACT.quickChar = el => {
  const e = byId(DB.entries, el.dataset.char);
  if (!e) return;
  ACT.quickClose();
  const pop = document.createElement("div");
  pop.className = "quick-pop";
  pop.dataset.char = e.id;
  pop.innerHTML = quickPanel(e);
  document.body.append(pop);
  // beside the ▾, kept on screen
  const r = el.getBoundingClientRect(), w = Math.min(340, innerWidth - 16);
  pop.style.width = w + "px";
  pop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
  const h = pop.offsetHeight;
  pop.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
};
ACT.quickSet = el => {
  const pop = el.closest(".quick-pop"), e = byId(DB.entries, pop.dataset.char), f = el.dataset.f, v = el.dataset.v;
  e.fields ||= {};
  if (e.fields[f] === v) delete e.fields[f]; else e.fields[f] = v; // tap again to clear
  e.updated = Date.now();
  save({ quiet: true });
  if (pop.dataset.knot) { pop.innerHTML = knotPanel(e); const meta = $(`.gcol[data-fac="${e.id}"] .gcol-meta`); if (meta) meta.innerHTML = knotPills(e); return; }
  pop.innerHTML = quickPanel(e);
  for (const m of $$(`.gchip[data-char="${e.id}"] .g-marks`)) m.innerHTML = charMarks(e);
};
// a knot's statuses and score, as pills on its card
function knotPills(f, G = groupFields("knot")) {
  const sf = fieldNamed(G.fk, ["score"]), val = x => x && f.fields?.[x.id];
  const cur = val(G.type), mid = val(G.middle), fin = val(G.final), sc = val(sf);
  return [cur && `<span class="pill" title="Current status">${esc(cur)}</span>`, mid && `<span class="pill" title="Middle status">Middle: ${esc(mid)}</span>`,
    fin && `<span class="pill final" title="Final status">Final: ${esc(fin)}</span>`, sc != null && sc !== "" && `<span class="pill">Score ${esc(sc)}</span>`].filter(Boolean).join("");
}
// the ▾ on a knot's card: its three statuses and its score, right there
function knotPanel(k) {
  const G = groupFields("knot"), sf = fieldNamed(G.fk, ["score"]);
  const row = (f, label) => f ? `<div class="qp-row"><span>${label}</span><div class="qp-opts">${(f.opts || []).map(o => `<button class="qp-opt ${o === k.fields?.[f.id] ? "on" : ""}" data-act="quickSet" data-f="${f.id}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div></div>` : "";
  return `<div class="qp-h"><b>${esc(k.name)}</b><button class="mini" data-act="quickClose" aria-label="Close">×</button></div>
    ${row(G.type, "Current status")}${row(G.middle, "Middle status")}${row(G.final, "Final status")}
    ${sf ? `<div class="qp-row"><span>Score</span><input type="number" step="any" class="qp-score" value="${esc(k.fields?.[sf.id] ?? "")}" data-input="quickScore" data-f="${sf.id}" placeholder="—"></div>` : ""}
    <a class="qp-link" href="#/e/${k.id}">Open ${esc(k.name)}'s page →</a>`;
}
ACT.quickKnot = el => {
  const k = byId(DB.entries, el.dataset.knot);
  if (!k) return;
  ACT.quickClose();
  const pop = document.createElement("div");
  pop.className = "quick-pop";
  pop.dataset.char = k.id;
  pop.dataset.knot = "1";
  pop.innerHTML = knotPanel(k);
  document.body.append(pop);
  const r = el.getBoundingClientRect(), w = Math.min(360, innerWidth - 16);
  pop.style.width = w + "px";
  pop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
  const h = pop.offsetHeight;
  pop.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
};
ACT.quickScore = el => {
  const pop = el.closest(".quick-pop"), k = byId(DB.entries, pop.dataset.char), v = el.value.trim();
  k.fields ||= {};
  if (v === "") delete k.fields[el.dataset.f]; else k.fields[el.dataset.f] = isNaN(+v) ? v : +v;
  k.updated = Date.now();
  save({ quiet: true });
  const meta = $(`.gcol[data-fac="${k.id}"] .gcol-meta`); if (meta) meta.innerHTML = knotPills(k);
};
ACT.quickClose = () => { for (const p of $$(".quick-pop")) p.remove(); };
document.addEventListener("pointerdown", e => { if ($(".quick-pop") && !e.target.closest(".quick-pop, [data-act=quickChar], [data-act=quickKnot]")) ACT.quickClose(); }, true);
document.addEventListener("keydown", e => { if (e.key === "Escape" && $(".quick-pop")) ACT.quickClose(); });
on("route", () => ACT.quickClose());
const participantField = () => byId(DB.kinds, "character")?.fields.find(f => norm(f.name) === "participant");
const isParticipant = e => { const f = participantField(); return !!(f && e.fields?.[f.id]); };
function markParticipant(e) { const f = participantField(); if (f && e && e.kind === "character" && !e.fields?.[f.id]) { (e.fields ||= {})[f.id] = true; e.updated = Date.now(); } }

function knotSorter(G, numOf) {
  const byNum = (a, b) => numOf(a) - numOf(b) || a.name.localeCompare(b.name);
  const sf = fieldNamed(G.fk, ["score"]), st = G.type;
  const val = (e, f) => f ? e.fields?.[f.id] : undefined;
  switch (GRP.sort) {
    case "numdown": return (a, b) => -byNum(a, b);
    case "name": return (a, b) => a.name.localeCompare(b.name);
    // the first row (Competing / Underground / Winner) by number; then the rest,
    // by status in the order the choices are listed in the Knot kind, then by number
    case "status": case "middle": case "final": {
      const t = knotTier(G), f = t.f;
      const rank = e => { const v = val(e, f); const i = (f?.opts || []).indexOf(v); return v ? (i < 0 ? 900 : i) : 999; };
      return (a, b) => t.top(b) - t.top(a) || (t.top(a) ? 0 : rank(a) - rank(b)) || byNum(a, b);
    }
    case "score": { const sc = e => { const n = parseFloat(val(e, sf)); return isNaN(n) ? -Infinity : n; }; return (a, b) => sc(b) - sc(a) || byNum(a, b); }
    default: return byNum;
  }
}
// ordering by a status splits the knots in two rows: those with the status that
// matters (still competing, underground, the winners) and everyone else
const KNOT_TIERS = { status: ["type", "competing", "Competing", "Not competing"], middle: ["middle", "underground", "Underground", "Not underground"], final: ["final", "winner", "Winners", "Not winners"] };
function knotTier(G) {
  const [key, want, label, rest] = KNOT_TIERS[GRP.sort] || [];
  const f = key && G[key];
  return { f, label, rest, on: !!f, top: e => f && norm(String(e.fields?.[f.id] ?? "")) === want ? 1 : 0 };
}
ACT.knotSort = el => { GRP.sort = el.value; try { localStorage.setItem("moth_knot_sort", GRP.sort); } catch {} rerender(); };

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
    .sort(G.knot ? knotSorter(G, numOf) : (a, b) => a.name.localeCompare(b.name));
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
    ${G.knot ? `<span class="g-marks">${charMarks(e)}</span><button class="mini g-more" data-act="quickChar" data-char="${e.id}" title="Gender and specialties" aria-label="Gender and specialties of ${esc(e.name)}">▾</button>` : ""}
    ${why?.has("leader") ? `<small class="g-why" title="${G.knot ? "Captain" : "Leader"}">★</small>` : ""}${why && !why.has("member") && !why.has("leader") ? `<small class="g-why" title="Through their Allegiance">⚑</small>` : ""}
    ${fac ? `<button class="mini" data-act="grpLeave" data-char="${e.id}" data-fac="${fac.id}" title="Take ${esc(e.name)} out of ${esc(fac.name)}">✕</button>` : ""}</span>`;
  return [`<div class="page wide groups-page">${webTabs("groups")}
    <div class="page-h"><h2>${G.knot ? "Knots" : "Groups"}</h2>${boards}<div class="spacer"></div>
      ${searchBox("grpFilter", GRP.q, "Find a character…")}
      ${G.knot ? `<label class="inline">Order <select data-change="knotSort">${Object.entries(KNOT_SORTS).map(([k, l]) => `<option value="${k}" ${k === GRP.sort ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
      ${types.length ? `<select data-change="grpType"><option value="">${G.knot ? "Every current status" : "All kinds of group"}</option>${types.map(t => `<option ${t === GRP.type ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>` : ""}
      ${candidates.length ? `<button class="btn" data-act="knotConvert">Make some factions knots…</button>` : ""}
      ${G.knot ? `<button class="btn" data-act="specManage" title="The options for the three specialties, and their emojis">⚙ Specialties</button>` : ""}
      <button class="btn accent" data-act="grpNew">+ New ${what}</button></div>
    <p class="muted small">Drag a character onto a ${what} to add them (from one ${what} to another to move them; hold Ctrl or ⌘ to add them to both), or use + Add. ★ ${G.knot ? "captains the knot" : "leads the group; ⚑ is there through their own Allegiance"}.${G.knot ? " Everyone in a knot is a participant in the competition." : ""}</p>
    <div class="groups-board">
      <section class="gcol free" data-fac="">
        <div class="gcol-h"><b>${G.knot ? (GRP.type ? `Participants not in a ${esc(GRP.type.toLowerCase())} knot` : "Participants not in a knot") : GRP.type ? `Not in any ${esc(GRP.type.toLowerCase())}` : "Not in any group"}</b><small>${free.length}</small></div>
        <div class="gcol-list">${free.map(e => person(e)).join("") || `<p class="muted small">${q ? "No one by that name." : G.knot ? "Every participant is in a knot." : "Everyone belongs somewhere."}</p>`}</div>
        ${G.knot ? `<p class="muted small">Only participants are listed${others ? `; ${plural(others, "other character")} aren't (+ Add on a knot lists everyone, or tick Participant on a character's page)` : ""}.</p>` : ""}
        <button class="btn small ghost" data-act="grpNewChar" data-fac="">+ New ${G.knot ? "participant" : "character"}</button>
      </section>
      ${facs.map((f, i) => {
        const tier = G.knot ? knotTier(G) : null;
        const brk = tier?.on && i > 0 && tier.top(facs[i - 1]) && !tier.top(f)
          ? `<div class="gbreak"><span>${esc(tier.rest)}</span><small>${facs.length - i}</small></div>` : "";
        const head = tier?.on && i === 0 && tier.top(f) && facs.some(x => !tier.top(x))
          ? `<div class="gbreak first"><span>${esc(tier.label)}</span><small>${facs.filter(x => tier.top(x)).length}</small></div>` : "";
        const ms = groupMembers(f, G).filter(m => match(m.e) || !q);
        return `${head}${brk}<section class="gcol" data-fac="${f.id}" style="--c:${entryColor(f)}">
          <div class="gcol-h"><a href="#/e/${f.id}">${f.portrait ? assetImg(f.portrait, "g-pic") : `<span>${kindOf(f).icon}</span>`} <b>${esc(f.name)}</b></a><small>${ms.length}</small>
            ${G.knot ? `<button class="mini g-more" data-act="quickKnot" data-knot="${f.id}" title="Statuses and score" aria-label="Statuses and score of ${esc(f.name)}">▾</button>` : ""}</div>
          ${G.knot ? `<div class="gcol-meta">${knotPills(f, G)}</div>` : ""}
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
