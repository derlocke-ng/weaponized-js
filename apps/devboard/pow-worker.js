// Proof of work (NIP-13) off the main thread: mine a nonce until the event id
// has the requested number of leading zero bits, reporting progress. The
// event's created_at is left alone: the app stamps it so edits and votes
// within the same second still order correctly.
import { nip13, getEventHash } from '../shared/nostr.mjs';

self.onmessage = (e) => {
  const { event, difficulty } = e.data;
  const started = Date.now();
  let reported = started;
  try {
    const tag = ['nonce', '0', String(difficulty)];
    event.tags = [...event.tags.filter((x) => x[0] !== 'nonce'), tag];
    for (let count = 1; ; count++) {
      tag[1] = String(count);
      event.id = getEventHash(event);
      if (nip13.getPow(event.id) >= difficulty) break;
      if ((count & 0x3ff) === 0 && Date.now() - reported >= 500) {
        reported = Date.now();
        self.postMessage({ progress: reported - started });
      }
    }
    self.postMessage({ event, ms: Date.now() - started });
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};
