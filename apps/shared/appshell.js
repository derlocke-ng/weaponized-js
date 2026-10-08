// What an app needs to feel like part of the suite: the shared top bar with
// the switcher, the theme, the language, and the account's hidden apps.
//
//   const shell = await initAppShell({ current: 'payload', brand: { name: 'Payload', mark }, right: '…' });
//   shell.onLanguage(() => render());   // optional

import { initI18n, setLanguage, savedLanguage, currentLanguage, LANGUAGES } from './i18n.js';
import { applyTheme, setTheme, theme, watchDeviceSettings } from './theme.js';
import { loadIdentity } from './account.js';
import { AccountSettings } from './settings.js';
import { mountTopbar } from './topbar.js';
import { setSprite } from './ui.js';

/**
 * @param {{ current: string, brand: object, right?: string, base?: string, header?: HTMLElement, dirs?: string[], sprite?: string, net?: object }} options
 *   base: path to the site root ('../' for an app); dirs: catalog dirs (shared + the app's own `locales/`)
 */
export async function initAppShell({ current, brand, right = '', base = '../', header = '#top', dirs = [`${base}shared/locales/`, 'locales/'], sprite = 'icons.svg', net = null }) {
  // The header is looked up on every draw: apps that re-render their shell get a fresh element.
  const headerEl = () => (typeof header === 'string' ? document.querySelector(header) : header);
  applyTheme();
  setSprite(sprite);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register(`${base}sw.js`).catch(() => {});
  await initI18n({ dirs });
  const identity = loadIdentity();
  // Hidden apps, language and theme chosen in the account: from the cache now, live when the app brings a connection.
  const suite = new AccountSettings(identity, net, 'suite');
  if (net) await suite.start();
  const listeners = new Set();
  const draw = () => {
    const el = headerEl();
    if (el) mountTopbar(el, { base, current, brand, right: typeof right === 'function' ? right() : right, hidden: () => suite.get('hiddenApps', []) || [], sprite });
  };
  draw();
  const languageChanged = () => {
    draw();
    for (const fn of listeners) fn(currentLanguage());
  };
  const applySuite = async () => {
    const lang = suite.get('lang');
    if (lang && LANGUAGES[lang] && lang !== currentLanguage()) {
      await setLanguage(lang);
      languageChanged();
    }
    const th = suite.get('theme');
    if (th && th !== theme()) setTheme(th);
    draw();
  };
  suite.onChange(applySuite);
  await applySuite();
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
  return {
    suite,
    redraw: draw,
    onLanguage: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
