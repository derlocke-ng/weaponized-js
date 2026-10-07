# Loadout

Shared lists, inventories and markdown notes that sync across your devices and with the people you share them with — over [gun](https://gun.eco), with no server of its own and no sign-up.

**Live:** <https://derlocke-ng.github.io/weaponized-js/loadout/>

- **Checklists** for groceries and to-dos: `2x milk`, `bread x3`, `# Produce` for a section, paste a whole list at once. Checked items drop into *Done*; *Uncheck all* resets a shopping list for next week.
- **Inventory** lists with counts (`AA batteries: 12`) and ± buttons; empty items are flagged.
- **Notes** in Markdown, rentry style, with the toolbar from the derlocke-blog / apex-genetics admin editor (Ctrl+B / I / K / S), a live preview, and clickable task boxes.
- **Private** boards are end-to-end encrypted. **Public** boards are plain text that anyone with the address can read — but only edit links can change them.
- **Share** an *edit* or *view-only* link, by copy, the system share sheet or a QR code.
- **Every device gets a key** automatically. Create an **account** (username + password) to get the same boards on all your devices, and download an encrypted **backup** of everything.
- **Works offline**: the app is cached, data lives in IndexedDB, and changes made without a connection are sent when a relay is reachable again.

## How it works

| Thing | Where it lives | Who can read | Who can change |
|---|---|---|---|
| A board | the user graph of its own SEA key pair, `~<board pub>` (`meta`, `items`, `doc`) | private: holders of the read key · public: anyone with the address | anyone certified by the board key |
| Your list of boards (the *wallet*) | your own user graph, `~<your pub>/loadout/wallet` | only you (encrypted to your key) | only you (signed) |
| Your key | this browser's `localStorage`; with an account also on the relays, encrypted with your password | — | — |

**Write protection.** A board is a SEA key pair. Editors hold its private key and use it to issue a SEA certificate for *their own* key on `meta`, `items` and `doc`. gun peers — relays included — only store values signed by the board key or by a certified key, so a view-only visitor or a vandal who found a board's address can't write. Raw forged messages sent straight to a relay are rejected with `Unverified data`.

**Encryption.** Private boards encrypt every value (title, each item, the note) with a read key before it leaves the browser. The read key is a hash of the board's private key, so edit links carry one secret and view links carry only the read key. Guessing or crawling board addresses yields ciphertext.

**Links.** Everything secret is in the URL fragment, which browsers never send to a server:

```
#/b/<board pub>            public board, read only
#/b/<board pub>?k=<key>    private board, read only
#/b/<board pub>?w=<priv>   edit (private boards derive the read key from it)
```

Opening a link saves the board (and its keys) to your wallet and removes the keys from the address bar.

**Accounts** use gun's own user system (`user.create` / `user.auth`): your key pair is stored on the relays encrypted with a key derived from your password (PBKDF2, 100 000 rounds). Signing in on a device adds the boards that device already had to the account.

**Backups** are JSON files encrypted with AES-256-GCM under a PBKDF2-SHA-256 key (600 000 rounds) from your passphrase. They contain your key, your wallet and a snapshot of every board you can read. Restoring re-uploads anything the relays have lost from boards you can edit.

**Offline.** gun keeps offline writes locally but doesn't push them when it reconnects, so Loadout queues writes made without a relay connection and replays them on the next connection.

## Honest limits

- **Relays see metadata**: which board addresses are read and written, when, how big the values are, and your IP address. They can't read private boards. Use a VPN or Tor if that matters, or point Loadout at your own relay (*Account → Relays*).
- **Public means public**: the address of a public board is visible to every relay that carries it.
- **Links can't be revoked.** To lock people out, *Duplicate* the board (new keys) and delete the old one.
- **Anyone with an edit link can delete** the board's content for everyone.
- **Your key sits in `localStorage`.** Anyone with access to this browser profile — or script running on the same origin — can read it. All GitHub Pages sites of one account share the origin `derlocke-ng.github.io`, so a custom (sub)domain for Loadout is the stronger setup.
- **Weak account passwords can be brute-forced offline** from the encrypted key on the relays. Use a long one; there is no reset.
- **Last write wins**, per item and per note. If two people edit the same note at the same time, the editor tells you and lets you pick.
- **Relays forget.** Every device that opens a board keeps a copy and backups contain everything, but if every copy is gone, the board is gone.
- Notes are capped at 200 000 characters.

## Development

No build step: the files in this folder are what gets served. From the repository root:

```sh
npm install
npm run relay                  # local gun relay on :8765
npm run serve -- apps 8080     # http://localhost:8080/loadout/
```

In the app, set *Account → Relays* to `http://localhost:8765/gun`.

```sh
npm test            # unit tests (node --test)
npm run test:e2e    # multi-device browser test against a local relay (needs Chromium)
npm run vendor      # refresh vendor/ and icons.svg after bumping versions in package.json
```

When you add a file under `js/`, list it in `SHELL` in `sw.js` (a unit test checks) and bump `VERSION` on release.

| Folder | What |
|---|---|
| `js/net.js` | gun instance, relay status, offline outbox |
| `js/identity.js` | device key, account sign-in / creation |
| `js/wallet.js` | your encrypted list of boards |
| `js/boards.js` | board model: certificates, encryption, reads and writes |
| `js/links.js`, `js/items.js`, `js/mdtasks.js`, `js/backup.js` | pure logic, unit tested |
| `js/views/` | home, board, list, note, share and account screens |
| `vendor/` | gun, marked, DOMPurify, qrcode-generator (see `vendor/LICENSES.md`) |
