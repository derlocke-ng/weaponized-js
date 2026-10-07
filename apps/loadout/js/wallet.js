// Your boards and their keys: one encrypted event per board under your own
// key, so any device signed in as you sees the same boards. Each board sits
// in a slot named by a hash of its address, so relays can't tell which boards
// you have. Per-device extras (last opened, counts) stay in localStorage.

import { KINDS, makeAddressable, seal, open, dTag, hex } from '../../shared/events.js';
import { sha256 } from '../../shared/nostr.mjs';
import { selfKey } from '../../shared/account.js';
import { store } from '../../shared/util.js';
import { pool, db, sync } from './net.js';

const SYNCED = ['pub', 'w', 'k', 'type', 'title', 'mode', 'pinned', 'added', 'u'];
const te = new TextEncoder();
const FILTER = (pk) => ({ kinds: [KINDS.LOADOUT_WALLET], authors: [pk] });

export class Wallet {
  constructor(identity) {
    this.sk = identity.sk;
    this.pk = identity.pk;
    this.key = selfKey(identity.sk);
    this.cacheKey = `loadout.wallet.${this.pk.slice(0, 16)}`;
    this.localKey = `loadout.local.${this.pk.slice(0, 16)}`;
    this.entries = new Map(Object.entries(store.get(this.cacheKey, {})));
    this.local = store.get(this.localKey, {});
    this.slots = new Map(); // slot -> pub
    this.listeners = new Set();
    this.seq = new Map();
  }

  async start() {
    for (const pub of this.entries.keys()) this.slots.set(this.slot(pub), pub);
    for (const ev of (await db.query([FILTER(this.pk)])).reverse()) await this.receive(ev);
    this.offStore = db.subscribe((ev) => {
      if (ev.kind === KINDS.LOADOUT_WALLET && ev.pubkey === this.pk) this.receive(ev);
    });
    this.sub = pool.subscribe([FILTER(this.pk)], { onevent: (ev) => db.put(ev) });
    sync.watch([this.pk]);
  }

  stop() {
    this.sub?.close();
    this.offStore?.();
  }

  slot(pub) {
    return hex(sha256(te.encode(`wjs/loadout/wallet|${pub}`))).slice(0, 32);
  }

  async receive(ev) {
    const slot = dTag(ev);
    const n = (this.seq.get(slot) || 0) + 1;
    this.seq.set(slot, n);
    let data;
    try {
      data = await open(this.key, ev.content);
    } catch {
      return;
    }
    if (this.seq.get(slot) !== n) return;
    if (data.del) {
      const pub = this.slots.get(slot);
      if (pub && this.entries.has(pub) && (this.entries.get(pub).u || 0) <= (data.u || 0)) {
        this.entries.delete(pub);
        this.persist();
      }
      return;
    }
    if (!data.pub) return;
    this.slots.set(slot, data.pub);
    const mine = this.entries.get(data.pub);
    if (mine && (mine.u || 0) > (data.u || 0)) return;
    this.entries.set(data.pub, merge(mine, data));
    this.persist();
  }

  list() {
    return [...this.entries.values()].sort(
      (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (this.localOf(b.pub).opened || b.added || 0) - (this.localOf(a.pub).opened || a.added || 0),
    );
  }

  get(pub) {
    return this.entries.get(pub) || null;
  }

  pubs() {
    return [...this.entries.keys()];
  }

  /** Add or update a board; keys are only ever added, never dropped. */
  async upsert(patch) {
    const entry = merge(this.entries.get(patch.pub), { ...patch, u: Date.now() });
    entry.added ||= Date.now();
    this.entries.set(entry.pub, entry);
    this.persist();
    const slot = this.slot(entry.pub);
    this.slots.set(slot, entry.pub);
    await sync.publish(makeAddressable(KINDS.LOADOUT_WALLET, slot, await seal(this.key, pick(entry)), this.sk));
    sync.watch([entry.pub]);
    return entry;
  }

  async remove(pub) {
    this.entries.delete(pub);
    delete this.local[pub];
    this.persist();
    sync.unwatch(pub);
    await sync.publish(makeAddressable(KINDS.LOADOUT_WALLET, this.slot(pub), await seal(this.key, { del: 1, u: Date.now() }), this.sk));
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
