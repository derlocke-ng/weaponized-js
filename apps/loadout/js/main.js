import { initNet, onSyncError, pool, sync } from './net.js';
import { loadIdentity } from './identity.js';
import { Wallet } from './wallet.js';
import { Settings } from './settings.js';
import { carryOver } from './session.js';
import { watchAll } from './heal.js';
import { parseRoute, isPub, isSecret } from './links.js';
import { $, icon, closeMenus, toast } from './ui.js';
import { h } from './util.js';
import { app } from './app.js';
import { setLanguage, shouldAskLanguage, currentLanguage, LANGUAGES, t } from '../../shared/i18n.js';
import { initAppShell } from '../../shared/appshell.js';
import { statusPill, mountStatus } from '../../shared/status.js';
import { db } from './net.js';
import { renderHome } from './views/home.js';
import { renderBoard } from './views/board.js';
import { renderAccount } from './views/account.js';

let cleanup = null;
let offStatus = null;

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
    view.innerHTML = `<section class="empty"><h1>${h(t('app.notFound'))}</h1><p><a href="#/">${h(t('app.backToBoards'))}</a></p></section>`;
  }
}

/** Asked once, in the browser's own language, when it isn't English. */
function languageBanner() {
  if (!shouldAskLanguage()) return '';
  const options = Object.entries(LANGUAGES)
    .map(([code, name]) => `<option value="${code}" ${code === currentLanguage() ? 'selected' : ''}>${h(name)}</option>`)
    .join('');
  return `
    <div class="banner lang-banner" id="langBanner">
      ${icon('languages')}
      <p>${h(t('lang.prompt'))}</p>
      <div class="lang-pick">
        <select id="langPick" aria-label="${h(t('lang.title'))}">${options}</select>
        <button type="button" class="btn btn-sm btn-primary" id="langOk">${h(t('common.ok'))}</button>
      </div>
    </div>`;
}

let shell = null;

function renderShell() {
  offStatus?.();
  $('#app').innerHTML = `
    <header id="top"></header>
    ${languageBanner()}
    <main id="view" class="view" tabindex="-1"></main>
    <footer class="foot">
      <a href="../">weaponized.js</a> · ${t('app.footer')}
    </footer>`;
  shell?.redraw();
  $('#langOk')?.addEventListener('click', async () => {
    const lang = $('#langPick').value;
    await setLanguage(lang);
    shell?.suite.set({ lang }).catch(() => {});
    rerender();
  });
  offStatus = mountStatus($('#sync'), { pool, sync });
}

function updateAccountBadge() {
  shell?.redraw(); // the shell draws the account button from the saved identity
}

/** Redraw everything in the current language. */
function rerender() {
  renderShell();
  updateAccountBadge();
  render();
}

async function boot() {
  app.applyTheme();
  app.render = render;
  app.rerender = rerender;
  await initNet();
  app.identity = loadIdentity();
  app.wallet = new Wallet(app.identity);
  app.settings = new Settings(app.identity);
  renderShell();
  shell = await initAppShell({
    app: 'loadout',
    net: { pool, db, sync },
    sprite: 'icons.svg',
    brand: { href: '#/', label: t('app.home') },
    right: () => statusPill({ href: '../settings.html#relays' }),
    account: { href: '#/account' },
  });
  shell.onLanguage(rerender);
  app.people = shell.people;
  app.blocks = shell.blocks;
  await Promise.all([app.wallet.start(), app.settings.start()]);
  await carryOver(); // boards from a key this device used before signing in elsewhere in the suite
  // Boards friends sent us (share dialog → "Send to friends…") go straight into the wallet.
  app.people?.onShare('loadout', async (share) => {
    const b = share.payload?.board;
    if (share.payload?.type !== 'board' || !b || !isPub(b.pub)) return;
    if (!app.wallet.get(b.pub)) await app.wallet.upsert({ pub: b.pub, w: isSecret(b.w) ? b.w : null, k: isSecret(b.k) ? b.k : null, type: b.kind, mode: b.mode, title: String(b.title || '').slice(0, 120) });
    await app.people.consume(share.id);
    toast(t('share.received', { name: share.name, title: b.title || t('common.untitled') }), 'success', 6000);
  });
  // Relays that (re)connect get this device's copy of everything that is ours.
  const rewatch = () => watchAll(app.identity, app.wallet);
  rewatch();
  app.wallet.onChange(rewatch);
  for (const r of pool.status().relays) if (r.open) sync.healRelay(r.url).catch(() => {});
  onSyncError(({ reason }) => toast(t('sync.rejected', { reason }), 'error', 8000));
  renderShell(); // the top bar redraws with the status link bound
  updateAccountBadge();
  window.addEventListener('hashchange', render);
  render();
}

boot().catch((err) => {
  console.error(err);
  $('#view, #app').innerHTML = `<section class="empty"><h1>${h(t('common.somethingWrong'))}</h1><p>${h(err.message)}</p></section>`;
});
