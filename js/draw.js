"use strict";
/* ── drawing ── draw world maps and battlemaps in the app, from scratch or
   over an uploaded image. Everything is kept as shapes, not pixels, so a
   drawing takes kilobytes where a picture takes megabytes.

   A drawing is { v, bg (a texture filling everything, or null), items: [] }:
     brush   { pts, c, w }        freehand ink
     terrain { pts, tex, w }      a wide textured stroke (rivers, roads, coasts, forests)
     area    { pts, tex }         a filled textured shape (lakes, fields, mountains)
     line    { pts, st, w }       a map feature drawn along a stroke: river, cliff,
                                  mountain ridge, road, border, ley line… (LINES)
     scatter { s, pts, z }        stamps scattered by a brush (forests, ranges, hills);
                                  pts are where each one stands
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
// more ground for world maps: climates and biomes, landforms, water, and the fantastic
Object.assign(TEXTURES, {
  plains: ["Plains / steppe", "#c4c27a", "#8e8c4e", `<path d="M12 30l2-7 2 7M58 64l2-7 2 7M84 22l2-6 2 6M30 84l2-6 2 6" stroke="#9c9a58" stroke-width="2" fill="none"/><path d="M0 50q25-4 50 0t50 0" stroke="#d2d08a" stroke-width="2" fill="none" opacity=".6"/>`],
  farmland: ["Farmland", "#b8b066", "#7e7838", `<path d="M0 0h48v48H0z" fill="#c9bf6e"/><path d="M52 52h48v48H52z" fill="#a6a456"/><path d="M0 8h48M0 18h48M0 28h48M0 38h48M60 52v48M72 52v48M84 52v48" stroke="#8e8840" stroke-width="2"/><path d="M50 0V100M0 50H100" stroke="#7e7838" stroke-width="3"/>`],
  savanna: ["Savanna", "#d1b45c", "#94783a", `<path d="M20 40l2-6 2 6M70 80l2-6 2 6M80 30l2-6 2 6" stroke="#a88c46" stroke-width="2" fill="none"/><path d="M42 62v-10" stroke="#6b4f2e" stroke-width="2.5"/><ellipse cx="42" cy="50" rx="14" ry="5" fill="#6f8a3a"/>`],
  desert: ["Desert dunes", "#e6c88a", "#b08c4e", `<path d="M0 30q25-14 50 0t50 0M0 75q25-14 50 0t50 0" stroke="#c9a462" stroke-width="3" fill="none"/><path d="M0 34q25-10 50 0t50 0M0 79q25-10 50 0t50 0" stroke="#f4dcaa" stroke-width="2" fill="none"/>`],
  badlands: ["Badlands / mesa", "#bc7448", "#7a4228", `<path d="M0 20q30 6 50 0t50 2M0 45q30-6 50 0t50-2M0 70q30 6 50 0t50 2M0 92q30-4 50 0t50 0" stroke="#9a5634" stroke-width="3" fill="none"/><path d="M0 32q30-4 50 0t50 0M0 58q30 4 50 0t50 0" stroke="#d89060" stroke-width="2" fill="none"/>`],
  tundra: ["Tundra", "#a9b6a2", "#6e7a68", `<circle cx="18" cy="22" r="3" fill="#8a9884"/><circle cx="64" cy="40" r="2" fill="#c6d0c0"/><circle cx="36" cy="72" r="3.5" fill="#8a9884"/><circle cx="84" cy="80" r="2.5" fill="#c6d0c0"/><path d="M70 14l2-5 2 5M12 58l2-5 2 5" stroke="#7e8a76" stroke-width="2" fill="none"/>`],
  taiga: ["Pine forest / taiga", "#2c4a38", "#162a1e", `<path d="M22 6L36 40H8zM70 46L84 80H56zM78 2L88 28H68zM28 60L38 88H18z" fill="#3c6a4a"/><path d="M22 14L30 34H14zM70 54L78 74H62z" fill="#4c7c58"/>`],
  jungle: ["Jungle", "#24663a", "#123c20", `<circle cx="20" cy="22" r="20" fill="#2f8a44"/><circle cx="66" cy="18" r="16" fill="#3a9a50"/><circle cx="50" cy="56" r="22" fill="#2a7a3e"/><circle cx="16" cy="80" r="16" fill="#3a9a50"/><circle cx="86" cy="76" r="18" fill="#2f8a44"/><path d="M44 50q8-10 16 0M12 74q6-8 12 0M60 12q6-8 12 0" stroke="#5cc070" stroke-width="2.5" fill="none"/>`],
  heath: ["Heath / moor", "#857a6c", "#544a40", `<circle cx="18" cy="24" r="5" fill="#8e6a8a"/><circle cx="62" cy="58" r="6" fill="#7a5a78"/><circle cx="36" cy="80" r="4" fill="#8e6a8a"/><circle cx="84" cy="22" r="4" fill="#6e7a52"/><circle cx="48" cy="36" r="3" fill="#6e7a52"/>`],
  ice: ["Ice / glacier", "#d4e8f4", "#8eb4cc", `<path d="M10 20l25 18 10 30M60 10l-5 30 30 20M40 90l20-22" stroke="#a8c8de" stroke-width="2.5" fill="none"/><path d="M70 70l12 4" stroke="#ffffff" stroke-width="3"/>`],
  shallows: ["Shallows / reef", "#78bcc8", "#4a8e9c", `<path d="M8 30q8-5 16 0t16 0M52 72q8-5 16 0t16 0" stroke="#a8e0e8" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="75" cy="25" r="5" fill="#e8a08a" opacity=".7"/><circle cx="22" cy="78" r="4" fill="#e8a08a" opacity=".7"/>`],
  ash: ["Ash / volcanic", "#4a4448", "#262224", `<circle cx="18" cy="20" r="2" fill="#8a8488"/><circle cx="66" cy="44" r="3" fill="#6a6468"/><circle cx="34" cy="74" r="2" fill="#8a8488"/><circle cx="86" cy="84" r="2.5" fill="#c4542a"/><path d="M48 14l10 10M14 50l12-4" stroke="#36302f" stroke-width="3"/>`],
  salt: ["Salt flats", "#ece6da", "#b8ae9c", `<path d="M20 10l12 18-8 20 16 16M60 0l-6 24 22 12 4 24M0 70l24-6 16 20M70 60l20 22" stroke="#cbc2b0" stroke-width="2" fill="none"/>`],
  arcane: ["Arcane ground", "#3e3478", "#1e1848", `<circle cx="30" cy="30" r="14" fill="none" stroke="#9a8af0" stroke-width="2"/><path d="M30 16v28M16 30h28" stroke="#9a8af0" stroke-width="1.5"/><circle cx="74" cy="72" r="10" fill="none" stroke="#c4b8ff" stroke-width="2"/><circle cx="74" cy="72" r="3" fill="#e8e0ff"/><circle cx="78" cy="22" r="2" fill="#e8e0ff"/><circle cx="20" cy="80" r="2" fill="#e8e0ff"/>`],
  crystal: ["Crystal fields", "#6ab8c8", "#2e7484", `<path d="M20 50l8-30 8 30-8 10zM60 90l10-36 10 36-10 8zM72 30l6-20 6 20-6 6z" fill="#b8f0f8" stroke="#3a8a9a" stroke-width="2"/><path d="M28 20v40M70 54v44" stroke="#ffffff" stroke-width="1.5" opacity=".8"/>`],
  blight: ["Blight / corruption", "#4a4a2a", "#24240e", `<path d="M14 24c10-10 22 4 14 12s-22 2-14-12zM58 60c14-8 26 8 14 18s-26-4-14-18z" fill="#6a3a6a"/><circle cx="80" cy="22" r="5" fill="#8acc3a" opacity=".7"/><circle cx="24" cy="76" r="4" fill="#8acc3a" opacity=".7"/><path d="M40 40l12 8M66 30l-6 10" stroke="#1a1a0a" stroke-width="3"/>`],
  fey: ["Feywild", "#4e9a74", "#285a40", `<circle cx="22" cy="26" r="12" fill="#5cb084"/><circle cx="70" cy="66" r="14" fill="#5cb084"/><path d="M50 18l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM24 70l1.5 4.5 4.5 1.5-4.5 1.5-1.5 4.5-1.5-4.5-4.5-1.5 4.5-1.5zM84 30l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#ffd0f0"/>`],
  fungal: ["Fungal forest", "#5a4466", "#2e2036", `<path d="M10 40q14-22 28 0z" fill="#c46a9a"/><path d="M22 40v14" stroke="#e8d8c8" stroke-width="5"/><path d="M56 80q16-24 32 0z" fill="#8a6ad0"/><path d="M70 80v14" stroke="#e8d8c8" stroke-width="5"/><circle cx="18" cy="34" r="2.5" fill="#fff"/><circle cx="66" cy="72" r="3" fill="#fff"/><circle cx="76" cy="20" r="3" fill="#9af0c8" opacity=".8"/>`],
  shadow: ["Shadowlands", "#26203a", "#0e0a18", `<path d="M0 30q20-10 40 0t40 0 20-4M10 72q20-10 40 0t40 0" stroke="#4a3e6a" stroke-width="4" fill="none" opacity=".8"/><circle cx="70" cy="48" r="2" fill="#c8b8ff"/><circle cx="26" cy="50" r="1.5" fill="#c8b8ff"/>`],
  void: ["Void / abyss", "#0c0816", "#000000", `<circle cx="20" cy="24" r="1.5" fill="#fff"/><circle cx="66" cy="16" r="1" fill="#fff"/><circle cx="48" cy="56" r="2" fill="#c8b8ff"/><circle cx="84" cy="70" r="1.2" fill="#fff"/><circle cx="16" cy="84" r="1" fill="#fff"/><path d="M30 40q20 20 40 4" stroke="#3a2a5a" stroke-width="3" fill="none"/>`],
  cloud: ["Clouds / sky", "#dbe6f4", "#9ab0cc", `<path d="M10 40a10 10 0 0 1 16-8a12 12 0 0 1 22 2a9 9 0 0 1 2 16H14a8 8 0 0 1-4-10z" fill="#f6f9fd"/><path d="M54 84a8 8 0 0 1 13-7a10 10 0 0 1 18 2a7 7 0 0 1 2 13H58a7 7 0 0 1-4-8z" fill="#f6f9fd"/>`],
});
const TEX_GROUPS = {
  "Climate & plants": ["grass", "plains", "farmland", "savanna", "forest", "taiga", "jungle", "heath", "swamp", "tundra", "snow", "desert", "sand"],
  "Land & rock": ["dirt", "rock", "mountains", "badlands", "ash", "lava", "salt", "ice", "cave", "road"],
  "Water": ["water", "sea", "shallows", "ice"],
  "Fantastic": ["arcane", "crystal", "fey", "fungal", "blight", "shadow", "void", "cloud"],
  "Floors": ["stone", "wood", "carpet", "dirt", "cave", "grass", "sand"],
};
const texList = battle => Object.entries(TEXTURES).filter(([k]) => battle || !["carpet", "wood", "stone"].includes(k));
const texGroups = battle => Object.keys(TEX_GROUPS).filter(g => battle || g !== "Floors");
const texSwatch = k => `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="${TEXTURES[k][1]}"/>${TEXTURES[k][3]}</svg>`;

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

// world-map symbols: landforms, plants, places and the fantastic
Object.assign(STAMPS, {
  peak: ["Snowy peak", `<path d="M2 94L50 6 98 94z" fill="#8a816e"/><path d="M50 6L98 94H62z" fill="#6e6553"/><path d="M50 6L36 32l8-4 6 8 6-8 8 4z" fill="#fff"/>`],
  range: ["Mountain range", `<path d="M0 90L22 40 36 62 52 22 70 56 80 42 100 90z" fill="#8a816e"/><path d="M52 22L70 56 62 90H50zM22 40L36 62 30 90H20z" fill="#6e6553"/><path d="M52 22L45 36 52 33 58 38zM22 40L17 50 22 48 27 52z" fill="#fff"/>`],
  mesa: ["Mesa", `<path d="M8 88L20 40H80L92 88z" fill="#bc7448"/><path d="M20 40H80L76 52H24z" fill="#d89060"/><path d="M14 64H86M11 76H89" stroke="#9a5634" stroke-width="3"/>`],
  crater: ["Crater", `<ellipse cx="50" cy="56" rx="44" ry="30" fill="#8a816e"/><ellipse cx="50" cy="58" rx="30" ry="18" fill="#5a5244"/><path d="M20 50q30-20 60 0" stroke="#a89e88" stroke-width="4" fill="none"/>`],
  geyser: ["Geyser", `<ellipse cx="50" cy="86" rx="30" ry="9" fill="#7ab8d8"/><path d="M44 84q-6-40 6-76q12 36 6 76z" fill="#dff0fa" opacity=".9"/><circle cx="36" cy="30" r="6" fill="#f2f8fc" opacity=".8"/><circle cx="64" cy="24" r="7" fill="#f2f8fc" opacity=".8"/>`],
  waterfall: ["Waterfall", `<path d="M10 20H90V40H66V90H34V40H10z" fill="#8a816e"/><path d="M36 30h28v60H36z" fill="#7ab8e0"/><path d="M42 30v58M50 30v58M58 30v58" stroke="#dff0fa" stroke-width="3"/><ellipse cx="50" cy="90" rx="26" ry="6" fill="#dff0fa"/>`],
  island: ["Island", `<path d="M10 66q10-24 40-26t42 20q-6 20-40 22T10 66z" fill="#e2cb92"/><path d="M22 62q10-16 30-16t30 14q-8 12-30 13T22 62z" fill="#7aa257"/><path d="M50 50v-22" stroke="#6b4f2e" stroke-width="3"/><path d="M50 28q-14-4-20 6M50 28q14-4 20 6M50 28q-6-12-16-12M50 28q6-12 16-12" stroke="#3f7a3e" stroke-width="5" fill="none" stroke-linecap="round"/>`],
  iceberg: ["Iceberg", `<path d="M20 70L38 26 54 40 64 20 84 70z" fill="#f2f8fc" stroke="#8eb4cc" stroke-width="3"/><path d="M10 70H92" stroke="#4a8fc0" stroke-width="4"/><path d="M26 74L74 74 64 92H36z" fill="#a8c8de" opacity=".7"/>`],
  palm: ["Palm tree", `<path d="M50 94q-6-30 2-56" stroke="#8b5a2b" stroke-width="7" fill="none"/><path d="M52 38q-24-10-40 8M52 38q22-12 40 4M52 38q-14-22-34-20M52 38q16-22 34-18M52 38q2-20-4-30" stroke="#3f8a3e" stroke-width="8" fill="none" stroke-linecap="round"/>`],
  cactus: ["Cactus", `<path d="M44 94V20a6 6 0 0 1 12 0v74zM44 60H30V40a5 5 0 0 1 10 0v12h4M56 50h12V34a5 5 0 0 1 10 0v24H56" fill="#5a9a4a" stroke="#3a6a2e" stroke-width="3"/>`],
  deadtree: ["Dead tree", `<path d="M50 94V50M50 62L30 40M30 40L22 24M30 40L16 42M50 50L66 30M66 30L62 14M66 30L82 26M50 72L64 62" stroke="#5e4a3a" stroke-width="6" fill="none" stroke-linecap="round"/>`],
  oasis: ["Oasis", `<ellipse cx="50" cy="70" rx="40" ry="18" fill="#e2cb92"/><ellipse cx="50" cy="70" rx="24" ry="10" fill="#4a8fc0"/><path d="M28 64q-2-20 4-34M72 64q2-20-4-34" stroke="#8b5a2b" stroke-width="4" fill="none"/><path d="M32 30q-12-4-18 6M32 30q10-6 18 2M68 30q-10-6-18 2M68 30q12-4 18 6" stroke="#3f8a3e" stroke-width="6" fill="none" stroke-linecap="round"/>`],
  lighthouse: ["Lighthouse", `<path d="M38 92L42 32H58L62 92z" fill="#f2efe6" stroke="#5a5040" stroke-width="3"/><path d="M40 50H60M39 70H61" stroke="#b9413a" stroke-width="8"/><rect x="40" y="18" width="20" height="14" fill="#ffd34a" stroke="#5a5040" stroke-width="3"/><path d="M36 18L50 6 64 18z" fill="#b9413a"/><path d="M60 24L94 14M60 26L94 36" stroke="#ffe48a" stroke-width="3" opacity=".8"/>`],
  port: ["Port", `<path d="M6 60H94V92H6z" fill="#4a8fc0"/><path d="M12 60V40H40V60M44 60V30H72V60" fill="#c7b08a" stroke="#5e4b32" stroke-width="3"/><path d="M60 70H94V76H60z" fill="#8b5a2b"/><path d="M76 64V44M76 44L88 58H76" stroke="#5e3a16" stroke-width="3" fill="#f2efe6"/>`],
  bridge: ["Bridge", `<path d="M4 60Q50 20 96 60" stroke="#8a816e" stroke-width="12" fill="none"/><path d="M4 60Q50 20 96 60" stroke="#b8ad98" stroke-width="6" fill="none"/><path d="M24 48V74M50 38V74M76 48V74" stroke="#5a5040" stroke-width="5"/>`],
  mine: ["Mine", `<path d="M10 90Q16 34 50 30T90 90z" fill="#8a816e"/><path d="M34 90V62H66V90z" fill="#1c1814"/><path d="M30 62H70M34 62V90M66 62V90" stroke="#8b5a2b" stroke-width="6"/><path d="M58 20L82 44M74 16L64 30" stroke="#5a5040" stroke-width="5" stroke-linecap="round"/>`],
  temple: ["Temple", `<path d="M10 40L50 12 90 40z" fill="#d8cfb8" stroke="#5a5040" stroke-width="3"/><path d="M16 40H84V46H16zM14 84H86V92H14z" fill="#c4bba4" stroke="#5a5040" stroke-width="3"/><path d="M24 46V84M40 46V84M60 46V84M76 46V84" stroke="#d8cfb8" stroke-width="8"/><path d="M24 46V84M40 46V84M60 46V84M76 46V84" stroke="#5a5040" stroke-width="1.5"/>`],
  stones: ["Standing stones", `<ellipse cx="50" cy="80" rx="44" ry="12" fill="#7aa257" opacity=".6"/><path d="M12 82V50l8-4 6 4v32zM34 76V36l8-4 8 4v40zM58 76V36l8-4 8 4v40zM80 82V50l6-4 6 4v32z" fill="#9a9a9e" stroke="#55555a" stroke-width="3"/><path d="M30 34H78" stroke="#8a8a8e" stroke-width="8"/>`],
  obelisk: ["Obelisk", `<path d="M40 92L44 20 50 8 56 20 60 92z" fill="#4a4458" stroke="#2a2438" stroke-width="3"/><path d="M50 30v8M50 46v8M50 62v8" stroke="#c4b8ff" stroke-width="3"/><path d="M30 92H70" stroke="#2a2438" stroke-width="5"/>`],
  wizardtower: ["Wizard's tower", `<path d="M36 92L40 34H60L64 92z" fill="#6a5a9a" stroke="#2e2450" stroke-width="3"/><path d="M32 36L50 2 68 36z" fill="#3e3478" stroke="#2e2450" stroke-width="3"/><circle cx="50" cy="56" r="5" fill="#ffe48a"/><path d="M50 2l3-6M58 12l6-4M42 12l-6-4" stroke="#c4b8ff" stroke-width="2.5"/><circle cx="70" cy="16" r="2.5" fill="#e8e0ff"/><circle cx="28" cy="22" r="2" fill="#e8e0ff"/>`],
  portal: ["Portal", `<ellipse cx="50" cy="52" rx="28" ry="40" fill="#2a1a4a"/><ellipse cx="50" cy="52" rx="20" ry="32" fill="#7a5af0"/><ellipse cx="50" cy="52" rx="10" ry="20" fill="#d8ccff"/><ellipse cx="50" cy="52" rx="28" ry="40" fill="none" stroke="#9a9aa0" stroke-width="7"/><circle cx="20" cy="20" r="2.5" fill="#c4b8ff"/><circle cx="84" cy="30" r="2" fill="#c4b8ff"/>`],
  floatisle: ["Floating island", `<path d="M10 40Q50 28 90 40L72 60 62 84 52 70 44 90 34 66 24 60z" fill="#8a7058" stroke="#5a4636" stroke-width="3"/><path d="M10 40Q50 28 90 40Q50 50 10 40z" fill="#7aa257"/><circle cx="34" cy="28" r="9" fill="#3f7a3e"/><circle cx="66" cy="30" r="7" fill="#4f8f4a"/><path d="M20 96q4-6 8 0M70 94q4-6 8 0" stroke="#9ab0cc" stroke-width="3" fill="none"/>`],
  crystals: ["Crystals", `<path d="M30 92L22 50 32 26 42 50 38 92zM48 92L44 34 56 6 66 34 60 92zM66 92L64 56 74 38 84 58 78 92z" fill="#9ae0f0" stroke="#2e7484" stroke-width="3"/><path d="M56 6V92M32 26V92M74 38V92" stroke="#ffffff" stroke-width="2" opacity=".7"/>`],
  mushroom: ["Giant mushroom", `<path d="M10 50Q14 8 50 8T90 50z" fill="#c4423a"/><circle cx="34" cy="28" r="6" fill="#f6efe2"/><circle cx="60" cy="20" r="5" fill="#f6efe2"/><circle cx="72" cy="38" r="5" fill="#f6efe2"/><path d="M40 50Q38 80 32 92H68Q62 80 60 50z" fill="#efe4d0" stroke="#8a7a62" stroke-width="3"/>`],
  worldtree: ["World tree", `<path d="M46 94L44 60H56L54 94zM44 94q-14 0-20 4M56 94q14 0 20 4" stroke="#6b4f2e" stroke-width="5" fill="#8b5a2b"/><circle cx="50" cy="38" r="34" fill="#3f8a5a"/><circle cx="34" cy="32" r="16" fill="#5aaa6e"/><circle cx="64" cy="26" r="14" fill="#5aaa6e"/><circle cx="50" cy="38" r="40" fill="none" stroke="#ffe48a" stroke-width="2" stroke-dasharray="3 6" opacity=".8"/>`],
  dragon: ["Dragon's lair", `<path d="M8 90Q18 40 50 36T92 90z" fill="#6e5a4c"/><path d="M34 90Q38 64 50 62T66 90z" fill="#1c1814"/><path d="M50 30q-18-26-40-16q18 4 22 18q-14 2-20 12q22-8 38-6zM50 30q18-26 40-16q-18 4-22 18q14 2 20 12q-22-8-38-6z" fill="#9a2a2a"/>`],
  skulllair: ["Monster lair", `<path d="M14 80q0-50 36-50t36 50z" fill="#ece6d6" stroke="#333" stroke-width="3"/><circle cx="36" cy="58" r="8" fill="#333"/><circle cx="64" cy="58" r="8" fill="#333"/><path d="M40 80v12M50 80v12M60 80v12" stroke="#ece6d6" stroke-width="6"/><path d="M14 48L4 22 26 38M86 48L96 22 74 38" fill="#ece6d6" stroke="#333" stroke-width="3"/>`],
  serpent: ["Sea serpent", `<path d="M4 70q8-14 16 0t16 0 16 0" stroke="#3a8a6a" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M60 70q4-46 22-44q12 2 10 12l-12 2q-4-6-8 2q-4 14-4 28" fill="#3a8a6a"/><circle cx="84" cy="32" r="2.5" fill="#ffe48a"/><path d="M0 84q12-6 24 0t24 0 24 0 28 0" stroke="#7ab8e0" stroke-width="3" fill="none"/>`],
  ship: ["Ship", `<path d="M10 64H90L78 84H22z" fill="#8b5a2b" stroke="#5e3a16" stroke-width="3"/><path d="M50 64V8" stroke="#5e3a16" stroke-width="4"/><path d="M52 12Q80 30 52 56zM48 18Q26 34 48 54z" fill="#f2efe6" stroke="#8a8274" stroke-width="2"/><path d="M50 8h14l-4 4 4 4H50" fill="#b9413a"/>`],
  whirlpool: ["Whirlpool", `<path d="M50 50m-6 0a6 6 0 1 1 12 0a14 14 0 1 1-28 0a22 22 0 1 1 44 0a30 30 0 1 1-60 0a38 38 0 1 1 76 0" stroke="#2e6690" stroke-width="5" fill="none"/>`],
  leynexus: ["Ley nexus", `<circle cx="50" cy="50" r="40" fill="none" stroke="#5ad8d0" stroke-width="3"/><circle cx="50" cy="50" r="28" fill="none" stroke="#5ad8d0" stroke-width="2" stroke-dasharray="4 4"/><path d="M50 10L50 90M10 50H90M22 22L78 78M78 22L22 78" stroke="#5ad8d0" stroke-width="1.5" opacity=".7"/><circle cx="50" cy="50" r="9" fill="#e0fffc" stroke="#5ad8d0" stroke-width="3"/>`],
  rift: ["Rift", `<path d="M50 4L40 26 56 40 38 58 54 72 44 96 64 70 50 56 68 40 52 24z" fill="#1a0a2a" stroke="#c45ad8" stroke-width="3"/><path d="M50 14l-4 12 8 12-8 16 6 14" stroke="#f0c8ff" stroke-width="2" fill="none"/>`],
  compass: ["Compass rose", `<circle cx="50" cy="50" r="30" fill="none" stroke="#5a4636" stroke-width="2"/><path d="M50 4L56 44 50 50 44 44zM50 96L44 56 50 50 56 56z" fill="#5a4636"/><path d="M4 50L44 44 50 50 44 56zM96 50L56 56 50 50 56 44z" fill="#a08a70"/><path d="M50 4L56 44 50 50z" fill="#b9413a"/><text x="50" y="3" font-size="10" text-anchor="middle" fill="#5a4636" font-family="serif" dy="0">N</text>`],
});
const STAMP_GROUPS = {
  "Landforms": ["mountain", "peak", "range", "hills", "volcano", "mesa", "crater", "rock", "cave", "geyser", "waterfall", "island", "iceberg"],
  "Plants": ["tree", "pine", "bush", "palm", "cactus", "deadtree", "oasis"],
  "Places": ["city", "castle", "tower", "village", "ruins", "lighthouse", "port", "bridge", "mine", "temple", "stones", "obelisk", "tent", "campfire", "well", "flag"],
  "Fantastic": ["wizardtower", "portal", "floatisle", "crystals", "mushroom", "worldtree", "dragon", "skulllair", "leynexus", "rift", "serpent"],
  "Sea & markers": ["ship", "boat", "whirlpool", "serpent", "compass", "skullmark", "flag"],
  "Rooms & dungeon": ["house", "door", "stairs", "chest", "barrel", "crate", "table", "chair", "bed", "pillar", "statue", "altar", "bones", "well", "campfire"],
};
// what the scatter brush can scatter
const SCATTERABLE = ["tree", "pine", "bush", "palm", "deadtree", "cactus", "mushroom", "hills", "mountain", "peak", "rock", "crystals", "stones"];

/* ── feature lines: each draws itself along a stroke ── */
// points spaced evenly along a stroke, with the direction there
function alongPath(pts, step) {
  const out = [];
  let carry = step / 2;
  for (let i = 2; i < pts.length; i += 2) {
    const x0 = pts[i - 2], y0 = pts[i - 1], dx = pts[i] - x0, dy = pts[i + 1] - y0, L = Math.hypot(dx, dy);
    if (!L) continue;
    let t = carry;
    for (; t <= L; t += step) out.push({ x: x0 + dx * t / L, y: y0 + dy * t / L, a: Math.atan2(dy, dx) });
    carry = t - L;
  }
  if (!out.length && pts.length >= 2) out.push({ x: pts[0], y: pts[1], a: 0 });
  return out;
}
// the same "random" number for the same item every time it's drawn
const noise = (i, seed = 0) => { const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453; return x - Math.floor(x); };
function jagged(pts, amp, step) {
  const o = alongPath(pts, step), out = [pts[0], pts[1]];
  o.forEach((p, i) => { const n = (noise(i, 3) - .5) * 2 * amp; out.push(Math.round(p.x - Math.sin(p.a) * n), Math.round(p.y + Math.cos(p.a) * n)); });
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}
const sp = (d, stroke, w, more = "") => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${Math.max(0.5, w)}" stroke-linecap="round" stroke-linejoin="round" ${more}/>`;
const symbolsAlong = (pts, sym, z, P, step, side = 0) => alongPath(pts, step).map((p, i) => {
  const zz = z * (0.8 + 0.4 * noise(i, 7)), ox = -Math.sin(p.a) * side * zz, oy = Math.cos(p.a) * side * zz;
  return `<use href="#${P}s-${sym}" x="${p.x + ox - zz / 2}" y="${p.y + oy - zz * 0.8}" width="${zz}" height="${zz}"/>`;
}).join("");
// [name, group, default width, main colour, draw(d, w, it, P)]
const LINES = {
  river: ["River", "Water", 12, "#4a8fc0", (d, w) => sp(d, "#2e6690", w + 4) + sp(d, "#4a8fc0", w) + sp(d, "#8cc4ea", w * .35)],
  stream: ["Stream", "Water", 4, "#4a8fc0", (d, w) => sp(d, "#2e6690", w + 2) + sp(d, "#6aaad6", w)],
  coast: ["Coastline", "Water", 6, "#3a2e22", (d, w) => sp(d, "rgba(74,143,192,.35)", w * 4) + sp(d, "rgba(74,143,192,.35)", w * 2) + sp(d, "#3a2e22", Math.max(2, w * .4))],
  lava: ["Lava flow", "Water", 14, "#e8642a", (d, w) => sp(d, "#5a1a0e", w + 4) + sp(d, "#e8642a", w) + sp(d, "#ffd34a", w * .35)],
  cliff: ["Cliff / escarpment", "Land", 14, "#5a4a3a", (d, w, it) => sp(d, "#5a4a3a", w * .3) + alongPath(it.pts, w * .45).map(p => {
    const nx = -Math.sin(p.a), ny = Math.cos(p.a);
    return `<path d="M${p.x} ${p.y}l${nx * w} ${ny * w}" stroke="#5a4a3a" stroke-width="${Math.max(1, w * .14)}" stroke-linecap="round"/>`;
  }).join("")],
  ridge: ["Mountain ridge", "Land", 70, "#8a816e", (d, w, it, P) => symbolsAlong(it.pts, "mountain", w, P, w * .55)],
  hillsline: ["Line of hills", "Land", 50, "#9aa86a", (d, w, it, P) => symbolsAlong(it.pts, "hills", w, P, w * .7)],
  treeline: ["Tree line", "Land", 40, "#3f7a3e", (d, w, it, P) => symbolsAlong(it.pts, "tree", w, P, w * .5)],
  canyon: ["Canyon", "Land", 22, "#7a4228", (d, w, it) => { const j = flat(jagged(it.pts, w * .25, w * .5)); return sp(j, "#7a4228", w) + sp(j, "#bc7448", w * .7) + sp(j, "#3a1e10", w * .3); }],
  fault: ["Fault / chasm", "Land", 8, "#2a1e16", (d, w, it) => { const j = flat(jagged(it.pts, w * .8, w * 1.2)); return sp(j, "#8a816e", w * 1.6) + sp(j, "#1a120c", w * .6); }],
  road: ["Road", "Roads & borders", 8, "#c9a46a", (d, w) => sp(d, "#3a2e22", w + 3) + sp(d, "#c9a46a", w)],
  trail: ["Trail", "Roads & borders", 6, "#5a4636", (d, w) => sp(d, "#5a4636", w * .5, `stroke-dasharray="${w * .1} ${w * .9}"`)],
  border: ["Border", "Roads & borders", 6, "#8a2a2a", (d, w) => sp(d, "rgba(138,42,42,.18)", w * 3) + sp(d, "#8a2a2a", w * .45, `stroke-dasharray="${w * 2.4} ${w * 1.2} ${w * .2} ${w * 1.2}"`)],
  citywall: ["City wall", "Roads & borders", 10, "#5a5040", (d, w) => sp(d, "#5a5040", w + 3, `stroke-linecap="butt"`) + sp(d, "#b8ad98", w, `stroke-linecap="butt"`) + sp(d, "#5a5040", w * .5, `stroke-dasharray="${w * .6} ${w * .6}" stroke-linecap="butt"`)],
  ley: ["Ley line", "Magic", 10, "#5ad8d0", (d, w) => sp(d, "rgba(90,216,208,.18)", w * 3) + sp(d, "rgba(90,216,208,.4)", w) + sp(d, "#e0fffc", w * .2, `stroke-dasharray="${w * 1.5} ${w}"`)],
  magicrift: ["Magic rift", "Magic", 12, "#c45ad8", (d, w, it) => { const j = flat(jagged(it.pts, w * .6, w)); return sp(j, "rgba(196,90,216,.25)", w * 2.5) + sp(j, "#6a2a8a", w * .7) + sp(j, "#f0c8ff", w * .25); }],
  frontier: ["Wild frontier", "Magic", 16, "#6a8a2a", (d, w) => sp(d, "rgba(106,138,42,.3)", w * 2, `stroke-dasharray="${w * .3} ${w * .5}"`) + sp(d, "#4a5a1a", w * .2)],
};
const lineSymbols = { ridge: "mountain", hillsline: "hills", treeline: "tree" };

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
// drop points that sit nearly on the line between their neighbours
function simplify(pts, tol) {
  if (pts.length <= 4) return pts;
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length - 2; i += 2) {
    const ax = out[out.length - 2], ay = out[out.length - 1], bx = pts[i + 2], by = pts[i + 3], px = pts[i], py = pts[i + 1];
    const L = Math.hypot(bx - ax, by - ay) || 1, dist = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / L;
    if (dist > tol) out.push(px, py);
  }
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}
const flat = pts => { let d = ""; for (let i = 0; i < pts.length; i += 2) d += (i ? "L" : "M") + pts[i] + " " + pts[i + 1]; return d; };
function drawingSvg(d, dims, { editing = false } = {}) {
  const P = "dp" + (++drawSeq) + "-", S = dims.cell || 60;
  const used = new Set([d.bg, ...d.items.map(i => i.tex)].filter(Boolean));
  const stamps = new Set(d.items.flatMap(i => i.t === "stamp" && i.s || i.t === "scatter" ? [i.s] : i.t === "line" && lineSymbols[i.st] ? [lineSymbols[i.st]] : []));
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
  // feature lines, those that are drawn with symbols (ridges, tree lines) last
  const lineItems = of("line").filter(i => LINES[i.st]);
  for (const sym of [false, true]) for (const it of lineItems.filter(i => !!lineSymbols[i.st] === sym)) {
    const fill = editing ? sp(flat(it.pts), "transparent", Math.max(it.w, 14)) : "";
    out.push(`<g data-i="${idx.get(it)}">${LINES[it.st][4](flat(it.pts), it.w, it, P)}${fill}</g>`);
  }
  for (const it of of("brush")) out.push(`<path data-i="${idx.get(it)}" d="${flat(it.pts)}" fill="none" stroke="${it.c}" stroke-width="${it.w}" stroke-linecap="round" stroke-linejoin="round"/>`);
  // walls: dark stone with a pale edge, so they show on dark and light ground alike
  for (const it of of("wall")) out.push(`<path d="${flat(it.pts)}" fill="none" stroke="#cfc8b8" stroke-width="${it.w + 4}" stroke-linecap="square" stroke-linejoin="miter" pointer-events="none"/><path data-i="${idx.get(it)}" d="${flat(it.pts)}" fill="none" stroke="#1c1a20" stroke-width="${it.w}" stroke-linecap="square" stroke-linejoin="miter"/>`);
  // scattered stamps: the ones further down stand in front
  for (const it of of("scatter")) {
    const pos = [];
    for (let j = 0; j < it.pts.length; j += 2) pos.push({ x: it.pts[j], y: it.pts[j + 1], z: it.z * (0.75 + 0.5 * noise(j, it.pts.length)) });
    pos.sort((a, b) => a.y - b.y);
    out.push(`<g data-i="${idx.get(it)}">${pos.map(p => `<use href="#${P}s-${it.s}" x="${p.x - p.z / 2}" y="${p.y - p.z / 2}" width="${p.z}" height="${p.z}"/>`).join("")}</g>`);
  }
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
const ED = { target: null, d: null, tool: "pen", tex: "grass", color: "#2b2140", width: 6, widths: { pen: 6, terrain: 60, wall: 10, text: 0, line: 12, scatter: 160 },
  stamp: "tree", size: 1, rot: 0, line: "river", scatter: "tree", density: 1, texGroup: "", stampGroup: "", undo: [], redo: [], wall: [], dirty: false };
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
  // battlemaps start on floors and furniture, world maps on the land
  if (ED.wasBattle !== t.battle) Object.assign(ED, { texGroup: "", stampGroup: "", wasBattle: t.battle });
  Object.assign(ED, { target: t, d, undo: [], redo: [], wall: [], dirty: !!draft });
  ED.widths.text ||= t.battle ? 22 : 44;
  ED.width = ED.widths[ED.tool] ?? ED.width;
  if (!t.battle && ED.tool === "floor") ED.tool = "terrain";
  go(`#/draw/${kind}/${id}`);
}
ACT.drawOpen = el => openDrawing(el.dataset.kind, el.dataset.id);

const DRAW_TOOLS = [["pan", "✋", "Move around"], ["pen", "✏", "Pen"], ["terrain", "🖌", "Terrain"], ["area", "⬭", "Area"], ["line", "〰", "Lines"], ["scatter", "⁂", "Scatter"],
  ["floor", "▦", "Floor"], ["wall", "▬", "Wall"], ["stamp", "★", "Stamp"], ["text", "T", "Text"], ["move", "✥", "Move"], ["erase", "⌫", "Erase"]];
addRoute("draw", "map", (kind, id) => {
  const t = ED.target;
  if (!t || t.kind !== kind || t.id !== id || !ED.d) { setTimeout(() => openDrawing(kind, id)); return `<div class="page">${empty("Opening the drawing…")}</div>`; }
  const tools = DRAW_TOOLS.filter(([k]) => k !== "floor" || t.battle);
  // pickers come in groups (climate, rock, water, the fantastic…), one group at a time
  const groups = texGroups(t.battle);
  if (!groups.includes(ED.texGroup)) ED.texGroup = t.battle ? "Floors" : groups[0];
  const texPick = (act, cur) => `<select class="pick-group" data-change="drawGroup" data-k="texGroup">${groups.map(g => `<option ${g === ED.texGroup ? "selected" : ""}>${g}</option>`).join("")}</select>
    <div class="tex-pick">${TEX_GROUPS[ED.texGroup].map(k => `<button class="tex ${cur === k ? "on" : ""}" data-act="${act}" data-v="${k}" title="${TEXTURES[k][0]}" style="border-color:${TEXTURES[k][2]}">${texSwatch(k)}</button>`).join("")}</div>
    <span class="tex-name">${esc(TEXTURES[cur]?.[0] || "")}</span>`;
  const sGroups = Object.keys(STAMP_GROUPS).filter(g => t.battle || g !== "Rooms & dungeon").concat(DB.stamps.length ? ["Yours"] : []);
  if (!sGroups.includes(ED.stampGroup)) ED.stampGroup = t.battle ? "Rooms & dungeon" : sGroups[0];
  const stampBtn = (k, act, cur) => `<button class="stamp ${cur === k ? "on" : ""}" data-act="${act}" data-v="${k}" title="${STAMPS[k][0]}"><svg viewBox="0 0 100 100">${STAMPS[k][1]}</svg></button>`;
  const lineGroups = [...new Set(Object.values(LINES).map(l => l[1]))];
  const size = (lbl, k, min, max, step) => `<label class="inline">${lbl} <input type="range" min="${min}" max="${max}" step="${step}" value="${ED[k]}" data-input="drawOpt" data-k="${k}"></label>`;
  const opts = {
    pen: `<div class="pen-colors">${PEN_COLORS.map(c => `<button class="sw-btn ${ED.color === c ? "on" : ""}" data-act="drawColor" data-v="${c}" style="background:${c}"></button>`).join("")}</div>${size("Width", "width", 1, 40, 1)}`,
    terrain: `${texPick("drawTex", ED.tex)}${size("Width", "width", 10, 200, 5)}`,
    area: `${texPick("drawTex", ED.tex)}<span class="hint">Drag round the shape to fill it</span>`,
    line: `${lineGroups.map(g => `<span class="pick-lbl">${g}</span>${Object.entries(LINES).filter(([, l]) => l[1] === g).map(([k, l]) => `<button class="line-btn ${ED.line === k ? "on" : ""}" data-act="drawLine" data-v="${k}" style="--c:${l[3]}">${l[0]}</button>`).join("")}`).join("")}
      ${size("Width", "width", 2, 160, 1)}`,
    scatter: `<div class="stamp-pick">${SCATTERABLE.map(k => stampBtn(k, "drawScatter", ED.scatter)).join("")}</div>
      ${size("Spread", "width", 20, 600, 10)}${size("Size", "size", 0.25, 4, 0.25)}${size("Thick", "density", 0.25, 3, 0.25)}<span class="hint">Drag to plant a forest, a range, hills…</span>`,
    floor: `${texPick("drawTex", ED.tex)}<span class="hint">Drag over squares; start on a square of the same floor to remove it</span>`,
    wall: `${size("Thickness", "width", 2, 40, 1)}<span class="hint">${ED.wall.length ? `<button class="btn small accent" data-act="wallDone">Finish wall</button>` : "Tap corner after corner; tap the last one again to finish"}</span>`,
    stamp: `<select class="pick-group" data-change="drawGroup" data-k="stampGroup">${sGroups.map(g => `<option ${g === ED.stampGroup ? "selected" : ""}>${g}</option>`).join("")}</select>
      <div class="stamp-pick">${ED.stampGroup === "Yours" ? "" : STAMP_GROUPS[ED.stampGroup].map(k => stampBtn(k, "drawStamp", ED.stamp)).join("")}
        ${ED.stampGroup !== "Yours" ? "" : DB.stamps.map(s => `<button class="stamp ${ED.stamp === "a:" + s.asset ? "on" : ""}" data-act="drawStamp" data-v="a:${s.asset}" title="${esc(s.name)}">${assetImg(s.asset)}</button>`).join("")}
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
    if (tool === "scatter") {
      // plant stamps round the brush as it moves; the further it goes, the more
      const z = Math.round(ED.size * stampBase(t)), spread = ED.width, step = Math.max(6, z * 0.5 / ED.density);
      const pts = [];
      let lastP = null, run = step;
      const plant = p => {
        const n = Math.max(1, Math.round(spread / z * ED.density));
        for (let j = 0; j < n; j++) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread / 2;
          pts.push(Math.round(p[0] + Math.cos(a) * r), Math.round(p[1] + Math.sin(a) * r));
        }
        pv.innerHTML = `<g class="pv-scatter">${pts.map((v, j) => j % 2 ? "" : `<circle cx="${v}" cy="${pts[j + 1]}" r="${z / 3}"/>`).join("")}</g>`;
      };
      const mv = ev => {
        const p = at(ev);
        if (lastP) run += Math.hypot(p[0] - lastP[0], p[1] - lastP[1]);
        lastP = p;
        if (run >= step) { run = 0; plant(p); }
      };
      mv(e);
      stage.setPointerCapture(e.pointerId);
      stage.addEventListener("pointermove", mv);
      stage.addEventListener("pointerup", () => {
        stage.removeEventListener("pointermove", mv);
        pv.innerHTML = "";
        if (pts.length) edChanged(() => ED.d.items.push({ t: "scatter", s: ED.scatter, pts, z }));
      }, { once: true });
      return;
    }
    if (tool === "pen" || tool === "terrain" || tool === "area" || tool === "line") {
      const pts = [...p0];
      const w = ED.width;
      const style = tool === "pen" ? `stroke="${ED.color}" stroke-width="${w}"` : tool === "line" ? `stroke="${LINES[ED.line][3]}" stroke-width="${Math.min(w, 24)}" stroke-opacity=".8"`
        : tool === "terrain" ? `stroke="${TEXTURES[ED.tex][1]}" stroke-width="${w}" stroke-opacity=".8"` : `stroke="${TEXTURES[ED.tex][2]}" stroke-width="3" fill="${TEXTURES[ED.tex][1]}" fill-opacity=".6"`;
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
        else if (tool === "line") { if (pts.length === 2) pts.push(pts[0] + 1, pts[1]); edChanged(() => ED.d.items.push({ t: "line", pts: simplify(pts, 2), st: ED.line, w })); }
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
ACT.drawGroup = el => { ED[el.dataset.k] = el.value; rerender(); };
ACT.drawLine = el => { ED.line = el.dataset.v; ED.width = ED.widths.line = LINES[ED.line][2]; rerender(); };
ACT.drawScatter = el => { ED.scatter = el.dataset.v; rerender(); };
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
