// The relay pool, the device's event store and the outbox, shared by every
// module. Status for the UI combines relay connections with unsent events.

import { RelayPool, savedRelays, saveRelays as persistRelays, normalizeRelayUrl } from '../../shared/relays.js';
import { LocalStore } from '../../shared/store.js';
import { Sync } from '../../shared/sync.js';

export let pool = null;
export let db = null;
export let sync = null;

export async function initNet() {
  db = await LocalStore.open('wjs');
  pool = new RelayPool(savedRelays());
  sync = new Sync(pool, db);
}

export const relays = () => savedRelays();
export const saveRelays = (list) => persistRelays(list);
export { normalizeRelayUrl };

/** [{ url, open, latency }] for the configured relays. */
export const peers = () => pool.status().relays;
export const online = () => pool.online;
export const relayInfo = (url) => pool.info(url);
export const onRelayConnect = (fn) => pool.onConnect(fn);

/** Per-relay outbox counts and the number of events no relay has accepted yet. */
export const outbox = () => db.outboxSummary();
/** Re-send everything to every connected relay now. */
export const syncNow = () => sync.healAll();
export const onSyncError = (fn) => sync.onError(fn);

/** fn({ relays, connected, pending }) now and on every change; `pending` = events no relay has yet. */
export function onStatus(fn) {
  let last = '';
  const emit = async () => {
    const s = pool.status();
    const next = { relays: s.total, connected: s.connected, pending: await db.pendingCount() };
    const key = JSON.stringify(next);
    if (key === last) return;
    last = key;
    fn(next);
  };
  const off1 = pool.onStatus(emit);
  const off2 = sync.onChange(emit);
  return () => {
    off1();
    off2();
  };
}
