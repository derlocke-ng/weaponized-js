// What every page of the site shares: the network (one relay pool, one
// event store, one outbox), the language, the theme, and the account's own
// suite settings (language, theme, hidden apps) that follow it everywhere.

import { initI18n, setLanguage, savedLanguage, saveLanguage, currentLanguage, LANGUAGES, t } from './shared/i18n.js';
import { LocalStore } from './shared/store.js';
import { RelayPool, savedRelays } from './shared/relays.js';
import { Sync } from './shared/sync.js';
import { loadIdentity } from './shared/account.js';
import { theme, setTheme, applyTheme, watchDeviceSettings } from './shared/theme.js';
import { AccountSettings } from './shared/settings.js';

export { $, $$, h, icon, toast } from './shared/ui.js';
import { $, $$ } from './shared/ui.js';

export const APPS = ['loadout', 'payload', 'pongjs', 'enigmajs', 'devboard'];

export const net = { db: null, pool: null, sync: null };
/** @type {AccountSettings|null} */
export let suite = null;
const languageListeners = new Set();

/** Static text carries its key; fill it from the catalog. */
export function applyStrings(root = document) {
  for (const el of $$('[data-i18n]', root)) el.textContent = t(el.dataset.i18n);
  for (const el of $$('[data-i18n-html]', root)) el.innerHTML = t(el.dataset.i18nHtml);
  document.documentElement.classList.add('i18n');
}

/** Pages re-render their dynamic parts when the language changes (from the UI, another tab or the account). */
export const onLanguage = (fn) => {
  languageListeners.add(fn);
  return () => languageListeners.delete(fn);
};
const languageChanged = () => {
  applyStrings();
  for (const fn of languageListeners) fn(currentLanguage());
};

export async function bootShell() {
  applyTheme();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  const i18n = initI18n({ dirs: ['shared/locales/', 'locales/'] });
  net.db = await LocalStore.open('wjs');
  net.pool = new RelayPool(savedRelays());
  net.sync = new Sync(net.pool, net.db);
  await i18n;
  await startSuite();
  watchDeviceSettings({
    onTheme: applyTheme,
    onLanguage: async () => {
      const lang = savedLanguage();
      if (lang && lang !== currentLanguage()) {
        await setLanguage(lang);
        languageChanged();
      }
    },
  });
  applyStrings();
  // Never hide the page for long if the catalogs fail to load.
  setTimeout(() => document.documentElement.classList.add('i18n'), 2000);
}

/** (Re)load the suite settings for the current identity; the account's language and theme win over the device's. */
export async function startSuite() {
  suite?.stop();
  suite = new AccountSettings(loadIdentity(), net, 'suite');
  await suite.start();
  suite.onChange(applySuite);
  await applySuite();
}

async function applySuite() {
  const lang = suite.get('lang');
  if (lang && LANGUAGES[lang] && lang !== currentLanguage()) {
    saveLanguage(lang);
    await setLanguage(lang);
    languageChanged();
  }
  const th = suite.get('theme');
  if (th && th !== theme()) setTheme(th);
  for (const fn of suiteListeners) fn();
}
const suiteListeners = new Set();
export const onSuite = (fn) => {
  suiteListeners.add(fn);
  return () => suiteListeners.delete(fn);
};

/** Chosen by the person: on this device now, and in the account for every other device. */
export async function chooseLanguage(code) {
  await setLanguage(code);
  languageChanged();
  suite?.set({ lang: code }).catch(() => {});
}

export function chooseTheme(th) {
  setTheme(th);
  suite?.set({ theme: th }).catch(() => {});
}

export const hiddenApps = () => (suite?.get('hiddenApps', []) || []).filter((a) => APPS.includes(a));
export function setAppHidden(app, hidden) {
  const list = hiddenApps().filter((a) => a !== app);
  if (hidden) list.push(app);
  return suite.set({ hiddenApps: list });
}
