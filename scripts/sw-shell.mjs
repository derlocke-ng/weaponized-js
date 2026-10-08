// The site service worker precaches the hub, every app in the registry
// (legacy apps are built elsewhere, and an app with its own sw.js caches
// itself; both are left out) and shared/. This rewrites
// the SHELL list in hub/sw.js from the files on disk; the unit test checks
// it is current.
//   node scripts/sw-shell.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APPS } from '../apps/shared/apps.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CODE = /\.(m?js|css|html|svg|webmanifest|png)$/;

function walk(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'vendor' ? [] : walk(abs, filter);
      return filter(abs) ? [abs] : [];
    });
}

const rel = (base, f) => path.relative(base, f).split(path.sep).join('/');

/** The precache list: './', the hub's files, each app's files, shared/. */
export function shellList() {
  const hub = path.join(root, 'hub');
  const list = ['./', ...walk(hub, (f) => CODE.test(f) && !f.endsWith('sw.js')).map((f) => rel(hub, f))];
  if (fs.existsSync(path.join(hub, 'locales/en.json'))) list.push('locales/en.json');
  for (const app of APPS.filter((a) => !a.legacy)) {
    const dir = path.join(root, 'apps', app.id);
    if (!fs.existsSync(dir) || fs.existsSync(path.join(dir, 'sw.js'))) continue; // an app with its own worker caches itself
    list.push(`${app.id}/`, ...walk(dir, (f) => CODE.test(f) && !f.endsWith('sw.js')).map((f) => `${app.id}/${rel(dir, f)}`));
    if (fs.existsSync(path.join(dir, 'locales/en.json'))) list.push(`${app.id}/locales/en.json`);
  }
  const shared = path.join(root, 'apps/shared');
  list.push(...walk(shared, (f) => CODE.test(f)).map((f) => `shared/${rel(shared, f)}`));
  if (fs.existsSync(path.join(shared, 'locales/en.json'))) list.push('shared/locales/en.json');
  return [...new Set(list)];
}

export const SW_FILE = path.join(root, 'hub/sw.js');
export const currentList = () => JSON.parse(fs.readFileSync(SW_FILE, 'utf8').match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sw = fs.readFileSync(SW_FILE, 'utf8');
  const next = `const SHELL = [\n${shellList()
    .map((f) => `  '${f}',`)
    .join('\n')}\n];`;
  fs.writeFileSync(SW_FILE, sw.replace(/const SHELL = \[[\s\S]*?\];/, next));
  console.log(`hub/sw.js: ${shellList().length} files precached`);
}
