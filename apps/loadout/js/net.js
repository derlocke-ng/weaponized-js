// The gun instance, relay status and the offline outbox.
//
// gun keeps writes made while offline in IndexedDB but does not push them to
// relays once it reconnects (see the "resync upon reconnect" TODO in gun.js).
// Every write made while no relay is connected is therefore queued here,
// persisted, and written again on the next connection.

/* global Gun */
import { DEFAULT_RELAYS, STORE_FILE } from './config.js';
import { store } from './util.js';

const RELAYS_KEY = 'loadout.relays';
const OUTBOX_KEY = 'loadout.outbox';

export let gun = null;
const listeners = new Set();
const writers = new Map();
let outbox = new Map(Object.entries(store.get(OUTBOX_KEY, {})));

export function relays() {
  const saved = store.get(RELAYS_KEY);
  return Array.isArray(saved) && saved.length ? saved : DEFAULT_RELAYS;
}

export function saveRelays(list) {
  const clean = [...new Set(list.map((s) => s.trim()).filter((s) => /^(https?|wss?):\/\/\S+$/.test(s)))];
  if (!clean.length || clean.join() === DEFAULT_RELAYS.join()) store.remove(RELAYS_KEY);
  else store.set(RELAYS_KEY, clean);
  return clean;
}

export function initGun() {
  gun = Gun({ peers: relays(), localStorage: false, file: STORE_FILE });
  gun.on('hi', () => {
    emit();
    setTimeout(flush, 400);
  });
  gun.on('bye', () => emit());
  setInterval(emit, 4000); // sockets can die without a 'bye'
  return gun;
}

/** [{ url, open }] for the configured relays. */
export function peers() {
  const all = gun?._.opt.peers || {};
  return Object.values(all)
    .filter((p) => p.url)
    .map((p) => ({ url: p.url, open: p.wire?.readyState === 1 }));
}

export const online = () => peers().some((p) => p.open);

export function status() {
  const list = peers();
  return { relays: list.length, connected: list.filter((p) => p.open).length, pending: outbox.size };
}

let last = '';
function emit() {
  const s = status();
  const key = JSON.stringify(s);
  if (key === last) return;
  last = key;
  for (const fn of listeners) fn(s);
}

export function onStatus(fn) {
  listeners.add(fn);
  fn(status());
  return () => listeners.delete(fn);
}

/**
 * Register how to (re)write an entry for a scope, e.g. 'board' needs a
 * certificate and 'user' writes into the signed-in user's graph.
 * @param {string} scope
 * @param {(entry: {pub: string, path: string, key: string, value: unknown}) => Promise<unknown>} fn
 */
export function setWriter(scope, fn) {
  writers.set(scope, fn);
}

/** Write now, and remember the write if no relay is connected. */
export async function write(entry) {
  const id = `${entry.scope}|${entry.pub}|${entry.path}|${entry.key}`;
  if (!online()) {
    outbox.set(id, { ...entry, ts: Date.now() });
    saveOutbox();
  }
  const fn = writers.get(entry.scope);
  if (!fn) throw new Error(`No writer for ${entry.scope}`);
  return fn(entry);
}

async function flush() {
  if (!online() || !outbox.size) return;
  const pending = [...outbox.entries()];
  for (const [id, entry] of pending) {
    try {
      await writers.get(entry.scope)?.(entry);
    } catch (err) {
      console.warn('outbox: dropping write', id, err);
    }
    // Only forget it if nothing newer was queued meanwhile.
    if (outbox.get(id) === entry) outbox.delete(id);
  }
  saveOutbox();
  emit();
}

function saveOutbox() {
  store.set(OUTBOX_KEY, Object.fromEntries(outbox));
  emit();
}

export function clearOutbox() {
  outbox = new Map();
  store.remove(OUTBOX_KEY);
}

/** put() that resolves on the first ack (local or remote) or after a timeout. */
export function put(chain, value, opt) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, 4000);
    chain.put(
      value,
      (ack) => {
        clearTimeout(t);
        if (ack.err) reject(new Error(ack.err));
        else resolve();
      },
      opt,
    );
  });
}
