"use strict";
/* ── the formatted writing box ── shows **bold**, *italics*, set-apart
   quotes (> …) and scene breaks as they look, the way a word processor
   does, while the text stays stored as Markdown.

   Each line of the text is one block in the box. A block remembers the
   exact line it was made from (data-md) and how it looked (data-html), and
   until you change it, that exact line is what's saved. So opening and
   writing in a scene never rewrites the lines you didn't touch. A line
   that wouldn't come back exactly as it was (stray asterisks, say) is
   shown as plain text, with its marks visible. */

const BREAK_RE = /^\s*(\*\s*\*\s*\*|-{3,}|\*{3,}|⁂)\s*$/;
function wysiInline(text) {
  return esc(text)
    .replace(/\*\*((?:[^*]|\*(?!\*))+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<i>$2</i>")
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<i>$2</i>");
}
function wysiLine(line) {
  const attr = `data-md="${esc(line)}"`;
  if (BREAK_RE.test(line)) return `<div class="brk" contenteditable="false" ${attr}>⁂</div>`;
  const q = line.match(/^>\s?(.*)$/);
  const text = q ? q[1] : line;
  let html = text ? wysiInline(text) : "<br>";
  // only show it formatted if it would be saved back exactly as it is
  const probe = document.createElement("div");
  probe.innerHTML = html;
  if ((q ? "> " : "") + wysiSerializeInline(probe) !== line && !(q && ">" + wysiSerializeInline(probe) === line)) html = text ? esc(text) : "<br>";
  return `<div class="${q ? "q" : ""}" ${attr} data-q="${q ? 1 : 0}">${html}</div>`;
}
function wysiHtml(md) { return String(md ?? "").replace(/\r/g, "").split("\n").map(wysiLine).join(""); }

// back to Markdown: bold and italics as marks, spaces kept outside them
function wysiSerializeInline(node) {
  let out = "";
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += n.nodeValue.replace(/ /g, " "); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName, st = n.style || {};
    if (tag === "BR") { out += "\n"; continue; }
    const inner = wysiSerializeInline(n);
    const bold = tag === "B" || tag === "STRONG" || /^(bold|[6-9]00)$/.test(st.fontWeight || "");
    const ital = tag === "I" || tag === "EM" || st.fontStyle === "italic";
    const wrap = (s, m) => { const lead = s.match(/^\s*/)[0], trail = s.slice(lead.length).match(/\s*$/)[0], core = s.slice(lead.length, s.length - trail.length); return core ? lead + m + core + m + trail : s; };
    out += bold && ital ? wrap(wrap(inner, "*"), "**") : bold ? wrap(inner, "**") : ital ? wrap(inner, "*") : inner;
  }
  return out;
}
function wysiSerialize(root) {
  const lines = [];
  let loose = null; // text typed straight into the box, outside any block
  const flushLoose = () => { if (loose) { lines.push(...wysiSerializeInline(loose).split("\n")); loose = null; } };
  for (const n of [...root.childNodes]) {
    if (n.nodeType === 1 && (n.tagName === "DIV" || n.tagName === "P")) {
      flushLoose();
      if (n.classList.contains("brk")) { lines.push(n.dataset.md ?? "* * *"); continue; }
      const isQ = n.classList.contains("q");
      // untouched: exactly the line it came from
      if (n.dataset.md != null && n.dataset.html === n.innerHTML && String(isQ ? 1 : 0) === n.dataset.q) { lines.push(n.dataset.md); continue; }
      let text = wysiSerializeInline(n);
      if (text.endsWith("\n")) text = text.slice(0, -1); // a block's closing <br>
      for (const l of text.split("\n")) lines.push(isQ && l.trim() ? "> " + l : l);
    } else {
      (loose ||= document.createElement("div")).append(n.cloneNode(true));
    }
  }
  flushLoose();
  return lines.join("\n");
}

// make a box live: onChange(markdown) on every edit
function wireWysi(el, onChange) {
  if (!el) return;
  try { document.execCommand("styleWithCSS", false, false); document.execCommand("defaultParagraphSeparator", false, "div"); } catch {}
  for (const d of el.children) d.dataset.html = d.innerHTML;
  if (!el.children.length) el.innerHTML = `<div><br></div>`;
  const empty = () => el.classList.toggle("is-empty", !el.textContent.trim() && !el.querySelector(".brk"));
  empty();
  el.addEventListener("input", () => { empty(); onChange(wysiSerialize(el)); });
  // pasting brings words, not someone else's fonts
  el.addEventListener("paste", e => {
    e.preventDefault();
    const t = e.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, t);
  });
}
const wysiFor = el => el?.closest?.(".fmt-host")?.querySelector(".wysi");
function wysiBlocks(el) {
  const sel = getSelection(); if (!sel.rangeCount) return [];
  const r = sel.getRangeAt(0), top = n => { while (n && n.parentNode !== el) n = n.parentNode; return n; };
  const a = top(r.startContainer), b = top(r.endContainer);
  if (!a) return [];
  const out = [];
  for (let n = a; n; n = n.nextElementSibling) { out.push(n); if (n === b || !b) break; }
  return out.filter(n => n.nodeType === 1);
}
function wysiCommand(el, f) {
  el.focus();
  if (f === "b") document.execCommand("bold");
  else if (f === "i") document.execCommand("italic");
  else if (f === "q") {
    const bs = wysiBlocks(el).filter(b => !b.classList.contains("brk"));
    const on = !bs.every(b => b.classList.contains("q"));
    for (const b of bs) b.classList.toggle("q", on);
    el.dispatchEvent(new Event("input"));
  } else if (f === "br") {
    const b = wysiBlocks(el).pop();
    const brk = Object.assign(document.createElement("div"), { className: "brk", contentEditable: "false", textContent: "⁂" });
    brk.dataset.md = "* * *";
    const next = document.createElement("div"); next.innerHTML = "<br>";
    if (b) b.after(brk, next); else el.append(brk, next);
    const r = document.createRange(); r.setStart(next, 0); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    el.dispatchEvent(new Event("input"));
  }
}
document.addEventListener("keydown", e => {
  const el = e.target.closest?.(".wysi");
  if (!el || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "b" || k === "i") { e.preventDefault(); wysiCommand(el, k); }
}, true);
