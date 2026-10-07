import { app } from '../app.js';
import { Board, createBoard } from '../boards.js';
import { boardHash, parseBoardInput } from '../links.js';
import { $, icon, toast, openMenu, confirmDialog, copyText, download, safeFilename, modal } from '../ui.js';
import { h } from '../util.js';
import { listToMarkdown } from '../items.js';
import { LIMITS } from '../config.js';
import { mountList } from './list.js';
import { mountNote } from './note.js';
import { shareDialog } from './share.js';

export function renderBoard(view, route) {
  const saved = app.wallet.get(route.pub);
  const keys = { pub: route.pub, w: route.w || saved?.w || null, k: route.k || saved?.k || null };
  const cameWithKeys = Boolean(route.w || route.k);
  // Keep secrets out of the address bar and history once we have them.
  if (cameWithKeys) history.replaceState(null, '', boardHash({ pub: route.pub }));

  const board = new Board(keys);
  let child = null;
  let mounted = null;

  view.innerHTML = `
    <section class="board">
      <div class="board-head">
        <a class="icon-btn back" href="#/" aria-label="Back to your boards">${icon('chevron-left')}</a>
        <div class="board-titles">
          <h1 class="board-name" id="boardName">…</h1>
          <div class="board-tags" id="boardTags"></div>
        </div>
        <div class="board-actions" id="boardActions"></div>
      </div>
      <div class="board-body" id="boardBody"></div>
    </section>`;
  const body = $('#boardBody', view);

  const draw = (what) => {
    drawHead();
    if (board.state === 'ready') {
      const kind = board.info.type === 'note' ? 'note' : 'list';
      if (mounted !== kind) {
        child?.();
        mounted = kind;
        child = kind === 'note' ? mountNote(body, board) : mountList(body, board);
      } else if (what === 'all') {
        body.dispatchEvent(new CustomEvent('board:info'));
      }
      if (what === 'all') remember();
      return;
    }
    child?.();
    child = null;
    mounted = null;
    body.innerHTML = stateHtml(board.state);
    $('#unlock', body)?.addEventListener('submit', unlock);
  };

  async function remember() {
    const entry = app.wallet.get(board.pub);
    const fields = { type: board.info.type, mode: board.info.mode, title: board.info.title, enc: board.enc };
    if (!entry && (cameWithKeys || keys.w || keys.k)) {
      await app.wallet.upsert({ pub: board.pub, w: keys.w, k: keys.k, ...fields });
    } else if (entry && (entry.title !== fields.title || entry.enc !== fields.enc || (keys.w && !entry.w) || (keys.k && !entry.k))) {
      await app.wallet.upsert({ ...entry, ...fields, w: keys.w || entry.w, k: keys.k || entry.k });
    }
    app.wallet.setLocal(board.pub, { opened: Date.now() });
  }

  function drawHead() {
    const name = $('#boardName', view);
    const title = board.info?.title || (board.state === 'locked' ? 'Private board' : board.state === 'deleted' ? 'Deleted board' : 'Loading…');
    name.textContent = title;
    name.title = board.canEdit && board.state === 'ready' ? 'Click to rename' : '';
    name.classList.toggle('editable', board.canEdit && board.state === 'ready');
    document.title = `${title} · Loadout`;
    const tags = [];
    if (board.enc != null) tags.push(board.enc ? `<span class="tag">${icon('lock')}Private</span>` : `<span class="tag">${icon('globe')}Public</span>`);
    if (board.state === 'ready') tags.push(board.canEdit ? `<span class="tag">${icon('pencil')}Can edit</span>` : `<span class="tag">${icon('eye')}View only</span>`);
    $('#boardTags', view).innerHTML = tags.join('');
    const saved = app.wallet.get(board.pub);
    $('#boardActions', view).innerHTML =
      board.state === 'ready'
        ? `${!saved ? `<button type="button" class="btn btn-sm" data-act="save">${icon('pin')}<span>Save</span></button>` : ''}
           <button type="button" class="btn btn-sm" data-act="share">${icon('share-2')}<span>Share</span></button>
           <button type="button" class="icon-btn" data-act="menu" aria-label="More">${icon('ellipsis')}</button>`
        : saved || board.state !== 'loading'
          ? `<button type="button" class="icon-btn" data-act="menu" aria-label="More">${icon('ellipsis')}</button>`
          : '';
  }

  function stateHtml(state) {
    if (state === 'loading') return `<div class="state"><span class="spinner"></span><p>Looking for this board on the network…</p></div>`;
    if (state === 'missing')
      return `<div class="state"><span class="spinner"></span><p><b>Not found yet.</b> It may still be on its way from a relay, or the relays have forgotten it.
        Keep this open — it appears as soon as a device that has it comes online.</p></div>`;
    if (state === 'deleted') return `<div class="state"><p>This board was deleted by one of its editors.</p></div>`;
    if (state === 'locked')
      return `<div class="state">
        ${icon('lock', 'big')}
        <p>This board is private. Open it with the full link you were given.</p>
        <form id="unlock" class="unlock">
          <input name="link" placeholder="Paste the full link" autocomplete="off" spellcheck="false" required>
          <button class="btn btn-primary">Open</button>
        </form></div>`;
    return '';
  }

  function unlock(e) {
    e.preventDefault();
    const r = parseBoardInput(e.target.link.value);
    if (!r || r.pub !== board.pub || !(r.k || r.w)) return toast('That link has no key for this board.', 'error');
    app.go(boardHash(r));
  }

  view.addEventListener('click', onClick);
  async function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (e.target.closest('#boardName.editable')) return rename();
    if (!act) return;
    if (act === 'share') return shareDialog(board);
    if (act === 'save') {
      await app.wallet.upsert({ pub: board.pub, w: keys.w, k: keys.k, enc: board.enc, type: board.info.type, mode: board.info.mode, title: board.info.title });
      toast('Saved to your boards', 'success');
      return drawHead();
    }
    if (act === 'menu') return openMenu(e.target.closest('[data-act]'), menuItems());
  }

  function menuItems() {
    const saved = app.wallet.get(board.pub);
    const ready = board.state === 'ready';
    const items = [];
    if (ready) {
      items.push({ label: 'Copy as text', icon: 'copy', run: () => copyText(asMarkdown(), 'Text') });
      items.push({ label: 'Download .md', icon: 'download', run: () => download(safeFilename(board.info.title, 'md'), asMarkdown(), 'text/markdown') });
      items.push({ label: 'Duplicate…', icon: 'copy', run: duplicate });
    }
    if (saved) {
      items.push({ label: saved.pinned ? 'Unpin' : 'Pin to top', icon: saved.pinned ? 'pin-off' : 'pin', run: () => app.wallet.upsert({ ...saved, pinned: !saved.pinned }).then(drawHead) });
      items.push('-');
      items.push({ label: 'Remove from my boards', icon: 'x', run: removeMine });
    }
    if (ready && board.canEdit) items.push({ label: 'Delete for everyone…', icon: 'trash-2', danger: true, run: destroy });
    return items;
  }

  function asMarkdown() {
    if (board.info.type === 'note') return board.doc?.md || '';
    return listToMarkdown(board.info.title, [...board.items.values()], board.info.mode);
  }

  async function rename() {
    const input = document.createElement('input');
    input.className = 'title-input';
    input.value = board.info.title || '';
    input.maxLength = LIMITS.title;
    const name = $('#boardName', view);
    name.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      input.replaceWith(name);
      const title = input.value.trim();
      if (save && title && title !== board.info.title) {
        try {
          await board.setInfo({ title });
        } catch (err) {
          toast(err.message, 'error');
        }
      }
      drawHead();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  async function duplicate() {
    const m = modal({
      title: 'Duplicate board',
      body: `
        <form class="form">
          <p class="modal-text">Makes a new board with a copy of everything in this one and new links. Use it to cut off people you shared the old links with.</p>
          <label class="field">Title<input name="title" maxlength="${LIMITS.title}" value="${h(`${board.info.title} (copy)`)}" required></label>
          <fieldset class="choices">
            <label class="choice"><input type="radio" name="privacy" value="private" ${board.enc !== false ? 'checked' : ''}><span>${icon('lock')}<b>Private</b><small>End-to-end encrypted</small></span></label>
            <label class="choice"><input type="radio" name="privacy" value="public" ${board.enc === false ? 'checked' : ''}><span>${icon('globe')}<b>Public</b><small>Readable with the address</small></span></label>
          </fieldset>
          <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Duplicate</button></div>
        </form>`,
      onOpen: (el, close) => {
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          e.submitter && (e.submitter.disabled = true);
          try {
            const pub = await copyBoard(board, { title: e.target.title.value.trim() || board.info.title, enc: e.target.privacy.value === 'private' });
            close(true);
            app.go(boardHash({ pub }));
          } catch (err) {
            toast(err.message, 'error');
            e.submitter && (e.submitter.disabled = false);
          }
        });
      },
    });
    return m.done;
  }

  async function removeMine() {
    const ok = await confirmDialog({
      title: 'Remove from your boards?',
      message: board.canEdit
        ? 'The board stays online for everyone else. Unless you have its link saved somewhere, you lose access to it.'
        : 'The board stays online for everyone else. You can add it again with its link.',
      confirm: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await app.wallet.remove(board.pub);
    app.go('#/');
  }

  async function destroy() {
    const ok = await confirmDialog({
      title: 'Delete for everyone?',
      message: `“${board.info.title}” and everything in it is wiped for every device and everyone it was shared with. This can’t be undone.`,
      confirm: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await board.destroy();
      await app.wallet.remove(board.pub);
      toast('Board deleted', 'success');
      app.go('#/');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const off = board.on(draw);
  const offWallet = app.wallet.onChange(() => board.state === 'ready' && drawHead());
  board.open();
  draw('all');

  return () => {
    child?.();
    off();
    offWallet();
    board.close();
    view.removeEventListener('click', onClick);
    document.title = 'Loadout';
  };
}

/** New board with the same content; returns its pub. */
export async function copyBoard(src, { title, enc }) {
  const entry = await createBoard({ type: src.info.type, mode: src.info.mode, title, enc });
  const copy = new Board(entry);
  copy.enc = enc;
  if (src.info.type === 'note') {
    if (src.doc?.md) await copy.setDoc(src.doc.md);
  } else {
    await Promise.all([...src.items.values()].map((i) => copy.addItem(i)));
  }
  await app.wallet.upsert(entry);
  return entry.pub;
}

