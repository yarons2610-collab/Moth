"use strict";
/* ── adding a world into this one ── Import → "Add to this world". Things are
   matched to what's already here so nothing is doubled:
   - kinds by id or name, and their fields by name (missing fields are added);
   - codex entries by id, then by name or alias. A matched entry keeps what
     you have; its empty fields are filled in, tags, aliases, relationships
     and extra fields are added, and where the import says something
     different, the imported take is kept as a version of the entry (along
     with any versions the import brings), never written over yours;
   - everything else (events, books, maps, notes, sessions…) by id, so
     importing the same file twice adds nothing the second time.
   Every reference in the import (links, pins, POVs, note links…) is pointed
   at the entries it matched. */

function mergeWorld(incoming, { calendar = false } = {}) {
  const inc = normalizeDB(structuredClone(incoming));
  const sum = { added: [], merged: [], versions: 0, kinds: [], fields: 0, other: {} };

  // kinds and fields
  const kindMap = new Map(), fieldMap = new Map();
  for (const ik of inc.kinds) {
    let lk = byId(DB.kinds, ik.id) || DB.kinds.find(k => norm(k.name) === norm(ik.name));
    if (!lk) {
      lk = structuredClone(ik);
      if (byId(DB.kinds, lk.id)) lk.id = fileSlug(lk.name) + "-" + uid().slice(0, 4);
      DB.kinds.push(lk); sum.kinds.push(lk.name);
      ik.fields.forEach(f => fieldMap.set(f.id, f.id));
    } else for (const f of ik.fields) {
      let lf = lk.fields.find(x => norm(x.name) === norm(f.name));
      if (!lf) { lf = structuredClone(f); if (lk.fields.some(x => x.id === lf.id)) lf.id = uid(); lk.fields.push(lf); sum.fields++; }
      fieldMap.set(f.id, lf.id);
    }
    kindMap.set(ik.id, lk.id);
  }
  const tf = o => o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [fieldMap.get(k) || k, v])) : o;

  // which imported entries are already here
  const byName = new Map();
  for (const e of DB.entries) for (const n of [e.name, ...(e.aliases || [])]) if (!byName.has(norm(n))) byName.set(norm(n), e);
  const idMap = new Map(), match = new Map();
  for (const ie of inc.entries) {
    const le = byId(DB.entries, ie.id) || [ie.name, ...(ie.aliases || [])].map(n => byName.get(norm(n))).find(Boolean);
    if (le) { idMap.set(ie.id, le.id); match.set(ie.id, le); }
  }
  // point every reference in the import at the entries it matched
  const remap = v => {
    if (typeof v === "string") {
      if (idMap.has(v)) return idMap.get(v);
      const m = v.match(/^(e|pc):(.+)$/);
      return m && idMap.has(m[2]) ? m[1] + ":" + idMap.get(m[2]) : v;
    }
    if (Array.isArray(v)) return v.map(remap);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]));
    return v;
  };

  for (const raw of inc.entries) {
    const le = match.get(raw.id), ie = remap(raw);
    ie.kind = kindMap.get(ie.kind) || ie.kind;
    ie.fields = tf(ie.fields) || {};
    for (const v of ie.versions || []) if (v.data) v.data.fields = tf(v.data.fields) || {};
    if (!le) { DB.entries.push(ie); sum.added.push(ie.name); continue; }
    // already here: keep what's here, fill what's empty, keep differences as versions
    const before = snapshot(le);
    let differs = false;
    for (const k of ["summary", "body", "start", "end", "portrait", "token", "color", "stats"]) {
      if (isEmptyVal(ie[k])) continue;
      if (isEmptyVal(le[k])) le[k] = ie[k];
      else if (JSON.stringify(le[k]) !== JSON.stringify(ie[k])) differs = true;
    }
    le.fields ||= {};
    for (const [f, v] of Object.entries(ie.fields)) {
      if (isEmptyVal(v)) continue;
      if (isEmptyVal(le.fields[f])) le.fields[f] = v;
      else if (JSON.stringify(le.fields[f]) !== JSON.stringify(v)) differs = true;
    }
    le.aliases = [...new Set([...(le.aliases || []), ...(ie.aliases || [])])].filter(a => norm(a) !== norm(le.name));
    if (norm(ie.name) !== norm(le.name) && !le.aliases.some(a => norm(a) === norm(ie.name))) le.aliases.push(ie.name);
    le.tags = [...new Set([...(le.tags || []), ...(ie.tags || [])])];
    le.pc ||= ie.pc;
    for (const x of ie.extra || []) if (!(le.extra || []).some(y => norm(y.name) === norm(x.name))) (le.extra ||= []).push(x);
    for (const r of ie.rels || []) if (r.to !== le.id && !(le.rels || []).some(y => y.to === r.to && norm(y.label) === norm(r.label))) (le.rels ||= []).push({ ...r, id: uid() });
    le.versions ||= [];
    // what you had before is the live version; the import's take, if it differs, sits beside it
    // (unless that take is already here, from importing the same file before)
    const takeName = ie.versionName || "Imported";
    if (differs && !le.versions.some(v => v.name === takeName) && le.versionName !== takeName) {
      const take = { ...before, ...Object.fromEntries(["summary", "body", "start", "end", "portrait", "token", "color", "stats"].filter(k => !isEmptyVal(ie[k])).map(k => [k, ie[k]])) };
      take.fields = { ...before.fields, ...Object.fromEntries(Object.entries(ie.fields).filter(([, v]) => !isEmptyVal(v))) };
      le.versions.push({ id: uid(), name: takeName, created: Date.now(), data: structuredClone(take) });
      sum.versions++;
    }
    for (const v of ie.versions || []) if (!le.versions.some(y => y.name === v.name) && le.versionName !== v.name) { le.versions.push({ ...v, id: uid() }); sum.versions++; }
    // the live version: yours if it differed from the import, otherwise it now
    // is the import's take, filled into an entry that was (nearly) empty
    if (!le.versionName && le.versions.length) le.versionName = differs ? "Written in Moth" : takeName;
    le.updated = Date.now();
    sum.merged.push(le.name);
  }

  // everything else: added unless it's already here
  for (const k of ["events", "books", "notes", "maps", "sessions", "quests", "encounters", "tables", "handouts", "stamps"]) {
    let n = 0;
    for (const raw of inc[k]) {
      if (byId(DB[k], raw.id)) continue;
      if (k === "events" && DB.events.some(ev => norm(ev.title) === norm(raw.title) && JSON.stringify(ev.date) === JSON.stringify(raw.date))) continue;
      DB[k].push(remap(raw)); n++;
    }
    if (n) sum.other[k] = n;
  }
  if (calendar) DB.world = { ...DB.world, eras: inc.world.eras, months: inc.world.months, now: inc.world.now };
  if (/^untitled world$/i.test(DB.world.name) && inc.world.name) DB.world.name = inc.world.name;
  IDX = null;
  return sum;
}

// Import: add to this world, or replace it
ACT.importWorld = () => {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".json,application/json";
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { return toast("That file isn't a Moth export"); }
    const db = data.db || (data.entries ? data : null);
    if (!db) return toast("That file isn't a Moth export");
    const dated = DB.events.some(e => e.date) || DB.entries.some(e => e.start || e.end);
    const calLabel = (db.world?.eras || []).map(e => e.name).join(", ");
    modal({ title: `Import “${db.world?.name || f.name}”`,
      body: `<p>${plural((db.entries || []).length, "codex entry")}, ${plural((db.events || []).length, "event")}, ${plural((db.maps || []).length, "map")}, ${plural((db.books || []).length, "book")} and ${plural((db.notes || []).length, "note")}.</p>
        <label class="check"><input type="radio" name="how" value="add" checked> <span><b>Add to this world.</b> Anything already here (matched by name) keeps what you've written: its empty fields are filled in, and where the import says something different it's kept as a version you can compare and switch to.</span></label>
        <label class="check"><input type="radio" name="how" value="replace"> <span><b>Replace this world</b> with the import.</span></label>
        ${calLabel ? `<label class="check"><input type="checkbox" name="calendar" ${dated ? "" : "checked"}> Use the import's calendar (${esc(calLabel)})</label>` : ""}`,
      buttons: [{ label: "Cancel" }, { label: "Import", cls: "accent", act: async w => {
        const v = formVals(w);
        for (const [id, d] of Object.entries(data.assets || {})) if (!hasAsset(id)) await assetPut(d, id);
        if (v.how === "replace") {
          if (!await ask("Replace this world?", `“${esc(DB.world.name)}” is replaced on this device${syncOn() ? " and on GitHub" : ""}. Export first if you want to keep it.`, "Replace", "danger")) return;
          DB = normalizeDB(db);
          commit();
          return toast("Imported " + DB.world.name);
        }
        const snap = JSON.stringify(DB);
        const s = mergeWorld(db, { calendar: v.calendar });
        commit();
        const other = Object.entries(s.other).map(([k, n]) => plural(n, k.replace(/s$/, ""))).join(", ");
        modal({ title: "Imported", body: `<ul class="import-sum">
            <li><b>${plural(s.added.length, "new entry")}</b>${s.added.length ? `: ${esc(s.added.slice(0, 12).join(", "))}${s.added.length > 12 ? "…" : ""}` : ""}</li>
            ${s.merged.length ? `<li><b>${plural(s.merged.length, "entry")} you already had</b>, filled in: ${esc(s.merged.join(", "))}. What you'd written stays live${s.versions ? `; ${plural(s.versions, "other take")} kept as versions (⎇ on each entry)` : ""}.</li>` : ""}
            ${other ? `<li>${esc(other)}</li>` : ""}
            ${s.kinds.length ? `<li>New kinds: ${esc(s.kinds.join(", "))}</li>` : ""}${s.fields ? `<li>${plural(s.fields, "new field")} added to your kinds</li>` : ""}</ul>`,
          buttons: [{ label: "Undo the import", act: () => { DB = normalizeDB(JSON.parse(snap)); commit(); toast("Import undone"); } }, { label: "Done", cls: "accent" }] });
      } }] });
  };
  inp.click();
};
