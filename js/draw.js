"use strict";
/* ── drawing ── draw world maps and battlemaps in the app, from scratch or
   over an uploaded image. Everything is kept as shapes, not pixels, so a
   drawing takes kilobytes where a picture takes megabytes.

   A drawing is { v, bg (a texture filling everything, or null), items: [] }:
     brush   { pts, c, w }        freehand ink
     terrain { pts, tex, w }      a wide textured stroke (rivers, roads, coasts, forests)
     area    { pts, tex }         a filled textured shape (lakes, fields, mountains)
     cells   { tex, cells }       grid squares of floor (battlemaps)
     wall    { pts, w }           walls, snapped to grid corners on battlemaps
     stamp   { s or a, x, y, z, r } a built-in stamp (s) or your own picture (a)
     text    { x, y, s, z, c }
   pts are flat [x, y, x, y, …] in the picture's own pixels. Saved drawings
   live with the pictures (assets.js) and never change; an edited drawing is
   saved under a new id. Unfinished work is kept as a draft as you go. */

/* ── textures, as SVG patterns drawn in a 100×100 tile ── */
const TEXTURES = {
  grass: ["Grass", "#7aa257", "#56783a", `<path d="M10 30l3-8 3 8M60 70l3-8 3 8M80 20l2-6 2 6M30 85l3-7 3 7M45 45l2-5 2 5" stroke="#5c8a3e" stroke-width="2.5" fill="none"/><circle cx="70" cy="40" r="2" fill="#94bb6c"/><circle cx="20" cy="60" r="2" fill="#94bb6c"/>`],
  forest: ["Forest", "#2f5a32", "#1d3a20", `<circle cx="25" cy="25" r="21" fill="#3f7a3e"/><circle cx="19" cy="19" r="8" fill="#4f8f4a"/><circle cx="76" cy="68" r="23" fill="#3a723a"/><circle cx="70" cy="61" r="9" fill="#4f8f4a"/><circle cx="80" cy="18" r="14" fill="#447f42"/><circle cx="22" cy="80" r="15" fill="#447f42"/>`],
  water: ["Water", "#4a8fc0", "#2e6690", `<path d="M5 30q10-8 20 0t20 0M50 75q10-8 20 0t20 0" stroke="#7ab8e0" stroke-width="3" fill="none" stroke-linecap="round"/>`],
  sea: ["Deep water", "#2f6a9a", "#1f4c72", `<path d="M10 35q8-6 16 0t16 0M55 80q8-6 16 0t16 0" stroke="#4f8cbc" stroke-width="3" fill="none" stroke-linecap="round"/>`],
  sand: ["Sand", "#e2cb92", "#b89c5e", `<circle cx="15" cy="20" r="1.8" fill="#c9ae6e"/><circle cx="60" cy="35" r="1.8" fill="#c9ae6e"/><circle cx="35" cy="70" r="1.8" fill="#c9ae6e"/><circle cx="85" cy="80" r="1.8" fill="#c9ae6e"/><circle cx="75" cy="10" r="1.4" fill="#f0dca8"/>`],
  dirt: ["Dirt", "#8a6a44", "#5e4528", `<circle cx="20" cy="25" r="3" fill="#735634"/><circle cx="70" cy="55" r="4" fill="#735634"/><circle cx="40" cy="80" r="2" fill="#a0805a"/><circle cx="85" cy="20" r="2.5" fill="#a0805a"/>`],
  rock: ["Rock", "#8a8a8a", "#5a5a5a", `<path d="M10 20l15 10 5 15M60 60l20-10M50 90l10-15M70 15l8 12" stroke="#6a6a6a" stroke-width="3" fill="none"/><path d="M30 55l12-4 6 9-10 5z" fill="#9c9c9c"/>`],
  mountains: ["Mountains", "#a39a86", "#6e6553", `<path d="M5 70L28 25 51 70zM50 95L73 50 96 95z" fill="#8a816e"/><path d="M28 25L20 41 28 37 35 43zM73 50L65 66 73 62 80 68z" fill="#f4f1ea"/><path d="M28 25L51 70H38z" fill="#756c5a"/>`],
  snow: ["Snow", "#f2f5f8", "#b8c6d4", `<circle cx="20" cy="30" r="2" fill="#dfe6ee"/><circle cx="70" cy="65" r="2.5" fill="#dfe6ee"/><circle cx="45" cy="85" r="1.5" fill="#dfe6ee"/>`],
  swamp: ["Swamp", "#5a6a3a", "#3a4626", `<ellipse cx="30" cy="35" rx="18" ry="9" fill="#4a6a6a"/><ellipse cx="72" cy="75" rx="15" ry="8" fill="#4a6a6a"/><path d="M70 20l2-8 2 8M20 75l2-8 2 8" stroke="#7a8a4a" stroke-width="2" fill="none"/>`],
  lava: ["Lava", "#b8321a", "#5a1a0e", `<path d="M10 30q20 10 35-5t40 15M5 80q25-10 45 5t40-10" stroke="#ffcc4a" stroke-width="4" fill="none"/><circle cx="60" cy="50" r="6" fill="#f07a1a"/>`],
  road: ["Road", "#b3a688", "#7d7058", `<g fill="#a29476" stroke="#8a7c62" stroke-width="2"><ellipse cx="22" cy="22" rx="16" ry="12"/><ellipse cx="68" cy="25" rx="20" ry="13"/><ellipse cx="30" cy="70" rx="20" ry="14"/><ellipse cx="78" cy="75" rx="15" ry="12"/></g>`],
  stone: ["Stone floor", "#9a9a9e", "#55555a", `<path d="M0 50H100M50 0V100M0 0H100M0 0V100" stroke="#6e6e74" stroke-width="3"/><rect x="4" y="4" width="42" height="42" fill="#a4a4a8"/><rect x="54" y="54" width="42" height="42" fill="#a4a4a8"/>`],
  wood: ["Wooden floor", "#9a6a3c", "#5e3d1e", `<path d="M0 25H100M0 50H100M0 75H100M0 0H100M30 0V25M70 25V50M20 50V75M60 75V100" stroke="#6e4826" stroke-width="2.5"/>`],
  cave: ["Cave floor", "#5f554c", "#2e2823", `<circle cx="25" cy="30" r="5" fill="#544b43"/><circle cx="70" cy="65" r="7" fill="#6b6157"/><circle cx="80" cy="20" r="3" fill="#544b43"/><circle cx="30" cy="80" r="4" fill="#6b6157"/>`],
  carpet: ["Carpet", "#8a2c34", "#4e161b", `<rect x="8" y="8" width="84" height="84" fill="none" stroke="#c9a24a" stroke-width="3"/><path d="M50 25L75 50 50 75 25 50z" fill="#a8424a"/>`],
};
const texList = battle => Object.entries(TEXTURES).filter(([k]) => battle || !["carpet", "wood", "stone"].includes(k));

/* ── stamps, drawn in a 100×100 box (top-down for battlemaps, side-on icons for world maps) ── */
const SHADOW = `<ellipse cx="54" cy="56" rx="40" ry="40" fill="rgba(0,0,0,.22)"/>`;
const STAMPS = {
  tree: ["Tree", `${SHADOW}<circle cx="50" cy="50" r="38" fill="#3f7a3e"/><circle cx="42" cy="40" r="22" fill="#4f8f4a"/><circle cx="62" cy="60" r="15" fill="#356a35"/>`],
  pine: ["Pine", `${SHADOW}<path d="M50 6L60 34 92 30 66 50 86 80 54 66 50 96 46 66 14 80 34 50 8 30 40 34z" fill="#2c5a34"/><path d="M50 26L56 42 74 40 60 52 70 70 52 60 50 76 48 60 30 70 40 52 26 40 44 42z" fill="#3c7444"/>`],
  bush: ["Bush", `<circle cx="38" cy="55" r="22" fill="#4a7d3a"/><circle cx="62" cy="50" r="24" fill="#558a42"/><circle cx="50" cy="35" r="18" fill="#62994d"/>`],
  rock: ["Rock", `<path d="M18 62L30 30 58 20 82 38 86 66 60 84 28 80z" fill="#7d7d80"/><path d="M30 30L58 20 82 38 52 46z" fill="#9a9a9e"/><path d="M52 46L60 84" stroke="#5f5f62" stroke-width="3"/>`],
  mountain: ["Mountain", `<path d="M4 92L42 18 58 44 68 30 96 92z" fill="#8a816e"/><path d="M42 18L58 44 52 92H40z" fill="#756c5a"/><path d="M42 18L33 36 42 32 49 38z" fill="#fff"/><path d="M68 30L62 42 68 40 73 44z" fill="#fff"/>`],
  hills: ["Hills", `<path d="M4 80Q26 34 50 80zM40 80Q66 28 96 80z" fill="#9aa86a" stroke="#6f7c48" stroke-width="3"/>`],
  volcano: ["Volcano", `<path d="M4 92L38 30H62L96 92z" fill="#6e5a4c"/><path d="M38 30H62L56 40H44z" fill="#e2551e"/><path d="M50 26q-10-12 0-20q10 8 0 20" fill="#9a9a9e" opacity=".7"/>`],
  city: ["City", `<path d="M10 90V50L22 40 34 50V90zM34 90V30L50 14 66 30V90zM66 90V55L78 45 90 55V90z" fill="#c7b08a" stroke="#5e4b32" stroke-width="3"/><path d="M50 14V4" stroke="#5e4b32" stroke-width="3"/><path d="M50 4h12l-4 4 4 4H50" fill="#b9413a"/>`],
  castle: ["Castle", `<path d="M14 90V36h10v8h8v-8h10v12h16V36h10v8h8v-8h10v54H58V70a8 8 0 0 0-16 0v20z" fill="#b8ad98" stroke="#5a5040" stroke-width="3"/>`],
  tower: ["Tower", `<path d="M34 92V28h6v-8h6v8h8v-8h6v8h6v64z" fill="#b8ad98" stroke="#5a5040" stroke-width="3"/><rect x="46" y="44" width="8" height="12" fill="#3a3228"/>`],
  village: ["Village", `<path d="M8 88V64l14-12 14 12v24zM40 88V58l14-12 14 12v30zM70 88V68l11-9 11 9v20z" fill="#d8c29a" stroke="#6b4f2e" stroke-width="3"/><path d="M8 64l14-12 14 12M40 58l14-12 14 12M70 68l11-9 11 9" stroke="#9a3b2a" stroke-width="5" fill="none"/>`],
  ruins: ["Ruins", `<path d="M14 90V50h12v40zM40 90V30h12v24l8 6v30zM70 90V60h14v30z" fill="#a49a88" stroke="#5a5040" stroke-width="3"/><path d="M6 92h88" stroke="#5a5040" stroke-width="3"/>`],
  cave: ["Cave", `<path d="M6 90Q20 30 50 26T94 90z" fill="#8a816e"/><path d="M30 90Q34 54 50 52T70 90z" fill="#1c1814"/>`],
  house: ["House", `<rect x="14" y="20" width="72" height="60" fill="#8b4513"/><path d="M14 20h72L50 50zM14 80h72L50 50z" fill="#a0522d"/><path d="M14 20l36 30 36-30M14 80l36-30 36 30" stroke="#5e2f0d" stroke-width="2.5" fill="none"/><rect x="62" y="28" width="9" height="9" fill="#555"/>`],
  tent: ["Tent", `<path d="M50 8L92 50 50 92 8 50z" fill="#c9b27a"/><path d="M50 8V92M8 50H92" stroke="#8a7348" stroke-width="3"/><path d="M50 8L92 50H50z" fill="#b39c66"/>`],
  campfire: ["Campfire", `<circle cx="50" cy="50" r="34" fill="none" stroke="#7d7d80" stroke-width="10" stroke-dasharray="10 4"/><path d="M50 22c12 14 14 22 6 36-2-8-6-10-6-10s-6 8-8 14c-8-12-4-24 8-40z" fill="#f07a1a"/><path d="M50 40c6 8 6 14 2 20-4-4-8-4-6-10z" fill="#ffd34a"/>`],
  well: ["Well", `<circle cx="50" cy="50" r="38" fill="#8a8a8e"/><circle cx="50" cy="50" r="26" fill="#2e5a7a"/><path d="M12 50h76" stroke="#6b4f2e" stroke-width="6"/>`],
  boat: ["Boat", `<path d="M50 4C72 24 74 70 64 96H36C26 70 28 24 50 4z" fill="#8b5a2b" stroke="#5e3a16" stroke-width="3"/><path d="M36 40h28M34 60h32M36 80h28" stroke="#5e3a16" stroke-width="3"/>`],
  door: ["Door", `<rect x="10" y="40" width="80" height="20" fill="#8b5a2b" stroke="#4e3216" stroke-width="3"/><path d="M36 40v20M64 40v20" stroke="#4e3216" stroke-width="2"/>`],
  stairs: ["Stairs", `<rect x="10" y="10" width="80" height="80" fill="#9a9a9e"/><g stroke="#55555a" stroke-width="3">${[20, 32, 44, 56, 68, 80].map(y => `<path d="M10 ${y}h80"/>`).join("")}</g><path d="M10 10h80v80H10z" fill="none" stroke="#3e3e42" stroke-width="3"/>`],
  chest: ["Chest", `<rect x="14" y="26" width="72" height="48" rx="4" fill="#8b5a2b" stroke="#4e3216" stroke-width="3"/><path d="M14 44h72" stroke="#c9a24a" stroke-width="5"/><rect x="44" y="40" width="12" height="12" fill="#e2c35a"/>`],
  barrel: ["Barrel", `<circle cx="50" cy="50" r="36" fill="#9a6a3c" stroke="#4e3216" stroke-width="4"/><circle cx="50" cy="50" r="24" fill="none" stroke="#6b4f2e" stroke-width="4"/><circle cx="50" cy="50" r="6" fill="#4e3216"/>`],
  crate: ["Crate", `<rect x="14" y="14" width="72" height="72" fill="#b08550" stroke="#5e3d1e" stroke-width="4"/><path d="M14 14l72 72M86 14L14 86" stroke="#5e3d1e" stroke-width="4"/>`],
  table: ["Table", `<rect x="10" y="26" width="80" height="48" rx="4" fill="#9a6a3c" stroke="#4e3216" stroke-width="3"/><path d="M10 42h80M10 58h80" stroke="#6b4f2e" stroke-width="2"/>`],
  chair: ["Chair", `<rect x="26" y="30" width="48" height="44" rx="4" fill="#9a6a3c" stroke="#4e3216" stroke-width="3"/><rect x="26" y="20" width="48" height="12" fill="#6b4f2e"/>`],
  bed: ["Bed", `<rect x="22" y="8" width="56" height="84" rx="4" fill="#9a6a3c" stroke="#4e3216" stroke-width="3"/><rect x="28" y="14" width="44" height="16" rx="5" fill="#f2efe6"/><rect x="26" y="36" width="48" height="52" fill="#3e5a8a"/>`],
  pillar: ["Pillar", `<circle cx="50" cy="50" r="36" fill="#b8b4a8" stroke="#6e6a60" stroke-width="5"/><circle cx="50" cy="50" r="22" fill="#cfcbbf"/>`],
  statue: ["Statue", `<rect x="16" y="16" width="68" height="68" fill="#8a8a8e" stroke="#55555a" stroke-width="3"/><circle cx="50" cy="40" r="10" fill="#c9c9cc"/><path d="M34 74q16-30 32 0z" fill="#c9c9cc"/>`],
  altar: ["Altar", `<rect x="12" y="30" width="76" height="40" fill="#8a8a8e" stroke="#4e4e52" stroke-width="3"/><circle cx="24" cy="40" r="4" fill="#ffd34a"/><circle cx="76" cy="40" r="4" fill="#ffd34a"/><path d="M44 50h12M50 44v12" stroke="#c9a24a" stroke-width="3"/>`],
  bones: ["Bones", `<circle cx="40" cy="38" r="14" fill="#ece6d6"/><circle cx="35" cy="36" r="3" fill="#333"/><circle cx="45" cy="36" r="3" fill="#333"/><path d="M50 60l30 20M78 60L52 82" stroke="#ece6d6" stroke-width="7" stroke-linecap="round"/>`],
  flag: ["Flag", `<path d="M30 92V8" stroke="#4e3216" stroke-width="5"/><path d="M32 10h46l-10 14 10 14H32z" fill="#b9413a"/>`],
  skullmark: ["Danger", `<circle cx="50" cy="44" r="30" fill="#ece6d6" stroke="#333" stroke-width="3"/><circle cx="39" cy="42" r="7" fill="#333"/><circle cx="61" cy="42" r="7" fill="#333"/><path d="M40 68v10M50 68v10M60 68v10" stroke="#333" stroke-width="4"/>`],
};

/* ── drawings: cached once read, and drawn as SVG ── */
const DRAWINGS = new Map();
let drawSeq = 0;
async function loadDrawing(id) {
  if (DRAWINGS.has(id)) return DRAWINGS.get(id);
  const raw = await assetData(id);
  let d = null;
  try { d = raw ? JSON.parse(raw) : null; } catch {}
  d ||= { v: 1, bg: null, items: [] };
  DRAWINGS.set(id, d);
  return d;
}
async function putDrawing(d) {
  const id = "drw" + uid();
  DRAWINGS.set(id, d);
  await assetPut(JSON.stringify(d), id);
  return id;
}
// dims: { w, h, cell?, ox?, oy? } (cell for battlemaps)
function drawingHtml(id, dims) {
  if (!id) return "";
  if (DRAWINGS.has(id)) return drawingSvg(DRAWINGS.get(id), dims);
  loadDrawing(id).then(d => { for (const el of $$(`[data-drawing="${id}"]`)) el.outerHTML = drawingSvg(d, JSON.parse(el.dataset.dims)); });
  return `<div class="drawing-slot" data-drawing="${id}" data-dims='${esc(JSON.stringify(dims))}'></div>`;
}
const flat = pts => { let d = ""; for (let i = 0; i < pts.length; i += 2) d += (i ? "L" : "M") + pts[i] + " " + pts[i + 1]; return d; };
function drawingSvg(d, dims, { editing = false } = {}) {
  const P = "dp" + (++drawSeq) + "-", S = dims.cell || 60;
  const used = new Set([d.bg, ...d.items.map(i => i.tex)].filter(Boolean));
  const stamps = new Set(d.items.filter(i => i.t === "stamp" && i.s).map(i => i.s));
  const defs = [...used].filter(t => TEXTURES[t]).map(t => `<pattern id="${P}${t}" width="${S}" height="${S}" patternUnits="userSpaceOnUse" viewBox="0 0 100 100"><rect width="100" height="100" fill="${TEXTURES[t][1]}"/>${TEXTURES[t][3]}</pattern>`).join("")
    + [...stamps].filter(s => STAMPS[s]).map(s => `<symbol id="${P}s-${s}" viewBox="0 0 100 100">${STAMPS[s][1]}</symbol>`).join("");
  const idx = new Map(d.items.map((it, i) => [it, i]));
  const of = t => d.items.filter(i => i.t === t);
  const out = [];
  if (d.bg && TEXTURES[d.bg]) out.push(`<rect width="${dims.w}" height="${dims.h}" fill="url(#${P}${d.bg})"/>`);
  for (const it of of("cells")) {
    const c = dims.cell || 70, ox = dims.ox || 0, oy = dims.oy || 0;
    let p = "";
    for (let k = 0; k < it.cells.length; k += 2) p += `M${ox + it.cells[k] * c} ${oy + it.cells[k + 1] * c}h${c}v${c}h${-c}z`;
    out.push(`<path data-i="${idx.get(it)}" d="${p}" fill="url(#${P}${it.tex})" stroke="${TEXTURES[it.tex]?.[2] || "#000"}" stroke-width="1" stroke-opacity=".35"/>`);
  }
  // terrain: every texture's edges first, then its fills, so strokes of the
  // same kind melt into one another instead of showing seams
  const terr = d.items.filter(i => i.t === "terrain" || i.t === "area");
  for (const tex of [...new Set(terr.map(i => i.tex))]) {
    const group = terr.filter(i => i.tex === tex), edge = TEXTURES[tex]?.[2] || "#333";
    for (const it of group) out.push(it.t === "area"
      ? `<path data-i="${idx.get(it)}" d="${flat(it.pts)}Z" fill="${edge}" stroke="${edge}" stroke-width="8" stroke-linejoin="round"/>`
      : `<path data-i="${idx.get(it)}" d="${flat(it.pts)}" fill="none" stroke="${edge}" stroke-width="${it.w + 8}" stroke-linecap="round" stroke-linejoin="round"/>`);
    for (const it of group) out.push(it.t === "area"
      ? `<path data-i="${idx.get(it)}" d="${flat(it.pts)}Z" fill="url(#${P}${tex})"/>`
      : `<path data-i="${idx.get(it)}" d="${flat(it.pts)}" fill="none" stroke="url(#${P}${tex})" stroke-width="${it.w}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const it of of("brush")) out.push(`<path data-i="${idx.get(it)}" d="${flat(it.pts)}" fill="none" stroke="${it.c}" stroke-width="${it.w}" stroke-linecap="round" stroke-linejoin="round"/>`);
  // walls: dark stone with a pale edge, so they show on dark and light ground alike
  for (const it of of("wall")) out.push(`<path d="${flat(it.pts)}" fill="none" stroke="#cfc8b8" stroke-width="${it.w + 4}" stroke-linecap="square" stroke-linejoin="miter" pointer-events="none"/><path data-i="${idx.get(it)}" d="${flat(it.pts)}" fill="none" stroke="#1c1a20" stroke-width="${it.w}" stroke-linecap="square" stroke-linejoin="miter"/>`);
  for (const it of of("stamp")) {
    const tr = `translate(${it.x} ${it.y}) rotate(${it.r || 0})`, z = it.z;
    out.push(it.a ? `<g data-i="${idx.get(it)}" transform="${tr}"><image href="${assetSrc(it.a) || BLANK_IMG}" data-asset="${it.a}" x="${-z / 2}" y="${-z / 2}" width="${z}" height="${z}" preserveAspectRatio="xMidYMid meet"/></g>`
      : `<g data-i="${idx.get(it)}" transform="${tr}"><use href="#${P}s-${it.s}" x="${-z / 2}" y="${-z / 2}" width="${z}" height="${z}"/>${editing ? `<rect x="${-z / 2}" y="${-z / 2}" width="${z}" height="${z}" fill="transparent"/>` : ""}</g>`);
  }
  for (const it of of("text")) out.push(`<text data-i="${idx.get(it)}" x="${it.x}" y="${it.y}" font-size="${it.z}" fill="${it.c}" class="draw-text">${esc(it.s)}</text>`);
  return `<svg class="drawing ${editing ? "editing" : ""}" viewBox="0 0 ${dims.w} ${dims.h}" width="${dims.w}" height="${dims.h}"><defs>${defs}</defs>${out.join("")}</svg>`;
}
// <image href> doesn't take part in showAsset's src swap, so do it here too
on("route", () => {
  for (const el of $$("image[data-asset]")) { const u = assetSrc(el.dataset.asset); if (u) el.setAttribute("href", u); }
});

/* ── the editor ── */
// each tool remembers its own width (text: its size)
const ED = { target: null, d: null, tool: "pen", tex: "grass", color: "#2b2140", width: 6, widths: { pen: 6, terrain: 60, wall: 10, text: 0 }, stamp: "tree", size: 1, rot: 0, undo: [], redo: [], wall: [], dirty: false };
const stampBase = t => t.battle ? t.dims.cell : 120;
const PEN_COLORS = ["#2b2140", "#5a3a1a", "#9a2a2a", "#2a5a9a", "#2a7a3a", "#ffffff", "#e3c27a"];
function drawTarget(kind, id) {
  if (kind === "map") { const m = byId(DB.maps, id); return m && { kind, id, name: m.name, obj: m, dims: { w: m.w, h: m.h }, back: "#/map/" + id, battle: false }; }
  const x = byId(DB.encounters, id), b = x?.battle;
  return b && { kind, id, name: x.name, obj: b, dims: { w: b.w, h: b.h, cell: b.cell, ox: b.ox, oy: b.oy }, back: "#/enc/" + id, battle: true };
}
const draftKey = t => `draft:${t.kind}:${t.id}`;
async function openDrawing(kind, id) {
  const t = drawTarget(kind, id);
  if (!t) return toast("That isn't there any more");
  [...MODALS].forEach(x => x.close());
  const draft = await assetData(draftKey(t)).catch(() => null);
  let d;
  if (draft) { d = JSON.parse(draft); toast("Picked up your unsaved drawing where you left it"); }
  else d = structuredClone(t.obj.draw ? await loadDrawing(t.obj.draw) : { v: 1, bg: null, items: [] });
  Object.assign(ED, { target: t, d, undo: [], redo: [], wall: [], dirty: !!draft });
  ED.widths.text ||= t.battle ? 22 : 44;
  ED.width = ED.widths[ED.tool] ?? ED.width;
  if (!t.battle && ED.tool === "floor") ED.tool = "terrain";
  go(`#/draw/${kind}/${id}`);
}
ACT.drawOpen = el => openDrawing(el.dataset.kind, el.dataset.id);

const DRAW_TOOLS = [["pan", "✋", "Move around"], ["pen", "✏", "Pen"], ["terrain", "🖌", "Terrain"], ["area", "⬭", "Area"], ["floor", "▦", "Floor"], ["wall", "▬", "Wall"],
  ["stamp", "★", "Stamp"], ["text", "T", "Text"], ["move", "✥", "Move"], ["erase", "⌫", "Erase"]];
addRoute("draw", "map", (kind, id) => {
  const t = ED.target;
  if (!t || t.kind !== kind || t.id !== id || !ED.d) { setTimeout(() => openDrawing(kind, id)); return `<div class="page">${empty("Opening the drawing…")}</div>`; }
  const tools = DRAW_TOOLS.filter(([k]) => k !== "floor" || t.battle);
  const texPick = (act, cur) => `<div class="tex-pick">${texList(t.battle).map(([k, [name, col, edge]]) => `<button class="tex ${cur === k ? "on" : ""}" data-act="${act}" data-v="${k}" title="${name}" style="background:${col};border-color:${edge}">${cur === k ? "✓" : ""}</button>`).join("")}</div>`;
  const size = (lbl, k, min, max, step) => `<label class="inline">${lbl} <input type="range" min="${min}" max="${max}" step="${step}" value="${ED[k]}" data-input="drawOpt" data-k="${k}"></label>`;
  const opts = {
    pen: `<div class="pen-colors">${PEN_COLORS.map(c => `<button class="sw-btn ${ED.color === c ? "on" : ""}" data-act="drawColor" data-v="${c}" style="background:${c}"></button>`).join("")}</div>${size("Width", "width", 1, 40, 1)}`,
    terrain: `${texPick("drawTex", ED.tex)}${size("Width", "width", 10, 200, 5)}`,
    area: `${texPick("drawTex", ED.tex)}<span class="hint">Drag round the shape to fill it</span>`,
    floor: `${texPick("drawTex", ED.tex)}<span class="hint">Drag over squares; start on a square of the same floor to remove it</span>`,
    wall: `${size("Thickness", "width", 2, 40, 1)}<span class="hint">${ED.wall.length ? `<button class="btn small accent" data-act="wallDone">Finish wall</button>` : "Tap corner after corner; tap the last one again to finish"}</span>`,
    stamp: `<div class="stamp-pick">${Object.entries(STAMPS).map(([k, [name, svg]]) => `<button class="stamp ${ED.stamp === k ? "on" : ""}" data-act="drawStamp" data-v="${k}" title="${name}"><svg viewBox="0 0 100 100">${svg}</svg></button>`).join("")}
        ${DB.stamps.map(s => `<button class="stamp ${ED.stamp === "a:" + s.asset ? "on" : ""}" data-act="drawStamp" data-v="a:${s.asset}" title="${esc(s.name)}">${assetImg(s.asset)}</button>`).join("")}
        <button class="stamp add" data-act="stampUpload" title="Add your own (a PNG with a transparent background works best)">+</button></div>
      ${size(t.battle ? "Size (squares)" : "Size", "size", 0.25, t.battle ? 6 : 4, 0.25)}${size("Turn", "rot", 0, 345, 15)}`,
    text: `<div class="pen-colors">${PEN_COLORS.map(c => `<button class="sw-btn ${ED.color === c ? "on" : ""}" data-act="drawColor" data-v="${c}" style="background:${c}"></button>`).join("")}</div>${size("Size", "width", 8, 160, 2)}<span class="hint">Tap where the words go</span>`,
    move: `<span class="hint">Drag anything you've drawn to move it</span>`,
    erase: `<span class="hint">Tap something to remove it; drag over floor squares to clear them</span>`,
    pan: `<span class="hint">Drag to move around; scroll or pinch to zoom</span>`,
  }[ED.tool] || "";
  return [`<div class="draw-page">
    <div class="draw-bar">
      <b class="draw-title">✏ ${esc(t.name)}</b>
      <div class="tool-group">${tools.map(([k, i, l]) => `<button class="tool ${ED.tool === k ? "on" : ""}" data-act="drawTool" data-v="${k}" title="${l}">${i}<span>${l}</span></button>`).join("")}</div>
      <button class="btn small" data-act="drawUndo" ${ED.undo.length ? "" : "disabled"} title="Undo (Ctrl/⌘ Z)">↶</button><button class="btn small" data-act="drawRedo" ${ED.redo.length ? "" : "disabled"} title="Redo">↷</button>
      <select data-change="drawBg" title="Fill the whole background"><option value="">Background: ${t.battle ? "plain" : "as it is"}</option>${texList(t.battle).map(([k, [n]]) => `<option value="${k}" ${ED.d.bg === k ? "selected" : ""}>Background: ${n}</option>`).join("")}</select>
      <span class="spacer"></span>
      <button class="btn small ghost" data-act="drawCancel">Cancel</button><button class="btn small accent" data-act="drawDone">Done</button>
    </div>
    <div class="draw-opts">${opts}</div>
    <div class="map-stage draw-stage tool-${ED.tool}" id="drawStage">
      <div class="map-layer" id="drawLayer" style="width:${t.dims.w}px;height:${t.dims.h}px">
        ${t.kind === "map" ? mapBg(t.obj) : t.obj.asset ? assetImg(t.obj.asset, "map-img", `draggable="false"`) : `<div class="battle-plain"></div>`}
        <div id="drawHost">${drawingSvg(ED.d, t.dims, { editing: true })}</div>
        ${t.battle && t.obj.grid ? battleGridSvg(t.obj, "edgrid") : ""}
        <svg class="map-svg draw-preview" id="drawPreview" viewBox="0 0 ${t.dims.w} ${t.dims.h}" width="${t.dims.w}" height="${t.dims.h}"></svg>
      </div>
      <div class="zoom-btns"><button data-act="mapZoom" data-k="1.4" data-stage="drawStage">+</button><button data-act="mapZoom" data-k="0.7" data-stage="drawStage">−</button><button data-act="mapFit" data-stage="drawStage" title="Fit">⤢</button></div>
    </div></div>`, wireDraw];
});

function edChanged(fn) {
  ED.undo.push(JSON.stringify(ED.d)); if (ED.undo.length > 60) ED.undo.shift();
  ED.redo = [];
  fn();
  ED.dirty = true;
  redrawEd();
  saveDraft();
}
function redrawEd() {
  const host = $("#drawHost");
  if (host) host.innerHTML = drawingSvg(ED.d, ED.target.dims, { editing: true });
  const u = $("[data-act=drawUndo]"), r = $("[data-act=drawRedo]");
  if (u) u.disabled = !ED.undo.length;
  if (r) r.disabled = !ED.redo.length;
}
let draftT = null;
function saveDraft() { clearTimeout(draftT); draftT = setTimeout(() => assetPut(JSON.stringify(ED.d), draftKey(ED.target)).catch(() => {}), 800); }

function wireDraw(main) {
  const t = ED.target, stage = $("#drawStage", main), layer = $("#drawLayer", main), pv = $("#drawPreview", main);
  if (!stage) return;
  const views = (wireDraw.views ||= {});
  views[t.kind + t.id] = panZoom(stage, layer, t.dims.w, t.dims.h, views[t.kind + t.id], { skip: () => ED.tool !== "pan" });
  const k = () => views[t.kind + t.id].k;
  const at = e => { const p = stage._toLayer(e.clientX, e.clientY); return [Math.round(p.x), Math.round(p.y)]; };
  const cellOf = ([x, y]) => [Math.floor((x - (t.dims.ox || 0)) / t.dims.cell), Math.floor((y - (t.dims.oy || 0)) / t.dims.cell)];
  const snap = ([x, y]) => t.battle ? [Math.round((x - t.obj.ox) / t.obj.cell) * t.obj.cell + t.obj.ox, Math.round((y - t.obj.oy) / t.obj.cell) * t.obj.cell + t.obj.oy] : [x, y];
  const itemAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("#drawHost [data-i]"); return el ? +el.dataset.i : -1; };
  if (ED.wall.length) pv.innerHTML = `<path class="pv-wall" d="${flat(ED.wall)}" stroke-width="${ED.width}"/>`;

  stage.addEventListener("pointerdown", e => {
    if (ED.tool === "pan" || e.target.closest(".zoom-btns")) return;
    e.preventDefault();
    const p0 = at(e), tool = ED.tool;
    if (tool === "text") {
      const s = prompt("Text");
      if (s?.trim()) edChanged(() => ED.d.items.push({ t: "text", x: p0[0], y: p0[1], s: s.trim(), z: ED.width, c: ED.color }));
      return;
    }
    if (tool === "stamp") {
      const z = Math.round(ED.size * stampBase(t));
      let [x, y] = p0;
      // on a battlemap, a whole-square stamp sits in the middle of its squares
      if (t.battle && ED.size >= 1 && Number.isInteger(ED.size)) { const c = t.dims.cell; x = t.obj.ox + (Math.floor((x - t.obj.ox) / c - (ED.size - 1) / 2) + ED.size / 2) * c; y = t.obj.oy + (Math.floor((y - t.obj.oy) / c - (ED.size - 1) / 2) + ED.size / 2) * c; }
      const it = { t: "stamp", x: Math.round(x), y: Math.round(y), z, r: ED.rot };
      if (ED.stamp.startsWith("a:")) it.a = ED.stamp.slice(2); else it.s = ED.stamp;
      edChanged(() => ED.d.items.push(it));
      return;
    }
    if (tool === "wall") {
      const p = snap(p0), w = ED.wall;
      const last = w.length ? [w[w.length - 2], w[w.length - 1]] : null;
      if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 10 / k()) return ACT.wallDone();
      w.push(...p);
      pv.innerHTML = `<path class="pv-wall" d="${flat(w)}" stroke-width="${ED.width}"/>${w.length === 2 ? `<circle cx="${p[0]}" cy="${p[1]}" r="${ED.width}" class="pv-dot"/>` : ""}`;
      if (w.length === 4) rerender();
      return;
    }
    if (tool === "erase" && itemAt(e) >= 0 && ED.d.items[itemAt(e)].t !== "cells") {
      const i = itemAt(e);
      return edChanged(() => ED.d.items.splice(i, 1));
    }
    if (tool === "move") {
      const i = itemAt(e);
      if (i < 0) return;
      const it = ED.d.items[i], before = JSON.stringify(ED.d);
      if (it.t === "cells") return;
      stage.setPointerCapture(e.pointerId);
      let last = p0;
      const mv = ev => {
        const p = at(ev), dx = p[0] - last[0], dy = p[1] - last[1];
        if (!dx && !dy) return;
        last = p;
        if ("x" in it) { it.x += dx; it.y += dy; } else for (let j = 0; j < it.pts.length; j += 2) { it.pts[j] += dx; it.pts[j + 1] += dy; }
        redrawEd();
      };
      stage.addEventListener("pointermove", mv);
      stage.addEventListener("pointerup", () => {
        stage.removeEventListener("pointermove", mv);
        if (JSON.stringify(ED.d) !== before) { ED.undo.push(before); ED.redo = []; ED.dirty = true; redrawEd(); saveDraft(); }
      }, { once: true });
      return;
    }
    if (tool === "floor" || tool === "erase") {
      // painting squares: starting on this floor removes it, anywhere else lays it
      const c0 = cellOf(p0), key = c => c[0] + "," + c[1];
      if (!t.battle) return;
      const sets = new Map();
      for (const i of ED.d.items) if (i.t === "cells") { const s = new Set(); for (let j = 0; j < i.cells.length; j += 2) s.add(i.cells[j] + "," + i.cells[j + 1]); sets.set(i.tex, s); }
      const mine = sets.get(ED.tex) || new Set();
      const removing = tool === "erase" || mine.has(key(c0));
      const before = JSON.stringify(ED.d);
      const cols = gridCols(t.obj), rows = gridRows(t.obj);
      let last = { x: c0[0], y: c0[1] };
      const one = ({ x, y }) => {
        if (x < 0 || y < 0 || x >= cols || y >= rows) return;
        const kk = x + "," + y;
        if (removing) for (const s of sets.values()) { if (tool === "erase" || s === mine) s.delete(kk); }
        else { for (const s of sets.values()) s.delete(kk); mine.add(kk); sets.set(ED.tex, mine); }
      };
      const paint = ev => {
        const [x, y] = cellOf(at(ev)), c = { x, y };
        if (ev === e) one(c); else cellsBetween(last, c).forEach(one);
        last = c;
        ED.d.items = ED.d.items.filter(i => i.t !== "cells");
        for (const [tex, s] of sets) if (s.size) ED.d.items.unshift({ t: "cells", tex, cells: [...s].flatMap(v => v.split(",").map(Number)) });
        redrawEd();
      };
      paint(e);
      stage.setPointerCapture(e.pointerId);
      stage.addEventListener("pointermove", paint);
      stage.addEventListener("pointerup", () => {
        stage.removeEventListener("pointermove", paint);
        if (JSON.stringify(ED.d) !== before) { ED.undo.push(before); ED.redo = []; ED.dirty = true; redrawEd(); saveDraft(); }
      }, { once: true });
      return;
    }
    if (tool === "pen" || tool === "terrain" || tool === "area") {
      const pts = [...p0];
      const w = ED.width;
      const style = tool === "pen" ? `stroke="${ED.color}" stroke-width="${w}"` : tool === "terrain" ? `stroke="${TEXTURES[ED.tex][1]}" stroke-width="${w}" stroke-opacity=".8"` : `stroke="${TEXTURES[ED.tex][2]}" stroke-width="3" fill="${TEXTURES[ED.tex][1]}" fill-opacity=".6"`;
      pv.innerHTML = `<path class="pv-stroke" ${style}/>`;
      const path = pv.firstChild;
      stage.setPointerCapture(e.pointerId);
      const mv = ev => {
        const p = at(ev), n = pts.length;
        if (Math.hypot(p[0] - pts[n - 2], p[1] - pts[n - 1]) < 3 / k()) return;
        pts.push(...p);
        path.setAttribute("d", flat(pts) + (tool === "area" ? "Z" : ""));
      };
      stage.addEventListener("pointermove", mv);
      stage.addEventListener("pointerup", () => {
        stage.removeEventListener("pointermove", mv);
        pv.innerHTML = "";
        if (tool === "pen") { if (pts.length === 2) pts.push(pts[0] + 0.1, pts[1]); edChanged(() => ED.d.items.push({ t: "brush", pts, c: ED.color, w })); }
        else if (tool === "terrain") { if (pts.length === 2) pts.push(pts[0] + 0.1, pts[1]); edChanged(() => ED.d.items.push({ t: "terrain", pts, tex: ED.tex, w })); }
        else if (pts.length >= 6) edChanged(() => ED.d.items.push({ t: "area", pts, tex: ED.tex }));
      }, { once: true });
    }
  });
}
function battleGridSvg(b, pid) {
  return `<svg class="map-svg battle-grid" viewBox="0 0 ${b.w} ${b.h}" width="${b.w}" height="${b.h}"><defs><pattern id="${pid}" width="${b.cell}" height="${b.cell}" x="${b.ox}" y="${b.oy}" patternUnits="userSpaceOnUse">
    <path d="M${b.cell} 0H0V${b.cell}" fill="none"/></pattern></defs><rect x="${b.ox}" y="${b.oy}" width="${gridCols(b) * b.cell}" height="${gridRows(b) * b.cell}" fill="url(#${pid})"/></svg>`;
}

ACT.drawTool = el => {
  if (ED.wall.length) ACT.wallDone();
  if (ED.tool in ED.widths) ED.widths[ED.tool] = ED.width;
  ED.tool = el.dataset.v;
  if (ED.tool in ED.widths) ED.width = ED.widths[ED.tool];
  rerender();
};
ACT.drawTex = el => { ED.tex = el.dataset.v; rerender(); };
ACT.drawColor = el => { ED.color = el.dataset.v; rerender(); };
ACT.drawStamp = el => { ED.stamp = el.dataset.v; rerender(); };
ACT.drawOpt = el => { ED[el.dataset.k] = +el.value; };
ACT.drawBg = el => edChanged(() => { ED.d.bg = el.value || null; });
ACT.wallDone = () => {
  const w = ED.wall;
  ED.wall = [];
  if (w.length >= 4) edChanged(() => ED.d.items.push({ t: "wall", pts: w, w: ED.width }));
  rerender();
};
ACT.drawUndo = () => { if (!ED.undo.length) return; ED.redo.push(JSON.stringify(ED.d)); ED.d = JSON.parse(ED.undo.pop()); ED.dirty = true; redrawEd(); saveDraft(); };
ACT.drawRedo = () => { if (!ED.redo.length) return; ED.undo.push(JSON.stringify(ED.d)); ED.d = JSON.parse(ED.redo.pop()); ED.dirty = true; redrawEd(); saveDraft(); };
document.addEventListener("keydown", e => {
  if (CUR.prefix !== "draw" || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? ACT.drawRedo() : ACT.drawUndo(); }
  else if (e.key === "Escape" && ED.wall.length && !MODALS.length) { ED.wall = []; rerender(); }
  else if (e.key === "Enter" && ED.wall.length) ACT.wallDone();
});
ACT.drawDone = async () => {
  if (ED.wall.length) ACT.wallDone();
  const t = ED.target;
  clearTimeout(draftT);
  if (ED.dirty) {
    const empty = !ED.d.bg && !ED.d.items.length;
    t.obj.draw = empty ? null : await putDrawing(structuredClone(ED.d));
    save();
  }
  await assetDelete(draftKey(t)).catch(() => {});
  ED.target = null; ED.d = null;
  go(t.back);
};
ACT.drawCancel = async () => {
  if (ED.dirty && !await ask("Throw this drawing away?", "What you've drawn since you last pressed Done is lost.", "Throw it away")) return;
  clearTimeout(draftT);
  const t = ED.target;
  await assetDelete(draftKey(t)).catch(() => {});
  ED.target = null; ED.d = null;
  go(t.back);
};
ACT.stampUpload = async () => {
  const img = await pickImage(512);
  if (!img) return;
  const name = prompt("Name this stamp", "Stamp") || "Stamp";
  DB.stamps.push({ id: uid(), asset: img.id, name });
  save();
  ED.stamp = "a:" + img.id;
  rerender();
};
