// Getting events to relays and keeping them there.
//
// publish(): store locally first (the UI reads from the store, so it works
// offline), then send to every connected relay; relays that were unreachable
// or failed go into the outbox and get the event when they connect.
//
// heal(): relays forget; devices don't. When a relay (re)connects, every
// event this device holds for the given authors is re-published to it. Relays
// keep the newest version per address and ignore the rest, so an old copy
// never overwrites a newer edit.

import { isPermanent } from './relays.js';

export class Sync {
  constructor(pool, store) {
    this.pool = pool;
    this.store = store;
    this.healed = new Map(); // `${url}|${pubkey}` -> time
    this.authors = new Set(); // whose events to heal
    this.listeners = new Set();
    pool.onConnect((url) => {
      this.flush(url).catch((err) => console.warn('outbox:', err));
      this.healRelay(url).catch((err) => console.warn('heal:', err));
    });
  }

  /**
   * Store an event and send it to every relay, now or later. Resolves as soon
   * as the event is stored locally (the UI never waits for relays); relays
   * answer in the background and leave the outbox as they accept the event.
   * `wait: 'one'` resolves when the first relay accepts and rejects when none
   * does (for things that must reach a relay now, like a new account).
   * `wait: 'all'` resolves with every relay's answer.
   */
  async publish(event, { wait = 'none' } = {}) {
    await this.store.put(event);
    await this.store.setPending(event.id, this.pool.urls);
    this.emit();
    let first;
    const gotOne = new Promise((resolve) => (first = resolve));
    const all = this.pool.publish(event, {
      onResult: (url, r) => {
        if (r.ok) first({ ok: [url], failed: [] });
        if (r.ok || r.permanent) this.store.ack(event.id, url).then(() => this.emit());
      },
    });
    all.catch(() => {});
    if (wait === 'all') return all;
    if (wait === 'one') {
      const result = await Promise.race([gotOne, all]);
      if (!result.ok.length) throw new Error(result.failed[0]?.error || 'offline');
      return result;
    }
    return { ok: [], failed: [] };
  }

  /** Send everything this relay still misses from the outbox. */
  async flush(url) {
    const ids = await this.store.pendingFor(url);
    for (const id of ids) {
      const event = await this.store.get(id);
      if (!event) {
        await this.store.ack(id, url);
        continue;
      }
      try {
        await this.pool.publishTo(url, event);
        await this.store.ack(id, url);
      } catch (err) {
        if (isPermanent(err?.message || err)) await this.store.ack(id, url);
        else break; // relay went away again; keep the rest for next time
      }
    }
    this.emit();
  }

  /** Keep re-publishing these authors' events to relays that (re)connect. */
  watch(pubkeys) {
    for (const pk of pubkeys) this.authors.add(pk);
  }

  unwatch(pubkey) {
    this.authors.delete(pubkey);
  }

  /** Re-publish all watched authors' events to one relay (at most every 30 minutes each). */
  async healRelay(url, { force = false } = {}) {
    let sent = 0;
    for (const pk of this.authors) {
      const key = `${url}|${pk}`;
      if (!force && Date.now() - (this.healed.get(key) || 0) < 30 * 60_000) continue;
      this.healed.set(key, Date.now());
      for (const event of await this.store.byAuthor(pk)) {
        try {
          await this.pool.publishTo(url, event);
          sent++;
        } catch (err) {
          if (/offline|timed out/.test(String(err?.message || err))) return sent; // relay gone; try next time
        }
      }
    }
    return sent;
  }

  /** Re-publish one author's events to every connected relay now. */
  async healAuthor(pubkey) {
    this.authors.add(pubkey);
    const events = await this.store.byAuthor(pubkey);
    for (const url of this.pool.urls) {
      if (!this.pool.relays.get(url)?.open) continue;
      this.healed.set(`${url}|${pubkey}`, Date.now());
      for (const event of events) await this.pool.publishTo(url, event).catch(() => {});
    }
    return events.length;
  }

  async pending() {
    return this.store.pendingCount();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }
}
