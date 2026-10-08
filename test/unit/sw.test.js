import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function walk(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    return e.isDirectory() ? walk(abs, filter) : filter(abs) ? [abs] : [];
  });
}

const shellOf = (file) => {
  const sw = fs.readFileSync(file, 'utf8');
  return JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
};
const code = (f) => /\.(m?js|css|html|svg|webmanifest)$/.test(f);

test('Loadout’s service worker caches every script, style and vendor file', () => {
  const app = path.join(root, 'apps/loadout');
  const shell = shellOf(path.join(app, 'sw.js'));
  const shared = ['nostr.mjs', 'util.js', 'events.js', 'store.js', 'relays.js', 'account.js', 'sync.js', 'i18n.js'].map((f) => `../shared/${f}`);
  const needed = [...walk(path.join(app, 'js'), code), ...walk(path.join(app, 'css'), code), ...walk(path.join(app, 'vendor'), (f) => /\.m?js$/.test(f))].map((f) => path.relative(app, f)).concat(shared);
  assert.deepEqual(needed.filter((f) => !shell.includes(f)), [], 'add these to SHELL in apps/loadout/sw.js');
  assert.deepEqual(shell.filter((f) => f !== './' && !fs.existsSync(path.join(app, f))), [], 'SHELL lists files that do not exist');
});

test('the site service worker caches the hub, Payload, pongjs and shared/', () => {
  const shell = shellOf(path.join(root, 'hub/sw.js'));
  // The site is assembled from hub/ at the root and apps/<name>/ below it.
  const onDisk = (entry) => (/^(payload|pongjs|shared)\//.test(entry) ? path.join(root, 'apps', entry) : path.join(root, 'hub', entry));
  const needed = [
    ...walk(path.join(root, 'hub'), (f) => code(f) && !f.endsWith('sw.js')).map((f) => path.relative(path.join(root, 'hub'), f)),
    ...['payload', 'pongjs', 'shared'].flatMap((app) => walk(path.join(root, 'apps', app), code).map((f) => path.relative(path.join(root, 'apps'), f))),
  ];
  assert.deepEqual(needed.filter((f) => !shell.includes(f)), [], 'add these to SHELL in hub/sw.js');
  assert.deepEqual(shell.filter((f) => !f.endsWith('/') && !fs.existsSync(onDisk(f))), [], 'SHELL lists files that do not exist');
});
