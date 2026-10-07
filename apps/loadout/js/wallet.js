// Your boards and their keys, kept under your own gun user graph and encrypted
// to your key pair, so any device with the same key sees the same boards.
//
// Each board lives in a slot named by a keyed hash of its address, so relays
// can't tell which boards you have. Entry:
//   { pub, w, k, type, title, mode, pinned, added, u }
// Per-device extras (last opened, item counts) stay in localStorage only.

/* global SEA */
import { gun, write, setWriter } from './net.js';
import { sha256, store } from './util.js';

const SYNCED = ['pub', 'w', 'k', 'type', 'title', 'mode', 'pinned', 'added', 'u'];

export class Wallet {
  constructor(pair) {
    this.pair = pair;
    this.cacheKey = `loadout.wallet.${pair.pub.slice(0, 16)}`;
    this.localKey = `loadout.local.${pair.pub.slice(0, 16)}`;
    this.entries = new Map(Object.entries(store.get(this.cacheKey, {})));
    this.local = store.get(this.localKey, {});
    this.slots = new Map();
    this.listeners = new Set();
    this.seq = new Map();
    setWriter('user', ({ path, key, value }) => {
      const user = gun.user();
      if (!user.is || user.is.pub !== this.pair.pub) return Promise.resolve();
      return new Promise((resolve) => user.get('loadout').get(path).get(key).put(value, resolve));
    });
  }

  async start() {
    // Know the slots of cached boards so a removal from another device applies.
    for (const pub of this.entries.keys()) this.slots.set(await this.slot(pub), pub);
    this.chain = gun.user().get('loadout').get('wallet');
    this.chain.map().on((raw, slot) => this.receive(slot, raw));
  }

  stop() {
    this.chain?.off();
  }

  async receive(slot, raw) {
    const n = (this.seq.get(slot) || 0) + 1;
    this.seq.set(slot, n);
    if (raw == null) {
      const pub = this.slots.get(slot);
      if (pub && this.entries.has(pub)) {
        this.entries.delete(pub);
        this.persist();
      }
      return;
    }
    if (typeof raw !== 'string') return;
    const entry = await SEA.decrypt(raw, this.pair);
    if (this.seq.get(slot) !== n || !entry?.pub) return;
    this.slots.set(slot, entry.pub);
    const mine = this.entries.get(entry.pub);
    if (mine && (mine.u || 0) > (entry.u || 0)) return;
    this.entries.set(entry.pub, merge(mine, entry));
    this.persist();
  }

  async slot(pub) {
    return (await sha256(`${this.pair.epriv}|loadout-wallet|${pub}`)).slice(0, 24);
  }

  list() {
    return [...this.entries.values()].sort(
      (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (this.localOf(b.pub).opened || b.added || 0) - (this.localOf(a.pub).opened || a.added || 0),
    );
  }

  get(pub) {
    return this.entries.get(pub) || null;
  }

  /** Add or update a board; keys are only ever added, never dropped. */
  async upsert(patch) {
    const entry = merge(this.entries.get(patch.pub), { ...patch, u: Date.now() });
    entry.added ||= Date.now();
    this.entries.set(entry.pub, entry);
    this.persist();
    const slot = await this.slot(entry.pub);
    this.slots.set(slot, entry.pub);
    const value = await SEA.encrypt(pick(entry), this.pair);
    await write({ scope: 'user', pub: this.pair.pub, path: 'wallet', key: slot, value });
    return entry;
  }

  async remove(pub) {
    this.entries.delete(pub);
    delete this.local[pub];
    this.persist();
    const slot = await this.slot(pub);
    await write({ scope: 'user', pub: this.pair.pub, path: 'wallet', key: slot, value: null });
  }

  localOf(pub) {
    return this.local[pub] || {};
  }

  /** Per-device info: { opened, total, done, showDone, … } */
  setLocal(pub, patch) {
    this.local[pub] = { ...this.local[pub], ...patch };
    store.set(this.localKey, this.local);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  persist() {
    store.set(this.cacheKey, Object.fromEntries(this.entries));
    for (const fn of this.listeners) fn();
  }

  forgetLocal() {
    store.remove(this.cacheKey);
    store.remove(this.localKey);
  }
}

function pick(entry) {
  const out = {};
  for (const k of SYNCED) if (entry[k] != null) out[k] = entry[k];
  return out;
}

function merge(a, b) {
  if (!a) return pick(b);
  const out = { ...pick(a), ...pick(b) };
  out.w = b.w || a.w || null;
  out.k = b.k || a.k || null;
  out.added = Math.min(a.added || Infinity, b.added || Infinity);
  if (!Number.isFinite(out.added)) delete out.added;
  return out;
}
