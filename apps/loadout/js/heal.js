// Healing: relays forget data, devices don't. Every event this device holds
// for your account and your boards is re-published to a relay when it
// (re)connects (shared/sync.js does that for watched authors). Opening a
// board also pushes its events out again, at most once a minute.

import { sync } from './net.js';

const MIN_GAP = 60_000;
const lastHeal = new Map();

export async function healBoard(pub) {
  if (Date.now() - (lastHeal.get(pub) || 0) < MIN_GAP) return false;
  lastHeal.set(pub, Date.now());
  await sync.healAuthor(pub);
  return true;
}

/** Everything of yours that relays should keep: your key, your account event, your boards. */
export function watchAll(identity, wallet) {
  sync.watch([identity.pk, ...(identity.accountPk ? [identity.accountPk] : []), ...wallet.pubs()]);
}
