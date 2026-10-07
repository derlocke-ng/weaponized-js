import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, parseBoardInput, shareLink, boardHash, isPub } from '../../apps/loadout/js/links.js';

const PUB = 'A'.repeat(43) + '.' + 'b_-'.repeat(14) + 'c';
const KEY = 'k'.repeat(43);
const PRIV = 'w'.repeat(43);
const BASE = 'https://example.github.io/weaponized-js/loadout/';

test('recognises SEA public keys', () => {
  assert.ok(isPub(PUB));
  assert.ok(!isPub(PUB + 'x'));
  assert.ok(!isPub('~' + PUB));
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
  const priv = { pub: PUB, w: PRIV, k: KEY, enc: true };
  assert.equal(shareLink(BASE, priv, 'edit'), `${BASE}#/b/${PUB}?w=${PRIV}`);
  assert.equal(shareLink(BASE, priv, 'view'), `${BASE}#/b/${PUB}?k=${KEY}`);
  const pub = { pub: PUB, w: PRIV, k: null, enc: false };
  assert.equal(shareLink(BASE, pub, 'view'), `${BASE}#/b/${PUB}`);
  assert.throws(() => shareLink(BASE, { pub: PUB, enc: true, k: KEY }, 'edit'));
  assert.throws(() => shareLink(BASE, { pub: PUB, enc: true }, 'view'));
  assert.deepEqual(parseRoute(boardHash(priv)), { name: 'board', pub: PUB, w: PRIV, k: null });
});
