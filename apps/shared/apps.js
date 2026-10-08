// Every app of the suite, once. The hub's cards, the app switcher, the
// settings toggles, each app's top bar mark, its favicon (scripts/app-icons.mjs)
// and the site service worker's file list (scripts/sw-shell.mjs) all read
// this. Adding an app: `npm run new-app -- <id> "<Name>" <icon>` (see README).
//
//   id        folder under apps/ and the path on the site (<id>/)
//   name      shown everywhere
//   icon      a symbol id in hub/icons.svg (lucide): card, switcher, top bar, favicon
//   tags      what it runs on, shown on the hub card
//   featured  the big card on the start page (one app)
//   isNew     a "New" badge on the hub card
//   legacy    built elsewhere (Vite), not precached, marked Legacy
export const APPS = [
  { id: 'loadout', name: 'Loadout', icon: 'list-checks', tags: ['nostr', 'E2EE', 'offline-first', 'markdown'], featured: true, isNew: true },
  { id: 'payload', name: 'Payload', icon: 'send', tags: ['gun', 'WebRTC', 'SHA-256'] },
  { id: 'pongjs', name: 'pongjs', icon: 'gamepad-2', tags: ['gun', 'WebRTC', 'canvas'] },
  { id: 'devboard', name: 'DevBoard', icon: 'sticky-note', tags: ['nostr', 'proof of work', 'signed notes'], isNew: true },
  { id: 'enigmajs', name: 'EnigmaJS', icon: 'message-square-lock', tags: ['gun', 'SEA', 'Vue'], legacy: true },
];

export const APP_IDS = APPS.map((a) => a.id);
export const appById = (id) => APPS.find((a) => a.id === id) || null;

/** The app's mark for a top bar: its icon on a rounded square, the same drawing as the hub card and the favicon. */
export const appMark = (app, sprite = 'icons.svg') => `<span class="wjs-app-mark" aria-hidden="true"><svg class="icon"><use href="${sprite}#${app.icon}"></use></svg></span>`;
