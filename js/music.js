"use strict";
/* ── music ── playlists linked to encounters: Spotify, YouTube, SoundCloud
   and Apple Music links play in a small dock that stays put while you move
   around the app; anything else opens in a new tab. Running an encounter
   starts its first playlist. The music plays from this window, through
   whatever speakers the laptop is using (often the TV's, over HDMI). */

const MUSIC = { now: null, enc: null, open: true };

// a link → how to embed it (null: it can only be opened)
function musicEmbed(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return null; }
  const h = u.hostname.replace(/^(www|m)\./, "");
  if (h === "open.spotify.com") {
    const m = u.pathname.match(/(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/);
    return m && { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, h: 152, kind: "Spotify" };
  }
  if (h === "youtube.com" || h === "music.youtube.com" || h === "youtu.be") {
    const list = u.searchParams.get("list"), v = h === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
    if (v) return { src: `https://www.youtube.com/embed/${v}?autoplay=1${list ? "&list=" + list : ""}`, h: 190, kind: "YouTube" };
    if (list) return { src: `https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1`, h: 190, kind: "YouTube" };
    return null;
  }
  if (h === "soundcloud.com") return { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.href)}&auto_play=true&visual=false`, h: 166, kind: "SoundCloud" };
  if (h === "music.apple.com") return { src: u.href.replace("//music.apple.com", "//embed.music.apple.com"), h: 175, kind: "Apple Music" };
  return null;
}
// "Battle | https://…" or just a link, one per line
function parseMusic(text) {
  return String(text || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(.*?)\s*\|\s*(https?:\/\/\S+)$/);
    return m ? { title: m[1], url: m[2] } : { title: "", url: l };
  }).filter(t => /^https?:\/\//.test(t.url));
}
const musicText = list => (list || []).map(t => (t.title ? t.title + " | " : "") + t.url).join("\n");
const trackName = (t, i) => t.title || (musicEmbed(t.url)?.kind ? `${musicEmbed(t.url).kind} ${i + 1}` : "Link " + (i + 1));

function musicPanel(x) {
  const list = x.music || [];
  return `<section class="panel"><div class="panel-h"><h4>Music</h4><button class="btn small" data-act="editMusic" data-id="${x.id}">${list.length ? "Edit" : "+ Add"}</button></div>
    ${list.length ? `<div class="btn-row">${list.map((t, i) => `<button class="btn ${MUSIC.now?.url === t.url ? "live" : ""}" data-act="playTrack" data-id="${x.id}" data-i="${i}">${musicEmbed(t.url) ? "▶" : "↗"} ${esc(trackName(t, i))}</button>`).join("")}</div>`
      : empty("No music yet. Link a Spotify or YouTube playlist (or SoundCloud, Apple Music) and it plays when you run the encounter.")}</section>`;
}
ACT.editMusic = el => {
  const x = byId(DB.encounters, el.dataset.id);
  modal({ title: "Music for " + x.name,
    body: areaField("One link per line. Give it a name first if you like: <i>Battle | https://open.spotify.com/playlist/…</i>", "music", musicText(x.music), 5, `placeholder="https://open.spotify.com/playlist/…"`) +
      `<p class="muted small">Spotify plays whole tracks when you're signed in to Spotify in this browser, otherwise 30-second previews. YouTube, SoundCloud and Apple Music play in full (Apple Music needs you signed in). The first link plays when you run the encounter.</p>`,
    buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => { x.music = parseMusic(formVals(w).music); commit(); } }] });
};
ACT.playTrack = el => playMusic(byId(DB.encounters, el.dataset.id), +el.dataset.i);
function playMusic(x, i = 0) {
  const t = x?.music?.[i];
  if (!t) return;
  if (!musicEmbed(t.url)) { window.open(t.url, "_blank", "noopener"); return; }
  MUSIC.now = t; MUSIC.enc = x.id; MUSIC.open = true;
  drawDock();
  if (CUR.prefix === "enc" || CUR.prefix === "combat") rerender();
}
function drawDock() {
  let d = $("#musicDock");
  if (!MUSIC.now) { d?.remove(); return; }
  if (!d) { d = document.createElement("div"); d.id = "musicDock"; document.body.append(d); }
  const x = byId(DB.encounters, MUSIC.enc), em = musicEmbed(MUSIC.now.url), list = x?.music || [];
  d.className = "music-dock " + (MUSIC.open ? "" : "folded");
  // the player itself is only replaced when the track changes, so the music
  // keeps going while you fold the dock or move around the app
  if (d.dataset.src !== em.src) {
    d.dataset.src = em.src;
    d.innerHTML = `<div class="md-head"><span>♫ <b id="mdTitle"></b></span><span class="md-tools"></span></div>
      <iframe src="${em.src}" height="${em.h}" allow="autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture" loading="eager"></iframe>`;
  }
  $("#mdTitle", d).textContent = trackName(MUSIC.now, list.findIndex(t => t.url === MUSIC.now.url)) + (x ? " · " + x.name : "");
  $(".md-tools", d).innerHTML = `${list.length > 1 ? `<select data-change="dockTrack">${list.map((t, i) => `<option value="${i}" ${t.url === MUSIC.now.url ? "selected" : ""}>${esc(trackName(t, i))}</option>`).join("")}</select>` : ""}
    <button class="mini" data-act="dockFold" title="${MUSIC.open ? "Fold" : "Unfold"}">${MUSIC.open ? "▾" : "▴"}</button><button class="mini" data-act="dockStop" title="Stop">✕</button>`;
}
ACT.dockFold = () => { MUSIC.open = !MUSIC.open; drawDock(); };
ACT.dockStop = () => { MUSIC.now = null; drawDock(); if (CUR.prefix === "enc" || CUR.prefix === "combat") rerender(); };
ACT.dockTrack = el => playMusic(byId(DB.encounters, MUSIC.enc), +el.value);
