import { app } from '../app.js';
import { signIn, createAccount, identityFromKey, fingerprint, checkPassword, npub, nsec, exportEncrypted } from '../identity.js';
import { switchIdentity, buildBackup, wipeDevice } from '../session.js';
import { encryptBackup, decryptBackup } from '../backup.js';
import { relays, saveRelays, onStatus, peers, relayInfo, normalizeRelayUrl, outbox, syncNow, db } from '../net.js';
import { DEFAULT_RELAYS } from '../config.js';
import { isHex64 } from '../../../shared/events.js';
import { pubkeyOf } from '../../../shared/account.js';
import { t, tErr, has, fmtDateTime, relTime, LANGUAGES, currentLanguage, setLanguage } from '../../../shared/i18n.js';
import { $, $$, icon, toast, modal, confirmDialog, download, copyText } from '../ui.js';
import { h, store } from '../util.js';
import { STARTER_KEYS, starters } from './home.js';

/** Progress callbacks get catalog keys from shared code and finished text from Loadout code. */
const progressText = (msg) => (has(msg) ? t(msg) : msg);

export function renderAccount(view) {
  const { pk, alias } = app.identity;
  const theme = app.theme();
  view.innerHTML = `
    <section class="account">
      <div class="page-head">
        <a class="icon-btn back" href="#/" aria-label="${h(t('app.backToBoards'))}">${icon('chevron-left')}</a>
        <h1>${t('account.title')}</h1>
      </div>

      <div class="card">
        <h2>${icon('key-round')}${h(t('account.identity'))}</h2>
        ${alias ? `<p>${t('account.signedIn', { alias: h(alias) })}</p>` : `<p>${t('account.deviceKey')}</p>`}
        <p class="muted small">${h(t('account.publicKey'))} <code>${h(fingerprint(pk))}</code>
          <button type="button" class="link-btn" data-act="copy-pub">${h(t('account.copyNpub'))}</button> ·
          <button type="button" class="link-btn" data-act="export-key">${h(t('account.exportKey'))}</button></p>
        ${
          alias
            ? ''
            : `<div class="seg" role="tablist">
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
              </form>`
        }
      </div>

      <div class="card">
        <h2>${icon('download')}${h(t('account.backup'))}</h2>
        <p>${h(t('account.backupText'))}</p>
        <div class="form-actions">
          <button type="button" class="btn" data-act="backup">${icon('download')}<span>${h(t('account.downloadBackup'))}</span></button>
          <label class="btn btn-ghost file-btn">${icon('upload')}<span>${h(t('account.restoreBackup'))}</span><input type="file" accept=".json,application/json" id="restoreFile" hidden></label>
        </div>
        ${store.get('loadout.lastBackup') ? `<p class="muted small">${h(t('account.lastBackup', { when: fmtDateTime(store.get('loadout.lastBackup')) }))}</p>` : ''}
      </div>

      <div class="card">
        <h2>${icon('cloud')}${h(t('account.relays'))}</h2>
        <p>${h(t('account.relaysText'))}</p>
        <ul class="relays" id="relayList"></ul>
        <div class="form-actions">
          <button type="button" class="btn btn-sm" data-act="sync-now">${icon('refresh-cw')}<span>${h(t('account.syncNow'))}</span></button>
          <button type="button" class="btn btn-sm btn-ghost" data-act="diagnostics">${icon('copy')}<span>${h(t('account.diagnostics'))}</span></button>
        </div>
        <details class="relay-edit">
          <summary>${h(t('account.editRelays'))}</summary>
          <form class="form" id="relayForm">
            <label class="field">${h(t('account.oneUrlPerLine'))}<textarea name="relays" rows="5" spellcheck="false">${h(relays().join('\n'))}</textarea></label>
            <div class="form-actions"><button class="btn">${t('account.saveReconnect')}</button><button type="button" class="btn btn-ghost" data-act="relay-reset">${h(t('account.resetRelays'))}</button></div>
          </form>
        </details>
      </div>

      <div class="card">
        <h2>${icon('list-checks')}${h(t('settings.home'))}</h2>
        <label class="check-row"><input type="checkbox" id="showStarters" ${app.settings?.get('showStarters', true) ?? true ? 'checked' : ''}><span>${h(t('settings.showStarters'))}</span></label>
        <details class="templates">
          <summary>${h(t('settings.starters'))}</summary>
          <p class="muted small">${h(t('settings.startersText'))}</p>
          <form class="form" id="startersForm">
            ${starters()
              .map(
                (st) => `
              <fieldset class="starter-edit" data-key="${st.key}">
                <legend>${h(t(`home.starter.${st.key}`))} · ${h(t(`type.${st.kind}`))}</legend>
                <label class="field">${h(t('settings.starterTitle'))}<input name="title-${st.key}" maxlength="120" value="${h(st.title)}"></label>
                <label class="field">${h(t('settings.starterText'))}<textarea name="text-${st.key}" rows="5" spellcheck="false">${h(st.text)}</textarea></label>
                <button type="button" class="link-btn" data-reset="${st.key}">${h(t('settings.reset'))}</button>
              </fieldset>`,
              )
              .join('')}
            <div class="form-actions"><button class="btn btn-primary">${h(t('common.save'))}</button></div>
          </form>
        </details>
      </div>

      <div class="card lang-card">
        <h2>${icon('languages')}${h(t('lang.title'))}</h2>
        <p>${h(t('lang.text'))}</p>
        <select id="langSelect" aria-label="${h(t('lang.title'))}">
          ${Object.entries(LANGUAGES)
            .map(([code, name]) => `<option value="${code}" ${code === currentLanguage() ? 'selected' : ''}>${h(name)}</option>`)
            .join('')}
        </select>
      </div>

      <div class="card">
        <h2>${icon('sun')}${h(t('account.appearance'))}</h2>
        <div class="seg" id="themeSeg">
          ${['system', 'light', 'dark'].map((x) => `<label><input type="radio" name="theme" value="${x}" ${x === theme ? 'checked' : ''}><span>${h(t(`account.theme.${x}`))}</span></label>`).join('')}
        </div>
      </div>

      <div class="card card-danger">
        <h2>${icon('log-out')}${h(t('account.device'))}</h2>
        <p>${h(alias ? t('account.deviceTextSignedIn') : t('account.deviceTextKey'))}</p>
        <button type="button" class="btn btn-danger" data-act="wipe">${h(alias ? t('account.signOut') : t('account.wipe'))}</button>
      </div>

      <details class="card how">
        <summary><h2>${icon('shield')}${h(t('account.how'))}</h2></summary>
        <ul>${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<li>${t(`account.how.${i}`)}</li>`).join('')}</ul>
      </details>
    </section>`;

  // ---- relays ----
  const infos = new Map();
  let waiting = {};
  const offStatus = onStatus(() => drawRelays());
  async function drawRelays() {
    const list = $('#relayList', view);
    if (!list) return;
    waiting = (await outbox()).waiting;
    const all = peers();
    list.innerHTML = relays()
      .map((url) => {
        const r = all.find((x) => x.url === url);
        const info = infos.get(url);
        const detail = [r?.open ? (r.latency != null ? t('relay.latency', { n: r.latency }) : t('relay.connected')) : t('relay.notConnected'), info?.countries?.join(', '), info?.name].filter(Boolean).join(' · ');
        const problems = [waiting[url] ? t('relay.waiting', { n: waiting[url] }) : '', r?.publishError ? t('relay.rejected', { error: r.publishError, when: relTime(r.publishErrorAt) }) : ''].filter(Boolean).join(' · ');
        return `<li><span class="dot ${r?.open ? 'on' : ''}"></span><span class="relay-url">${h(url.replace(/^wss?:\/\//, ''))}</span><span class="muted small">${h(detail)}</span>${problems ? `<span class="relay-problem small">${h(problems)}</span>` : ''}</li>`;
      })
      .join('');
  }

  /** A plain-text summary of what this device knows, for bug reports. */
  async function diagnostics() {
    const all = peers();
    const box = await outbox();
    const mine = await db.byAuthor(pk);
    const kinds = {};
    for (const ev of mine) kinds[ev.kind] = (kinds[ev.kind] || 0) + 1;
    return JSON.stringify(
      {
        app: 'loadout',
        at: new Date().toISOString(),
        lang: currentLanguage(),
        account: Boolean(alias),
        pubkey: pk,
        boards: app.wallet.list().length,
        ownEventsByKind: kinds,
        outbox: box,
        relays: all.map((r) => ({ url: r.url, open: r.open, latency: r.latency, lastOk: r.lastOkAt ? new Date(r.lastOkAt).toISOString() : null, publishError: r.publishError, connectError: r.error || null, info: infos.get(r.url)?.name || null })),
        userAgent: navigator.userAgent,
      },
      null,
      2,
    );
  }
  for (const url of relays()) {
    relayInfo(url).then((info) => {
      if (info) {
        infos.set(url, info);
        drawRelays();
      }
    });
  }

  // ---- events ----
  view.addEventListener('click', onClick);
  view.addEventListener('change', onChange);
  view.addEventListener('submit', onSubmit);

  async function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'copy-pub') copyText(npub(pk), t('account.publicKey'));
    const reset = e.target.closest('[data-reset]')?.dataset.reset;
    if (reset) {
      const form = $('#startersForm', view);
      form.elements[`title-${reset}`].value = t(`home.starter.${reset}`);
      form.elements[`text-${reset}`].value = t(`home.template.${reset}`);
    }
    if (act === 'export-key') exportDialog();
    if (act === 'backup') backupDialog();
    if (act === 'sync-now') {
      const btn = e.target.closest('[data-act]');
      btn.disabled = true;
      try {
        await syncNow();
        toast(t('account.synced'), 'success');
      } catch (err) {
        toast(tErr(err), 'error');
      } finally {
        btn.disabled = false;
        drawRelays();
      }
    }
    if (act === 'diagnostics') copyText(await diagnostics(), t('account.diagnostics'));
    if (act === 'relay-reset') {
      saveRelays(DEFAULT_RELAYS);
      location.reload();
    }
    if (act === 'wipe') {
      const ok = await confirmDialog({
        title: alias ? t('account.signOutDialog.title') : t('account.wipeDialog.title'),
        message: alias ? t('account.signOutDialog.text') : t('account.wipeDialog.text', { n: app.wallet.list().length }),
        confirm: alias ? t('account.signOut') : t('account.wipeDialog.action'),
        danger: true,
      });
      if (ok) wipeDevice();
    }
  }

  async function onChange(e) {
    if (e.target.name === 'theme') app.setTheme(e.target.value);
    if (e.target.id === 'showStarters') app.settings?.set({ showStarters: e.target.checked }).catch((err) => toast(tErr(err), 'error'));
    if (e.target.id === 'langSelect') {
      await setLanguage(e.target.value);
      app.rerender();
      return;
    }
    if (e.target.name === 'authTab') {
      const mode = e.target.value;
      const form = $('#authForm', view);
      $('#aliasField', view).hidden = mode === 'import';
      form.alias.required = mode !== 'import';
      $('#keyField', view).hidden = mode !== 'import';
      form.key.required = mode === 'import';
      form.pass.required = mode !== 'import';
      $('#confirmField', view).hidden = mode !== 'create';
      form.pass2.required = mode === 'create';
      form.pass.autocomplete = mode === 'create' ? 'new-password' : 'current-password';
      $('#passLabel', view).textContent = mode === 'import' ? t('account.passwordForKey') : t('account.password');
      $('#authBtn', view).textContent = { signin: t('account.tab.signIn'), create: t('account.tab.create'), import: t('account.button.import') }[mode];
      $('#authHint', view).textContent = { signin: t('account.hint.signIn'), create: t('account.hint.create'), import: t('account.hint.import') }[mode];
    }
    if (e.target.id === 'restoreFile' && e.target.files[0]) restoreDialog(e.target.files[0]);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (e.target.id === 'relayForm') {
      const list = e.target.relays.value.split('\n').filter((l) => l.trim());
      if (list.some((l) => !normalizeRelayUrl(l))) return toast(t('account.invalidRelay'), 'error');
      saveRelays(list);
      location.reload();
      return;
    }
    if (e.target.id === 'startersForm') {
      const form = e.target;
      const custom = {};
      for (const { key } of STARTER_KEYS) {
        const title = form.elements[`title-${key}`].value.trim();
        const text = form.elements[`text-${key}`].value;
        const o = {};
        if (title && title !== t(`home.starter.${key}`)) o.title = title.slice(0, 120);
        if (text !== t(`home.template.${key}`)) o.text = text.slice(0, 20_000);
        if (Object.keys(o).length) custom[key] = o;
      }
      try {
        await app.settings.set({ starters: custom });
        toast(t('settings.saved'), 'success');
      } catch (err) {
        toast(tErr(err), 'error');
      }
      return;
    }
    if (e.target.id !== 'authForm') return;
    const form = e.target;
    const mode = view.querySelector('[name=authTab]:checked').value;
    const btn = $('#authBtn', view);
    const progress = $('#authProgress', view);
    const onProgress = (msg) => (progress.textContent = progressText(msg));
    try {
      const pass = form.pass.value;
      let getIdentity;
      if (mode === 'create') {
        checkPassword(pass);
        if (pass !== form.pass2.value) throw new Error(t('account.passwordsMismatch'));
        getIdentity = () => createAccount(app.identity, form.alias.value, pass, onProgress);
      } else if (mode === 'signin') {
        getIdentity = () => signIn(form.alias.value, pass, onProgress);
      } else {
        const next = identityFromKey(form.key.value, pass); // throws on a bad key
        getIdentity = async () => next;
      }
      btn.disabled = true;
      progress.textContent = { create: t('account.progress.create'), signin: t('account.progress.signIn'), import: t('account.progress.import') }[mode];
      await switchIdentity(getIdentity, { onProgress });
    } catch (err) {
      btn.disabled = false;
      progress.textContent = '';
      toast(tErr(err), 'error', 6000);
    }
  }

  function exportDialog() {
    modal({
      title: t('account.export.title'),
      body: `
        <p class="modal-text">${t('account.export.text')}</p>
        <div class="copy-field"><input id="nsecOut" readonly type="password" value="${h(nsec(app.identity.sk))}" aria-label="${h(t('account.export.secretKey'))}"><button type="button" class="btn" data-act="reveal">${h(t('common.show'))}</button><button type="button" class="btn btn-primary" data-act="copy">${h(t('common.copy'))}</button></div>
        <form class="form" id="ncryptForm">
          <label class="field">${h(t('account.export.downloadLabel'))}<input name="pass" type="password" autocomplete="new-password" minlength="10" placeholder="${h(t('account.export.placeholder'))}"></label>
          <div class="modal-actions"><button type="button" class="btn" data-close>${h(t('common.close'))}</button><button class="btn">${h(t('account.export.download'))}</button></div>
        </form>`,
      onOpen: (el) => {
        const out = $('#nsecOut', el);
        el.addEventListener('click', (e) => {
          const act = e.target.closest('[data-act]')?.dataset.act;
          if (act === 'reveal') {
            out.type = out.type === 'password' ? 'text' : 'password';
            e.target.textContent = out.type === 'password' ? t('common.show') : t('common.hide');
          }
          if (act === 'copy') copyText(out.value, t('account.export.secretKey'));
        });
        $('#ncryptForm', el).addEventListener('submit', (e) => {
          e.preventDefault();
          const pass = e.target.pass.value;
          if (pass.length < 10) return toast(t('account.export.min10'), 'error');
          download(`loadout-key-${app.identity.alias || 'device'}.txt`, `${exportEncrypted(app.identity.sk, pass)}\n`, 'text/plain');
        });
      },
    });
  }

  function backupDialog() {
    modal({
      title: t('account.backupDialog.title'),
      body: `
        <form class="form">
          <p class="modal-text">${h(t('account.backupDialog.text'))}</p>
          <label class="field">${h(t('account.backupDialog.passphrase'))}<input name="pass" type="password" autocomplete="new-password" required minlength="10"></label>
          <label class="field">${h(t('account.backupDialog.repeat'))}<input name="pass2" type="password" autocomplete="new-password" required></label>
          <div class="modal-actions"><span class="progress-text" id="bkProgress"></span><button type="button" class="btn" data-close>${h(t('common.cancel'))}</button><button class="btn btn-primary">${h(t('account.backupDialog.download'))}</button></div>
        </form>`,
      onOpen: (el, close) => {
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = e.target;
          if (f.pass.value.length < 10) return toast(t('account.export.min10'), 'error');
          if (f.pass.value !== f.pass2.value) return toast(t('account.backupDialog.mismatch'), 'error');
          const btn = f.querySelector('.btn-primary');
          btn.disabled = true;
          const progress = $('#bkProgress', el);
          try {
            const payload = await buildBackup((msg) => (progress.textContent = progressText(msg)));
            progress.textContent = t('account.backupDialog.encrypting');
            const file = await encryptBackup(payload, f.pass.value);
            const day = new Date().toISOString().slice(0, 10);
            download(`loadout-backup-${app.identity.alias || 'device'}-${day}.json`, JSON.stringify(file), 'application/json');
            store.set('loadout.lastBackup', Date.now());
            close(true);
            toast(t('account.backupDialog.done', { n: payload.boards.length }), 'success');
          } catch (err) {
            btn.disabled = false;
            progress.textContent = '';
            toast(tErr(err), 'error');
          }
        });
      },
    });
  }

  function restoreDialog(fileObj) {
    const m = modal({
      title: t('account.restoreDialog.title'),
      body: `
        <form class="form">
          <p class="modal-text">${h(t('account.restoreDialog.text'))}</p>
          <label class="field">${h(t('account.backupDialog.passphrase'))}<input name="pass" type="password" autocomplete="off" required></label>
          <div class="modal-actions"><span class="progress-text" id="rsProgress"></span><button type="button" class="btn" data-close>${h(t('common.cancel'))}</button><button class="btn btn-primary">${h(t('account.restoreDialog.restore'))}</button></div>
        </form>`,
      onOpen: (el) => {
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = e.target.querySelector('.btn-primary');
          const progress = $('#rsProgress', el);
          btn.disabled = true;
          try {
            progress.textContent = t('account.restoreDialog.decrypting');
            const payload = await decryptBackup(JSON.parse(await fileObj.text()), e.target.pass.value);
            const id = payload.identity;
            if (payload.app !== 'loadout' || !isHex64(id?.sk) || pubkeyOf(id.sk) !== id.pk) throw new Error(t('account.restoreDialog.noKey'));
            await switchIdentity(async () => ({ sk: id.sk, pk: id.pk, alias: id.alias || null, accountPk: id.accountPk || null, created: Date.now() }), {
              boards: payload.boards || [],
              events: payload.events || [],
              snapshots: payload.snapshots || {},
              onProgress: (msg) => (progress.textContent = progressText(msg)),
            });
          } catch (err) {
            btn.disabled = false;
            progress.textContent = '';
            toast(err instanceof SyntaxError ? t('account.restoreDialog.notJson') : tErr(err), 'error', 5000);
          }
        });
      },
    });
    m.done.then(() => {
      const input = $('#restoreFile', view);
      if (input) input.value = '';
    });
  }

  return () => {
    offStatus();
    view.removeEventListener('click', onClick);
    view.removeEventListener('change', onChange);
    view.removeEventListener('submit', onSubmit);
  };
}
