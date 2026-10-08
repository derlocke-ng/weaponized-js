// Per-account settings that follow you to every device: one encrypted
// addressable event (kind 30791, d = 'loadout') under your own key, with a
// localStorage cache so the home screen draws right away.

import { KINDS, makeAddressable, seal, open } from '../../shared/events.js';
import { selfKey } from '../../shared/account.js';
import { store } from '../../shared/util.js';
import { pool, db, sync } from './net.js';

const D = 'loadout';
const FILTER = (pk) => ({ kinds: [KINDS.SETTINGS], authors: [pk], '#d': [D] });

export class Settings {
  constructor(identity) {
    this.sk = identity.sk;
    this.pk = identity.pk;
    this.key = selfKey(identity.sk);
    this.cacheKey = `loadout.settings.${this.pk.slice(0, 16)}`;
    this.data = store.get(this.cacheKey, {});
    this.listeners = new Set();
    this.seq = 0;
  }

  async start() {
    for (const ev of (await db.query([FILTER(this.pk)])).reverse()) await this.receive(ev);
    this.offStore = db.subscribe((ev) => {
      if (ev.kind === KINDS.SETTINGS && ev.pubkey === this.pk) this.receive(ev);
    });
    this.sub = pool.subscribe([FILTER(this.pk)], { onevent: (ev) => db.put(ev) });
  }

  stop() {
    this.sub?.close();
    this.offStore?.();
  }

  async receive(ev) {
    const n = ++this.seq;
    let data;
    try {
      data = await open(this.key, ev.content);
    } catch {
      return;
    }
    if (this.seq !== n || !data || typeof data !== 'object') return;
    if ((data.u || 0) < (this.data.u || 0)) return;
    this.data = data;
    this.persist();
  }

  get(key, fallback) {
    return this.data[key] === undefined ? fallback : this.data[key];
  }

  async set(patch) {
    this.data = { ...this.data, ...patch, u: Date.now() };
    this.persist();
    await sync.publish(makeAddressable(KINDS.SETTINGS, D, await seal(this.key, this.data), this.sk));
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  persist() {
    store.set(this.cacheKey, this.data);
    for (const fn of this.listeners) fn();
  }

  forgetLocal() {
    store.remove(this.cacheKey);
  }
}
