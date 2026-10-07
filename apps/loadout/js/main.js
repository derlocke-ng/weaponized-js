import { initGun, onStatus, onRelayConnect } from './net.js';
import { loadIdentity, authPair } from './identity.js';
import { Wallet } from './wallet.js';
import { initBoards } from './boards.js';
import { healAll } from './heal.js';
import { parseRoute } from './links.js';
import { $, icon, closeMenus, toast } from './ui.js';
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
      <a href="../">weaponized.js</a> · end-to-end encrypted lists &amp; notes over <a href="https://gun.eco" target="_blank" rel="noopener">gun</a>
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
  a.title = alias ? `Signed in as ${alias}` : 'Device account — sign in to sync';
}

async function boot() {
  app.applyTheme();
  app.render = render;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  renderShell();
  if (typeof Gun === 'undefined' || typeof SEA === 'undefined') {
    $('#view').innerHTML = '<section class="empty"><h1>Could not load gun</h1><p>Reload the page to try again.</p></section>';
    return;
  }
  initGun();
  app.identity = await loadIdentity();
  await authPair(app.identity.pair).catch((err) => toast(`Sign-in problem: ${err.message}`, 'error'));
  app.wallet = new Wallet(app.identity.pair);
  initBoards(app.identity.pair, (pub) => app.wallet.get(pub));
  await app.wallet.start();
  updateAccountBadge();
  window.addEventListener('hashchange', render);
  render();
  startHealing();
}

/** Re-seed relays from this device's copy whenever a relay (re)connects. */
function startHealing() {
  let running = false;
  let again = false;
  let last = 0;
  const run = async () => {
    if (running) return void (again = true);
    running = true;
    last = Date.now();
    try {
      await healAll(app.identity, app.wallet);
    } catch (err) {
      console.warn('heal:', err);
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  };
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, Math.max(1500, 60_000 - (Date.now() - last)));
  };
  onRelayConnect(schedule);
}

boot().catch((err) => {
  console.error(err);
  $('#view').innerHTML = `<section class="empty"><h1>Something went wrong</h1><p>${h(err.message)}</p></section>`;
});
