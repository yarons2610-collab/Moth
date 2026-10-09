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
const byBirth = (a, b) => { const x = dateKey(byId(DB.entries, a)?.start), y = dateKey(byId(DB.entries, b)?.start); return x === y ? 0 : x < y ? -1 : 1; };

ENTITY_PANELS.push(e => {
  // nothing to show yet: the entry page offers "+ Family" in its Add row instead
  if (!hasFamily(e.id)) return "";
  const row = (label, ids) => ids.length ? `<div class="kv"><span>${label}</span><div class="chips">${ids.sort(byBirth).map(id => chip("e", byId(DB.entries, id))).join("")}</div></div>` : "";
  const body = row("Parents", famGet("parents", e.id)) + row("Spouses", famGet("spouses", e.id)) + row("Siblings", siblingsOf(e.id)) + row("Children", famGet("children", e.id));
  return `<section class="panel"><div class="panel-h"><h4>Family</h4>
    ${body ? `<a class="btn small" href="#/family/${e.id}">Family tree →</a>` : `<button class="btn small" data-act="addKin" data-id="${e.id}" data-as="parent">+ Add family</button>`}</div>
    ${body ? `<div class="kvs">${body}</div>` : ""}</section>`;
});

/* ── tree layout ── a genealogy chart: one band per generation, couples side
   by side joined by a marriage bar, and from each couple one line down to a
   bar over all their children. Everyone the focus is related to within the
   chosen generations is drawn (grandparents, aunts and uncles, cousins…), each
   spouse beside the person they married. */
const CARD_W = 136, CARD_H = 104, ROW_H = 172, GUT = 118, PAD = 28;
const FAM_CAP = 70;
const birthKey = id => { const s = byId(DB.entries, id)?.start; return s ? dateKey(s) : Infinity; };
const byAge = (a, b) => birthKey(a) - birthKey(b) || 0;
const sortBirth = ids => ids.sort((a, b) => birthKey(a) === birthKey(b) ? 0 : birthKey(a) < birthKey(b) ? -1 : 1);

function familyPeople(focus) {
  // everyone reachable through family ties, nearest first, inside the chosen
  // generations; people who married in are shown but their own families aren't
  const gen = new Map([[focus, 0]]), queue = [focus], inlaw = new Set();
  while (queue.length && gen.size < FAM_CAP) {
    const id = queue.shift(), g = gen.get(id);
    const step = (ids, dg, viaMarriage) => {
      for (const o of sortBirth(ids)) {
        if (gen.has(o) || gen.size >= FAM_CAP) continue;
        const ng = g + dg;
        if (ng < -FAM.up || ng > FAM.down) continue;
        gen.set(o, ng); queue.push(o);
        if (viaMarriage) inlaw.add(o);
      }
    };
    if (inlaw.has(id)) continue;
    step(famGet("parents", id), -1);
    step(famGet("siblings", id), 0);
    step(famGet("children", id), 1);
    step(famGet("spouses", id), 0, true);
  }
  return gen;
}

function layoutTree(focus) {
  const gen = familyPeople(focus);
  const shown = id => gen.has(id);
  const parentsIn = id => famGet("parents", id).filter(p => shown(p) && gen.get(p) === gen.get(id) - 1);
  const childrenIn = id => famGet("children", id).filter(c => shown(c) && gen.get(c) === gen.get(id) + 1);
  // partners: married, or parents of the same child
  const partners = new Map();
  const link = (a, b) => { if (a === b) return; (partners.get(a) || partners.set(a, new Set()).get(a)).add(b); (partners.get(b) || partners.set(b, new Set()).get(b)).add(a); };
  for (const id of gen.keys()) {
    for (const s of famGet("spouses", id)) if (shown(s) && gen.get(s) === gen.get(id)) link(id, s);
    const ps = parentsIn(id);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) link(ps[i], ps[j]);
  }
  // rows of units (a person with their partners), in the order people were met
  const rows = new Map();
  const seen = new Set();
  for (const id of gen.keys()) {
    if (seen.has(id)) continue;
    const unit = [], stack = [id];
    while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); unit.push(x); stack.push(...(partners.get(x) || [])); }
    // a chain: start from someone with one partner, so the middle person sits between
    const pn = x => [...(partners.get(x) || [])].filter(y => unit.includes(y));
    const chain = [], start = unit.find(x => pn(x).length <= 1) || unit[0], cs = new Set();
    const walk = x => { if (cs.has(x)) return; cs.add(x); chain.push(x); for (const y of pn(x)) walk(y); };
    walk(start);
    for (const x of unit) if (!cs.has(x)) chain.push(x);
    const g = gen.get(id);
    (rows.get(g) || rows.set(g, []).get(g)).push({ ids: chain, x: 0 });
  }
  const gens = [...rows.keys()].sort((a, b) => a - b);
  const famKey = id => { const ps = parentsIn(id); return ps.length ? ps.sort().join("+") : ""; };
  const pos = new Map();
  const uw = u => u.ids.length * CARD_W + (u.ids.length - 1) * 34;
  const gapBetween = (a, b) => {
    const ka = new Set(a.ids.map(famKey).filter(Boolean)), kb = b.ids.map(famKey).filter(Boolean);
    return kb.some(k => ka.has(k)) ? 22 : 46;
  };
  const avg = xs => xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
  // put units in order at their wished-for centres, as close as the order allows
  // (pool adjacent violators: overlapping neighbours share the mean of their wishes)
  const settle = (row, wish) => {
    const off = [0];
    for (let i = 1; i < row.length; i++) off[i] = off[i - 1] + uw(row[i - 1]) / 2 + gapBetween(row[i - 1], row[i]) + uw(row[i]) / 2;
    const blocks = [];
    row.forEach((u, i) => {
      blocks.push({ s: wish[i] - off[i], n: 1, from: i });
      while (blocks.length > 1 && blocks[blocks.length - 2].s > blocks[blocks.length - 1].s) {
        const b = blocks.pop(), a = blocks[blocks.length - 1];
        a.s = (a.s * a.n + b.s * b.n) / (a.n + b.n); a.n += b.n;
      }
    });
    for (const b of blocks) for (let i = b.from; i < b.from + b.n; i++) row[i].x = b.s + off[i];
    for (const u of row) { let x = u.x - uw(u) / 2 + CARD_W / 2; for (const id of u.ids) { pos.set(id, x); x += CARD_W + 34; } }
  };
  // first pass: side by side
  for (const g of gens) { let x = 0; const row = rows.get(g); settle(row, row.map(u => { const c = x + uw(u) / 2; x += uw(u) + 46; return c; })); }
  // a person's wish: under their parents (down sweeps) or over their children (up sweeps)
  const personWish = (id, dir) => avg((dir > 0 ? parentsIn(id) : childrenIn(id)).map(p => pos.get(p)));
  const sweep = dir => {
    const order = dir > 0 ? gens : [...gens].reverse();
    for (const g of order) {
      const row = rows.get(g);
      for (const u of row) {
        // partners face the family each came from
        if (u.ids.length === 2) {
          const [a, b] = u.ids.map(id => personWish(id, 1) ?? personWish(id, -1));
          if (a != null && b != null && a > b) u.ids.reverse();
          else if (a != null && b == null && a > u.x) u.ids.reverse();
          else if (b != null && a == null && b < u.x) u.ids.reverse();
        }
        const ws = u.ids.map(id => personWish(id, dir)).filter(v => v != null);
        // siblings with no parents shown stay together
        if (!ws.length) for (const id of u.ids) for (const s of famGet("siblings", id)) if (shown(s) && gen.get(s) === g && pos.has(s)) ws.push(pos.get(s));
        u.wish = ws.length ? avg(ws) : u.x;
      }
      row.forEach((u, i) => u.i = i);
      row.sort((a, b) => a.wish - b.wish || byAge(a.ids[0], b.ids[0]) || a.i - b.i);
      settle(row, row.map(u => u.wish));
    }
  };
  for (let k = 0; k < 4; k++) { sweep(1); sweep(-1); }
  sweep(1);
  const xs = [...pos.values()], minX = Math.min(...xs) - CARD_W / 2 - PAD - GUT;
  const minG = gens[0];
  // room above the top row for the "?" over brothers and sisters with unknown parents
  const top = PAD + 22 + (rows.get(minG).some(u => u.ids.some(id => famGet("siblings", id).some(s => gen.get(s) === minG))) ? 44 : 0);
  const nodes = [...pos].map(([id, x]) => ({ id, x: x - minX, y: (gen.get(id) - minG) * ROW_H + top, g: gen.get(id) }));
  return { nodes, gens, minG, top, partners, parentsIn, w: Math.max(...xs) - minX + CARD_W / 2 + PAD, h: (gens[gens.length - 1] - minG) * ROW_H + CARD_H + PAD + top };
}

const GEN_NAMES = { "-4": "Great-great-grandparents", "-3": "Great-grandparents", "-2": "Grandparents", "-1": "Parents", 1: "Children", 2: "Grandchildren", 3: "Great-grandchildren", 4: "Great-great-grandchildren" };
function treeHtml(focus) {
  const { nodes, gens, minG, top, partners, parentsIn, w, h } = layoutTree(focus);
  const at = new Map(nodes.map(n => [n.id, n]));
  const fe = byId(DB.entries, focus);
  // the focus's own line (ancestors and descendants) is drawn brighter
  const line = new Set([focus]);
  const up = id => { for (const p of parentsIn(id)) if (!line.has(p)) { line.add(p); up(p); } };
  const down = id => { for (const c of famGet("children", id)) if (at.has(c) && !line.has(c)) { line.add(c); down(c); } };
  up(focus); down(focus);
  const lines = [];
  const midY = n => n.y + 34; // level with the picture
  // marriage bars between partners sitting side by side
  const bar = new Map();
  for (const n of nodes) for (const s of partners.get(n.id) || []) {
    const m = at.get(s);
    if (!m || n.x >= m.x) continue;
    const wed = famGet("spouses", n.id).includes(s);
    const x1 = n.x + CARD_W / 2, x2 = m.x - CARD_W / 2, y = midY(n);
    lines.push(`<path class="t-wed ${wed ? "" : "partners"} ${line.has(n.id) && line.has(s) ? "blood" : ""}" d="M${x1},${y - 2} H${x2} M${x1},${y + 2} H${x2}"/>`);
    if (wed && x2 - x1 > 18) lines.push(`<circle class="t-ring" cx="${(x1 + x2) / 2}" cy="${y}" r="5"/>`);
    bar.set([n.id, s].sort().join("+"), { x: (x1 + x2) / 2, y });
  }
  // from each set of parents one line down to a bar over their children
  const fams = new Map();
  for (const n of nodes) {
    const ps = parentsIn(n.id).sort();
    let k = ps.join("+");
    if (!ps.length) {
      // brothers and sisters whose parents aren't known still share a bar
      const sibs = famGet("siblings", n.id).filter(s => at.get(s)?.g === n.g && !parentsIn(s).length);
      if (!sibs.length) continue;
      k = "?" + [n.id, ...sibs].sort()[0];
    }
    (fams.get(k) || fams.set(k, { ps, kids: [] }).get(k)).kids.push(n);
  }
  for (const [k, { ps, kids }] of fams) {
    if (k.startsWith("?") && kids.length < 2) continue;
    const top = kids[0].y, busY = top - 30;
    const kx = kids.map(c => c.x);
    let from = null;
    if (ps.length === 1) { const p = at.get(ps[0]); from = { x: p.x, y: p.y + CARD_H }; }
    else if (ps.length >= 2) from = bar.get(ps.slice(0, 2).join("+")) || (() => { const pn = ps.map(p => at.get(p)); return { x: pn.reduce((s, p) => s + p.x, 0) / pn.length, y: midY(pn[0]) }; })();
    const blood = kids.some(c => line.has(c.id)) && ps.some(p => line.has(p)) ? "blood" : "";
    const lo = Math.min(...kx, from ? from.x : Infinity), hi = Math.max(...kx, from ? from.x : -Infinity);
    let d = `M${lo},${busY} H${hi} ` + kids.map(c => `M${c.x},${busY} V${top}`).join(" ");
    if (from) d = `M${from.x},${from.y} V${busY} ` + d;
    lines.push(`<path class="t-kin ${blood} ${from ? "" : "unknown"}" d="${d}"/>`);
    if (!from) lines.push(`<g class="t-unknown"><line x1="${(lo + hi) / 2}" y1="${busY}" x2="${(lo + hi) / 2}" y2="${busY - 14}"/><circle cx="${(lo + hi) / 2}" cy="${busY - 20}" r="7"/><text x="${(lo + hi) / 2}" y="${busY - 16.5}">?</text></g>`);
  }
  const bands = gens.map((g, i) => `<div class="t-band ${i % 2 ? "alt" : ""}" style="top:${(g - minG) * ROW_H + top - (g === minG ? top : 34)}px;height:${ROW_H + (g === minG ? top - 34 : 0)}px">
      <span class="t-gen">${g === 0 ? esc(fe.name) + "’s generation" : GEN_NAMES[g] || (g < 0 ? "Ancestors" : "Descendants")}</span></div>`).join("");
  const cards = nodes.map(n => {
    const e = byId(DB.entries, n.id), dead = e.end && dateKey(e.end) <= dateKey(NOW());
    const age = e.start ? ageAt(e.start, dead ? e.end : NOW()) : null;
    const span = e.start && e.end ? `${fmtYear(e.start.y)} – ${fmtYear(e.end.y)}` : e.start ? `b. ${fmtYear(e.start.y)}` : e.end ? `d. ${fmtYear(e.end.y)}` : "";
    const sub = [span, age != null && age >= 0 ? (dead ? "died at " : "age ") + age : ""].filter(Boolean).join(" · ");
    const pic = e.portrait || e.token;
    return `<button class="t-node ${n.id === focus ? "focus" : ""} ${dead ? "dead" : ""} ${line.has(n.id) ? "line" : ""}" data-id="${n.id}" style="left:${n.x - CARD_W / 2}px;top:${n.y}px;--c:${entryColor(e)}" title="${esc(e.name)}${e.summary ? " — " + esc(plainLinks(e.summary)) : ""}">
      <span class="t-pic">${pic ? assetImg(pic) : `<span>${esc(initials(e.name))}</span>`}</span>
      <b class="t-name">${esc(e.name)}${dead ? " †" : ""}</b>${sub ? `<small class="t-sub">${esc(sub)}</small>` : ""}</button>`;
  }).join("");
  return `<div class="ftree" style="width:max(100%, ${w}px);height:${h}px">${bands}<div class="ftree-in" style="width:${w}px;height:${h}px">
    <svg class="tree-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${lines.join("")}</svg>${cards}</div></div>`;
}

addRoute("family", "web", id => {
  const e = byId(DB.entries, id);
  const people = DB.entries.filter(x => hasFamily(x.id)).sort((a, b) => a.name.localeCompare(b.name));
  const tabs = webTabs("family");
  if (!e) return `<div class="page">${tabs}<h2>Family trees</h2>
    ${people.length ? `<p class="muted">Pick someone to centre the tree on.</p><div class="chips">${people.map(p => chip("e", p)).join("")}</div>`
      : empty("No family ties yet. On a character's page, add a relationship like “daughter of” or use + Add family.")}</div>`;
  const sel = (name, v) => `<select data-change="famDepth" data-k="${name}">${[0, 1, 2, 3, 4].map(n => `<option ${n === v ? "selected" : ""}>${n}</option>`).join("")}</select>`;
  return [`<div class="page wide">${tabs}
    <div class="page-h"><h2>Family of ${chip("e", e)}</h2><div class="spacer"></div>
      <label class="inline">Generations up ${sel("up", FAM.up)}</label><label class="inline">down ${sel("down", FAM.down)}</label>
      <select data-change="famJump"><option value="">Centre on…</option>${people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
    <div class="kin-bar">Add to ${esc(e.name)}:
      ${["parent", "spouse", "sibling", "child"].map(a => `<button class="btn small" data-act="addKin" data-id="${e.id}" data-as="${a}">+ ${a}</button>`).join("")}
      <span class="muted">Tap anyone to centre the tree on them; tap ${esc(e.name)} again to open their page.</span></div>
    <div class="tree-wrap">${treeHtml(e.id)}</div></div>`,
  main => {
    const wrap = $(".tree-wrap", main), f = $(".t-node.focus", main);
    if (f) { wrap.scrollLeft = f.offsetLeft + f.offsetParent.offsetLeft + CARD_W / 2 - wrap.clientWidth / 2; wrap.scrollTop = Math.max(0, f.offsetTop - wrap.clientHeight / 2 + CARD_H / 2); }
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
