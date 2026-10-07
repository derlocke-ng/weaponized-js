import qrcode from '../../vendor/qrcode.mjs';
import { app } from '../app.js';
import { shareLink } from '../links.js';
import { $, icon, modal, copyText } from '../ui.js';

/** QR code as an SVG path (no inline styles, so it passes the CSP). */
export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  const size = n + 8;
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code of the link"><rect width="${size}" height="${size}" class="qr-bg"/><path d="${d}" class="qr-fg"/></svg>`;
}

export function shareDialog(board) {
  const entry = { pub: board.pub, w: board.w, k: board.k, enc: board.enc };
  const roles = board.canEdit ? ['edit', 'view'] : ['view'];
  let role = roles[0];
  const explain = {
    edit: 'Anyone with this link can <b>read and change</b> the board and share it on.',
    view: board.enc ? 'Anyone with this link can <b>read</b> the board, but not change it.' : 'This is a public board: anyone with this link or its address can <b>read</b> it.',
  };
  const m = modal({
    title: `Share “${board.info.title}”`,
    body: `
      ${
        roles.length > 1
          ? `<div class="seg" role="radiogroup" aria-label="Access">
              <label><input type="radio" name="role" value="edit" checked><span>${icon('pencil')}Can edit</span></label>
              <label><input type="radio" name="role" value="view"><span>${icon('eye')}View only</span></label>
            </div>`
          : ''
      }
      <p class="modal-text" id="roleText"></p>
      <div class="copy-field">
        <input id="shareUrl" readonly aria-label="Share link" spellcheck="false">
        <button type="button" class="btn btn-primary" data-act="copy">${icon('copy')}<span>Copy</span></button>
      </div>
      <div class="share-row">
        ${navigator.share ? `<button type="button" class="btn" data-act="native">${icon('share-2')}<span>Share…</span></button>` : ''}
        <button type="button" class="btn" data-act="qr">${icon('qr-code')}<span>QR code</span></button>
      </div>
      <div class="qr-box" id="qrBox" hidden></div>
      <p class="hint">${icon('key-round')} The key is in the part after <code>#</code>, which never leaves the browser.
        Links can’t be revoked — to lock people out, use <b>Duplicate</b> and delete the old board.</p>`,
    onOpen: (el) => {
      const url = $('#shareUrl', el);
      const qrBox = $('#qrBox', el);
      const update = () => {
        url.value = shareLink(app.base(), entry, role);
        $('#roleText', el).innerHTML = explain[role];
        if (!qrBox.hidden) qrBox.innerHTML = qrSvg(url.value);
      };
      update();
      el.addEventListener('change', (e) => {
        if (e.target.name !== 'role') return;
        role = e.target.value;
        update();
      });
      url.addEventListener('focus', () => url.select());
      el.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'copy') copyText(url.value);
        if (act === 'native') navigator.share({ title: board.info.title, text: board.info.title, url: url.value }).catch(() => {});
        if (act === 'qr') {
          qrBox.hidden = !qrBox.hidden;
          if (!qrBox.hidden) qrBox.innerHTML = qrSvg(url.value);
        }
      });
    },
  });
  return m.done;
}

