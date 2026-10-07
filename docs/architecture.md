# Architecture

How weaponized.js moves and stores data, why it stopped using gun, and where it is going. This is the record of the decisions made in October 2026; update it when a decision changes.

## Decision: nostr + Blossom, not gun

The first versions of every tool here ran on [gun.js](https://gun.eco). It worked, but:

- **gun is barely maintained** — one release in two years, and bugs (offline writes never replayed, `user.auth` races) had to be worked around in every app.
- **Relays forget.** gun relays are caches with no retention promise and no way to ask "what do you still have?", so every app had to carry its own heal-and-backup machinery.
- **No story for pictures or feeds.** A grow diary with photos (Outpost) or a chat (Uplink) needs blob storage and query-by-author/tag/time, which gun's graph does not give.
- **One implementation.** If gun's relay code breaks, every relay breaks with it.

[nostr](https://github.com/nostr-protocol/nips) fixes all four with less code on our side:

- Everything is a **signed JSON event**. Relays verify signatures, so forgery is rejected at the door and any device can re-publish any event it holds (healing needs no special trust).
- **Replaceable and addressable events** (kinds 30000–39999 with a `d` tag) give us "newest version of this thing" for free; **ephemeral events** (20000–29999) give us signaling that relays never store.
- **Filters** (`authors`, `kinds`, `#d`, `since`) let a device ask for exactly what it is missing.
- **Many relays, many implementations** (strfry, nostr-rs-relay, khatru…), run by many people. Users pick theirs; we can run some as a [kiwi-network](https://github.com/derlocke-ng) module; nothing of ours is a single point of failure.
- **[Blossom](https://github.com/hzrd149/blossom)** servers store blobs by SHA-256, authorised by nostr keys — pictures and file drops without inventing storage.
- Relays also don't promise retention — nostr is not a blockchain — so the local-first design below stays: **every device is the source of truth for its own data**, relays are the transport and the cache.

Costs accepted: nostr relays see the same metadata gun relays saw (who writes which addresses when, from which IP). Content is encrypted before it leaves the device, always.

## The shared core (`apps/shared/`)

| Module | Responsibility |
|---|---|
| `nostr.mjs` | nostr-tools 2.25 + noble crypto, bundled by `scripts/vendor.mjs` (esbuild). The only third-party code in the core. |
| `events.js` | Kind numbers, event helpers (`makeAddressable`, `sign`, `stamp`), AES-GCM content encryption (`seal` / `open`), HKDF key derivation. |
| `store.js` | `LocalStore`: IndexedDB (`wjs`) with the device's copy of every event it cares about, an outbox of events not yet accepted by each relay, and small metadata. |
| `relays.js` | `RelayPool`: the user's relay list (`localStorage` `wjs.relays`), connections with ping/reconnect, latency, NIP-11 info (name, country) for the server picker, publish to all with per-relay results, de-duplicated subscriptions. |
| `account.js` | Device key, username + password accounts (below), nsec / ncryptsec import and export. |
| `sync.js` | `Sync`: publish = store locally + send to every relay + queue what failed; flush the outbox on (re)connect; heal relays with the device's copy of watched authors. |
| `util.js` | base64url, ids, safe `localStorage`. |

Apps import these as ES modules; nothing is built except the vendored bundle. Each app's service worker caches `../shared/` too, so the suite works offline.

## Identity and accounts

**Every device has a key** (secp256k1, generated on first visit, kept in `localStorage` as `wjs.identity`). With nothing else, a device already works: its boards are published under this key and encrypted to it.

**An account is a username and a password**, implemented on plain nostr events without any registry or name uniqueness:

```
salt      = sha256('wjs/account/v1|' + normalize(username))
seed      = scrypt(password, salt, N = 2^16, r = 8, p = 1, dkLen = 64)
lookupSk  = seed[0..32]        → a nostr key pair that only this username+password can derive
wrapKey   = seed[32..64]       → encrypts the real key

account event: kind 30790, d = 'account', signed by lookupSk,
               content = seal(wrapKey, { v: 1, sk: <device secret key>, alias })
```

Sign-in derives the same lookup key, asks the relays for `{ kinds: [30790], authors: [lookupPk] }` and decrypts. Properties:

- **Nobody can find, squat, spam or overwrite an account without the password.** The lookup pubkey is unguessable, and relays only accept the event from its own key. Two people choosing the same username get two unrelated events — no uniqueness to fight over, nothing to DoS.
- **Offline brute force** is possible for anyone who already has the event (they'd have to find it first): scrypt 2^16 makes guesses slow; passwords are at least 10 characters; there is no reset.
- Signing in on a device that already had boards **carries them into the account** (the device's key is replaced by the account's; its events are re-published under the new key).
- The usual nostr logins exist too: paste an `nsec`, hex key or `ncryptsec` (NIP-49). NIP-07 (browser extension) and NIP-46 (remote signer) are planned but not built.

Each app derives its own keys from the account key with HKDF labels (`wjs/self`, `wjs/loadout/read`, …), so a leak of one app's key never exposes another's.

## Content encryption

NIP-44 caps payloads at 64 KB and is built for two-party messages, so content uses WebCrypto directly:

```
key      = HKDF-SHA256(secret, info = label, 32 bytes)
payload  = base64url( version || iv(12) || AES-256-GCM(key, iv, body, aad = version) )
version  = 0x01: body is UTF-8 JSON     0x02: body is gzip(JSON)   (gzip when JSON > 1 KB)
```

Everything in an event's `content` is a sealed payload; tags carry only the `d` address and a version. Relays and crawlers see sizes, timestamps and addresses, nothing else.

## Event kinds

| Kind | Name | Type | Used for |
|---|---|---|---|
| 30700 | `LOADOUT_WALLET` | addressable | one entry per board in a user's wallet; `d` = sha256 slot of the board pubkey |
| 30701 | `LOADOUT_INFO` | addressable | board title, type, mode (`d` = `info`) |
| 30702 | `LOADOUT_ITEM` | addressable | one list / inventory item per event (`d` = item id); `{ del: 1 }` is a tombstone |
| 30703 | `LOADOUT_DOC` | addressable | the markdown note of a board (`d` = `doc`) |
| 30790 | `ACCOUNT` | addressable | username + password account (above) |
| 30791 | `SETTINGS` | addressable | suite settings (hidden apps, …) — planned |
| 21700 | `P2P_PRESENCE` | ephemeral | Payload / pong room presence — planned |
| 21701 | `P2P_SIGNAL` | ephemeral | encrypted WebRTC offers / answers / ICE — planned |
| 21702 | `P2P_DATA` | ephemeral | encrypted data frames when WebRTC fails — planned |

Addressable events replace by `(kind, pubkey, d)` with the newest `created_at` winning. `created_at` has one-second resolution, so `stamp(address)` hands out a strictly increasing timestamp per address on each device; two devices editing within the same second still tie-break deterministically (lowest id), which is the same rule relays apply.

## Local first, offline, heal, backup

1. **Every write goes to IndexedDB first**, then to every connected relay. Relays that were offline or rejected the event for a transient reason get it from the **outbox** when they next connect.
2. **Reads come from IndexedDB** and are updated by live subscriptions; the UI never waits for a relay.
3. **Heal.** On every relay (re)connect each device re-publishes its copy of every "watched" author (its own key, its account event, every board in its wallet), throttled to once per 30 minutes per relay and author. Relays treat duplicates as no-ops and newer versions as replacements, so healing is idempotent and can never roll back an edit. A relay that lost its disk is repaired by the first device that reconnects.
4. **Backups** are the raw signed events of everything the user owns plus a readable snapshot, encrypted (AES-256-GCM, PBKDF2-SHA-256 600 000 rounds) with a passphrase. Restoring re-publishes the events, so even the account itself comes back after every relay and every device is gone.

Data is lost only if every device that ever held it is gone *and* there is no backup.

## Relays and servers

The default relay list is a handful of large public relays. The settings screen shows each relay's latency and its NIP-11 name and country, lets users add their own (including a `ws://localhost` dev relay), and is the seed of the **server picker**: choose relays by speed and jurisdiction, same for Blossom and TURN once those are in.

A `weaponized` kiwi-network module (strfry relay + blossom-server + coturn, `module.yaml` + `docker-compose.yml.j2`) will let any kiwi-master or kiwi-node host the whole stack; the apps then list those servers first. Nothing in the apps depends on a server of ours existing.

`scripts/nostr-relay.mjs` is a small spec-conformant relay (NIP-01 + NIP-11, JSONL storage) used by the tests and for development.

## Loadout on nostr

A board is a nostr key pair. Whoever has the secret key (`?w=`) can publish `30701/30702/30703` events for it — relays reject anything else, so write protection is the relay's signature check. The read key is `HKDF(w, 'wjs/loadout/read')`; view links carry only that (`?k=`), so viewers can decrypt but not sign. Without a key the board shows as locked, and the relay only ever holds ciphertext — the e2e test verifies both.

Items are one event each (not one blob per board), so two people editing different items never conflict and a device only transfers what changed. Deleting a board publishes a tombstone `info` and strips its items; wallets of other devices drop it via their own tombstone entries.

## Roadmap

1. ~~Shared core; Loadout on nostr~~ (done — `test/e2e/loadout.mjs` runs 17 multi-device scenarios against the dev relay, including two relay wipes).
2. **Payload and pongjs on nostr**: presence and signaling as ephemeral events 21700–21702 (encrypted to the room secret), data frames over 21702 when WebRTC fails, TURN servers from the picker; Payload gets a **drop** mode — encrypted chunks on a Blossom server with an expiry — for receivers who are not online right now. Then gun, `apps/shared/gun.js` and `scripts/relay.cjs` go.
3. **Uplink** (chat): NIP-17 private messages between accounts, ephemeral encrypted rooms (what EnigmaJS did), groups later.
4. **Outpost** (grow reports): entries and photos encrypted before upload to Blossom, friends list, visibility layers (private / friends / "public" = readable by anyone signed into the app), feed and explore; marketplace for seeds and cuttings behind an 18+ / legal-region declaration and a no-liability agreement. Backups include blobs.
5. **Suite shell**: one account for every app, app switcher, hidden apps in settings (kind 30791).
6. **kiwi `weaponized` module**; replace the first default relays with kiwi ones.
7. Retire EnigmaJS and DevBoard once Uplink exists.

Open: contact path for marketplace listings (in-app Uplink vs. external), whether to offer cuttings at all in the marketplace (legally shaky in Germany), which public Blossom servers accept encrypted blobs.
