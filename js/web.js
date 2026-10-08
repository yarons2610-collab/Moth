"use strict";
/* ── web ── everything in the codex and how it's tied together: relationships,
   link fields and (optionally) [[mentions]], laid out by a small force
   simulation. Family trees live under the same tab (family.js). */

const WEB = { kinds: null, mentions: false, around: "", hops: 2, pos: {} };
const webTabs = on => `<div class="subtabs"><a class="${on === "web" ? "on" : ""}" href="#/web">Relationship web</a><a class="${on === "family" ? "on" : ""}" href="#/family">Family trees</a></div>`;

function webGraph() {
  const kinds = WEB.kinds || new Set(DB.kinds.map(k => k.id));
  let nodes = DB.entries.filter(e => kinds.has(e.kind));
  const ids = new Set(nodes.map(n => n.id));
  const edges = [], seen = new Set();
  const add = (a, b, label, type) => {
    if (a === b || !ids.has(a) || !ids.has(b)) return;
    const k = [a, b].sort().join("|") + type;
    if (seen.has(k)) return;
    seen.add(k); edges.push({ a, b, label, type });
  };
  for (const e of nodes) {
    for (const r of e.rels || []) add(e.id, r.to, r.label || REL_LABEL[relType(r)] || "", relType(r) ? "family" : "rel");
    for (const f of kindOf(e).fields) if (f.type === "link" && e.fields?.[f.id]) add(e.id, e.fields[f.id], f.name, "field");
    if (WEB.mentions) for (const m of mentionsIn(e.body + "\n" + e.summary)) if (m.t === "e") add(e.id, m.it.id, "", "mention");
  }
  if (WEB.around && ids.has(WEB.around)) {
    const keep = new Set([WEB.around]);
    for (let h = 0; h < WEB.hops; h++) for (const ed of edges) {
      if (keep.has(ed.a) || keep.has(ed.b)) { keep.add(ed.a); keep.add(ed.b); }
    }
    nodes = nodes.filter(n => keep.has(n.id));
    return { nodes, edges: edges.filter(e => keep.has(e.a) && keep.has(e.b)) };
  }
  return { nodes, edges };
}

function simulate(nodes, edges, W, H) {
  const P = WEB.pos;
  nodes.forEach((n, i) => { if (!P[n.id]) { const a = i * 2.39996; P[n.id] = { x: W / 2 + Math.cos(a) * 30 * Math.sqrt(i + 1), y: H / 2 + Math.sin(a) * 30 * Math.sqrt(i + 1) }; } });
  const ps = nodes.map(n => P[n.id]);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const es = edges.map(e => [index.get(e.a), index.get(e.b)]);
  for (let it = 0; it < 260; it++) {
    const t = 1 - it / 260, f = ps.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      let dx = ps[i].x - ps[j].x, dy = ps[i].y - ps[j].y, d2 = dx * dx + dy * dy + 0.01;
      const k = 5200 / d2, d = Math.sqrt(d2);
      f[i].x += dx / d * k; f[i].y += dy / d * k; f[j].x -= dx / d * k; f[j].y -= dy / d * k;
    }
    for (const [i, j] of es) {
      const dx = ps[j].x - ps[i].x, dy = ps[j].y - ps[i].y, d = Math.hypot(dx, dy) || 1, k = (d - 120) * 0.04;
      f[i].x += dx / d * k; f[i].y += dy / d * k; f[j].x -= dx / d * k; f[j].y -= dy / d * k;
    }
    ps.forEach((p, i) => {
      f[i].x += (W / 2 - p.x) * 0.006; f[i].y += (H / 2 - p.y) * 0.006;
      p.x += clamp(f[i].x, -30, 30) * t; p.y += clamp(f[i].y, -30, 30) * t;
    });
  }
}

addRoute("web", "web", () => {
  const { nodes, edges } = webGraph();
  const W = 1000, H = 700;
  simulate(nodes, edges, W, H);
  const P = WEB.pos;
  const xs = nodes.map(n => P[n.id].x), ys = nodes.map(n => P[n.id].y);
  const vb = nodes.length ? [Math.min(...xs) - 90, Math.min(...ys) - 50, Math.max(...xs) - Math.min(...xs) + 180, Math.max(...ys) - Math.min(...ys) + 100] : [0, 0, W, H];
  const kinds = WEB.kinds || new Set(DB.kinds.map(k => k.id));
  const svg = `<svg class="web-svg" viewBox="${vb.join(" ")}" preserveAspectRatio="xMidYMid meet">
    ${edges.map(e => `<g class="w-edge ${e.type}" data-a="${e.a}" data-b="${e.b}"><line x1="${P[e.a].x}" y1="${P[e.a].y}" x2="${P[e.b].x}" y2="${P[e.b].y}"/>
      ${e.label ? `<text x="${(P[e.a].x + P[e.b].x) / 2}" y="${(P[e.a].y + P[e.b].y) / 2 - 4}">${esc(e.label)}</text>` : ""}</g>`).join("")}
    ${nodes.map(n => `<g class="w-node ${n.id === WEB.around ? "focus" : ""}" data-id="${n.id}" transform="translate(${P[n.id].x},${P[n.id].y})" style="--c:${entryColor(n)}">
      <circle r="${n.id === WEB.around ? 20 : 15}"/><text class="w-ic" y="5">${kindOf(n).icon}</text><text class="w-name" y="32">${esc(n.name)}</text></g>`).join("")}</svg>`;
  return [`<div class="page wide web-page">${webTabs("web")}
    <div class="chips-row">
      ${DB.kinds.map(k => `<button class="fchip ${kinds.has(k.id) ? "on" : ""}" style="--c:${k.color}" data-act="webKind" data-k="${k.id}">${k.icon} ${esc(k.name)}</button>`).join("")}
      <button class="fchip ${WEB.mentions ? "on" : ""}" data-act="webMentions">[[mentions]]</button>
      <select data-change="webAround"><option value="">Everyone</option>${DB.entries.slice().sort((a, b) => a.name.localeCompare(b.name)).map(e => `<option value="${e.id}" ${e.id === WEB.around ? "selected" : ""}>Around ${esc(e.name)}</option>`).join("")}</select>
      ${WEB.around ? `<select data-change="webHops">${[1, 2, 3].map(h => `<option value="${h}" ${h === WEB.hops ? "selected" : ""}>${plural(h, "step")} out</option>`).join("")}</select>` : ""}
      <button class="btn small ghost" data-act="webShuffle">Re-arrange</button>
    </div>
    <div class="web-wrap">${nodes.length ? svg : empty("Nothing to show. Add codex entries and relationships between them.")}</div>
    <p class="muted small">Drag to arrange. Tap someone to open their page.</p></div>`, wireWeb];
});
function wireWeb(main) {
  const svg = $(".web-svg", main);
  if (!svg) return;
  let drag = null, moved = 0;
  const toSvg = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  svg.addEventListener("pointerdown", e => { const g = e.target.closest(".w-node"); if (!g) return; drag = g; moved = 0; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener("pointermove", e => {
    if (!drag) return;
    moved++;
    const p = toSvg(e), id = drag.dataset.id;
    WEB.pos[id] = { x: p.x, y: p.y };
    drag.setAttribute("transform", `translate(${p.x},${p.y})`);
    for (const g of $$(`.w-edge[data-a="${id}"], .w-edge[data-b="${id}"]`, svg)) {
      const a = WEB.pos[g.dataset.a], b = WEB.pos[g.dataset.b], l = $("line", g), t = $("text", g);
      l.setAttribute("x1", a.x); l.setAttribute("y1", a.y); l.setAttribute("x2", b.x); l.setAttribute("y2", b.y);
      if (t) { t.setAttribute("x", (a.x + b.x) / 2); t.setAttribute("y", (a.y + b.y) / 2 - 4); }
    }
  });
  svg.addEventListener("pointerup", () => { if (drag && moved < 3) go("#/e/" + drag.dataset.id); drag = null; });
}
ACT.webKind = el => { WEB.kinds ||= new Set(DB.kinds.map(k => k.id)); const k = el.dataset.k; WEB.kinds.has(k) ? WEB.kinds.delete(k) : WEB.kinds.add(k); rerender(); };
ACT.webMentions = () => { WEB.mentions = !WEB.mentions; rerender(); };
ACT.webAround = el => { WEB.around = el.value; rerender(); };
ACT.webHops = el => { WEB.hops = +el.value; rerender(); };
ACT.webShuffle = () => { WEB.pos = {}; rerender(); };
