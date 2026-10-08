"use strict";
/* ── battlemaps and tokens ── an encounter can have a battlemap: an uploaded
   image (or a plain grid) with a square grid laid over it. Tokens stand for
   each player character and each foe; drag one and it snaps to the grid,
   showing how far it went. While the fight runs, tokens show whose turn it
   is, their HP and who is down. Positions are kept on the encounter, in
   squares, so a fight can be set up before the session and picked up after.

   encounter.battle = { asset (or null for a plain grid), w, h (picture pixels),
     cell (pixels per square), ox, oy (where the grid starts), feet, grid,
     tokens: { key: {x, y} } }
   Token keys: "pc:<entry>", "f:<foe id>:<n>" for the nth of a foe, "c:<id>"
   for someone added mid-fight. */

const BATTLEV = { view: {}, sel: null };
const PLAIN_CELL = 70;
const TOKEN_SIZES = { 0.5: "Tiny", 1: "Small or Medium", 2: "Large", 3: "Huge", 4: "Gargantuan" };

const foeId = f => f.id ||= uid();
const initials = name => String(name).split(/\s+/).filter(w => /\w/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
const battleCombat = x => DB.combat && DB.combat.enc === x.id ? DB.combat : null;
const gridCols = b => Math.max(1, Math.floor((b.w - b.ox + 1) / b.cell));
const gridRows = b => Math.max(1, Math.floor((b.h - b.oy + 1) / b.cell));

// who stands on the map: the fight's combatants while it runs, otherwise the
// party and every foe the encounter has
function battleTokens(x) {
  const c = battleCombat(x);
  if (c) return c.list.map((k, i) => ({ key: k.tok || "c:" + k.id, name: k.name, entry: k.entry, pc: k.pc, hp: k.hp, max: k.max, cur: i === c.turn, size: k.size || 1 }));
  const out = DB.entries.filter(e => e.pc).map(e => ({ key: "pc:" + e.id, name: e.name, entry: e.id, pc: true, size: 1 }));
  for (const f of x.foes || []) {
    const n = f.count || 1, e = byId(DB.entries, f.entry);
    for (let i = 0; i < n; i++) out.push({ key: `f:${foeId(f)}:${i}`, name: n > 1 ? `${foeName(f)} ${i + 1}` : foeName(f), entry: f.entry, pc: false, size: f.size || +e?.stats?.size || 1 });
  }
  return out;
}
// Tokens without a square yet are placed for you: the party down the left,
// foes down the right, never on top of someone.
function placeTokens(b, toks) {
  const cols = gridCols(b), rows = gridRows(b), taken = new Set();
  for (const t of toks) { const p = b.tokens[t.key]; if (p) { p.x = clamp(p.x, 0, cols - 1); p.y = clamp(p.y, 0, rows - 1); } }
  const mark = (p, s) => { for (let dx = 0; dx < Math.max(1, s); dx++) for (let dy = 0; dy < Math.max(1, s); dy++) taken.add((p.x + dx) + "," + (p.y + dy)); };
  for (const t of toks) if (b.tokens[t.key]) mark(b.tokens[t.key], t.size);
  for (const t of toks) {
    if (b.tokens[t.key]) continue;
    const s = Math.max(1, Math.ceil(t.size));
    const xs = t.pc ? [...Array(cols).keys()] : [...Array(cols).keys()].reverse();
    let spot = null;
    for (const cx of xs) {
      for (let cy = 0; cy + s <= rows && !spot; cy++) {
        const x0 = t.pc ? cx : cx - s + 1;
        if (x0 < 0 || x0 + s > cols) continue;
        let free = true;
        for (let dx = 0; dx < s && free; dx++) for (let dy = 0; dy < s && free; dy++) if (taken.has((x0 + dx) + "," + (cy + dy))) free = false;
        if (free) spot = { x: x0, y: cy };
      }
      if (spot) break;
    }
    spot ||= { x: 0, y: 0 };
    b.tokens[t.key] = spot;
    mark(spot, s);
  }
}

function tokenHtml(b, t, combat) {
  const p = b.tokens[t.key], e = byId(DB.entries, t.entry), px = t.size * b.cell;
  const pic = e?.token || e?.portrait;
  const f = t.max ? clamp(t.hp / t.max, 0, 1) : 1;
  return `<div class="token ${t.pc ? "pc" : "foe"} ${t.cur ? "cur" : ""} ${combat && t.hp <= 0 ? "down" : ""} ${BATTLEV.sel === t.key ? "sel" : ""}" data-tok="${esc(t.key)}"
    style="left:${b.ox + p.x * b.cell}px;top:${b.oy + p.y * b.cell}px;width:${px}px;height:${px}px;--c:${e ? entryColor(e) : t.pc ? "var(--accent2)" : "var(--danger)"}" title="${esc(t.name)}">
    <div class="tok-face">${pic ? assetImg(pic, "tok-img", `draggable="false"`) : `<span style="font-size:${px * 0.36}px">${esc(initials(t.name))}</span>`}</div>
    ${combat && t.max ? `<i class="tok-hp"><b style="width:${f * 100}%;background:${f > 0.5 ? "#81b29a" : f > 0.25 ? "#e3c27a" : "#e07a5f"}"></b></i>` : ""}
    <span class="tok-name">${esc(t.name)}</span></div>`;
}

// the battlemap panel, for the encounter page and the combat page
function battlePanel(x) {
  const b = x.battle, combat = !!battleCombat(x);
  if (!b) return `<section class="panel battle"><div class="panel-h"><h4>Battlemap</h4></div>
    <p class="muted">Lay the fight out on a grid: upload a battlemap image, or use a plain grid. Tokens for the party and every foe are placed for you.</p>
    <div class="btn-row"><button class="btn accent" data-act="battleImage" data-id="${x.id}">Upload battlemap…</button><button class="btn" data-act="battlePlain" data-id="${x.id}">Plain grid</button></div></section>`;
  const toks = battleTokens(x);
  placeTokens(b, toks);
  const pid = "grid-" + x.id;
  return `<section class="panel battle"><div class="panel-h"><h4>Battlemap</h4><span class="muted small" id="battleInfo">${gridCols(b)} × ${gridRows(b)} squares of ${b.feet} ft</span>
      <button class="btn small" data-act="battleSetup" data-id="${x.id}">Grid…</button></div>
    <div class="battle-stage" id="battleStage" style="aspect-ratio:${b.w} / ${b.h}">
      <div class="map-layer" id="battleLayer" style="width:${b.w}px;height:${b.h}px">
        ${b.asset ? assetImg(b.asset, "map-img", `draggable="false"`) : `<div class="battle-plain"></div>`}
        ${b.grid ? `<svg class="map-svg battle-grid" viewBox="0 0 ${b.w} ${b.h}" width="${b.w}" height="${b.h}"><defs><pattern id="${pid}" width="${b.cell}" height="${b.cell}" x="${b.ox}" y="${b.oy}" patternUnits="userSpaceOnUse">
          <path d="M${b.cell} 0H0V${b.cell}" fill="none"/></pattern></defs><rect x="${b.ox}" y="${b.oy}" width="${gridCols(b) * b.cell}" height="${gridRows(b) * b.cell}" fill="url(#${pid})"/></svg>` : ""}
        ${toks.map(t => tokenHtml(b, t, combat)).join("")}
      </div>
      <div class="zoom-btns"><button data-act="mapZoom" data-k="1.4" data-stage="battleStage">+</button><button data-act="mapZoom" data-k="0.7" data-stage="battleStage">−</button><button data-act="mapFit" data-stage="battleStage" title="Fit">⤢</button></div>
    </div>
    <p class="muted small">Drag a token to move it. ${combat ? "Tap one to find it in the initiative list." : "Positions are kept for when the fight starts."}</p></section>`;
}

function wireBattle(main, x) {
  const stage = $("#battleStage", main), layer = $("#battleLayer", main), b = x.battle;
  if (!stage || !b) return;
  BATTLEV.view[x.id] = panZoom(stage, layer, b.w, b.h, BATTLEV.view[x.id], {
    skip: e => !!e.target.closest(".token"),
    onTap: () => { BATTLEV.sel = null; $$(".token.sel, .init-row.sel", main).forEach(el => el.classList.remove("sel")); },
  });
  const info = $("#battleInfo", main), infoText = info.textContent;
  layer.addEventListener("pointerdown", e => {
    const el = e.target.closest(".token");
    if (!el) return;
    e.preventDefault();
    const key = el.dataset.tok, start = { ...b.tokens[key] }, at = stage._toLayer(e.clientX, e.clientY);
    const grab = { x: at.x - (b.ox + start.x * b.cell), y: at.y - (b.oy + start.y * b.cell) };
    let moved = 0, cell = start;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    const move = ev => {
      const p = stage._toLayer(ev.clientX, ev.clientY);
      moved += Math.abs(ev.movementX) + Math.abs(ev.movementY);
      const lx = p.x - grab.x, ly = p.y - grab.y;
      el.style.left = lx + "px"; el.style.top = ly + "px";
      cell = { x: clamp(Math.round((lx - b.ox) / b.cell), 0, gridCols(b) - 1), y: clamp(Math.round((ly - b.oy) / b.cell), 0, gridRows(b) - 1) };
      const sq = Math.max(Math.abs(cell.x - start.x), Math.abs(cell.y - start.y));
      info.textContent = `${el.title}: ${plural(sq, "square")}, ${sq * b.feet} ft`;
      info.classList.add("measuring");
    };
    const done = () => {
      el.removeEventListener("pointermove", move);
      el.classList.remove("dragging");
      info.classList.remove("measuring");
      if (moved < 4) {
        cell = start;
        BATTLEV.sel = BATTLEV.sel === key ? null : key;
        $$(".token", main).forEach(t => t.classList.toggle("sel", t.dataset.tok === BATTLEV.sel));
        $$(".init-row", main).forEach(r => r.classList.toggle("sel", r.dataset.tok === BATTLEV.sel));
        $(`.init-row[data-tok="${CSS.escape(key)}"]`, main)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        info.textContent = infoText;
      }
      b.tokens[key] = cell;
      el.style.left = (b.ox + cell.x * b.cell) + "px"; el.style.top = (b.oy + cell.y * b.cell) + "px";
      if (cell.x !== start.x || cell.y !== start.y) save({ quiet: true });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", done, { once: true });
    el.addEventListener("pointercancel", done, { once: true });
  });
}

/* ── setting one up ── */
const freshBattle = (x, p) => ({ asset: null, w: 20 * PLAIN_CELL, h: 14 * PLAIN_CELL, cell: PLAIN_CELL, ox: 0, oy: 0, feet: 5, grid: true, tokens: x.battle?.tokens || {}, ...p });
ACT.battleImage = async el => {
  const x = byId(DB.encounters, el.dataset.id), img = await pickImage(4096);
  if (!img) return;
  MODALS.forEach(m => m.close());
  // a first guess at the grid, which the next dialog asks you to correct
  const across = clamp(Math.round(img.w / 100), 10, 40);
  x.battle = freshBattle(x, { asset: img.id, w: img.w, h: img.h, cell: img.w / across });
  delete BATTLEV.view[x.id];
  commit();
  ACT.battleSetup({ dataset: { id: x.id } }, true);
};
ACT.battlePlain = el => {
  const x = byId(DB.encounters, el.dataset.id);
  modal({ title: "Plain grid", body: `<div class="row2">${textField("Squares across", "cols", 20, `type="number" min="2" max="80"`)}${textField("Squares down", "rows", 14, `type="number" min="2" max="80"`)}</div>`,
    buttons: [{ label: "Cancel" }, { label: "Make grid", cls: "accent", act: w => {
      const v = formVals(w), cols = clamp(+v.cols || 20, 2, 80), rows = clamp(+v.rows || 14, 2, 80);
      x.battle = freshBattle(x, { w: cols * PLAIN_CELL, h: rows * PLAIN_CELL });
      delete BATTLEV.view[x.id];
      commit();
    } }] });
};
ACT.battleSetup = (el, fresh = false) => {
  const x = byId(DB.encounters, el.dataset.id), b = x.battle;
  const across = Math.round((b.w - b.ox) / b.cell);
  modal({ title: fresh ? "Line the grid up with the map" : "Battlemap grid",
    body: `${b.asset ? `<p class="muted">Count the squares across the image (most battlemaps say, e.g. “30 × 20”). If the grid doesn't sit on the image's lines, nudge where it starts.</p>
        <div class="row3">${textField("Squares across", "across", across, `type="number" min="1" max="200" step="1"`)}${textField("Grid starts at x (px)", "ox", Math.round(b.ox), `type="number"`)}${textField("…and y (px)", "oy", Math.round(b.oy), `type="number"`)}</div>`
      : `<div class="row2">${textField("Squares across", "cols", gridCols(b), `type="number" min="2" max="80"`)}${textField("Squares down", "rows", gridRows(b), `type="number" min="2" max="80"`)}</div>`}
      <div class="row2">${textField("Feet per square", "feet", b.feet, `type="number" min="1"`)}<label class="check"><input type="checkbox" name="grid" ${b.grid ? "checked" : ""}> Draw the grid</label></div>
      <div class="btn-row">${b.asset ? `<button class="btn" data-act="battleImage" data-id="${x.id}">Replace image…</button>` : `<button class="btn" data-act="battleImage" data-id="${x.id}">Use an image instead…</button>`}
        <button class="btn" data-act="battleReset" data-id="${x.id}">Put tokens back in their starting places</button></div>`,
    buttons: [{ label: "Remove battlemap", cls: "danger", act: () => { withUndo("Battlemap removed", () => { delete x.battle; }); } },
      { label: "Save", cls: "accent", act: w => {
        const v = formVals(w);
        if (b.asset) {
          b.ox = +v.ox || 0; b.oy = +v.oy || 0;
          b.cell = (b.w - b.ox) / clamp(+v.across || across, 1, 200);
        } else {
          const cols = clamp(+v.cols || 20, 2, 80), rows = clamp(+v.rows || 14, 2, 80);
          Object.assign(b, { w: cols * PLAIN_CELL, h: rows * PLAIN_CELL, cell: PLAIN_CELL, ox: 0, oy: 0 });
        }
        b.feet = +v.feet || 5; b.grid = v.grid;
        for (const k in b.tokens) { const p = b.tokens[k]; p.x = clamp(p.x, 0, gridCols(b) - 1); p.y = clamp(p.y, 0, gridRows(b) - 1); }
        delete BATTLEV.view[x.id];
        commit();
      } }] });
};
ACT.battleReset = el => { const x = byId(DB.encounters, el.dataset.id); MODALS.forEach(m => m.close()); x.battle.tokens = {}; commit(); };

// a token picture, separate from the portrait (which is used when there's none)
ACT.setToken = async el => {
  const e = byId(DB.entries, el.dataset.id);
  if (e.token) {
    let choice = null;
    await new Promise(res => modal({ title: "Token picture", body: `<div class="token-preview">${assetImg(e.token)}</div>`, onClose: res,
      buttons: [{ label: "Use the portrait", act: () => { choice = "rm"; } }, { label: "Replace…", cls: "accent", act: () => { choice = "new"; } }] }));
    if (choice === "rm") { e.token = null; return commit(); }
    if (choice !== "new") return;
  }
  const img = await pickImage(256);
  if (img) { e.token = img.id; commit(); }
};
