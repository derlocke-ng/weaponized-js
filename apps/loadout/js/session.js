// Carrying boards over when the site's identity changed (signing in on the
// start page keeps the old device key aside for every app to migrate from).

import { app } from './app.js';
import { previousIdentities, markCarried, wasCarried } from '../../shared/account.js';
import { Wallet } from './wallet.js';
import { Settings } from './settings.js';

/** Add boards to a wallet unless it already has them with at least the same keys. */
async function carryEntries(wallet, entries) {
  for (const entry of entries) {
    const have = wallet.get(entry.pub);
    if (have && (have.w || !entry.w) && (have.k || !entry.k)) continue;
    await wallet.upsert({ ...entry, ...have, w: have?.w || entry.w, k: have?.k || entry.k });
  }
}

/** The boards this device kept under its previous keys move to the current one. */
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
