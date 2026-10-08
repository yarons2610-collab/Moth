# Moth

*Moth, a play on myth.* A worldbuilding and fiction notebook that can also run your world at the table.

- **Codex**: characters, places, factions, items, lore and creatures, or any kind you define, each with its own fields, relationships, portraits and optional game stats.
- **Timeline** in the world's own calendar (eras and months), with characters' ages at every event.
- **Story**: books, chapters and scenes, and a writing view that saves as you type.
- **Map**: an uploaded image or blank parchment, with pins and regions tied to the codex, nested maps and a time slider.
- **Web** of relationships, and **family trees**.
- **Play**: the party, sessions, quests, encounters with an initiative tracker, dice and random tables.
- `[[Wiki links]]` everywhere, with backlinks on every page. Find anything with `Ctrl/⌘ K` or `/`.

It's a plain static site: no build step and no server. It works offline, can be installed on a phone, and keeps your world in your browser. To use it on more than one device, it can sync through a private GitHub Gist.

## Running it

Serve the folder with any static server (for example `npx http-server`), or turn on GitHub Pages for this repo (Settings → Pages → `main` / root).

## How the code is organised

`index.html` loads `js/*.js` in order. `core.js` holds the data, calendar, link registry, markdown, routing and modals; every other module registers itself with it:

- `addRoute(prefix, tab, view)` adds pages.
- `linkType(t, {list, names, info, href, text, edges})` tells `[[links]]`, backlinks, autocomplete and search about a kind of thing.
- `ENTITY_PANELS` adds boxes to an entry's page; `ENTITY_DELETE_HOOKS` tidies references when an entry is deleted.
- `INLINE_HOOKS` changes rendered text (this is how dice become tappable).

The world is one `DB` object in localStorage (`moth_db`). Images are kept in IndexedDB (`moth-assets`), and `DB` stores only their ids.
