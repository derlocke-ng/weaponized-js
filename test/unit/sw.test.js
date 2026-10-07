import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const app = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../apps/loadout');

function walk(dir) {
  return fs.readdirSync(path.join(app, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.posix.join(dir, e.name);
    return e.isDirectory() ? walk(rel) : [rel];
  });
}

test('the service worker caches every script, style and vendor file', () => {
  const sw = fs.readFileSync(path.join(app, 'sw.js'), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  const needed = [...walk('js'), ...walk('css'), ...walk('vendor').filter((f) => /\.m?js$/.test(f))];
  const missing = needed.filter((f) => !shell.includes(f));
  assert.deepEqual(missing, [], 'add these to SHELL in sw.js');
  const stale = shell.filter((f) => f !== './' && !fs.existsSync(path.join(app, f)));
  assert.deepEqual(stale, [], 'SHELL lists files that do not exist');
});
