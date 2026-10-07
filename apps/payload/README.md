# Payload

Send files straight from one browser to another while you're both online.

**Live:** <https://derlocke-ng.github.io/weaponized-js/payload/>

1. Drop files on the page. Payload hashes them and gives you a link (and a QR code).
2. The other person opens the link and presses *Download*.
3. Keep your tab open until they're done — nothing is uploaded anywhere; the files go from your browser to theirs. Several people can download at once.

## How it works

- **Finding each other.** The link's `#secret` names a room on the gun network and is the key everything in it is encrypted with (AES-256-GCM). Relays only see encrypted presence and signaling messages.
- **Connecting.** The receiver sets up a WebRTC data channel to the sender. The offer and answer travel encrypted through gun, so a relay can't swap in its own keys. WebRTC encrypts the channel itself (DTLS).
- **When there is no direct path** (both on mobile data, strict firewalls), the transfer continues through gun relays instead, as encrypted 64 KB frames that the receiver deletes from the relay once they've arrived. It is slower, but it works without a TURN server.
- **Integrity.** Before sharing, the sender hashes every 64 KB piece with SHA-256 and publishes a root hash over all of them. The receiver checks each piece as it arrives and asks again for any that don't match, then checks the root before saving. Both sides show the same short *fingerprint* you can compare out loud.
- **Resuming.** If the connection drops, the receiver reconnects and only asks for the pieces it is still missing.

## Limits

- Both sides must be online at the same time; it is a transfer, not storage.
- Anyone with the link can download while you share. Press *Stop sharing* when you're done.
- Received files are assembled in memory before saving, so very large files (several GB) depend on the receiving device's RAM.
- The two browsers learn each other's IP addresses (that's how a direct connection works). The STUN servers used to find a direct path (Google and Cloudflare) see your IP too.

## Development

Static files, no build step. It uses `../shared/gun.js` and `../shared/p2p.js`. Add `?relay` to the URL (on both sides) to force the gun path. The end-to-end test (`node test/e2e/payload.mjs`) sends files both ways and compares their SHA-256.
