// Keys every app needs (account form, relays, sign-out) live in the shared
// catalogs. This moves them there from an app catalog in every language, so
// translators can keep editing one file per app. Idempotent; run after adding
// a key to SHARED_PREFIXES below or after a translation lands.
//   node scripts/i18n-shared-keys.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SHARED_KEYS = [
  'app.signedInAs',
  'app.deviceKeyBadge',
  'account.identity',
  'account.signedIn',
  'account.deviceKey',
  'account.publicKey',
  'account.copyNpub',
  'account.exportKey',
  'account.tab.signIn',
  'account.tab.create',
  'account.tab.import',
  'account.username',
  'account.secretKey',
  'account.secretKeyHint',
  'account.password',
  'account.passwordForKey',
  'account.repeatPassword',
  'account.hint.signIn',
  'account.hint.create',
  'account.hint.import',
  'account.button.import',
  'account.progress.create',
  'account.progress.signIn',
  'account.progress.import',
  'account.passwordsMismatch',
  'account.relays',
  'account.relaysText',
  'account.editRelays',
  'account.oneUrlPerLine',
  'account.saveReconnect',
  'account.resetRelays',
  'account.invalidRelay',
  'account.signOut',
  'account.signOutDialog.title',
  'account.signOutDialog.text',
  'account.export.title',
  'account.export.text',
  'account.export.secretKey',
  'account.export.downloadLabel',
  'account.export.placeholder',
  'account.export.download',
  'account.export.min10',
  'account.appearance',
  'account.theme.system',
  'account.theme.light',
  'account.theme.dark',
];

const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const write = (f, obj) => fs.writeFileSync(f, JSON.stringify(obj, null, 2) + '\n');

let moved = 0;
for (const app of ['loadout']) {
  const dir = path.join(root, 'apps', app, 'locales');
  for (const file of fs.readdirSync(dir)) {
    const lang = file.replace(/\.json$/, '');
    const appCat = read(path.join(dir, file));
    const sharedFile = path.join(root, 'apps/shared/locales', file);
    const shared = read(sharedFile) || {};
    let changed = false;
    for (const key of SHARED_KEYS) {
      if (key in appCat) {
        if (!(key in shared)) shared[key] = appCat[key];
        delete appCat[key];
        changed = true;
        moved++;
      }
    }
    if (changed) {
      write(path.join(dir, file), appCat);
      write(sharedFile, shared);
      console.log(`${lang}: moved shared keys out of ${app}`);
    }
  }
}
console.log(`${moved} keys moved`);
