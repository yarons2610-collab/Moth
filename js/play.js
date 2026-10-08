"use strict";
/* ── play ── running the world at the table, for any game system: the party,
   sessions (prep, recap, who came, the route the party took), quests,
   encounters with an initiative tracker, dice and random tables. Any dice
   notation in any text (1d8+4, 4d6kh3) can be tapped to roll. */

const QUEST_STATUS = { open: ["Open", "#7ea8f8"], active: ["Active", "#e3c27a"], done: ["Done", "#81b29a"], failed: ["Failed", "#e07a5f"] };
const CONDITIONS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious", "Concentrating", "Bloodied"];
const DICE_LOG = [];

/* ── dice ── NdM, NdMkhK / klK (keep highest / lowest), +/- numbers */
function roll(expr, mode = "") {
  let src = String(expr).replace(/\s+/g, "").replace(/−/g, "-").toLowerCase();
  if (!src) return null;
  if (mode) src = src.replace(/(^|[+-])1?d20(?!\d|k)/, (m, s) => s + "2d20k" + (mode === "adv" ? "h" : "l") + "1");
  const terms = src.match(/[+-]?[^+-]+/g);
  if (!terms) return null;
  let total = 0;
  const parts = [];
  for (const t of terms) {
    const sign = t[0] === "-" ? -1 : 1, body = t.replace(/^[+-]/, "");
    let m;
    if ((m = body.match(/^(\d*)d(\d+|%)(?:k([hl])(\d+))?$/))) {
      const n = Math.min(+(m[1] || 1), 200), sides = m[2] === "%" ? 100 : +m[2];
      if (!sides) return null;
      const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
      let kept = rolls.map((v, i) => ({ v, i }));
      if (m[3]) { kept.sort((a, b) => m[3] === "h" ? b.v - a.v : a.v - b.v); kept = kept.slice(0, +m[4]); }
      const keep = new Set(kept.map(k => k.i));
      total += sign * kept.reduce((a, k) => a + k.v, 0);
      parts.push((sign < 0 ? "− " : parts.length ? "+ " : "") + "[" + rolls.map((v, i) => keep.has(i) ? v : `<s>${v}</s>`).join(", ") + "]");
    } else if (/^\d+$/.test(body)) { total += sign * +body; parts.push((sign < 0 ? "− " : "+ ") + body); }
    else return null;
  }
  return { expr: src, total, detail: parts.join(" ") };
}
function showRoll(expr, mode, label) {
  const r = roll(expr, mode);
  if (!r) return toast(`“${expr}” isn't dice I can roll`);
  DICE_LOG.unshift({ ...r, label, mode, at: Date.now() });
  DICE_LOG.length = Math.min(DICE_LOG.length, 40);
  toast(`🎲 ${label ? esc(label) + ": " : ""}<b>${r.total}</b> <small>${esc(r.expr)}${mode ? " (" + (mode === "adv" ? "advantage" : "disadvantage") + ")" : ""} ${r.detail}</small>`, { html: true, ms: 5000 });
  const log = $("#diceLog");
  if (log) log.innerHTML = diceLogHtml();
  return r;
}
const DICE_RE = /(^|[^\w&#;])(\d{0,3}d(?:\d{1,3}|%)(?:k[hl]\d+)?(?:\s?[+\-−]\s?\d+)*)(?![\w])/gi;
INLINE_HOOKS.push(html => html.replace(DICE_RE, (m, pre, d) => `${pre}<button class="roll" data-act="rollInline" data-dice="${d}" title="Roll ${d}">🎲${d}</button>`));
ACT.rollInline = el => showRoll(el.dataset.dice, "", el.closest(".page")?.querySelector("h2")?.textContent.trim());
const diceLogHtml = () => DICE_LOG.map(r => `<li><b>${r.total}</b> <small>${esc(r.label ? r.label + " · " : "")}${esc(r.expr)} ${r.detail}</small></li>`).join("") || `<li class="muted">No rolls yet.</li>`;

/* random tables: one row per line; "3× text" makes a row three times as likely */
function tableRows(t) {
  return String(t.rows || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(\d+)\s*[×x*]\s+(.*)$/);
    return m ? { w: +m[1], text: m[2] } : { w: 1, text: l };
  });
}
function rollTable(t) {
  const rows = tableRows(t), sum = rows.reduce((a, r) => a + r.w, 0);
  if (!sum) return null;
  let n = Math.random() * sum;
  const row = rows.find(r => (n -= r.w) < 0) || rows[rows.length - 1];
  // dice inside the result are rolled too: "2d6 goblins" → "7 goblins"
  return row.text.replace(/(^|[^\w])(\d{0,3}d\d{1,3}(?:k[hl]\d+)?(?:\s?[+\-]\s?\d+)*)(?![\w])/gi, (m, pre, d) => { const r = roll(d); return pre + (r ? r.total : d); });
}

/* ── link types ── */
linkType("ss", {
  list: () => DB.sessions,
  names: s => [s.title, "Session " + s.num],
  info: s => ({ title: s.title || "Session " + s.num, sub: "Session " + s.num, icon: "🎲", color: "#5fc9c4" }),
  href: s => "#/ss/" + s.id,
  text: s => s.prep + "\n" + s.recap,
  edges: s => [...(s.attendees || []).map(id => ["e", id, "at the table"]), ...(s.route || []).filter(r => r.place).map(r => ["e", r.place, "visited"])],
});
linkType("q", {
  list: () => DB.quests,
  names: q => [q.title],
  info: q => ({ title: q.title, sub: "Quest · " + QUEST_STATUS[q.status]?.[0], icon: "❖", color: QUEST_STATUS[q.status]?.[1] }),
  href: q => "#/q/" + q.id,
  text: q => q.body + "\n" + (q.reward || ""),
  edges: q => [q.giver && ["e", q.giver, "gave quest"], q.target && ["e", q.target, "quest leads here"]].filter(Boolean),
});
linkType("enc", {
  list: () => DB.encounters,
  names: e => [e.name],
  info: e => ({ title: e.name, sub: "Encounter", icon: "⚔", color: "#e07a5f" }),
  href: e => "#/enc/" + e.id,
  text: e => e.notes,
  edges: e => [e.place && ["e", e.place, "encounter here"], ...(e.foes || []).filter(f => f.entry).map(f => ["e", f.entry, "fights here"])].filter(Boolean),
});
linkType("tbl", {
  list: () => DB.tables,
  names: t => [t.name],
  info: t => ({ title: t.name, sub: "Random table", icon: "🎰", color: "#b9a6ff" }),
  href: t => "#/tbl/" + t.id,
  text: t => t.rows,
});

const playing = () => DB.sessions.find(s => s.playing) || null;
const sessionName = s => `Session ${s.num}${s.title ? ": " + s.title : ""}`;

TIMELINE_SOURCES.push(() => DB.sessions.filter(s => s.date).map(s => ({
  date: s.date, title: sessionName(s), href: "#/ss/" + s.id, icon: "🎲", color: "#5fc9c4", kind: "play",
  ids: [...(s.attendees || []), ...(s.route || []).map(r => r.place).filter(Boolean)], sub: s.recap,
})));

// the party moving on the map is logged to the session being played
on("partyMoved", p => {
  const s = playing();
  const place = byId(DB.entries, p.place);
  if (!s) return toast(`The party moved${place ? " to " + place.name : ""}. Mark a session as “now playing” to log its route.`);
  (s.route ||= []).push({ map: p.map, x: p.x, y: p.y, place: p.place || "", at: Date.now() });
  toast(`Logged to ${sessionName(s)}: ${place ? place.name : "somewhere on " + (byId(DB.maps, p.map)?.name || "the map")}`);
});
MAP_OVERLAYS.push(m => {
  const s = playing(), pts = (s?.route || []).filter(r => r.map === m.id);
  if (pts.length < 2) return "";
  return `<polyline class="route" points="${pts.map(r => r.x * m.w + "," + r.y * m.h).join(" ")}"/>`;
});

/* ── what an entry has to do with play: on its page and its map pin ── */
function playLinks(e) {
  const out = [];
  const qs = DB.quests.filter(q => q.giver === e.id || q.target === e.id);
  if (qs.length) out.push(`<h5>Quests</h5><div class="chips">${qs.map(q => chip("q", q, ` <small>${q.giver === e.id ? "gives" : "leads here"}</small>`)).join("")}</div>`);
  const enc = DB.encounters.filter(x => x.place === e.id || (x.foes || []).some(f => f.entry === e.id));
  if (enc.length) out.push(`<h5>Encounters</h5><div class="chips">${enc.map(x => chip("enc", x)).join("")}</div>`);
  const ss = DB.sessions.filter(s => (s.attendees || []).includes(e.id) || (s.route || []).some(r => r.place === e.id));
  if (ss.length) out.push(`<h5>Sessions</h5><div class="chips">${ss.map(s => chip("ss", s, (s.route || []).some(r => r.place === e.id) ? " <small>visited</small>" : "")).join("")}</div>`);
  return out.join("");
}
ENTITY_PANELS.push(e => { const h = playLinks(e); return h ? `<section class="panel in-play"><div class="panel-h"><h4>In play</h4></div>${h}</section>` : ""; });
MAP_PLACE_PANELS.push(e => playLinks(e));
ENTITY_DELETE_HOOKS.push(id => {
  for (const q of DB.quests) { if (q.giver === id) q.giver = ""; if (q.target === id) q.target = ""; }
  for (const x of DB.encounters) { if (x.place === id) x.place = ""; x.foes = (x.foes || []).filter(f => f.entry !== id || f.name); }
  for (const s of DB.sessions) { s.attendees = (s.attendees || []).filter(a => a !== id); for (const r of s.route || []) if (r.place === id) r.place = ""; }
});
NEW_FROM_LINK.quest = { label: "❖ Quest", make: title => questEditor({ id: uid(), title, status: "open", giver: "", target: "", body: "", reward: "" }, true) };

/* ── the Play tab ── */
const playTabs = on => `<div class="subtabs">${[["", "Party & dice"], ["sessions", "Sessions"], ["quests", "Quests"], ["encounters", "Encounters"], ["tables", "Tables"]]
  .map(([k, l]) => `<a class="${on === k ? "on" : ""}" href="#/play/${k}">${l}</a>`).join("")}${DB.combat ? `<a class="combat-link" href="#/combat">⚔ Combat, round ${DB.combat.round}</a>` : ""}</div>`;

addRoute("play", "play", (sub = "") => {
  if (sub === "sessions") return `<div class="page">${playTabs(sub)}<div class="page-h"><h2>Sessions</h2><div class="spacer"></div><button class="btn accent" data-act="newSession">+ Session</button></div>
    <div class="list">${DB.sessions.slice().sort((a, b) => b.num - a.num).map(s => `<a class="row-card" href="#/ss/${s.id}">
      <b>${esc(sessionName(s))}</b>${s.playing ? ` <span class="now-badge">Now playing</span>` : ""}
      <small>${[s.real, s.date && fmtDate(s.date), (s.attendees || []).length && plural(s.attendees.length, "player")].filter(Boolean).map(esc).join(" · ")}</small></a>`).join("") || empty("No sessions yet.")}</div></div>`;
  if (sub === "quests") return `<div class="page">${playTabs(sub)}<div class="page-h"><h2>Quests</h2><div class="spacer"></div><button class="btn accent" data-act="newQuest">+ Quest</button></div>
    ${Object.entries(QUEST_STATUS).map(([k, [l, c]]) => { const qs = DB.quests.filter(q => q.status === k); return qs.length ? `<h4 class="group-h" style="--c:${c}">${l}</h4><div class="list">${qs.map(q => `<a class="row-card" href="#/q/${q.id}"><b>❖ ${esc(q.title)}</b>
      <small>${[byId(DB.entries, q.giver) && "from " + byId(DB.entries, q.giver).name, byId(DB.entries, q.target) && "to " + byId(DB.entries, q.target).name].filter(Boolean).map(esc).join(" · ")}</small></a>`).join("")}</div>` : ""; }).join("") || empty("No quests yet.")}</div>`;
  if (sub === "encounters") return `<div class="page">${playTabs(sub)}<div class="page-h"><h2>Encounters</h2><div class="spacer"></div><button class="btn accent" data-act="newEncounter">+ Encounter</button></div>
    <div class="list">${DB.encounters.map(x => `<a class="row-card" href="#/enc/${x.id}"><b>⚔ ${esc(x.name)}</b><small>${esc(foeSummary(x))}${byId(DB.entries, x.place) ? " · at " + esc(byId(DB.entries, x.place).name) : ""}</small></a>`).join("") || empty("No encounters yet.")}</div></div>`;
  if (sub === "tables") return `<div class="page">${playTabs(sub)}<div class="page-h"><h2>Random tables</h2><div class="spacer"></div><button class="btn accent" data-act="newTable">+ Table</button></div>
    <div class="list">${DB.tables.map(t => `<div class="row-card"><a href="#/tbl/${t.id}"><b>🎰 ${esc(t.name)}</b></a><small>${plural(tableRows(t).length, "row")}</small><span class="spacer"></span><button class="btn small" data-act="rollTable" data-id="${t.id}">Roll</button></div>`).join("") || empty("No tables yet. One line per result; “3× text” makes a line three times as likely.")}</div></div>`;
  // party & dice
  const pcs = DB.entries.filter(e => e.pc);
  const s = playing();
  return `<div class="page">${playTabs("")}
    <div class="play-grid"><section class="panel"><div class="panel-h"><h4>Party</h4><button class="btn small" data-act="newPC">+ Player character</button></div>
      ${pcs.map(partyRow).join("") || empty("No player characters. Tick “Player character” under Game stats on a character.")}
      ${s ? `<p class="muted">Now playing: <a href="#/ss/${s.id}">${esc(sessionName(s))}</a></p>` : `<p class="muted">No session marked as now playing.</p>`}</section>
    <section class="panel dice-tray"><div class="panel-h"><h4>Dice</h4></div>
      <div class="dice-btns">${["d4", "d6", "d8", "d10", "d12", "d20", "d100"].map(d => `<button class="btn" data-act="trayRoll" data-dice="1${d}">${d}</button>`).join("")}</div>
      <div class="dice-expr"><input id="diceExpr" placeholder="e.g. 2d6+3 or 4d6kh3" data-links="no">
        <button class="btn accent" data-act="trayRoll">Roll</button><button class="btn" data-act="trayRoll" data-mode="adv">Adv</button><button class="btn" data-act="trayRoll" data-mode="dis">Dis</button></div>
      <ul class="dice-log" id="diceLog">${diceLogHtml()}</ul></section></div></div>`;
});
const hpOf = e => ({ hp: e.stats?.hp ?? e.stats?.maxhp ?? 0, max: e.stats?.maxhp ?? e.stats?.hp ?? 0 });
function hpBar(hp, max) {
  const f = max ? clamp(hp / max, 0, 1) : 0;
  return `<div class="hp-bar"><i style="width:${f * 100}%;background:${f > 0.5 ? "#81b29a" : f > 0.25 ? "#e3c27a" : "#e07a5f"}"></i><span>${hp}${max ? " / " + max : ""}</span></div>`;
}
function partyRow(e) {
  const { hp, max } = hpOf(e);
  return `<div class="party-row" style="--c:${entryColor(e)}"><a href="#/e/${e.id}"><b>${esc(e.name)}</b></a>
    <small>${e.stats?.ac != null ? `AC <span class="armor">${e.stats.ac}</span>` : ""} ${e.stats?.level ? "· Lv " + esc(e.stats.level) : ""}</small>
    ${hpBar(hp, max)}
    <div class="hp-btns"><button class="mini" data-act="pcHp" data-id="${e.id}" data-d="-5">−5</button><button class="mini" data-act="pcHp" data-id="${e.id}" data-d="-1">−1</button>
      <button class="mini" data-act="pcHp" data-id="${e.id}" data-d="1">+1</button><button class="mini" data-act="pcHp" data-id="${e.id}" data-d="5">+5</button>
      <button class="mini" data-act="pcHpAsk" data-id="${e.id}">±…</button></div></div>`;
}
function setPcHp(e, hp) {
  const { max } = hpOf(e);
  e.stats ||= {};
  e.stats.hp = max ? clamp(hp, 0, max) : Math.max(0, hp);
}
ACT.pcHp = el => { const e = byId(DB.entries, el.dataset.id); setPcHp(e, hpOf(e).hp + +el.dataset.d); commit(); };
ACT.pcHpAsk = el => {
  const e = byId(DB.entries, el.dataset.id);
  modal({ title: e.name + ": damage or healing", body: textField("Amount", "n", "", `type="number" min="0" autofocus`),
    buttons: [{ label: "Damage", cls: "danger", act: w => { setPcHp(e, hpOf(e).hp - (+formVals(w).n || 0)); commit(); } },
      { label: "Heal", cls: "accent", act: w => { setPcHp(e, hpOf(e).hp + (+formVals(w).n || 0)); commit(); } }] });
};
ACT.newPC = () => entryEditor(newEntry({ kind: "character", pc: true, stats: { hp: 10, maxhp: 10, ac: 12, init: 0 } }), true);
ACT.trayRoll = el => { const expr = el.dataset.dice || $("#diceExpr").value; if (expr.trim()) showRoll(expr, el.dataset.mode || ""); };
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "diceExpr") { e.preventDefault(); ACT.trayRoll(e.target); } });

/* ── sessions ── */
addRoute("ss", "play", id => {
  const s = byId(DB.sessions, id);
  if (!s) return `<div class="page">${empty("That session doesn't exist any more.")}</div>`;
  const route = (s.route || []).map((r, i) => {
    const p = byId(DB.entries, r.place), m = byId(DB.maps, r.map);
    return `<li>${p ? chip("e", p) : `<span class="muted">a spot on</span>`} ${m ? `<a href="#/map/${m.id}" class="muted">🗺 ${esc(m.name)}</a>` : ""}
      <button class="mini" data-act="routeDel" data-id="${s.id}" data-i="${i}" title="Remove">✕</button></li>`;
  }).join("");
  return `<div class="page narrow">${playTabs("sessions")}
    <div class="page-h"><div><h2>🎲 ${esc(sessionName(s))}</h2><div class="life">${esc([s.real, s.date && "In the world: " + fmtDate(s.date)].filter(Boolean).join(" · "))}</div></div><div class="spacer"></div>
      <button class="btn ${s.playing ? "" : "accent"}" data-act="sessionPlaying" data-id="${s.id}">${s.playing ? "Stop playing" : "▶ Now playing"}</button>
      <button class="btn" data-act="editSession" data-id="${s.id}">Edit</button><button class="btn ghost" data-act="deleteSession" data-id="${s.id}">🗑</button></div>
    ${(s.attendees || []).length ? `<div class="chips">At the table: ${s.attendees.map(a => chip("e", byId(DB.entries, a))).join("")}</div>` : ""}
    <section class="panel"><div class="panel-h"><h4>Prep</h4></div>${mdBlock(s.prep, empty("No prep notes."))}</section>
    <section class="panel"><div class="panel-h"><h4>Recap</h4></div>${mdBlock(s.recap, empty("No recap yet."))}</section>
    <section class="panel"><div class="panel-h"><h4>The party's route</h4></div>${route ? `<ol class="route-list">${route}</ol>` : empty(s.playing ? "Move the 🛡 party marker on the map and each stop is logged here." : "Mark this session as now playing, then move the 🛡 party marker on the map.")}</section>
  </div>`;
});
function sessionEditor(s, isNew) {
  modal({ title: isNew ? "New session" : "Edit session", wide: true,
    body: `<div class="row3">${textField("Number", "num", s.num, `type="number"`)}${textField("Title", "title", s.title, "autofocus")}${textField("Played on", "real", s.real, `type="date"`)}</div>
      ${dateField("In-world date", "date", s.date)}
      ${multiPick("At the table", "attendees", s.attendees || [], { kind: "character" })}
      ${areaField("Prep", "prep", s.prep, 6)}${areaField("Recap", "recap", s.recap, 6)}`,
    buttons: [{ label: "Cancel" }, { label: isNew ? "Create" : "Save", cls: "accent", act: w => {
      const v = formVals(w);
      if (v.date.trim() && !parseDate(v.date)) { toast("That in-world date isn't one I can read"); return false; }
      Object.assign(s, { num: +v.num || 1, title: v.title.trim(), real: v.real, date: parseDate(v.date), attendees: multiVals(v.attendees), prep: v.prep, recap: v.recap });
      if (isNew) DB.sessions.push(s);
      commit();
      if (isNew) go("#/ss/" + s.id);
    } }] });
}
ACT.newSession = () => {
  const last = DB.sessions.slice().sort((a, b) => b.num - a.num)[0];
  sessionEditor({ id: uid(), num: (last?.num || 0) + 1, title: "", real: new Date().toISOString().slice(0, 10), date: last?.date || NOW(), attendees: DB.entries.filter(e => e.pc).map(e => e.id), prep: "", recap: "", route: [] }, true);
};
ACT.editSession = el => sessionEditor(byId(DB.sessions, el.dataset.id), false);
ACT.deleteSession = async el => {
  const s = byId(DB.sessions, el.dataset.id);
  if (!await ask(`Delete ${sessionName(s)}?`, "You can undo this straight afterwards.")) return;
  withUndo("Session deleted", () => { DB.sessions = DB.sessions.filter(x => x !== s); });
  go("#/play/sessions");
};
ACT.sessionPlaying = el => { const s = byId(DB.sessions, el.dataset.id), was = s.playing; DB.sessions.forEach(x => { x.playing = false; }); s.playing = !was; commit(); };
ACT.routeDel = el => { const s = byId(DB.sessions, el.dataset.id); s.route.splice(+el.dataset.i, 1); commit(); };

/* ── quests ── */
addRoute("q", "play", id => {
  const q = byId(DB.quests, id);
  if (!q) return `<div class="page">${empty("That quest doesn't exist any more.")}</div>`;
  const [l, c] = QUEST_STATUS[q.status] || QUEST_STATUS.open;
  return `<div class="page narrow">${playTabs("quests")}
    <div class="page-h"><div><h2>❖ ${esc(q.title)}</h2><span class="status" style="--c:${c}">${l}</span></div><div class="spacer"></div>
      <button class="btn accent" data-act="editQuest" data-id="${q.id}">Edit</button><button class="btn ghost" data-act="deleteQuest" data-id="${q.id}">🗑</button></div>
    <div class="kvs">${q.giver ? `<div class="kv"><span>Given by</span><div>${chip("e", byId(DB.entries, q.giver))}</div></div>` : ""}
      ${q.target ? `<div class="kv"><span>Leads to</span><div>${chip("e", byId(DB.entries, q.target))}</div></div>` : ""}
      ${q.reward ? `<div class="kv"><span>Reward</span><div>${inline(q.reward)}</div></div>` : ""}</div>
    ${mdBlock(q.body)}</div>`;
});
function questEditor(q, isNew) {
  modal({ title: isNew ? "New quest" : "Edit quest", wide: true,
    body: `<div class="row2">${textField("Quest", "title", q.title, "autofocus")}${field("Status", `<select name="status">${Object.entries(QUEST_STATUS).map(([k, [l]]) => `<option value="${k}" ${k === q.status ? "selected" : ""}>${l}</option>`).join("")}</select>`)}</div>
      <div class="row2">${field("Given by", `<select name="giver">${entryOptions(q.giver)}</select>`)}${field("Leads to", `<select name="target">${entryOptions(q.target)}</select>`)}</div>
      ${textField("Reward", "reward", q.reward, "data-links")}${areaField("Details", "body", q.body, 6)}`,
    buttons: [{ label: "Cancel" }, { label: isNew ? "Create" : "Save", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.title.trim()) { toast("Give it a name"); return false; }
      Object.assign(q, { title: v.title.trim(), status: v.status, giver: v.giver, target: v.target, reward: v.reward, body: v.body });
      if (isNew) DB.quests.push(q);
      commit();
      if (isNew) go("#/q/" + q.id);
    } }] });
}
ACT.newQuest = () => questEditor({ id: uid(), title: "", status: "open", giver: "", target: "", body: "", reward: "" }, true);
ACT.editQuest = el => questEditor(byId(DB.quests, el.dataset.id), false);
ACT.deleteQuest = async el => {
  const q = byId(DB.quests, el.dataset.id);
  if (!await ask(`Delete “${q.title}”?`, "You can undo this straight afterwards.")) return;
  withUndo("Quest deleted", () => { DB.quests = DB.quests.filter(x => x !== q); });
  go("#/play/quests");
};

/* ── encounters ── foes come from codex creatures (with their stats) or are quick foes */
const foeName = f => byId(DB.entries, f.entry)?.name || f.name || "Foe";
const foeSummary = x => (x.foes || []).map(f => (f.count > 1 ? f.count + "× " : "") + foeName(f)).join(", ") || "No foes yet";
addRoute("enc", "play", id => {
  const x = byId(DB.encounters, id);
  if (!x) return `<div class="page">${empty("That encounter doesn't exist any more.")}</div>`;
  return [`<div class="page">${playTabs("encounters")}
    <div class="page-h"><div><h2>⚔ ${esc(x.name)}</h2>${x.place ? `<div>at ${chip("e", byId(DB.entries, x.place))}</div>` : ""}</div><div class="spacer"></div>
      <button class="btn accent" data-act="runEncounter" data-id="${x.id}">▶ Run</button>
      <button class="btn" data-act="editEncounter" data-id="${x.id}">Edit</button><button class="btn ghost" data-act="deleteEncounter" data-id="${x.id}">🗑</button></div>
    ${battlePanel(x)}
    ${musicPanel(x)}
    <section class="panel"><div class="panel-h"><h4>Foes</h4><button class="btn small" data-act="addFoe" data-id="${x.id}">+ Foe</button></div>
      <table class="foes"><tr><th>Foe</th><th>×</th><th>HP</th><th>AC</th><th>Init</th><th></th></tr>
      ${(x.foes || []).map((f, i) => { const e = byId(DB.entries, f.entry), st = e?.stats || {}, sz = f.size || +st.size || 1; return `<tr><td>${e ? chip("e", e) : esc(f.name)}${sz !== 1 ? ` <small class="muted">${TOKEN_SIZES[sz] || sz + " squares"}</small>` : ""}</td><td>${f.count || 1}</td>
        <td>${esc(f.hp ?? st.maxhp ?? st.hp ?? "—")}</td><td>${esc(f.ac ?? st.ac ?? "—")}</td><td>${esc(f.init ?? st.init ?? 0)}</td>
        <td><button class="mini" data-act="delFoe" data-id="${x.id}" data-i="${i}">✕</button></td></tr>`; }).join("")}</table></section>
    ${mdBlock(x.notes)}</div>`, main => wireBattle(main, x)];
});
function encounterEditor(x, isNew) {
  modal({ title: isNew ? "New encounter" : "Edit encounter",
    body: `${textField("Name", "name", x.name, "autofocus")}${field("Where", `<select name="place">${entryOptions(x.place, { kind: "place" })}</select>`)}${areaField("Notes (tactics, loot, 2d6 rolls…)", "notes", x.notes, 5)}`,
    buttons: [{ label: "Cancel" }, { label: isNew ? "Create" : "Save", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.name.trim()) { toast("Give it a name"); return false; }
      Object.assign(x, { name: v.name.trim(), place: v.place, notes: v.notes });
      if (isNew) DB.encounters.push(x);
      commit();
      if (isNew) go("#/enc/" + x.id);
    } }] });
}
ACT.newEncounter = () => encounterEditor({ id: uid(), name: "", place: "", foes: [], notes: "" }, true);
ACT.editEncounter = el => encounterEditor(byId(DB.encounters, el.dataset.id), false);
ACT.deleteEncounter = async el => {
  const x = byId(DB.encounters, el.dataset.id);
  if (!await ask(`Delete “${x.name}”?`, "You can undo this straight afterwards.")) return;
  withUndo("Encounter deleted", () => { DB.encounters = DB.encounters.filter(y => y !== x); });
  go("#/play/encounters");
};
ACT.addFoe = el => {
  const x = byId(DB.encounters, el.dataset.id);
  modal({ title: "Add foes",
    body: `${field("From the codex", `<select name="entry">${entryOptions("", { blank: "— a quick foe instead —" })}</select>`)}
      ${textField("…or a quick foe's name", "name", "")}
      <div class="row3">${textField("How many", "count", 1, `type="number" min="1"`)}${textField("HP (blank: from stats)", "hp", "", `type="number"`)}${textField("AC", "ac", "", `type="number"`)}</div>
      <div class="row2">${textField("Initiative bonus", "init", "", `type="number"`)}${field("Token size", `<select name="size"><option value="">From its stats</option>${Object.entries(TOKEN_SIZES).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>`)}</div>`,
    buttons: [{ label: "Cancel" }, { label: "Add", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.entry && !v.name.trim()) { toast("Pick a creature or name a foe"); return false; }
      const f = { id: uid(), entry: v.entry, name: v.entry ? "" : v.name.trim(), count: Math.max(1, +v.count || 1) };
      for (const k of ["hp", "ac", "init", "size"]) if (v[k] !== "") f[k] = +v[k];
      (x.foes ||= []).push(f);
      commit();
    } }] });
};
ACT.delFoe = el => { const x = byId(DB.encounters, el.dataset.id); x.foes.splice(+el.dataset.i, 1); commit(); };

/* ── combat ── */
ACT.runEncounter = el => {
  const x = byId(DB.encounters, el.dataset.id);
  if (DB.combat && !confirm("A fight is already running. Replace it?")) return;
  const pcs = DB.entries.filter(e => e.pc);
  modal({ title: "Roll initiative",
    body: `<p class="muted">Monsters roll their own. Enter what the players rolled, or leave a box empty to roll for them.</p>
      ${pcs.map(p => textField(esc(p.name) + ` <small>(${(p.stats?.init ?? 0) >= 0 ? "+" : ""}${p.stats?.init ?? 0})</small>`, "pc_" + p.id, "", `type="number" placeholder="roll for me"`)).join("") || empty("No player characters in the party.")}`,
    buttons: [{ label: "Cancel" }, { label: "Fight!", cls: "accent", act: w => {
      const v = formVals(w), list = [];
      for (const p of pcs) {
        const { hp, max } = hpOf(p), bonus = +(p.stats?.init || 0);
        list.push({ id: uid(), name: p.name, entry: p.id, pc: true, hp, max, ac: p.stats?.ac ?? "", init: v["pc_" + p.id] !== "" ? +v["pc_" + p.id] : roll("1d20").total + bonus, mod: bonus, conds: [], tok: "pc:" + p.id, size: 1 });
      }
      for (const f of x.foes || []) {
        const e = byId(DB.entries, f.entry), st = e?.stats || {};
        const n = f.count || 1, base = foeName(f);
        const hp = f.hp ?? st.maxhp ?? st.hp ?? 10, bonus = +(f.init ?? st.init ?? 0);
        const size = f.size || +st.size || 1;
        for (let i = 0; i < n; i++) list.push({ id: uid(), name: n > 1 ? `${base} ${i + 1}` : base, entry: f.entry || "", pc: false, hp, max: hp, ac: f.ac ?? st.ac ?? "", init: roll("1d20").total + bonus, mod: bonus, conds: [], tok: `f:${foeId(f)}:${i}`, size });
      }
      list.sort((a, b) => b.init - a.init || b.mod - a.mod || (a.pc ? -1 : 1));
      DB.combat = { enc: x.id, round: 1, turn: 0, list, log: [`Combat begins: ${x.name}. Initiative: ${list.map(c => `${c.name} ${c.init}`).join(", ")}.`] };
      save();
      if (x.music?.length && musicEmbed(x.music[0].url)) playMusic(x, 0);
      if (x.battle && screenOpen()) showOnScreen({ kind: "battle", id: x.id });
      go("#/combat");
    } }] });
};
addRoute("combat", "play", () => {
  const c = DB.combat;
  if (!c) return `<div class="page">${playTabs("")}${empty("No fight is running. Open an encounter and press Run.")}</div>`;
  const x = byId(DB.encounters, c.enc), cur = c.list[c.turn];
  return [`<div class="page ${x?.battle ? "wide" : ""}">${playTabs("")}
    <div class="page-h"><div><h2>⚔ ${esc(x?.name || "Combat")}</h2><div class="life">Round ${c.round}${cur ? ` · ${esc(cur.name)}'s turn` : ""}</div></div><div class="spacer"></div>
      <button class="btn" data-act="turn" data-d="-1">← Back</button><button class="btn accent" data-act="turn" data-d="1">Next turn →</button>
      <button class="btn" data-act="addCombatant">+ Add</button><button class="btn danger" data-act="endCombat">End combat</button></div>
    <div class="${x?.battle ? "combat-grid" : ""}">${x?.battle ? `<div>${battlePanel(x)}</div>` : ""}<div>
    <div class="init-list">${c.list.map((k, i) => `<div class="init-row ${i === c.turn ? "cur" : ""} ${k.hp <= 0 ? "down" : ""} ${k.pc ? "pc" : ""} ${BATTLEV.sel && BATTLEV.sel === (k.tok || "c:" + k.id) ? "sel" : ""}" data-tok="${esc(k.tok || "c:" + k.id)}">
      <span class="init-n" data-act="setInit" data-i="${i}" title="Change initiative">${k.init}</span>
      <div class="init-who"><b>${k.entry ? `<a href="#/e/${k.entry}">${esc(k.name)}</a>` : esc(k.name)}</b>${k.ac !== "" ? ` <span class="armor">AC ${esc(k.ac)}</span>` : ""}
        <div class="conds">${k.conds.map((cd, j) => `<span class="cond">${esc(cd)} <button class="mini" data-act="condDel" data-i="${i}" data-j="${j}">✕</button></span>`).join("")}
          <select data-change="condAdd" data-i="${i}"><option value="">+ condition</option>${CONDITIONS.map(cd => `<option>${cd}</option>`).join("")}<option value="__other">Other…</option></select></div></div>
      ${hpBar(k.hp, k.max)}
      <div class="hp-btns"><input type="number" class="hp-amt" id="amt${i}" placeholder="n" min="0">
        <button class="mini dmg" data-act="cHp" data-i="${i}" data-s="-1">Hit</button><button class="mini" data-act="cHp" data-i="${i}" data-s="1">Heal</button>
        <button class="mini" data-act="cRemove" data-i="${i}" title="Remove from the fight">✕</button></div>
    </div>`).join("")}</div>
    ${x?.music?.length ? musicPanel(x) : ""}
    <section class="panel"><div class="panel-h"><h4>Log</h4></div><ol class="combat-log">${c.log.slice().reverse().map(l => `<li>${esc(l)}</li>`).join("")}</ol></section></div></div></div>`, main => x && wireBattle(main, x)];
});
const clog = msg => DB.combat.log.push(`R${DB.combat.round}: ${msg}`);
ACT.turn = el => {
  const c = DB.combat, d = +el.dataset.d, n = c.list.length;
  if (!n) return;
  let t = c.turn;
  for (let i = 0; i < n; i++) {
    t += d;
    if (t >= n) { t = 0; c.round++; clog(`Round ${c.round} begins.`); }
    if (t < 0) { t = n - 1; c.round = Math.max(1, c.round - 1); }
    if (c.list[t].hp > 0 || c.list[t].pc || d < 0) break;
  }
  c.turn = t;
  commit();
};
ACT.cHp = el => {
  const c = DB.combat, k = c.list[+el.dataset.i], n = +$("#amt" + el.dataset.i).value || 0;
  if (!n) return toast("Type an amount first");
  const before = k.hp;
  k.hp = clamp(k.hp + n * +el.dataset.s, 0, k.max || Infinity);
  clog(+el.dataset.s < 0 ? `${k.name} takes ${n} damage (${k.hp} left)${k.hp === 0 && before > 0 ? " and goes down" : ""}.` : `${k.name} heals ${n} (${k.hp}).`);
  if (k.pc) { const e = byId(DB.entries, k.entry); if (e) setPcHp(e, k.hp); }
  commit();
};
ACT.cRemove = el => { const c = DB.combat, i = +el.dataset.i; clog(`${c.list[i].name} leaves the fight.`); c.list.splice(i, 1); if (c.turn >= c.list.length) c.turn = 0; else if (i < c.turn) c.turn--; commit(); };
ACT.condAdd = el => {
  let v = el.value;
  if (v === "__other") v = prompt("Condition") || "";
  if (!v) return;
  const k = DB.combat.list[+el.dataset.i];
  k.conds.push(v); clog(`${k.name} is ${v.toLowerCase()}.`); commit();
};
ACT.condDel = el => { const k = DB.combat.list[+el.dataset.i], [cd] = k.conds.splice(+el.dataset.j, 1); clog(`${k.name} is no longer ${cd.toLowerCase()}.`); commit(); };
ACT.setInit = el => {
  const c = DB.combat, k = c.list[+el.dataset.i], v = prompt(`Initiative for ${k.name}`, k.init);
  if (v == null || isNaN(+v)) return;
  const cur = c.list[c.turn];
  k.init = +v;
  c.list.sort((a, b) => b.init - a.init || b.mod - a.mod);
  c.turn = c.list.indexOf(cur);
  commit();
};
ACT.addCombatant = () => modal({ title: "Add to the fight",
  body: `${field("From the codex", `<select name="entry">${entryOptions("")}</select>`)}${textField("…or a name", "name", "")}
    <div class="row3">${textField("HP", "hp", "", `type="number"`)}${textField("AC", "ac", "", `type="number"`)}${textField("Initiative (blank rolls)", "init", "", `type="number"`)}</div>`,
  buttons: [{ label: "Cancel" }, { label: "Add", cls: "accent", act: w => {
    const v = formVals(w), e = byId(DB.entries, v.entry), st = e?.stats || {};
    if (!e && !v.name.trim()) { toast("Pick someone or give a name"); return false; }
    const hp = v.hp !== "" ? +v.hp : e?.pc ? hpOf(e).hp : st.maxhp ?? st.hp ?? 10;
    const k = { id: uid(), name: e?.name || v.name.trim(), entry: e?.id || "", pc: !!e?.pc, hp, max: e?.pc ? hpOf(e).max : (v.hp !== "" ? +v.hp : st.maxhp ?? hp), ac: v.ac !== "" ? +v.ac : st.ac ?? "",
      init: v.init !== "" ? +v.init : roll("1d20").total + +(st.init || 0), mod: +(st.init || 0), conds: [], size: +st.size || 1 };
    k.tok = e?.pc ? "pc:" + e.id : "c:" + k.id;
    const c = DB.combat, cur = c.list[c.turn];
    c.list.push(k); c.list.sort((a, b) => b.init - a.init || b.mod - a.mod); c.turn = c.list.indexOf(cur);
    clog(`${k.name} joins the fight (initiative ${k.init}).`);
    commit();
  } }] });
ACT.endCombat = () => {
  const c = DB.combat, x = byId(DB.encounters, c.enc);
  const fell = c.list.filter(k => k.hp <= 0).map(k => k.name), stood = c.list.filter(k => k.pc && k.hp > 0).map(k => `${k.name} (${k.hp}/${k.max})`);
  const summary = `Fought ${x?.name || "a battle"}${x?.place && byId(DB.entries, x.place) ? ` at [[${byId(DB.entries, x.place).name}]]` : ""} over ${plural(c.round, "round")}.` +
    (fell.length ? ` Fell: ${fell.join(", ")}.` : "") + (stood.length ? ` Still standing: ${stood.join(", ")}.` : "");
  const s = playing() || DB.sessions.slice().sort((a, b) => b.num - a.num)[0];
  modal({ title: "End combat",
    body: `${areaField("Summary", "summary", summary, 4)}
      ${DB.sessions.length ? field("Add it to the recap of", `<select name="session"><option value="">— don't add it —</option>${DB.sessions.slice().sort((a, b) => b.num - a.num).map(ss => `<option value="${ss.id}" ${ss === s ? "selected" : ""}>${esc(sessionName(ss))}</option>`).join("")}</select>`) : ""}`,
    buttons: [{ label: "Keep fighting" }, { label: "End combat", cls: "accent", act: w => {
      const v = formVals(w), ss = byId(DB.sessions, v.session);
      if (ss) ss.recap = (ss.recap ? ss.recap.trimEnd() + "\n\n" : "") + v.summary;
      DB.combat = null;
      commit();
      go(ss ? "#/ss/" + ss.id : "#/play/encounters");
    } }] });
};

/* ── random tables ── */
addRoute("tbl", "play", id => {
  const t = byId(DB.tables, id);
  if (!t) return `<div class="page">${empty("That table doesn't exist any more.")}</div>`;
  const rows = tableRows(t), sum = rows.reduce((a, r) => a + r.w, 0);
  return `<div class="page narrow">${playTabs("tables")}
    <div class="page-h"><h2>🎰 ${esc(t.name)}</h2><div class="spacer"></div><button class="btn accent" data-act="rollTable" data-id="${t.id}">Roll</button>
      <button class="btn" data-act="editTable" data-id="${t.id}">Edit</button><button class="btn ghost" data-act="deleteTable" data-id="${t.id}">🗑</button></div>
    <ul class="tbl-results" id="tblResults"></ul>
    <table class="foes"><tr><th>Chance</th><th>Result</th></tr>${rows.map(r => `<tr><td>${Math.round(r.w / sum * 100)}%</td><td>${inline(r.text)}</td></tr>`).join("")}</table></div>`;
});
ACT.rollTable = el => {
  const t = byId(DB.tables, el.dataset.id), r = rollTable(t);
  if (r == null) return toast("That table has no rows");
  const list = $("#tblResults");
  if (list) list.insertAdjacentHTML("afterbegin", `<li>${inline(r)}</li>`);
  toast(`🎰 ${esc(t.name)}: <b>${inline(r)}</b>`, { html: true, ms: 6000 });
};
function tableEditor(t, isNew) {
  modal({ title: isNew ? "New random table" : "Edit table", wide: true,
    body: `${textField("Name", "name", t.name, "autofocus")}${areaField("One result per line. “3× text” makes it three times as likely; dice like 2d6 in a result are rolled too.", "rows", t.rows, 12)}`,
    buttons: [{ label: "Cancel" }, { label: isNew ? "Create" : "Save", cls: "accent", act: w => {
      const v = formVals(w);
      if (!v.name.trim()) { toast("Give it a name"); return false; }
      Object.assign(t, { name: v.name.trim(), rows: v.rows });
      if (isNew) DB.tables.push(t);
      commit();
      if (isNew) go("#/tbl/" + t.id);
    } }] });
}
ACT.newTable = () => tableEditor({ id: uid(), name: "", rows: "" }, true);
ACT.editTable = el => tableEditor(byId(DB.tables, el.dataset.id), false);
ACT.deleteTable = async el => {
  const t = byId(DB.tables, el.dataset.id);
  if (!await ask(`Delete “${t.name}”?`, "You can undo this straight afterwards.")) return;
  withUndo("Table deleted", () => { DB.tables = DB.tables.filter(x => x !== t); });
  go("#/play/tables");
};
