// DOM helpers: icons, toasts, dialogs and menus. Templates escape every
// interpolated value with h() unless it is trusted markup (icons, sanitized HTML).

import { h } from './util.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="icons.svg#${name}"></use></svg>`;

export function toast(message, kind = 'info', ms = 3200) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = message;
  box.append(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  }, ms);
}

export async function copyText(text, what = 'Link') {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`, 'success');
    return true;
  } catch {
    toast('Copy failed — select the text and copy it yourself', 'error');
    return false;
  }
}

/**
 * Show a modal. `body` is trusted markup; returns { el, close, done } where
 * `done` resolves with the value passed to close().
 */
export function modal({ title, body, wide = false, onOpen }) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal${wide ? ' modal-wide' : ''}`;
  dlg.innerHTML = `
    <div class="modal-head">
      <h2>${h(title)}</h2>
      <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
    </div>
    <div class="modal-body">${body}</div>`;
  document.body.append(dlg);
  let resolve;
  const done = new Promise((r) => (resolve = r));
  const close = (value) => {
    if (!dlg.open) return;
    dlg.close();
    dlg.remove();
    resolve(value);
  };
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) close(undefined);
  });
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close(undefined);
  });
  dlg.showModal();
  onOpen?.(dlg, close);
  const first = dlg.querySelector('[autofocus], input:not([type=hidden]), textarea, select');
  first?.focus();
  return { el: dlg, close, done };
}

export function confirmDialog({ title, message, confirm = 'OK', danger = false }) {
  const m = modal({
    title,
    body: `<p class="modal-text">${h(message)}</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${h(confirm)}</button>
      </div>`,
    onOpen: (el, close) => {
      el.querySelector('[data-ok]').addEventListener('click', () => close(true));
      el.querySelector('[data-ok]').focus();
    },
  });
  return m.done.then(Boolean);
}

/**
 * Dropdown menu anchored to a button.
 * @param {HTMLElement} anchor
 * @param {{label: string, icon?: string, danger?: boolean, run: () => void}[]} items
 */
export function openMenu(anchor, items) {
  closeMenus();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items
    .map((it, i) => (it === '-' ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon) : ''}<span>${h(it.label)}</span></button>`))
    .join('');
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  menu.style.top = `${r.bottom + window.scrollY + 6}px`;
  menu.style.left = `${Math.max(8, Math.min(r.right + window.scrollX - width, window.scrollX + document.documentElement.clientWidth - width - 8))}px`;
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    closeMenus();
    items[Number(b.dataset.i)].run();
  });
  menu.querySelector('button')?.focus();
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
  });
  function outside(e) {
    if (!menu.contains(e.target)) closeMenus();
  }
  function escape(e) {
    if (e.key === 'Escape') closeMenus();
  }
  menu._cleanup = () => {
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape, true);
  };
}

export function closeMenus() {
  for (const m of $$('.menu')) {
    m._cleanup?.();
    m.remove();
  }
}

export function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFilename(name, ext) {
  const base = String(name || 'loadout').replace(/[^\p{L}\p{N} _.-]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'loadout';
  return `${base}.${ext}`;
}
