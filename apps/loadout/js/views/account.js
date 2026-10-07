/* global SEA */
import { app } from '../app.js';
import { signIn, createAccount, authPair, fingerprint, checkPassword } from '../identity.js';
import { switchIdentity, buildBackup, wipeDevice } from '../session.js';
import { encryptBackup, decryptBackup } from '../backup.js';
import { gun, relays, saveRelays, onStatus, peers } from '../net.js';
import { DEFAULT_RELAYS } from '../config.js';
import { $, icon, toast, modal, confirmDialog, download, copyText } from '../ui.js';
import { h, plural, store } from '../util.js';

export function renderAccount(view) {
  const { pair, alias } = app.identity;
  const theme = app.theme();
  view.innerHTML = `
    <section class="account">
      <div class="page-head">
        <a class="icon-btn back" href="#/" aria-label="Back to your boards">${icon('chevron-left')}</a>
        <h1>Account &amp; settings</h1>
      </div>

      <div class="card">
        <h2>${icon('key-round')}Identity</h2>
        ${
          alias
            ? `<p>Signed in as <b>${h(alias)}</b>. Every device you sign in on sees the same boards.</p>`
            : `<p>You’re using a <b>device account</b>: a key that was created in this browser and only exists here.
               Sign in or create an account to get your boards on your other devices.</p>`
        }
        <p class="muted small">Key fingerprint <code>${h(fingerprint(pair.pub))}</code> <button type="button" class="link-btn" data-act="copy-pub">copy public key</button></p>
        ${
          alias
            ? ''
            : `<div class="seg" role="tablist">
                <label><input type="radio" name="authTab" value="signin" checked><span>Sign in</span></label>
                <label><input type="radio" name="authTab" value="create"><span>Create account</span></label>
              </div>
              <form class="form" id="authForm" autocomplete="on">
                <label class="field">Username<input name="alias" autocomplete="username" required minlength="3" maxlength="40" spellcheck="false" autocapitalize="off"></label>
                <label class="field">Password<input name="pass" type="password" autocomplete="current-password" required></label>
                <label class="field" id="confirmField" hidden>Repeat password<input name="pass2" type="password" autocomplete="new-password"></label>
                <p class="hint" id="authHint">Boards on this device are added to the account.</p>
                <div class="form-actions"><button class="btn btn-primary" id="authBtn">Sign in</button><span class="progress-text" id="authProgress"></span></div>
              </form>`
        }
      </div>

      <div class="card">
        <h2>${icon('download')}Backup</h2>
        <p>One file with your key, your list of boards and their current content, encrypted with a passphrase. Keep it somewhere safe — it can restore everything even if the relays forget your data.</p>
        <div class="form-actions">
          <button type="button" class="btn" data-act="backup">${icon('download')}<span>Download backup</span></button>
          <label class="btn btn-ghost file-btn">${icon('upload')}<span>Restore backup…</span><input type="file" accept=".json,application/json" id="restoreFile" hidden></label>
        </div>
        ${store.get('loadout.lastBackup') ? `<p class="muted small">Last backup from this device: ${h(new Date(store.get('loadout.lastBackup')).toLocaleString())}</p>` : ''}
      </div>

      <div class="card">
        <h2>${icon('cloud')}Relays</h2>
        <p>Relays pass signed and encrypted data between your devices. They can see when you sync and how much, never what (for private boards).</p>
        <ul class="relays" id="relayList"></ul>
        <details class="relay-edit">
          <summary>Edit relays</summary>
          <form class="form" id="relayForm">
            <label class="field">One URL per line<textarea name="relays" rows="5" spellcheck="false">${h(relays().join('\n'))}</textarea></label>
            <div class="form-actions"><button class="btn">Save &amp; reconnect</button><button type="button" class="btn btn-ghost" data-act="relay-reset">Reset to defaults</button></div>
          </form>
        </details>
      </div>

      <div class="card">
        <h2>${icon('sun')}Appearance</h2>
        <div class="seg" id="themeSeg">
          ${['system', 'light', 'dark'].map((t) => `<label><input type="radio" name="theme" value="${t}" ${t === theme ? 'checked' : ''}><span>${t[0].toUpperCase() + t.slice(1)}</span></label>`).join('')}
        </div>
      </div>

      <div class="card card-danger">
        <h2>${icon('log-out')}This device</h2>
        <p>${alias ? 'Signing out removes your key and cached boards from this browser. Sign in again any time.' : 'Wiping removes this device’s key and cached boards. Without an account or a backup, boards only you had links to are lost.'}</p>
        <button type="button" class="btn btn-danger" data-act="wipe">${alias ? 'Sign out' : 'Wipe this device'}</button>
      </div>

      <details class="card how">
        <summary><h2>${icon('shield')}How it works</h2></summary>
        <ul>
          <li>Every board is its own key pair. Its data lives on the <a href="https://gun.eco" target="_blank" rel="noopener">gun</a> network under that key, and every peer — relays included — rejects changes that aren’t signed by someone the board has certified.</li>
          <li><b>Edit links</b> carry the board’s private key: whoever opens one can certify their own key and write. <b>View links</b> only carry the read key, so they can’t.</li>
          <li><b>Private</b> boards encrypt every title, item and note before it leaves your browser. Guessing or crawling a board’s address gets you ciphertext. <b>Public</b> boards are plain text, readable by anyone who has the address.</li>
          <li>The keys sit in the <code>#</code> part of the link, which browsers never send to any server. Opening a link moves them into your wallet and out of the address bar.</li>
          <li>Your list of boards (with their keys) is encrypted to your own key and stored under your gun user, so signed-in devices stay in sync.</li>
          <li>Changes made offline are kept on this device and sent when a relay is reachable again.</li>
          <li>Relays can drop old data. Each device keeps a copy, and backups contain everything — keep one.</li>
        </ul>
      </details>
    </section>`;

  // ---- relays ----
  const offStatus = onStatus(() => drawRelays());
  function drawRelays() {
    const list = $('#relayList', view);
    if (!list) return;
    const all = peers();
    list.innerHTML = relays()
      .map((url) => {
        const open = all.find((x) => x.url === url)?.open;
        return `<li><span class="dot ${open ? 'on' : ''}"></span><span class="relay-url">${h(url.replace(/^https?:\/\//, ''))}</span><span class="muted small">${open ? 'connected' : 'not connected'}</span></li>`;
      })
      .join('');
  }

  // ---- events ----
  view.addEventListener('click', onClick);
  view.addEventListener('change', onChange);
  view.addEventListener('submit', onSubmit);

  async function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'copy-pub') copyText(pair.pub, 'Public key');
    if (act === 'backup') backupDialog();
    if (act === 'relay-reset') {
      saveRelays(DEFAULT_RELAYS);
      location.reload();
    }
    if (act === 'wipe') {
      const ok = await confirmDialog({
        title: alias ? 'Sign out?' : 'Wipe this device?',
        message: alias
          ? 'Your key and cached boards are removed from this browser.'
          : `This deletes the only copy of this device’s key. ${plural(app.wallet.list().length, 'board')} will be gone from this device unless you have a backup or the links.`,
        confirm: alias ? 'Sign out' : 'Wipe',
        danger: true,
      });
      if (ok) wipeDevice();
    }
  }

  function onChange(e) {
    if (e.target.name === 'theme') app.setTheme(e.target.value);
    if (e.target.name === 'authTab') {
      const create = e.target.value === 'create';
      $('#confirmField', view).hidden = !create;
      $('#authForm', view).pass2.required = create;
      $('#authForm', view).pass.autocomplete = create ? 'new-password' : 'current-password';
      $('#authBtn', view).textContent = create ? 'Create account' : 'Sign in';
      $('#authHint', view).textContent = create
        ? 'Your key is stored on the relays, encrypted with this password. Pick a long one — there is no reset.'
        : 'Boards on this device are added to the account.';
    }
    if (e.target.id === 'restoreFile' && e.target.files[0]) restoreDialog(e.target.files[0]);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (e.target.id === 'relayForm') {
      saveRelays(e.target.relays.value.split('\n'));
      location.reload();
      return;
    }
    if (e.target.id !== 'authForm') return;
    const form = e.target;
    const create = view.querySelector('[name=authTab]:checked').value === 'create';
    const btn = $('#authBtn', view);
    const progress = $('#authProgress', view);
    try {
      if (create) {
        checkPassword(form.pass.value);
        if (form.pass.value !== form.pass2.value) throw new Error('The passwords don’t match.');
      }
      btn.disabled = true;
      progress.textContent = create ? 'Creating account…' : 'Signing in…';
      const name = form.alias.value;
      const pass = form.pass.value;
      await switchIdentity(() => (create ? createAccount(name, pass) : signIn(name, pass)), {
        alias: name.trim().toLowerCase(),
        onProgress: (msg) => (progress.textContent = msg),
      });
    } catch (err) {
      btn.disabled = false;
      progress.textContent = '';
      toast(err.message, 'error', 5000);
    }
  }

  function backupDialog() {
    modal({
      title: 'Download backup',
      body: `
        <form class="form">
          <p class="modal-text">Choose a passphrase for the file. Without it the backup can’t be opened — by anyone, including you.</p>
          <label class="field">Passphrase<input name="pass" type="password" autocomplete="new-password" required minlength="10"></label>
          <label class="field">Repeat passphrase<input name="pass2" type="password" autocomplete="new-password" required></label>
          <div class="modal-actions"><span class="progress-text" id="bkProgress"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Download</button></div>
        </form>`,
      onOpen: (el, close) => {
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = e.target;
          if (f.pass.value.length < 10) return toast('Use at least 10 characters.', 'error');
          if (f.pass.value !== f.pass2.value) return toast('The passphrases don’t match.', 'error');
          const btn = f.querySelector('.btn-primary');
          btn.disabled = true;
          const progress = $('#bkProgress', el);
          try {
            const payload = await buildBackup((msg) => (progress.textContent = msg));
            progress.textContent = 'Encrypting…';
            const file = await encryptBackup(payload, f.pass.value);
            const day = new Date().toISOString().slice(0, 10);
            download(`loadout-backup-${app.identity.alias || 'device'}-${day}.json`, JSON.stringify(file), 'application/json');
            store.set('loadout.lastBackup', Date.now());
            close(true);
            toast(`Backup with ${plural(payload.boards.length, 'board')} downloaded`, 'success');
          } catch (err) {
            btn.disabled = false;
            progress.textContent = '';
            toast(err.message, 'error');
          }
        });
      },
    });
  }

  function restoreDialog(fileObj) {
    const m = modal({
      title: 'Restore backup',
      body: `
        <form class="form">
          <p class="modal-text">Restoring switches this device to the key in the backup. Boards already on this device are added to it, and content the relays have lost is put back.</p>
          <label class="field">Passphrase<input name="pass" type="password" autocomplete="off" required></label>
          <div class="modal-actions"><span class="progress-text" id="rsProgress"></span><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Restore</button></div>
        </form>`,
      onOpen: (el) => {
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = e.target.querySelector('.btn-primary');
          const progress = $('#rsProgress', el);
          btn.disabled = true;
          try {
            progress.textContent = 'Decrypting…';
            const payload = await decryptBackup(JSON.parse(await fileObj.text()), e.target.pass.value);
            const p = payload.identity?.pair;
            if (payload.app !== 'loadout' || !p?.pub || !p.priv || !p.epriv || !(await SEA.sign('check', p))) throw new Error('The backup doesn’t contain a usable key.');
            await switchIdentity(
              async () => {
                gun.user().leave();
                return authPair(p);
              },
              { alias: payload.identity.alias || null, boards: payload.boards || [], snapshots: payload.snapshots || {}, onProgress: (msg) => (progress.textContent = msg) },
            );
          } catch (err) {
            btn.disabled = false;
            progress.textContent = '';
            toast(err instanceof SyntaxError ? 'That file isn’t a backup.' : err.message, 'error', 5000);
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
