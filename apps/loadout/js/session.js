// Switching identity (sign in, create account, import a key, restore a
// backup), signing out and building backups. Boards you had under the old
// key are carried over.

import { app } from './app.js';
import { db, sync, pool } from './net.js';
import { saveIdentity, forgetIdentity } from './identity.js';
import { Wallet } from './wallet.js';
import { Board, settled } from './boards.js';
import { watchAll } from './heal.js';
import { sleep } from '../../shared/util.js';
import { store } from './util.js';

/**
 * @param {() => Promise<object>} getIdentity  resolves with the new identity { sk, pk, alias, accountPk }
 * @param {{ boards?: object[], events?: object[], snapshots?: object, onProgress?: (msg: string) => void }} opt
 */
export async function switchIdentity(getIdentity, { boards = [], events = [], snapshots = null, onProgress = () => {} } = {}) {
  const carry = [...app.wallet.list(), ...boards];
  const identity = await getIdentity();
  if (events.length) {
    // A backup's signed events go back into the store and out to the relays as they were.
    onProgress(`Restoring ${events.length} entries…`);
    for (const ev of events) await db.put(ev);
    for (const ev of events) await sync.publish(ev).catch(() => {});
  }
  onProgress('Loading your boards…');
  app.wallet.stop();
  const wallet = new Wallet(identity);
  await wallet.start();
  await sleep(1500); // give the account's own boards a moment to arrive
  for (const entry of carry) {
    const have = wallet.get(entry.pub);
    if (have && (have.w || !entry.w) && (have.k || !entry.k)) continue;
    await wallet.upsert({ ...entry, ...have, w: have?.w || entry.w, k: have?.k || entry.k });
  }
  if (snapshots) await restoreSnapshots(wallet, snapshots, onProgress);
  saveIdentity(identity);
  watchAll(identity, wallet);
  onProgress('Syncing…');
  await sleep(1500); // let the writes leave before reloading
  location.hash = '#/';
  location.reload();
}

/** Put back items, notes and titles the network has lost (boards you can edit). */
async function restoreSnapshots(wallet, snapshots, onProgress) {
  const pubs = Object.keys(snapshots).filter((pub) => wallet.get(pub)?.w);
  let restored = 0;
  for (const [n, pub] of pubs.entries()) {
    onProgress(`Checking board ${n + 1} of ${pubs.length}…`);
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
  if (restored) onProgress(`Restored ${restored} missing entries`);
  if (!pool.online) onProgress('Offline — restored items will sync later');
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
      onProgress(`Collected ${++n} of ${boards.length} boards…`);
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
  forgetIdentity();
  store.remove('loadout.lastBackup');
  await db.clear().catch(() => {});
  location.hash = '#/';
  location.reload();
}
