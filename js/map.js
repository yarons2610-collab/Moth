"use strict";
/* ── maps ── an uploaded image or blank parchment, with pins and regions tied
   to codex entries. A pin can open another map (nested maps, with breadcrumbs
   back up). The time slider shows the world as of a year: places appear once
   founded and fade once destroyed. The 🛡 party marker logs the route the
   party takes into the session being played (see play.js). Pin and region
   positions are fractions of the map's width and height (0…1). */

const MAPV = { cur: null, tool: "pan", sel: null, draft: [], year: null, view: {}, movePin: null };
const PARCHMENT = { w: 1600, h: 1100 };
// (entry, pin) → HTML for the side panel; play.js adds quests, encounters, sessions
const MAP_PLACE_PANELS = [];
// (map) → SVG drawn over the map in its own pixels; play.js draws the party's route
const MAP_OVERLAYS = [];

linkType("map", {
  list: () => DB.maps,
  names: m => [m.name],
  info: m => ({ title: m.name, sub: "Map", icon: "🗺", color: "#81b29a" }),
  href: m => "#/map/" + m.id,
  text: m => m.notes,
  edges: m => [...m.pins.filter(p => p.entry).map(p => ["e", p.entry, "on the map"]), ...m.regions.filter(r => r.entry).map(r => ["e", r.entry, "on the map"])],
});

const mapParent = id => DB.maps.find(m => m.pins.some(p => p.map === id)) || null;
function mapTrail(m) {
  const out = [], seen = new Set([m.id]);
  for (let p = mapParent(m.id); p && !seen.has(p.id); p = mapParent(p.id)) { out.unshift(p); seen.add(p.id); }
  return out;
}
const pinsFor = id => DB.maps.flatMap(m => [...m.pins.filter(p => p.entry === id).map(p => ({ m, p })), ...m.regions.filter(r => r.entry === id).map(r => ({ m, p: regionCenter(r), r }))]);
function regionCenter(r) { const n = r.pts.length; return { id: r.id, x: r.pts.reduce((a, p) => a + p[0], 0) / n, y: r.pts.reduce((a, p) => a + p[1], 0) / n }; }
// shown as of a year: "future" before it exists, "gone" once it has ended
function epoch(e, year) {
  if (!e || year == null) return "";
  if (e.start && e.start.y > year) return "future";
  if (e.end && e.end.y <= year) return "gone";
  return "";
}
function mapBg(m) {
  return m.asset ? assetImg(m.asset, "map-img", `draggable="false"`) : `<div class="parchment"></div>`;
}

/* ── region styles ── a region marks a realm or place, or a zone on one of the
   other layers: climate, landscape or magic. Each zone kind has its own colour
   and fill (hatching, dots, waves, little peaks, sparkles…), any of which can
   be changed per region, along with the border, how strong the fill is, the
   label's size and whether the edges are smoothed. A map can hide layers
   (m.hide), and a legend lists the zones shown. */
const REGION_LAYERS = { realm: ["Realms & places", "🏰"], climate: ["Climate", "🌦"], land: ["Landscape", "⛰"], magic: ["Magic", "✨"] };
const ZONES = {
  climate: {
    polar: ["Polar / ice cap", "#cfe0ef", "dots"], tundra: ["Tundra", "#a9bab2", "dots"], subarctic: ["Subarctic / taiga", "#6f9a80", "trees"],
    temperate: ["Temperate", "#86b866", "tint"], oceanic: ["Oceanic / rainy", "#5fa89a", "rain"], continental: ["Continental", "#a8b060", "hatch"],
    mediterranean: ["Mediterranean", "#d6ae58", "hatch"], steppe: ["Steppe / semi-arid", "#d4bc72", "dots"], desert: ["Desert / arid", "#e6bf72", "waves"],
    savanna: ["Savanna", "#c8a848", "hatch"], tropical: ["Tropical rainforest", "#2f9452", "trees"], monsoon: ["Monsoon", "#3f9a86", "rain"],
    highland: ["Highland / alpine", "#a49ebc", "peaks"], storm: ["Stormy", "#6f7fa8", "rain"],
  },
  land: {
    mountains: ["Mountains", "#8f806a", "peaks"], highlands: ["Highlands", "#a8966a", "hills"], hills: ["Hills", "#a2ac6a", "hills"],
    plateau: ["Plateau", "#b49a72", "cross"], plains: ["Plains / lowlands", "#a6c07e", "tint"], valley: ["Valley / basin", "#78ac74", "tint"],
    forest: ["Forest", "#3d7a48", "trees"], wetlands: ["Wetlands / marsh", "#5f8c78", "reeds"], volcanic: ["Volcanic", "#9a4632", "blots"],
    karst: ["Karst / caves", "#8f9096", "dots"], badlands: ["Badlands / canyons", "#bc7448", "hatch"], dunes: ["Dunes", "#e0bc76", "waves"],
    glacier: ["Glacier", "#c6dff0", "cross"], coast: ["Coast / shelf", "#6eb0d2", "waves"], depths: ["Ocean depths", "#2f5f8f", "waves"],
  },
  magic: {
    wild: ["Wild magic", "#c058d6", "stars"], dead: ["Dead magic", "#6a6a7a", "cross"], ley: ["Ley convergence", "#4ed2ca", "rings"],
    fey: ["Fey realm", "#e486c4", "stars"], blight: ["Blight / corruption", "#6a8a2a", "blots"], holy: ["Holy ground", "#e8cc62", "rays"],
    shadow: ["Shadowlands", "#4a3a72", "hatch"], fire: ["Elemental fire", "#e4602a", "rays"], frost: ["Elemental frost", "#7ec8ec", "dots"],
    dream: ["Dreaming / unreal", "#a294e6", "rings"], sky: ["Sky realm", "#a8d2f2", "rings"], warded: ["Warded / sealed", "#d8b048", "cross"],
  },
};
const REGION_FILLS = { tint: "Plain tint", hatch: "Hatching", cross: "Cross-hatching", dots: "Dots", waves: "Waves", rain: "Rain", hills: "Hills", peaks: "Peaks",
  trees: "Trees", reeds: "Reeds", stars: "Sparkles", rings: "Rings", rays: "Rays", blots: "Blots", none: "No fill (outline only)" };
const REGION_BORDERS = { solid: "Solid", dashed: "Dashed", dotted: "Dotted", double: "Double", thick: "Thick ink", glow: "Glow", none: "None" };
const LAYER_BORDER = { realm: "solid", climate: "dashed", land: "none", magic: "glow" };
function regionLook(r, e) {
  const layer = REGION_LAYERS[r.layer] ? r.layer : "realm", z = ZONES[layer]?.[r.zone];
  return {
    layer, z,
    color: r.color || (z ? z[1] : e ? entryColor(e) : "#e3c27a"),
    fill: REGION_FILLS[r.fill] ? r.fill : z ? z[2] : "tint",
    border: REGION_BORDERS[r.border] ? r.border : LAYER_BORDER[layer],
    op: r.op ?? (layer === "realm" ? 0.22 : 0.32),
  };
}
// a pattern tile for a fill, in map pixels (u: the map's scale)
function fillTile(fill, c, u) {
  const T = 22 * u, w = 1.6 * u, st = `stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"`;
  const tile = {
    hatch: `<path d="M0 ${T}L${T} 0M${-T / 2} ${T / 2}L${T / 2} ${-T / 2}M${T / 2} ${T * 1.5}L${T * 1.5} ${T / 2}" ${st}/>`,
    cross: `<path d="M0 ${T}L${T} 0M0 0L${T} ${T}" ${st}/>`,
    dots: `<circle cx="${T / 4}" cy="${T / 4}" r="${1.7 * u}" fill="${c}"/><circle cx="${T * .75}" cy="${T * .75}" r="${1.7 * u}" fill="${c}"/>`,
    waves: `<path d="M0 ${T * .35}q${T / 4} ${-T / 5} ${T / 2} 0t${T / 2} 0M0 ${T * .85}q${T / 4} ${-T / 5} ${T / 2} 0t${T / 2} 0" ${st}/>`,
    rain: `<path d="M${T * .2} ${T * .1}l${-T * .1} ${T * .3}M${T * .7} ${T * .55}l${-T * .1} ${T * .3}" ${st}/>`,
    hills: `<path d="M${T * .05} ${T * .45}q${T * .2} ${-T * .32} ${T * .4} 0M${T * .5} ${T * .95}q${T * .2} ${-T * .32} ${T * .4} 0" ${st}/>`,
    peaks: `<path d="M${T * .05} ${T * .45}l${T * .2} ${-T * .35} ${T * .2} ${T * .35}M${T * .5} ${T * .95}l${T * .2} ${-T * .35} ${T * .2} ${T * .35}" ${st}/>`,
    trees: `<circle cx="${T * .25}" cy="${T * .25}" r="${T * .13}" fill="${c}"/><path d="M${T * .25} ${T * .38}v${T * .1}" ${st}/><circle cx="${T * .75}" cy="${T * .72}" r="${T * .13}" fill="${c}"/><path d="M${T * .75} ${T * .85}v${T * .1}" ${st}/>`,
    reeds: `<path d="M${T * .2} ${T * .45}v${-T * .25}M${T * .28} ${T * .45}v${-T * .32}M${T * .36} ${T * .45}v${-T * .2}M${T * .62} ${T * .95}v${-T * .25}M${T * .7} ${T * .95}v${-T * .32}M${T * .78} ${T * .95}v${-T * .2}" ${st}/>`,
    stars: `<path d="M${T * .25} ${T * .08}l${T * .04} ${T * .13} ${T * .13} ${T * .04} ${-T * .13} ${T * .04} ${-T * .04} ${T * .13} ${-T * .04} ${-T * .13} ${-T * .13} ${-T * .04} ${T * .13} ${-T * .04}z" fill="${c}"/><circle cx="${T * .72}" cy="${T * .72}" r="${1.4 * u}" fill="${c}"/>`,
    rings: `<circle cx="${T / 2}" cy="${T / 2}" r="${T * .28}" ${st}/>`,
    rays: `<path d="M${T / 2} ${T * .2}v${T * .6}M${T * .2} ${T / 2}h${T * .6}M${T * .29} ${T * .29}l${T * .42} ${T * .42}M${T * .71} ${T * .29}l${-T * .42} ${T * .42}" ${st} stroke-width="${w * .8}"/>`,
    blots: `<path d="M${T * .1} ${T * .3}c${T * .1} ${-T * .2} ${T * .35} ${-T * .1} ${T * .3} ${T * .1}s${-T * .3} ${T * .15} ${-T * .3} ${-T * .1}z" fill="${c}"/><circle cx="${T * .72}" cy="${T * .75}" r="${T * .09}" fill="${c}"/>`,
  }[fill];
  return tile ? { T, tile } : null;
}
// closed and smoothed (Catmull-Rom), or straight from corner to corner
function regionPath(pts, smooth) {
  const n = pts.length, f = v => Math.round(v * 10) / 10;
  if (!smooth || n < 3) return "M" + pts.map(p => f(p[0]) + " " + f(p[1])).join("L") + "Z";
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}
const regionShown = (m, r) => !(m.hide || []).includes(REGION_LAYERS[r.layer] ? r.layer : "realm");
// the region as SVG: soft fill, its pattern, then the border
function regionSvg(m, r, cls = "") {
  const e = byId(DB.entries, r.entry), L = regionLook(r, e), u = m.w / 1600;
  const d = regionPath(r.pts.map(p => [p[0] * m.w, p[1] * m.h]), r.smooth);
  const pid = "rf-" + r.id, t = L.fill !== "tint" && L.fill !== "none" && fillTile(L.fill, L.color, u);
  const edge = (w, more = "") => `<path class="r-edge" d="${d}" fill="none" stroke="${L.color}" stroke-width="${w}" ${more}/>`;
  const border = {
    solid: edge(2), dashed: edge(2.2, `stroke-dasharray="9 6"`), dotted: edge(3, `stroke-dasharray="0.5 6" stroke-linecap="round"`),
    double: edge(6) + `<path d="${d}" fill="none" stroke="#f4ecd8" stroke-width="2" opacity=".9"/>`,
    thick: `<path class="r-edge" d="${d}" fill="none" stroke="color-mix(in srgb, ${L.color} 55%, #1a1410)" stroke-width="4.5"/>`,
    glow: edge(12, `opacity=".22"`) + edge(5, `opacity=".3"`) + edge(1.8), none: "",
  }[L.border];
  return `<g class="region ${cls} layer-${L.layer} border-${L.border}" data-region="${r.id}">
    ${t ? `<defs><pattern id="${pid}" width="${t.T}" height="${t.T}" patternUnits="userSpaceOnUse">${t.tile}</pattern></defs>` : ""}
    <path class="r-fill" d="${d}" fill="${L.fill === "none" ? "transparent" : L.color}" fill-opacity="${L.fill === "none" ? 0 : t ? L.op * 0.55 : L.op}"/>
    ${t ? `<path d="${d}" fill="url(#${pid})" opacity="${Math.min(1, 0.35 + L.op * 1.6)}" pointer-events="none"/>` : ""}${border}</g>`;
}
function regionLabel(m, r, cls = "") {
  const e = byId(DB.entries, r.entry), text = e ? e.name : r.label || "";
  if (!text) return "";
  const c = regionCenter(r), L = regionLook(r, e);
  return `<div class="region-label ${cls} layer-${L.layer} size-${r.labelSize || "m"}" style="left:${c.x * m.w}px;top:${c.y * m.h}px;--c:${L.color}"><span>${esc(text)}</span></div>`;
}
// what the zones shown on this map mean
function mapLegend(m, regions) {
  const seen = new Map();
  for (const r of regions) {
    const L = regionLook(r, byId(DB.entries, r.entry));
    if (!L.z) continue;
    const k = L.layer + ":" + r.zone + ":" + L.color + ":" + L.fill;
    if (!seen.has(k)) seen.set(k, { L, r });
  }
  if (!seen.size) return "";
  const byLayer = Object.keys(REGION_LAYERS).map(l => [l, [...seen.values()].filter(x => x.L.layer === l)]).filter(([, xs]) => xs.length);
  return `<div class="map-legend">${byLayer.map(([l, xs]) => `<b>${REGION_LAYERS[l][1]} ${REGION_LAYERS[l][0]}</b>${xs.map(({ L, r }) => {
    const t = L.fill !== "tint" && L.fill !== "none" && fillTile(L.fill, L.color, 0.7);
    return `<span class="lg-row"><svg width="22" height="16" viewBox="0 0 22 16">${t ? `<defs><pattern id="lg-${r.id}" width="${t.T}" height="${t.T}" patternUnits="userSpaceOnUse">${t.tile}</pattern></defs>` : ""}
      <rect x="1" y="1" width="20" height="14" rx="3" fill="${L.color}" fill-opacity="${t ? .3 : .55}" stroke="${L.color}"/>${t ? `<rect x="1" y="1" width="20" height="14" rx="3" fill="url(#lg-${r.id})"/>` : ""}</svg>${esc(L.z[0])}</span>`;
  }).join("")}`).join("")}</div>`;
}

/* a cropped thumbnail of where an entry sits, for its codex page */
ENTITY_PANELS.push(e => {
  const spots = pinsFor(e.id);
  if (!spots.length) return "";
  return `<section class="panel"><div class="panel-h"><h4>On the map</h4></div><div class="map-thumbs">${spots.map(({ m, p }) => {
    const bw = 700, bh = bw * m.h / m.w, tw = 220, th = 140;
    return `<a class="map-thumb ${m.asset ? "" : "parch"}" href="#/map/${m.id}/${p.id}" ${m.asset ? `data-asset-bg="${m.asset}"` : ""} style="${assetSrc(m.asset) ? `background-image:url(${assetSrc(m.asset)});` : ""}background-size:${bw}px ${bh}px;background-position:${tw / 2 - p.x * bw}px ${th / 2 - p.y * bh}px">
      <i class="thumb-pin"></i><span>${esc(m.name)}</span></a>`;
  }).join("")}</div></section>`;
});
ENTITY_DELETE_HOOKS.push(id => { for (const m of DB.maps) { m.pins = m.pins.filter(p => p.entry !== id); m.regions = m.regions.filter(r => r.entry !== id); } });

/* ── the map page ── */
addRoute("map", "map", (id, focusPin) => {
  let m = byId(DB.maps, id) || byId(DB.maps, MAPV.cur) || DB.maps.find(x => !mapParent(x.id)) || DB.maps[0];
  if (!m) return `<div class="page"><div class="page-h"><h2>Map</h2></div>
    <div class="map-empty">${empty("No maps yet.")}<button class="btn accent" data-act="newMap">+ New map</button></div></div>`;
  if (MAPV.cur !== m.id) { MAPV.cur = m.id; MAPV.sel = null; MAPV.draft = []; MAPV.tool = "pan"; }
  if (focusPin) MAPV.sel = { pin: focusPin };
  const year = MAPV.year ?? NOW().y;
  const years = DB.entries.flatMap(e => [e.start?.y, e.end?.y]).filter(y => y != null).concat(NOW().y);
  const minY = Math.min(...years), maxY = Math.max(...years, NOW().y);
  const trail = mapTrail(m);
  const tools = [["pan", "✋", "Move", "Move around and tap things"], ["pin", "📍", "Pin", "Drop a pin"], ["region", "⬠", "Region", "Draw a region"], ["party", "🛡", "Party", "Move the party"]];
  // realms on top of the zones beneath them, so the ones you tap most are easiest to reach
  const shownRegions = m.regions.filter(r => regionShown(m, r) && epoch(byId(DB.entries, r.entry), year) !== "future")
    .sort((a, b) => (a.layer && a.layer !== "realm" ? 0 : 1) - (b.layer && b.layer !== "realm" ? 0 : 1));
  const regions = shownRegions.map(r => regionSvg(m, r, `${epoch(byId(DB.entries, r.entry), year)} ${r.secret ? "secret" : ""} ${MAPV.sel?.region === r.id ? "sel" : ""}`)).join("");
  const draft = MAPV.draft.length ? `<polyline class="draft" points="${MAPV.draft.map(p => p[0] * m.w + "," + p[1] * m.h).join(" ")}"/>${MAPV.draft.map(p => `<circle class="draft-pt" cx="${p[0] * m.w}" cy="${p[1] * m.h}" r="5"/>`).join("")}` : "";
  const pins = m.pins.map(p => {
    const e = byId(DB.entries, p.entry), ep = epoch(e, year);
    if (ep === "future") return "";
    const label = e ? e.name : p.label || "Pin";
    return `<div class="pin ${ep} ${p.secret ? "secret" : ""} ${MAPV.sel?.pin === p.id ? "sel" : ""} ${p.map ? "has-map" : ""}" data-pin="${p.id}" style="left:${p.x * m.w}px;top:${p.y * m.h}px;--c:${e ? entryColor(e) : "#e3c27a"}">
      <div class="pin-in"><span class="pin-dot">${e ? kindOf(e).icon : p.map ? "🗺" : "•"}</span><span class="pin-label">${esc(label)}</span></div></div>`;
  }).join("");
  const regionLabels = shownRegions.map(r => regionLabel(m, r, epoch(byId(DB.entries, r.entry), year))).join("");
  const layersUsed = Object.keys(REGION_LAYERS).filter(l => m.regions.some(r => (REGION_LAYERS[r.layer] ? r.layer : "realm") === l));
  const party = DB.party?.map === m.id ? `<div class="party-marker" style="left:${DB.party.x * m.w}px;top:${DB.party.y * m.h}px" title="The party"><div class="pin-in">
    <svg viewBox="0 0 24 28" width="26" height="30"><path d="M12 1 L22 5 V13 C22 20 17 25 12 27 C7 25 2 20 2 13 V5 Z" fill="#5fc9c4" stroke="#0b0a12" stroke-width="2"/><path d="M12 6 V22 M7 11 H17" stroke="#0b0a12" stroke-width="2"/></svg></div></div>` : "";
  return [`<div class="map-page ${MAPV.sel ? "with-side" : ""}">
    <div class="map-bar">
      <div class="crumbs">${trail.map(t => `<a href="#/map/${t.id}">${esc(t.name)}</a> › `).join("")}<b>${esc(m.name)}</b></div>
      <select data-change="mapJump" title="Go to another map">${DB.maps.map(x => `<option value="${x.id}" ${x === m ? "selected" : ""}>🗺 ${esc(x.name)}</option>`).join("")}</select>
      <div class="tool-group">${tools.map(([t, i, l, tip]) => `<button class="tool ${MAPV.tool === t ? "on" : ""}" data-act="mapTool" data-t="${t}" title="${tip}">${i}<span>${l}</span></button>`).join("")}</div>
      ${MAPV.tool === "region" ? `<span class="hint"><span class="seg"><button class="${MAPV.free ? "" : "on"}" data-act="regionMode" data-v="">Corners</button><button class="${MAPV.free ? "on" : ""}" data-act="regionMode" data-v="1">Freehand</button></span>
        ${MAPV.free ? "Drag round the region" : MAPV.draft.length < 3 ? "Tap to add corners" : `<button class="btn small accent" data-act="finishRegion">Finish region</button>`} <button class="btn small ghost" data-act="cancelDraft">Cancel</button></span>` : ""}
      <button class="btn small" data-act="drawOpen" data-kind="map" data-id="${m.id}" title="Draw on this map">✏ Draw</button>
      ${MAPV.movePin ? `<span class="hint">Tap where the pin should go <button class="btn small ghost" data-act="cancelMove">Cancel</button></span>` : ""}
      <div class="spacer"></div>
      <button class="btn small ${screenIs("map", m.id) ? "live" : ""}" data-act="screenMap" data-id="${m.id}" title="Put this map on the player screen (secret pins stay hidden)">📺 ${screenIs("map", m.id) ? "On screen" : "Show players"}</button>
      ${layersUsed.length > 1 || (m.hide || []).length ? `<button class="btn small" data-act="mapLayers" data-id="${m.id}" title="Show or hide realms, climate, landscape and magic">◫ Layers${(m.hide || []).length ? ` <small>${layersUsed.length - (m.hide || []).filter(l => layersUsed.includes(l)).length}/${layersUsed.length}</small>` : ""}</button>` : ""}
      <button class="btn small" data-act="mapMenu" data-id="${m.id}">⋯ Map</button>
    </div>
    <div class="map-years"><span>${esc(fmtYear(minY))}</span>
      <input type="range" min="${minY}" max="${Math.max(maxY, minY + 1)}" value="${year}" data-input="mapYear" aria-label="Year shown">
      <span>${esc(fmtYear(Math.max(maxY, minY + 1)))}</span><b id="mapYearLbl">As of ${esc(fmtYear(year))}</b>
      ${MAPV.year != null && MAPV.year !== NOW().y ? `<button class="btn small ghost" data-act="mapYearNow">Back to now</button>` : ""}</div>
    <div class="map-body">
      <div class="map-stage tool-${MAPV.tool}" id="mapStage">
        <div class="map-layer" id="mapLayer" style="width:${m.w}px;height:${m.h}px">${mapBg(m)}${drawingHtml(m.draw, { w: m.w, h: m.h })}
          <svg class="map-svg" viewBox="0 0 ${m.w} ${m.h}" width="${m.w}" height="${m.h}">${regions}${MAP_OVERLAYS.map(f => f(m)).join("")}${draft}</svg>${regionLabels}${pins}${party}</div>
        <div class="zoom-btns"><button data-act="mapZoom" data-k="1.4">+</button><button data-act="mapZoom" data-k="0.7">−</button><button data-act="mapFit" title="Fit">⤢</button></div>
        ${MAPV.noLegend ? `<button class="legend-btn" data-act="mapLegend" title="Legend">◫</button>` : mapLegend(m, shownRegions).replace(`<div class="map-legend">`, `<div class="map-legend"><button class="x" data-act="mapLegend" aria-label="Hide the legend">×</button>`)}
      </div>
      ${MAPV.sel ? `<aside class="map-side">${sidePanel(m)}</aside>` : ""}
    </div></div>`, main => wireMap(main, m, !!focusPin)];
});

function sidePanel(m) {
  const pin = MAPV.sel.pin && m.pins.find(p => p.id === MAPV.sel.pin);
  const reg = MAPV.sel.region && m.regions.find(r => r.id === MAPV.sel.region);
  const thing = pin || reg;
  if (!thing) return "";
  const e = byId(DB.entries, thing.entry);
  const child = pin && byId(DB.maps, pin.map);
  const tools = `<div class="side-tools">${pin ? `<button class="btn small" data-act="pinMove" data-id="${pin.id}">Move</button>` : ""}
    <button class="btn small" data-act="${pin ? "pinEdit" : "regionEdit"}" data-id="${thing.id}">Edit</button>
    <button class="btn small ghost" data-act="${pin ? "pinDelete" : "regionDelete"}" data-id="${thing.id}">🗑</button></div>`;
  let body = "";
  if (e) {
    const sections = [];
    const hist = TIMELINE_SOURCES.flatMap(f => f()).filter(x => x.kind === "event" && x.ids.includes(e.id)).sort((a, b) => dateKey(a.date) - dateKey(b.date));
    if (hist.length) sections.push(`<h5>History</h5><ul class="mini-tl">${hist.map(x => `<li><small>${esc(fmtDate(x.date))}</small> <a href="${x.href}">${esc(x.title)}</a></li>`).join("")}</ul>`);
    const scenes = allScenes().filter(x => x.sc.setting === e.id || mentionsIn(x.sc.body).some(r => r.it === e));
    if (scenes.length) sections.push(`<h5>Scenes</h5><div class="chips">${scenes.map(x => chip("sc", x.sc)).join("")}</div>`);
    for (const f of MAP_PLACE_PANELS) { const h = f(e, pin); if (h) sections.push(h); }
    const residents = backlinks("e", e.id).filter(b => b.t === "e" && b.label !== "mentions" && b.it.kind !== "place");
    if (residents.length) sections.push(`<h5>People and things here</h5><div class="chips">${residents.map(b => chip("e", b.it, ` <small>${esc(b.label)}</small>`)).join("")}</div>`);
    body = `<div class="side-head" style="--c:${entryColor(e)}">${e.portrait ? assetImg(e.portrait) : `<span class="side-icon">${kindOf(e).icon}</span>`}
        <div><h3><a href="#/e/${e.id}">${esc(e.name)}</a></h3><small>${esc(kindOf(e).name)}${lifespan(e) ? " · " + esc(lifespan(e)) : ""}</small></div></div>
      ${e.summary ? `<p>${inline(e.summary)}</p>` : ""}
      ${thing.secret ? `<p class="secret-note">🙈 Hidden from the players</p>` : ""}
      <button class="btn small" data-act="screenEntry" data-id="${e.id}">📺 Show players</button>
      ${child ? `<a class="btn accent wide" href="#/map/${child.id}">Open ${esc(child.name)} →</a>` : ""}
      ${sections.join("") || `<p class="muted">Nothing else is connected to ${esc(e.name)} yet.</p>`}`;
  } else {
    const z = reg && regionLook(reg).z;
    body = `<h3>${esc(thing.label || (z ? z[0] : pin ? "Pin" : "Region"))}</h3>${z ? `<p class="muted">${REGION_LAYERS[reg.layer][1]} ${esc(REGION_LAYERS[reg.layer][0])}: ${esc(z[0])}</p>` : ""}
      ${child ? `<a class="btn accent wide" href="#/map/${child.id}">Open ${esc(child.name)} →</a>` : ""}<p class="muted">Not tied to a codex entry.</p>`;
  }
  return `<button class="x side-x" data-act="mapUnsel" aria-label="Close">×</button>${body}${tools}`;
}

/* pan, zoom, pinch and taps ── shared with battlemaps (battle.js).
   v is the remembered view {k, x, y} (null fits the picture to the stage).
   opts.onTap(event, px, py) gets taps in the picture's own pixels;
   opts.skip(event) can claim a pointerdown for something else (a token drag);
   opts.centre {x, y} zooms in on that point. Returns the view object. */
function panZoom(stage, layer, w, h, v, opts = {}) {
  const fit = () => {
    const k = Math.min(stage.clientWidth / w, stage.clientHeight / h) * 0.96;
    return { k, x: (stage.clientWidth - w * k) / 2, y: (stage.clientHeight - h * k) / 2 };
  };
  // A view kept from a much wider or narrower stage (a rotated phone, another
  // page) starts over; a small change keeps the zoom and the middle in place.
  const cw = stage.clientWidth, ch = stage.clientHeight;
  if (!v || !v.sw || Math.abs(v.sw - cw) / v.sw > 0.2) v = Object.assign(v || {}, fit());
  else { v.x += (cw - v.sw) / 2; v.y += (ch - v.sh) / 2; }
  v.sw = stage.clientWidth; v.sh = stage.clientHeight;
  const apply = () => { layer.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`; layer.style.setProperty("--ik", 1 / v.k); };
  const zoomAt = (f, sx, sy) => {
    const k = clamp(v.k * f, 0.05, 8);
    v.x = sx - (sx - v.x) * k / v.k; v.y = sy - (sy - v.y) * k / v.k; v.k = k; apply();
  };
  if (opts.centre) { v.k = Math.max(v.k, fit().k * 2); v.x = stage.clientWidth / 2 - opts.centre.x * v.k; v.y = stage.clientHeight / 2 - opts.centre.y * v.k; }
  apply();
  stage._zoom = f => zoomAt(f, stage.clientWidth / 2, stage.clientHeight / 2);
  stage._fit = () => { Object.assign(v, fit()); apply(); };
  stage._toLayer = (cx, cy) => { const r = stage.getBoundingClientRect(); return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k }; };
  const pts = new Map();
  let moved = 0, last = null, pinch = null;
  stage.addEventListener("pointerdown", e => {
    if (e.target.closest(".zoom-btns") || opts.skip?.(e)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture(e.pointerId);
    if (pts.size === 1) { moved = 0; last = { x: e.clientX, y: e.clientY }; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; moved = 99; }
  });
  stage.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = stage.getBoundingClientRect();
      zoomAt(d / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.d = d;
    } else if (pts.size === 1 && last) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) { v.x += dx; v.y += dy; apply(); }
      last = { x: e.clientX, y: e.clientY };
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0 && moved <= 6 && e.type === "pointerup" && opts.onTap) {
      const p = stage._toLayer(e.clientX, e.clientY);
      opts.onTap(e, p.x, p.y);
    }
    if (pts.size === 0) last = null;
  };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", e => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  return v;
}
function wireMap(main, m, centreOnSel) {
  const stage = $("#mapStage", main), layer = $("#mapLayer", main);
  if (!stage) return;
  const p = centreOnSel && MAPV.sel?.pin && m.pins.find(x => x.id === MAPV.sel.pin);
  MAPV.view[m.id] = panZoom(stage, layer, m.w, m.h, MAPV.view[m.id], {
    centre: p ? { x: p.x * m.w, y: p.y * m.h } : null,
    onTap: (e, px, py) => mapTap(m, e, px / m.w, py / m.h),
    skip: e => MAPV.tool === "region" && MAPV.free && !e.target.closest(".map-legend, .legend-btn"),
  });
  // freehand regions: drag round the shape
  stage.addEventListener("pointerdown", e => {
    if (!(MAPV.tool === "region" && MAPV.free) || e.target.closest(".zoom-btns, .map-legend, .legend-btn")) return;
    e.preventDefault();
    const svg = $(".map-svg", layer), k = () => MAPV.view[m.id].k;
    const pts = [];
    const add = ev => { const q = stage._toLayer(ev.clientX, ev.clientY); const l = pts[pts.length - 1]; if (!l || Math.hypot(l[0] - q.x, l[1] - q.y) > 6 / k()) pts.push([clamp(q.x, 0, m.w), clamp(q.y, 0, m.h)]); };
    svg.insertAdjacentHTML("beforeend", `<polyline class="draft" id="freeDraft"/>`);
    const line = $("#freeDraft", svg);
    const mv = ev => { add(ev); line.setAttribute("points", pts.map(q => q.join(",")).join(" ")); };
    add(e);
    stage.setPointerCapture(e.pointerId);
    stage.addEventListener("pointermove", mv);
    stage.addEventListener("pointerup", () => {
      stage.removeEventListener("pointermove", mv);
      line.remove();
      // keep the shape, not every wobble of the hand
      const keep = [];
      for (const q of pts) { const l = keep[keep.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 14 / k()) keep.push(q); }
      if (keep.length < 3) return toast("Drag all the way round the region");
      MAPV.draft = keep.map(q => [q[0] / m.w, q[1] / m.h]);
      ACT.finishRegion();
    }, { once: true });
  });
}

function mapTap(m, ev, x, y) {
  const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
  if (MAPV.movePin) {
    const p = m.pins.find(q => q.id === MAPV.movePin);
    MAPV.movePin = null;
    if (p && inside) { p.x = x; p.y = y; }
    return commit();
  }
  const pinEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.("[data-pin]");
  const regEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.("[data-region]");
  if (MAPV.tool === "pan" || ((pinEl || regEl) && MAPV.tool !== "region" && MAPV.tool !== "party")) {
    MAPV.sel = pinEl ? { pin: pinEl.dataset.pin } : regEl ? { region: regEl.dataset.region } : null;
    return rerender();
  }
  if (!inside) return;
  if (MAPV.tool === "pin") return pinEditor(m, { id: uid(), x, y, entry: "", label: "", map: "" }, true);
  if (MAPV.tool === "region") {
    const first = MAPV.draft[0];
    if (MAPV.draft.length >= 3 && Math.hypot((first[0] - x) * m.w, (first[1] - y) * m.h) < 14 / (MAPV.view[m.id]?.k || 1)) return ACT.finishRegion();
    MAPV.draft.push([x, y]);
    return rerender();
  }
  if (MAPV.tool === "party") {
    const near = m.pins.filter(p => p.entry).map(p => ({ p, d: Math.hypot((p.x - x) * m.w, (p.y - y) * m.h) })).sort((a, b) => a.d - b.d)[0];
    const place = near && near.d < 60 / (MAPV.view[m.id]?.k || 1) ? near.p.entry : "";
    DB.party = { map: m.id, x, y, place };
    emit("partyMoved", DB.party);
    commit();
  }
}

ACT.mapTool = el => { MAPV.tool = el.dataset.t; MAPV.draft = []; MAPV.movePin = null; rerender(); };
ACT.mapJump = el => go("#/map/" + el.value);
ACT.mapZoom = el => $("#" + (el.dataset.stage || "mapStage"))?._zoom(+el.dataset.k);
ACT.mapFit = el => $("#" + (el.dataset.stage || "mapStage"))?._fit();
ACT.mapUnsel = () => { MAPV.sel = null; rerender(); };
ACT.mapYear = el => { MAPV.year = +el.value; clearTimeout(ACT.mapYear.t); $("#mapYearLbl").textContent = "As of " + fmtYear(MAPV.year); ACT.mapYear.t = setTimeout(rerender, 60); };
ACT.mapYearNow = () => { MAPV.year = null; rerender(); };
ACT.cancelDraft = () => { MAPV.draft = []; MAPV.tool = "pan"; rerender(); };
ACT.cancelMove = () => { MAPV.movePin = null; rerender(); };
ACT.finishRegion = () => {
  const m = byId(DB.maps, MAPV.cur);
  const r = { id: uid(), pts: MAPV.draft.slice(), entry: "", label: "", color: "", smooth: !!MAPV.free, layer: MAPV.lastLayer || "realm", zone: MAPV.lastZone || "" };
  MAPV.draft = []; if (!MAPV.free) MAPV.tool = "pan";
  regionEditor(m, r, true);
};

/* pins and regions */
function placeFields(thing, isPin, m) {
  const kinds = DB.kinds.map(k => `<option value="${k.id}" ${k.id === "place" ? "selected" : ""}>${k.icon} ${esc(k.name)}</option>`).join("");
  return `${field("Codex entry", `<select name="entry">${entryOptions(thing.entry, { blank: "— none, or a new one below —" })}</select>`)}
    <div class="row2">${textField("…or create a new entry called", "newName", "")}${field("as a", `<select name="newKind">${kinds}</select>`)}</div>
    ${textField("Label (when it's not an entry)", "label", thing.label)}
    <label class="check"><input type="checkbox" name="secret" ${thing.secret ? "checked" : ""}> Hidden from the players (not drawn on the player screen)</label>
    ${isPin ? field("Opens another map", `<select name="map"><option value="">—</option>${DB.maps.filter(x => x !== m).map(x => `<option value="${x.id}" ${x.id === thing.map ? "selected" : ""}>🗺 ${esc(x.name)}</option>`).join("")}<option value="__new">+ a new map…</option></select>`) : ""}`;
}
function readPlace(v, thing) {
  if (v.newName.trim()) {
    const e = newEntry({ kind: v.newKind, name: v.newName.trim() });
    DB.entries.push(e);
    thing.entry = e.id;
  } else thing.entry = v.entry;
  thing.label = v.label.trim();
  thing.secret = v.secret;
}
function pinEditor(m, pin, isNew) {
  modal({ title: isNew ? "New pin" : "Edit pin", body: placeFields(pin, true, m),
    buttons: [{ label: "Cancel" }, { label: isNew ? "Drop pin" : "Save", cls: "accent", act: async w => {
      const v = formVals(w);
      readPlace(v, pin);
      if (v.map === "__new") {
        const child = await createMap(pin.label || byId(DB.entries, pin.entry)?.name || "New map");
        if (child) delete child.drawNow;
        pin.map = child?.id || "";
      } else pin.map = v.map;
      if (isNew) m.pins.push(pin);
      MAPV.sel = { pin: pin.id };
      commit();
    } }] });
}
function regionEditor(m, r, isNew) {
  const cur = REGION_LAYERS[r.layer] && r.layer !== "realm" && r.zone ? r.layer + ":" + r.zone : "realm";
  const opt = (v, l, sel) => `<option value="${v}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`;
  const look = `<details class="field-ed" ${isNew || r.fill || r.border || r.op != null || r.labelSize ? "open" : ""}><summary>Look</summary><div class="row2">
      ${field("Fill", `<select name="fill">${opt("", "As the kind of region has it", r.fill || "")}${Object.entries(REGION_FILLS).map(([k, l]) => opt(k, l, r.fill)).join("")}</select>`)}
      ${field("Border", `<select name="border">${opt("", "As the kind of region has it", r.border || "")}${Object.entries(REGION_BORDERS).map(([k, l]) => opt(k, l, r.border)).join("")}</select>`)}
      ${field("How strong", `<input type="range" name="op" min="0.05" max="0.8" step="0.05" value="${r.op ?? (cur === "realm" ? 0.22 : 0.32)}">`)}
      ${field("Label size", `<select name="labelSize">${[["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Huge"]].map(([k, l]) => opt(k, l, r.labelSize || "m")).join("")}</select>`)}</div>
      <label class="check"><input type="checkbox" name="smooth" ${r.smooth ? "checked" : ""}> Smooth the edges</label>
      ${colorField("Colour (none: the kind's own colour)", "color", r.color)}</details>`;
  const kinds = field("What it marks", `<select name="zone">${opt("realm", "🏰 A realm, nation or place", cur)}
      ${Object.entries(ZONES).map(([l, zs]) => `<optgroup label="${REGION_LAYERS[l][1]} ${REGION_LAYERS[l][0]}">${Object.entries(zs).map(([k, z]) => opt(l + ":" + k, z[0], cur)).join("")}</optgroup>`).join("")}</select>`);
  modal({ title: isNew ? "New region" : "Edit region", body: kinds + placeFields(r, false, m) + look,
    buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
      const v = formVals(w);
      readPlace(v, r);
      r.color = v.color;
      [r.layer, r.zone = ""] = v.zone.split(":");
      if (r.layer === "realm") r.zone = "";
      MAPV.lastLayer = r.layer; MAPV.lastZone = r.zone;
      r.fill = v.fill; r.border = v.border; r.op = +v.op; r.labelSize = v.labelSize === "m" ? "" : v.labelSize; r.smooth = v.smooth;
      for (const k of ["fill", "border", "labelSize", "zone"]) if (!r[k]) delete r[k];
      if (isNew) m.regions.push(r);
      MAPV.sel = { region: r.id };
      commit();
    } }] });
}
const curMap = () => byId(DB.maps, MAPV.cur);
ACT.pinEdit = el => pinEditor(curMap(), curMap().pins.find(p => p.id === el.dataset.id), false);
ACT.regionEdit = el => regionEditor(curMap(), curMap().regions.find(r => r.id === el.dataset.id), false);
ACT.pinMove = el => { MAPV.movePin = el.dataset.id; rerender(); };
ACT.pinDelete = el => { const m = curMap(); MAPV.sel = null; withUndo("Pin removed", () => { m.pins = m.pins.filter(p => p.id !== el.dataset.id); }); };
ACT.regionMode = el => { MAPV.free = !!el.dataset.v; MAPV.draft = []; rerender(); };
ACT.mapLegend = () => { MAPV.noLegend = !MAPV.noLegend; rerender(); };
ACT.mapLayers = el => {
  const m = byId(DB.maps, el.dataset.id);
  const count = l => m.regions.filter(r => (REGION_LAYERS[r.layer] ? r.layer : "realm") === l).length;
  modal({ title: "Layers", body: `<p class="muted">What this map shows, here and on the player screen.</p>
      ${Object.entries(REGION_LAYERS).filter(([l]) => count(l)).map(([l, [name, icon]]) => `<label class="check"><input type="checkbox" name="${l}" ${(m.hide || []).includes(l) ? "" : "checked"}> ${icon} ${esc(name)} <small class="muted">${plural(count(l), "region")}</small></label>`).join("")}`,
    buttons: [{ label: "Cancel" }, { label: "Show these", cls: "accent", act: w => {
      const v = formVals(w);
      m.hide = Object.keys(REGION_LAYERS).filter(l => v[l] === false);
      if (!m.hide.length) delete m.hide;
      commit();
    } }] });
};
ACT.regionDelete = el => { const m = curMap(); MAPV.sel = null; withUndo("Region removed", () => { m.regions = m.regions.filter(r => r.id !== el.dataset.id); }); };

/* maps themselves */
function createMap(name) {
  return new Promise(res => {
    let made = null;
    modal({ title: "New map",
      body: `${textField("Name", "name", name || "")}<p class="muted">Start from an image (a drawn map, a scan, a screenshot), or on blank parchment to sketch with pins and regions.</p>`,
      onClose: () => res(made),
      buttons: [{ label: "Blank parchment", act: w => { made = addMap(formVals(w).name, null); } },
        { label: "✏ Draw it", act: w => { made = addMap(formVals(w).name, null); made.drawNow = true; } },
        { label: "Upload image…", cls: "accent", act: async (w, api) => {
          const nm = formVals(w).name;
          const img = await pickImage(4096);
          if (img) made = addMap(nm, img);
          api.close();
          return false;
        } }] });
  });
}
function addMap(name, img) {
  const m = { id: uid(), name: name.trim() || "Untitled map", asset: img?.id || null, w: img?.w || PARCHMENT.w, h: img?.h || PARCHMENT.h, pins: [], regions: [], notes: "" };
  DB.maps.push(m);
  save();
  return m;
}
ACT.newMap = async () => {
  [...MODALS].forEach(x => x.close());
  const m = await createMap("");
  if (!m) return;
  if (m.drawNow) { delete m.drawNow; return openDrawing("map", m.id); }
  go("#/map/" + m.id);
};
ACT.mapMenu = el => {
  const m = byId(DB.maps, el.dataset.id);
  modal({ title: m.name,
    body: `${textField("Name", "name", m.name)}${areaField("Notes", "notes", m.notes, 3)}
      <div class="btn-row"><button class="btn accent" data-act="drawOpen" data-kind="map" data-id="${m.id}">✏ ${m.draw ? "Edit the drawing" : "Draw on it"}</button>
      <button class="btn" data-act="mapImage" data-id="${m.id}">${m.asset ? "Replace image" : "Use an image"}</button>
      ${m.asset ? `<button class="btn" data-act="mapParchment" data-id="${m.id}">Switch to parchment</button>` : ""}
      <button class="btn" data-act="newMap">+ New map</button></div>`,
    buttons: [{ label: "Delete map", cls: "danger", act: () => { ACT.mapDelete(m); } }, { label: "Save", cls: "accent", act: w => {
      const v = formVals(w); m.name = v.name.trim() || m.name; m.notes = v.notes; commit();
    } }] });
};
ACT.mapImage = async el => {
  const m = byId(DB.maps, el.dataset.id), img = await pickImage(4096);
  if (!img) return;
  [...MODALS].forEach(x => x.close());
  Object.assign(m, { asset: img.id, w: img.w, h: img.h });
  delete MAPV.view[m.id];
  commit();
};
ACT.mapParchment = el => { const m = byId(DB.maps, el.dataset.id); [...MODALS].forEach(x => x.close()); Object.assign(m, { asset: null, w: PARCHMENT.w, h: PARCHMENT.h }); delete MAPV.view[m.id]; commit(); };
ACT.mapDelete = async m => {
  if (!await ask(`Delete the map “${m.name}”?`, "Its pins and regions go with it. You can undo this straight afterwards.")) return;
  withUndo("Map deleted", () => {
    DB.maps = DB.maps.filter(x => x !== m);
    for (const o of DB.maps) for (const p of o.pins) if (p.map === m.id) p.map = "";
    if (DB.party?.map === m.id) DB.party = null;
  });
  MAPV.cur = null;
  go("#/map");
};
