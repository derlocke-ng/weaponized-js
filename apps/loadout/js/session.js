// Switching identity (sign in, create account, restore a backup), signing out
// and building backups. Boards you had under the old key are carried over.

import { app } from './app.js';
import { gun, clearOutbox } from './net.js';
import { authPair, saveIdentity, forgetIdentity } from './identity.js';
import { Wallet } from './wallet.js';
import { Board, initBoards, settled } from './boards.js';
import { STORE_FILE } from './config.js';
import { store } from './util.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {() => Promise<object>} getPair  authenticates gun as the new key, resolves with its pair
 * @param {{ alias?: string|null, boards?: object[], snapshots?: object, onProgress?: (msg: string) => void }} opt
 */
export async function switchIdentity(getPair, { alias = null, boards = [], snapshots = null, onProgress = () => {} } = {}) {
  const carry = [...app.wallet.list(), ...boards];
  const oldPair = app.identity.pair;
  let pair;
  try {
    pair = await getPair();
  } catch (err) {
    gun.user().leave();
    await authPair(oldPair).catch(() => {});
    throw err;
  }
  onProgress('Loading your boards…');
  app.wallet.stop();
  const wallet = new Wallet(pair);
  await wallet.start();
  initBoards(pair, (pub) => wallet.get(pub));
  await sleep(1500); // give the account's own wallet a moment to arrive
  for (const entry of carry) {
    const have = wallet.get(entry.pub);
    if (have && (have.w || !entry.w) && (have.k || !entry.k)) continue;
    await wallet.upsert({ ...entry, ...have, w: have?.w || entry.w, k: have?.k || entry.k });
  }
  if (snapshots) await restoreSnapshots(wallet, snapshots, onProgress);
  saveIdentity({ pair, alias, created: Date.now() });
  onProgress('Syncing…');
  await sleep(1500); // let the writes leave before reloading
  location.hash = '#/';
  location.reload();
}

/** Put back items, notes and titles the network has lost. */
async function restoreSnapshots(wallet, snapshots, onProgress) {
  const pubs = Object.keys(snapshots).filter((pub) => wallet.get(pub)?.w);
  let restored = 0;
  for (const [n, pub] of pubs.entries()) {
    onProgress(`Checking board ${n + 1} of ${pubs.length}…`);
    const entry = wallet.get(pub);
    const snap = snapshots[pub];
    const board = new Board(entry);
    await board.open();
    await settled(board, 5000);
    if (board.state === 'deleted' || board.state === 'locked') {
      board.close();
      continue;
    }
    if (board.enc == null) board.enc = entry.enc !== false;
    if (!board.info && snap.info) {
      await board.put('meta', 'info', snap.info);
      restored++;
    }
    for (const item of snap.items || []) {
      if (board.items.has(item.id)) continue;
      const { id, ...fields } = item;
      await board.put('items', id, fields);
      restored++;
    }
    if (!board.doc?.md && snap.doc?.md) {
      await board.setDoc(snap.doc.md);
      restored++;
    }
    board.close();
  }
  if (restored) onProgress(`Restored ${restored} missing entries`);
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
  return { app: 'loadout', v: 1, created: new Date().toISOString(), identity: { pair: app.identity.pair, alias: app.identity.alias }, boards, snapshots };
}

/** Forget this device's key, boards and cached data. */
export function wipeDevice() {
  gun.user().leave();
  app.wallet.forgetLocal();
  forgetIdentity();
  clearOutbox();
  store.remove('loadout.lastBackup');
  try {
    indexedDB.deleteDatabase(STORE_FILE);
  } catch {
    /* ignore */
  }
  location.hash = '#/';
  location.reload();
}
