"use strict";
/* ── the sample world ── "The Drowned Crown": a small, connected world that
   shows off every part of Moth, so a first visit isn't an empty page. */

function sampleWorld() {
  const db = normalizeDB(null);
  db.world = { name: "The Drowned Crown", eras: [{ id: uid(), name: "Old Kingdom", abbr: "OK", start: 1 }, { id: uid(), name: "After the Flood", abbr: "AF", start: 812 }],
    months: ["Thaw", "Bloom", "Highsun", "Harvest", "Ember", "Frost", "Longnight", "Ice"], now: { y: 812 + 311, m: 5, d: 14 } };
  const AF = y => 812 + y - 1, OK = y => y;
  const kinds = Object.fromEntries(db.kinds.map(k => [k.id, k]));
  const fid = (kind, name) => kinds[kind].fields.find(f => f.name === name).id;
  const E = {};
  const add = (key, kind, name, p = {}) => { const e = newEntry({ kind, name, ...p }); E[key] = e; db.entries.push(e); return e; };
  const rel = (a, b, label, type) => (E[a].rels ||= []).push({ id: uid(), to: E[b].id, label, type: type ?? relTypeFromLabel(label) });

  // places
  add("saltmere", "place", "Saltmere", { summary: "A salt-crusted harbour city built on the shoulders of a drowned one.", start: { y: AF(40) }, tags: ["city", "coast"],
    body: "Saltmere stands where the hill-towns of the old [[Old Lumen|Lumen]] once looked down on the sea. Now the sea looks up at it.\n\nIts lanes run downhill into **the Weir**, where the tide comes in through the old palace gates twice a day.\n\n- Ruled, in all but name, by the [[Saltward Guild]]\n- Lit at night by the [[Gullwatch]] lamp\n- Haunted, at low tide, by the [[Drowned]]" });
  add("weir", "place", "The Weir", { summary: "Saltmere's tidal quarter: half street, half sea.", start: { y: AF(60) }, tags: ["district"],
    body: "At low tide the Weir is a market. At high tide it is a harbour. In between, it is where [[Maren Vey]] works." });
  add("gullwatch", "place", "Gullwatch", { summary: "The lighthouse on the headland, and the last lamp before open sea.", start: { y: AF(102) } });
  add("palace", "place", "The Sunken Palace", { summary: "The seat of the Old Kingdom, under forty fathoms of green water.", start: { y: OK(400) }, tags: ["ruin"],
    body: "When the Flood came, Queen [[Aldra]] did not leave. The palace went down with its doors open and its lamps lit.\n\nDivers say the throne room is still dry. Divers say a lot of things." });
  add("lumen", "place", "Old Lumen", { summary: "Capital of the Old Kingdom. Drowned in the Flood.", start: { y: OK(212) }, end: { y: OK(811), m: 6 }, tags: ["ruin", "capital"] });
  // factions, items, lore, creatures
  add("guild", "faction", "Saltward Guild", { summary: "Moneylenders, salvagers and, quietly, the government.", start: { y: AF(150) }, color: "#e07a5f",
    body: "The Guild lends against what the sea will give back. Its ledgers are older than its charter, and its charter is older than most of Saltmere." });
  add("tidebound", "faction", "The Tidebound", { summary: "A drowned-saint cult that wants the Old Kingdom back, whatever that costs.", tags: ["cult", "secret"] });
  add("crown", "item", "The Drowned Crown", { summary: "The crown of the Old Kingdom, lost with the palace.", start: { y: OK(402) }, end: { y: OK(811), m: 6 }, tags: ["artifact"],
    body: "A circlet of sea-pearl and pale gold. Whoever wears it, the old songs say, *the water will remember*.\n\nIt has surfaced, which it should not be able to do." });
  add("flood", "lore", "The Flood", { summary: "The night the sea rose and the Old Kingdom ended.", body: "Nobody agrees why. The [[Tidebound]] say the sea was invited." });
  add("drowned", "creature", "Drowned", { summary: "Dead sailors who walk out of the sea at low tide, still looking for shore.", tags: ["undead"],
    stats: { hp: 22, maxhp: 22, ac: 11, init: -1, speed: "20 ft, swim 30 ft", level: "1", block: "**Grasping hands.** Melee, +4 to hit. 1d6+2 bludgeoning, and the target is grappled.\n\n**Brine breath** (recharge 5–6). 15 ft cone, 2d6 cold." } });
  add("shark", "creature", "Reef shark", { summary: "Common in the Weir at high tide. Not as common as people would like.", stats: { hp: 22, maxhp: 22, ac: 12, init: 1, speed: "swim 40 ft", level: "1/2", block: "**Bite.** +4 to hit, 1d8+2 piercing." } });
  // people
  add("maren", "character", "Maren Vey", { summary: "A Weir smuggler with a small boat, a large debt and a talent for being underwater.", start: { y: AF(288), m: 3, d: 9 }, tags: ["protagonist"], color: "#e3c27a",
    body: "Maren runs cargo the [[Saltward Guild]] doesn't want counted, out of the [[The Weir|Weir]]. Three years ago she borrowed from [[Isel Tarrow]] to bury her mother, and she has been paying it back in favours ever since.\n\nShe found the [[The Drowned Crown|crown]]. She has not told anyone. Yet." });
  add("jory", "character", "Jory Vey", { summary: "Maren's younger brother. Lamp-keeper's apprentice at Gullwatch.", start: { y: AF(294) } });
  add("brisa", "character", "Brisa Vey", { summary: "Maren and Jory's mother, a diver.", start: { y: AF(266) }, end: { y: AF(309), m: 7 } });
  add("tamsin", "character", "Old Tamsin", { summary: "Brisa's mother. Remembers more of the old songs than she should.", start: { y: AF(239) } });
  add("isel", "character", "Isel Tarrow", { summary: "Guildmistress of the Saltward Guild. Patient, precise and owed a great deal.", start: { y: AF(270), m: 1, d: 2 }, color: "#e07a5f",
    body: "Isel never raises her voice and never forgets a debt. She wants the [[The Drowned Crown|crown]], and she suspects [[Maren Vey]] knows where it is." });
  add("doran", "character", "Doran Tarrow", { summary: "Isel's husband. A harbour-master with soft hands.", start: { y: AF(266) } });
  add("pell", "character", "Pell Tarrow", { summary: "Isel and Doran's son, who would rather be a smuggler than a banker.", start: { y: AF(291) } });
  add("aldra", "character", "Aldra", { summary: "Last queen of the Old Kingdom. Stayed when the sea came.", start: { y: OK(779) }, end: { y: OK(811), m: 6 }, aliases: ["Queen Aldra"], color: "#b9a6ff" });
  add("teodric", "character", "Teodric", { summary: "Aldra's king, who left on the last ship.", start: { y: OK(774) }, end: { y: AF(20) }, aliases: ["King Teodric"] });
  add("corran", "character", "Corran", { summary: "The infant prince carried out on the last ship. What became of his line is a matter of some interest to the Tidebound.", start: { y: OK(810) } });
  // the party
  add("kestrel", "character", "Kestrel", { summary: "A half-feral ranger raised on the cliffs above Gullwatch.", pc: true, start: { y: AF(291) }, stats: { hp: 24, maxhp: 24, ac: 15, init: 3, speed: "30 ft", level: "3", block: "**Longbow.** +5 to hit, 1d8+3 piercing." } });
  add("ansel", "character", "Brother Ansel", { summary: "A cleric of the lighthouse saint, terrified of water.", pc: true, start: { y: AF(284) }, stats: { hp: 21, maxhp: 21, ac: 16, init: 0, speed: "25 ft", level: "3", block: "**Sacred flame.** Dex save DC 13, 1d8 radiant.\n**Cure wounds.** Heals 1d8+3." } });

  rel("maren", "isel", "indebted to", "");
  rel("maren", "brisa", "daughter of"); rel("jory", "brisa", "son of"); rel("brisa", "tamsin", "daughter of");
  rel("isel", "doran", "married to"); rel("pell", "isel", "son of"); rel("pell", "doran", "son of");
  rel("aldra", "teodric", "married to"); rel("corran", "aldra", "son of"); rel("corran", "teodric", "son of");
  rel("isel", "guild", "leads", ""); rel("maren", "weir", "lives in", ""); rel("jory", "gullwatch", "keeps the lamp at", "");
  rel("pell", "maren", "sweet on", ""); rel("aldra", "palace", "rules from", ""); rel("tidebound", "flood", "worships", "");
  rel("kestrel", "gullwatch", "grew up near", ""); rel("ansel", "gullwatch", "serves the saint of", "");
  E.maren.fields[fid("character", "Home")] = E.weir.id;
  E.isel.fields[fid("character", "Title")] = "Guildmistress"; E.isel.fields[fid("character", "Allegiance")] = E.guild.id; E.isel.fields[fid("character", "Home")] = E.saltmere.id;
  E.aldra.fields[fid("character", "Title")] = "Queen of Lumen"; E.crown.fields[fid("item", "Owner")] = E.aldra.id;
  E.saltmere.fields[fid("place", "Type")] = "Harbour city"; E.saltmere.fields[fid("place", "Population")] = 14000; E.saltmere.fields[fid("place", "Ruler")] = E.guild.id;
  E.guild.fields[fid("faction", "Leader")] = E.isel.id; E.guild.fields[fid("faction", "Seat")] = E.saltmere.id;
  E.lumen.fields[fid("place", "Ruler")] = E.aldra.id;
  E.drowned.fields[fid("creature", "Habitat")] = "Tidal flats, wrecks, the Weir at low tide";
  add("saint", "deity", "The Lighthouse Saint", { summary: "Patron of sailors, lamp-keepers and the lost. Once a woman; now a light.", aliases: ["Saint Gull"], color: "#f6d97a",
    body: "Before the [[The Flood|Flood]] she kept a lamp on the cliffs above [[Old Lumen]]. When the sea came she kept it lit all night, and every ship that saw it reached the hills. In the morning she was gone, and the lamp was still burning." });
  add("faith", "religion", "The Lamplit Faith", { summary: "Saltmere's faith: keep a light for those still at sea.", start: { y: AF(12) }, color: "#e8b04a" });
  add("tidecult", "religion", "The Drowned Saints", { summary: "The Tidebound's creed: the sea took the Old Kingdom to keep it safe, and will give it back to the faithful.", color: "#4a8fc0" });
  const fill = (key, kind, o) => { for (const [name, v] of Object.entries(o)) E[key].fields[fid(kind, name)] = v; };
  fill("maren", "character", {
    Pronouns: "she/her", Species: "Human", Occupation: "Smuggler", Status: "Alive", Birthplace: E.weir.id,
    Height: "Short", Build: "Wiry, a swimmer's shoulders", Eyes: "Grey-green", Hair: "Black, cropped short", "Distinguishing features": "A rope scar round her left wrist",
    "Clothing and look": "Oilskin coat two sizes too big (it was her mother's), bare feet on the boat, boots everywhere else.",
    Traits: "Quick\nStubborn\nFunny when she's frightened", Ideals: "Debts get paid. Hers, and other people's.", Bonds: "[[Jory Vey]], always.", Flaws: "Trusts the sea more than people, and says so.",
    Fears: "Deep water at night", Mannerisms: "Counts things under her breath", "Voice and speech": "Weir dialect; drops it when she wants something",
    Quotes: "“The sea gives back. It just doesn't say when.”\n“I don't steal. I find things first.”",
    Upbringing: "Raised on a diving boat by [[Brisa Vey]], who taught her to hold her breath for three minutes before she could read.",
    Skills: "Free-diving\nSmall boats\nLying to collectors", Possessions: [E.crown.id], Weaknesses: "Owes [[Isel Tarrow]] more than she can pay",
    Role: "Protagonist", Wants: "To be out from under Isel's debt.", Needs: "To stop carrying everything alone.", Arc: "From someone who keeps everything to herself, to someone who can ask for help.", Theme: "What we owe, and to whom",
    Secrets: "She has the crown. She has worn it once, and heard the water remember her name.",
  });
  fill("isel", "character", {
    Pronouns: "she/her", Species: "Human", Occupation: "Moneylender, guildmistress", Status: "Alive",
    Eyes: "Pale brown", Hair: "Silver, braided tight", "Clothing and look": "Grey wool, good boots, a single pearl earring.",
    Traits: "Patient\nPrecise\nNever raises her voice", Ideals: "Order is a kindness.", Flaws: "Believes everyone has a price, including herself.",
    Role: "Antagonist", Wants: "The crown.", Secrets: "She doesn't want the crown for the Guild. She wants it for the [[Tidebound]].", "What they'd never admit": "She loved [[Brisa Vey]].",
  });
  fill("saltmere", "place", {
    Status: "Thriving", Climate: "Cold, wet, windy", Terrain: "Steep hillside down to a tidal harbour", Landmarks: "The Weir\nGullwatch lamp\nThe Guild house steps",
    Government: "A council, in name; the [[Saltward Guild]], in fact", "Factions here": [E.guild.id, E.tidebound.id], Economy: "Salvage, fishing, and debt.",
    Exports: "Salt fish\nSalvaged Old Kingdom goods", Religion: "The lighthouse saint", "Culture and customs": "Nobody whistles on the water. Everyone leaves a coin on the Weir steps at the first low tide of the year.",
    Sights: "Grey roofs stepping down to green water", Sounds: "Gulls, bells, the tide through the gates", Smells: "Salt, tar, fish", Mood: "Busy, damp, watchful",
    Rumours: "There are rooms under the Guild house that flood at high tide.", Secrets: "The Guild house is built on the old palace's watchtower.", "Plot hooks": "A Guild ledger page washes up with Maren's name on it.",
  });
  fill("guild", "faction", { Type: "Guild", Size: "About 300 members", Symbol: "A hook and a scale", Motto: "What the sea takes, we recover.", Goals: "Keep Saltmere solvent, and in debt to the Guild.", Ranks: "Collector\nFactor\nMaster\nGuildmistress", "Notable members": [E.isel.id], Enemies: [E.tidebound.id], "Hidden agenda": "Half the masters want the Old Kingdom's treasury, not its return." });
  fill("crown", "item", { Type: "Relic", Rarity: "Unique", Material: "Sea-pearl and pale gold", Appearance: "A plain circlet, cold to the touch even in summer.", Properties: "The wearer can breathe underwater, and hears voices in the tide.", "True nature": "It doesn't remember the wearer. It remembers the Old Kingdom, and wants it back." });
  fill("saint", "deity", { Titles: "The Lighthouse Saint\nSaint Gull\nShe Who Kept the Lamp", Domains: "Light\nSea travel\nThe lost\nVigils", Rank: "Saint", Nature: "Kind", Status: "Worshipped",
    Religion: E.faith.id, Realm: E.gullwatch.id, Symbol: "A lamp with a gull's wing for a flame", "Sacred animal": "The herring gull", "Sacred colours": "White and gold",
    "Signs and omens": "A lamp that won't go out. Gulls circling a ship that's off course.", Teachings: "Keep a light for those still at sea. Nobody is lost while someone is looking.", Taboos: "Putting out a light at sea\nWhistling on the water",
    Rites: "A candle in every window on the night of the Flood.", Offerings: "Lamp oil\nBread for the gulls", "Chosen mortals": [E.ansel.id],
    "True nature": "She didn't keep the lamp lit. Queen [[Aldra]] did, from the palace, as it went down." });
  fill("faith", "religion", { Type: "One god", Deities: [E.saint.id], "Holy city": E.saltmere.id, Symbol: "A lit lamp", Followers: "Most of Saltmere", Standing: "Dominant",
    "Core beliefs": "The sea gives back what it takes, if someone keeps a light for it.", Afterlife: "The drowned sail on toward the last lamp.", Virtues: "Vigilance\nHospitality\nKeeping your word", Sins: "Wrecking\nLeaving a light unlit",
    "Holy days": "The Night of Lamps (the Flood's anniversary)", Temples: [E.gullwatch.id], "Where it's followed": [E.saltmere.id, E.weir.id], Enemies: [E.tidecult.id] });
  fill("tidecult", "religion", { Type: "Mystery cult", Standing: "Secret", "Core beliefs": "The Old Kingdom isn't dead; it's waiting.", Enemies: [E.faith.id], Secrets: "Its head is a Guild master." });
  rel("tidebound", "tidecult", "follows", "");
  fill("drowned", "creature", { Type: "Undead", Size: "Medium", Danger: "Moderate", Appearance: "Swollen, pale, wearing whatever they drowned in.", Behaviour: "They walk inland at low tide, looking for home, and drag the living back with them.", Weaknesses: "Fire\nFresh water", Secrets: "They are all walking toward the Sunken Palace." });

  const ev = (title, date, involves, body = "", p = {}) => db.events.push({ id: uid(), title, date, end: null, involves: involves.map(k => E[k].id), body, tags: [], color: "", ...p });
  ev("Old Lumen is founded", { y: OK(212) }, ["lumen"], "Fishing towns on the hills above the bay become one city.");
  ev("Aldra is crowned", { y: OK(801), m: 3 }, ["aldra", "lumen", "crown"], "[[Aldra]] wears [[The Drowned Crown]] for the first time.");
  ev("The Flood", { y: OK(811), m: 6, d: 30 }, ["lumen", "palace", "aldra", "teodric", "corran", "crown"], "In one night the sea rises over [[Old Lumen]]. [[Teodric]] escapes on the last ship with the infant [[Corran]]. [[Aldra]] stays.", { color: "#7ea8f8" });
  ev("Saltmere is founded", { y: AF(40) }, ["saltmere"], "Survivors build on the hilltops that are left.");
  ev("The Saltward Guild is chartered", { y: AF(150) }, ["guild", "saltmere"]);
  ev("Brisa Vey drowns", { y: AF(309), m: 7, d: 2 }, ["brisa", "maren", "jory", "palace"], "Diving alone over the [[The Sunken Palace|palace]], against all advice.");
  ev("Maren borrows from Isel", { y: AF(309), m: 8 }, ["maren", "isel"], "Enough for a proper burial, at the Guild's usual rate.");
  ev("The crown surfaces", { y: AF(312), m: 4, d: 20 }, ["maren", "crown", "weir"], "[[Maren Vey]] finds it in her nets. Nets do not reach forty fathoms.", { color: "#e3c27a" });

  const sc = (title, status, pov, setting, date, body, summary = "") => ({ id: uid(), title, status, pov: pov ? E[pov].id : "", setting: setting ? E[setting].id : "", date, body, summary });
  db.books.push({ id: uid(), title: "The Drowned Crown", summary: "A smuggler finds a crown that should be at the bottom of the sea, and everyone she owes wants it.", target: 90000, chapters: [
    { id: uid(), title: "Low Tide", scenes: [
      sc("The Debt", "done", "maren", "weir", { y: AF(312), m: 4, d: 21 }, "The tide was out and the Weir smelled of it.\n\nMaren had the crown wrapped in oilcloth under the floor of the boat, and [[Isel Tarrow]]'s man had his boots on top of it.\n\n“The Guildmistress sends her regards,” he said. “And her arithmetic.”", "Isel's collector comes calling while the crown is hidden under his feet."),
      sc("Lantern at Gullwatch", "draft", "maren", "gullwatch", { y: AF(312), m: 4, d: 22 }, "[[Jory Vey|Jory]] had the lamp lit early. He always did when he was scared.", "Maren asks her brother to hide the crown."),
    ] },
    { id: uid(), title: "Under the Weir", scenes: [
      sc("The Diving Bell", "outline", "maren", "palace", null, "- Pell gets the Guild's old diving bell\n- They go down to the palace\n- The throne room is dry, and someone has lit the lamps", "Maren and Pell go down."),
      sc("What Isel Wants", "idea", "isel", "saltmere", null, "", "Isel's side of it."),
    ] },
  ] });

  const map = { id: uid(), name: "The Saltcoast", asset: null, w: 1600, h: 1100, notes: "", pins: [], regions: [] };
  const city = { id: uid(), name: "Saltmere", asset: null, w: 1600, h: 1100, notes: "", pins: [], regions: [] };
  const pin = (m, k, x, y, p = {}) => { const o = { id: uid(), x, y, entry: k ? E[k].id : "", label: "", map: "", ...p }; m.pins.push(o); return o; };
  pin(map, "saltmere", 0.42, 0.36, { map: city.id });
  pin(map, "gullwatch", 0.71, 0.22);
  pin(map, "palace", 0.38, 0.66);
  pin(map, "lumen", 0.5, 0.58);
  map.regions.push({ id: uid(), entry: "", label: "The Drowned Reach", color: "#7ea8f8", pts: [[0.24, 0.5], [0.62, 0.46], [0.72, 0.68], [0.55, 0.86], [0.28, 0.8]] });
  pin(city, "weir", 0.46, 0.7);
  pin(city, "guild", 0.56, 0.32);
  db.maps.push(map, city);

  db.sessions.push(
    { id: uid(), num: 1, title: "Salt and Silver", real: "2026-09-26", date: { y: AF(312), m: 4, d: 24 }, attendees: [E.kestrel.id, E.ansel.id], playing: false,
      prep: "- Open in the [[The Weir|Weir]] at low tide\n- [[Isel Tarrow|Isel]] hires the party to watch [[Maren Vey]]\n- If it drags: 1d4 [[Drowned]] come out of the water",
      recap: "The party took Isel's coin, lost Maren in the market and ended the night at [[Gullwatch]], where [[Jory Vey]] was very obviously hiding something.",
      route: [{ map: city.id, x: 0.46, y: 0.7, place: E.weir.id, at: Date.now() - 864e6 }, { map: map.id, x: 0.71, y: 0.22, place: E.gullwatch.id, at: Date.now() - 863e6 }] },
    { id: uid(), num: 2, title: "Forty Fathoms", real: "2026-10-03", date: { y: AF(312), m: 5, d: 2 }, attendees: [E.kestrel.id, E.ansel.id], playing: true,
      prep: "- Jory breaks, or doesn't\n- The [[Tidebound]] make their offer\n- Roll on [[Saltmere rumours]] when they go back to town", recap: "", route: [] });
  db.party = { map: map.id, x: 0.65, y: 0.3, place: E.gullwatch.id };
  db.quests.push(
    { id: uid(), title: "Watch the smuggler", status: "active", giver: E.isel.id, target: E.maren.id, body: "Find out what [[Maren Vey]] pulled out of the water. Report to the Guild house, not to Isel's man.", reward: "40 silver, and Isel's goodwill" },
    { id: uid(), title: "The throne room is dry", status: "open", giver: E.tamsin.id, target: E.palace.id, body: "[[Old Tamsin]] says someone has been lighting the lamps in [[The Sunken Palace]].", reward: "" });
  db.encounters.push({ id: uid(), name: "Low tide at the Weir", place: E.weir.id, notes: "They come out of the water one at a time. The third one is wearing a Guild badge.\n\nLoot: 2d10 silver, a waterlogged ledger page.", foes: [{ id: uid(), entry: E.drowned.id, name: "", count: 3 }, { id: uid(), entry: E.shark.id, name: "", count: 1, size: 2 }],
    battle: { asset: null, w: 18 * 70, h: 12 * 70, cell: 70, ox: 0, oy: 0, feet: 5, grid: true, tokens: {} } });
  db.tables.push({ id: uid(), name: "Saltmere rumours", rows: "3× A fisherman swears he saw lights under the water off Gullwatch.\n2× Guild collectors are asking after 1d4 missing debtors.\n2× The Tidebound are handing out bread at the docks, and asking names.\nA drowned man walked into the Weir at low tide and sat down at his old table.\nIsel Tarrow has hired divers. Nobody knows what for.\nThe Gullwatch lamp went out for 1d6 minutes last night." });
  db.notes.push({ id: uid(), title: "Open questions", body: "- Who has been lighting the lamps in [[The Sunken Palace]]?\n- Is [[Maren Vey]] of [[Corran]]'s line? (Don't decide yet.)\n- What does the [[The Drowned Crown|crown]] actually do?", tags: ["plot"], pinned: true, updated: Date.now() });
  db.updated = Date.now();
  return db;
}
