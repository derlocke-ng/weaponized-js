# weaponized.js

Peer-to-peer webtools armed with [gun.js](https://gun.eco). Every tool runs entirely in the browser and syncs over public gun relays: no accounts to make, no server of ours, no tracking.

**Live:** <https://derlocke-ng.github.io/weaponized-js/>

| Tool | What it does | Built with |
|---|---|---|
| [**Loadout**](apps/loadout) · [open](https://derlocke-ng.github.io/weaponized-js/loadout/) | Shared grocery/to-do lists, household inventory and markdown notes across devices; encrypted or public, rentry style | gun, SEA certificates, vanilla JS |
| [EnigmaJS](apps/enigmajs) · [open](https://derlocke-ng.github.io/weaponized-js/enigmajs/) | Encrypted, ephemeral group chat rooms | gun, SEA, Vue + Vite |
| [DevBoard](apps/devboard) · [open](https://derlocke-ng.github.io/weaponized-js/devboard/) | Freelancer noticeboard with signed posts and votes | gun, SEA, single HTML file |
| [gun-bin](apps/gun-bin) · [open](https://derlocke-ng.github.io/weaponized-js/gun-bin/) | Passphrase-encrypted pastebin with expiry and burn-after-reading | gun, SEA, Vite |
| [gunfile](apps/gunfile) · [open](https://derlocke-ng.github.io/weaponized-js/gunfile/) | Stream encrypted files over gun relays, eight lanes in parallel | gun, WebCrypto |
| [gun-share](apps/gun-share) · [open](https://derlocke-ng.github.io/weaponized-js/gun-share/) | Encrypted file drop with a live log and sender heartbeat | gun, WebCrypto |
| [pongjs](apps/pongjs) · [open](https://derlocke-ng.github.io/weaponized-js/pongjs/) | Two-player Pong over WebRTC (the one that isn't gun) | PeerJS |

DevBoard, EnigmaJS and pongjs were merged in from their own repositories with their full git history.

## Layout

```
hub/                 the landing page (served at /)
apps/<name>/         one folder per tool (served at /<name>/)
scripts/             site build, local relay, static server, vendoring
test/                unit tests (node --test) and Loadout's end-to-end test
.github/workflows/   test, build and deploy to GitHub Pages
```

`scripts/build-site.sh` assembles `_site/`: it copies `hub/` to the root, builds every app that has a `build` script in its `package.json` (EnigmaJS, gun-bin) and copies the rest as they are. Vite apps use `base: './'` so they work from any subfolder.

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
npm run test:e2e               # Loadout multi-device test (needs Chromium)
```

## Deployment

GitHub Pages, built by `.github/workflows/deploy.yml` on every push to `main` (pull requests only run the tests and the build). In the repository settings set **Pages → Source** to **GitHub Actions**.

## Licenses

Each tool keeps its own license: DevBoard is GPL-3.0 and EnigmaJS is PolyForm Noncommercial 1.0.0 (see their folders). Third-party files used by Loadout are listed in `apps/loadout/vendor/LICENSES.md`.
