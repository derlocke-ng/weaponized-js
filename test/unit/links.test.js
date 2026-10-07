import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, parseBoardInput, shareLink, boardHash, isPub } from '../../apps/loadout/js/links.js';

const PUB = 'a1'.repeat(32);
const KEY = 'b2'.repeat(32);
const PRIV = 'c3'.repeat(32);
const BASE = 'https://example.github.io/weaponized-js/loadout/';

test('recognises nostr public keys (64 hex characters)', () => {
  assert.ok(isPub(PUB));
  assert.ok(!isPub(PUB + 'a'));
  assert.ok(!isPub(PUB.toUpperCase()));
  assert.ok(!isPub('npub1' + PUB));
});

test('parses routes', () => {
  assert.deepEqual(parseRoute(''), { name: 'home' });
  assert.deepEqual(parseRoute('#/'), { name: 'home' });
  assert.deepEqual(parseRoute('#/account'), { name: 'account' });
  assert.deepEqual(parseRoute('#/nope'), { name: 'notfound' });
  assert.deepEqual(parseRoute(`#/b/${PUB}`), { name: 'board', pub: PUB, w: null, k: null });
  assert.deepEqual(parseRoute(`#/b/${PUB}?k=${KEY}`), { name: 'board', pub: PUB, w: null, k: KEY });
  assert.deepEqual(parseRoute(`#/b/${PUB}?w=${PRIV}`), { name: 'board', pub: PUB, w: PRIV, k: null });
});

test('ignores malformed secrets', () => {
  assert.deepEqual(parseRoute(`#/b/${PUB}?k=short&w=${PRIV}x`), { name: 'board', pub: PUB, w: null, k: null });
  assert.equal(parseRoute('#/b/not-a-key').name, 'notfound');
});

test('parses pasted links and bare addresses', () => {
  assert.equal(parseBoardInput(`${BASE}#/b/${PUB}?w=${PRIV}`).w, PRIV);
  assert.equal(parseBoardInput(`/b/${PUB}`).pub, PUB);
  assert.equal(parseBoardInput(`b/${PUB}?k=${KEY}`).k, KEY);
  assert.equal(parseBoardInput(`  ${PUB} `).pub, PUB);
  assert.equal(parseBoardInput('https://example.com/'), null);
  assert.equal(parseBoardInput(''), null);
});

test('builds share links', () => {
  const board = { pub: PUB, w: PRIV, k: KEY };
  assert.equal(shareLink(BASE, board, 'edit'), `${BASE}#/b/${PUB}?w=${PRIV}`);
  assert.equal(shareLink(BASE, board, 'view'), `${BASE}#/b/${PUB}?k=${KEY}`);
  assert.throws(() => shareLink(BASE, { pub: PUB, k: KEY }, 'edit'), /edit key/);
  assert.throws(() => shareLink(BASE, { pub: PUB }, 'view'), /read key/);
  assert.deepEqual(parseRoute(boardHash(board)), { name: 'board', pub: PUB, w: PRIV, k: null });
});
