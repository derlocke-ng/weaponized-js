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

const FLUSH_EVERY = 15_000;
const HEAL_PACE = 60; // ms between re-published events, so relays don't rate-limit us

export class Sync {
  constructor(pool, store) {
    this.pool = pool;
    this.store = store;
    this.healed = new Map(); // `${url}|${pubkey}` -> time
    this.authors = new Set(); // whose events to heal
    this.listeners = new Set();
    this.errorListeners = new Set();
    this.backoff = new Map(); // url -> time before which we don't retry the outbox
    this.flushing = new Set();
    pool.onConnect((url) => {
      this.flush(url).catch((err) => console.warn('outbox:', err));
      this.healRelay(url).catch((err) => console.warn('heal:', err));
    });
    // Relays that said "rate-limited" or timed out get the outbox again later, not only on reconnect.
    this.timer = setInterval(() => this.flushAll().catch(() => {}), FLUSH_EVERY);
    store.pruneOutbox(pool.urls).catch(() => {});
  }

  /** Events no relay has accepted yet. */
  unsynced() {
    return this.store.pendingCount(this.pool.urls.length);
  }

  outbox() {
    return this.store.outboxSummary(this.pool.urls.length);
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
        if (r.ok || r.permanent) this.store.ack(event.id, url, { accepted: r.ok }).then(() => this.emit());
        else if (r.error !== 'offline') this.backoff.set(url, Date.now() + (/^rate-limited/.test(r.error) ? 20_000 : 10_000));
      },
    });
    all
      .then((res) => {
        // Every connected relay said no for good: the change stays on this device, and the person should know.
        const answered = res.failed.filter((f) => f.error !== 'offline');
        const rejected = answered.filter((f) => f.permanent);
        if (!res.ok.length && rejected.length && rejected.length === answered.length) {
          for (const fn of this.errorListeners) fn({ event, reason: rejected[0].error, relays: rejected.map((f) => f.url) });
        }
      })
      .catch(() => {});
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
    if (this.flushing.has(url)) return;
    this.flushing.add(url);
    try {
      const ids = await this.store.pendingFor(url);
      for (const id of ids) {
        const event = await this.store.get(id);
        if (!event) {
          await this.store.ack(id, url, { accepted: false });
          continue;
        }
        try {
          await this.pool.publishTo(url, event);
          this.pool.notePublish(url, null);
          await this.store.ack(id, url);
        } catch (err) {
          const error = String(err?.message || err);
          if (isPermanent(error)) {
            this.pool.notePublish(url, error);
            await this.store.ack(id, url, { accepted: false });
          } else {
            if (error !== 'offline') this.pool.notePublish(url, error);
            this.backoff.set(url, Date.now() + (/^rate-limited/.test(error) ? 20_000 : 10_000));
            break; // relay is away or busy; keep the rest for next time
          }
        }
      }
    } finally {
      this.flushing.delete(url);
    }
    this.emit();
  }

  /** Flush the outbox to every connected relay that isn't backing off. */
  async flushAll({ force = false } = {}) {
    for (const url of this.pool.urls) {
      if (!this.pool.relays.get(url)?.open) continue;
      if (!force && (this.backoff.get(url) || 0) > Date.now()) continue;
      if (!force && !(await this.store.pendingFor(url)).length) continue;
      await this.flush(url);
    }
  }

  /** Re-publish everything to every connected relay now (the "Sync now" button). */
  async healAll() {
    await this.flushAll({ force: true });
    for (const url of this.pool.urls) if (this.pool.relays.get(url)?.open) await this.healRelay(url, { force: true });
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
          await new Promise((r) => setTimeout(r, HEAL_PACE));
        } catch (err) {
          const error = String(err?.message || err);
          if (/offline|timed out|^rate-limited/.test(error)) {
            this.healed.delete(key); // relay gone or busy; try again on the next occasion
            return sent;
          }
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

  /** fn({ event, reason, relays }) when every connected relay refused an event for good. */
  onError(fn) {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }

  close() {
    clearInterval(this.timer);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }
}
