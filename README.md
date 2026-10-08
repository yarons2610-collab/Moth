# Moth

*Moth, a play on myth.* A worldbuilding and fiction notebook that can also run your world at the table.

- **Codex**: characters, places, factions, items, lore, religions, deities, magic systems, spells, languages, cultures and creatures, or any kind you define. Each kind has a full template of fields in sections (appearance, personality, background, secrets…) that you can change, with secret fields only you see; entries can add fields of their own, and have relationships, portraits and optional game stats.
- **Timeline** in the world's own calendar (eras and months), with characters' ages at every event.
- **Story**: books, chapters and scenes, and a writing view that saves as you type.
- **Map**: an uploaded image or blank parchment, with pins and regions tied to the codex, nested maps and a time slider.
- **Web** of relationships, and **family trees**.
- **Play**: the party, sessions, quests, encounters with an initiative tracker, dice and random tables.
- **Drawing**: draw world maps and battlemaps in the app, from scratch or over an image, with terrain brushes, floor tiles, walls, text and stamps (built in, or your own pictures). Drawings are kept as shapes, so they take kilobytes.
- **Battlemaps** for encounters, with tokens that snap to the grid, fog of war and hidden tokens.
- **A player screen** for the TV: a second window that shows only what you send it (a battlemap through its fog, a map without secret pins, a picture, a handout, read-aloud text). Your own window keeps everything.
- **Music**: Spotify, YouTube, SoundCloud or Apple Music playlists linked to encounters, played from a dock that stays put while you work.
- `[[Wiki links]]` everywhere, with backlinks on every page. Find anything with `Ctrl/⌘ K` or `/`.

It's a plain static site: no build step and no server. It works offline, can be installed on a phone, and keeps your world in your browser. To use it on more than one device, it syncs through a private GitHub repository (or a Gist), with pictures and drawings as their own files.

## At the table

Set the laptop's display to *extend* to the TV (not mirror), press 📺 and open the player screen, drag it onto the TV and click it once to go full screen. Anything with a 📺 button can be sent there; **Shift+B** blacks it out.

## Running it

Serve the folder with any static server (for example `npx http-server`), or turn on GitHub Pages for this repo (Settings → Pages → `main` / root).

## How the code is organised

`index.html` loads `js/*.js` in order. `core.js` holds the data, calendar, link registry, markdown, routing and modals; every other module registers itself with it:

- `addRoute(prefix, tab, view)` adds pages.
- `linkType(t, {list, names, info, href, text, edges})` tells `[[links]]`, backlinks, autocomplete and search about a kind of thing.
- `ENTITY_PANELS` adds boxes to an entry's page; `ENTITY_DELETE_HOOKS` tidies references when an entry is deleted.
- `INLINE_HOOKS` changes rendered text (this is how dice become tappable).

The world is one `DB` object in localStorage (`moth_db`). Images are kept in IndexedDB (`moth-assets`), and `DB` stores only their ids.
