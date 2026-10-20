"use strict";
/* ── readable exports ── a book, or the whole world, as a Word document
   (.docx) you can open in Word, Pages, Google Docs or LibreOffice. Built
   here in the browser, with no library: a .docx is a zip of a few XML files.
   Exporting only reads the world; nothing in it changes. */

/* a zip with the files stored as they are (no compression needed) */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
    const head = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    const local = new Uint8Array([0x50, 0x4b, 3, 4, ...head, ...name]);
    parts.push(local, data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...head, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
    offset += local.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)]);
  return new Blob([...parts, ...central, end], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/* paragraphs → document.xml. A block is { s: style, runs: [{ t, b, i }], br }
   (style: Title, Subtitle, Heading1-3, Quote, List, Meta, Break, or "" for body). */
const xesc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
function runXml(r) {
  const props = (r.b ? "<w:b/>" : "") + (r.i ? "<w:i/>" : "");
  return String(r.t).split("\n").map((line, k) => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${k ? "<w:br/>" : ""}<w:t xml:space="preserve">${xesc(line)}</w:t></w:r>`).join("");
}
function paraXml(p) {
  if (p.page) return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  const ppr = (p.s ? `<w:pStyle w:val="${p.s}"/>` : "") + (p.newPage ? "<w:pageBreakBefore/>" : "");
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ""}${(p.runs || []).map(runXml).join("")}</w:p>`;
}
// **bold**, *italic*, _italic_ and [[links]] (written as their words) into runs
function mdRuns(text) {
  const plain = String(text || "").replace(LINK_RE, (m, a, b) => (b || a).trim()).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)").replace(/`([^`]+)`/g, "$1");
  // bold first (it may hold italics), then italics inside each piece
  const italics = (t, b) => {
    const out = [], re = /(^|[^*\w])\*([^*\n]+)\*(?!\w)|(^|[^\w])_([^_\n]+)_(?!\w)/g;
    let last = 0, m;
    while ((m = re.exec(t))) {
      const lead = m[1] ?? m[3] ?? "", start = m.index + lead.length;
      if (start > last) out.push({ t: t.slice(last, start), b });
      out.push({ t: m[2] ?? m[4], i: true, b });
      last = m.index + m[0].length;
    }
    if (last < t.length) out.push({ t: t.slice(last), b });
    return out;
  };
  const runs = [], re = /\*\*((?:[^*]|\*(?!\*))+?)\*\*/g;
  let last = 0, m;
  while ((m = re.exec(plain))) {
    if (m.index > last) runs.push(...italics(plain.slice(last, m.index), false));
    runs.push(...italics(m[1], true));
    last = m.index + m[0].length;
  }
  if (last < plain.length) runs.push(...italics(plain.slice(last), false));
  return runs.filter(r => r.t);
}
// the same markdown the app shows, as paragraphs (lines inside a paragraph stay lines)
function mdBlocks(src, shift = 0) {
  const out = [];
  let para = [], quote = [];
  const flush = () => {
    if (para.length) out.push({ s: "", runs: mdRuns(para.join("\n")) });
    if (quote.length) out.push({ s: "Quote", runs: mdRuns(quote.join("\n")) });
    para = []; quote = [];
  };
  for (const raw of String(src || "").replace(/\r/g, "").split("\n")) {
    const l = raw.trimEnd();
    let m;
    if (!l.trim()) { flush(); continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { flush(); out.push({ s: "Heading" + Math.min(3, m[1].length + shift), runs: mdRuns(m[2]) }); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { flush(); out.push({ s: "Break", runs: [{ t: "⁂" }] }); continue; }
    if ((m = l.match(/^>\s?(.*)/))) { if (para.length) { const q = quote; quote = []; flush(); quote = q; } quote.push(m[1]); continue; }
    if ((m = l.match(/^\s*([-*•]|\d+[.)])\s+(.*)/))) { flush(); out.push({ s: "List", runs: [{ t: (/\d/.test(m[1]) ? m[1] + " " : "•\t") }, ...mdRuns(m[2])] }); continue; }
    if (quote.length) flush();
    para.push(l);
  }
  flush();
  return out;
}
function docxBlob(blocks, title) {
  const paras = [];
  let pb = false;
  for (const b of blocks) { if (b.page) { pb = paras.length > 0; continue; } paras.push(pb ? { ...b, newPage: true } : b); pb = false; }
  const body = paras.map(paraXml).join("");
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const st = (id, name, ppr, rpr, extra = "") => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:eastAsia="Georgia" w:cs="Georgia"/><w:sz w:val="23"/><w:szCs w:val="23"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${st("Title", "Title", `<w:spacing w:before="1800" w:after="240"/><w:jc w:val="center"/>`, `<w:sz w:val="56"/><w:szCs w:val="56"/>`, "<w:qFormat/>")}
${st("Subtitle", "Subtitle", `<w:jc w:val="center"/><w:spacing w:after="600"/>`, `<w:i/><w:color w:val="666666"/><w:sz w:val="26"/>`, "<w:qFormat/>")}
${st("Heading1", "heading 1", `<w:keepNext/><w:spacing w:before="480" w:after="200"/><w:outlineLvl w:val="0"/>`, `<w:b/><w:sz w:val="36"/><w:szCs w:val="36"/>`, "<w:qFormat/>")}
${st("Heading2", "heading 2", `<w:keepNext/><w:spacing w:before="360" w:after="140"/><w:outlineLvl w:val="1"/>`, `<w:b/><w:sz w:val="28"/><w:szCs w:val="28"/>`, "<w:qFormat/>")}
${st("Heading3", "heading 3", `<w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="2"/>`, `<w:b/><w:i/><w:sz w:val="24"/>`, "<w:qFormat/>")}
${st("Quote", "Quote", `<w:ind w:left="720" w:right="720"/>`, `<w:i/><w:color w:val="444444"/>`, "<w:qFormat/>")}
${st("List", "List Paragraph", `<w:ind w:left="720" w:hanging="360"/><w:spacing w:after="60"/>`, ``)}
${st("Meta", "Details", `<w:spacing w:after="40"/>`, `<w:sz w:val="20"/><w:color w:val="555555"/>`)}
${st("Break", "Scene break", `<w:jc w:val="center"/><w:spacing w:before="200" w:after="200"/>`, ``)}
</w:styles>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  return zipStore([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xesc(title)}</dc:title><dc:creator>Moth</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>` },
    { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "word/styles.xml", data: styles },
    { name: "word/document.xml", data: doc },
  ]);
}
const P = (s, t, more = {}) => ({ s, runs: typeof t === "string" ? [{ t }] : t, ...more });
const PAGE = { page: true };

/* ── a book: title, then each chapter on a new page, its scenes in order ── */
function bookBlocks(b, { summaries = false } = {}) {
  const out = [P("Title", b.title || "Untitled")];
  if (b.summary) out.push(P("Subtitle", mdRuns(b.summary)));
  (b.chapters || []).forEach((ch, ci) => {
    out.push(PAGE, P("Heading1", `${ci + 1}. ${ch.title || "Chapter " + (ci + 1)}`));
    if (summaries && ch.summary?.trim()) out.push(...mdBlocks(ch.summary, 2).map(x => x.s ? x : { ...x, s: "Meta" }));
    (ch.scenes || []).forEach((sc, si) => {
      if (si) out.push(P("Break", "⁂"));
      if (summaries) out.push(P("Heading3", sc.title || "Scene"), ...(sc.summary ? [P("Meta", mdRuns(sc.summary))] : []));
      out.push(...mdBlocks(sc.body, 1));
    });
  });
  return out;
}
function exportBookDocx(b, opts) {
  const blob = docxBlob(bookBlocks(b, opts), b.title);
  downloadBlob(fileSlug(b.title) + ".docx", blob);
}

// a field's value as words, whatever its type
function fieldPlain(f, v) {
  switch (f.type) {
    case "date": return fmtDate(v);
    case "yesno": return v ? "Yes" : "No";
    case "link": case "links": return (Array.isArray(v) ? v : [v]).map(id => byId(DB.entries, id)?.name).filter(Boolean).join(", ");
    default: return String(v ?? "");
  }
}
/* ── the whole world: codex by kind, history, the story ── */
function worldBlocks({ secrets = true, story = true } = {}) {
  const out = [P("Title", DB.world.name), P("Subtitle", `Written in Moth · ${new Date().toLocaleDateString()}`)];
  // the codex, kind by kind, each entry with its details and article
  out.push(PAGE, P("Heading1", "Codex"));
  for (const k of DB.kinds) {
    const list = DB.entries.filter(e => e.kind === k.id).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    out.push(P("Heading2", `${k.icon} ${kindPlural(k.name)}`));
    for (const e of list) {
      out.push(P("Heading3", e.name + (e.aliases?.length ? ` (also ${e.aliases.join(", ")})` : "")));
      const life = lifespan(e);
      if (life) out.push(P("Meta", life));
      if (e.summary) out.push(P("", [{ t: plainLinks(e.summary), i: true }]));
      for (const [sec, fs] of fieldSections(k.fields)) {
        const got = fs.filter(f => !isEmptyVal(e.fields?.[f.id]) && (secrets || !f.secret));
        if (!got.length) continue;
        if (sec) out.push(P("Meta", [{ t: sec.toUpperCase(), b: true }]));
        for (const f of got) {
          const text = fieldPlain(f, e.fields[f.id]);
          const label = { t: f.name + (f.secret ? " (secret)" : "") + ": ", b: true };
          if (/\n/.test(text) && ["long", "list", "glossary"].includes(f.type)) { out.push(P("Meta", [label])); out.push(...mdBlocks(text, 2)); }
          else out.push(P("Meta", [label, ...mdRuns(text)]));
        }
      }
      for (const x of e.extra || []) out.push(P("Meta", [{ t: x.name + ": ", b: true }, ...mdRuns(x.value)]));
      const rels = relsOf(e).filter(x => x.own);
      if (rels.length) out.push(P("Meta", [{ t: "Relationships: ", b: true }, { t: rels.map(({ r, to }) => `${r.label || REL_LABEL[relType(r)] || "related to"} ${to.name}`).join("; ") }]));
      out.push(...mdBlocks(e.body, 2));
    }
  }
  // history, in order
  const dated = DB.events.filter(ev => ev.date).sort((a, b) => dateKey(a.date) - dateKey(b.date)), undated = DB.events.filter(ev => !ev.date);
  if (DB.events.length) {
    out.push(PAGE, P("Heading1", "Timeline"));
    for (const ev of [...dated, ...undated]) {
      out.push(P("Heading3", ev.title), P("Meta", ev.date ? fmtDate(ev.date) + (ev.end ? " – " + fmtDate(ev.end) : "") : "Not dated yet"));
      out.push(...mdBlocks(ev.body, 2));
    }
  }
  // the story's threads and themes, then each book
  if (story && (DB.threads.length || DB.themes.length)) {
    out.push(PAGE, P("Heading1", "Story planning"));
    for (const t of DB.themes) { out.push(P("Heading3", "Theme: " + t.name)); for (const [l, v] of [["Question", t.question], ["What the story says", t.statement], ["The other side", t.counter], ["Motifs", t.motifs]]) if (v) out.push(P("Meta", [{ t: l + ": ", b: true }, ...mdRuns(v)])); }
    for (const t of DB.threads) {
      out.push(P("Heading3", `${THREAD_KINDS[t.kind]?.[0] || "Thread"}: ${t.name}`));
      if (t.summary) out.push(...mdBlocks(t.summary, 2));
      for (const [k, l] of ARC_FIELDS[t.kind || "other"] || []) if (t.arc?.[k]) out.push(P("Meta", [{ t: l + ": ", b: true }, ...mdRuns(t.arc[k])]));
      for (const b of t.beats || []) out.push(P("List", [{ t: (b.done ? "☑" : "☐") + "\t" }, ...mdRuns(b.text)]));
    }
  }
  if (story) for (const b of DB.books) out.push(PAGE, ...bookBlocks(b).map(x => x.s === "Title" ? P("Heading1", x.runs) : x.s === "Heading1" ? P("Heading2", x.runs) : x.s === "Subtitle" ? P("Meta", x.runs) : x).filter(x => !x.page));
  return out;
}
function exportWorldDocx(opts) {
  downloadBlob(`${fileSlug(DB.world.name)}-${new Date().toISOString().slice(0, 10)}.docx`, docxBlob(worldBlocks(opts), DB.world.name));
}
function downloadBlob(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
