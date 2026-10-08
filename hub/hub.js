// The start page: the apps, your account, the relays. Shared machinery in shell.js.

import { t, LANGUAGES, currentLanguage, shouldAskLanguage } from './shared/i18n.js';
import { savedRelays } from './shared/relays.js';
import { loadIdentity } from './shared/account.js';
import { bootShell, net, onLanguage, onSuite, chooseLanguage, hiddenApps, $, $$, h, icon } from './shell.js';
import { mountSwitcher } from './shared/switcher.js';

const infos = new Map();

function languageBanner() {
  const banner = $('#langBanner');
  if (!shouldAskLanguage()) return (banner.innerHTML = '');
  const options = Object.entries(LANGUAGES)
    .map(([code, name]) => `<option value="${code}" ${code === currentLanguage() ? 'selected' : ''}>${h(name)}</option>`)
    .join('');
  banner.innerHTML = `<div class="banner lang-banner">${icon('languages')}<p>${h(t('lang.prompt'))}</p><div class="lang-pick"><select id="langPick" aria-label="${h(t('lang.title'))}">${options}</select><button type="button" class="btn btn-primary btn-sm" id="langOk">${h(t('common.ok'))}</button></div></div>`;
  $('#langOk').addEventListener('click', () => chooseLanguage($('#langPick').value));
}

function drawHeader() {
  const id = loadIdentity();
  const link = $('#accountLink');
  link.classList.toggle('signed', Boolean(id.alias));
  link.title = id.alias ? t('app.signedInAs', { alias: id.alias }) : t('hub.signIn');
  link.innerHTML = id.alias ? `<span class="avatar" aria-hidden="true">${h(id.alias[0].toUpperCase())}</span><span class="sr-only">${h(id.alias)}</span>` : `${icon('user')}<span id="accountName">${h(t('hub.signIn'))}</span>`;
  $('#accountCta').hidden = Boolean(id.alias);
}

function drawApps() {
  const hidden = hiddenApps();
  for (const el of $$('[data-app]')) el.hidden = hidden.includes(el.dataset.app);
}

function drawRelays() {
  const status = net.pool.status().relays;
  $('#relayList').innerHTML = savedRelays()
    .map((url) => {
      const r = status.find((x) => x.url === url);
      const info = infos.get(url);
      const state = r?.open ? (r.latency != null ? t('relay.latency', { n: r.latency }) : t('relay.connected')) : t('relay.notConnected');
      const detail = [info?.countries?.join(', '), info?.name, r?.publishError ? t('relay.rejected', { error: r.publishError, when: '' }).trim() : ''].filter(Boolean).join(' · ');
      return `<li class="${r?.open ? 'up' : 'down'}"><span class="dot"></span><span class="relay-name">${h(url.replace(/^wss?:\/\//, ''))}${detail ? ` <span class="relay-detail">${h(detail)}</span>` : ''}</span><span class="relay-state">${h(state)}</span></li>`;
    })
    .join('');
}

async function boot() {
  await bootShell();
  mountSwitcher($('#switcher'), { base: './', current: 'hub', hidden: hiddenApps });
  languageBanner();
  drawHeader();
  drawApps();
  drawRelays();
  net.pool.onStatus(drawRelays);
  for (const url of savedRelays()) {
    net.pool.info(url).then((info) => {
      if (info) {
        infos.set(url, info);
        drawRelays();
      }
    });
  }
  onLanguage(() => {
    languageBanner();
    drawHeader();
    drawRelays();
  });
  onSuite(drawApps);
  addEventListener('storage', (e) => e.key === 'wjs.identity' && drawHeader());
}

boot().catch((err) => {
  console.error(err);
  document.documentElement.classList.add('i18n');
});
