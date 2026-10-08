import { app } from '../app.js';
import { Board, createBoard } from '../boards.js';
import { parseBoardInput, boardHash } from '../links.js';
import { parseItemText, splitLines, endOrders } from '../items.js';
import { icon, modal, toast } from '../ui.js';
import { h, store } from '../util.js';
import { LIMITS } from '../config.js';
import { t, tErr, relTime } from '../../../shared/i18n.js';

export const TYPES = {
  check: { icon: 'list-checks' },
  count: { icon: 'package' },
  note: { icon: 'notebook-pen' },
};
export const kindOf = (b) => (b.type === 'note' ? 'note' : b.mode === 'count' ? 'count' : 'check');

export const STARTER_KEYS = [
  { kind: 'check', key: 'groceries' },
  { kind: 'check', key: 'todo' },
  { kind: 'count', key: 'pantry' },
  { kind: 'note', key: 'notes' },
];

/** The starters with their titles and template content: defaults from the catalog, overridden by the user's settings. */
export function starters() {
  const custom = app.settings?.get('starters', {}) || {};
  return STARTER_KEYS.map((s) => {
    const o = custom[s.key] || {};
    return { ...s, title: o.title ?? t(`home.starter.${s.key}`), text: o.text ?? t(`home.template.${s.key}`), hint: t(`home.starter.${s.key}Text`) };
  });
}

/** Fill a fresh board with a starter's template. */
export async function fillBoard(entry, kind, text) {
  if (!text?.trim()) return;
  const board = new Board(entry);
  if (kind === 'note') return board.setDoc(text);
  const mode = kind === 'count' ? 'count' : 'check';
  const parsed = splitLines(text)
    .map((l) => parseItemText(l, mode))
    .filter((p) => p.t);
  const orders = endOrders([], parsed.length);
  await Promise.all(parsed.map((p, i) => board.addItem({ ...p, o: orders[i] })));
}

export function renderHome(view) {
  const draw = () => {
    const boards = app.wallet.list();
    view.innerHTML = `
      <section class="home">
        <div class="home-head">
          <h1>${t('home.title')}</h1>
          <div class="home-actions">
            <button type="button" class="btn btn-primary" data-new="check">${icon('plus')}<span>${t('home.newList')}</span></button>
            <button type="button" class="btn" data-new="note">${icon('notebook-pen')}<span>${t('home.newNote')}</span></button>
            <button type="button" class="btn btn-ghost" data-open-link>${icon('link')}<span>${t('home.openLink')}</span></button>
          </div>
        </div>
        ${nudge(boards)}
        ${boards.length ? startersRow() : ''}
        ${boards.length ? `<ul class="boards">${boards.map(card).join('')}</ul>` : empty()}
      </section>`;
  };
  draw();
  const off = app.wallet.onChange(draw);
  const offSettings = app.settings?.onChange(draw);

  view.addEventListener('click', onClick);
  async function onClick(e) {
    const nb = e.target.closest('[data-new]');
    if (nb) {
      const starter = nb.dataset.starter ? starters().find((s) => s.key === nb.dataset.starter) : null;
      return newBoardDialog({ kind: nb.dataset.new, title: starter?.title || '', text: starter?.text || '' });
    }
    if (e.target.closest('[data-open-link]')) return openLinkDialog();
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'hide-starters') app.settings?.set({ showStarters: false });
    if (act === 'show-starters') app.settings?.set({ showStarters: true });
  }
  return () => {
    off();
    offSettings?.();
    view.removeEventListener('click', onClick);
  };
}

function starterButtons(cls = '') {
  return `<div class="starters ${cls}">
      ${starters()
        .map(
          (s) => `
          <button type="button" class="starter" data-new="${s.kind}" data-starter="${s.key}">
            <span class="board-icon kind-${s.kind}">${icon(TYPES[s.kind].icon)}</span>
            <strong>${h(s.title)}</strong>
            <small>${h(s.hint)}</small>
          </button>`,
        )
        .join('')}
    </div>`;
}

/** Starters above the board list: there when wanted, one tap to hide, one tap to bring back. */
function startersRow() {
  if (!(app.settings?.get('showStarters', true) ?? true)) {
    return `<p class="starters-toggle"><button type="button" class="link-btn" data-act="show-starters">${icon('plus')}${h(t('home.starters.show'))}</button></p>`;
  }
  return `
    <section class="starters-row" aria-label="${h(t('home.starters.title'))}">
      <div class="starters-head">
        <h2>${h(t('home.starters.title'))}</h2>
        <a class="muted small" href="#/account">${h(t('home.starters.custom'))}</a>
        <button type="button" class="icon-btn" data-act="hide-starters" aria-label="${h(t('home.starters.hide'))}" title="${h(t('home.starters.hide'))}">${icon('x')}</button>
      </div>
      ${starterButtons('compact')}
    </section>`;
}

function card(b) {
  const local = app.wallet.localOf(b.pub);
  const kind = kindOf(b);
  const progress = kind === 'check' && local.total ? t('home.progress', { done: local.done || 0, total: local.total }) : kind === 'count' && local.total ? t('home.items', { n: local.total }) : '';
  const when = local.opened ? t('home.opened', { when: relTime(local.opened) }) : t('home.added', { when: relTime(b.added) });
  return `
    <li>
      <a class="board-card" href="${h(boardHash({ pub: b.pub }))}">
        <span class="board-icon kind-${kind}">${icon(TYPES[kind].icon)}</span>
        <span class="board-main">
          <span class="board-title">${h(b.title || t('common.untitled'))}</span>
          <span class="board-meta">${[progress, when].filter(Boolean).map(h).join(' · ')}</span>
        </span>
        <span class="board-badges">
          ${b.pinned ? `<span class="chip" title="${t('home.pinned')}">${icon('pin')}</span>` : ''}
          ${b.w ? '' : `<span class="chip" title="${t('home.viewOnly')}">${icon('eye')}</span>`}
        </span>
      </a>
    </li>`;
}

function empty() {
  return `
    <div class="empty-home">
      <p class="lead">${t('home.emptyLead')}</p>
      ${starterButtons()}
      <p class="hint">${t('home.emptyHint')}</p>
    </div>`;
}

function nudge(boards) {
  if (app.identity.alias || !boards.length || store.get('loadout.lastBackup')) return '';
  return `
    <div class="banner">
      ${icon('shield')}
      <p>${t('home.nudge')}</p>
    </div>`;
}

export function newBoardDialog({ kind = 'check', title = '', text = '' } = {}) {
  const m = modal({
    title: t('home.new.title'),
    body: `
      <form class="form" id="newBoard">
        <div class="seg" role="radiogroup" aria-label="${t('home.new.type')}">
          ${Object.entries(TYPES)
            .map(([k, v]) => `<label><input type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''}><span>${icon(v.icon)}${h(t(`type.${k}`))}</span></label>`)
            .join('')}
        </div>
        <label class="field">${t('home.new.titleLabel')}<input name="title" maxlength="${LIMITS.title}" required value="${h(title)}" placeholder="${h(t('home.new.placeholder'))}" autofocus></label>
        <p class="hint">${icon('lock')} ${t('home.new.hint')}</p>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>${t('common.cancel')}</button>
          <button type="submit" class="btn btn-primary">${t('common.create')}</button>
        </div>
      </form>`,
    onOpen: (el, close) => {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const k = data.get('kind');
        const btn = form.querySelector('[type=submit]');
        btn.disabled = true;
        try {
          const entry = await createBoard({
            type: k === 'note' ? 'note' : 'list',
            mode: k === 'count' ? 'count' : 'check',
            title: String(data.get('title')).trim().slice(0, LIMITS.title) || t('common.untitled'),
          });
          if (text && k === kind) await fillBoard(entry, k, text); // the template fits the type it was made for
          await app.wallet.upsert(entry);
          close(true);
          app.go(boardHash({ pub: entry.pub }));
        } catch (err) {
          btn.disabled = false;
          toast(tErr(err), 'error');
        }
      });
    },
  });
  return m.done;
}

function openLinkDialog() {
  modal({
    title: t('home.open.title'),
    body: `
      <form class="form">
        <label class="field">${t('home.open.label')}<input name="link" required placeholder="${h(t('home.open.placeholder'))}" autocomplete="off" spellcheck="false"></label>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>${t('common.cancel')}</button>
          <button type="submit" class="btn btn-primary">${t('common.open')}</button>
        </div>
      </form>`,
    onOpen: (el, close) => {
      el.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const route = parseBoardInput(e.target.link.value);
        if (!route) return toast(t('home.open.invalid'), 'error');
        close(true);
        app.go(boardHash(route));
      });
    },
  });
}
