import { initNet, onStatus, pool, sync } from './net.js';
import { loadIdentity } from './identity.js';
import { Wallet } from './wallet.js';
import { watchAll } from './heal.js';
import { parseRoute } from './links.js';
import { $, icon, closeMenus } from './ui.js';
import { h } from './util.js';
import { app } from './app.js';
import { renderHome } from './views/home.js';
import { renderBoard } from './views/board.js';
import { renderAccount } from './views/account.js';

let cleanup = null;

function render() {
  closeMenus();
  cleanup?.();
  cleanup = null;
  const view = $('#view');
  const route = parseRoute(location.hash);
  document.body.dataset.route = route.name;
  window.scrollTo(0, 0);
  if (route.name === 'board') cleanup = renderBoard(view, route);
  else if (route.name === 'account') cleanup = renderAccount(view);
  else if (route.name === 'home') cleanup = renderHome(view);
  else {
    view.innerHTML = `<section class="empty"><h1>Nothing here</h1><p><a href="#/">Back to your boards</a></p></section>`;
  }
}

function renderShell() {
  $('#app').innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/" aria-label="Loadout home">
        <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14"/><path class="tick" d="M19 22l4 4 7-8"/><path d="M36 22h10M19 35h27M19 46h17"/></svg>
        <span>Loadout</span>
      </a>
      <span class="spacer"></span>
      <a class="sync" id="sync" href="#/account" title="Relay status">
        <span class="dot"></span><span class="sync-text">…</span>
      </a>
      <a class="icon-btn" href="#/account" id="accountLink" aria-label="Account and settings">${icon('user')}</a>
    </header>
    <main id="view" class="view" tabindex="-1"></main>
    <footer class="foot">
      <a href="../">weaponized.js</a> · end-to-end encrypted lists &amp; notes over <a href="https://nostr.com" target="_blank" rel="noopener">nostr</a>
    </footer>`;
  onStatus(({ relays, connected, pending }) => {
    const el = $('#sync');
    el.dataset.state = connected ? 'on' : 'off';
    el.querySelector('.sync-text').textContent = connected
      ? `${connected}/${relays}${pending ? ` · ${pending} to sync` : ''}`
      : pending
        ? `offline · ${pending} to sync`
        : 'offline';
    el.title = connected ? `Connected to ${connected} of ${relays} relays` : 'No relay connected — changes are kept on this device and sent later';
  });
}

function updateAccountBadge() {
  const a = $('#accountLink');
  if (!a) return;
  const alias = app.identity.alias;
  a.innerHTML = alias ? `<span class="avatar">${h(alias[0].toUpperCase())}</span>` : icon('user');
  a.title = alias ? `Signed in as ${alias}` : 'Device key — create an account to sync';
}

async function boot() {
  app.applyTheme();
  app.render = render;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  await initNet();
  renderShell();
  app.identity = loadIdentity();
  app.wallet = new Wallet(app.identity);
  await app.wallet.start();
  // Relays that (re)connect get this device's copy of everything that is ours.
  const rewatch = () => watchAll(app.identity, app.wallet);
  rewatch();
  app.wallet.onChange(rewatch);
  for (const r of pool.status().relays) if (r.open) sync.healRelay(r.url).catch(() => {});
  updateAccountBadge();
  window.addEventListener('hashchange', render);
  render();
}

boot().catch((err) => {
  console.error(err);
  $('#view').innerHTML = `<section class="empty"><h1>Something went wrong</h1><p>${h(err.message)}</p></section>`;
});
