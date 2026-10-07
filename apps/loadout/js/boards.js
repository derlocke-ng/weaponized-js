// A board is its own SEA key pair. Its data lives in that key's user graph
// (~<pub>/meta, ~<pub>/items, ~<pub>/doc), which every gun peer — relays
// included — only accepts when signed. Editors hold the board's private key
// and use it to certify their own key for those paths; viewers can't write.
// Private boards encrypt every value with a symmetric key derived from the
// private key and handed to viewers separately.

/* global SEA */
import { BOARD_PATHS } from './config.js';
import { gun, write, setWriter } from './net.js';
import { randomId, sha256 } from './util.js';

const POLICY = BOARD_PATHS.map((p) => ({ '*': p }));
const MISSING_AFTER = 9000;
const certs = new Map(); // `${board pub}|${user pub}` -> Promise<cert>
let userPair = null;
let keyFor = () => null; // pub -> { w } from the wallet, for queued writes
const editKeys = new Map(); // pub -> w for boards opened this session

export function initBoards(pair, lookup) {
  userPair = pair;
  keyFor = lookup;
  setWriter('board', async ({ pub, path, key, value }) => {
    const w = editKeys.get(pub) || keyFor(pub)?.w;
    if (!w) throw new Error('No edit key for this board');
    const cert = await certFor(pub, w);
    return new Promise((resolve, reject) => {
      gun.get(`~${pub}`).get(path).get(key).put(value, (ack) => (ack.err ? reject(new Error(ack.err)) : resolve()), { opt: { cert } });
    });
  });
}

function certFor(pub, w) {
  const id = `${pub}|${userPair.pub}`;
  if (!certs.has(id)) {
    const cert = SEA.certify(userPair.pub, POLICY, { pub, priv: w }).then((c) => {
      if (!c) throw new Error('Could not sign the board certificate (bad edit key?)');
      return c;
    });
    certs.set(id, cert);
    cert.catch(() => certs.delete(id));
  }
  return certs.get(id);
}

export const viewKeyFor = (w) => sha256(`loadout|view-key|${w}`);

async function encode(value, key) {
  if (value == null) return null;
  return key ? SEA.encrypt(value, key) : JSON.stringify(value);
}

const LOCKED = Symbol('locked');

async function decode(raw, key) {
  if (typeof raw !== 'string') return undefined;
  if (raw.startsWith('SEA{')) {
    if (!key) return LOCKED;
    const v = await SEA.decrypt(raw, key);
    return v == null ? LOCKED : v;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Create a board and write its info. Returns the wallet entry. */
export async function createBoard({ type, title, mode = 'check', enc = true }) {
  const pair = await SEA.pair();
  const entry = { pub: pair.pub, w: pair.priv, k: enc ? await viewKeyFor(pair.priv) : null, enc, type, title, mode };
  const board = new Board(entry);
  board.enc = enc;
  await board.setInfo({ v: 1, type, title, mode, created: Date.now() });
  return entry;
}

export class Board {
  /** @param {{pub: string, w?: string|null, k?: string|null}} keys */
  constructor({ pub, w = null, k = null }) {
    this.pub = pub;
    this.w = w;
    this.k = k;
    this.enc = null; // learnt from the first info value
    this.info = null;
    this.items = new Map();
    this.doc = null; // { md, u }
    this.state = 'loading'; // loading | ready | locked | missing | deleted
    this.listeners = new Set();
    this.seq = new Map();
    this.chains = [];
    if (w) editKeys.set(pub, w);
  }

  get canEdit() {
    return Boolean(this.w);
  }

  async ready() {
    if (this.w && !this.k) this.k = await viewKeyFor(this.w);
  }

  async open() {
    await this.ready();
    const root = gun.get(`~${this.pub}`);
    const meta = root.get('meta');
    const sub = (chain, fn) => {
      this.chains.push(chain);
      chain.on(fn);
    };
    sub(meta.get('info'), (raw) => this.receive('info', raw, (v) => this.onInfo(v, raw)));
    sub(meta.get('del'), (raw) => {
      if (raw === '1') this.set({ state: 'deleted' });
    });
    sub(root.get('items').map(), (raw, id) => this.receive(`i:${id}`, raw, (v) => this.onItem(id, v)));
    sub(root.get('doc').get('body'), (raw) => this.receive('doc', raw, (v) => this.onDoc(v)));
    this.missingTimer = setTimeout(() => {
      if (this.state === 'loading') this.set({ state: 'missing' });
    }, MISSING_AFTER);
    return this;
  }

  close() {
    this.closed = true;
    clearTimeout(this.missingTimer);
    for (const c of this.chains) c.off();
    this.listeners.clear();
  }

  /** Decode values in arrival order even though decryption is async. */
  async receive(slot, raw, apply) {
    if (this.closed) return;
    const n = (this.seq.get(slot) || 0) + 1;
    this.seq.set(slot, n);
    const value = raw == null ? null : await decode(raw, this.enc === false ? null : this.k);
    if (this.closed || this.seq.get(slot) !== n || value === undefined) return;
    apply(value);
  }

  onInfo(value, raw) {
    if (typeof raw === 'string') this.enc = raw.startsWith('SEA{');
    if (value === LOCKED) return this.set({ state: 'locked' });
    if (!value) return;
    this.info = value;
    if (this.state !== 'deleted') this.set({ state: 'ready' });
    else this.emit();
  }

  onItem(id, value) {
    if (value === LOCKED) return;
    if (value && typeof value === 'object' && typeof value.t === 'string') this.items.set(id, { ...value, id });
    else this.items.delete(id);
    this.emit('items');
  }

  onDoc(value) {
    if (value === LOCKED) return;
    this.doc = value && typeof value.md === 'string' ? value : null;
    this.emit('doc');
  }

  set(patch) {
    Object.assign(this, patch);
    this.emit();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(what = 'all') {
    for (const fn of this.listeners) fn(what);
  }

  // ---- writes ----

  async put(path, key, value) {
    if (!this.w) throw new Error('You can only view this board.');
    await this.ready();
    const raw = await encode(value, this.enc === false ? null : this.k);
    await write({ scope: 'board', pub: this.pub, path, key, value: raw });
  }

  setInfo(info) {
    this.info = { ...this.info, ...info, u: Date.now() };
    return this.put('meta', 'info', this.info);
  }

  addItem(fields) {
    const now = Date.now();
    const id = randomId();
    return this.put('items', id, { t: fields.t, d: fields.d ? 1 : 0, q: fields.q ?? null, o: fields.o ?? 0, c: now, u: now }).then(() => id);
  }

  updateItem(id, patch) {
    const cur = this.items.get(id);
    if (!cur) return Promise.resolve();
    const { id: _, ...rest } = { ...cur, ...patch, u: Date.now() };
    return this.put('items', id, rest);
  }

  removeItem(id) {
    return this.put('items', id, null);
  }

  setDoc(md) {
    this.doc = { md, u: Date.now() };
    return this.put('doc', 'body', this.doc);
  }

  /** Wipe the content for everyone and mark the board deleted. */
  async destroy() {
    await Promise.all([...this.items.keys()].map((id) => this.removeItem(id)));
    if (this.doc) await this.put('doc', 'body', null);
    await write({ scope: 'board', pub: this.pub, path: 'meta', key: 'del', value: '1' });
    await this.put('meta', 'info', null);
  }

  snapshot() {
    return { info: this.info, items: [...this.items.values()], doc: this.doc };
  }
}

/** Wait until a board has loaded (or given up). */
export function settled(board, ms = 6000) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      off();
      resolve(board);
    };
    const t = setTimeout(done, ms);
    const off = board.on(() => {
      if (board.state !== 'loading') setTimeout(done, 600); // let items trickle in
    });
    if (board.state !== 'loading') setTimeout(done, 600);
  });
}
