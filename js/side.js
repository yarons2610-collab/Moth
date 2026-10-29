"use strict";
/* ── the side panel ── a second view of the app beside the page you're on:
   a codex entry, the timeline, your notes, a family tree, the book's plan…
   to look at or edit while writing a scene, without leaving it. On a phone
   it takes the bottom half of the screen.

   It shows the same pages as the main view. Links followed inside it (and
   pages opened from it) open inside it, with ‹ to go back; ⤢ opens its page
   in the main view instead. While you're working in the panel, a change
   made there redraws the panel and leaves a scene you're writing alone. */

const SIDE = { open: false, hash: "", back: [], owner: false };
try { Object.assign(SIDE, JSON.parse(localStorage.getItem("moth_side") || "{}"), { back: [], owner: false }); } catch {}
const keepSide = () => { try { localStorage.setItem("moth_side", JSON.stringify({ open: SIDE.open, hash: SIDE.hash })); } catch {} };

// which view a page's address belongs to (the writing view itself stays in the main view)
function sideView(hash) {
  const parts = String(hash || "").replace(/^#\/?/, "").split("/").map(p => decodeURIComponent(p)).filter((p, i) => i === 0 || p !== "");
  if (!parts[0] || parts[0] === "side") return null;
  const r = ROUTES.find(x => x.prefix === parts[0]);
  return r && !["sc", "draw", "settings"].includes(r.prefix) ? { r, args: parts.slice(1) } : null;
}
function sideHome() {
  const sc = CUR.prefix === "sc" && sceneCtx(CUR.args[0]);
  const links = [
    sc && [`#/plan/${sc.book.id}`, "📖 This book's plan"],
    sc?.sc.pov && [`#/e/${sc.sc.pov}`, "👤 " + (byId(DB.entries, sc.sc.pov)?.name || "POV")],
    sc?.sc.setting && [`#/e/${sc.sc.setting}`, "🏰 " + (byId(DB.entries, sc.sc.setting)?.name || "Setting")],
    ["#/codex", "📚 Codex"], ["#/timeline", "⏳ Timeline"], ["#/notes", "🗒 Notes"], ["#/family", "🌳 Family trees"], ["#/web", "🕸 Relationship web"], ["#/arcs", "〰 Arcs & threads"], ["#/map", "🗺 Map"],
  ].filter(Boolean);
  return `<div class="page side-home"><h3>Open beside your work</h3>
    <button class="btn wide" data-act="find">⌕ Find anything…</button>
    <div class="side-links">${links.map(([h, l]) => `<a class="btn" href="${h}">${esc(l)}</a>`).join("")}</div>
    <p class="muted small">Links you follow in here open in here. ‹ goes back; ⤢ opens the page in the main view.</p></div>`;
}
function renderSide() {
  const box = $("#side");
  if (!box) return;
  box.hidden = !SIDE.open;
  document.body.classList.toggle("with-side", SIDE.open);
  if (!SIDE.open) { box.innerHTML = ""; return; }
  const v = sideView(SIDE.hash);
  let html, after;
  if (!v) html = sideHome();
  else {
    try { const out = v.r.view(...v.args); [html, after] = Array.isArray(out) ? out : [out]; }
    catch (e) { console.error(e); html = `<div class="page"><p class="empty">Something went wrong showing this: ${esc(e.message)}</p></div>`; }
  }
  const y = $(".side-body", box)?.scrollTop || 0, same = box.dataset.hash === SIDE.hash;
  box.innerHTML = `<div class="side-bar">
      <button class="icon-btn" data-act="sideBack" title="Back" ${SIDE.back.length || v ? "" : "disabled"}>‹</button>
      <button class="icon-btn" data-act="sideHome" title="Choose what to show">☰</button>
      <span class="side-title">${v ? "" : "Side panel"}</span><span class="spacer"></span>
      ${v ? `<button class="icon-btn" data-act="sideFull" title="Open this in the main view">⤢</button>` : ""}
      <button class="icon-btn" data-act="sideToggle" title="Close the side panel">×</button></div>
    <div class="side-body">${html ?? ""}</div>`;
  box.dataset.hash = SIDE.hash;
  const body = $(".side-body", box);
  after?.(body);
  if (same) body.scrollTop = y;
  const t = $("h2, h3", body);
  $(".side-title", box).textContent = v ? (t?.textContent.trim().slice(0, 60) || "") : "Side panel";
}
function sideGo(hash) {
  if (hash !== SIDE.hash) { SIDE.back.push(SIDE.hash); if (SIDE.back.length > 30) SIDE.back.shift(); }
  SIDE.hash = hash; SIDE.open = true; SIDE.owner = true;
  keepSide(); renderSide();
  $("#side .side-body")?.scrollTo(0, 0);
}
ACT.sideToggle = () => { SIDE.open = !SIDE.open; SIDE.owner = SIDE.open; keepSide(); renderSide(); };
ACT.sideHome = () => sideGo("");
ACT.sideBack = () => { if (!SIDE.back.length) return sideGo(""); SIDE.hash = SIDE.back.pop(); keepSide(); renderSide(); };
ACT.sideFull = () => { const h = SIDE.hash; SIDE.owner = false; location.hash = h; };

// who's being worked in: the panel, or the main view (dialogs don't change it)
document.addEventListener("pointerdown", e => {
  if (e.target.closest?.("#side")) SIDE.owner = true;
  else if (e.target.closest?.("#main, .top")) SIDE.owner = false;
}, true);
document.addEventListener("focusin", e => {
  if (e.target.closest?.("#side")) SIDE.owner = true;
  else if (e.target.closest?.("#main")) SIDE.owner = false;
}, true);
// links inside the panel open inside the panel
document.addEventListener("click", e => {
  const a = e.target.closest?.("#side a[href^='#/']");
  if (!a || e.target.closest("[data-act]") && !e.target.closest("[data-act]").matches("a[href]") || e.ctrlKey || e.metaKey) return;
  if (!sideView(a.getAttribute("href")) && a.getAttribute("href") !== "#/codex") { SIDE.owner = false; return; }
  e.preventDefault();
  sideGo(a.getAttribute("href"));
}, true);
