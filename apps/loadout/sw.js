// Offline support: the app shell is cached on install. Requests go to the
// network first so updates show up right away, and fall back to the cache
// when offline (e.g. in a supermarket basement). Bump VERSION on release.
const VERSION = 'loadout-v8';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'icons.svg',
  'icon.svg',
  'icon-192.png',
  'manifest.webmanifest',
  'locales/en.json',
  'js/main.js',
  'js/app.js',
  'js/boards.js',
  'js/config.js',
  'js/heal.js',
  'js/identity.js',
  'js/items.js',
  'js/links.js',
  'js/markdown.js',
  'js/mdtasks.js',
  'js/net.js',
  'js/session.js',
  'js/settings.js',
  'js/ui.js',
  'js/util.js',
  'js/wallet.js',
  'js/views/account.js',
  'js/views/board.js',
  'js/views/home.js',
  'js/views/list.js',
  'js/views/note.js',
  'js/views/share.js',
  '../shared/nostr.mjs',
  '../shared/util.js',
  '../shared/events.js',
  '../shared/store.js',
  '../shared/relays.js',
  '../shared/account.js',
  '../shared/sync.js',
  '../shared/i18n.js',
  '../shared/theme.js',
  '../shared/settings.js',
  '../shared/switcher.js',
  '../shared/switcher.css',
  '../shared/topbar.js',
  '../shared/topbar.css',
  '../shared/moderation.js',
  '../shared/ui.css',
  '../shared/ui.js',
  '../shared/appshell.js',
  '../shared/locales/en.json',
  'vendor/marked.esm.js',
  'vendor/purify.es.mjs',
  'vendor/qrcode.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('loadout-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope).pathname;
  const shared = new URL('../shared/', self.registration.scope).pathname;
  if (req.method !== 'GET' || url.origin !== location.origin || !(url.pathname.startsWith(scope) || url.pathname.startsWith(shared))) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
