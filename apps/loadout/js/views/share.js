import qrcode from '../../vendor/qrcode.mjs';
import { app } from '../app.js';
import { shareLink } from '../links.js';
import { $, icon, modal, copyText } from '../ui.js';
import { h } from '../util.js';
import { t } from '../../../shared/i18n.js';

/** QR code as an SVG path (no inline styles, so it passes the CSP). */
export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  const size = n + 8;
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="${h(t('share.qrAlt'))}"><rect width="${size}" height="${size}" class="qr-bg"/><path d="${d}" class="qr-fg"/></svg>`;
}

export function shareDialog(board) {
  const entry = { pub: board.pub, w: board.w, k: board.k };
  const roles = board.canEdit ? ['edit', 'view'] : ['view'];
  let role = roles[0];
  const explain = { edit: t('share.explainEdit'), view: t('share.explainView') };
  const m = modal({
    title: t('share.title', { title: board.info.title }),
    body: `
      ${
        roles.length > 1
          ? `<div class="seg" role="radiogroup" aria-label="${h(t('share.access'))}">
              <label><input type="radio" name="role" value="edit" checked><span>${icon('pencil')}${h(t('share.canEdit'))}</span></label>
              <label><input type="radio" name="role" value="view"><span>${icon('eye')}${h(t('share.viewOnly'))}</span></label>
            </div>`
          : ''
      }
      <p class="modal-text" id="roleText"></p>
      <div class="copy-field">
        <input id="shareUrl" readonly aria-label="${h(t('share.link'))}" spellcheck="false">
        <button type="button" class="btn btn-primary" data-act="copy">${icon('copy')}<span>${h(t('common.copy'))}</span></button>
      </div>
      <div class="share-row">
        ${navigator.share ? `<button type="button" class="btn" data-act="native">${icon('share-2')}<span>${h(t('share.native'))}</span></button>` : ''}
        <button type="button" class="btn" data-act="qr">${icon('qr-code')}<span>${h(t('share.qr'))}</span></button>
      </div>
      <div class="qr-box" id="qrBox" hidden></div>
      <p class="hint">${icon('key-round')} ${t('share.hint')}</p>`,
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
