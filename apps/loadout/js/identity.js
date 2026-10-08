// Your key, and the username + password account that puts it on every device.
// The mechanics live in shared/account.js; this binds them to Loadout's pool.

import { pool, db, sync } from './net.js';
import * as account from '../../shared/account.js';
import { fingerprint } from '../../shared/events.js';

export const { loadIdentity, saveIdentity, forgetIdentity, checkPassword, importKey, npub, nsec, exportEncrypted } = account;
export const normalizeAlias = account.normalizeUsername;
export { fingerprint };

/** Sign in to an existing account; resolves with the identity it holds. */
export async function signIn(alias, pass, onProgress) {
  const { sk, pk, alias: name, event } = await account.login(pool, alias, pass, onProgress);
  await db.put(event);
  return { sk, pk, alias: name, accountPk: event.pubkey, created: Date.now() };
}

/** Publish an account for the current key; resolves with the updated identity. */
export async function createAccount(identity, alias, pass, onProgress) {
  const { event, alias: name } = await account.createAccount({ pool, sync }, alias, pass, identity.sk, onProgress);
  return { ...identity, alias: name, accountPk: event.pubkey };
}

/** Use a key you already have (nsec, ncryptsec or hex). */
export function identityFromKey(text, password) {
  const sk = importKey(text, password);
  return { sk, pk: account.pubkeyOf(sk), alias: null, accountPk: null, created: Date.now() };
}
