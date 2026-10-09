"use strict";
/* ── codex ── characters, places, factions, items, lore, creatures, or any
   kind the world defines, each with its own fields. Entries hold relationships
   to each other; a relationship can also be a family tie (see family.js). */

const CODEX = { kind: "", q: "", tag: "" };

linkType("e", {
  list: () => DB.entries,
  names: e => [e.name, ...(e.aliases || [])],
  info: e => ({ title: e.name, sub: kindOf(e).name, icon: kindOf(e).icon, color: entryColor(e) }),
  href: e => "#/e/" + e.id,
  text: e => [e.summary, e.body, ...kindOf(e).fields.map(f => fieldText(f, e.fields?.[f.id])), ...(e.extra || []).map(x => x.name + " " + x.value)].join("\n"),
  edges: e => [
    ...(e.rels || []).map(r => ["e", r.to, r.label || "related"]),
    ...kindOf(e).fields.flatMap(f => fieldLinks(f, e.fields?.[f.id]).map(id => ["e", id, f.name])),
  ],
});

/* relationships ── a rel on A reads "A is <label> B". Its type makes it a family
   tie: "child" means A is B's child, "parent" A is B's parent. Older worlds with
   only labels like "daughter of" are recognised from the wording. */
const REL_TYPES = { "": "Not family", parent: "Parent of", child: "Child of", spouse: "Spouse of", sibling: "Sibling of" };
function relTypeFromLabel(label) {
  const l = norm(label);
  if (/\b(daughter|son|child|heir|offspring)\b.*\bof\b/.test(l)) return "child";
  if (/\b(mother|father|parent)\b.*\bof\b/.test(l)) return "parent";
  if (/\b(wife|husband|spouse|consort|married|wed)\b/.test(l)) return "spouse";
  if (/\b(sister|brother|sibling|twin)\b/.test(l)) return "sibling";
  return "";
}
const relType = r => r.type ?? relTypeFromLabel(r.label);
// "A is rival of B", but "A lives in B" and "A has sworn to B": no "is" before a verb
const relVerb = label => /^(is|was|has|had|owes)\b/i.test(label) || /^\w+s\b/i.test(label) && !/^\w+(ss|us|is)\b/i.test(label) ? "" : "is ";
const REL_LABEL = { parent: "parent of", child: "child of", spouse: "spouse of", sibling: "sibling of" };
function relsOf(e) {
  const out = (e.rels || []).map(r => ({ r, from: e, to: byId(DB.entries, r.to), own: true })).filter(x => x.to);
  for (const o of DB.entries) if (o !== e) for (const r of o.rels || []) if (r.to === e.id) out.push({ r, from: o, to: e, own: false });
  return out;
}
const lifespan = e => {
  const k = kindOf(e), bits = [];
  if (e.start) bits.push(`${k.startLabel || "From"} ${fmtDate(e.start)}`);
  if (e.end) bits.push(`${k.endLabel || "Until"} ${fmtDate(e.end)}`);
  if (k.id === "character" && e.start) {
    const a = ageAt(e.start, e.end && dateKey(e.end) <= dateKey(NOW()) ? e.end : NOW());
    if (a != null && a >= 0) bits.push(e.end && dateKey(e.end) <= dateKey(NOW()) ? `died aged ${a}` : `age ${a}`);
  }
  return bits.join(" · ");
};

/* ── the codex list ── ordered one way and grouped another: grouped by kind,
   by tag, or by any choice, yes/no or link field (Role in the story, Status,
   Allegiance…), with choice groups in the order the choices are listed. */
const SORTS = { az: "A to Z", za: "Z to A", recent: "Recently changed", added: "Newest in the codex", born: "Oldest first (in the world)",
  young: "Youngest first (in the world)", story: "Order of appearance in the story", linked: "Most connected" };
try { Object.assign(CODEX, JSON.parse(localStorage.getItem("moth_codex_view") || "{}")); } catch {}
const keepCodexView = () => { try { localStorage.setItem("moth_codex_view", JSON.stringify({ sort: CODEX.sort, group: CODEX.group })); } catch {} };
const GROUPABLE = new Set(["choice", "yesno", "link", "links"]);
// the fields worth grouping or ordering by, by name, across the kinds in view
function codexFields(kinds, types) {
  const out = new Map();
  for (const k of kinds) for (const f of k.fields) if (types.has(f.type)) {
    const n = norm(f.name);
    const o = out.get(n) || out.set(n, { name: f.name, type: f.type, opts: [], kinds: 0 }).get(n);
    o.kinds++;
    for (const c of f.opts || []) if (!o.opts.includes(c)) o.opts.push(c);
  }
  return [...out].sort((a, b) => b[1].kinds - a[1].kinds || a[1].name.localeCompare(b[1].name));
}
const fieldOf = (e, n) => kindOf(e).fields.find(f => norm(f.name) === n);
// the values an entry is grouped under for a field (links: every entry linked)
function groupVals(e, n) {
  const f = fieldOf(e, n), v = f && e.fields?.[f.id];
  if (!f || isEmptyVal(v) && f.type !== "yesno") return [];
  if (f.type === "yesno") return [v ? "Yes" : "No"];
  if (f.type === "link" || f.type === "links") return (Array.isArray(v) ? v : [v]).filter(id => byId(DB.entries, id)).map(id => "e:" + id);
  return [String(v)];
}
// where each entry first turns up in the story, in reading order: a chapter's
// summary, then its scenes (POV, setting, or mentioned)
function storyOrder() {
  return derived("storyOrder", () => {
    const first = new Map();
    let i = 0;
    const see = ids => { for (const id of ids) if (id && !first.has(id)) first.set(id, i); i++; };
    const named = text => mentionsIn(text || "").filter(m => m.t === "e").map(m => m.it.id);
    for (const book of DB.books) for (const ch of book.chapters || []) {
      see(named(ch.summary));
      for (const sc of ch.scenes || []) see([sc.pov, sc.setting, ...named(sc.summary + "\n" + sc.body)]);
    }
    return first;
  });
}
function codexSorter(sort) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const life = (a, b, dir) => { const x = dateKey(a.start), y = dateKey(b.start); return x === y ? byName(a, b) : x === -Infinity ? 1 : y === -Infinity ? -1 : (x - y) * dir; };
  if (sort === "za") return (a, b) => -byName(a, b);
  if (sort === "recent") return (a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0);
  if (sort === "added") return (a, b) => (b.created || 0) - (a.created || 0) || byName(a, b);
  if (sort === "born") return (a, b) => life(a, b, 1);
  if (sort === "young") return (a, b) => life(a, b, -1);
  if (sort === "story") { const o = storyOrder(); return (a, b) => (o.get(a.id) ?? Infinity) - (o.get(b.id) ?? Infinity) || byName(a, b); }
  if (sort === "linked") { const n = e => backlinks("e", e.id).length + relsOf(e).length; return (a, b) => n(b) - n(a) || byName(a, b); }
  if (sort?.startsWith("f:")) {
    // by a choice field, in the order its choices are listed; then by a number field, highest first
    const n = sort.slice(2);
    const rank = e => { const f = fieldOf(e, n), v = f && e.fields?.[f.id]; if (!f || isEmptyVal(v)) return Infinity; return f.type === "number" ? -(+v || 0) : (f.opts || []).indexOf(v) + 1 || 999; };
    return (a, b) => rank(a) - rank(b) || byName(a, b);
  }
  return byName;
}
addRoute("codex", "codex", kind => {
  if (kind !== undefined) CODEX.kind = kind;
  CODEX.sort ||= "az";
  const q = norm(CODEX.q);
  const inView = CODEX.kind ? DB.kinds.filter(k => k.id === CODEX.kind) : DB.kinds;
  const groupFields = codexFields(inView, GROUPABLE), sortFields = codexFields(inView, new Set(["choice", "number"]));
  if (CODEX.sort.startsWith("f:") && !sortFields.some(([n]) => "f:" + n === CODEX.sort)) CODEX.sort = "az";
  let group = CODEX.group || "kind";
  if (group.startsWith("f:") && !groupFields.some(([n]) => "f:" + n === group)) group = "kind";
  if (group === "kind" && CODEX.kind) group = "none";
  const list = DB.entries.filter(e =>
    (!CODEX.kind || e.kind === CODEX.kind) &&
    (!CODEX.tag || (e.tags || []).includes(CODEX.tag)) &&
    (!q || [e.name, ...(e.aliases || []), e.summary, ...(e.tags || [])].some(s => norm(s).includes(q)))
  ).sort(codexSorter(CODEX.sort));
  const counts = k => DB.entries.filter(e => e.kind === k).length;
  // groups: [heading html, entries]
  let groups;
  const newBtn = k => `<button class="btn small ghost" data-act="newEntry" data-kind="${k.id}">+ ${esc(k.name)}</button>`;
  if (group === "kind") {
    // "All" is grouped by kind, in the kinds' own order, so it reads like a contents page
    groups = DB.kinds.map(k => [`<a href="#/codex/${k.id}">${k.icon} ${esc(kindPlural(k.name))}</a>`, list.filter(e => e.kind === k.id), k.color, newBtn(k)])
      .concat([["◆ Other", list.filter(e => !byId(DB.kinds, e.kind))]]);
  } else if (group === "tag") {
    const tags = [...new Set(list.flatMap(e => e.tags || []))].sort((a, b) => a.localeCompare(b));
    groups = tags.map(t => [`<a data-act="codexTag" data-tag="${esc(t)}">#${esc(t)}</a>`, list.filter(e => (e.tags || []).includes(t))])
      .concat([["No tags", list.filter(e => !(e.tags || []).length)]]);
  } else if (group.startsWith("f:")) {
    const n = group.slice(2), info = groupFields.find(([x]) => x === n)[1];
    const vals = new Map();
    for (const e of list) for (const v of groupVals(e, n)) (vals.get(v) || vals.set(v, []).get(v)).push(e);
    const keys = [...vals.keys()].sort((a, b) => {
      const ia = info.opts.indexOf(a), ib = info.opts.indexOf(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      if (a === "Yes" || b === "No") return -1;
      if (a === "No" || b === "Yes") return 1;
      const na = a.startsWith("e:") ? byId(DB.entries, a.slice(2)).name : a, nb = b.startsWith("e:") ? byId(DB.entries, b.slice(2)).name : b;
      return na.localeCompare(nb);
    });
    groups = keys.map(v => {
      if (!v.startsWith("e:")) return [esc(v), vals.get(v)];
      const to = byId(DB.entries, v.slice(2));
      return [`<a href="#/e/${to.id}">${kindOf(to).icon} ${esc(to.name)}</a>`, vals.get(v), entryColor(to)];
    }).concat([[`No ${esc(info.name.toLowerCase())}`, list.filter(e => !groupVals(e, n).length)]]);
  } else groups = [[null, list]];
  groups = groups.filter(([, l]) => l.length);
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;
  return `<div class="page">
    <div class="page-h"><h2>Codex</h2><div class="spacer"></div>
      ${searchBox("codexFilter", CODEX.q, "Filter the codex…")}
      <button class="btn accent" data-act="newEntry" data-kind="${CODEX.kind}">+ New ${esc(CODEX.kind ? byId(DB.kinds, CODEX.kind)?.name || "entry" : "entry")}</button></div>
    <div class="chips-row">
      <a class="fchip ${!CODEX.kind ? "on" : ""}" href="#/codex/">All <small>${DB.entries.length}</small></a>
      ${DB.kinds.map(k => { const n = counts(k.id); return `<a class="fchip ${CODEX.kind === k.id ? "on" : ""} ${n ? "" : "none"}" href="#/codex/${k.id}" style="--c:${k.color}">${k.icon} ${esc(k.name)} <small>${n}</small></a>`; }).join("")}
      ${CODEX.tag ? `<button class="fchip on" data-act="codexTag" data-tag="">#${esc(CODEX.tag)} ✕</button>` : ""}
    </div>
    <div class="codex-view">
      <label class="inline">Order <select data-change="codexSort">${Object.entries(SORTS).map(([k, l]) => opt(k, l, CODEX.sort)).join("")}
        ${sortFields.length ? `<optgroup label="By a field">${sortFields.map(([n, f]) => opt("f:" + n, "By " + f.name.toLowerCase() + (f.type === "number" ? " (highest first)" : ""), CODEX.sort)).join("")}</optgroup>` : ""}</select></label>
      <label class="inline">Group by <select data-change="codexGroup">
        ${CODEX.kind ? "" : opt("kind", "Kind", group)}${opt("none", "Nothing", group)}${opt("tag", "Tag", group)}
        ${groupFields.length ? `<optgroup label="A field">${groupFields.map(([n, f]) => opt("f:" + n, f.name, group)).join("")}</optgroup>` : ""}</select></label>
      <span class="muted">${plural(list.length, "entry")}</span>
    </div>
    ${list.length ? groups.map(([h, l, c, extra]) => `${h ? `<h3 class="codex-group" style="--c:${c || "var(--ink)"}"><span>${h}</span> <small>${l.length}</small>${extra || ""}</h3>` : ""}
      <div class="cards">${l.map(entryCard).join("")}</div>`).join("")
      : empty(DB.entries.length ? "Nothing matches." : "The codex is empty. Add a first character, place or legend.")}
  </div>`;
});
ACT.codexSort = el => { CODEX.sort = el.value; keepCodexView(); rerender(); };
ACT.codexGroup = el => { CODEX.group = el.value; keepCodexView(); rerender(); };
function entryCard(e) {
  const k = kindOf(e);
  return `<a class="card" href="#/e/${e.id}" style="--c:${entryColor(e)}">
    <div class="card-pic">${e.portrait ? assetImg(e.portrait) : `<span>${k.icon}</span>`}</div>
    <div class="card-b"><b>${esc(e.name)}${e.pc ? ` <span class="pc-badge">PC</span>` : ""}</b>
      <small>${esc(k.name)}${lifespan(e) ? " · " + esc(lifespan(e)) : ""}</small>
      ${e.summary ? `<p>${esc(e.summary)}</p>` : ""}
      ${(e.tags || []).length ? `<div class="tags">${tagsHtml(e.tags)}</div>` : ""}</div>
  </a>`;
}
ACT.codexFilter = el => { CODEX.q = el.value; rerender(); refocus(".page-h .search"); };
ACT.codexTag = el => { CODEX.tag = el.dataset.tag; go("#/codex/" + CODEX.kind); };

/* ── an entry's page ── */
addRoute("e", "codex", id => {
  const e = byId(DB.entries, id);
  if (!e) return `<div class="page">${empty("That entry doesn't exist any more.")}</div>`;
  const k = kindOf(e);
  // the untitled section (the basics) goes beside the article, the rest below it
  const filled = f => !isEmptyVal(e.fields?.[f.id]);
  const kv = f => `<div class="kv ${f.secret ? "secret-field" : ""}"><span>${f.secret ? "🙈 " : ""}${esc(f.name)}</span><div>${fieldShow(f, e.fields[f.id])}</div></div>`;
  const secs = fieldSections(k.fields);
  const basics = (secs.find(([s]) => s === "")?.[1] || []).filter(filled);
  const emptyCount = k.fields.filter(f => !filled(f)).length;
  const sections = secs.filter(([s]) => s).map(([s, fs]) => {
    const got = fs.filter(filled);
    if (!got.length) return "";
    const short = got.filter(f => SHORT.has(f.type)), long = got.filter(f => !SHORT.has(f.type));
    return `<section class="panel field-sec"><div class="panel-h"><h4>${esc(s)}</h4></div>
      ${short.length ? `<div class="kvs grid2">${short.map(kv).join("")}</div>` : ""}
      ${long.map(f => `<div class="field-block ${f.secret ? "secret-field" : ""}"><h5>${f.secret ? "🙈 " : ""}${esc(f.name)}</h5>${fieldShow(f, e.fields[f.id])}</div>`).join("")}</section>`;
  }).join("") + ((e.extra || []).length ? `<section class="panel field-sec"><div class="panel-h"><h4>More</h4></div>
    ${e.extra.map(x => `<div class="field-block"><h5>${esc(x.name)}</h5><div class="prose">${md(x.value)}</div></div>`).join("")}</section>` : "");
  const fields = basics.map(kv).join("");
  const rels = relsOf(e);
  const relHtml = rels.map(({ r, from, to, own }) => {
    const t = relType(r);
    const lbl = r.label || REL_LABEL[t] || "related to";
    return `<li>${from === e ? `<b>${esc(e.name)}</b>` : chip("e", from)} ${relVerb(lbl)}<i>${esc(lbl)}</i> ${to === e ? `<b>${esc(e.name)}</b>` : chip("e", to)}
      ${t ? `<span class="fam-badge">${t}</span>` : ""}
      <span class="row-tools"><button class="mini" data-act="editRel" data-owner="${from.id}" data-rel="${r.id}" title="Edit">✎</button></span></li>`;
  }).join("");
  const pointing = new Set(pointingGroups(e).flatMap(g => g.list));
  const back = backlinks("e", e.id).filter(b => b.t !== "n" && !(b.t === "e" && (pointing.has(b.it) || rels.some(x => x.from.id === b.it.id))));
  const panels = ENTITY_PANELS.map(p => p(e)).filter(Boolean).join("");
  const notes = notesPanel("e", e.id, { hideEmpty: true });
  const quick = [!relHtml && `<button class="btn small" data-act="addRel" data-id="${e.id}">+ Relationship</button>`,
    e.kind === "character" && !hasFamily(e.id) && `<button class="btn small" data-act="addKin" data-id="${e.id}" data-as="parent">+ Family</button>`,
    !notes && `<button class="btn small" data-act="noteFor" data-k="e:${e.id}">+ Note</button>`].filter(Boolean);
  // a header across the top, an infobox (picture, basics, stats) on the right,
  // and the article and everything else in the main column; boxes with
  // nothing in them wait in the "Add" row at the end instead
  return `<div class="page entry" style="--c:${entryColor(e)}">
   <div class="entry-layout">
    <header class="entry-top">
      <div class="entry-topline"><div class="kind-line"><a href="#/codex/${k.id}">${k.icon} ${esc(k.name)}</a>${e.pc ? ` <span class="pc-badge">Player character</span>` : ""}${versionBadge(e)}</div>
        <div class="entry-actions">
          <button class="btn" data-act="screenEntry" data-id="${e.id}" title="Show the players this entry's picture and name">📺</button>
          <button class="btn" data-act="versions" data-id="${e.id}" title="Versions: keep alternative takes on this entry">⎇</button>
          <button class="btn accent" data-act="editEntry" data-id="${e.id}">Edit</button>
          <button class="btn ghost" data-act="deleteEntry" data-id="${e.id}" title="Delete">🗑</button>
        </div></div>
      <h2>${esc(e.name)}</h2>
      ${(e.aliases || []).length ? `<div class="aliases">also ${e.aliases.map(esc).join(", ")}</div>` : ""}
      ${lifespan(e) ? `<div class="life">${esc(lifespan(e))}</div>` : ""}
      ${e.summary ? `<p class="summary">${inline(e.summary)}</p>` : ""}
      ${(e.tags || []).length ? `<div class="tags">${e.tags.map(t => `<a class="tag" data-act="codexTag" data-tag="${esc(t)}">#${esc(t)}</a>`).join("")}</div>` : ""}
    </header>
    <aside class="entry-side">
      <div class="infobox">
        <button class="portrait ${e.portrait ? "has-pic" : ""}" data-act="setPortrait" data-id="${e.id}" title="Change the picture">${e.portrait ? assetImg(e.portrait) : `<span>${k.icon}</span><small>Add a picture</small>`}</button>
        ${fields ? `<div class="kvs">${fields}</div>` : ""}
        ${emptyCount ? `<a class="fill-hint" data-act="editEntry" data-id="${e.id}">+ ${plural(emptyCount, "detail")} to fill in</a>` : ""}
      </div>
      ${statBlock(e)}
    </aside>
    <div class="entry-main">
      ${mdBlock(e.body, `<p class="empty">No article yet. <a data-act="editEntry" data-id="${e.id}">Write one</a>, using [[Name]] to link.</p>`)}
      ${sections}
      ${relHtml ? `<section class="panel"><div class="panel-h"><h4>Relationships</h4><button class="btn small" data-act="addRel" data-id="${e.id}">+ Add</button></div><ul class="rels">${relHtml}</ul></section>` : ""}
      ${panels}
      ${notes}
      ${back.length ? `<section class="panel"><div class="panel-h"><h4>Mentioned in</h4></div><div class="chips">${back.map(b => chip(b.t, b.it, b.label !== "mentions" ? ` <small>${esc(b.label)}</small>` : "")).join("")}</div></section>` : ""}
      ${quick.length ? `<div class="entry-quick"><span class="muted small">Add:</span>${quick.join("")}</div>` : ""}
    </div>
   </div>
  </div>`;
});

// "Spells" on a magic system, "Characters (Home)" on a place: entries that
// point at this one through a link field, gathered by kind and field
const kindPlural = n => /[^aeiou]y$/i.test(n) ? n.slice(0, -1) + "ies" : /(s|x|ch|sh)$/i.test(n) ? n + "es" : n + "s";
function pointingGroups(e) {
  const groups = new Map();
  for (const o of DB.entries) {
    if (o === e) continue;
    for (const f of kindOf(o).fields) if (fieldLinks(f, o.fields?.[f.id]).includes(e.id)) {
      const k = kindOf(o), key = k.id + "|" + f.id;
      if (!groups.has(key)) groups.set(key, { k, f, list: [] });
      groups.get(key).list.push(o);
    }
  }
  return [...groups.values()];
}
ENTITY_PANELS.unshift(e => {
  const groups = pointingGroups(e);
  const spellField = DB.kinds.find(k => k.id === "spell")?.fields.find(f => f.name === "Magic system");
  // a magic system always offers to add a spell, even before it has any
  if (e.kind === "magic" && spellField && !groups.some(g => g.f === spellField)) groups.unshift({ k: byId(DB.kinds, "spell"), f: spellField, list: [] });
  return groups.map(({ k, f, list }) => `<section class="panel"><div class="panel-h"><h4>${esc(kindPlural(k.name))} <small class="muted">(${esc(f.name)})</small></h4>
    ${f.type === "link" ? `<button class="btn small" data-act="newLinked" data-kind="${k.id}" data-field="${f.id}" data-to="${e.id}">+ ${esc(k.name)}</button>` : ""}</div>
    ${list.length ? `<div class="chips">${list.sort((a, b) => a.name.localeCompare(b.name)).map(o => chip("e", o)).join("")}</div>` : `<p class="muted small">None yet.</p>`}</section>`).join("");
});
ACT.newLinked = el => {
  const props = { kind: el.dataset.kind, fields: {} };
  if (el.dataset.field) props.fields[el.dataset.field] = el.dataset.to;
  entryEditor(newEntry(props), true);
};
function hasStats(e) { const s = e.stats || {}; return e.pc || ["hp", "ac", "init", "speed", "level", "block"].some(k => s[k] !== undefined && s[k] !== ""); }
function statBlock(e) {
  if (!hasStats(e)) return "";
  const s = e.stats || {};
  const hp = s.maxhp ? `${s.hp ?? s.maxhp}/${s.maxhp}` : s.hp ?? "—";
  return `<section class="panel stats"><div class="panel-h"><h4>Game stats</h4></div>
    <div class="stat-row">
      <div><small>HP</small><b>${esc(hp)}</b></div>
      <div><small>AC</small><b class="armor">${esc(s.ac ?? "—")}</b></div>
      <div><small>Init</small><b>${s.init != null && s.init !== "" ? (+s.init >= 0 ? "+" : "") + esc(s.init) : "—"}</b></div>
      <div><small>Speed</small><b>${esc(s.speed || "—")}</b></div>
      <div><small>${e.pc ? "Level" : "Level/CR"}</small><b>${esc(s.level || "—")}</b></div>
    </div>
    ${s.block ? `<div class="prose statblock">${md(s.block)}</div>` : ""}
    <div class="token-row"><button class="token-pick" data-act="setToken" data-id="${e.id}" title="Token picture for battlemaps">${e.token || e.portrait ? assetImg(e.token || e.portrait) : `<span>${esc(initials(e.name))}</span>`}</button>
      <small class="muted">Battlemap token${e.token ? "" : e.portrait ? " (uses the portrait)" : ""}${+s.size && +s.size !== 1 ? ` · ${TOKEN_SIZES[s.size] || s.size + " squares"}` : ""}. Tap to ${e.token ? "change" : "set"} it.</small></div></section>`;
}

/* ── editing ── */
function kindFieldsHtml(kind, e) {
  const k = byId(DB.kinds, kind) || kindOf(null);
  // each section folds away; one with something in it starts open
  return `<div class="row2">${dateField(esc(k.startLabel || "From"), "start", e.start)}${dateField(esc(k.endLabel || "Until"), "end", e.end)}</div>
    ${fieldSections(k.fields).map(([sec, fs], i) => {
      const n = fs.filter(f => !isEmptyVal(e.fields?.[f.id])).length;
      return `<details class="field-ed" ${i === 0 || n ? "open" : ""}><summary>${esc(sec || "Details")} <small>${n ? `${n} of ${fs.length} filled` : plural(fs.length, "field")}</small></summary>
        <div class="row2">${fs.map(f => fieldInput(f, e.fields?.[f.id])).join("")}</div></details>`;
    }).join("")}`;
}
const extraRow = (x = { name: "", value: "" }) => `<div class="extra-row"><input class="x-name" placeholder="Field" value="${esc(x.name)}"><textarea class="x-value" rows="2" placeholder="What it says">${esc(x.value)}</textarea><button type="button" class="mini" data-act="extraDel" title="Remove">✕</button></div>`;
ACT.extraAdd = el => el.insertAdjacentHTML("beforebegin", extraRow());
ACT.extraDel = el => el.closest(".extra-row").remove();
function entryEditor(e, isNew) {
  const s = e.stats || {};
  modal({
    title: isNew ? "New entry" : "Edit " + e.name, wide: true,
    body: `<div class="row2">${textField("Name", "name", e.name, "autofocus")}
        ${field("Kind", `<select name="kind" data-change="entryKindChanged">${DB.kinds.map(k => `<option value="${k.id}" ${k.id === e.kind ? "selected" : ""}>${k.icon} ${esc(k.name)}</option>`).join("")}</select>`)}</div>
      ${textField("One-line summary", "summary", e.summary, "data-links")}
      <div class="row2">${textField("Also known as (commas between)", "aliases", (e.aliases || []).join(", "))}${textField("Tags (commas between)", "tags", (e.tags || []).join(", "))}</div>
      <div id="kindFields">${kindFieldsHtml(e.kind, e)}</div>
      <details class="field-ed" ${(e.extra || []).length ? "open" : ""}><summary>Fields of its own <small>just for this entry</small></summary>
        <div class="extras">${(e.extra || []).map(extraRow).join("")}<button type="button" class="btn small" data-act="extraAdd">+ Field</button></div></details>
      ${areaField("Article (use [[Name]] to link)", "body", e.body, 12)}
      ${colorField("Colour", "color", e.color)}
      <details class="stats-ed" ${hasStats(e) ? "open" : ""}><summary>Game stats</summary>
        <label class="check"><input type="checkbox" name="pc" ${e.pc ? "checked" : ""}> Player character (joins the party)</label>
        <div class="row3">${textField("HP now", "hp", s.hp ?? "", `type="number"`)}${textField("Max HP", "maxhp", s.maxhp ?? "", `type="number"`)}${textField("AC", "ac", s.ac ?? "", `type="number"`)}
          ${textField("Initiative bonus", "init", s.init ?? "", `type="number"`)}${textField("Speed", "speed", s.speed ?? "")}${textField("Level / CR", "level", s.level ?? "")}
          ${field("Token size", `<select name="size">${Object.entries(TOKEN_SIZES).map(([k, l]) => `<option value="${k}" ${+k === (+s.size || 1) ? "selected" : ""}>${l}</option>`).join("")}</select>`)}</div>
        ${areaField("Stat block (attacks like 1d8+4 can be tapped to roll)", "block", s.block, 5)}
      </details>`,
    onOpen: w => { w.dataset.entry = e.id; w.dataset.kind = e.kind; },
    buttons: [{ label: "Cancel" }, {
      label: isNew ? "Create" : "Save", cls: "accent", act: w => {
        const v = formVals(w);
        if (!v.name.trim()) { toast("Give it a name first"); return false; }
        const k = byId(DB.kinds, v.kind) || DB.kinds[0];
        const dates = {}, fields = {};
        try {
          for (const n of ["start", "end"]) {
            if (v[n]?.trim() && !parseDate(v[n])) throw new Error(`“${v[n]}” isn't a date I can read`);
            dates[n] = parseDate(v[n]);
          }
          for (const f of k.fields) { const x = readField(f, v["f_" + f.id]); if (x !== undefined) fields[f.id] = x; }
        } catch (err) { toast(err.message); return false; }
        Object.assign(e, {
          name: v.name.trim(), kind: k.id, summary: v.summary.trim(), aliases: splitList(v.aliases), tags: splitList(v.tags),
          body: v.body, color: v.color, start: dates.start, end: dates.end, pc: v.pc, fields, updated: Date.now(),
          extra: $$(".extra-row", w).map(r => ({ name: $(".x-name", r).value.trim(), value: $(".x-value", r).value.trim() })).filter(x => x.name || x.value),
        });
        const st = {};
        for (const n of ["hp", "maxhp", "ac", "init"]) if (v[n] !== "") st[n] = +v[n];
        if (+v.size !== 1) st.size = +v.size;
        for (const n of ["speed", "level", "block"]) if (v[n].trim()) st[n] = v[n].trim();
        e.stats = Object.keys(st).length ? st : null;
        if (isNew) DB.entries.push(e);
        commit();
        if (isNew) go("#/e/" + e.id);
      },
    }],
  });
}
// switching kind keeps what's typed in any field the new kind has by the same name
ACT.entryKindChanged = el => {
  const w = el.closest(".modal-wrap"), from = byId(DB.kinds, w.dataset.kind), to = byId(DB.kinds, el.value);
  const keep = formVals($("#kindFields", w)), byName = {};
  for (const f of from?.fields || []) { try { const x = readField(f, keep["f_" + f.id]); if (x !== undefined) byName[norm(f.name)] = x; } catch {} }
  const fields = {};
  for (const f of to?.fields || []) if (norm(f.name) in byName) fields[f.id] = byName[norm(f.name)];
  $("#kindFields", w).innerHTML = kindFieldsHtml(el.value, { fields, start: parseDate(keep.start), end: parseDate(keep.end) });
  w.dataset.kind = el.value;
};
function newEntry(props = {}) {
  return { id: uid(), kind: props.kind || DB.kinds[0]?.id, name: "", aliases: [], tags: [], color: "", summary: "", body: "", fields: {}, rels: [], start: null, end: null, created: Date.now(), ...props };
}
ACT.newEntry = el => entryEditor(newEntry({ kind: el.dataset.kind || CODEX.kind || DB.kinds[0]?.id, name: el.dataset.name || "" }), true);
ACT.editEntry = el => entryEditor(byId(DB.entries, el.dataset.id), false);
ACT.deleteEntry = async el => {
  const e = byId(DB.entries, el.dataset.id);
  if (!await ask("Delete " + e.name + "?", "Links to it will show as missing. You can undo this straight afterwards.")) return;
  withUndo(`Deleted ${e.name}`, () => {
    DB.entries = DB.entries.filter(x => x !== e);
    for (const o of DB.entries) {
      o.rels = (o.rels || []).filter(r => r.to !== e.id);
      for (const f of kindOf(o).fields) {
        const v = o.fields?.[f.id];
        if (f.type === "link" && v === e.id) delete o.fields[f.id];
        if (f.type === "links" && Array.isArray(v)) { o.fields[f.id] = v.filter(x => x !== e.id); if (!o.fields[f.id].length) delete o.fields[f.id]; }
      }
    }
    ENTITY_DELETE_HOOKS.forEach(h => h(e.id));
  });
  go("#/codex/" + CODEX.kind);
};
ACT.setPortrait = async el => {
  const e = byId(DB.entries, el.dataset.id);
  if (e.portrait) {
    let choice = null;
    await new Promise(res => modal({ title: "Picture", body: assetImg(e.portrait, "portrait-big"), onClose: res,
      buttons: [{ label: "Remove", cls: "danger", act: () => { choice = "rm"; } }, { label: "Replace", cls: "accent", act: () => { choice = "new"; } }] }));
    if (choice === "rm") { e.portrait = null; return commit(); }
    if (choice !== "new") return;
  }
  const img = await pickImage(640);
  if (img) { e.portrait = img.id; commit(); }
};

/* links to things that don't exist yet can create them */
ACT.newFromLink = el => {
  const name = el.dataset.name;
  const opts = [...DB.kinds.map(k => ({ v: "k:" + k.id, label: `${k.icon} ${k.name}` })), ...Object.entries(NEW_FROM_LINK).map(([v, o]) => ({ v, label: o.label }))];
  modal({
    title: `Create “${name}”`,
    body: `<p class="muted">Nothing is called that yet. What should it be?</p><div class="pick-grid">${opts.map(o => `<button class="btn" data-pick="${o.v}">${esc(o.label)}</button>`).join("")}</div>`,
    onOpen: (w, m) => w.addEventListener("click", e => {
      const b = e.target.closest("[data-pick]");
      if (!b) return;
      m.close();
      const v = b.dataset.pick;
      if (v.startsWith("k:")) entryEditor(newEntry({ kind: v.slice(2), name }), true);
      else NEW_FROM_LINK[v].make(name);
    }),
  });
};
// other modules add "create this as a timeline event / note / quest…"
const NEW_FROM_LINK = {};

/* relationship editor */
function relEditor(owner, rel) {
  const isNew = !rel;
  rel ||= { id: uid(), to: "", label: "", type: undefined };
  modal({
    title: isNew ? "New relationship" : "Edit relationship",
    body: `<p class="muted">Reads as: <b>${esc(owner.name)}</b> is <i>[label]</i> <b>[who]</b>.</p>
      ${textField("Label", "label", rel.label, `list="relLabels" placeholder="e.g. indebted to, daughter of, rival of" autofocus`)}
      <datalist id="relLabels">${["ally of", "rival of", "indebted to", "serves", "rules", "lives in", "member of", "loves", "hates", "mentor of", "daughter of", "son of", "mother of", "father of", "married to", "sister of", "brother of"].map(x => `<option value="${x}">`).join("")}</datalist>
      ${field("Who", `<select name="to">${entryOptions(rel.to)}</select>`)}
      ${field("Family tie", `<select name="type"><option value="auto">Work it out from the label</option>${Object.entries(REL_TYPES).map(([k, v]) => `<option value="${k}" ${rel.type === k ? "selected" : ""}>${v}</option>`).join("")}</select>`)}`,
    buttons: [
      ...(isNew ? [] : [{ label: "Delete", cls: "danger", act: () => withUndo("Relationship deleted", () => { owner.rels = owner.rels.filter(r => r !== rel); }) }]),
      { label: "Cancel" },
      { label: "Save", cls: "accent", act: w => {
        const v = formVals(w);
        if (!v.to) { toast("Pick who it's with"); return false; }
        Object.assign(rel, { to: v.to, label: v.label.trim(), type: v.type === "auto" ? relTypeFromLabel(v.label) : v.type });
        (owner.rels ||= []);
        if (isNew) owner.rels.push(rel);
        commit();
      } },
    ],
  });
}
ACT.addRel = el => relEditor(byId(DB.entries, el.dataset.id));
ACT.editRel = el => { const o = byId(DB.entries, el.dataset.owner); relEditor(o, o.rels.find(r => r.id === el.dataset.rel)); };
