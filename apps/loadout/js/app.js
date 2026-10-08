// Shared app state, filled in by main.js at boot. Views import this instead
// of main.js to keep the module graph acyclic.
import { theme, setTheme, applyTheme } from '../../shared/theme.js';

export const app = {
  /** @type {{ pair: object, alias: string|null, created: number }} */
  identity: null,
  /** @type {import('./wallet.js').Wallet} */
  wallet: null,
  /** @type {import('./settings.js').Settings} */
  settings: null,
  /** @type {import('../../shared/people.js').People|null} friends, circles, sharing (from the app shell) */
  people: null,
  /** @type {import('../../shared/moderation.js').BlockList|null} */
  blocks: null,
  render: () => {},
  /** Redraws the shell and the current view, e.g. after a language change. */
  rerender: () => {},
  /** Page URL without the hash, used to build share links. */
  base: () => location.href.split('#')[0],
  go(hash) {
    if (location.hash === hash) app.render();
    else location.hash = hash;
  },
  theme,
  setTheme,
  applyTheme,
};
