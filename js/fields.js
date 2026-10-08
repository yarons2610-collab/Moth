"use strict";
/* ── fields ── what a kind of entry can describe. Each kind has a list of
   fields, grouped into sections (Appearance, Personality, Secrets…); a field
   is { id, name, type, sec, opts?, secret? }. Secret fields are yours alone:
   they're marked 🙈 and never go to the player screen. Entries keep their
   values in entry.fields[field id]; on top of the kind's fields an entry can
   have extra fields of its own (entry.extra). Empty fields aren't shown on
   an entry's page, so a long template costs nothing until it's filled in. */

const FIELD_TYPES = {
  text: "Short text", long: "Long text", list: "List (one per line)", number: "Number", date: "World date",
  choice: "Choice", yesno: "Yes / no", link: "Link to an entry", links: "Links to entries", glossary: "Word list (word = meaning)",
};

/* Suggested templates for the starting kinds: [section, name, type, choices].
   A type ending in "!" is secret. */
const KIND_TEMPLATES = {
  character: [
    ["", "Title", "text"], ["", "Pronouns", "text"], ["", "Species", "text"], ["", "Occupation", "text"],
    ["", "Status", "choice", "Alive|Dead|Missing|Unknown|Undead"], ["", "Home", "link"], ["", "Allegiance", "link"], ["", "Birthplace", "link"],
    ["Appearance", "Height", "text"], ["Appearance", "Build", "text"], ["Appearance", "Eyes", "text"], ["Appearance", "Hair", "text"], ["Appearance", "Skin", "text"],
    ["Appearance", "Distinguishing features", "text"], ["Appearance", "Clothing and look", "long"],
    ["Personality", "Traits", "list"], ["Personality", "Ideals", "long"], ["Personality", "Bonds", "long"], ["Personality", "Flaws", "long"],
    ["Personality", "Fears", "text"], ["Personality", "Mannerisms", "text"], ["Personality", "Voice and speech", "text"], ["Personality", "Quotes", "list"],
    ["Background", "Upbringing", "long"], ["Background", "Education and training", "text"], ["Background", "Turning points", "long"],
    ["Abilities", "Skills", "list"], ["Abilities", "Talents and magic", "long"], ["Abilities", "Weaknesses", "text"], ["Abilities", "Possessions", "links"],
    ["In the story", "Role", "choice", "Protagonist|Antagonist|Deuteragonist|Mentor|Ally|Love interest|Foil|Rival|Supporting|Minor"],
    ["In the story", "Wants", "long"], ["In the story", "Needs", "long"], ["In the story", "Arc", "long"], ["In the story", "Theme", "text"],
    ["Secrets", "Secrets", "long!"], ["Secrets", "What they'd never admit", "long!"],
  ],
  place: [
    ["", "Type", "text"], ["", "Part of", "link"], ["", "Ruler", "link"], ["", "Population", "number"], ["", "Status", "choice", "Thriving|Stable|Declining|Ruined|Abandoned|Lost"],
    ["Geography", "Climate", "text"], ["Geography", "Terrain", "text"], ["Geography", "Landmarks", "list"], ["Geography", "Natural resources", "text"],
    ["Society", "Peoples", "long"], ["Society", "Government", "text"], ["Society", "Factions here", "links"], ["Society", "Economy", "long"],
    ["Society", "Exports", "list"], ["Society", "Imports", "list"], ["Society", "Religion", "text"], ["Society", "Culture and customs", "long"], ["Society", "Laws", "long"],
    ["Defence", "Defences", "long"], ["Defence", "Military", "text"],
    ["Atmosphere", "Sights", "text"], ["Atmosphere", "Sounds", "text"], ["Atmosphere", "Smells", "text"], ["Atmosphere", "Mood", "text"],
    ["Secrets", "Rumours", "list"], ["Secrets", "Secrets", "long!"], ["Secrets", "Plot hooks", "list!"],
  ],
  faction: [
    ["", "Type", "choice", "Guild|Order|Religion|Cult|Nation|Noble house|Company|Gang|Army|Secret society|Other"], ["", "Leader", "link"], ["", "Seat", "link"],
    ["", "Size", "text"], ["", "Symbol", "text"], ["", "Motto", "text"], ["", "Colours", "text"],
    ["Purpose", "Goals", "long"], ["Purpose", "Methods", "long"], ["Purpose", "Beliefs", "long"], ["Purpose", "Public face", "long"],
    ["Structure", "Ranks", "list"], ["Structure", "Notable members", "links"], ["Structure", "How to join", "long"],
    ["Relations", "Allies", "links"], ["Relations", "Enemies", "links"], ["Relations", "Resources", "long"],
    ["Secrets", "Hidden agenda", "long!"], ["Secrets", "Secrets", "long!"],
  ],
  item: [
    ["", "Type", "choice", "Weapon|Armour|Tool|Jewellery|Book|Relic|Artifact|Potion|Treasure|Vehicle|Other"], ["", "Rarity", "choice", "Common|Uncommon|Rare|Very rare|Legendary|Unique"],
    ["", "Owner", "link"], ["", "Where it is", "link"], ["", "Value", "text"], ["", "Material", "text"],
    ["Description", "Appearance", "long"], ["Description", "Properties", "long"], ["Description", "Origin", "long"], ["Description", "Maker", "link"],
    ["Secrets", "The catch", "long!"], ["Secrets", "True nature", "long!"],
  ],
  lore: [
    ["", "Type", "choice", "Myth|Legend|Religion|History|Prophecy|Magic|Tradition|Language|Science|Other"], ["", "Known by", "text"], ["", "Related to", "links"],
    ["The telling", "What people say", "long"], ["The telling", "Sources", "list"],
    ["The truth", "Is it true?", "choice!", "True|Partly true|False|Unknown"], ["The truth", "What really happened", "long!"],
  ],
  religion: [
    ["", "Type", "choice", "Pantheon|One god|Dualist|Ancestor worship|Animist|Philosophy|Mystery cult|Cult|Other"], ["", "Deities", "links"], ["", "Founder", "link"],
    ["", "Head of the faith", "link"], ["", "Holy city", "link"], ["", "Symbol", "text"], ["", "Holy text", "text"], ["", "Followers", "text"],
    ["", "Standing", "choice", "Dominant|Widespread|Minority|Persecuted|Secret|Dying|Extinct"],
    ["Beliefs", "Core beliefs", "long"], ["Beliefs", "Creation", "long"], ["Beliefs", "Afterlife", "long"], ["Beliefs", "Virtues", "list"], ["Beliefs", "Sins", "list"], ["Beliefs", "Taboos", "list"],
    ["Practice", "Rites and rituals", "long"], ["Practice", "Prayers and greetings", "text"], ["Practice", "Holy days", "list"], ["Practice", "Pilgrimages", "text"],
    ["Practice", "Offerings", "list"], ["Practice", "Clergy", "long"], ["Practice", "Ranks", "list"], ["Practice", "Dress and signs", "text"], ["Practice", "Temples", "links"],
    ["In the world", "Where it's followed", "links"], ["In the world", "Sects and heresies", "long"], ["In the world", "Allies", "links"], ["In the world", "Enemies", "links"], ["In the world", "Church and state", "long"],
    ["Secrets", "What the faithful don't know", "long!"], ["Secrets", "Secrets", "long!"],
  ],
  deity: [
    ["", "Titles", "list"], ["", "Domains", "list"], ["", "Rank", "choice", "Supreme|Greater|Lesser|Demigod|Saint|Spirit|Ascended mortal"],
    ["", "Nature", "choice", "Kind|Stern|Neutral|Capricious|Cruel|Unknowable"], ["", "Status", "choice", "Worshipped|Forgotten|Sleeping|Imprisoned|Dead|Unknown"],
    ["", "Religion", "link"], ["", "Realm", "link"], ["", "Symbol", "text"], ["", "Sacred animal", "text"], ["", "Sacred colours", "text"],
    ["Appearance", "Forms", "long"], ["Appearance", "Signs and omens", "long"],
    ["Character", "Personality", "long"], ["Character", "Desires", "long"], ["Character", "Teachings", "long"], ["Character", "Taboos", "list"],
    ["Worship", "Worshippers", "text"], ["Worship", "Clergy", "text"], ["Worship", "Rites", "long"], ["Worship", "Offerings", "list"], ["Worship", "Holy days", "list"], ["Worship", "Temples", "links"],
    ["Relations", "Allies", "links"], ["Relations", "Rivals", "links"], ["Relations", "Servants and avatars", "links"], ["Relations", "Chosen mortals", "links"],
    ["Myths", "Origin", "long"], ["Myths", "Great deeds", "long"], ["Myths", "Myths", "long"],
    ["Secrets", "True nature", "long!"], ["Secrets", "Secrets", "long!"],
  ],
  magic: [
    ["", "Kind of system", "choice", "Hard (strict rules)|Soft (mysterious)|In between"], ["", "Source", "text"], ["", "Who can use it", "text"],
    ["", "How common", "choice", "Unheard of|Rare|Uncommon|Common|Everyone"], ["", "Standing", "choice", "Revered|Accepted|Regulated|Feared|Forbidden|Secret"],
    ["", "Users are called", "text"], ["", "Talent or training", "choice", "Born with it|Learned|Granted by a power|Bargained for|Both born and learned"], ["", "Tied to", "links"],
    ["How it works", "Where the power comes from", "long"], ["How it works", "How it's done", "long"], ["How it works", "Rules", "list"], ["How it works", "Costs", "list"],
    ["How it works", "Limits", "list"], ["How it works", "What it can't do", "list"], ["How it works", "Side effects", "long"], ["How it works", "Weaknesses and counters", "list"],
    ["Learning", "How it's learned", "long"], ["Learning", "Schools and traditions", "list"], ["Learning", "Ranks", "list"], ["Learning", "Where it's taught", "links"],
    ["Learning", "Notable users", "links"], ["Learning", "Texts and artefacts", "links"],
    ["In the world", "How it changes society", "long"], ["In the world", "Laws", "long"], ["In the world", "Who controls it", "links"], ["In the world", "History", "long"],
    ["Secrets", "The true source", "long!"], ["Secrets", "What's been forgotten", "long!"], ["Secrets", "Secrets", "long!"],
  ],
  spell: [
    ["", "Magic system", "link"], ["", "School", "text"], ["", "Tier", "text"], ["", "Casting time", "text"], ["", "Range", "text"], ["", "Duration", "text"],
    ["", "Components", "text"], ["", "Cost", "text"], ["", "Rarity", "choice", "Common|Uncommon|Rare|Lost|Unique"],
    ["Effect", "What it does", "long"], ["Effect", "Roll", "text"], ["Effect", "With more power", "long"], ["Effect", "Who knows it", "links"],
    ["Lore", "Origin", "long"], ["Lore", "Creator", "link"],
    ["Secrets", "Secrets", "long!"],
  ],
  language: [
    ["", "Spoken by", "links"], ["", "Speakers", "text"], ["", "Status", "choice", "Living|Spreading|Dying|Dead|Sacred only|Secret|Trade tongue"],
    ["", "Descended from", "link"], ["", "Script", "text"], ["", "Writing", "choice", "Left to right|Right to left|Top to bottom|Boustrophedon|Not written"], ["", "Sounds like", "text"],
    ["Sounds", "Sounds it has", "text"], ["Sounds", "Sounds it never has", "text"], ["Sounds", "Syllables", "list"], ["Sounds", "Name endings", "list"],
    ["Grammar", "Word order", "choice", "Subject verb object|Subject object verb|Verb subject object|Free"], ["Grammar", "How it works", "long"], ["Grammar", "Counting", "long"],
    ["Words", "Lexicon", "glossary"], ["Words", "Phrases", "glossary"], ["Words", "Sample names", "list"],
    ["In use", "Dialects", "list"], ["In use", "Where it's spoken", "links"], ["In use", "Related languages", "links"], ["In use", "Borrowed words", "long"], ["In use", "Who learns it", "long"],
    ["Secrets", "Hidden meanings", "long!"],
  ],
  culture: [
    ["", "Peoples", "text"], ["", "Homeland", "links"], ["", "Languages", "links"], ["", "Religions", "links"], ["", "Population", "text"], ["", "Values", "list"],
    ["Daily life", "Food and drink", "long"], ["Daily life", "Clothing", "long"], ["Daily life", "Homes and buildings", "long"], ["Daily life", "Family and kinship", "long"],
    ["Daily life", "Names and naming", "long"], ["Daily life", "Coming of age", "long"], ["Daily life", "Marriage", "long"], ["Daily life", "Death and burial", "long"],
    ["Society", "Social order", "long"], ["Society", "Roles of men and women", "long"], ["Society", "Law and justice", "long"], ["Society", "Work and trade", "long"],
    ["Society", "War", "long"], ["Society", "Learning", "long"],
    ["Arts", "Art and craft", "long"], ["Arts", "Music and dance", "long"], ["Arts", "Stories and heroes", "long"], ["Arts", "Festivals", "list"], ["Arts", "Games and sport", "text"],
    ["Manners", "Greetings", "text"], ["Manners", "Hospitality", "long"], ["Manners", "Taboos", "list"], ["Manners", "Insults", "list"], ["Manners", "Sayings", "list"],
    ["Others", "Allies", "links"], ["Others", "Rivals", "links"], ["Others", "How they see outsiders", "long"], ["Others", "How outsiders see them", "long"],
    ["Secrets", "Secrets", "long!"],
  ],
  creature: [
    ["", "Type", "text"], ["", "Habitat", "text"], ["", "Size", "choice", "Tiny|Small|Medium|Large|Huge|Gargantuan"],
    ["", "Danger", "choice", "Harmless|Low|Moderate|High|Deadly"], ["", "Lifespan", "text"], ["", "Diet", "text"],
    ["Description", "Appearance", "long"], ["Description", "Behaviour", "long"], ["Description", "Society", "long"],
    ["Abilities", "Abilities", "list"], ["Abilities", "Weaknesses", "list"], ["Abilities", "Legends about it", "long"],
    ["Secrets", "Secrets", "long!"],
  ],
};
const templateFields = id => (KIND_TEMPLATES[id] || []).map(([sec, name, type, opts]) => ({
  id: uid(), name, sec, type: type.replace("!", ""), ...(opts ? { opts: opts.split("|") } : {}), ...(type.endsWith("!") ? { secret: true } : {}),
}));
// Bring a kind up to its template: missing fields are added, nothing is removed
// or changed, and a field you already have (by name) keeps its values.
function addSuggestedFields(k) {
  const have = new Set(k.fields.map(f => norm(f.name)));
  const gone = new Map((k.gone || []).map(f => [norm(f.name), f.id]));
  let n = 0;
  for (const f of templateFields(k.id)) if (!have.has(norm(f.name))) { k.fields.push({ ...f, id: gone.get(norm(f.name)) || f.id }); n++; }
  return n;
}
// worlds made before templates existed get them once
function upgradeKinds(db) {
  const v = db.fieldsV || 0;
  if (v < 1) for (const k of db.kinds) addSuggestedFields(k);
  // version 2 brought Religion and Deity; a world that already has kinds by
  // those names keeps its own
  // version 3, magic systems and spells
  const added = { 2: ["religion", "deity"], 3: ["magic", "spell"], 4: ["language", "culture"] };
  for (const [ver, ids] of Object.entries(added)) if (v < +ver)
    for (const k of defaultKinds().filter(k => ids.includes(k.id))) if (!db.kinds.some(x => x.id === k.id || norm(x.name) === norm(k.name))) db.kinds.push(k);
  db.fieldsV = 4;
}

// sections in order: the untitled one ("Basics") first, then as they come
function fieldSections(fields) {
  const secs = new Map([["", []]]);
  for (const f of fields) { const s = f.sec || ""; if (!secs.has(s)) secs.set(s, []); secs.get(s).push(f); }
  return [...secs].filter(([, fs]) => fs.length);
}
const isEmptyVal = v => v == null || v === "" || (Array.isArray(v) && !v.length) || v === false;
const SHORT = new Set(["text", "number", "date", "choice", "yesno", "link"]);

/* one field in the entry editor */
function fieldInput(f, v) {
  const n = "f_" + f.id, label = esc(f.name) + (f.secret ? ` <span class="secret-mark" title="Only you see this">🙈</span>` : "");
  switch (f.type) {
    case "link": return field(label, `<select name="${n}">${entryOptions(v || "")}</select>`);
    case "links": return multiPick(label, n, Array.isArray(v) ? v : v ? [v] : []);
    case "date": return dateField(label, n, v || null);
    case "long": return field(label, `<textarea name="${n}" rows="3">${esc(v || "")}</textarea>`, "span2");
    case "list": return field(label, `<textarea name="${n}" rows="3" placeholder="One per line">${esc(v || "")}</textarea>`, "span2");
    case "glossary": return field(label, `<textarea name="${n}" rows="5" placeholder="One per line: word = meaning">${esc(v || "")}</textarea>`, "span2");
    case "choice": return field(label, `<select name="${n}"><option value="">—</option>${(f.opts || []).map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}${v && !(f.opts || []).includes(v) ? `<option selected>${esc(v)}</option>` : ""}</select>`);
    case "yesno": return `<label class="check fld"><input type="checkbox" name="${n}" ${v ? "checked" : ""}> ${label}</label>`;
    case "number": return textField(label, n, v ?? "", `type="number" step="any"`);
    default: return textField(label, n, v || "", "data-links");
  }
}
// read it back; undefined means empty. Throws on a date it can't read.
function readField(f, raw) {
  if (f.type === "yesno") return raw ? true : undefined;
  if (f.type === "links") { const ids = multiVals(raw); return ids.length ? ids : undefined; }
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  if (f.type === "number") return isNaN(+s) ? s : +s;
  if (f.type === "date") { const d = parseDate(s); if (!d) throw new Error(`“${s}” isn't a date I can read`); return d; }
  return ["long", "list", "glossary"].includes(f.type) ? String(raw).trim() : s;
}
// how a value reads on an entry's page
function fieldShow(f, v) {
  switch (f.type) {
    case "link": { const e = byId(DB.entries, Array.isArray(v) ? v[0] : v); return e ? chip("e", e) : "—"; }
    case "links": return `<div class="chips">${(Array.isArray(v) ? v : [v]).map(id => chip("e", byId(DB.entries, id))).join("")}</div>`;
    case "date": return esc(fmtDate(v));
    case "yesno": return v ? "Yes" : "No";
    case "long": return `<div class="prose">${md(v)}</div>`;
    case "glossary": {
      const rows = glossaryRows(v);
      return `<div class="glossary">${rows.length > 6 ? `<input type="search" class="gloss-search" placeholder="Look up a word…" data-input="glossSearch">` : ""}
        <table>${rows.map(([w, m]) => `<tr><td class="gw">${esc(w)}</td><td>${inline(m)}</td></tr>`).join("")}</table></div>`;
    }
    case "list": return `<ul class="field-list">${String(v).split("\n").map(l => l.trim()).filter(Boolean).map(l => `<li>${inline(l.replace(/^[-*•]\s*/, ""))}</li>`).join("")}</ul>`;
    case "number": return esc(typeof v === "number" ? v.toLocaleString() : v);
    default: return inline(String(v));
  }
}
const fieldText = (f, v) => ["text", "long", "list", "choice", "glossary"].includes(f.type) ? String(v ?? "") : "";
// "word = meaning" (or "word: meaning", "word - meaning"), one per line
const glossaryRows = v => String(v || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(/^(.+?)\s*(?:=|:|\s[-–—]\s)\s*(.*)$/); return m ? [m[1], m[2]] : [l, ""]; });
ACT.glossSearch = el => {
  const q = norm(el.value);
  for (const tr of $$("tr", el.parentElement)) tr.hidden = !!q && !norm(tr.textContent).includes(q);
};

/* ── a name generator, for any entry with a Syllables field (languages) ──
   names of two or three syllables, sometimes with one of its name endings */
function makeNames(syl, ends, n = 12) {
  const out = new Set(), pick = a => a[Math.floor(Math.random() * a.length)];
  for (let tries = 0; out.size < n && tries < n * 20; tries++) {
    let w = "";
    const k = Math.random() < 0.55 ? 2 : 3;
    for (let i = 0; i < k; i++) w += pick(syl);
    if (ends.length && Math.random() < 0.5) w += pick(ends);
    w = w.toLowerCase().replace(/(.)\1\1+/g, "$1$1").replace(/['’-]{2,}/g, "'");
    // nothing a mouth trips on: no three vowels or three consonants in a row
    if (w.length < 3 || w.length > 14 || /[aeiouy]{3}/.test(w) || /[^aeiouy'\s-]{4}/.test(w)) continue;
    out.add(w[0].toUpperCase() + w.slice(1));
  }
  return [...out];
}
const sylOf = (e, name) => { const f = kindOf(e).fields.find(f => norm(f.name) === name); return f ? String(e.fields?.[f.id] || "").split(/[\n,]+/).map(s => s.trim().replace(/^-|-$/g, "")).filter(Boolean) : []; };
ENTITY_PANELS.push(e => {
  const syl = sylOf(e, "syllables");
  if (syl.length < 3) return kindOf(e).fields.some(f => norm(f.name) === "syllables") ? `<section class="panel"><div class="panel-h"><h4>Name generator</h4></div>
    <p class="muted small">Fill in at least three Syllables (one per line) and this makes names that sound like ${esc(e.name)}.</p></section>` : "";
  return `<section class="panel namegen"><div class="panel-h"><h4>Name generator</h4><button class="btn small" data-act="genNames" data-id="${e.id}">↻ More</button></div>
    <div class="gen-names" id="genNames">${namesHtml(e)}</div><p class="muted small">Tap a name to copy it.</p></section>`;
});
const namesHtml = e => makeNames(sylOf(e, "syllables"), sylOf(e, "name endings")).map(n => `<button class="chip gen-name" data-act="copyName" data-v="${esc(n)}">${esc(n)}</button>`).join("");
ACT.genNames = el => { $("#genNames").innerHTML = namesHtml(byId(DB.entries, el.dataset.id)); };
ACT.copyName = el => { navigator.clipboard?.writeText(el.dataset.v).then(() => toast(`Copied “${el.dataset.v}”`), () => toast(el.dataset.v)); };
const fieldLinks = (f, v) => f.type === "link" ? (v ? [v] : []) : f.type === "links" ? (Array.isArray(v) ? v : v ? [v] : []) : [];
