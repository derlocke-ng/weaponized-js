import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { APPS, MOUNTS, appById, mountById, mountsOf, appMark } from '../../apps/shared/apps.js';
import { DISTRIBUTION } from '../../apps/shared/distribution.js';
import { iconSvg, iconFile, appsWithIcons } from '../../scripts/app-icons.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

test('the registry is consistent: unique ids, folders, icons in the sprite, hub text in every language', () => {
  assert.equal(new Set(APPS.map((a) => a.id)).size, APPS.length, 'ids are unique');
  assert.equal(MOUNTS.filter((a) => a.featured).length, 1, 'one featured mount');
  assert.equal(new Set(MOUNTS.map((m) => m.id)).size, MOUNTS.length, 'mount ids are unique');
  for (const m of DISTRIBUTION.mounts) assert.ok(appById(m.app), `mount ${m.id} mounts a known app`);
  assert.match(DISTRIBUTION.name, /\S/);
  assert.ok(DISTRIBUTION.relays.every((r) => /^wss?:\/\//.test(r)), 'relays are websocket URLs');
  const sprite = fs.readFileSync(path.join(root, 'hub/icons.svg'), 'utf8');
  for (const app of APPS) {
    assert.match(app.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(fs.existsSync(path.join(root, 'apps', app.id)), `apps/${app.id} exists`);
    assert.ok(sprite.includes(`<symbol id="${app.icon}"`), `${app.id}: icon "${app.icon}" is in hub/icons.svg`);
    if (!app.legacy) assert.ok(fs.existsSync(path.join(root, 'apps', app.id, 'index.html')), `apps/${app.id}/index.html exists`);
  }
  for (const m of MOUNTS) {
    for (const file of fs.readdirSync(path.join(root, 'hub/locales'))) {
      const cat = JSON.parse(fs.readFileSync(path.join(root, 'hub/locales', file), 'utf8'));
      assert.ok(cat[`hub.${m.id}.text`], `${file} has hub.${m.id}.text`);
    }
  }
  assert.equal(appById('loadout').name, 'Loadout');
  assert.equal(mountById('devboard').app, 'devboard');
  assert.equal(mountsOf('loadout').length, 1);
  assert.match(appMark(appById('devboard'), '../icons.svg'), /wjs-app-mark.*\.\.\/icons\.svg#sticky-note/);
});

test('every app’s favicon is the registry icon (scripts/app-icons.mjs)', () => {
  for (const app of appsWithIcons()) {
    assert.equal(fs.readFileSync(iconFile(app), 'utf8'), iconSvg(app), `apps/${app.id}/icon.svg is current — run \`npm run icons\``);
  }
});
