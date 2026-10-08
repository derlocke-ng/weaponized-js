import { renderMarkdown } from '../markdown.js';
import { toggleTask } from '../mdtasks.js';
import { $, $$, icon, toast } from '../ui.js';
import { debounce, h } from '../util.js';
import { t, tErr, relTime } from '../../../shared/i18n.js';
import { LIMITS } from '../config.js';

const SAVE_AFTER = 700;

/** Mount a markdown note into `body`; returns an unmount function. */
export function mountNote(body, board) {
  const canEdit = board.canEdit;
  let mode = canEdit && !board.doc?.md ? 'edit' : 'read';
  let saved = board.doc?.md ?? ''; // last text we know is on the network
  let ta = null;
  let unmountEditor = null;

  function draw() {
    unmountEditor?.();
    unmountEditor = null;
    if (mode === 'edit') return drawEditor();
    const md = board.doc?.md ?? '';
    body.innerHTML = `
      <div class="note">
        <div class="note-bar">
          <span class="note-meta">${board.doc?.u ? h(t('note.updated', { when: relTime(board.doc.u) })) : ''}</span>
          ${canEdit ? `<button type="button" class="btn btn-sm" data-act="edit">${icon('pencil')}<span>${h(t('common.edit'))}</span></button>` : ''}
        </div>
        <article class="md" id="noteView">${md.trim() ? renderMarkdown(md) : `<p class="empty-list">${h(canEdit ? t('note.emptyEdit') : t('note.emptyView'))}</p>`}</article>
      </div>`;
    const view = $('#noteView', body);
    $$('input[type=checkbox]', view).forEach((cb, i) => {
      if (!canEdit) return;
      cb.disabled = false;
      cb.dataset.task = String(i);
    });
    view.addEventListener('change', (e) => {
      const n = e.target.dataset?.task;
      if (n == null) return;
      const next = toggleTask(board.doc?.md ?? '', Number(n), e.target.checked);
      saved = next;
      board.setDoc(next).catch((err) => toast(tErr(err), 'error'));
    });
  }

  function drawEditor() {
    body.innerHTML = `
      <form class="note editor" id="editor" autocomplete="off">
        <div class="md-toolbar" role="toolbar" aria-label="${h(t('note.formatting'))}">
          <button type="button" data-cmd="bold" title="${h(t('note.bold'))}"><b>B</b></button>
          <button type="button" data-cmd="italic" title="${h(t('note.italic'))}"><i>I</i></button>
          <button type="button" data-cmd="h2" title="${h(t('note.heading'))}">H2</button>
          <button type="button" data-cmd="h3" title="${h(t('note.subheading'))}">H3</button>
          <button type="button" data-cmd="link" title="${h(t('note.link'))}">${icon('link')}</button>
          <button type="button" data-cmd="quote" title="${h(t('note.quote'))}">❝</button>
          <button type="button" data-cmd="ul" title="${h(t('note.bulleted'))}">•≡</button>
          <button type="button" data-cmd="ol" title="${h(t('note.numbered'))}">1.</button>
          <button type="button" data-cmd="task" title="${h(t('note.checklist'))}">${icon('list-checks')}</button>
          <button type="button" data-cmd="code" title="${h(t('note.inlineCode'))}">&lt;/&gt;</button>
          <button type="button" data-cmd="codeblock" title="${h(t('note.codeBlock'))}">{ }</button>
          <button type="button" data-cmd="table" title="${h(t('note.table'))}">▦</button>
          <span class="spacer"></span>
          <span class="pane-switch" role="tablist">
            <button type="button" data-pane="write" class="active" role="tab">${h(t('note.write'))}</button>
            <button type="button" data-pane="preview" role="tab">${h(t('note.preview'))}</button>
          </span>
        </div>
        <div class="alert" id="conflict" hidden>
          <span>${h(t('note.conflict'))}</span>
          <button type="button" class="btn btn-sm" data-act="theirs">${h(t('note.loadTheirs'))}</button>
          <button type="button" class="btn btn-sm" data-act="mine">${h(t('note.keepMine'))}</button>
        </div>
        <div class="panes" data-show="write">
          <textarea id="md" class="md-input" spellcheck="true" placeholder="${h(t('note.placeholder'))}" aria-label="${h(t('note.text'))}"></textarea>
          <article class="md md-preview" id="preview" aria-label="${h(t('note.preview'))}"></article>
        </div>
        <div class="editor-status">
          <span id="stats"></span>
          <span class="spacer"></span>
          <span id="saveState"></span>
          <button type="button" class="btn btn-sm btn-primary" data-act="done">${icon('check')}<span>${h(t('common.done'))}</span></button>
        </div>
      </form>`;
    ta = $('#md', body);
    ta.value = board.doc?.md ?? '';
    const preview = $('#preview', body);
    const stats = $('#stats', body);
    const state = $('#saveState', body);
    const conflict = $('#conflict', body);

    const updatePreview = debounce(() => {
      preview.innerHTML = renderMarkdown(ta.value) || `<p class="empty-list">${h(t('note.nothingToPreview'))}</p>`;
    }, 150);
    const updateStats = () => {
      const words = (ta.value.match(/\S+/g) || []).length;
      stats.textContent = `${t('note.words', { n: words })}${ta.value.length > LIMITS.doc * 0.9 ? ` · ${t('note.ofMax', { p: Math.round((ta.value.length / LIMITS.doc) * 100) })}` : ''}`;
    };
    const save = debounce(async () => {
      if (ta.value.length > LIMITS.doc) return (state.textContent = t('note.tooLong'));
      const text = ta.value;
      if (text === saved) return (state.textContent = t('note.saved'));
      state.textContent = t('note.saving');
      try {
        saved = text;
        await board.setDoc(text);
        if (ta && ta.value === text) state.textContent = t('note.saved');
      } catch (err) {
        state.textContent = t('note.notSaved');
        toast(tErr(err), 'error');
      }
    }, SAVE_AFTER);

    ta.addEventListener('input', () => {
      state.textContent = t('note.editing');
      updatePreview();
      updateStats();
      save();
    });
    updatePreview.flush();
    updateStats();
    state.textContent = t('note.saved');

    // ---- toolbar (same commands as the derlocke-blog / apex-genetics admin editor) ----
    const replaceRange = (start, end, text) => {
      ta.focus();
      ta.setSelectionRange(start, end);
      if (!document.execCommand('insertText', false, text)) {
        ta.setRangeText(text, start, end, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    const wrap = (before, after, placeholder) => {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const sel = value.slice(s, e) || placeholder;
      replaceRange(s, e, before + sel + after);
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    };
    const prefixLines = (prefix) => {
      const { value } = ta;
      const start = value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
      let end = value.indexOf('\n', ta.selectionEnd);
      if (end === -1) end = value.length;
      const lines = value.slice(start, end).split('\n');
      const out = lines.map((line, i) => (typeof prefix === 'function' ? prefix(i) : prefix) + line.replace(/^(#{1,6} |> |- \[[ xX]\] |- |\d+\. )/, '')).join('\n');
      replaceRange(start, end, out);
    };
    const insertBlock = (text) => {
      const { selectionStart: s, value } = ta;
      const before = s === 0 || value[s - 1] === '\n' ? (s > 1 && value[s - 2] !== '\n' ? '\n' : '') : '\n\n';
      replaceRange(s, ta.selectionEnd, `${before}${text}\n`);
    };
    const commands = {
      bold: () => wrap('**', '**', t('note.boldText')),
      italic: () => wrap('_', '_', t('note.italicText')),
      code: () => wrap('`', '`', t('note.code')),
      h2: () => prefixLines('## '),
      h3: () => prefixLines('### '),
      quote: () => prefixLines('> '),
      ul: () => prefixLines('- '),
      ol: () => prefixLines((i) => `${i + 1}. `),
      task: () => prefixLines('- [ ] '),
      link: () => {
        const url = prompt(t('note.linkUrl'), 'https://');
        if (url) wrap('[', `](${url})`, t('note.linkText'));
      },
      codeblock: () => {
        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        insertBlock(`\`\`\`\n${sel || t('note.code')}\n\`\`\``);
      },
      table: () => insertBlock(t('note.tableTemplate')),
    };
    const form = $('#editor', body);
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('click', (e) => {
      const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
      if (cmd) commands[cmd]();
      const pane = e.target.closest('[data-pane]');
      if (pane) {
        $('.panes', body).dataset.show = pane.dataset.pane;
        $$('[data-pane]', body).forEach((b) => b.classList.toggle('active', b === pane));
        updatePreview.flush();
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'done') {
        save.flush();
        mode = 'read';
        draw();
      }
      if (act === 'theirs') {
        ta.value = board.doc?.md ?? '';
        saved = ta.value;
        conflict.hidden = true;
        updatePreview.flush();
        updateStats();
        state.textContent = t('note.saved');
      }
      if (act === 'mine') {
        conflict.hidden = true;
        saved = null;
        save.flush();
      }
    });
    ta.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const cmd = { b: 'bold', i: 'italic', k: 'link', s: 'save' }[e.key.toLowerCase()];
      if (!cmd) return;
      e.preventDefault();
      if (cmd === 'save') save.flush();
      else commands[cmd]();
    });

    // Remote changes: apply them if we have no unsaved typing, else ask.
    const onRemote = () => {
      const remote = board.doc?.md ?? '';
      if (remote === ta.value || remote === saved) return;
      if (ta.value === saved) {
        const { selectionStart, selectionEnd } = ta;
        ta.value = remote;
        saved = remote;
        ta.setSelectionRange(Math.min(selectionStart, remote.length), Math.min(selectionEnd, remote.length));
        updatePreview();
        updateStats();
      } else {
        conflict.hidden = false;
      }
    };
    unmountEditor = () => {
      updatePreview.cancel();
      save.flush();
      ta = null;
    };
    remoteHandler = onRemote;
  }

  let remoteHandler = null;
  const off = board.on((what) => {
    if (what !== 'doc' && what !== 'all') return;
    if (mode === 'edit') remoteHandler?.();
    else draw();
  });

  body.addEventListener('click', onClick);
  function onClick(e) {
    if (e.target.closest('[data-act="edit"]')) {
      mode = 'edit';
      saved = board.doc?.md ?? '';
      draw();
      ta?.focus();
    }
  }

  draw();
  if (mode === 'edit') ta?.focus();

  return () => {
    off();
    unmountEditor?.();
    body.removeEventListener('click', onClick);
  };
}
