// Healing: relays forget data, devices don't. Each device keeps the boards it
// has seen in IndexedDB, exactly as they were signed and timestamped. Sending
// those nodes back to the relays restores whatever they lost; gun keeps the
// newer value per field, so an old copy never overwrites a newer edit, and
// the signatures mean any device can do it, even a view-only one.

import { gun, online } from './net.js';
import { boardSouls } from './boards.js';
import { timeout } from './util.js';

const MIN_GAP = 60_000;
const lastHeal = new Map(); // pub -> time, this session only

export const userSouls = (pub, alias) => [`~${pub}`, `~${pub}/loadout`, `~${pub}/loadout/wallet`, ...(alias ? [`~@${alias}`] : [])];

/** Make sure a soul is in memory: from IndexedDB, or else the relays. */
function load(soul) {
  const [first, ...rest] = soul.split('/');
  let chain = gun.get(first);
  for (const part of rest) chain = chain.get(part);
  return timeout(new Promise((resolve) => chain.once(() => resolve())), 4000).catch(() => {});
}

/** Copies of the given souls as gun holds them (signed values and their states). */
export async function rawNodes(souls) {
  await Promise.all(souls.map(load));
  const out = {};
  for (const soul of souls) {
    const node = gun._.graph[soul];
    if (node && Object.keys(node).length > 1) out[soul] = JSON.parse(JSON.stringify(node));
  }
  return out;
}

/** Send nodes to every connected relay. Returns false when offline. */
export function reseed(nodes) {
  if (!online() || !Object.keys(nodes).length) return false;
  gun._.on('out', { '#': String.random(9), put: nodes });
  return true;
}

export async function heal(souls) {
  return reseed(await rawNodes(souls));
}

/** Heal one board (called when it is opened), at most once a minute. */
export async function healBoard(pub) {
  if (Date.now() - (lastHeal.get(pub) || 0) < MIN_GAP) return false;
  lastHeal.set(pub, Date.now());
  return heal(boardSouls(pub));
}

/**
 * Heal your account and every board in your wallet. Runs whenever a relay
 * (re)connects: a relay that lost its data has usually just restarted.
 */
export async function healAll(identity, wallet) {
  if (!online()) return 0;
  await heal(userSouls(identity.pair.pub, identity.alias));
  let n = 0;
  for (const entry of wallet.list()) {
    if (!online()) break;
    lastHeal.set(entry.pub, Date.now());
    if (await heal(boardSouls(entry.pub))) n++;
    await new Promise((r) => setTimeout(r, 150));
  }
  return n;
}
