// Service worker for the whole site (scope: the site root). The hub, Payload,
// pongjs and shared/ are precached so the installed app opens offline; other
// same-site responses are cached as they are fetched. Network first, so an
// update shows up on the next load. Loadout has its own worker with a narrower
// scope, which takes precedence for its pages. Bump VERSION on release.
const VERSION = 'wjs-v14';
const SHELL = [
  './',
  'account.js',
  'favicon.svg',
  'hub.css',
  'hub.js',
  'icon-192.png',
  'icon-512.png',
  'icons.svg',
  'index.html',
  'manifest.webmanifest',
  'settings.html',
  'settings.js',
  'shell.js',
  'locales/en.json',
  'payload/',
  'payload/icon.svg',
  'payload/index.html',
  'payload/payload.css',
  'payload/payload.js',
  'payload/transfer.js',
  'pongjs/',
  'pongjs/game.js',
  'pongjs/icon.svg',
  'pongjs/index.html',
  'pongjs/pong.js',
  'pongjs/style.css',
  'devboard/',
  'devboard/devboard.css',
  'devboard/devboard.js',
  'devboard/icon.svg',
  'devboard/index.html',
  'devboard/locales/en.json',
  'shared/account-worker.js',
  'shared/account.js',
  'shared/apps.js',
  'shared/appshell.js',
  'shared/backup.js',
  'shared/events.js',
  'shared/gun.js',
  'shared/i18n.js',
  'shared/moderation.js',
  'shared/nostr.mjs',
  'shared/p2p.js',
  'shared/people-ui.js',
  'shared/people.js',
  'shared/pow-worker.js',
  'shared/pow.js',
  'shared/qr.js',
  'shared/qrcode.mjs',
  'shared/relays.js',
  'shared/settings.js',
  'shared/settingsview.js',
  'shared/status.js',
  'shared/store.js',
  'shared/switcher.css',
  'shared/switcher.js',
  'shared/sync.js',
  'shared/theme.js',
  'shared/topbar.css',
  'shared/topbar.js',
  'shared/ui.css',
  'shared/ui.js',
  'shared/util.js',
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
