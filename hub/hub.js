// The landing page of the installed app: one account for every tool, the
// language, and the relays the apps use. Everything comes from apps/shared/,
// which the site build serves next to this file as /shared/.

import { initI18n, setLanguage, shouldAskLanguage, currentLanguage, savedLanguage, LANGUAGES, t, tErr, has } from './shared/i18n.js';
import { LocalStore } from './shared/store.js';
import { RelayPool, savedRelays } from './shared/relays.js';
import { Sync } from './shared/sync.js';
import { loadIdentity, adoptIdentity, forgetIdentity, createAccount, login, importKey, pubkeyOf, checkPassword } from './shared/account.js';
import { fingerprint } from './shared/events.js';
import { theme, setTheme, applyTheme, watchDeviceSettings } from './shared/theme.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="icons.svg#${name}"></use></svg>`;

let db;
let pool;
let sync;

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});

function toast(message, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4000);
}

/** Static text carries its key; fill it from the catalog. */
function applyStrings() {
  for (const el of $$('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of $$('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  document.documentElement.classList.add('i18n');
}

function languageUi() {
  const options = (selected) =>
    Object.entries(LANGUAGES)
      .map(([code, name]) => `<option value="${code}" ${code === selected ? 'selected' : ''}>${h(name)}</option>`)
      .join('');
  const banner = $('#langBanner');
  banner.innerHTML = shouldAskLanguage()
    ? `<div class="banner lang-banner">${icon('languages')}<p>${h(t('lang.prompt'))}</p><div class="lang-pick"><select id="langPick" aria-label="${h(t('lang.title'))}">${options(currentLanguage())}</select><button type="button" class="btn btn-primary btn-sm" id="langOk">${h(t('common.ok'))}</button></div></div>`
    : '';
  $('#langOk')?.addEventListener('click', () => switchLanguage($('#langPick').value));
  const select = $('#langSelect');
  select.innerHTML = options(currentLanguage());
  select.setAttribute('aria-label', t('lang.title'));
  select.onchange = () => switchLanguage(select.value);
}

async function switchLanguage(code) {
  await setLanguage(code);
  applyStrings();
  languageUi();
  renderAccount();
}

// ---- account ----

function renderAccount() {
  const id = loadIdentity();
  const body = $('#accountBody');
  $('#accountName').textContent = id.alias || t('hub.signIn');
  $('#accountLink').classList.toggle('signed', Boolean(id.alias));
  if (id.alias) {
    body.innerHTML = `
      <p>${t('account.signedIn', { alias: h(id.alias) })}</p>
      <p class="muted small">${h(t('hub.accountSigned'))} · ${h(t('account.publicKey'))} <code>${h(fingerprint(id.pk))}</code></p>
      <div class="form-actions">
        <a class="btn btn-primary" href="loadout/">${icon('list-checks')}<span>${h(t('hub.openLoadout'))}</span></a>
        <button type="button" class="btn btn-ghost" data-act="signout">${icon('log-out')}<span>${h(t('account.signOut'))}</span></button>
      </div>`;
    return;
  }
  body.innerHTML = `
    <p>${h(t('hub.accountText'))}</p>
    <div class="seg" role="tablist">
      <label><input type="radio" name="authTab" value="signin" checked><span>${h(t('account.tab.signIn'))}</span></label>
      <label><input type="radio" name="authTab" value="create"><span>${h(t('account.tab.create'))}</span></label>
      <label><input type="radio" name="authTab" value="import"><span>${h(t('account.tab.import'))}</span></label>
    </div>
    <form class="form" id="authForm" autocomplete="on">
      <label class="field" id="aliasField">${h(t('account.username'))}<input name="alias" autocomplete="username" required minlength="3" maxlength="40" spellcheck="false" autocapitalize="off"></label>
      <label class="field" id="keyField" hidden>${h(t('account.secretKey'))} <small>${h(t('account.secretKeyHint'))}</small><textarea name="key" rows="2" spellcheck="false" autocapitalize="off" placeholder="nsec1…"></textarea></label>
      <label class="field" id="passField"><span id="passLabel">${h(t('account.password'))}</span><input name="pass" type="password" autocomplete="current-password" required></label>
      <label class="field" id="confirmField" hidden>${h(t('account.repeatPassword'))}<input name="pass2" type="password" autocomplete="new-password"></label>
      <p class="hint" id="authHint">${h(t('account.hint.signIn'))}</p>
      <div class="form-actions"><button class="btn btn-primary" id="authBtn">${h(t('account.tab.signIn'))}</button><span class="progress-text" id="authProgress"></span></div>
      <p class="form-error" id="authError" role="alert" hidden></p>
    </form>
    <p class="muted small">${h(t('account.deviceKey').replace(/<[^>]+>/g, ''))}</p>`;
}

function authMode() {
  return $('[name=authTab]:checked')?.value || 'signin';
}

function onAccountChange(e) {
  if (e.target.name !== 'authTab') return;
  const mode = e.target.value;
  const form = $('#authForm');
  $('#aliasField').hidden = mode === 'import';
  form.alias.required = mode !== 'import';
  $('#keyField').hidden = mode !== 'import';
  form.key.required = mode === 'import';
  form.pass.required = mode !== 'import';
  $('#confirmField').hidden = mode !== 'create';
  form.pass2.required = mode === 'create';
  form.pass.autocomplete = mode === 'create' ? 'new-password' : 'current-password';
  $('#passLabel').textContent = mode === 'import' ? t('account.passwordForKey') : t('account.password');
  $('#authBtn').textContent = { signin: t('account.tab.signIn'), create: t('account.tab.create'), import: t('account.button.import') }[mode];
  $('#authHint').textContent = { signin: t('account.hint.signIn'), create: t('account.hint.create'), import: t('account.hint.import') }[mode];
}

async function onAccountSubmit(e) {
  if (e.target.id !== 'authForm') return;
  e.preventDefault();
  const form = e.target;
  const mode = authMode();
  const btn = $('#authBtn');
  const progress = $('#authProgress');
  const error = $('#authError');
  const onProgress = (msg) => (progress.textContent = has(msg) ? t(msg) : msg);
  error.hidden = true;
  btn.disabled = true;
  try {
    const pass = form.pass.value;
    const current = loadIdentity();
    let next;
    if (mode === 'create') {
      checkPassword(pass);
      if (pass !== form.pass2.value) throw new Error(t('account.passwordsMismatch'));
      progress.textContent = t('account.progress.create');
      const { event, alias } = await createAccount({ pool, sync }, form.alias.value, pass, current.sk, onProgress);
      next = { ...current, alias, accountPk: event.pubkey };
    } else if (mode === 'signin') {
      progress.textContent = t('account.progress.signIn');
      const { sk, pk, alias, event } = await login(pool, form.alias.value, pass, onProgress);
      await db.put(event);
      next = { sk, pk, alias, accountPk: event.pubkey, created: Date.now() };
    } else {
      const sk = importKey(form.key.value, pass);
      next = { sk, pk: pubkeyOf(sk), alias: null, accountPk: null, created: Date.now() };
    }
    adoptIdentity(next);
    renderAccount();
    if (next.alias) toast(t('hub.welcome', { alias: next.alias }), 'success');
  } catch (err) {
    error.textContent = tErr(err);
    error.hidden = false;
    btn.disabled = false;
    progress.textContent = '';
  }
}

function onAccountClick(e) {
  if (!e.target.closest('[data-act="signout"]')) return;
  if (!confirm(t('account.signOutDialog.text'))) return;
  forgetIdentity();
  renderAccount();
  toast(t('hub.signedOut'));
}

// ---- relays ----

function renderRelays() {
  const list = $('#relayList');
  const status = pool.status().relays;
  list.innerHTML = savedRelays()
    .map((url) => {
      const r = status.find((x) => x.url === url);
      const info = infos.get(url);
      const state = r?.open ? (r.latency != null ? t('relay.latency', { n: r.latency }) : t('relay.connected')) : t('relay.notConnected');
      const detail = [info?.countries?.join(', '), info?.name, r?.publishError ? t('relay.rejected', { error: r.publishError, when: '' }).trim() : ''].filter(Boolean).join(' · ');
      return `<li class="${r?.open ? 'up' : 'down'}"><span class="dot"></span><span class="relay-name">${h(url.replace(/^wss?:\/\//, ''))}${detail ? ` <span class="relay-detail">${h(detail)}</span>` : ''}</span><span class="relay-state">${h(state)}</span></li>`;
    })
    .join('');
}
const infos = new Map();

function themeUi() {
  const current = theme();
  for (const input of $$('#themeSeg input')) input.checked = input.value === current;
}

async function boot() {
  applyTheme();
  themeUi();
  $('#themeSeg').addEventListener('change', (e) => {
    if (e.target.name === 'theme') setTheme(e.target.value);
  });
  watchDeviceSettings({
    onTheme: () => {
      applyTheme();
      themeUi();
    },
    onLanguage: async () => {
      const lang = savedLanguage();
      if (lang && lang !== currentLanguage()) await switchLanguage(lang);
    },
  });
  const i18n = initI18n({ dirs: ['shared/locales/', 'locales/'] });
  db = await LocalStore.open('wjs');
  pool = new RelayPool(savedRelays());
  sync = new Sync(pool, db);
  await i18n;
  applyStrings();
  languageUi();
  renderAccount();
  const account = $('#account');
  account.addEventListener('change', onAccountChange);
  account.addEventListener('submit', onAccountSubmit);
  account.addEventListener('click', onAccountClick);
  renderRelays();
  pool.onStatus(renderRelays);
  for (const url of savedRelays()) {
    pool.info(url).then((info) => {
      if (info) {
        infos.set(url, info);
        renderRelays();
      }
    });
  }
}

boot().catch((err) => {
  console.error(err);
  document.documentElement.classList.add('i18n');
});
// Never hide the page for long if the catalogs fail to load.
setTimeout(() => document.documentElement.classList.add('i18n'), 2000);
