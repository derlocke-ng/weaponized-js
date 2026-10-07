// Who you are: a nostr key. Every browser starts with its own key; a username
// and password make the same key available on every device:
//
//   scrypt(username, password) → lookup key (signs) + wrapping key (encrypts)
//   account event: kind 30790, signed by the lookup key, content = your key
//   encrypted with the wrapping key, published to your relays.
//
// Only someone who knows username AND password can compute the lookup key, so
// nobody can find, spam or overwrite your account event. Login is one request
// for one event. Names need not be unique: a different password is a
// different lookup key.

import { generateSecretKey, getPublicKey, nip19, nip49, scryptAsync, sha256, hexToBytes, bytesToHex } from './nostr.mjs';
import { KINDS, makeAddressable, seal, open, deriveKey } from './events.js';
import { store, timeout } from './util.js';

export const ID_KEY = 'wjs.identity';
const ACCOUNT_D = 'account';
const SCRYPT = { N: 2 ** 16, r: 8, p: 1, dkLen: 64 }; // ~1 s on a phone, 64 MB
const te = new TextEncoder();

/** @returns {{ sk: string, pk: string, alias: string|null, created: number }} */
export function loadIdentity() {
  const saved = store.get(ID_KEY);
  if (saved?.sk && saved.pk) return saved;
  const sk = bytesToHex(generateSecretKey());
  const id = { sk, pk: getPublicKey(hexToBytes(sk)), alias: null, created: Date.now() };
  saveIdentity(id);
  return id;
}

export function saveIdentity(id) {
  if (!store.set(ID_KEY, id)) throw new Error('Could not save your key in this browser (storage full or blocked).');
}

export const forgetIdentity = () => store.remove(ID_KEY);

export function normalizeUsername(name) {
  const n = String(name || '').trim().normalize('NFKC').toLowerCase();
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{2,39}$/u.test(n)) throw new Error('Usernames are 3–40 characters: letters, digits, dot, dash or underscore.');
  return n;
}

export function checkPassword(pass) {
  if (String(pass || '').length < 10) throw new Error('Use a password of at least 10 characters — it protects your key on public relays.');
}

/** The lookup key pair and wrapping key for a username + password. Slow on purpose. */
export async function deriveLookup(username, password) {
  const name = normalizeUsername(username);
  const salt = sha256(te.encode(`wjs/account/v1|${name}`));
  const dk = await scryptAsync(te.encode(String(password).normalize('NFKC')), salt, SCRYPT);
  const lookupSk = bytesToHex(dk.slice(0, 32));
  return { name, lookupSk, lookupPk: getPublicKey(dk.slice(0, 32)), wrapKey: dk.slice(32, 64) };
}

export async function buildAccountEvent({ name, lookupSk, wrapKey }, skHex) {
  const content = await seal(wrapKey, { v: 1, sk: skHex, alias: name });
  return makeAddressable(KINDS.ACCOUNT, ACCOUNT_D, content, lookupSk, [['v', '1']]);
}

/** @returns {Promise<{sk: string, alias: string}|null>} null when the event is not ours. */
export async function openAccountEvent(event, wrapKey) {
  try {
    const data = await open(wrapKey, event.content);
    return data?.sk ? { sk: data.sk, alias: data.alias } : null;
  } catch {
    return null;
  }
}

export const accountFilter = (lookupPk) => ({ kinds: [KINDS.ACCOUNT], authors: [lookupPk], '#d': [ACCOUNT_D] });

/**
 * Publish an account event for this key. Refuses when the same username and
 * password already belong to a different key.
 */
export async function createAccount(pool, localStore, username, password, skHex, onProgress = () => {}) {
  checkPassword(password);
  onProgress('Deriving keys…');
  const lookup = await deriveLookup(username, password);
  if (!pool.online) throw new Error('No relay connected — accounts live on relays, so you need to be online to create one.');
  onProgress('Checking relays…');
  const existing = await pool.fetch([accountFilter(lookup.lookupPk)], { ms: 5000 });
  for (const ev of existing) {
    const data = await openAccountEvent(ev, lookup.wrapKey);
    if (data && data.sk !== skHex) throw new Error('An account with this username and password already exists. Sign in instead, or pick a different password.');
  }
  const event = await buildAccountEvent(lookup, skHex);
  await localStore.put(event);
  onProgress('Publishing…');
  const { ok, failed } = await pool.publish(event);
  if (!ok.length) throw new Error(`No relay accepted the account (${failed[0]?.error || 'offline'}).`);
  await localStore.setPending(event.id, failed.filter((f) => !f.permanent).map((f) => f.url));
  return { event, alias: lookup.name };
}

/** @returns {Promise<{sk: string, pk: string, alias: string, event: object}>} */
export async function login(pool, username, password, onProgress = () => {}) {
  onProgress('Deriving keys…');
  const lookup = await deriveLookup(username, password);
  if (!pool.online) throw new Error('No relay connected — are you online?');
  onProgress('Asking relays…');
  const events = await timeout(pool.fetch([accountFilter(lookup.lookupPk)], { ms: 8000 }), 12_000, 'No relay answered.');
  for (const ev of events.sort((a, b) => b.created_at - a.created_at)) {
    const data = await openAccountEvent(ev, lookup.wrapKey);
    if (data) return { sk: data.sk, pk: getPublicKey(hexToBytes(data.sk)), alias: data.alias || lookup.name, event: ev };
  }
  throw new Error('Wrong username or password — or none of your relays knows this account.');
}

// ---- keys in other forms ----

export const pubkeyOf = (skHex) => getPublicKey(hexToBytes(skHex));
export const npub = (pk) => nip19.npubEncode(pk);
export const nsec = (skHex) => nip19.nsecEncode(hexToBytes(skHex));

/** Accept an nsec, an ncryptsec (with password) or a hex key; returns the hex secret key. */
export function importKey(text, password = '') {
  const s = String(text || '').trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
  if (s.startsWith('ncryptsec1')) {
    if (!password) throw new Error('This key is password-protected.');
    try {
      return bytesToHex(nip49.decrypt(s, password));
    } catch {
      throw new Error('Wrong password for this key.');
    }
  }
  if (s.startsWith('nsec1')) {
    const { type, data } = nip19.decode(s);
    if (type !== 'nsec') throw new Error('Not a secret key.');
    return bytesToHex(data);
  }
  throw new Error('Paste an nsec1…, ncryptsec1… or 64-character hex key.');
}

export const exportEncrypted = (skHex, password) => nip49.encrypt(hexToBytes(skHex), password, 16);

/** Key for encrypting things to yourself (wallet entries, settings). */
export const selfKey = (skHex) => deriveKey(skHex, 'wjs/self');
