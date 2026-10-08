"use strict";
/* ── the player screen ── a second window, meant for the TV or projector on
   an extended display (not a mirrored one). It shows only what you send it:
   a battlemap (through its fog, without hidden tokens), a map (without secret
   pins), a picture, a handout, read-aloud text, a title card or nothing.
   Your own window keeps showing everything.

   Both windows share this browser's storage, so the player screen reads the
   world itself and redraws whenever you save. What it shows is kept in
   localStorage (moth_screen), and a BroadcastChannel ping tells your window
   whether the player screen is open. It never writes anything. */

const SCREEN_KEY = "moth_screen";
const screenChan = "BroadcastChannel" in window ? new BroadcastChannel("moth-screen") : null;
let screenSeen = 0, playerWin = null;

function screenState() {
  try { return JSON.parse(localStorage.getItem(SCREEN_KEY)) || { kind: "title" }; } catch { return { kind: "title" }; }
}
const screenIs = (kind, id) => { const s = screenState(); return s.kind === kind && (id == null || s.id === id); };
const screenOpen = () => Date.now() - screenSeen < 5000 || !!(playerWin && !playerWin.closed);
function describeScreen(s = screenState()) {
  if (s.kind === "black") return "Black";
  if (s.kind === "title") return "Title card";
  if (s.kind === "battle") return "Battlemap: " + (byId(DB.encounters, s.id)?.name || "?");
  if (s.kind === "map") return "Map: " + (byId(DB.maps, s.id)?.name || "?");
  if (s.kind === "entry") return "Picture: " + (byId(DB.entries, s.id)?.name || "?");
  if (s.kind === "handout") return "Handout: " + (byId(DB.handouts, s.id)?.title || "?");
  if (s.kind === "text") return "Read-aloud text";
  return s.kind;
}

/* ── your side ── */
function showOnScreen(st) {
  try { localStorage.setItem(SCREEN_KEY, JSON.stringify({ ...st, at: Date.now() })); } catch {}
  updateScreenBtn();
  if (!screenOpen()) toast(`Ready for the player screen: ${esc(describeScreen())}. <a data-act="screenOpen">Open it</a>`, { html: true, ms: 6000 });
  else toast("On the player screen: " + describeScreen(), { ms: 1800 });
  if (!PLAYER_MODE) rerender();
}
function updateScreenBtn() {
  const b = $("#screenBtn");
  if (!b) return;
  b.classList.toggle("live", screenOpen());
  b.title = screenOpen() ? "Player screen: " + describeScreen() : "Player screen (closed)";
}
if (!PLAYER_MODE) {
  screenChan?.addEventListener("message", e => { if (e.data?.alive) { const was = screenOpen(); screenSeen = Date.now(); if (!was) updateScreenBtn(); } });
  setInterval(updateScreenBtn, 3000);
  // Shift+B: black the player screen out, from anywhere
  document.addEventListener("keydown", e => {
    if (e.key === "B" && e.shiftKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); showOnScreen({ kind: "black" }); }
  });
}

// Open the player screen. With more than one display (and Chrome's permission
// to place windows), it opens on the other one; otherwise drag it across.
ACT.screenOpen = async () => {
  playerWin = window.open("index.html?player", "moth-player", "popup,width=1280,height=720");
  if (!playerWin) return toast("The browser blocked the new window. Allow pop-ups for this site, then try again.");
  try {
    if ("getScreenDetails" in window) {
      const sd = await window.getScreenDetails();
      const other = sd.screens.find(s => s !== sd.currentScreen);
      if (other) { playerWin.moveTo(other.availLeft, other.availTop); playerWin.resizeTo(other.availWidth, other.availHeight); }
    }
  } catch {}
  [...MODALS].forEach(m => m.close());
  setTimeout(updateScreenBtn, 1500);
};

ACT.screenPanel = () => {
  const maps = DB.maps.map(m => `<option value="${m.id}">🗺 ${esc(m.name)}</option>`).join("");
  modal({ title: "Player screen", wide: true,
    body: `<div class="screen-status ${screenOpen() ? "live" : ""}">
        <b>${screenOpen() ? "Open" : "Not open"}</b> · showing <b>${esc(describeScreen())}</b>
        <button class="btn ${screenOpen() ? "" : "accent"}" data-act="screenOpen">${screenOpen() ? "Open it again" : "Open the player screen"}</button></div>
      <p class="muted small">Set your laptop's display to <b>extend</b> to the TV (not mirror), then drag the player screen onto the TV and click it once to go full screen.
        The players only see what you send there. <b>Shift+B</b> blacks it out at any time.</p>
      <div class="btn-row"><button class="btn" data-act="screenSimple" data-k="title">Title card</button><button class="btn" data-act="screenSimple" data-k="black">Black</button>
        ${maps ? `<select data-change="screenMapPick"><option value="">Show a map…</option>${maps}</select>` : ""}</div>
      <h4 class="screen-h">Read-aloud text</h4>
      <textarea id="screenText" rows="3" placeholder="Type or paste what the players should read. (In any article, a > quote has a 📺 button that does this.)"></textarea>
      <div class="btn-row"><button class="btn" data-act="screenTextShow">📺 Show text</button></div>
      <h4 class="screen-h">Handouts</h4>
      <div class="handouts">${DB.handouts.map(h => `<div class="handout"><button class="handout-pic" data-act="screenHandout" data-id="${h.id}" title="Show">${assetImg(h.asset)}</button>
          <small>${esc(h.title)}</small><button class="mini" data-act="handoutDelete" data-id="${h.id}" title="Delete">🗑</button></div>`).join("")}
        <button class="handout add" data-act="handoutAdd">+ Picture</button></div>`,
  });
};
ACT.screenSimple = el => showOnScreen({ kind: el.dataset.k });
ACT.screenMapPick = el => el.value && showOnScreen({ kind: "map", id: el.value });
ACT.screenTextShow = () => { const t = $("#screenText").value.trim(); if (t) showOnScreen({ kind: "text", text: t }); };
ACT.screenQuote = el => showOnScreen({ kind: "text", text: el.dataset.text });
ACT.screenBattle = el => showOnScreen({ kind: "battle", id: el.dataset.id });
ACT.screenMap = el => showOnScreen({ kind: "map", id: el.dataset.id });
ACT.screenHandout = el => showOnScreen({ kind: "handout", id: el.dataset.id });
ACT.screenEntry = el => {
  const e = byId(DB.entries, el.dataset.id);
  modal({ title: `Show ${e.name} to the players`,
    body: `<label class="check"><input type="checkbox" name="pic" ${e.portrait || e.token ? "checked" : "disabled"}> Picture${e.portrait || e.token ? "" : " (none yet)"}</label>
      <label class="check"><input type="checkbox" name="name" checked> Name</label>
      <label class="check"><input type="checkbox" name="summary" ${e.summary ? "" : "disabled"}> The one-line summary${e.summary ? `: <i>${esc(e.summary)}</i>` : ""}</label>
      ${publicFields(e).length ? `<h4 class="screen-h">Details to show</h4><div class="detail-picks">${publicFields(e).map(f =>
        `<label class="check"><input type="checkbox" name="d_${f.id}" ${!f.sec || /appearance/i.test(f.sec) ? (SHORT.has(f.type) || /appearance/i.test(f.sec) ? "checked" : "") : ""}> ${esc(f.name)}</label>`).join("")}</div>
        <p class="muted small">Fields marked 🙈 secret are never offered.</p>` : ""}`,
    buttons: [{ label: "Cancel" }, { label: "📺 Show", cls: "accent", act: w => {
      const v = formVals(w);
      showOnScreen({ kind: "entry", id: e.id, pic: v.pic, name: v.name, summary: v.summary, fields: publicFields(e).filter(f => v["d_" + f.id]).map(f => f.id) });
    } }] });
};
ACT.handoutAdd = async () => {
  const img = await pickImage(2400);
  if (!img) return;
  const title = prompt("A name for this handout", "Handout") || "Handout";
  DB.handouts.push({ id: uid(), asset: img.id, title });
  save();
  [...MODALS].forEach(m => m.close());
  ACT.screenPanel();
};
ACT.handoutDelete = el => {
  withUndo("Handout deleted", () => { DB.handouts = DB.handouts.filter(h => h.id !== el.dataset.id); });
  [...MODALS].forEach(m => m.close());
  ACT.screenPanel();
};

// the fields of an entry the players may see: filled in, and not secret
const publicFields = e => kindOf(e).fields.filter(f => !f.secret && !isEmptyVal(e.fields?.[f.id]));
function playerDetails(e, ids) {
  const fs = publicFields(e).filter(f => ids.includes(f.id));
  if (!fs.length) return "";
  // links show as plain names on the TV, and long text is kept short
  const show = f => {
    const v = e.fields[f.id];
    if (f.type === "link" || f.type === "links") return esc(fieldLinks(f, v).map(id => byId(DB.entries, id)?.name).filter(Boolean).join(", "));
    if (f.type === "long" || f.type === "list") { const t = plainLinks(v).replace(/\n+/g, f.type === "list" ? " · " : " "); return esc(t.length > 300 ? t.slice(0, 300) + "…" : t); }
    if (f.type === "date") return esc(fmtDate(v));
    if (f.type === "yesno") return v ? "Yes" : "No";
    return esc(plainLinks(String(v)));
  };
  return `<div class="ps-details">${fs.map(f => `<div><span>${esc(f.name)}</span><b>${show(f)}</b></div>`).join("")}</div>`;
}

/* ── the player screen's own side ── */
function renderPlayer() {
  const s = screenState(), main = $("#main");
  let html = "", fit = null;
  const title = `<div class="ps-title"><img src="icons/moth.svg" alt=""><h1>${esc(DB.world.name)}</h1></div>`;
  if (s.kind === "black") html = "";
  else if (s.kind === "battle" && byId(DB.encounters, s.id)?.battle) {
    const x = byId(DB.encounters, s.id), b = x.battle;
    html = `<div class="ps-stage"><div class="map-layer" id="psLayer" style="width:${b.w}px;height:${b.h}px">${battleLayerHtml(x, true)}</div></div>${playerInitiative(x)}`;
    fit = b;
  } else if (s.kind === "map" && byId(DB.maps, s.id)) {
    const m = byId(DB.maps, s.id);
    html = `<div class="ps-stage"><div class="map-layer" id="psLayer" style="width:${m.w}px;height:${m.h}px">${playerMapHtml(m)}</div></div><div class="ps-caption">${esc(m.name)}</div>`;
    fit = m;
  } else if (s.kind === "entry" && byId(DB.entries, s.id)) {
    const e = byId(DB.entries, s.id), pic = e.portrait || e.token;
    const details = s.fields?.length ? playerDetails(e, s.fields) : "";
    html = `<div class="ps-card ${details ? "with-details" : ""}">${s.pic && pic ? assetImg(pic, "ps-pic") : ""}<div>${s.name ? `<h1>${esc(e.name)}</h1>` : ""}${s.summary && e.summary ? `<p>${esc(plainLinks(e.summary))}</p>` : ""}${details}</div></div>`;
  } else if (s.kind === "handout" && byId(DB.handouts, s.id)) {
    html = `<div class="ps-card handout-show">${assetImg(byId(DB.handouts, s.id).asset, "ps-handout")}</div>`;
  } else if (s.kind === "text") {
    html = `<div class="ps-text prose">${md(plainLinks(s.text))}</div>`;
  } else html = title;
  main.innerHTML = `<div class="ps ps-${esc(s.kind)}">${html}</div>`;
  if (fit) {
    const layer = $("#psLayer"), st = layer.parentElement;
    const k = Math.min(st.clientWidth / fit.w, st.clientHeight / fit.h);
    layer.style.transform = `translate(${(st.clientWidth - fit.w * k) / 2}px,${(st.clientHeight - fit.h * k) / 2}px) scale(${k})`;
    layer.style.setProperty("--ik", 1 / k);
  }
}
// turn order as the players see it: the party's HP, but only "bloodied" or
// "down" for foes, and nobody they can't see
function playerInitiative(x) {
  const c = battleCombat(x);
  if (!c) return "";
  const b = x.battle, open = fogOpen(b);
  const toks = new Map(battleTokens(x).map(t => [t.key, t]));
  const rows = c.list.map((k, i) => ({ k, i, t: toks.get(k.tok || "c:" + k.id) })).filter(r => r.t && seenByPlayers(b, r.t, open));
  return `<div class="ps-init"><span class="ps-round">Round ${c.round}</span>${rows.map(({ k, i }) => {
    const f = k.max ? k.hp / k.max : 1;
    const state = k.hp <= 0 ? "down" : k.pc ? `${k.hp}/${k.max}` : f <= 0.5 ? "bloodied" : "";
    return `<span class="ps-who ${i === c.turn ? "cur" : ""} ${k.pc ? "pc" : ""} ${k.hp <= 0 ? "down" : ""}">${esc(k.name)}${state ? `<small>${state}</small>` : ""}</span>`;
  }).join("")}</div>`;
}
// a map as the players see it: no secret pins or regions, nothing from the future
function playerMapHtml(m) {
  const year = NOW().y, vis = r => !r.secret && epoch(byId(DB.entries, r.entry), year) !== "future";
  const regions = m.regions.filter(vis).map(r => { const e = byId(DB.entries, r.entry); return `<polygon class="region ${epoch(e, year)}" points="${r.pts.map(p => p[0] * m.w + "," + p[1] * m.h).join(" ")}" style="--c:${r.color || (e ? entryColor(e) : "#e3c27a")}"/>`; }).join("");
  const labels = m.regions.filter(vis).map(r => { const e = byId(DB.entries, r.entry), c = regionCenter(r); return `<div class="region-label ${epoch(e, year)}" style="left:${c.x * m.w}px;top:${c.y * m.h}px"><span>${esc(e ? e.name : r.label || "")}</span></div>`; }).join("");
  const pins = m.pins.filter(vis).map(p => {
    const e = byId(DB.entries, p.entry);
    return `<div class="pin ${epoch(e, year)}" style="left:${p.x * m.w}px;top:${p.y * m.h}px;--c:${e ? entryColor(e) : "#e3c27a"}"><div class="pin-in"><span class="pin-dot">${e ? kindOf(e).icon : "•"}</span><span class="pin-label">${esc(e ? e.name : p.label || "")}</span></div></div>`;
  }).join("");
  const party = DB.party?.map === m.id ? `<div class="party-marker" style="left:${DB.party.x * m.w}px;top:${DB.party.y * m.h}px"><div class="pin-in"><svg viewBox="0 0 24 28" width="26" height="30"><path d="M12 1 L22 5 V13 C22 20 17 25 12 27 C7 25 2 20 2 13 V5 Z" fill="#5fc9c4" stroke="#0b0a12" stroke-width="2"/><path d="M12 6 V22 M7 11 H17" stroke="#0b0a12" stroke-width="2"/></svg></div></div>` : "";
  return `${mapBg(m)}${drawingHtml(m.draw, { w: m.w, h: m.h })}<svg class="map-svg" viewBox="0 0 ${m.w} ${m.h}" width="${m.w}" height="${m.h}">${regions}${MAP_OVERLAYS.map(f => f(m)).join("")}</svg>${labels}${pins}${party}`;
}

async function playerBoot() {
  document.body.classList.add("player-mode");
  document.title = "Moth: player screen";
  if (!loadDB()) DB.world.name = "Moth";
  await loadAssets();
  renderPlayer();
  // the other window saved: read the world (and any new images) again
  addEventListener("storage", async e => {
    if (e.key === DB_KEY) { loadDB(); IDX = null; await loadAssets(); renderPlayer(); }
    else if (e.key === SCREEN_KEY) renderPlayer();
  });
  addEventListener("resize", () => { clearTimeout(playerBoot.t); playerBoot.t = setTimeout(renderPlayer, 100); });
  const ping = () => screenChan?.postMessage({ alive: true });
  ping(); setInterval(ping, 2000);
  // one click (or F) on the TV makes it full screen
  const hint = document.createElement("div");
  hint.className = "ps-hint";
  hint.textContent = "Click to go full screen";
  document.body.append(hint);
  const fs = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); };
  document.addEventListener("click", fs);
  document.addEventListener("keydown", e => { if (e.key === "f" || e.key === "F") document.fullscreenElement ? document.exitFullscreen() : fs(); });
  document.addEventListener("fullscreenchange", () => { hint.hidden = !!document.fullscreenElement; setTimeout(renderPlayer, 150); });
}
