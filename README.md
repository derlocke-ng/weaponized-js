# weaponized.js

Peer-to-peer webtools over [nostr](https://nostr.com). Every tool runs entirely in the browser and syncs over relays you choose: no sign-up needed, no server of ours, no tracking, and everything is encrypted before it leaves your device. Install it as a web app from the landing page.

**Live:** <https://derlocke-ng.github.io/weaponized-js/>

| Tool | What it does | Built with |
|---|---|---|
| [**Loadout**](apps/loadout) · [open](https://derlocke-ng.github.io/weaponized-js/loadout/) | Shared grocery/to-do lists, household inventory and markdown notes across devices; end-to-end encrypted, rentry-style links, survives relays forgetting | nostr, AES-GCM |
| [**Payload**](apps/payload) · [open](https://derlocke-ng.github.io/weaponized-js/payload/) | Send files straight to another online browser; every 64 KB piece checked with SHA-256 | gun signaling, WebRTC (moving to nostr) |
| [**pongjs**](apps/pongjs) · [open](https://derlocke-ng.github.io/weaponized-js/pongjs/) | Two-player Pong between browsers: link, QR or open-games lobby | gun signaling, WebRTC (moving to nostr) |
| [EnigmaJS](apps/enigmajs) · [open](https://derlocke-ng.github.io/weaponized-js/enigmajs/) | Encrypted, ephemeral group chat rooms | gun, SEA, Vue + Vite |
| [DevBoard](apps/devboard) · [open](https://derlocke-ng.github.io/weaponized-js/devboard/) | Freelancer noticeboard with signed posts and votes | gun, SEA, single HTML file |

Coming: **Uplink** (chat between accounts and ephemeral rooms) and **Outpost** (grow reports with an Instagram-style feed, and a marketplace for seeds). EnigmaJS and DevBoard are legacy and will go once Uplink exists.

**One account, one settings page.** Sign in or create an account on the landing page (username + password, or a nostr key) and every tool uses it; boards made on a device before signing in are carried over. Without an account each device simply uses its own key. The site's settings page holds everything that is not specific to one tool: account and key export, relays with live status, backup and restore of everything your devices know, language and appearance (which follow your account), hidden apps, and wiping the device. Each tool keeps only its own settings.

Every page is translated: English, German, French, Spanish, Italian, Dutch, Polish and Portuguese, picked from the browser's language with a one-time prompt. Adding a language is one JSON file per app (see `apps/shared/i18n.js`).

The suite started on gun.js and is moving to nostr app by app. [`docs/architecture.md`](docs/architecture.md) explains why, how accounts work without any registry, the event kinds, and the plan.

## Layout

```
hub/                 the landing page and the settings page (served at /)
apps/<name>/         one folder per tool (served at /<name>/)
apps/shared/         the shared core: nostr bundle, relay pool, local event store,
                     accounts, sync/heal; plus gun and the WebRTC room code still
                     used by Payload and pongjs
docs/                architecture decision record
scripts/             site build, dev relays (nostr and gun), static server, vendoring
test/                unit tests (node --test) and end-to-end tests per app
.github/workflows/   test, build and deploy to GitHub Pages
```

`scripts/build-site.sh` assembles `_site/`: it copies `hub/` to the root, builds every app that has a `build` script in its `package.json` (EnigmaJS) and copies the rest as they are. Vite apps use `base: './'` so they work from any subfolder.

### Adding a tool

1. Put it in `apps/<name>/`. A static app needs an `index.html`; a Vite app needs `npm run build` to produce `dist/` with `base: './'`.
2. Import what you need from `apps/shared/` (see `apps/loadout/js/net.js` for the wiring) and register your event kinds in `apps/shared/events.js`. Put UI strings in `apps/<name>/locales/en.json` and use `t()` from `apps/shared/i18n.js`; the other languages follow the English keys (a unit test checks).
3. Add a card to `hub/index.html` and your files to the service workers' shell lists.
4. Push to `main` — the workflow builds and deploys everything.

## Development

```sh
npm install
npm test                       # unit tests
npm run relay:nostr            # local nostr relay on ws://localhost:7777 (data in .nostr/)
npm run relay                  # local gun relay on http://localhost:8765/gun (Payload, pongjs)
npm run serve -- apps 8080     # serve the apps unbuilt on http://localhost:8080/
npm run build && npm run serve # or: assemble _site/ and serve it
npm run test:e2e               # Loadout, the hub, Payload and pongjs in real browsers (needs Chromium)
npm run vendor                 # rebuild apps/shared/nostr.mjs, vendor files and icon sprites
```

In Loadout, add `ws://localhost:7777` under *Account → Relays* to work against the local relay.

## Deployment

GitHub Pages, built by `.github/workflows/deploy.yml` on every push to `main` (pull requests only run the tests and the build). In the repository settings set **Pages → Source** to **GitHub Actions**.

## License

[GPL-3.0-or-later](LICENSE). The legacy apps keep their own: DevBoard is GPL-3.0 and EnigmaJS is PolyForm Noncommercial 1.0.0 (see their folders). Third-party code is listed in `apps/shared/LICENSES.md` and `apps/loadout/vendor/LICENSES.md`.
