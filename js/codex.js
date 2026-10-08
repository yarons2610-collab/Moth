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
  text: e => [e.summary, e.body, ...kindOf(e).fields.filter(f => f.type === "text" || f.type === "long").map(f => e.fields?.[f.id])].join("\n"),
  edges: e => [
    ...(e.rels || []).map(r => ["e", r.to, r.label || "related"]),
    ...kindOf(e).fields.filter(f => f.type === "link" && e.fields?.[f.id]).map(f => ["e", e.fields[f.id], f.name]),
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

/* ── the codex list ── */
addRoute("codex", "codex", kind => {
  if (kind !== undefined) CODEX.kind = kind;
  const q = norm(CODEX.q);
  const list = DB.entries.filter(e =>
    (!CODEX.kind || e.kind === CODEX.kind) &&
    (!CODEX.tag || (e.tags || []).includes(CODEX.tag)) &&
    (!q || [e.name, ...(e.aliases || []), e.summary, ...(e.tags || [])].some(s => norm(s).includes(q)))
  ).sort((a, b) => a.name.localeCompare(b.name));
  const counts = k => DB.entries.filter(e => e.kind === k).length;
  return `<div class="page">
    <div class="page-h"><h2>Codex</h2><div class="spacer"></div>
      ${searchBox("codexFilter", CODEX.q, "Filter the codex…")}
      <button class="btn accent" data-act="newEntry" data-kind="${CODEX.kind}">+ New ${esc(CODEX.kind ? byId(DB.kinds, CODEX.kind)?.name || "entry" : "entry")}</button></div>
    <div class="chips-row">
      <a class="fchip ${!CODEX.kind ? "on" : ""}" href="#/codex/">All <small>${DB.entries.length}</small></a>
      ${DB.kinds.map(k => `<a class="fchip ${CODEX.kind === k.id ? "on" : ""}" href="#/codex/${k.id}" style="--c:${k.color}">${k.icon} ${esc(k.name)} <small>${counts(k.id)}</small></a>`).join("")}
      ${CODEX.tag ? `<button class="fchip on" data-act="codexTag" data-tag="">#${esc(CODEX.tag)} ✕</button>` : ""}
    </div>
    <div class="cards" id="codexCards">${list.map(entryCard).join("") || empty(DB.entries.length ? "Nothing matches." : "The codex is empty. Add a first character, place or legend.")}</div>
  </div>`;
});
function entryCard(e) {
  const k = kindOf(e);
  return `<a class="card" href="#/e/${e.id}" style="--c:${entryColor(e)}">
    <div class="card-pic">${e.portrait && assetSrc(e.portrait) ? `<img src="${assetSrc(e.portrait)}" alt="">` : `<span>${k.icon}</span>`}</div>
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
  const fields = k.fields.filter(f => e.fields?.[f.id] != null && e.fields[f.id] !== "").map(f => {
    const v = e.fields[f.id];
    const shown = f.type === "link" ? (byId(DB.entries, v) ? chip("e", byId(DB.entries, v)) : "—")
      : f.type === "date" ? esc(fmtDate(v)) : f.type === "long" ? md(v) : inline(String(v));
    return `<div class="kv"><span>${esc(f.name)}</span><div>${shown}</div></div>`;
  }).join("");
  const rels = relsOf(e);
  const relHtml = rels.map(({ r, from, to, own }) => {
    const t = relType(r);
    const lbl = r.label || REL_LABEL[t] || "related to";
    return `<li>${from === e ? `<b>${esc(e.name)}</b>` : chip("e", from)} is <i>${esc(lbl)}</i> ${to === e ? `<b>${esc(e.name)}</b>` : chip("e", to)}
      ${t ? `<span class="fam-badge">${t}</span>` : ""}
      <span class="row-tools"><button class="mini" data-act="editRel" data-owner="${from.id}" data-rel="${r.id}" title="Edit">✎</button></span></li>`;
  }).join("");
  const back = backlinks("e", e.id).filter(b => !(b.t === "e" && rels.some(x => x.from.id === b.it.id)));
  const panels = ENTITY_PANELS.map(p => p(e)).filter(Boolean).join("");
  return `<div class="page entry" style="--c:${entryColor(e)}">
    <div class="entry-head">
      <button class="portrait" data-act="setPortrait" data-id="${e.id}" title="Change the picture">${e.portrait && assetSrc(e.portrait) ? `<img src="${assetSrc(e.portrait)}" alt="">` : `<span>${k.icon}</span><small>Add picture</small>`}</button>
      <div class="entry-title">
        <div class="kind-line"><a href="#/codex/${k.id}">${k.icon} ${esc(k.name)}</a>${e.pc ? ` <span class="pc-badge">Player character</span>` : ""}</div>
        <h2>${esc(e.name)}</h2>
        ${(e.aliases || []).length ? `<div class="aliases">also ${e.aliases.map(esc).join(", ")}</div>` : ""}
        ${lifespan(e) ? `<div class="life">${esc(lifespan(e))}</div>` : ""}
        ${e.summary ? `<p class="summary">${inline(e.summary)}</p>` : ""}
        <div class="tags">${(e.tags || []).map(t => `<a class="tag" data-act="codexTag" data-tag="${esc(t)}">#${esc(t)}</a>`).join("")}</div>
      </div>
      <div class="entry-actions">
        <button class="btn accent" data-act="editEntry" data-id="${e.id}">Edit</button>
        <button class="btn ghost" data-act="deleteEntry" data-id="${e.id}" title="Delete">🗑</button>
      </div>
    </div>
    <div class="entry-grid">
      <div class="col-main">
        ${mdBlock(e.body, `<p class="empty">No article yet. <a data-act="editEntry" data-id="${e.id}">Write one</a>, using [[Name]] to link.</p>`)}
        <section class="panel"><div class="panel-h"><h4>Relationships</h4><button class="btn small" data-act="addRel" data-id="${e.id}">+ Add</button></div>
          ${relHtml ? `<ul class="rels">${relHtml}</ul>` : empty("No relationships yet.")}</section>
        ${panels}
        ${back.length ? `<section class="panel"><div class="panel-h"><h4>Mentioned in</h4></div><div class="chips">${back.map(b => chip(b.t, b.it, b.label !== "mentions" ? ` <small>${esc(b.label)}</small>` : "")).join("")}</div></section>` : ""}
      </div>
      <div class="col-side">
        ${fields ? `<section class="panel"><div class="kvs">${fields}</div></section>` : ""}
        ${statBlock(e)}
      </div>
    </div>
  </div>`;
});

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
    ${s.block ? `<div class="prose statblock">${md(s.block)}</div>` : ""}</section>`;
}

/* ── editing ── */
function kindFieldsHtml(kind, e) {
  const k = byId(DB.kinds, kind) || kindOf(null);
  return `<div class="row2">${dateField(esc(k.startLabel || "From"), "start", e.start)}${dateField(esc(k.endLabel || "Until"), "end", e.end)}</div>
    ${k.fields.length ? `<div class="row2">${k.fields.map(f => {
      const v = e.fields?.[f.id] ?? "", n = "f_" + f.id;
      if (f.type === "link") return field(esc(f.name), `<select name="${n}">${entryOptions(v)}</select>`);
      if (f.type === "date") return dateField(esc(f.name), n, v || null);
      if (f.type === "long") return areaField(esc(f.name), n, v, 3, `class="span2"`);
      return textField(esc(f.name), n, v, f.type === "number" ? `type="number" step="any"` : "");
    }).join("")}</div>` : ""}`;
}
function entryEditor(e, isNew) {
  const s = e.stats || {};
  modal({
    title: isNew ? "New entry" : "Edit " + e.name, wide: true,
    body: `<div class="row2">${textField("Name", "name", e.name, "autofocus")}
        ${field("Kind", `<select name="kind" data-change="entryKindChanged">${DB.kinds.map(k => `<option value="${k.id}" ${k.id === e.kind ? "selected" : ""}>${k.icon} ${esc(k.name)}</option>`).join("")}</select>`)}</div>
      ${textField("One-line summary", "summary", e.summary, "data-links")}
      <div class="row2">${textField("Also known as (commas between)", "aliases", (e.aliases || []).join(", "))}${textField("Tags (commas between)", "tags", (e.tags || []).join(", "))}</div>
      <div id="kindFields">${kindFieldsHtml(e.kind, e)}</div>
      ${areaField("Article (use [[Name]] to link)", "body", e.body, 12)}
      ${colorField("Colour", "color", e.color)}
      <details class="stats-ed" ${hasStats(e) ? "open" : ""}><summary>Game stats</summary>
        <label class="check"><input type="checkbox" name="pc" ${e.pc ? "checked" : ""}> Player character (joins the party)</label>
        <div class="row3">${textField("HP now", "hp", s.hp ?? "", `type="number"`)}${textField("Max HP", "maxhp", s.maxhp ?? "", `type="number"`)}${textField("AC", "ac", s.ac ?? "", `type="number"`)}
          ${textField("Initiative bonus", "init", s.init ?? "", `type="number"`)}${textField("Speed", "speed", s.speed ?? "")}${textField("Level / CR", "level", s.level ?? "")}</div>
        ${areaField("Stat block (attacks like 1d8+4 can be tapped to roll)", "block", s.block, 5)}
      </details>`,
    onOpen: w => { w.dataset.entry = e.id; },
    buttons: [{ label: "Cancel" }, {
      label: isNew ? "Create" : "Save", cls: "accent", act: w => {
        const v = formVals(w);
        if (!v.name.trim()) { toast("Give it a name first"); return false; }
        const k = byId(DB.kinds, v.kind) || DB.kinds[0];
        const dates = {};
        for (const n of ["start", "end", ...k.fields.filter(f => f.type === "date").map(f => "f_" + f.id)]) {
          if (v[n]?.trim() && !parseDate(v[n])) { toast(`“${v[n]}” isn't a date I can read`); return false; }
          dates[n] = parseDate(v[n]);
        }
        Object.assign(e, {
          name: v.name.trim(), kind: k.id, summary: v.summary.trim(), aliases: splitList(v.aliases), tags: splitList(v.tags),
          body: v.body, color: v.color, start: dates.start, end: dates.end, pc: v.pc,
        });
        e.fields = {};
        for (const f of k.fields) {
          const x = f.type === "date" ? dates["f_" + f.id] : v["f_" + f.id];
          if (x !== "" && x != null) e.fields[f.id] = f.type === "number" ? +x : x;
        }
        const st = {};
        for (const n of ["hp", "maxhp", "ac", "init"]) if (v[n] !== "") st[n] = +v[n];
        for (const n of ["speed", "level", "block"]) if (v[n].trim()) st[n] = v[n].trim();
        e.stats = Object.keys(st).length ? st : null;
        if (isNew) DB.entries.push(e);
        commit();
        if (isNew) go("#/e/" + e.id);
      },
    }],
  });
}
ACT.entryKindChanged = el => {
  const w = el.closest(".modal-wrap"), e = byId(DB.entries, w.dataset.entry) || {};
  const keep = formVals($("#kindFields", w));
  $("#kindFields", w).innerHTML = kindFieldsHtml(el.value, { ...e, start: parseDate(keep.start), end: parseDate(keep.end) });
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
      for (const f of kindOf(o).fields) if (f.type === "link" && o.fields?.[f.id] === e.id) delete o.fields[f.id];
    }
    ENTITY_DELETE_HOOKS.forEach(h => h(e.id));
  });
  go("#/codex/" + CODEX.kind);
};
ACT.setPortrait = async el => {
  const e = byId(DB.entries, el.dataset.id);
  if (e.portrait) {
    let choice = null;
    await new Promise(res => modal({ title: "Picture", body: `<img class="portrait-big" src="${assetSrc(e.portrait)}" alt="">`, onClose: res,
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
