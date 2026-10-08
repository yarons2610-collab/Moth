"use strict";
/* ── find anything ── Ctrl/⌘ K or / from anywhere. Searches names first, then
   the text inside everything the link registry knows about. */

ACT.find = () => {
  if (MODALS.some(m => m.el.querySelector(".find"))) return;
  modal({ title: "Find anything", cls: "find",
    body: `<input class="find-q" placeholder="A name, a word, a phrase…" autocomplete="off" data-links="no" autofocus><div class="find-res"></div>`,
    onOpen: (w, api) => {
      const q = $(".find-q", w), res = $(".find-res", w);
      let hits = [], sel = 0;
      const draw = () => {
        const s = norm(q.value);
        hits = [];
        if (s) for (const x of idx().items) {
          const sp = LINK_TYPES[x.t], ns = sp.names(x.it).map(norm);
          const score = ns.some(n => n === s) ? 0 : ns.some(n => n.startsWith(s)) ? 1 : ns.some(n => n.includes(s)) ? 2 : norm(sp.text?.(x.it)).includes(s) ? 3 : -1;
          if (score >= 0) hits.push({ ...x, score });
        }
        hits.sort((a, b) => a.score - b.score);
        hits = hits.slice(0, 30);
        sel = 0;
        res.innerHTML = hits.map((h, i) => {
          const inf = infoOf(h.t, h.it);
          let snip = "";
          if (h.score === 3) {
            const txt = plainLinks(LINK_TYPES[h.t].text(h.it)), at = norm(txt).indexOf(s);
            snip = `<small class="snip">…${esc(txt.slice(Math.max(0, at - 40), at))}<mark>${esc(txt.slice(at, at + s.length))}</mark>${esc(txt.slice(at + s.length, at + s.length + 60))}…</small>`;
          }
          return `<a class="find-hit ${i === 0 ? "on" : ""}" href="${inf.href}" style="--c:${inf.color || "var(--accent)"}"><span>${inf.icon || ""}</span><b>${esc(inf.title)}</b><small>${esc(inf.sub || "")}</small>${snip}</a>`;
        }).join("") || (s ? `<p class="empty">Nothing found. <a data-act="newFromLink" data-name="${esc(q.value.trim())}">Create “${esc(q.value.trim())}”</a></p>` : `<p class="muted">Codex entries, events, scenes, maps, sessions, quests, notes: everything.</p>`);
      };
      q.addEventListener("input", draw);
      q.addEventListener("keydown", e => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          sel = clamp(sel + (e.key === "ArrowDown" ? 1 : -1), 0, hits.length - 1);
          $$(".find-hit", res).forEach((a, i) => a.classList.toggle("on", i === sel));
          $$(".find-hit", res)[sel]?.scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter" && hits[sel]) { e.preventDefault(); location.hash = infoOf(hits[sel].t, hits[sel].it).href; api.close(); }
      });
      res.addEventListener("click", e => { if (e.target.closest("a")) setTimeout(api.close); });
      draw();
    } });
};
document.addEventListener("keydown", e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing && !MODALS.length)) { e.preventDefault(); ACT.find(); }
});
