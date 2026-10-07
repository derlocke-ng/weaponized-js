import { app } from '../app.js';
import { createBoard } from '../boards.js';
import { parseBoardInput, boardHash } from '../links.js';
import { icon, modal, toast } from '../ui.js';
import { h, relTime, store } from '../util.js';
import { LIMITS } from '../config.js';

export const TYPES = {
  check: { icon: 'list-checks', label: 'Checklist' },
  count: { icon: 'package', label: 'Inventory' },
  note: { icon: 'notebook-pen', label: 'Note' },
};
export const kindOf = (b) => (b.type === 'note' ? 'note' : b.mode === 'count' ? 'count' : 'check');

const STARTERS = [
  { kind: 'check', title: 'Groceries', text: 'Shopping list for the whole household' },
  { kind: 'check', title: 'To-do', text: 'Things to get done, on every device' },
  { kind: 'count', title: 'Pantry', text: 'What’s at home and how many' },
  { kind: 'note', title: 'Notes', text: 'Markdown text to keep or share, like rentry' },
];

export function renderHome(view) {
  const draw = () => {
    const boards = app.wallet.list();
    view.innerHTML = `
      <section class="home">
        <div class="home-head">
          <h1>Your boards</h1>
          <div class="home-actions">
            <button type="button" class="btn btn-primary" data-new="check">${icon('plus')}<span>New list</span></button>
            <button type="button" class="btn" data-new="note">${icon('notebook-pen')}<span>New note</span></button>
            <button type="button" class="btn btn-ghost" data-open-link>${icon('link')}<span>Open link</span></button>
          </div>
        </div>
        ${nudge(boards)}
        ${boards.length ? `<ul class="boards">${boards.map(card).join('')}</ul>` : empty()}
      </section>`;
  };
  draw();
  const off = app.wallet.onChange(draw);

  view.addEventListener('click', onClick);
  async function onClick(e) {
    const nb = e.target.closest('[data-new]');
    if (nb) return newBoardDialog({ kind: nb.dataset.new, title: nb.dataset.title || '' });
    if (e.target.closest('[data-open-link]')) return openLinkDialog();
  }
  return () => {
    off();
    view.removeEventListener('click', onClick);
  };
}

function card(b) {
  const local = app.wallet.localOf(b.pub);
  const kind = kindOf(b);
  const progress = kind === 'check' && local.total ? `${local.done || 0}/${local.total} done` : kind === 'count' && local.total ? `${local.total} items` : '';
  const when = local.opened ? `opened ${relTime(local.opened)}` : `added ${relTime(b.added)}`;
  return `
    <li>
      <a class="board-card" href="${h(boardHash({ pub: b.pub }))}">
        <span class="board-icon kind-${kind}">${icon(TYPES[kind].icon)}</span>
        <span class="board-main">
          <span class="board-title">${h(b.title || 'Untitled')}</span>
          <span class="board-meta">${[progress, when].filter(Boolean).map(h).join(' · ')}</span>
        </span>
        <span class="board-badges">
          ${b.pinned ? `<span class="chip" title="Pinned">${icon('pin')}</span>` : ''}
          ${b.w ? '' : `<span class="chip" title="View only">${icon('eye')}</span>`}
        </span>
      </a>
    </li>`;
}

function empty() {
  return `
    <div class="empty-home">
      <p class="lead">Lists and notes that sync between your devices and the people you share them with — no server, no sign-up. Pick a start:</p>
      <div class="starters">
        ${STARTERS.map(
          (s) => `
          <button type="button" class="starter" data-new="${s.kind}" data-title="${h(s.title)}">
            <span class="board-icon kind-${s.kind}">${icon(TYPES[s.kind].icon)}</span>
            <strong>${h(s.title)}</strong>
            <small>${h(s.text)}</small>
          </button>`,
        ).join('')}
      </div>
      <p class="hint">Got a link from someone? Just open it, or use <b>Open link</b>.</p>
    </div>`;
}

function nudge(boards) {
  if (app.identity.alias || !boards.length || store.get('loadout.lastBackup')) return '';
  return `
    <div class="banner">
      ${icon('shield')}
      <p>Your boards live under a key that exists <b>only in this browser</b>. <a href="#/account">Create an account</a> to use them on other devices, or download a backup.</p>
    </div>`;
}

export function newBoardDialog({ kind = 'check', title = '' } = {}) {
  const m = modal({
    title: 'New board',
    body: `
      <form class="form" id="newBoard">
        <div class="seg" role="radiogroup" aria-label="Type">
          ${Object.entries(TYPES)
            .map(([k, t]) => `<label><input type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''}><span>${icon(t.icon)}${h(t.label)}</span></label>`)
            .join('')}
        </div>
        <label class="field">Title<input name="title" maxlength="${LIMITS.title}" required value="${h(title)}" placeholder="Groceries" autofocus></label>
        <p class="hint">${icon('lock')} Encrypted in your browser. Only people you give a link can read it — and they can pass that link on.</p>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Create</button>
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
            title: String(data.get('title')).trim().slice(0, LIMITS.title) || 'Untitled',
          });
          await app.wallet.upsert(entry);
          close(true);
          app.go(boardHash({ pub: entry.pub }));
        } catch (err) {
          btn.disabled = false;
          toast(err.message, 'error');
        }
      });
    },
  });
  return m.done;
}

function openLinkDialog() {
  modal({
    title: 'Open a shared board',
    body: `
      <form class="form">
        <label class="field">Link<input name="link" required placeholder="https://…/loadout/#/b/…" autocomplete="off" spellcheck="false"></label>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Open</button>
        </div>
      </form>`,
    onOpen: (el, close) => {
      el.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const route = parseBoardInput(e.target.link.value);
        if (!route) return toast('That doesn’t look like a Loadout link.', 'error');
        close(true);
        app.go(boardHash(route));
      });
    },
  });
}

