# DevBoard — The Freelancer Noticeboard

A fully peer-to-peer, serverless freelancer noticeboard. Post availability or hiring notes that live on the decentralised [Gun.js](https://gun.eco) network. No accounts, no servers, no tracking.

**Live:** [derlocke-ng.github.io/devboard](https://derlocke-ng.github.io/devboard)

---

## Features

- **P2P & serverless** — data synced via Gun.js across relay peers and directly between browser tabs
- **Cryptographic identity** — each visitor gets a SEA keypair stored in their browser; no registration required
- **Signed posts & votes** — every post and vote is signed with your keypair and verified by peers; forgery is rejected
- **Ephemeral by design** — notes expire automatically (24 h to 30 days); heavily downvoted posts are demoted client-side
- **Admin moderation** — hardcoded admin public key can remove any post
- **IndexedDB cache** — posts survive page reload without waiting for Gun resync
- **No build step** — single `index.html` file; open directly in a browser or serve statically

## Usage

Open `index.html` in any modern browser, or visit the GitHub Pages URL above.

### Posting

On first visit a keypair is generated and stored in `localStorage`. You can post immediately.

### Identity / Keypair

Click your identity badge (top right) to:
- See your public key, account age, and vote weight
- **Export** your keypair to a `.json` file (back it up!)
- **Import** a previously exported keypair to restore your identity on another device
- Reset and generate a fresh non-linkable identity

> ⚠ Your keypair contains your **private key**. Anyone with it can post and vote as you. Never commit an exported file to version control — it is listed in `.gitignore`.

### Voting

You cannot vote on your own posts. A rate limit of 10 votes per 30 seconds prevents spam.

## Self-hosting / Deployment

The app is a single static file — drop it anywhere:

```bash
# local dev server (Python)
python3 -m http.server 8080

# or use pweb
pweb

# or just open the file
open index.html
```

For GitHub Pages, fork this repo and enable Pages (Settings → Pages → Deploy from branch: `main`). The included workflow (`.github/workflows/deploy.yml`) handles deployment automatically on every push to `main`.

## Architecture

```
Browser A ──┐
Browser B ──┼──► Gun relay peers ◄──┬── Browser C
Browser D ──┘                       └── Browser E
```

Data flows directly between browsers and through public Gun relay peers. There is no central database. Posts are ephemeral — if all peers (browsers + relays) lose a record it is gone.

All cryptographic operations use Gun's built-in [SEA](https://gun.eco/docs/SEA) (Security, Encryption, & Authorization) library.

## Relay Peers

The app connects to these public Gun relays by default:

- `https://gun.defucc.me/gun`
- `https://gun.o8.is/gun`
- `https://relay.peer.ooo/gun`

## License

[GNU General Public License v3.0](LICENSE) — see `LICENSE` for details.
