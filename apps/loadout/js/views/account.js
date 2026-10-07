import { app } from '../app.js';
import { signIn, createAccount, identityFromKey, fingerprint, checkPassword, npub, nsec, exportEncrypted } from '../identity.js';
import { switchIdentity, buildBackup, wipeDevice, isLegacyBackup, importLegacyBackup } from '../session.js';
import { encryptBackup, decryptBackup } from '../backup.js';
import { relays, saveRelays, onStatus, peers, relayInfo, normalizeRelayUrl } from '../net.js';
import { DEFAULT_RELAYS } from '../config.js';
import { isHex64 } from '../../../shared/events.js';
import { pubkeyOf } from '../../../shared/account.js';
import { $, icon, toast, modal, confirmDialog, download, copyText } from '../ui.js';
import { h, plural, store } from '../util.js';

export function renderAccount(view) {
  const { pk, alias } = app.identity;
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
            : `<p>You’re using a <b>device key</b>: it was created in this browser and only exists here.
               Create an account to use the same key on your other devices, or sign in to one you already have.</p>`
        }
        <p class="muted small">Public key <code>${h(fingerprint(pk))}</code>
          <button type="button" class="link-btn" data-act="copy-pub">copy npub</button> ·
          <button type="button" class="link-btn" data-act="export-key">export secret key</button></p>
        ${
          alias
            ? ''
            : `<div class="seg" role="tablist">
                <label><input type="radio" name="authTab" value="signin" checked><span>Sign in</span></label>
                <label><input type="radio" name="authTab" value="create"><span>Create account</span></label>
                <label><input type="radio" name="authTab" value="import"><span>Use a key</span></label>
              </div>
              <form class="form" id="authForm" autocomplete="on">
                <label class="field" id="aliasField">Username<input name="alias" autocomplete="username" required minlength="3" maxlength="40" spellcheck="false" autocapitalize="off"></label>
                <label class="field" id="keyField" hidden>Secret key <small>(nsec, ncryptsec or hex)</small><textarea name="key" rows="2" spellcheck="false" autocapitalize="off" placeholder="nsec1…"></textarea></label>
                <label class="field" id="passField">Password<input name="pass" type="password" autocomplete="current-password" required></label>
                <label class="field" id="confirmField" hidden>Repeat password<input name="pass2" type="password" autocomplete="new-password"></label>
                <p class="hint" id="authHint">Boards on this device are added to the account.</p>
                <div class="form-actions"><button class="btn btn-primary" id="authBtn">Sign in</button><span class="progress-text" id="authProgress"></span></div>
              </form>`
        }
      </div>

      <div class="card">
        <h2>${icon('download')}Backup</h2>
        <p>One file with your key, your boards and everything in them, encrypted with a passphrase. Keep it somewhere safe — it restores everything even if every relay forgot you.</p>
        <div class="form-actions">
          <button type="button" class="btn" data-act="backup">${icon('download')}<span>Download backup</span></button>
          <label class="btn btn-ghost file-btn">${icon('upload')}<span>Restore backup…</span><input type="file" accept=".json,application/json" id="restoreFile" hidden></label>
        </div>
        ${store.get('loadout.lastBackup') ? `<p class="muted small">Last backup from this device: ${h(new Date(store.get('loadout.lastBackup')).toLocaleString())}</p>` : ''}
      </div>

      <div class="card">
        <h2>${icon('cloud')}Relays</h2>
        <p>Relays pass signed, encrypted events between your devices. They can see when you sync and how much, never what. Pick ones you trust, near you, under laws you like.</p>
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
        <p>${alias ? 'Signing out removes your key and cached boards from this browser. Sign in again any time.' : 'Wiping removes this device’s key and cached boards. Without an account, an exported key or a backup, boards only you had links to are lost.'}</p>
        <button type="button" class="btn btn-danger" data-act="wipe">${alias ? 'Sign out' : 'Wipe this device'}</button>
      </div>

      <details class="card how">
        <summary><h2>${icon('shield')}How it works</h2></summary>
        <ul>
          <li>Loadout runs on <a href="https://nostr.com" target="_blank" rel="noopener">nostr</a>: signed events on relays anyone can run. Every board is its own key pair; whoever holds the edit link signs changes as the board, and relays reject anything else for that board.</li>
          <li><b>Edit links</b> carry the board’s secret key, <b>view links</b> only the read key. Every title, item and note is encrypted before it leaves your browser; guessing a board’s address gets you ciphertext. A link is a key: whoever has it can pass it on, and links can’t be taken back.</li>
          <li>The keys sit in the <code>#</code> part of the link, which browsers never send to any server. Opening a link moves them into your wallet and out of the address bar.</li>
          <li>Your list of boards, with their keys, is encrypted to your own key and published under it, so signed-in devices stay in sync.</li>
          <li>An <b>account</b> is your key, encrypted with your password and published under an address only your username <i>and</i> password can produce. Nobody can find, spam or overwrite it, and a wrong password simply finds nothing. The key itself works in other nostr apps too.</li>
          <li>Changes made offline are kept on this device and sent when a relay is reachable again.</li>
          <li>Relays can drop old data. Each device keeps every event it has seen and sends its copy back whenever a relay reconnects; relays keep the newest version of each item, so nothing old overwrites anything new.</li>
          <li>Backups hold your key and every signed event, so a backup restores everything — even your account — when no relay and no other device has it any more.</li>
        </ul>
      </details>
    </section>`;

  // ---- relays ----
  const infos = new Map();
  const offStatus = onStatus(() => drawRelays());
  function drawRelays() {
    const list = $('#relayList', view);
    if (!list) return;
    const all = peers();
    list.innerHTML = relays()
      .map((url) => {
        const r = all.find((x) => x.url === url);
        const info = infos.get(url);
        const detail = [r?.open ? (r.latency != null ? `${r.latency} ms` : 'connected') : 'not connected', info?.countries?.join(', '), info?.name].filter(Boolean).join(' · ');
        return `<li><span class="dot ${r?.open ? 'on' : ''}"></span><span class="relay-url">${h(url.replace(/^wss?:\/\//, ''))}</span><span class="muted small">${h(detail)}</span></li>`;
      })
      .join('');
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
    if (act === 'copy-pub') copyText(npub(pk), 'Public key');
    if (act === 'export-key') exportDialog();
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
          : `This deletes the only copy of this device’s key. ${plural(app.wallet.list().length, 'board')} will be gone from this device unless you have a backup, the key or the links.`,
        confirm: alias ? 'Sign out' : 'Wipe',
        danger: true,
      });
      if (ok) wipeDevice();
    }
  }

  function onChange(e) {
    if (e.target.name === 'theme') app.setTheme(e.target.value);
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
      $('#passField', view).firstChild.textContent = mode === 'import' ? 'Password (only for ncryptsec keys)' : 'Password';
      $('#authBtn', view).textContent = { signin: 'Sign in', create: 'Create account', import: 'Use this key' }[mode];
      $('#authHint', view).textContent = {
        signin: 'Boards on this device are added to the account.',
        create: 'Your key is encrypted with this password and published to your relays. Pick a long one — there is no reset.',
        import: 'Switches this device to the key you paste. Boards on this device come along.',
      }[mode];
    }
    if (e.target.id === 'restoreFile' && e.target.files[0]) restoreDialog(e.target.files[0]);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (e.target.id === 'relayForm') {
      const list = e.target.relays.value.split('\n').filter((l) => l.trim());
      if (list.some((l) => !normalizeRelayUrl(l))) return toast('Relay URLs start with wss:// (or ws:// for localhost).', 'error');
      saveRelays(list);
      location.reload();
      return;
    }
    if (e.target.id !== 'authForm') return;
    const form = e.target;
    const mode = view.querySelector('[name=authTab]:checked').value;
    const btn = $('#authBtn', view);
    const progress = $('#authProgress', view);
    const onProgress = (msg) => (progress.textContent = msg);
    try {
      const pass = form.pass.value;
      let getIdentity;
      if (mode === 'create') {
        checkPassword(pass);
        if (pass !== form.pass2.value) throw new Error('The passwords don’t match.');
        getIdentity = () => createAccount(app.identity, form.alias.value, pass, onProgress);
      } else if (mode === 'signin') {
        getIdentity = () => signIn(form.alias.value, pass, onProgress);
      } else {
        const next = identityFromKey(form.key.value, pass); // throws on a bad key
        getIdentity = async () => next;
      }
      btn.disabled = true;
      progress.textContent = { create: 'Creating account…', signin: 'Signing in…', import: 'Switching key…' }[mode];
      await switchIdentity(getIdentity, { onProgress });
    } catch (err) {
      btn.disabled = false;
      progress.textContent = '';
      toast(err.message, 'error', 6000);
    }
  }

  function exportDialog() {
    modal({
      title: 'Your secret key',
      body: `
        <p class="modal-text">Anyone with this key <b>is</b> you: they can read and change all your boards. Paste it into another nostr app, or keep an encrypted copy.</p>
        <div class="copy-field"><input id="nsecOut" readonly type="password" value="${h(nsec(app.identity.sk))}" aria-label="Secret key"><button type="button" class="btn" data-act="reveal">Show</button><button type="button" class="btn btn-primary" data-act="copy">Copy</button></div>
        <form class="form" id="ncryptForm">
          <label class="field">Or download it encrypted with a password<input name="pass" type="password" autocomplete="new-password" minlength="10" placeholder="at least 10 characters"></label>
          <div class="modal-actions"><button type="button" class="btn" data-close>Close</button><button class="btn">Download ncryptsec</button></div>
        </form>`,
      onOpen: (el) => {
        const out = $('#nsecOut', el);
        el.addEventListener('click', (e) => {
          const act = e.target.closest('[data-act]')?.dataset.act;
          if (act === 'reveal') {
            out.type = out.type === 'password' ? 'text' : 'password';
            e.target.textContent = out.type === 'password' ? 'Show' : 'Hide';
          }
          if (act === 'copy') copyText(out.value, 'Secret key');
        });
        $('#ncryptForm', el).addEventListener('submit', (e) => {
          e.preventDefault();
          const pass = e.target.pass.value;
          if (pass.length < 10) return toast('Use at least 10 characters.', 'error');
          download(`loadout-key-${app.identity.alias || 'device'}.txt`, `${exportEncrypted(app.identity.sk, pass)}\n`, 'text/plain');
        });
      },
    });
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
          <p class="modal-text">Restoring switches this device to the key in the backup. Boards already on this device are added to it, and everything the relays have lost is put back. A backup from Loadout before nostr is imported as new boards instead.</p>
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
            if (isLegacyBackup(payload)) {
              // Made by Loadout before nostr: the boards come over with new keys, this device's key stays.
              const n = await importLegacyBackup(payload, (msg) => (progress.textContent = msg));
              m.close();
              toast(n ? `Imported ${n} board${n === 1 ? '' : 's'} from your old backup — share the new links with the people who had the old ones.` : 'That backup holds no boards to import.', n ? 'success' : 'error', 8000);
              if (n) location.hash = '#/';
              return;
            }
            const id = payload.identity;
            if (payload.app !== 'loadout' || !isHex64(id?.sk) || pubkeyOf(id.sk) !== id.pk) throw new Error('The backup doesn’t contain a usable key.');
            await switchIdentity(async () => ({ sk: id.sk, pk: id.pk, alias: id.alias || null, accountPk: id.accountPk || null, created: Date.now() }), {
              boards: payload.boards || [],
              events: payload.events || [],
              snapshots: payload.snapshots || {},
              onProgress: (msg) => (progress.textContent = msg),
            });
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
