# weaponized.js

Peer-to-peer webtools armed with [gun.js](https://gun.eco). Every tool runs entirely in the browser and syncs over public gun relays: no accounts to make, no server of ours, no tracking.

**Live:** <https://derlocke-ng.github.io/weaponized-js/>

| Tool | What it does | Built with |
|---|---|---|
| [**Loadout**](apps/loadout) · [open](https://derlocke-ng.github.io/weaponized-js/loadout/) | Shared grocery/to-do lists, household inventory and markdown notes across devices; end-to-end encrypted, rentry-style links, survives relays forgetting | gun, SEA certificates |
| [**Payload**](apps/payload) · [open](https://derlocke-ng.github.io/weaponized-js/payload/) | Send files straight to another online browser; every 64 KB piece checked with SHA-256 | gun signaling, WebRTC |
| [**pongjs**](apps/pongjs) · [open](https://derlocke-ng.github.io/weaponized-js/pongjs/) | Two-player Pong between browsers: link, QR or open-games lobby | gun signaling, WebRTC |
| [EnigmaJS](apps/enigmajs) · [open](https://derlocke-ng.github.io/weaponized-js/enigmajs/) | Encrypted, ephemeral group chat rooms | gun, SEA, Vue + Vite |
| [DevBoard](apps/devboard) · [open](https://derlocke-ng.github.io/weaponized-js/devboard/) | Freelancer noticeboard with signed posts and votes | gun, SEA, single HTML file |

DevBoard, EnigmaJS and pongjs were merged in from their own repositories with their full git history; pongjs has since been rebuilt on gun.

Payload and pongjs share [`apps/shared/p2p.js`](apps/shared/p2p.js): a link secret names a room, gun relays carry presence and encrypted signaling, and data flows over a direct WebRTC data channel — or, when no direct path exists (two phones on mobile data, strict NATs), as encrypted frames through gun.

## Layout

```
hub/                 the landing page (served at /)
apps/<name>/         one folder per tool (served at /<name>/)
apps/shared/         gun and the peer-to-peer room code used by Payload and pongjs
scripts/             site build, local relay, static server, vendoring
test/                unit tests (node --test) and end-to-end tests per app
.github/workflows/   test, build and deploy to GitHub Pages
```

`scripts/build-site.sh` assembles `_site/`: it copies `hub/` to the root, builds every app that has a `build` script in its `package.json` (EnigmaJS) and copies the rest as they are. Vite apps use `base: './'` so they work from any subfolder.

### Adding a tool

1. Put it in `apps/<name>/`. A static app needs an `index.html`; a Vite app needs `npm run build` to produce `dist/` with `base: './'`.
2. Add a card to `hub/index.html`.
3. Push to `main` — the workflow builds and deploys everything.

## Development

```sh
npm install
npm test                       # unit tests
npm run build                  # assemble _site/
npm run serve                  # serve _site/ on http://localhost:8080
npm run relay                  # local gun relay on http://localhost:8765/gun
npm run test:e2e               # Loadout, Payload and pongjs in real browsers (needs Chromium)
```

## Deployment

GitHub Pages, built by `.github/workflows/deploy.yml` on every push to `main` (pull requests only run the tests and the build). In the repository settings set **Pages → Source** to **GitHub Actions**.

## Licenses

Each tool keeps its own license: DevBoard is GPL-3.0 and EnigmaJS is PolyForm Noncommercial 1.0.0 (see their folders). Third-party files used by Loadout are listed in `apps/loadout/vendor/LICENSES.md`.
