// Switching identity (sign in, create account, import a key, restore a
// backup), signing out and building backups. Boards you had under the old
// key are carried over.

import { app } from './app.js';
import { db, sync, pool } from './net.js';
import { forgetIdentity } from './identity.js';
import { adoptIdentity, previousIdentities, markCarried, wasCarried } from '../../shared/account.js';
import { Wallet } from './wallet.js';
import { Settings } from './settings.js';
import { Board, settled } from './boards.js';
import { watchAll } from './heal.js';
import { sleep } from '../../shared/util.js';
import { store } from './util.js';
import { t } from '../../shared/i18n.js';

/**
 * @param {() => Promise<object>} getIdentity  resolves with the new identity { sk, pk, alias, accountPk }
 * @param {{ boards?: object[], events?: object[], snapshots?: object, onProgress?: (msg: string) => void }} opt
 */
export async function switchIdentity(getIdentity, { boards = [], events = [], snapshots = null, onProgress = () => {} } = {}) {
  const carry = [...app.wallet.list(), ...boards];
  const identity = await getIdentity();
  if (events.length) {
    // A backup's signed events go back into the store and out to the relays as they were.
    onProgress(t('session.restoring', { n: events.length }));
    for (const ev of events) await db.put(ev);
    for (const ev of events) await sync.publish(ev).catch(() => {});
  }
  onProgress(t('session.loadingBoards'));
  app.wallet.stop();
  app.settings?.stop();
  const wallet = new Wallet(identity);
  await wallet.start();
  await sleep(1500); // give the account's own boards a moment to arrive
  await carryEntries(wallet, carry);
  if (snapshots) await restoreSnapshots(wallet, snapshots, onProgress);
  adoptIdentity(identity);
  if (app.identity.pk !== identity.pk) markCarried('loadout', app.identity.pk); // this device's boards were just carried
  watchAll(identity, wallet);
  onProgress(t('session.syncing'));
  await sleep(1500); // let the writes leave before reloading
  location.hash = '#/';
  location.reload();
}

/** Add boards to a wallet unless it already has them with at least the same keys. */
async function carryEntries(wallet, entries) {
  for (const entry of entries) {
    const have = wallet.get(entry.pub);
    if (have && (have.w || !entry.w) && (have.k || !entry.k)) continue;
    await wallet.upsert({ ...entry, ...have, w: have?.w || entry.w, k: have?.k || entry.k });
  }
}

/**
 * Signing in on another page of the suite (the hub) switches the shared key;
 * the boards this device kept under its old key move to the new one here.
 */
export async function carryOver() {
  for (const prev of previousIdentities()) {
    if (prev.pk === app.identity.pk || wasCarried('loadout', prev.pk)) continue;
    const old = new Wallet(prev);
    await old.start();
    const entries = old.list();
    old.stop();
    await carryEntries(app.wallet, entries);
    // Starter templates and the like follow too, unless the account already has its own.
    const oldSettings = new Settings(prev);
    await oldSettings.start();
    oldSettings.stop();
    if (Object.keys(oldSettings.data).length > 1 && Object.keys(app.settings.data).length <= 1) await app.settings.set({ ...oldSettings.data });
    markCarried('loadout', prev.pk);
    old.forgetLocal();
    oldSettings.forgetLocal();
  }
}

/** Put back items, notes and titles the network has lost (boards you can edit). */
async function restoreSnapshots(wallet, snapshots, onProgress) {
  const pubs = Object.keys(snapshots).filter((pub) => wallet.get(pub)?.w);
  let restored = 0;
  for (const [n, pub] of pubs.entries()) {
    onProgress(t('session.checking', { i: n + 1, n: pubs.length }));
    const snap = snapshots[pub];
    const board = new Board(wallet.get(pub));
    await board.open();
    await settled(board, 5000);
    if (board.state === 'deleted' || board.state === 'locked') {
      board.close();
      continue;
    }
    if (!board.info && snap.info) {
      await board.setInfo(snap.info);
      restored++;
    }
    for (const item of snap.items || []) {
      if (board.items.has(item.id)) continue;
      const { id, ...fields } = item;
      await board.put(30702, id, fields);
      restored++;
    }
    if (!board.doc?.md && snap.doc?.md) {
      await board.setDoc(snap.doc.md);
      restored++;
    }
    board.close();
  }
  if (restored) onProgress(t('session.restored', { n: restored }));
  if (!pool.online) onProgress(t('session.offlineLater'));
}

/** Everything needed to rebuild this account elsewhere. */
export async function buildBackup(onProgress = () => {}) {
  const boards = app.wallet.list();
  const snapshots = {};
  let n = 0;
  await Promise.all(
    boards.map(async (entry) => {
      const board = new Board(entry);
      await board.open();
      await settled(board, 6000);
      if (board.state === 'ready') snapshots[entry.pub] = board.snapshot();
      board.close();
      onProgress(t('session.collected', { i: ++n, n: boards.length }));
    }),
  );
  // The signed events as the relays hold them: a restore puts them back
  // exactly, even for boards you can only view and for your account event.
  const { pk, accountPk } = app.identity;
  const authors = [pk, ...(accountPk ? [accountPk] : []), ...boards.map((b) => b.pub)];
  const events = (await Promise.all(authors.map((a) => db.byAuthor(a)))).flat();
  return { app: 'loadout', v: 2, created: new Date().toISOString(), identity: app.identity, boards, events, snapshots };
}

/** Forget this device's key, boards and cached data. */
export async function wipeDevice() {
  app.wallet.forgetLocal();
  app.settings?.forgetLocal();
  forgetIdentity();
  store.remove('loadout.lastBackup');
  await db.clear().catch(() => {});
  location.hash = '#/';
  location.reload();
}
