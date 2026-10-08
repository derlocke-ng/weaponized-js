// Service worker for the whole site (scope: the site root). The hub, Payload,
// pongjs and shared/ are precached so the installed app opens offline; other
// same-site responses are cached as they are fetched. Network first, so an
// update shows up on the next load. Loadout has its own worker with a narrower
// scope, which takes precedence for its pages. Bump VERSION on release.
const VERSION = 'wjs-v10';
const SHELL = [
  './',
  'index.html',
  'hub.css',
  'hub.js',
  'shell.js',
  'account.js',
  'settings.html',
  'settings.js',
  'icons.svg',
  'favicon.svg',
  'icon-192.png',
  'icon-512.png',
  'manifest.webmanifest',
  'locales/en.json',
  'payload/',
  'payload/index.html',
  'payload/payload.css',
  'payload/payload.js',
  'payload/transfer.js',
  'payload/icon.svg',
  'pongjs/',
  'pongjs/index.html',
  'pongjs/style.css',
  'pongjs/pong.js',
  'pongjs/game.js',
  'pongjs/icon.svg',
  'devboard/',
  'devboard/index.html',
  'devboard/devboard.js',
  'devboard/devboard.css',
  'devboard/pow-worker.js',
  'devboard/icon.svg',
  'devboard/locales/en.json',
  'shared/gun.js',
  'shared/p2p.js',
  'shared/qr.js',
  'shared/qrcode.mjs',
  'shared/nostr.mjs',
  'shared/util.js',
  'shared/events.js',
  'shared/store.js',
  'shared/relays.js',
  'shared/account.js',
  'shared/sync.js',
  'shared/i18n.js',
  'shared/theme.js',
  'shared/settings.js',
  'shared/switcher.js',
  'shared/switcher.css',
  'shared/topbar.js',
  'shared/topbar.css',
  'shared/moderation.js',
  'shared/ui.css',
  'shared/ui.js',
  'shared/appshell.js',
  'shared/status.js',
  'shared/backup.js',
  'shared/locales/en.json',
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wjs-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope).pathname;
  if (req.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(scope)) return;
  // Revalidate with the server (ETag) rather than trusting the browser's HTTP cache: GitHub Pages
  // caches for ten minutes, and a page must never run with a script or catalog from the previous deploy.
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin', headers: { accept: req.headers.get('accept') || '*/*' } })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') {
          // A directory URL may be cached under its index.html, and anything else falls back to the hub.
          return (await caches.match(new URL('index.html', req.url).href)) || (await caches.match(new URL('index.html', self.registration.scope).href)) || Response.error();
        }
        return Response.error();
      }),
  );
});
