# DevBoard — the freelancer noticeboard

Part of [weaponized.js](../../README.md). A public noticeboard on nostr: pin that you are hiring or available, signed with your key, voted on by peers, gone when it expires. No server of ours and no sign-up; the suite's one account, block list and settings apply.

**Live:** https://derlocke-ng.github.io/weaponized-js/devboard/

## What a note is

- A **kind 30810** addressable nostr event: a `d` tag per note, an `expiration` tag (NIP-40) between 24 hours and 30 days, one `t` tag per skill, and JSON content `{ type: "hiring" | "available", title, text, tags, rate, contact }`. Editing republishes under the same `d`; deleting publishes a `{ "del": 1 }` tombstone.
- **Proof of work** (NIP-13): a note needs 16 leading zero bits in its id, votes and reports 8. The shared engine in `apps/shared/pow.js` mines in parallel workers with whichever SHA-256 is faster in that browser (the bundled one, or the native one where the JIT is off, as in Tor Browser), so a note takes a fraction of a second on a laptop and under a second on a phone, while a flood still costs hours of CPU. Events without the work are not shown, whatever a relay accepts.
- **Votes** are NIP-25 reactions (`+` or `-`; one per person and note, the newest wins, empty content takes a vote back). **Reports** are NIP-56 events (kind 1984) carrying the note's address.
- **Saved notes** live in the account's encrypted settings (kind 30791, `d` = `devboard`) and follow you to every device.

## Anti-spam, applied by every reader

Three live notes per person; the newest count and the rest collapse. Notes voted down to −5 collapse, as do notes three or more people reported. Blocked people (the suite's encrypted NIP-51 mute list) disappear with their notes, votes and reports. Ten votes per half minute. Because each client applies the rules itself, a relay that lets spam through still cannot put it on your board.

## Files

- `index.html`, `devboard.js`, `devboard.css` — the app, built on `apps/shared/` (design library, app shell, relays, sync, i18n, moderation).
- The settings view (`#/settings`, behind the account button) — defaults for new notes (type, contact, duration; saved in the account), collapsed notes shown opened, and the cores to mine with.
- `locales/` — strings in the suite's eight languages.

## Testing

`npm test` covers the shared pieces. `node test/e2e/devboard.mjs` runs several browsers against a local relay; the test sets `localStorage` key `devboard.pow` to lower the difficulty, which readers honour only on that device.

## License

GPL-3.0-or-later, like the rest of the suite.
