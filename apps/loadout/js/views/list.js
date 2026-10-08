import { app } from '../app.js';
import { parseItemText, splitLines, sortItems, stats, isHeader, headerText, between, endOrders, formatQty } from '../items.js';
import { renderInline } from '../markdown.js';
import { $, icon, toast, confirmDialog } from '../ui.js';
import { h } from '../util.js';
import { t, tErr } from '../../../shared/i18n.js';

/** Mount a checklist or inventory into `body`; returns an unmount function. */
export function mountList(body, board) {
  const mode = () => (board.info.mode === 'count' ? 'count' : 'check');
  const canEdit = board.canEdit;
  const rows = new Map(); // id -> { el, sig }
  let editing = null;

  body.innerHTML = `
    <div class="list ${mode() === 'count' ? 'list-count' : 'list-check'}">
      ${
        canEdit
          ? `<form class="add-item" id="addForm" autocomplete="off">
              <input id="addInput" name="item" placeholder="${h(mode() === 'count' ? t('list.placeholderCount') : t('list.placeholderCheck'))}" aria-label="${h(t('list.newItem'))}" enterkeyhint="send" maxlength="2000">
              <button class="btn btn-primary" aria-label="${h(t('list.add'))}">${icon('plus')}</button>
            </form>`
          : ''
      }
      <p class="list-meta" id="progress"></p>
      <ul class="items" id="active" aria-label="${h(t('list.items'))}"></ul>
      <p class="empty-list" id="emptyList" hidden>${h(canEdit ? t('list.emptyEdit') : t('list.emptyView'))}</p>
      <details class="done-box" id="doneBox" hidden>
        <summary><span>${h(t('list.done'))} <span id="doneCount"></span></span>
          ${canEdit ? `<span class="done-actions"><button type="button" class="btn btn-sm btn-ghost" data-act="uncheck">${h(t('list.uncheckAll'))}</button><button type="button" class="btn btn-sm btn-ghost" data-act="clear">${h(t('list.clear'))}</button></span>` : ''}
        </summary>
        <ul class="items" id="done" aria-label="${h(t('list.doneItems'))}"></ul>
      </details>
    </div>`;

  const activeUl = $('#active', body);
  const doneUl = $('#done', body);
  const doneBox = $('#doneBox', body);
  doneBox.open = app.wallet.localOf(board.pub).showDone ?? true;
  doneBox.addEventListener('toggle', () => app.wallet.setLocal(board.pub, { showDone: doneBox.open }));

  function rowHtml(item) {
    const header = isHeader(item.t);
    const m = mode();
    const parts = [];
    if (canEdit && !item.d) parts.push(`<button type="button" class="grip" aria-label="${h(t('list.drag'))}" tabindex="-1">${icon('grip-vertical')}</button>`);
    if (header) {
      parts.push(`<div class="text" ${canEdit ? 'data-edit' : ''}>${renderInline(headerText(item.t))}</div>`);
    } else if (m === 'check') {
      parts.push(`<label class="check"><input type="checkbox" ${item.d ? 'checked' : ''} ${canEdit ? '' : 'disabled'} aria-label="${h(t('list.done'))}"><span class="box">${icon('check')}</span></label>`);
      parts.push(`<div class="text" ${canEdit ? 'data-edit' : ''}>${renderInline(item.t)}</div>`);
      if (item.q) parts.push(`<span class="qty">${h(formatQty(item.q))}</span>`);
    } else {
      parts.push(`<div class="text" ${canEdit ? 'data-edit' : ''}>${renderInline(item.t)}</div>`);
      parts.push(`<div class="stepper">
        ${canEdit ? `<button type="button" data-step="-1" aria-label="${h(t('list.oneLess'))}">${icon('minus')}</button>` : ''}
        <span class="count" aria-label="${h(t('list.count'))}">${h(item.q ?? 0)}</span>
        ${canEdit ? `<button type="button" data-step="1" aria-label="${h(t('list.oneMore'))}">${icon('plus')}</button>` : ''}
      </div>`);
    }
    if (canEdit) parts.push(`<button type="button" class="icon-btn del" data-act="delete" aria-label="${h(t('common.delete'))}">${icon('x')}</button>`);
    return parts.join('');
  }

  function rowClass(item) {
    return ['item', isHeader(item.t) && 'is-header', item.d && 'is-done', mode() === 'count' && !isHeader(item.t) && !item.q && 'is-zero'].filter(Boolean).join(' ');
  }

  function sync() {
    const items = [...board.items.values()];
    const m = mode();
    const { active, done } = m === 'check' ? sortItems(items) : { active: items.sort((a, b) => a.o - b.o || a.c - b.c), done: [] };
    const seen = new Set();
    const place = (ul, list) => {
      list.forEach((item, i) => {
        seen.add(item.id);
        const sig = JSON.stringify([item.t, item.d, item.q, m]);
        let row = rows.get(item.id);
        if (!row) {
          const el = document.createElement('li');
          el.dataset.id = item.id;
          row = { el, sig: null };
          rows.set(item.id, row);
        }
        if (row.sig !== sig && editing !== item.id) {
          row.el.className = rowClass(item);
          row.el.innerHTML = rowHtml(item);
          row.sig = sig;
        }
        if (ul.children[i] !== row.el && !row.el.classList.contains('dragging')) ul.insertBefore(row.el, ul.children[i] || null);
      });
    };
    place(activeUl, active);
    place(doneUl, done);
    for (const [id, row] of rows) {
      if (!seen.has(id)) {
        row.el.remove();
        rows.delete(id);
      }
    }
    const s = stats(items);
    $('#emptyList', body).hidden = items.length > 0;
    doneBox.hidden = done.length === 0;
    $('#doneCount', body).textContent = `(${done.length})`;
    const zero = items.filter((i) => !isHeader(i.t) && !i.q).length;
    $('#progress', body).textContent = !s.total ? '' : m === 'check' ? t('list.progressCheck', { done: s.done, total: s.total }) : `${t('list.progressCount', { n: s.total })}${zero ? ` · ${t('list.out', { n: zero })}` : ''}`;
    app.wallet.setLocal(board.pub, { total: s.total, done: s.done });
  }

  // ---- adding ----
  async function addLines(lines) {
    const m = mode();
    const parsed = lines.map((l) => parseItemText(l, m)).filter((p) => p.t);
    if (!parsed.length) return;
    // Done items keep their place for when they're unchecked, so count them too.
    const orders = endOrders([...board.items.values()], parsed.length);
    try {
      const ids = await Promise.all(parsed.map((p, i) => board.addItem({ ...p, o: orders[i] })));
      if (parsed.length > 1) toast(t('list.added', { n: parsed.length }), 'success');
      requestAnimationFrame(() => rows.get(ids.at(-1))?.el.scrollIntoView({ block: 'nearest' }));
    } catch (err) {
      toast(tErr(err), 'error');
    }
  }

  const addForm = $('#addForm', body);
  addForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = addForm.item;
    const lines = splitLines(input.value);
    input.value = '';
    addLines(lines);
    input.focus();
  });
  addForm?.item.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') || '';
    if (!text.includes('\n')) return;
    e.preventDefault();
    addLines(splitLines(text));
  });

  // ---- editing ----
  function editText(item) {
    if (isHeader(item.t)) return item.t;
    return mode() === 'check' && item.q ? `${item.t} x${item.q}` : item.t;
  }

  function startEdit(id) {
    const item = board.items.get(id);
    const row = rows.get(id);
    if (!item || !row || editing) return;
    editing = id;
    const textEl = $('.text', row.el);
    const input = document.createElement('input');
    input.className = 'edit-input';
    input.value = editText(item);
    input.maxLength = 2000;
    input.setAttribute('aria-label', t('list.editItem'));
    textEl.replaceWith(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    let finished = false;
    const finish = async (save) => {
      if (finished) return;
      finished = true;
      editing = null;
      const value = input.value.trim();
      const cur = board.items.get(id);
      rows.get(id) && (rows.get(id).sig = null); // force a redraw of this row
      if (save && cur && value !== editText(cur)) {
        try {
          if (!value) await board.removeItem(id);
          else {
            const p = parseItemText(value, mode());
            const explicit = parseItemText(value, 'check').q != null || (mode() === 'count' && /[:=]\s*\d{1,4}$/.test(value));
            await board.updateItem(id, { t: p.t, q: explicit || mode() === 'check' ? p.q : cur.q });
          }
        } catch (err) {
          toast(tErr(err), 'error');
        }
      }
      sync();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      }
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  // ---- clicks ----
  body.addEventListener('click', onClick);
  body.addEventListener('change', onChange);
  async function onClick(e) {
    const li = e.target.closest('li.item');
    const id = li?.dataset.id;
    const act = e.target.closest('[data-act]')?.dataset.act;
    try {
      if (act === 'delete' && id) {
        const item = board.items.get(id);
        await board.removeItem(id);
        if (item) undoToast(item);
        return;
      }
      if (act === 'clear' || act === 'uncheck') {
        e.preventDefault();
        const done = [...board.items.values()].filter((i) => i.d);
        if (act === 'clear' && !(await confirmDialog({ title: t('list.clearDialog.title'), message: t('list.clearDialog.text', { n: done.length }), confirm: t('list.clear'), danger: true }))) return;
        await Promise.all(done.map((i) => (act === 'clear' ? board.removeItem(i.id) : board.updateItem(i.id, { d: 0 }))));
        return;
      }
      const step = e.target.closest('[data-step]');
      if (step && id) {
        const item = board.items.get(id);
        await board.updateItem(id, { q: Math.max(0, (Number(item.q) || 0) + Number(step.dataset.step)) });
        return;
      }
      if (canEdit && id && e.target.closest('[data-edit]') && !e.target.closest('a')) startEdit(id);
    } catch (err) {
      toast(tErr(err), 'error');
    }
  }

  async function onChange(e) {
    if (e.target.type !== 'checkbox') return;
    const id = e.target.closest('li.item')?.dataset.id;
    if (!id) return;
    // Items keep their order while done, so unchecking puts them back where they were.
    board.updateItem(id, { d: e.target.checked ? 1 : 0 }).catch((err) => toast(tErr(err), 'error'));
  }

  function undoToast(item) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${h(t('list.deleted', { text: (isHeader(item.t) ? headerText(item.t) : item.t).slice(0, 40) }))}</span><button type="button" class="btn btn-sm btn-ghost">${h(t('common.undo'))}</button>`;
    box.append(el);
    const t = setTimeout(() => el.remove(), 5000);
    el.querySelector('button').addEventListener('click', () => {
      clearTimeout(t);
      el.remove();
      board.addItem(item).catch((err) => toast(tErr(err), 'error'));
    });
  }

  // ---- drag to reorder ----
  activeUl.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip');
    if (!grip || e.button > 0) return;
    e.preventDefault();
    const li = grip.closest('li');
    const id = li.dataset.id;
    const startPrev = li.previousElementSibling;
    let startY = e.clientY;
    li.classList.add('dragging');
    grip.setPointerCapture(e.pointerId);
    const gap = parseFloat(getComputedStyle(activeUl).rowGap) || 0;
    const move = (ev) => {
      const dy = ev.clientY - startY;
      const next = li.nextElementSibling;
      const prev = li.previousElementSibling;
      if (next && dy > (next.offsetHeight + gap) / 2) {
        activeUl.insertBefore(next, li);
        startY += next.offsetHeight + gap;
      } else if (prev && dy < -(prev.offsetHeight + gap) / 2) {
        activeUl.insertBefore(li, prev);
        startY -= prev.offsetHeight + gap;
      }
      li.style.transform = `translateY(${ev.clientY - startY}px)`;
      if (ev.clientY < 70) window.scrollBy(0, -12);
      else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
    };
    const up = async () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      li.style.transform = '';
      li.classList.remove('dragging');
      if (li.previousElementSibling === startPrev) return;
      const before = board.items.get(li.previousElementSibling?.dataset.id);
      const after = board.items.get(li.nextElementSibling?.dataset.id);
      const o = between(before?.o ?? null, after?.o ?? null);
      try {
        if (o != null) await board.updateItem(id, { o });
        else await renumber();
      } catch (err) {
        toast(tErr(err), 'error');
        sync();
      }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });

  /** Orders ran out of precision: write the current on-screen order as 0, 1, 2… */
  function renumber() {
    const ids = [...activeUl.children].map((el) => el.dataset.id);
    return Promise.all(ids.map((id, i) => board.updateItem(id, { o: i })));
  }

  // Keyboard reordering for the focused row: Alt+↑ / Alt+↓.
  activeUl.addEventListener('keydown', async (e) => {
    if (!canEdit || !e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const li = e.target.closest('li.item');
    const up = e.key === 'ArrowUp';
    const sib = up ? li?.previousElementSibling : li?.nextElementSibling;
    if (!sib) return;
    e.preventDefault();
    const [a, b] = up ? [sib.previousElementSibling, sib] : [sib, sib.nextElementSibling];
    const o = between(board.items.get(a?.dataset.id)?.o ?? null, board.items.get(b?.dataset.id)?.o ?? null);
    try {
      if (o != null) await board.updateItem(li.dataset.id, { o });
    } catch (err) {
      toast(tErr(err), 'error');
    }
  });

  const off = board.on((what) => {
    if (what === 'items' || what === 'all') sync();
  });
  sync();

  return () => {
    off();
    body.removeEventListener('click', onClick);
    body.removeEventListener('change', onChange);
  };
}
