"use strict";
/* ── Moth core ──
   What every feature module builds on: the DB and its persistence, the world's
   calendar, the link registry ([[links]], backlinks, search), markdown, routing,
   modals, toasts and the [[ autocomplete. Modules never call into each other;
   they register routes, link types, entry panels and hooks here instead. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ESC[c]);
const unesc = s => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[k]);
const byId = (arr, id) => arr.find(x => x.id === id) || null;
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
const countWords = s => (String(s || "").match(/\S+/g) || []).length;
const norm = s => String(s || "").trim().toLowerCase();
const splitList = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const COLORS = ["#e3c27a", "#e07a5f", "#81b29a", "#7ea8f8", "#b9a6ff", "#f2a6c8", "#5fc9c4", "#a3a3b8"];

/* ── hooks ── */
const HOOKS = {};
const on = (name, fn) => (HOOKS[name] ||= []).push(fn);
const emit = (name, ...args) => (HOOKS[name] || []).forEach(fn => fn(...args));

/* ── data ── */
const DB_KEY = "moth_db";
const DB_ARRAYS = ["kinds", "entries", "events", "books", "notes", "maps", "sessions", "quests", "encounters", "tables"];
let DB;

function defaultKinds() {
  const k = (id, name, icon, color, startLabel, endLabel, fields) =>
    ({ id, name, icon, color, startLabel, endLabel, fields: fields.map(([name, type]) => ({ id: uid(), name, type })) });
  return [
    k("character", "Character", "👤", "#e3c27a", "Born", "Died", [["Title", "text"], ["Home", "link"], ["Allegiance", "link"]]),
    k("place", "Place", "🏰", "#81b29a", "Founded", "Destroyed", [["Type", "text"], ["Population", "number"], ["Ruler", "link"]]),
    k("faction", "Faction", "⚑", "#e07a5f", "Founded", "Dissolved", [["Leader", "link"], ["Seat", "link"]]),
    k("item", "Item", "🗝", "#7ea8f8", "Made", "Lost", [["Owner", "link"]]),
    k("lore", "Lore", "📜", "#b9a6ff", "Begins", "Ends", []),
    k("creature", "Creature", "🐉", "#f2a6c8", "First seen", "Gone", [["Habitat", "text"]]),
  ];
}

function normalizeDB(d) {
  d = d && typeof d === "object" ? d : {};
  d.v = 1;
  d.world = Object.assign({ name: "Untitled world", eras: [{ id: uid(), name: "First Age", abbr: "FA", start: 1 }], months: [], now: { y: 1 } }, d.world || {});
  if (!d.world.eras.length) d.world.eras = [{ id: uid(), name: "Age", abbr: "", start: 1 }];
  for (const k of DB_ARRAYS) if (!Array.isArray(d[k])) d[k] = [];
  if (!d.kinds.length) d.kinds = defaultKinds();
  d.party ??= null;
  d.combat ??= null;
  d.updated ??= 0;
  return d;
}

function loadDB() {
  let raw = null;
  try { raw = localStorage.getItem(DB_KEY); } catch {}
  try { DB = normalizeDB(JSON.parse(raw)); } catch { DB = normalizeDB(null); }
  return raw != null;
}

// opts.quiet: keep the page as is (the writing view saves on every keystroke)
function save(opts = {}) {
  DB.updated = Date.now();
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
  catch (e) { toast("Couldn't save on this device: " + e.message); }
  IDX = null;
  emit("saved", opts);
}
function commit() { save(); rerender(); }

// Deleting anything goes through here, so every delete can be undone.
function withUndo(label, fn) {
  const snap = JSON.stringify(DB);
  fn();
  commit();
  toast(label, { undo: () => { DB = normalizeDB(JSON.parse(snap)); commit(); } });
}

/* ── the world's calendar ──
   A date is {y, m?, d?}. y is an absolute year; eras are only how it's shown,
   so moving an era's start re-labels everything without touching data. */
function eras() { return [...DB.world.eras].sort((a, b) => a.start - b.start); }
function eraOf(y) { const es = eras(); let e = es[0]; for (const x of es) if (x.start <= y) e = x; return e; }
function monthName(m) { return DB.world.months[m - 1] || "Month " + m; }
function fmtYear(y) { const e = eraOf(y); const n = y - e.start + 1; return n + (e.abbr ? " " + e.abbr : ""); }
function fmtDate(dt) {
  if (!dt || dt.y == null || isNaN(dt.y)) return "";
  return (dt.d ? dt.d + " " : "") + (dt.m ? monthName(dt.m) + " " : "") + fmtYear(dt.y);
}
// "3 Thaw 412 AR", "412", "2/5/88 FA", "Thaw 12". A year with no era is read in
// the era the world's "now" is in, which is the era people are thinking in.
function parseDate(str) {
  let s = String(str || "").trim();
  if (!s) return null;
  let era = null;
  for (const e of eras()) {
    for (const tag of [e.abbr, e.name].filter(Boolean)) {
      const re = new RegExp("\\s*" + tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "i");
      if (re.test(s) && /\d/.test(s.replace(re, ""))) { era = e; s = s.replace(re, ""); break; }
    }
    if (era) break;
  }
  era ||= eraOf(DB.world.now?.y ?? 1);
  let d = null, m = null, y = null;
  const toks = s.split(/[\s,/]+/).filter(Boolean);
  const nums = [];
  for (const t of toks) {
    if (/^-?\d+$/.test(t)) { nums.push(+t); continue; }
    const i = DB.world.months.findIndex(mn => norm(mn) === norm(t) || (t.length >= 3 && norm(mn).startsWith(norm(t))));
    const mm = t.match(/^month(\d+)$/i);
    if (i >= 0) m = i + 1; else if (mm) m = +mm[1]; else if (!/^month$/i.test(t)) return null;
  }
  if (!nums.length) return null;
  y = nums.pop();
  if (m) d = nums.pop() ?? null;
  else if (nums.length === 1) m = nums[0];
  else if (nums.length >= 2) { m = nums.pop(); d = nums.pop(); }
  if (nums.length) return null;
  const out = { y: era.start + y - 1 };
  if (m) out.m = m;
  if (d && m) out.d = d;
  return out;
}
const dateKey = dt => dt ? dt.y * 10000 + (dt.m || 0) * 100 + (dt.d || 0) : -Infinity;
function ageAt(born, at) {
  if (!born || !at) return null;
  let a = at.y - born.y;
  if (born.m && at.m && (at.m < born.m || (at.m === born.m && born.d && at.d && at.d < born.d))) a--;
  return a;
}
const NOW = () => DB.world.now || { y: 1 };

/* ── link registry ──
   A link type tells [[links]], backlinks, autocomplete and search about one
   kind of thing: list(), names(it), info(it) → {title, sub, icon, color},
   href(it), text(it) (prose to scan for [[links]]) and edges(it) → [[t, id, label]]. */
const LINK_TYPES = {};
const linkType = (t, spec) => { LINK_TYPES[t] = spec; };
const LINK_RE = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+))?\]\]/g;
const key = (t, id) => t + ":" + id;
let IDX = null;
const idx = () => IDX ||= buildIndex();
// Anything else derived from the data (family graph, map lookups) caches here,
// so it's thrown away with the index whenever the data changes.
const derived = (name, fn) => { const I = idx(); return name in I.cache ? I.cache[name] : (I.cache[name] = fn()); };

function buildIndex() {
  const names = new Map(), back = new Map(), items = [];
  for (const [t, s] of Object.entries(LINK_TYPES)) for (const it of s.list()) {
    items.push({ t, it });
    for (const n of s.names(it)) { const k = norm(n); if (k && !names.has(k)) names.set(k, { t, it }); }
  }
  const byKey = new Map(items.map(x => [key(x.t, x.it.id), x]));
  const addBack = (to, from, label) => {
    const tk = key(to.t, to.it.id), fk = key(from.t, from.it.id);
    if (tk === fk) return;
    if (!back.has(tk)) back.set(tk, new Map());
    if (!back.get(tk).has(fk)) back.get(tk).set(fk, { ...from, label });
  };
  for (const src of items) {
    const s = LINK_TYPES[src.t];
    for (const m of (s.text?.(src.it) || "").matchAll(LINK_RE)) { const to = names.get(norm(m[1])); if (to) addBack(to, src, "mentions"); }
    for (const [t, id, label] of s.edges?.(src.it) || []) { const to = byKey.get(key(t, id)); if (to) addBack(to, src, label); }
  }
  return { names, back, items, byKey, cache: {} };
}
const resolve = name => idx().names.get(norm(name)) || null;
const lookup = (t, id) => idx().byKey.get(key(t, id))?.it || null;
const backlinks = (t, id) => [...(idx().back.get(key(t, id))?.values() || [])];
function infoOf(t, it) { const s = LINK_TYPES[t]; return { ...s.info(it), href: s.href(it) }; }
function chip(t, it, extra = "") {
  if (!it) return "";
  const i = infoOf(t, it);
  return `<a class="chip" href="${i.href}" style="--c:${i.color || "var(--ink-dim)"}">${i.icon || ""} ${esc(i.title)}${extra}</a>`;
}
// Every mention of a thing in some text: the [[links]] in it that resolve.
function mentionsIn(text) {
  const out = [];
  for (const m of String(text || "").matchAll(LINK_RE)) { const r = resolve(m[1]); if (r && !out.some(x => x.it === r.it)) out.push(r); }
  return out;
}

/* ── markdown ── a small dialect: headings, lists, quotes, rules, bold,
   italic, code, links and [[wiki links]]. INLINE_HOOKS get the HTML of each
   run of text once links and code are set aside (dice become buttons there). */
const INLINE_HOOKS = [];
function wikiLink(name, shown) {
  const r = resolve(name);
  if (!r) return `<a class="wl missing" data-act="newFromLink" data-name="${esc(name)}" title="Doesn't exist yet. Tap to create it.">${esc(shown || name)}</a>`;
  const i = infoOf(r.t, r.it);
  return `<a class="wl" href="${i.href}" style="--c:${i.color || "var(--accent)"}">${esc(shown || name)}</a>`;
}
function inline(raw) {
  const stash = [];
  const put = html => "\u0001" + (stash.push(html) - 1) + "\u0001";
  let x = esc(raw);
  x = x.replace(/`([^`]+)`/g, (m, c) => put("<code>" + c + "</code>"));
  x = x.replace(LINK_RE, (m, a, b) => put(wikiLink(unesc(a).trim(), b && unesc(b).trim())));
  x = x.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => put(`<a href="${u}" target="_blank" rel="noopener">${t}</a>`));
  x = x.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<i>$2</i>")
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<i>$2</i>");
  for (const hook of INLINE_HOOKS) x = hook(x);
  return x.replace(/\u0001(\d+)\u0001/g, (m, i) => stash[i]);
}
function md(src) {
  const out = [];
  let para = [], list = null, quote = [];
  const flushP = () => { if (para.length) out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; };
  const flushL = () => { if (list) out.push(`<${list.tag}>${list.items.map(i => "<li>" + inline(i) + "</li>").join("")}</${list.tag}>`); list = null; };
  const flushQ = () => { if (quote.length) out.push("<blockquote>" + quote.map(inline).join("<br>") + "</blockquote>"); quote = []; };
  const flush = () => { flushP(); flushL(); flushQ(); };
  for (const raw of String(src || "").replace(/\r/g, "").split("\n")) {
    const l = raw.trimEnd();
    let m;
    if (!l.trim()) { flush(); continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { flush(); const n = m[1].length + 2; out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { flush(); out.push("<hr>"); continue; }
    if ((m = l.match(/^>\s?(.*)/))) { flushP(); flushL(); quote.push(m[1]); continue; }
    // a list can start straight after a line of text, with no blank line between
    if ((m = l.match(/^\s*([-*•]|\d+[.)])\s+(.*)/))) {
      flushP(); flushQ();
      const tag = /\d/.test(m[1]) ? "ol" : "ul";
      if (list && list.tag !== tag) flushL();
      (list ||= { tag, items: [] }).items.push(m[2]);
      continue;
    }
    if (list && /^\s{2,}/.test(raw)) { list.items[list.items.length - 1] += " " + l.trim(); continue; }
    flushL(); flushQ();
    para.push(l);
  }
  flush();
  return out.join("");
}
const mdBlock = (src, empty = "") => src && String(src).trim() ? `<div class="prose">${md(src)}</div>` : empty;

/* ── routing ──
   #/<prefix>/<args…>. A view returns HTML, or [html, after(main)] when it
   needs to wire things up once it's on the page. */
const ROUTES = [];
const addRoute = (prefix, tab, view) => ROUTES.push({ prefix, tab, view });
let CUR = { prefix: "", args: [] };
function route() {
  const parts = (location.hash.replace(/^#\/?/, "") || "codex").split("/").map(p => decodeURIComponent(p));
  const r = ROUTES.find(x => x.prefix === parts[0]) || ROUTES.find(x => x.prefix === "codex");
  CUR = { prefix: r.prefix, args: parts.slice(1), tab: r.tab };
  $$(".tab").forEach(b => b.classList.toggle("on", b.dataset.tab === r.tab));
  document.body.dataset.route = r.prefix;
  const main = $("#main");
  let out;
  try { out = r.view(...CUR.args); }
  catch (e) { console.error(e); out = `<div class="page"><p class="empty">Something went wrong showing this page: ${esc(e.message)}</p></div>`; }
  const [html, after] = Array.isArray(out) ? out : [out];
  if (html != null) main.innerHTML = html;
  after?.(main);
  $("#worldName").textContent = DB.world.name;
  emit("route", CUR);
}
function rerender() { const main = $("#main"), y = main.scrollTop; route(); main.scrollTop = y; }
const go = hash => { if (location.hash === hash) rerender(); else location.hash = hash; };

/* ── actions ── data-act="name" on anything clickable runs ACT.name(el, event);
   data-change / data-input do the same for change and input events. */
const ACT = {};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
for (const type of ["change", "input"]) document.addEventListener(type, e => {
  const name = e.target.dataset?.[type];
  if (name && ACT[name]) ACT[name](e.target, e);
});

/* ── modals ── */
const MODALS = [];
function modal({ title, body, wide = false, buttons = [], onOpen, onClose, cls = "" }) {
  const wrap = document.createElement("div");
  wrap.className = "modal-wrap";
  wrap.innerHTML = `<div class="modal ${wide ? "wide" : ""} ${cls}" role="dialog" aria-label="${esc(title)}">
    <div class="modal-h"><h3>${esc(title)}</h3><button class="x" data-close aria-label="Close">×</button></div>
    <div class="modal-b">${body}</div>
    ${buttons.length ? `<div class="modal-f">${buttons.map((b, i) => `<button class="btn ${b.cls || ""}" data-mb="${i}">${esc(b.label)}</button>`).join("")}</div>` : ""}
  </div>`;
  document.body.append(wrap);
  const api = {
    el: wrap,
    close() { if (!wrap.isConnected) return; wrap.remove(); MODALS.splice(MODALS.indexOf(api), 1); acClose(); onClose?.(); },
  };
  MODALS.push(api);
  let downOnBackdrop = false;
  wrap.addEventListener("mousedown", e => { downOnBackdrop = e.target === wrap; });
  wrap.addEventListener("click", e => {
    if ((e.target === wrap && downOnBackdrop) || e.target.closest("[data-close]")) return api.close();
    const b = e.target.closest("[data-mb]");
    if (b) { const r = buttons[+b.dataset.mb].act?.(wrap, api); if (r !== false) api.close(); }
  });
  wrap.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "file" && buttons.length) {
      e.preventDefault(); wrap.querySelector(".modal-f .btn.accent, .modal-f .btn:last-child")?.click();
    }
  });
  onOpen?.(wrap, api);
  if (!wrap.querySelector("[autofocus]")) wrap.querySelector(".modal-b input:not([type=checkbox]):not([type=color]):not([type=file]):not([type=radio]), .modal-b textarea")?.focus();
  else wrap.querySelector("[autofocus]").focus();
  return api;
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && MODALS.length) { e.preventDefault(); MODALS[MODALS.length - 1].close(); }
});
function ask(title, msg, label = "Delete", cls = "danger") {
  return new Promise(res => {
    let ok = false;
    modal({ title, body: `<p>${msg}</p>`, buttons: [{ label: "Cancel" }, { label, cls, act: () => { ok = true; } }], onClose: () => res(ok) });
  });
}
function formVals(root) {
  const o = {};
  for (const el of $$("[name]", root)) {
    if (el.type === "radio") { if (el.checked) o[el.name] = el.value; else o[el.name] ??= ""; }
    else o[el.name] = el.type === "checkbox" ? el.checked : el.value;
  }
  return o;
}

/* ── form fields ── */
const field = (label, inner, cls = "") => `<label class="fld ${cls}"><span>${label}</span>${inner}</label>`;
const textField = (label, name, value = "", attrs = "") => field(label, `<input name="${name}" value="${esc(value)}" ${attrs}>`);
const areaField = (label, name, value = "", rows = 6, attrs = "") => field(label, `<textarea name="${name}" rows="${rows}" ${attrs}>${esc(value)}</textarea>`);
const dateField = (label, name, value) => field(label,
  `<input name="${name}" data-date data-input="datePreview" value="${esc(fmtDate(value))}" placeholder="e.g. ${esc(fmtDate({ y: NOW().y, m: DB.world.months.length ? 3 : undefined, d: DB.world.months.length ? 12 : undefined }))}"><small class="date-prev"></small>`);
ACT.datePreview = el => {
  const p = el.parentElement.querySelector(".date-prev");
  if (!el.value.trim()) return p.textContent = "";
  const d = parseDate(el.value);
  p.textContent = d ? "→ " + fmtDate(d) : "Not a date I can read";
  p.classList.toggle("bad", !d);
};
const colorField = (label, name, value) => field(label, `<div class="swatches">${["", ...COLORS].map(c =>
  `<label class="sw" style="--c:${c || "transparent"}" title="${c || "none"}"><input type="radio" name="${name}" value="${c}" ${c === (value || "") ? "checked" : ""}><i></i></label>`).join("")}</div>`);
function entryOptions(sel, { blank = "—", kind = null } = {}) {
  const list = DB.entries.filter(e => !kind || e.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
  return `<option value="">${blank}</option>` + list.map(e => `<option value="${e.id}" ${e.id === sel ? "selected" : ""}>${esc(kindOf(e).icon)} ${esc(e.name)}</option>`).join("");
}
const kindOf = e => byId(DB.kinds, e?.kind) || { id: "", name: "Entry", icon: "◆", color: "#a3a3b8", fields: [], startLabel: "From", endLabel: "Until" };
const entryColor = e => e.color || kindOf(e).color;

/* ── toasts ── */
function toast(msg, { undo, ms = undo ? 7000 : 3200, html = false } = {}) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>${html ? msg : esc(msg)}</span>${undo ? `<button class="btn small">Undo</button>` : ""}`;
  $("#toasts").append(t);
  const kill = () => { t.classList.add("out"); setTimeout(() => t.remove(), 250); };
  t.querySelector("button")?.addEventListener("click", () => { undo(); kill(); });
  setTimeout(kill, ms);
}
function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const fileSlug = s => String(s || "moth").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "moth";

/* ── entry pages are built from panels ──
   ENTITY_PANELS: (entry) → HTML (or "") shown on an entry's page, in order.
   ENTITY_DELETE_HOOKS: (id) → tidy references when an entry is deleted. */
const ENTITY_PANELS = [];
const ENTITY_DELETE_HOOKS = [];

/* ── [[ autocomplete ── typing [[ in any text box offers matching names */
const AC = { el: null, target: null, items: [], i: 0, from: 0 };
function acClose() { AC.el?.remove(); AC.el = null; AC.target = null; }
function caretXY(t) {
  const r = t.getBoundingClientRect();
  if (t.tagName !== "TEXTAREA") return { x: r.left, y: r.bottom };
  const m = document.createElement("div"), cs = getComputedStyle(t);
  for (const p of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingLeft", "paddingRight", "borderTopWidth", "borderLeftWidth", "boxSizing", "whiteSpace", "wordWrap", "tabSize"]) m.style[p] = cs[p];
  Object.assign(m.style, { position: "fixed", visibility: "hidden", left: r.left + "px", top: r.top + "px", width: r.width + "px", whiteSpace: "pre-wrap", overflowWrap: "break-word" });
  m.textContent = t.value.slice(0, t.selectionStart);
  const s = document.createElement("span"); s.textContent = "​"; m.append(s);
  document.body.append(m);
  const sr = s.getBoundingClientRect();
  m.remove();
  return { x: sr.left, y: Math.min(sr.bottom - t.scrollTop, r.bottom) };
}
function acCheck(t) {
  const before = t.value.slice(0, t.selectionStart);
  const m = before.match(/\[\[([^\]\[|\n]{0,40})$/);
  if (!m) return acClose();
  const q = norm(m[1]);
  const scored = [];
  for (const x of idx().items) {
    const ns = LINK_TYPES[x.t].names(x.it).map(norm);
    const s = ns.some(n => n.startsWith(q)) ? 0 : ns.some(n => n.includes(q)) ? 1 : -1;
    if (s >= 0) scored.push([s, x]);
  }
  scored.sort((a, b) => a[0] - b[0] || infoOf(a[1].t, a[1].it).title.localeCompare(infoOf(b[1].t, b[1].it).title));
  AC.items = scored.slice(0, 8).map(x => x[1]);
  if (!AC.items.length) return acClose();
  AC.target = t; AC.i = 0; AC.from = before.length - m[1].length - 2;
  if (!AC.el) {
    AC.el = document.createElement("div");
    AC.el.className = "link-pop";
    AC.el.addEventListener("mousedown", e => {
      e.preventDefault();
      const b = e.target.closest("[data-i]");
      if (b) acPick(+b.dataset.i);
    });
    document.body.append(AC.el);
  }
  AC.el.innerHTML = AC.items.map((x, i) => { const inf = infoOf(x.t, x.it); return `<div class="lp-item ${i === AC.i ? "on" : ""}" data-i="${i}">${inf.icon || ""} ${esc(inf.title)} <small>${esc(inf.sub || "")}</small></div>`; }).join("");
  const { x, y } = caretXY(t);
  AC.el.style.left = clamp(x, 8, innerWidth - 260) + "px";
  AC.el.style.top = (y + 4) + "px";
}
function acPick(i) {
  const t = AC.target, x = AC.items[i];
  if (!t || !x) return;
  const name = infoOf(x.t, x.it).title;
  const after = t.value.slice(t.selectionStart).replace(/^[^\]\n]*\]\]/, "");
  t.value = t.value.slice(0, AC.from) + "[[" + name + "]]" + after;
  const pos = AC.from + name.length + 4;
  t.setSelectionRange(pos, pos);
  acClose();
  t.dispatchEvent(new Event("input", { bubbles: true }));
}
document.addEventListener("input", e => { if (e.target.matches?.("textarea, input[data-links]")) acCheck(e.target); });
// Capture phase, so the popup gets its keys before the page or a dialog does:
// Escape closes the popup only, and the dialog stays open.
window.addEventListener("keydown", e => {
  if (!AC.el || e.target !== AC.target) return;
  const n = AC.items.length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") AC.i = (AC.i + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
  else if (e.key === "Enter" || e.key === "Tab") { acPick(AC.i); }
  else if (e.key === "Escape") acClose();
  else return;
  e.preventDefault(); e.stopPropagation();
  if (AC.el) $$(".lp-item", AC.el).forEach((el, i) => el.classList.toggle("on", i === AC.i));
}, true);
document.addEventListener("focusout", e => { if (e.target === AC.target) setTimeout(() => { if (document.activeElement !== AC.target) acClose(); }, 100); });

/* ── small shared bits of UI ── */
const tagsHtml = tags => (tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join("");
const empty = msg => `<p class="empty">${msg}</p>`;
function searchBox(act, value = "", ph = "Filter…") {
  return `<input class="search" type="search" placeholder="${ph}" value="${esc(value)}" data-input="${act}">`;
}
// Keep a filter box's focus and caret when the list under it re-renders.
function refocus(sel) {
  const el = $(sel);
  if (el) { const v = el.value; el.focus(); el.setSelectionRange(v.length, v.length); }
}

// Pick several codex entries: chips you can remove, plus a select to add more.
// The chosen ids live in a hidden input, so formVals() reads them like any field.
function multiPick(label, name, ids = [], { kind = null } = {}) {
  return field(label, `<div class="multi" data-name="${name}"><input type="hidden" name="${name}" value="${ids.join(",")}">
    <span class="multi-chips">${ids.map(multiChip).join("")}</span>
    <select data-change="multiAdd">${entryOptions("", { blank: "+ add…", kind })}</select></div>`);
}
function multiChip(id) {
  const e = byId(DB.entries, id);
  return e ? `<span class="chip" style="--c:${entryColor(e)}" data-id="${id}">${kindOf(e).icon} ${esc(e.name)} <button type="button" class="mini" data-act="multiDel">✕</button></span>` : "";
}
const multiVals = s => String(s || "").split(",").filter(Boolean);
ACT.multiAdd = el => {
  const box = el.closest(".multi"), inp = $("input[type=hidden]", box), ids = multiVals(inp.value);
  if (el.value && !ids.includes(el.value)) { ids.push(el.value); $(".multi-chips", box).insertAdjacentHTML("beforeend", multiChip(el.value)); }
  inp.value = ids.join(",");
  el.value = "";
};
ACT.multiDel = el => {
  const c = el.closest(".chip"), box = el.closest(".multi"), inp = $("input[type=hidden]", box);
  inp.value = multiVals(inp.value).filter(x => x !== c.dataset.id).join(",");
  c.remove();
};
