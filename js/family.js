"use strict";
/* ── family ── family ties are ordinary relationships with a type (see
   codex.js), so a world that already says "daughter of" gets trees for free.
   The tree is laid out by generation: couples side by side with a marriage
   line, and one shared line from each couple down to their children. */

const FAM = { up: 2, down: 2 };

function familyGraph() {
  return derived("family", () => {
    const g = { parents: new Map(), children: new Map(), spouses: new Map(), siblings: new Map() };
    const add = (m, a, b) => { if (!m.has(a)) m.set(a, new Set()); m.get(a).add(b); };
    const ok = id => byId(DB.entries, id);
    for (const e of DB.entries) for (const r of e.rels || []) {
      if (!ok(r.to)) continue;
      const t = relType(r);
      if (t === "child") { add(g.parents, e.id, r.to); add(g.children, r.to, e.id); }
      else if (t === "parent") { add(g.parents, r.to, e.id); add(g.children, e.id, r.to); }
      else if (t === "spouse") { add(g.spouses, e.id, r.to); add(g.spouses, r.to, e.id); }
      else if (t === "sibling") { add(g.siblings, e.id, r.to); add(g.siblings, r.to, e.id); }
    }
    return g;
  });
}
const famGet = (m, id) => [...(familyGraph()[m].get(id) || [])];
function siblingsOf(id) {
  const s = new Set(famGet("siblings", id));
  for (const p of famGet("parents", id)) for (const c of famGet("children", p)) s.add(c);
  s.delete(id);
  return [...s];
}
const hasFamily = id => ["parents", "children", "spouses", "siblings"].some(m => famGet(m, id).length);
const byBirth = (a, b) => dateKey(byId(DB.entries, a)?.start) - dateKey(byId(DB.entries, b)?.start);

ENTITY_PANELS.push(e => {
  if (!hasFamily(e.id) && e.kind !== "character") return "";
  const row = (label, ids) => ids.length ? `<div class="kv"><span>${label}</span><div class="chips">${ids.sort(byBirth).map(id => chip("e", byId(DB.entries, id))).join("")}</div></div>` : "";
  const body = row("Parents", famGet("parents", e.id)) + row("Spouses", famGet("spouses", e.id)) + row("Siblings", siblingsOf(e.id)) + row("Children", famGet("children", e.id));
  return `<section class="panel"><div class="panel-h"><h4>Family</h4>
    ${body ? `<a class="btn small" href="#/family/${e.id}">Family tree →</a>` : `<button class="btn small" data-act="addKin" data-id="${e.id}" data-as="parent">+ Add family</button>`}</div>
    ${body ? `<div class="kvs">${body}</div>` : ""}</section>`;
});

/* ── tree layout ── */
const BOX_W = 168, BOX_H = 58, GAP_X = 22, ROW_H = 120;
function layoutTree(focus) {
  const gen = new Map([[focus, 0]]);
  const rows = new Map([[0, []]]);
  const put = (id, g) => { if (gen.has(id)) return false; gen.set(id, g); (rows.get(g) || rows.set(g, []).get(g)).push(id); return true; };
  // the focus row: brothers and sisters by age, then the focus, then spouses
  const sibs = siblingsOf(focus).sort(byBirth);
  const older = sibs.filter(s => byBirth(s, focus) < 0), younger = sibs.filter(s => byBirth(s, focus) >= 0);
  for (const s of older) put(s, 0);
  rows.get(0).push(focus);
  for (const s of famGet("spouses", focus)) put(s, 0);
  for (const s of younger) put(s, 0);
  // ancestors: each person's parents, kept as couples
  for (let g = -1; g >= -FAM.up; g--) {
    const from = g === -1 ? [focus, ...sibs] : rows.get(g + 1) || [];
    for (const id of from) for (const p of famGet("parents", id).sort(byBirth)) put(p, g);
  }
  // descendants: children (by age) with their spouses beside them
  for (let g = 1; g <= FAM.down; g++) {
    const prev = rows.get(g - 1) || [];
    for (const id of prev) {
      if (g === 1 && id !== focus && !famGet("spouses", focus).includes(id)) continue;
      for (const c of famGet("children", id).sort(byBirth)) if (put(c, g)) for (const s of famGet("spouses", c)) put(s, g);
    }
  }
  // place rows: each person wants to sit near the people they hang from
  const pos = new Map();
  const place = (ids, want) => {
    let end = -Infinity;
    const groups = [];
    for (const id of ids) {
      const last = groups[groups.length - 1];
      if (last && famGet("spouses", id).some(s => last.ids.includes(s))) last.ids.push(id);
      else groups.push({ ids: [id] });
    }
    for (const gr of groups) {
      const w = gr.ids.length * BOX_W + (gr.ids.length - 1) * GAP_X;
      const ws = gr.ids.map(want).filter(x => x != null);
      const first = end === -Infinity;
      const c = ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : (first ? 0 : end + GAP_X * 2) + w / 2;
      let x = first ? c - w / 2 : Math.max(c - w / 2, end + GAP_X * 2);
      for (const id of gr.ids) { pos.set(id, x + BOX_W / 2); x += BOX_W + GAP_X; }
      end = x - GAP_X;
    }
  };
  place(rows.get(0), () => null);
  const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  for (let g = 1; g <= FAM.down; g++) place(rows.get(g) || [], id => avg(famGet("parents", id).filter(p => pos.has(p)).map(p => pos.get(p))));
  for (let g = -1; g >= -FAM.up; g--) place(rows.get(g) || [], id => avg(famGet("children", id).filter(c => pos.has(c) && gen.get(c) === g + 1).map(c => pos.get(c))));
  const xs = [...pos.values()], minX = Math.min(...xs) - BOX_W / 2 - 20;
  const gens = [...rows.keys()].filter(g => rows.get(g).length), minG = Math.min(...gens);
  const nodes = [...pos].map(([id, x]) => ({ id, x: x - minX, y: (gen.get(id) - minG) * ROW_H + 30 + BOX_H / 2, g: gen.get(id) }));
  return { nodes, w: Math.max(...xs) - minX + BOX_W / 2 + 20, h: (Math.max(...gens) - minG) * ROW_H + BOX_H + 60 };
}

function treeSvg(focus) {
  const { nodes, w, h } = layoutTree(focus);
  const at = new Map(nodes.map(n => [n.id, n]));
  const lines = [];
  // marriage lines between spouses who sit side by side
  for (const n of nodes) for (const s of famGet("spouses", n.id)) {
    const m = at.get(s);
    if (m && m.g === n.g && n.id < s) lines.push(`<line class="t-wed" x1="${Math.min(n.x, m.x) + BOX_W / 2}" y1="${n.y}" x2="${Math.max(n.x, m.x) - BOX_W / 2}" y2="${n.y}"/>`);
  }
  // one line down from each set of parents, branching to their children
  const fams = new Map();
  for (const n of nodes) {
    const ps = famGet("parents", n.id).filter(p => at.get(p)?.g === n.g - 1).sort();
    if (!ps.length) continue;
    const k = ps.join("+");
    (fams.get(k) || fams.set(k, { ps, kids: [] }).get(k)).kids.push(n);
  }
  for (const { ps, kids } of fams.values()) {
    const pn = ps.map(p => at.get(p));
    const ax = pn.reduce((a, p) => a + p.x, 0) / pn.length;
    const ay = pn.length > 1 && Math.abs(pn[0].x - pn[1].x) < BOX_W + GAP_X * 2 ? pn[0].y : pn[0].y + BOX_H / 2;
    const busY = kids[0].y - BOX_H / 2 - 22;
    const xs = [ax, ...kids.map(k => k.x)];
    lines.push(`<path class="t-kin" d="M${ax},${ay} V${busY} M${Math.min(...xs)},${busY} H${Math.max(...xs)} ${kids.map(k => `M${k.x},${busY} V${k.y - BOX_H / 2}`).join(" ")}"/>`);
  }
  const boxes = nodes.map(n => {
    const e = byId(DB.entries, n.id), dead = e.end && dateKey(e.end) <= dateKey(NOW());
    const span = [e.start ? fmtYear(e.start.y) : "", e.end ? fmtYear(e.end.y) : ""];
    const age = e.start ? ageAt(e.start, dead ? e.end : NOW()) : null;
    const sub = (span[0] || span[1] ? (span[0] || "?") + " – " + (span[1] || "") : "") + (age != null && age >= 0 ? (span[0] ? " · " : "") + (dead ? "died at " : "age ") + age : "");
    return `<g class="t-node ${n.id === focus ? "focus" : ""} ${dead ? "dead" : ""}" data-id="${n.id}" transform="translate(${n.x - BOX_W / 2},${n.y - BOX_H / 2})" style="--c:${entryColor(e)}">
      <rect width="${BOX_W}" height="${BOX_H}" rx="10"/>
      <text x="12" y="23" class="t-name">${esc(e.name.length > 20 ? e.name.slice(0, 19) + "…" : e.name)}${dead ? " †" : ""}</text>
      <text x="12" y="43" class="t-sub">${esc(sub)}</text></g>`;
  });
  return `<svg class="tree-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${lines.join("")}${boxes.join("")}</svg>`;
}

addRoute("family", "web", id => {
  const e = byId(DB.entries, id);
  const people = DB.entries.filter(x => hasFamily(x.id)).sort((a, b) => a.name.localeCompare(b.name));
  const tabs = webTabs("family");
  if (!e) return `<div class="page">${tabs}<h2>Family trees</h2>
    ${people.length ? `<p class="muted">Pick someone to centre the tree on.</p><div class="chips">${people.map(p => chip("e", p)).join("")}</div>`
      : empty("No family ties yet. On a character's page, add a relationship like “daughter of” or use + Add family.")}</div>`;
  const sel = (name, v) => `<select data-change="famDepth" data-k="${name}">${[0, 1, 2, 3, 4, 5].map(n => `<option ${n === v ? "selected" : ""}>${n}</option>`).join("")}</select>`;
  return [`<div class="page wide">${tabs}
    <div class="page-h"><h2>Family of ${chip("e", e)}</h2><div class="spacer"></div>
      <label class="inline">Generations up ${sel("up", FAM.up)}</label><label class="inline">down ${sel("down", FAM.down)}</label>
      <select data-change="famJump"><option value="">Centre on…</option>${people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
    <div class="kin-bar">Add to ${esc(e.name)}:
      ${["parent", "spouse", "sibling", "child"].map(a => `<button class="btn small" data-act="addKin" data-id="${e.id}" data-as="${a}">+ ${a}</button>`).join("")}
      <span class="muted">Tap anyone to centre the tree on them.</span></div>
    <div class="tree-wrap">${treeSvg(e.id)}</div></div>`,
  main => {
    const wrap = $(".tree-wrap", main), f = $(".t-node.focus", main);
    if (f) wrap.scrollLeft = f.transform.baseVal[0].matrix.e - wrap.clientWidth / 2 + BOX_W / 2;
    wrap.addEventListener("click", ev => { const n = ev.target.closest(".t-node"); if (n) go(n.classList.contains("focus") ? "#/e/" + n.dataset.id : "#/family/" + n.dataset.id); });
  }];
});
ACT.famDepth = el => { FAM[el.dataset.k] = +el.value; rerender(); };
ACT.famJump = el => el.value && go("#/family/" + el.value);

// Add a relative: someone already in the codex, or a new character.
ACT.addKin = el => {
  const e = byId(DB.entries, el.dataset.id), as = el.dataset.as;
  modal({
    title: `Add a ${as} of ${e.name}`,
    body: `${field("Someone in the codex", `<select name="who">${entryOptions("", { blank: "— someone new —", kind: "character" })}</select>`)}
      ${textField("…or a new character's name", "name", "", `placeholder="New name"`)}
      ${as !== "parent" ? "" : `<p class="muted">Add the other parent the same way.</p>`}`,
    buttons: [{ label: "Cancel" }, { label: "Add", cls: "accent", act: w => {
      const v = formVals(w);
      let other = byId(DB.entries, v.who);
      if (!other) {
        if (!v.name.trim()) { toast("Pick someone or type a name"); return false; }
        other = newEntry({ kind: "character", name: v.name.trim() });
        DB.entries.push(other);
      }
      const rel = (a, b, type, label) => (a.rels ||= []).push({ id: uid(), to: b.id, type, label });
      if (as === "parent") rel(e, other, "child", "child of");
      else if (as === "child") rel(other, e, "child", "child of");
      else if (as === "spouse") rel(e, other, "spouse", "married to");
      else rel(e, other, "sibling", "sibling of");
      save();
      go("#/family/" + e.id);
    } }],
  });
};
