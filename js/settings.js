"use strict";
/* ── settings ── the world's name and calendar, kinds of codex entry and their
   fields, sync, export and import. */


addRoute("settings", "", () => {
  const w = DB.world;
  return [`<div class="page narrow settings">
    <h2>Settings</h2>
    <section class="panel"><div class="panel-h"><h4>World</h4></div>
      ${textField("Name", "worldName", w.name, `data-change="setWorldName"`)}
      <div class="kv"><span>Now</span><div>${esc(fmtDate(NOW()))} <button class="btn small" data-act="setNow">Change</button></div></div></section>

    <section class="panel"><div class="panel-h"><h4>Calendar</h4><button class="btn small" data-act="shiftDates">Shift dates…</button><button class="btn small" data-act="editCalendar">Edit</button></div>
      <p class="muted">Dates are written the world's way, e.g. <b>${esc(fmtDate({ y: NOW().y, m: w.months.length ? 1 : undefined, d: w.months.length ? 1 : undefined }))}</b>.</p>
      <div class="kvs"><div class="kv"><span>Eras</span><div>${eras().map(e => `${esc(e.name)}${e.abbr ? ` (${esc(e.abbr)})` : ""} <small class="muted">${countsDown(e) ? `counts down to ${esc(eraNext(e).name)}` : `from year ${e.start}`}</small>`).join("<br>")}</div></div>
        <div class="kv"><span>Months</span><div>${w.months.length ? w.months.map(esc).join(", ") : `<span class="muted">None: dates are years only, or month numbers</span>`}</div></div></div></section>

    <section class="panel"><div class="panel-h"><h4>Kinds of entry</h4><button class="btn small" data-act="editKind" data-id="">+ Kind</button></div>
      <ul class="kind-list">${DB.kinds.map(k => `<li style="--c:${k.color}"><span class="k-ic">${k.icon}</span><b>${esc(k.name)}</b>
        <small class="muted">${k.fields.length ? `${plural(k.fields.length, "field")}${fieldSections(k.fields).length > 1 ? ` in ${fieldSections(k.fields).length} sections` : ""}` : "no fields"}</small><span class="spacer"></span>
        <button class="btn small" data-act="editKind" data-id="${k.id}">Edit</button></li>`).join("")}</ul></section>

    <section class="panel"><div class="panel-h"><h4>Sync between devices</h4><span class="sync-state ${SYNC.state}">${esc(syncLabel())}</span></div>
      ${syncOn() ? syncConnectedHtml() : syncSetupHtml()}</section>

    <section class="panel"><div class="panel-h"><h4>Space used</h4></div><div id="storageInfo" class="muted">Measuring…</div></section>

    <section class="panel"><div class="panel-h"><h4>Your data</h4></div>
      <p class="muted"><b>Export to read</b> makes a Word document of the whole world (the codex, the timeline, the story) to read, print or share. <b>Export</b> makes one .json file with the whole world and its images, to keep as a backup or bring back into Moth.</p>
      <div class="btn-row"><button class="btn" data-act="exportReadable">Export to read (Word)</button><button class="btn" data-act="exportWorld">Export (backup)</button><button class="btn" data-act="importWorld">Import…</button>
        <button class="btn" data-act="loadSample">Load the sample world</button><button class="btn danger" data-act="resetWorld">Start an empty world</button></div></section>
    <p class="muted small">Moth: a play on myth. Works offline, and can be installed from the browser's menu (Add to Home Screen). This is version <b id="appVersion">${APP_VERSION}</b>.</p>
  </div>`, showStorage];
});

/* How big the world is, against the limits that matter:
   - the world's text lives in localStorage, which browsers cap at about 5 MB;
   - images live in IndexedDB, limited only by the device's free space;
   - a Gist lists at most 300 files, so sync tops out a little under 300 images. */
const LS_LIMIT = 5e6, GIST_FILES = 300;
const mb = n => (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + " MB";
function bar(frac) { return `<div class="storage-bar"><i class="${frac > 0.75 ? "warn" : ""}" style="width:${clamp(frac, 0.005, 1) * 100}%"></i></div>`; }
async function showStorage(main) {
  const box = $("#storageInfo", main);
  if (!box) return;
  const text = JSON.stringify(DB).length * 2; // localStorage counts UTF-16 characters
  const imgs = await assetSizes().catch(() => ({ bytes: 0, n: 0 }));
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const kept = await navigator.storage?.persisted?.().catch(() => false);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const lines = [
    `<div><b>World text</b> ${mb(text)} of about ${mb(LS_LIMIT)}${bar(text / LS_LIMIT)}</div>`,
    `<div><b>Images</b> ${plural(imgs.n, "image")}, ${mb(imgs.bytes)} (limited by the device's free space${est?.quota ? `: ${mb(est.quota)} available to Moth` : ""})</div>`,
  ];
  if (syncOn() && backendName() === "gist") lines.push(`<div style="margin-top:8px"><b>Sync</b> ${imgs.n} of about ${GIST_FILES - 1} pictures a Gist can hold${bar(imgs.n / (GIST_FILES - 1))}${imgs.n > 150 ? `<span class="small">Moving to a repository (above) removes this limit.</span>` : ""}</div>`);
  if (syncOn() && backendName() === "repo") lines.push(`<div style="margin-top:8px"><b>Sync</b> through a repository: no file limit. GitHub is happy up to about 1 GB; this world is about ${mb(text / 2 + imgs.bytes)}.</div>`);
  if (!kept) lines.push(`<p class="small">${standalone ? "The browser hasn't promised to keep Moth's data." : "Install Moth (Add to Home Screen) so the browser keeps its data: Safari can clear the data of websites you haven't opened for a week, but not of installed apps."} Export now and then, or turn on sync, so there's always a copy.</p>`);
  box.innerHTML = lines.join("");
  box.classList.remove("muted");
}
function syncConnectedHtml() {
  const be = backend(), where = be.where();
  const name = backendName() === "repo" ? `the private repository <b>${esc(ls.get("repo"))}</b>` : "a private GitHub Gist";
  return `<p>Syncing through ${name}${where ? ` (<a href="${where}" target="_blank" rel="noopener">open it</a>)` : ""}.</p>
    <div class="btn-row"><button class="btn" data-act="syncNow">Sync now</button><button class="btn ghost" data-act="syncOff">Stop syncing on this device</button></div>
    <p class="muted small" style="margin-top:10px">Stuck, or this device has the wrong world? Replace this device's copy with the one on GitHub (what's here is downloaded as a backup file first).</p>
    <div class="btn-row"><button class="btn" data-act="syncTakeRemote">Replace this device's copy with GitHub's</button></div>
    ${backendName() === "gist" ? `<div class="move-box"><b>Move to a GitHub repository</b>
      <p class="muted small">A Gist holds about 300 files, and every picture is one. A private repository has no such limit, stores pictures as real image files (a quarter smaller) and saves each sync in one go.
        Your other devices follow the move by themselves; they just need a token that can use the repository (the steps are below the button).</p>
      <div class="row-inline"><input id="moveRepo" value="moth-world" placeholder="moth-world"><button class="btn accent" data-act="syncMove">Move</button></div>
      ${tokenHelp("repo")}</div>` : ""}`;
}
function syncSetupHtml() {
  return `<p class="muted">Your world lives in this browser. To have it on your phone and your computer, Moth keeps a copy on GitHub (free) and each device syncs with it. Do this once on each device, with the same token.</p>
    <div class="sync-choice">
      <label class="check"><input type="radio" name="syncKind" value="repo" checked data-change="syncKind"> <span><b>A private repository</b> (recommended): no real limit on maps and pictures</span></label>
      <label class="check"><input type="radio" name="syncKind" value="gist" data-change="syncKind"> <span><b>A Gist</b>: fine for a world with up to about 300 pictures</span></label>
    </div>
    <div id="syncHelp">${tokenHelp("repo")}</div>
    <div class="row-inline" id="repoRow"><label class="inline">Repository</label><input id="repoName" value="moth-world" placeholder="moth-world"></div>
    <div class="row-inline"><input id="ghToken" type="password" placeholder="Paste the token (github_pat_… or ghp_…)" autocomplete="off"><button class="btn accent" data-act="syncConnect">Connect</button></div>`;
}
function tokenHelp(kind) {
  if (kind === "gist") return `<p class="small">Make a token with only the <b>gist</b> permission (<a href="https://github.com/settings/tokens/new?scopes=gist&description=Moth" target="_blank" rel="noopener">make one here</a>), and paste it below. It's stored only on this device.</p>`;
  return `<ol class="small token-steps">
    <li>Easiest: <a href="https://github.com/settings/tokens/new?scopes=repo&description=Moth" target="_blank" rel="noopener">make a token with the “repo” permission</a>. Moth creates the private repository for you. (That token can reach all your repositories.)</li>
    <li>Safer: <a href="https://github.com/new?name=moth-world&visibility=private" target="_blank" rel="noopener">create a private repository</a> called <b>moth-world</b> (tick “Add a README”), then
      <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">make a fine-grained token</a> with access to only that repository and <b>Contents: Read and write</b>.</li>
  </ol><p class="small muted">The token is stored only on this device.</p>`;
}
ACT.syncKind = el => {
  $("#syncHelp").innerHTML = tokenHelp(el.value);
  $("#repoRow").hidden = el.value !== "repo";
};
const syncLabel = () => ({ off: "Off", ok: "Up to date", busy: "Syncing…", pending: "Changes waiting", err: "Problem: " + SYNC.msg })[SYNC.state] || SYNC.state;
on("syncState", () => { if (CUR.prefix === "settings") { const s = $(".sync-state"); if (s) { s.className = "sync-state " + SYNC.state; s.textContent = syncLabel(); } } });

ACT.setWorldName = el => { DB.world.name = el.value.trim() || "Untitled world"; commit(); };
// one era per line: name | abbreviation | first year | "counts down" (like BC)
const DOWN_RE = /^(counts? ?down|down|back(wards?)?|↓|reverse|bc)$/i;
ACT.editCalendar = () => modal({ title: "Calendar", wide: true,
  body: `<p class="muted">One era per line: <b>name | abbreviation | first year</b>, and <b>| counts down</b> for an era whose years count backwards toward the next one, like BC: its year 1 is the year just before the next era begins.
      Years are one long count across all of history; eras only change how they're written, so you can change them at any time without moving anything.</p>
    <div class="btn-row"><button type="button" class="btn small" data-act="calPreset" data-k="bcad">Use BC / AD style</button><button type="button" class="btn small ghost" data-act="calPreset" data-k="ages">Use ages counting forward</button></div>
    ${areaField("Eras", "eras", eras().map(e => [e.name, e.abbr || "", e.start, e.down ? "counts down" : ""].filter((x, i) => i < 3 || x).join(" | ")).join("\n"), 4)}
    <div class="muted small" id="calPreview"></div>
    ${areaField("Month names, in order, separated by commas (leave empty for none)", "months", DB.world.months.join(", "), 3)}`,
  onOpen: w => { const t = $("[name=eras]", w); t.dataset.input = "calPreview"; ACT.calPreview(t); },
  buttons: [{ label: "Cancel" }, { label: "Save", cls: "accent", act: w => {
    const v = formVals(w), es = readEras(v.eras);
    if (!es.length) { toast("Keep at least one era"); return false; }
    DB.world.eras = es;
    DB.world.months = splitList(v.months);
    commit();
  } }] });
function readEras(text) {
  const old = eras();
  return text.split("\n").map(l => l.split("|").map(s => s.trim())).filter(p => p[0])
    .map((p, i) => ({ id: old[i]?.id || uid(), name: p[0], abbr: p[1] || "", start: parseInt(p[2]) || 1, ...(DOWN_RE.test(p[3] || "") ? { down: true } : {}) }));
}
// what the eras would make of a few years, as they're typed
ACT.calPreview = el => {
  const box = $("#calPreview"); if (!box) return;
  const es = readEras(el.value);
  if (!es.length) return box.textContent = "";
  const saved = DB.world.eras; DB.world.eras = es;
  try {
    const sorted = eras(), bound = sorted.find(e => e.down && eraNext(e)) ? eraNext(sorted.find(e => e.down && eraNext(e))).start : sorted[sorted.length - 1].start;
    const ys = [...new Set([bound - 100, bound - 2, bound - 1, bound, bound + 1, bound + 99])];
    box.innerHTML = "For example: " + ys.map(y => `<b>${esc(fmtYear(y))}</b>`).join(" → ") + " (oldest to newest)";
  } finally { DB.world.eras = saved; }
};
ACT.calPreset = el => {
  const t = $(".modal [name=eras]");
  t.value = el.dataset.k === "bcad"
    ? "Before the Crowning | BC | -100000 | counts down\nAfter the Crowning | AC | 1"
    : "First Age | FA | 1\nSecond Age | SA | 1000";
  t.dispatchEvent(new Event("input", { bubbles: true }));
  toast("Rename them to suit your world, then Save");
};

/* ── shifting dates ── add (or take away) years from everything dated on or
   after a point: events, births and deaths, scenes, sessions, date fields,
   versions, "now", and the eras that begin after it. Any {y, m?, d?} in the
   world is a date. */
const isDate = v => v && typeof v === "object" && !Array.isArray(v) && typeof v.y === "number" && Object.keys(v).every(k => k === "y" || k === "m" || k === "d");
function eachDate(fn) {
  // the same date object can sit in two places (a session started "now"): once each
  const seen = new Set(), visit = (d, o, k) => { if (!seen.has(d)) { seen.add(d); fn(d, o, k); } };
  const walk = (o, depth = 0) => {
    if (!o || typeof o !== "object" || depth > 12) return;
    for (const [k, v] of Object.entries(o)) {
      if (isDate(v)) visit(v, o, k);
      else if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  for (const [k, v] of Object.entries(DB)) if (k !== "kinds" && k !== "world") walk(v);
  if (isDate(DB.world.now)) visit(DB.world.now, DB.world, "now");
}
function shiftPlan(from, by, withEras) {
  const fk = dateKey(from);
  let n = 0;
  eachDate(d => { if (dateKey(d) >= fk) n++; });
  const es = withEras ? DB.world.eras.filter(e => e.start >= from.y && !(from.m && e.start === from.y)) : [];
  return { n, es };
}
ACT.shiftDates = () => modal({ title: "Shift dates", wide: true,
  body: `<p class="muted">Moves everything dated on or after a point in time by a number of years: events, births and deaths, scenes, sessions, date fields, and “now”. Something that began before the point and ends after it gets longer (or shorter). Use a minus number to move things earlier.</p>
    <div class="row2">${dateField("From (everything on or after this)", "from", null)}${textField("By how many years", "by", "700", `type="number" step="1"`)}</div>
    <label class="check"><input type="checkbox" name="eras" checked> Move the eras that begin at or after it too (so their names stay with the same events)</label>
    <p class="shift-preview muted" id="shiftPreview">Type a date to see what moves.</p>`,
  onOpen: w => {
    const upd = () => {
      const v = formVals(w), from = parseDate(v.from), by = parseInt(v.by);
      const box = $("#shiftPreview", w);
      if (!from || !by) { box.textContent = !from ? "Type a date to see what moves." : "Give a number of years."; return; }
      const { n, es } = shiftPlan(from, by, v.eras);
      box.innerHTML = `<b>${plural(n, "date")}</b> on or after ${esc(fmtDate(from))} move ${by > 0 ? "later" : "earlier"} by ${plural(Math.abs(by), "year")}${es.length ? `, and ${plural(es.length, "era")} (${esc(es.map(e => e.name).join(", "))})` : ""}.`;
    };
    w.addEventListener("input", upd); w.addEventListener("change", upd);
  },
  buttons: [{ label: "Cancel" }, { label: "Shift them", cls: "accent", act: w => {
    const v = formVals(w), from = parseDate(v.from), by = parseInt(v.by);
    if (!from) { toast("Type the date to shift from"); return false; }
    if (!by) { toast("Give a number of years"); return false; }
    const { n, es } = shiftPlan(from, by, v.eras);
    const fk = dateKey(from);
    withUndo(`${plural(n, "date")} moved by ${by > 0 ? "+" : ""}${by} years`, () => {
      eachDate(d => { if (dateKey(d) >= fk) d.y += by; });
      for (const e of es) e.start += by;
    });
  } }] });

/* ── picking an icon ── emoji worth having in a fantasy world, each with the
   words it can be found by */
const EMOJI = {
  People: "👤 person character|👥 people group|👑 royalty king queen crown|🤴 prince|👸 princess|🧙 wizard mage witch|🧝 elf|🧛 vampire|🧟 zombie undead|🧞 genie djinn|🧜 merfolk mermaid|🧚 fairy fey|🥷 assassin ninja rogue|💂 guard soldier|🧑‍🌾 farmer peasant|🧑‍⚖️ judge|🧑‍🏫 teacher scholar|🧑‍⚕️ healer doctor|🧑‍🎤 bard|🧑‍✈️ captain|🦸 hero|🦹 villain|🤺 fencer duel|🏇 rider knight|🧘 monk|🤡 jester fool|👶 child baby|🧓 elder old|👁️ eye watcher seer|🗣️ speaker voice",
  Places: "🏰 castle|🏯 fortress keep|🏛️ temple hall classical|⛩️ shrine gate|🗼 tower|🏠 house home|🏘️ village town|🏙️ city|🏚️ ruin derelict|⛺ camp tent|🏟️ arena colosseum|🌉 bridge|🗿 statue monument|⛲ fountain|🏝️ island|🏜️ desert|🏔️ mountain peak|⛰️ mountain|🌋 volcano|🏞️ valley park|🗻 fuji mount|🕳️ hole pit cave|⚓ harbour port anchor|🚪 door|🪦 grave tomb|⚰️ coffin crypt|🛖 hut|🗺️ map region|🧭 compass travel|🌐 world globe",
  Nature: "🌲 forest pine|🌳 tree|🌴 palm|🍄 mushroom fungus|🌿 herb plant|🌸 flower|🌹 rose|🌾 field wheat grain|🍂 autumn leaf|🌊 sea wave ocean water|💧 water drop|❄️ ice snow winter|🔥 fire flame|⚡ lightning storm|🌪️ tornado wind|☁️ cloud sky|🌈 rainbow|☀️ sun|🌙 moon night|⭐ star|🌟 bright star|☄️ comet|🌑 dark moon eclipse|🪨 rock stone|💎 gem crystal|🌱 sprout growth|🍃 wind leaf|🌫️ fog mist",
  Creatures: "🐉 dragon|🐲 dragon head|🦄 unicorn|🐺 wolf|🦅 eagle|🦉 owl|🐦‍⬛ raven crow|🐍 snake serpent|🦇 bat|🕷️ spider|🦂 scorpion|🐙 octopus kraken|🦑 squid|🦈 shark|🐋 whale leviathan|🐻 bear|🦁 lion|🐯 tiger|🐗 boar|🐎 horse|🦌 deer stag|🐀 rat|🐈 cat|🐕 dog hound|🐸 frog|🦎 lizard|🦖 dinosaur|🐢 turtle|🦋 butterfly|🐝 bee|🪲 beetle|🦀 crab|👹 ogre oni demon|👺 goblin tengu|👻 ghost spirit|💀 skull death|☠️ skull bones pirate|👽 alien|🤖 construct golem robot|🦠 plague",
  Things: "🗝️ key|🗡️ dagger|⚔️ swords battle|🏹 bow archer|🛡️ shield|🪓 axe|🔨 hammer smith|⛏️ pick mine|🔱 trident|🪄 wand magic|🔮 crystal ball scrying|🧿 amulet charm|📜 scroll|📖 book|📚 library books|✒️ quill writing|💍 ring|👑 crown|💰 gold money|🪙 coin|💎 jewel|🏺 urn amphora|⚱️ ashes urn|🧪 potion|⚗️ alchemy|🕯️ candle|🪔 lamp|🏮 lantern|⛓️ chains prison|🔒 lock|⚙️ machine gear|🕰️ clock time|⏳ hourglass|🎭 theatre masks|🎻 music|🥁 drum|🍷 wine|🍺 ale tavern|🍞 bread food|🧵 thread|⛵ ship sail|🛶 boat|🚂 train|🎲 dice game|🃏 card|🗿 idol",
  Faith: "✨ divine sparkle|🕯️ candle vigil|🙏 prayer|🛐 worship|☀️ sun god|🌙 moon god|⭐ star|👁️ all-seeing eye|🔥 sacred fire|💀 death god|☯️ balance|⚖️ justice law|🕊️ peace dove|🪽 wing angel|😇 angel saint|😈 demon devil|🔱 sea god|⚡ storm god|🌾 harvest god|🌳 nature god|🗡️ war god|💘 love god|🌀 chaos|♾️ eternity|🜁 air|🜂 fire|🜃 earth|🜄 water|✝️ cross|☦️ orthodox cross|☪️ crescent|✡️ star of david|🕉️ om|☸️ wheel dharma|🛕 temple|⛪ church|🕌 mosque|🕍 synagogue",
  Symbols: "⚑ flag|🚩 banner|🏳️ white flag|🏴 black flag|⚜️ fleur-de-lis heraldry|🔰 emblem|📍 pin place|❖ diamond|◆ shape|★ star shape|☘️ clover luck|♠️ spade|♥️ heart|♦️ diamond suit|♣️ club|⚕️ medicine|☢️ hazard|⚠️ warning danger|❓ unknown mystery|❗ important|💡 idea|💬 speech|🗒️ note|📅 calendar date|🧩 puzzle|🎯 goal target|🔑 secret answer|🧬 bloodline|🩸 blood|🫀 heart",
};
const emojiList = () => Object.entries(EMOJI).map(([g, s]) => [g, s.split("|").map(x => { const i = x.indexOf(" "); return [x.slice(0, i), x.slice(i + 1)]; })]);
function emojiPicker(current) {
  return `<div class="icon-pick">
    <button type="button" class="icon-current" data-act="iconPickToggle" title="Pick an icon">${esc(current)}</button>
    <input name="icon" value="${esc(current)}" class="icon-input" maxlength="16" title="Or type or paste any emoji" data-input="iconTyped">
    <div class="emoji-pick" hidden>
      <input type="search" class="emoji-search" placeholder="Search: dragon, temple, skull…" data-input="emojiSearch">
      <div class="emoji-groups">${emojiList().map(([g, list]) => `<div class="emoji-group"><h5>${g}</h5><div class="emoji-grid">${list.map(([e, words]) =>
        `<button type="button" class="emoji" data-act="emojiPick" data-e="${e}" data-words="${esc(words)}" title="${esc(words)}">${e}</button>`).join("")}</div></div>`).join("")}</div>
    </div></div>`;
}
ACT.iconPickToggle = el => { const p = el.parentElement.querySelector(".emoji-pick"); p.hidden = !p.hidden; if (!p.hidden) p.querySelector(".emoji-search").focus(); };
ACT.emojiPick = el => {
  const box = el.closest(".icon-pick");
  $(".icon-input", box).value = el.dataset.e;
  $(".icon-current", box).textContent = el.dataset.e;
  $(".emoji-pick", box).hidden = true;
};
ACT.iconTyped = el => { el.parentElement.querySelector(".icon-current").textContent = el.value || "◆"; };
ACT.emojiSearch = el => {
  const q = norm(el.value), box = el.closest(".emoji-pick");
  for (const b of $$(".emoji", box)) b.hidden = !!q && !b.dataset.words.includes(q);
  for (const g of $$(".emoji-group", box)) g.hidden = !$$(".emoji", g).some(b => !b.hidden);
};

/* ── the field editor ── laid out the way an entry's page is: each section
   as its own card, its fields inside it, in the order the page shows them.
   Any section can go first, and 📌 picks the one (or none) shown in the box
   beside the article (kind.side). */
function kfRow(f) {
  return `<div class="kf-row" data-id="${f.id || ""}">
    <input class="kf-name" value="${esc(f.name || "")}" placeholder="Field name" aria-label="Field name">
    <select class="kf-type" data-change="kfType" aria-label="What goes in it">${Object.entries(FIELD_TYPES).map(([t, l]) => `<option value="${t}" ${t === (f.type || "text") ? "selected" : ""}>${l}</option>`).join("")}</select>
    <label class="kf-secret ${f.secret ? "on" : ""}" title="Secret: only you see it; never on the player screen"><input type="checkbox" data-change="kfSecret" ${f.secret ? "checked" : ""}>🙈 Secret</label>
    <span class="kf-tools">
      <select class="kf-move" data-change="kfMoveTo" title="Move to another section" aria-label="Move to another section"></select>
      <button type="button" class="mini" data-act="kfMove" data-d="-1" title="Up">↑</button><button type="button" class="mini" data-act="kfMove" data-d="1" title="Down">↓</button><button type="button" class="mini" data-act="kfDel" title="Remove this field">✕</button></span>
    <input class="kf-opts" value="${esc((f.opts || []).join(", "))}" placeholder="The choices, with commas between them" aria-label="Choices" ${f.type === "choice" ? "" : "hidden"}>
  </div>`;
}
function kfSection(sec, fields, side = false) {
  return `<section class="kf-card ${side ? "side" : ""}">
    <div class="kf-card-h">
      <input class="kf-sec-name" value="${esc(sec)}" placeholder="Section name (blank: “Details”)" data-input="kfSecName" aria-label="Section name">
      <button type="button" class="kf-side ${side ? "on" : ""}" data-act="kfSide" title="Show this section in the box beside the article (tap again for none)">${side ? "📌 Beside the article" : "📌 Put beside the article"}</button>
      <span class="kf-tools"><button type="button" class="mini" data-act="kfSecMove" data-d="-1" title="Move the section up">↑</button><button type="button" class="mini" data-act="kfSecMove" data-d="1" title="Move the section down">↓</button><button type="button" class="mini" data-act="kfSecDel" title="Remove the section (its fields join the one above)">✕</button></span></div>
    <div class="kf-fields">${fields.map(kfRow).join("")}</div>
    <button type="button" class="btn small ghost kf-add" data-act="kfAdd">+ Field in this section</button>
  </section>`;
}
function kfCards(fields, side) {
  const secs = fieldSections(fields);
  if (!secs.length) secs.push(["", []]);
  return secs.map(([n, fs]) => kfSection(n, fs, side === n)).join("");
}
// the "move to" lists name every section there is right now
function kfRefresh(root = $("#kfList")) {
  if (!root) return;
  const cards = $$(".kf-card", root), names = cards.map(c => $(".kf-sec-name", c).value.trim());
  cards.forEach((c, ci) => {
    for (const sel of $$(".kf-move", c)) sel.innerHTML = `<option value="">⇄ Move to…</option>` + names.map((n, i) => i === ci ? "" : `<option value="${i}">${esc(n || "Details (no name)")}</option>`).join("") + `<option value="new">A new section…</option>`;
    $$(".kf-card-h [data-act=kfSecMove]", c).forEach(b => { b.disabled = b.dataset.d < 0 ? ci === 0 : ci === cards.length - 1; });
    $(".kf-card-h [data-act=kfSecDel]", c).disabled = cards.length < 2;
  });
}
ACT.kfSide = el => {
  const card = el.closest(".kf-card"), on = !card.classList.contains("side");
  for (const c of $$("#kfList .kf-card")) { c.classList.remove("side"); const b = $(".kf-side", c); b.classList.remove("on"); b.textContent = "📌 Put beside the article"; }
  if (on) { card.classList.add("side"); el.classList.add("on"); el.textContent = "📌 Beside the article"; }
  card.closest(".modal-wrap")?.dispatchEvent(new Event("change", { bubbles: true }));
};
ACT.kfType = el => { el.closest(".kf-row").querySelector(".kf-opts").hidden = el.value !== "choice"; };
ACT.kfSecret = el => el.closest(".kf-secret").classList.toggle("on", el.checked);
ACT.kfMove = el => { const r = el.closest(".kf-row"), d = +el.dataset.d; d < 0 ? r.previousElementSibling?.before(r) : r.nextElementSibling?.after(r); };
ACT.kfDel = el => el.closest(".kf-row").remove();
ACT.kfAdd = el => { const list = $(".kf-fields", el.closest(".kf-card")); list.insertAdjacentHTML("beforeend", kfRow({})); kfRefresh(); $$(".kf-name", list).pop().focus(); };
ACT.kfSecName = () => kfRefresh();
ACT.kfSecMove = el => {
  const c = el.closest(".kf-card"), d = +el.dataset.d;
  d < 0 ? c.previousElementSibling?.before(c) : c.nextElementSibling?.after(c);
  kfRefresh();
};
ACT.kfSecDel = el => {
  const c = el.closest(".kf-card"), to = c.previousElementSibling || c.nextElementSibling;
  if (!to) return;
  $(".kf-fields", to).append(...$$(".kf-row", c));
  if (c.classList.contains("side")) $(".kf-side", to).click();
  c.remove(); kfRefresh();
};
ACT.kfAddSection = () => {
  $("#kfList").insertAdjacentHTML("beforeend", kfSection("", []));
  kfRefresh();
  $$("#kfList .kf-sec-name").pop().focus();
};
ACT.kfMoveTo = el => {
  const r = el.closest(".kf-row"), v = el.value;
  if (!v) return;
  if (v === "new") { $("#kfList").insertAdjacentHTML("beforeend", kfSection("", [])); }
  const cards = $$("#kfList .kf-card"), to = v === "new" ? cards[cards.length - 1] : cards[+v];
  $(".kf-fields", to).append(r);
  kfRefresh();
  r.scrollIntoView({ block: "nearest" });
  if (v === "new") $(".kf-sec-name", to).focus();
};
ACT.kfSuggest = el => {
  const have = new Set($$("#kfList .kf-name").map(i => norm(i.value)));
  const k = byId(DB.kinds, el.dataset.id), gone = new Map((k?.gone || []).map(f => [norm(f.name), f.id]));
  const add = templateFields(el.dataset.id).filter(f => !have.has(norm(f.name))).map(f => ({ ...f, id: gone.get(norm(f.name)) || "" }));
  // each into its own section, made if it isn't there yet
  for (const f of add) {
    let card = $$("#kfList .kf-card").find(c => norm($(".kf-sec-name", c).value) === norm(f.sec || ""));
    if (!card) { $("#kfList").insertAdjacentHTML("beforeend", kfSection(f.sec, [])); card = $$("#kfList .kf-card").pop(); }
    $(".kf-fields", card).insertAdjacentHTML("beforeend", kfRow(f));
  }
  kfRefresh();
  toast(add.length ? `Added ${plural(add.length, "suggested field")}. Save to keep them.` : "It already has all the suggested fields.");
};
ACT.editKind = el => {
  const isNew = !el.dataset.id;
  const k = isNew ? { id: "", name: "", icon: "◆", color: COLORS[DB.kinds.length % COLORS.length], startLabel: "From", endLabel: "Until", fields: [] } : byId(DB.kinds, el.dataset.id);
  const used = DB.entries.filter(e => e.kind === k.id).length;
  modal({ title: isNew ? "New kind of entry" : "Edit " + k.name, wide: true, onOpen: w => kfRefresh($("#kfList", w)),
    body: `<div class="row3">${textField("Name", "name", k.name, "autofocus")}${field("Icon", emojiPicker(k.icon))}${field("Colour", `<input type="color" name="color" value="${k.color}">`)}</div>
      <div class="row2">${textField("Start date is called", "startLabel", k.startLabel)}${textField("End date is called", "endLabel", k.endLabel)}</div>
      <h4 class="screen-h">Fields</h4>
      <p class="muted small">Laid out as on an entry's page, in order. 📌 marks the section shown in the box beside the article (tap it on another section to move it there, or tap it again for none). 🙈 Secret fields are only for you and never go on the player screen. Empty fields don't show on an entry's page.</p>
      <div class="kf-list" id="kfList">${kfCards(k.fields, sideSection(k))}</div>
      <div class="btn-row"><button type="button" class="btn small" data-act="kfAddSection">+ Section</button>
        ${KIND_TEMPLATES[k.id] ? `<button type="button" class="btn small" data-act="kfSuggest" data-id="${k.id}">Add the suggested fields</button>` : ""}</div>
      ${!isNew ? `<p class="muted small">${plural(used, "entry")} of this kind. Renaming a field keeps what's in it; removing one hides it (put it back with the same name to see it again).</p>` : ""}`,
    buttons: [
      ...(!isNew ? [{ label: "Delete kind", cls: "danger", act: () => {
        if (used) { toast(`${plural(used, "entry")} still use this kind. Change their kind first.`); return false; }
        withUndo("Kind deleted", () => { DB.kinds = DB.kinds.filter(x => x !== k); });
      } }] : []),
      { label: "Cancel" },
      { label: "Save", cls: "accent", act: w => {
        const v = formVals(w);
        if (!v.name.trim()) { toast("Give it a name"); return false; }
        // a removed field that comes back by name gets its old id, and so its
        // values: removed fields are remembered (k.gone) for exactly that
        const byName = new Map([...(k.gone || []), ...k.fields].map(f => [norm(f.name), f.id]));
        const before = k.fields;
        k.fields = $$(".kf-row", w).map(r => {
          const name = $(".kf-name", r).value.trim(), type = $(".kf-type", r).value;
          if (!name) return null;
          const sec = $(".kf-sec-name", r.closest(".kf-card")).value.trim();
          const f = { id: r.dataset.id || byName.get(norm(name)) || uid(), name, type, sec };
          if (type === "choice") f.opts = splitList($(".kf-opts", r).value);
          if ($(".kf-secret input", r).checked) f.secret = true;
          return f;
        }).filter(Boolean);
        const kept = new Set(k.fields.map(f => f.id));
        const gone = [...(k.gone || []), ...before.filter(f => !kept.has(f.id)).map(f => ({ id: f.id, name: f.name }))];
        k.gone = [...new Map(gone.filter(f => !kept.has(f.id)).map(f => [norm(f.name), f])).values()];
        const sideCard = $(".kf-card.side", w);
        k.side = sideCard ? $(".kf-sec-name", sideCard).value.trim() : null;
        Object.assign(k, { name: v.name.trim(), icon: v.icon.trim() || "◆", color: v.color, startLabel: v.startLabel.trim() || "From", endLabel: v.endLabel.trim() || "Until" });
        if (isNew) { k.id = fileSlug(k.name) + "-" + uid().slice(0, 4); DB.kinds.push(k); }
        commit();
      } }] });
};

ACT.syncConnect = async () => {
  const t = $("#ghToken").value.trim(), kind = $("input[name=syncKind]:checked")?.value || "repo";
  if (!t) return toast("Paste a token first");
  try {
    await connectSync(t, kind, kind === "repo" ? $("#repoName").value.trim() || "moth-world" : "");
    toast(SYNC.state === "err" ? "Connected, but: " + SYNC.msg : `Connected. This world now syncs through ${kind === "repo" ? ls.get("repo") : "a private Gist"}.`, { ms: 6000 });
  } catch (e) { toast(e.message); }
  rerender();
};
ACT.syncMove = async el => {
  const repo = $("#moveRepo").value.trim() || "moth-world";
  el.disabled = true; el.textContent = "Moving…";
  try { await moveToRepo(repo); toast(`Moved. This world now syncs through ${ls.get("repo")}.`, { ms: 6000 }); }
  catch (e) { toast("Couldn't move: " + e.message, { ms: 9000 }); }
  rerender();
};
ACT.syncNow = async () => { await pull(); if (ls.get("dirty")) await push(); rerender(); };
ACT.syncTakeRemote = async () => {
  if (!await ask("Replace this device's copy?", "This device gets exactly the world that's on GitHub. What's on this device now is downloaded as a backup file first.", "Replace it", "danger")) return;
  [...MODALS].forEach(m => m.close());
  await takeRemote();
  rerender();
};
ACT.syncOff = async () => { if (await ask("Stop syncing on this device?", "The world stays here and on GitHub; they just stop talking.", "Stop syncing", "")) { disconnectSync(); rerender(); } };

ACT.exportReadable = () => modal({ title: "Export to read",
  body: `<p class="muted">A Word document (.docx) of “${esc(DB.world.name)}”: every codex entry with its details and article, the timeline, your threads and themes, and every book. Nothing in Moth changes.</p>
    <label class="check"><input type="checkbox" name="secrets" checked> Include 🙈 secret fields (leave this off for a copy to share with players)</label>
    <label class="check"><input type="checkbox" name="story" checked> Include the story (threads, themes and books)</label>`,
  buttons: [{ label: "Cancel" }, { label: "Export", cls: "accent", act: w => { const v = formVals(w); exportWorldDocx({ secrets: v.secrets, story: v.story }); } }] });
ACT.exportWorld = async () => download(`${fileSlug(DB.world.name)}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportBundle()));
// importing lives in merge.js
ACT.loadSample = async () => {
  if (DB.entries.length && !await ask("Load the sample world?", `“The Drowned Crown” replaces “${esc(DB.world.name)}” on this device. Export first if you want to keep it.`, "Load it", "danger")) return;
  DB = sampleWorld();
  commit();
  go("#/codex");
};
ACT.resetWorld = async () => {
  if (!await ask("Start an empty world?", `“${esc(DB.world.name)}” is cleared from this device${syncOn() ? " and the Gist" : ""}. Export first if you want to keep it.`, "Start empty")) return;
  DB = normalizeDB(null);
  commit();
  go("#/codex");
};
