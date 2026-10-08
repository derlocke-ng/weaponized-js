import { app } from '../app.js';
import { Board, createBoard } from '../boards.js';
import { healBoard } from '../heal.js';
import { boardHash, parseBoardInput } from '../links.js';
import { $, icon, toast, openMenu, confirmDialog, copyText, download, safeFilename, modal } from '../ui.js';
import { h } from '../util.js';
import { listToMarkdown } from '../items.js';
import { LIMITS } from '../config.js';
import { t, tErr } from '../../../shared/i18n.js';
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
        <a class="icon-btn back" href="#/" aria-label="${h(t('app.backToBoards'))}">${icon('chevron-left')}</a>
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
      if (what === 'all') {
        remember();
        healBoard(board.pub).catch(() => {});
      }
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
    const fields = { type: board.info.type, mode: board.info.mode, title: board.info.title };
    if (!entry) {
      await app.wallet.upsert({ pub: board.pub, w: keys.w, k: keys.k, ...fields });
    } else if (entry.title !== fields.title || (keys.w && !entry.w) || (keys.k && !entry.k)) {
      await app.wallet.upsert({ ...entry, ...fields, w: keys.w || entry.w, k: keys.k || entry.k });
    }
    app.wallet.setLocal(board.pub, { opened: Date.now() });
  }

  function drawHead() {
    const name = $('#boardName', view);
    const title = board.info?.title || (board.state === 'locked' ? t('board.locked') : board.state === 'deleted' ? t('board.deleted') : t('common.loading'));
    name.textContent = title;
    name.title = board.canEdit && board.state === 'ready' ? t('board.rename') : '';
    name.classList.toggle('editable', board.canEdit && board.state === 'ready');
    document.title = `${title} · Loadout`;
    const tags = [];
    if (board.state === 'ready') tags.push(board.canEdit ? `<span class="tag">${icon('pencil')}${h(t('board.canEdit'))}</span>` : `<span class="tag">${icon('eye')}${h(t('board.viewOnly'))}</span>`);
    $('#boardTags', view).innerHTML = tags.join('');
    const saved = app.wallet.get(board.pub);
    $('#boardActions', view).innerHTML =
      board.state === 'ready'
        ? `<button type="button" class="btn btn-sm" data-act="share">${icon('share-2')}<span>${h(t('board.share'))}</span></button>
           <button type="button" class="icon-btn" data-act="menu" aria-label="${h(t('common.more'))}">${icon('ellipsis')}</button>`
        : saved || board.state !== 'loading'
          ? `<button type="button" class="icon-btn" data-act="menu" aria-label="${h(t('common.more'))}">${icon('ellipsis')}</button>`
          : '';
  }

  function stateHtml(state) {
    if (state === 'loading') return `<div class="state"><span class="spinner"></span><p>${h(t('board.state.loading'))}</p></div>`;
    if (state === 'missing') return `<div class="state"><span class="spinner"></span><p>${t('board.state.missing')}</p></div>`;
    if (state === 'deleted') return `<div class="state"><p>${h(t('board.state.deleted'))}</p></div>`;
    if (state === 'locked')
      return `<div class="state">
        ${icon('lock', 'big')}
        <p>${h(t('board.state.locked'))}</p>
        <form id="unlock" class="unlock">
          <input name="link" placeholder="${h(t('board.state.pasteLink'))}" autocomplete="off" spellcheck="false" required>
          <button class="btn btn-primary">${h(t('common.open'))}</button>
        </form></div>`;
    return '';
  }

  function unlock(e) {
    e.preventDefault();
    const r = parseBoardInput(e.target.link.value);
    if (!r || r.pub !== board.pub || !(r.k || r.w)) return toast(t('board.unlock.noKey'), 'error');
    app.go(boardHash(r));
  }

  view.addEventListener('click', onClick);
  async function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (e.target.closest('#boardName.editable')) return rename();
    if (!act) return;
    if (act === 'share') return shareDialog(board);
    if (act === 'menu') return openMenu(e.target.closest('[data-act]'), menuItems());
  }

  function menuItems() {
    const saved = app.wallet.get(board.pub);
    const ready = board.state === 'ready';
    const items = [];
    if (ready) {
      items.push({ label: t('board.menu.copyText'), icon: 'copy', run: () => copyText(asMarkdown(), t('common.text')) });
      items.push({ label: t('board.menu.download'), icon: 'download', run: () => download(safeFilename(board.info.title, 'md'), asMarkdown(), 'text/markdown') });
      items.push({ label: t('board.menu.duplicate'), icon: 'copy', run: duplicate });
    }
    if (saved) {
      items.push({ label: saved.pinned ? t('board.menu.unpin') : t('board.menu.pin'), icon: saved.pinned ? 'pin-off' : 'pin', run: () => app.wallet.upsert({ ...saved, pinned: !saved.pinned }).then(drawHead) });
      items.push('-');
      items.push({ label: t('board.menu.remove'), icon: 'x', run: removeMine });
    }
    if (ready && board.canEdit) items.push({ label: t('board.menu.delete'), icon: 'trash-2', danger: true, run: destroy });
    return items;
  }

  function asMarkdown() {
    if (board.info.type === 'note') return board.doc?.md || '';
    return listToMarkdown(board.info.title, [...board.items.values()], board.info.mode, t('common.untitled'));
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
          toast(tErr(err), 'error');
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
      title: t('board.duplicate.title'),
      body: `
        <form class="form">
          <p class="modal-text">${h(t('board.duplicate.text'))}</p>
          <label class="field">${h(t('board.duplicate.titleLabel'))}<input name="title" maxlength="${LIMITS.title}" value="${h(t('board.duplicate.copySuffix', { title: board.info.title }))}" required></label>
          <div class="modal-actions"><button type="button" class="btn" data-close>${h(t('common.cancel'))}</button><button class="btn btn-primary">${h(t('board.duplicate.action'))}</button></div>
        </form>`,
      onOpen: (el, close) => {
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          e.submitter && (e.submitter.disabled = true);
          try {
            const pub = await copyBoard(board, { title: e.target.title.value.trim() || board.info.title });
            close(true);
            app.go(boardHash({ pub }));
          } catch (err) {
            toast(tErr(err), 'error');
            e.submitter && (e.submitter.disabled = false);
          }
        });
      },
    });
    return m.done;
  }

  async function removeMine() {
    const ok = await confirmDialog({
      title: t('board.remove.title'),
      message: board.canEdit ? t('board.remove.textEdit') : t('board.remove.textView'),
      confirm: t('common.remove'),
      danger: true,
    });
    if (!ok) return;
    await app.wallet.remove(board.pub);
    app.go('#/');
  }

  async function destroy() {
    const ok = await confirmDialog({
      title: t('board.delete.title'),
      message: t('board.delete.text', { title: board.info.title }),
      confirm: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await board.destroy();
      await app.wallet.remove(board.pub);
      toast(t('board.delete.done'), 'success');
      app.go('#/');
    } catch (err) {
      toast(tErr(err), 'error');
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
export async function copyBoard(src, { title }) {
  const entry = await createBoard({ type: src.info.type, mode: src.info.mode, title });
  const copy = new Board(entry);
  if (src.info.type === 'note') {
    if (src.doc?.md) await copy.setDoc(src.doc.md);
  } else {
    await Promise.all([...src.items.values()].map((i) => copy.addItem(i)));
  }
  await app.wallet.upsert(entry);
  return entry.pub;
}

