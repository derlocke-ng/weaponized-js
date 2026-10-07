// Who you are: a SEA key pair. Every browser starts with its own device key;
// an alias + password account (gun's user system) gives you the same key on
// every device you sign in on.

/* global SEA */
import { gun } from './net.js';
import { store, timeout } from './util.js';

const ID_KEY = 'loadout.identity';
const AUTH_TIMEOUT = 20_000;

/** @returns {{ pair: object, alias: string|null, created: number }} */
export async function loadIdentity() {
  const saved = store.get(ID_KEY);
  if (saved?.pair?.pub && saved.pair.priv && saved.pair.epriv) return saved;
  const id = { pair: await SEA.pair(), alias: null, created: Date.now() };
  store.set(ID_KEY, id);
  return id;
}

export function saveIdentity(id) {
  if (!store.set(ID_KEY, id)) throw new Error('Could not save your key in this browser (storage full or blocked).');
}

export function forgetIdentity() {
  store.remove(ID_KEY);
}

export function normalizeAlias(alias) {
  const a = String(alias || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(a)) {
    throw new Error('Usernames are 3–40 characters: letters, digits, dot, dash or underscore.');
  }
  return a;
}

export function checkPassword(pass) {
  if (String(pass || '').length < 10) throw new Error('Use a password of at least 10 characters — it protects your key on public relays.');
}

/** Authenticate the gun instance as this key pair. */
export function authPair(pair) {
  return timeout(
    new Promise((resolve, reject) => {
      gun.user().auth(pair, (ack) => (ack.err ? reject(new Error(ack.err)) : resolve(pair)));
    }),
    AUTH_TIMEOUT,
    'Signing in took too long.',
  );
}

function authAlias(alias, pass) {
  return timeout(
    new Promise((resolve, reject) => {
      gun.user().auth(alias, pass, (ack) => (ack.err ? reject(new Error(friendly(ack.err))) : resolve(ack.sea)));
    }),
    AUTH_TIMEOUT,
    'No relay answered — are you online? Accounts need a relay that knows them.',
  );
}

/** Sign in to an existing account; resolves with its key pair. */
export async function signIn(alias, pass) {
  gun.user().leave();
  return authAlias(normalizeAlias(alias), pass);
}

/** Create an account (fails if a relay already knows the username). */
export async function createAccount(alias, pass) {
  const name = normalizeAlias(alias);
  checkPassword(pass);
  gun.user().leave();
  await timeout(
    new Promise((resolve, reject) => {
      gun.user().create(name, pass, (ack) => (ack.err ? reject(new Error(friendly(ack.err))) : resolve()));
    }),
    AUTH_TIMEOUT,
    'No relay answered — are you online?',
  );
  return authAlias(name, pass);
}

function friendly(err) {
  if (/already created/i.test(err)) return 'That username is taken.';
  if (/wrong user or password/i.test(err)) return 'Wrong username or password.';
  return err;
}

/** Short, human-comparable fingerprint of a public key. */
export function fingerprint(pub) {
  return String(pub || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).replace(/(.{4})(?=.)/g, '$1-');
}
