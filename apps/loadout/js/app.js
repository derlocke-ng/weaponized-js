// Shared app state, filled in by main.js at boot. Views import this instead
// of main.js to keep the module graph acyclic.
import { store } from './util.js';

const THEME_KEY = 'loadout.theme';

export const app = {
  /** @type {{ pair: object, alias: string|null, created: number }} */
  identity: null,
  /** @type {import('./wallet.js').Wallet} */
  wallet: null,
  /** @type {import('./settings.js').Settings} */
  settings: null,
  render: () => {},
  /** Redraws the shell and the current view, e.g. after a language change. */
  rerender: () => {},
  /** Page URL without the hash, used to build share links. */
  base: () => location.href.split('#')[0],
  go(hash) {
    if (location.hash === hash) app.render();
    else location.hash = hash;
  },
  theme: () => store.get(THEME_KEY, 'system'),
  setTheme(t) {
    store.set(THEME_KEY, t);
    app.applyTheme();
  },
  applyTheme() {
    const t = app.theme();
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  },
};
