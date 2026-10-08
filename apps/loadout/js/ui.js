// DOM helpers: icons, toasts, dialogs and menus. Templates escape every
// interpolated value with h() unless it is trusted markup (icons, sanitized HTML).

import { h } from './util.js';

export { $, $$, h, icon, toast, copyText, modal, confirmDialog, download } from '../../shared/ui.js';
import { $$, icon } from '../../shared/ui.js';

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

export function safeFilename(name, ext) {
  const base = String(name || 'loadout').replace(/[^\p{L}\p{N} _.-]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'loadout';
  return `${base}.${ext}`;
}
