// Two registries. APPS is the code: every app the framework and this
// distribution know how to run, once each (id, name, icon, tags, flags). The
// hub shows MOUNTS: the distribution's choice of apps, each on a space, with
// its own name and icon if it wants (shared/distribution.js). Both are read
// by the start page's cards, the switcher, the settings toggles, each app's
// top bar mark, its favicon (scripts/app-icons.mjs) and the site service
// worker's file list (scripts/sw-shell.mjs). Adding an app:
// `npm run new-app -- <id> "<Name>" <icon>` (see README).
//
//   id       folder under apps/ (the code)
//   name     the app's own name; a mount may show another
//   icon     a symbol id in hub/icons.svg (lucide): card, switcher, top bar, favicon
//   tags     what it runs on, shown on the hub card
//   core     part of every distribution; a fork cannot drop it
//   legacy   built elsewhere (Vite), not precached, marked Legacy
import { DISTRIBUTION } from './distribution.js';

export const APPS = [
  { id: 'loadout', name: 'Loadout', icon: 'list-checks', tags: ['nostr', 'E2EE', 'offline-first', 'markdown'] },
  { id: 'payload', name: 'Payload', icon: 'send', tags: ['gun', 'WebRTC', 'SHA-256'] },
  { id: 'pongjs', name: 'pongjs', icon: 'gamepad-2', tags: ['gun', 'WebRTC', 'canvas'] },
  { id: 'devboard', name: 'DevBoard', icon: 'sticky-note', tags: ['nostr', 'proof of work', 'signed notes'] },
  { id: 'enigmajs', name: 'EnigmaJS', icon: 'message-square-lock', tags: ['gun', 'SEA', 'Vue'], legacy: true },
];

export const APP_IDS = APPS.map((a) => a.id);
export const appById = (id) => APPS.find((a) => a.id === id) || null;

/** What this hub shows: the distribution's mounts, each filled in from the app it mounts. */
export const MOUNTS = DISTRIBUTION.mounts.map((m) => {
  const app = appById(m.app);
  if (!app) throw new Error(`distribution mounts unknown app "${m.app}"`);
  return { ...app, ...m, app: app.id, id: m.id, name: m.name || app.name, icon: m.icon || app.icon, space: m.space || null, tags: m.tags || app.tags };
});
export const MOUNT_IDS = MOUNTS.map((m) => m.id);
export const mountById = (id) => MOUNTS.find((m) => m.id === id) || null;
/** The mounts of one app, e.g. every market this hub ships. */
export const mountsOf = (appId) => MOUNTS.filter((m) => m.app === appId);

/** The mark for a top bar: the icon on a rounded square, the same drawing as the hub card and the favicon. */
export const appMark = (entry, sprite = 'icons.svg') => `<span class="wjs-app-mark" aria-hidden="true"><svg class="icon"><use href="${sprite}#${entry.icon}"></use></svg></span>`;
