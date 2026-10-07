# Loadout

Shared lists, inventories and markdown notes that sync across your devices and with the people you share them with — over [nostr](https://nostr.com), with no server of its own and no sign-up.

**Live:** <https://derlocke-ng.github.io/weaponized-js/loadout/>

- **Checklists** for groceries and to-dos: `2x milk`, `bread x3`, `# Produce` for a section, paste a whole list at once. Checked items drop into *Done*; *Uncheck all* resets a shopping list for next week.
- **Inventory** lists with counts (`AA batteries: 12`) and ± buttons; empty items are flagged.
- **Notes** in Markdown, rentry style, with the toolbar from the derlocke-blog / apex-genetics admin editor (Ctrl+B / I / K / S), a live preview, and clickable task boxes.
- **Everything is end-to-end encrypted.** Share an *edit* or *view-only* link — by copy, the system share sheet or a QR code. A link is a key: whoever has it can pass it on.
- **Every device gets a key** automatically. Create an **account** (username + password) to get the same boards on all your devices, or sign in with an existing nostr key (`nsec`, `ncryptsec`). Download an encrypted **backup** of everything.
- **Works offline**: the app is cached, data lives in IndexedDB, and changes made without a connection are sent when a relay is reachable again.
- **Survives relays forgetting**: devices put their copy back on the relays (see *Where your data lives*).
- **You choose the relays**: the settings show latency and country (from each relay's NIP-11 document); add your own, including a local one.

## How it works

Loadout is built on the shared core in [`apps/shared/`](../shared); [`docs/architecture.md`](../../docs/architecture.md) has the full picture. In short:

| Thing | Where it lives | Who can read | Who can change |
|---|---|---|---|
| A board | addressable nostr events signed by the board's own key pair: `30701` info, one `30702` per item, `30703` note | holders of the read key (view and edit links) | holders of the board's secret key (edit links) |
| Your list of boards (the *wallet*) | `30700` events signed by your key, one per board, encrypted to your key | only you | only you |
| Your key | this browser's `localStorage`; with an account also on the relays, encrypted with your password (`30790`) | — | — |

**Write protection.** A board is a nostr key pair. Only events signed by that key are accepted by relays, so a view-only visitor or a vandal who found a board's address can't write; a forged event sent straight to a relay is answered with `invalid: bad signature`.

**Encryption.** Every value (title, each item, the note) is sealed with AES-256-GCM (gzip first when it's big) under the board's read key before it leaves the browser. The read key is derived from the board's secret key with HKDF, so edit links carry one secret and view links carry only the read key. Guessing or crawling board addresses yields ciphertext.

**Links.** Everything secret is in the URL fragment, which browsers never send to a server:

```
#/b/<board pubkey>?k=<read key>      read only
#/b/<board pubkey>?w=<secret key>    edit (the read key is derived from it)
#/b/<board pubkey>                   a board that is already in your wallet
```

Opening a link saves the board (and its keys) to your wallet and removes the keys from the address bar.

**Accounts** are a username and a password and nothing else: both are run through scrypt to derive a lookup key pair and a wrapping key; your real key is published encrypted under the wrapping key, as an event signed by the lookup key. Only the password can find the event or decrypt it, so nobody can squat, spam or overwrite a username. Signing in on a device adds the boards that device already had to the account.

**Offline.** Writes go to IndexedDB first and to the relays second; whatever a relay didn't accept waits in an outbox until it connects again.

## Where your data lives (and how it comes back)

Relays are caches, not archives — public ones drop data whenever they like. Loadout keeps it alive in three layers:

1. **Every device keeps a full copy** of every board it has opened, in IndexedDB, as signed events.
2. **Devices heal the relays.** Whenever a relay connects or reconnects — which is what happens after it restarts with an empty disk — each device sends its copy of your account, your wallet and every board in it back. Relays keep the newest version per address, so an old copy never overwrites a newer edit, and because every event is signed, any device can do this, even one with a view-only link.
3. **Backups** contain your key, your wallet, the signed events of every board and a readable snapshot, encrypted with AES-256-GCM under a PBKDF2-SHA-256 key (600 000 rounds) from your passphrase. Restoring publishes the events again, then fills anything still missing from the snapshot. This works when no relay and no other device has the data any more — including your account itself, so you can sign in again everywhere afterwards.

So data is only lost if every device that ever opened a board is gone *and* there is no backup. The end-to-end test wipes the relay twice to check both recovery paths.

**Coming from the gun version?** The old Loadout (before October 2026) stored boards with gun/SEA keys, which the nostr version cannot read. Make a backup in the old version first (*Account → Download backup*), then *Restore backup* in the new one: its boards are imported as new nostr boards with fresh keys and links, and your current device key and account stay. Old share links stop working, so send the new ones.

## Honest limits

- **Relays see metadata**: which board addresses are read and written, when, how big the values are, and your IP address. They can't read the content. Use a VPN or Tor if that matters, or point Loadout at your own relay (*Account → Relays*).
- **A link is a key.** Anyone you give a link to can pass it on; there is no way to tell who opened it.
- **Links can't be revoked.** To lock people out, *Duplicate* the board (new keys) and delete the old one.
- **Anyone with an edit link can delete** the board's content for everyone.
- **Your key sits in `localStorage`.** Anyone with access to this browser profile — or script running on the same origin — can read it. All GitHub Pages sites of one account share the origin `derlocke-ng.github.io`, so a custom (sub)domain is the stronger setup.
- **Weak account passwords can be brute-forced offline** by someone who has your account event. Use a long one (at least 10 characters are required); there is no reset.
- **Last write wins**, per item and per note. If two people edit the same note at the same time, the editor tells you and lets you pick.
- **Restoring an old backup brings back old state** for whatever the relays no longer have — including boards deleted since.
- Notes are capped at 60 000 characters (one relay message).

## Development

No build step: the files in this folder are what gets served. From the repository root:

```sh
npm install
npm run relay:nostr            # local nostr relay on ws://localhost:7777
npm run serve -- apps 8080     # http://localhost:8080/loadout/
```

In the app, add `ws://localhost:7777` under *Account → Relays*.

```sh
npm test                       # unit tests (node --test)
node test/e2e/loadout.mjs      # 18 multi-device browser scenarios against a throwaway relay (needs Chromium)
npm run vendor                 # refresh vendor/, ../shared/nostr.mjs and icons.svg after bumping versions
```

When you add a file under `js/`, list it in `SHELL` in `sw.js` (a unit test checks) and bump `VERSION` on release.

| Folder | What |
|---|---|
| `js/net.js` | wires the shared relay pool, event store and sync for this app |
| `js/identity.js` | device key, account sign-in / creation, key import |
| `js/wallet.js` | your encrypted list of boards (`30700`) |
| `js/boards.js` | board model: keys, encryption, reads and writes (`30701`–`30703`) |
| `js/heal.js` | which authors this device puts back on the relays |
| `js/session.js` | switching identity, building and restoring backups, wiping the device |
| `js/links.js`, `js/items.js`, `js/mdtasks.js`, `js/backup.js` | pure logic, unit tested |
| `js/views/` | home, board, list, note, share and account screens |
| `vendor/` | marked, DOMPurify, qrcode-generator (see `vendor/LICENSES.md`); nostr lives in `../shared/nostr.mjs` |
