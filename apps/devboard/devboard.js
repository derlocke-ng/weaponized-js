// DevBoard on nostr: a public freelancer noticeboard. Notes are addressable
// events (kind 30810) with NIP-40 expiry and NIP-13 proof of work; votes are
// NIP-25 reactions; reports NIP-56. The suite's account, block list and
// settings apply. See docs/architecture.md for the anti-spam rules.

import { LocalStore } from '../shared/store.js';
import { RelayPool, savedRelays } from '../shared/relays.js';
import { Sync } from '../shared/sync.js';
import { KINDS, now, sign, stamp, addressOf, fingerprint } from '../shared/events.js';
import { loadIdentity, npub } from '../shared/account.js';
import { AccountSettings } from '../shared/settings.js';
import { REPORT_TYPES } from '../shared/moderation.js';
import { minePow, hasPow } from '../shared/pow.js';
import { settingsView } from '../shared/settingsview.js';
import { initAppShell } from '../shared/appshell.js';
import { statusPill } from '../shared/status.js';
import { t, tErr, relTime } from '../shared/i18n.js';
import { $, $$, h, icon, toast, modal, confirmDialog } from '../shared/ui.js';
import { store, randomId } from '../shared/util.js';

// ---- rules ----
const LIMITS = { title: 80, text: 300, tags: 10, tag: 24, rate: 60, contact: 200, perKey: 3, maxDays: 31 };
const POW_POST = Number(store.get('devboard.pow')) || 16; // leading zero bits a note needs: a moment on a phone, hours for a flood
const POW_VOTE = Math.min(8, POW_POST);
const COLLAPSE_SCORE = -5;
const COLLAPSE_REPORTS = 3;
const VOTE_WINDOW = 30_000;
const VOTE_MAX = 10;
const DURATIONS = [1, 3, 7, 14, 30];

const net = { db: null, pool: null, sync: null };
let identity;
let blocks; // the suite's block list (from the app shell)
let people; // friends, circles, sharing (from the app shell)
let prefs; // AccountSettings 'devboard': { saved: [address] }
let shell;

const posts = new Map(); // address -> { address, event, pubkey, id, data, created_at, expires }
const votes = new Map(); // address -> Map(voter -> { v, at })
const reports = new Map(); // address -> Map(reporter -> at)
const revealed = new Set(); // collapsed notes the person opened anyway
const voteTimes = [];
let filter = 'all';
let query = '';
const tagFilters = new Set();
let renderTimer = null;

// ---- events in ----

function parsePost(ev) {
  if (ev.kind !== KINDS.DEVBOARD_POST) return null;
  const address = addressOf(ev);
  if (!address) return null;
  const exp = Number(ev.tags.find((x) => x[0] === 'expiration')?.[1]);
  if (!hasPow(ev, POW_POST)) return null; // no proof of work, no board
  if (!(exp > ev.created_at && exp - ev.created_at <= LIMITS.maxDays * 86_400)) return null;
  let data;
  try {
    data = JSON.parse(ev.content);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  if (data.del) return { address, event: ev, pubkey: ev.pubkey, id: ev.id, created_at: ev.created_at, expires: exp, deleted: true };
  if (!['hiring', 'available'].includes(data.type) || typeof data.title !== 'string' || !data.title.trim()) return null;
  const clean = {
    type: data.type,
    title: String(data.title).slice(0, LIMITS.title),
    text: String(data.text || '').slice(0, LIMITS.text),
    tags: (Array.isArray(data.tags) ? data.tags : [])
      .map((x) => String(x).trim().slice(0, LIMITS.tag))
      .filter(Boolean)
      .slice(0, LIMITS.tags),
    rate: String(data.rate || '').slice(0, LIMITS.rate),
    contact: String(data.contact || '').slice(0, LIMITS.contact),
  };
  return { address, event: ev, pubkey: ev.pubkey, id: ev.id, data: clean, created_at: ev.created_at, expires: exp };
}

function receive(ev) {
  if (ev.kind === KINDS.DEVBOARD_POST) {
    const post = parsePost(ev);
    if (!post) return;
    const cur = posts.get(post.address);
    if (cur && (cur.created_at > post.created_at || (cur.created_at === post.created_at && cur.id < post.id))) return;
    posts.set(post.address, post); // a deletion stays as a tombstone so an older copy cannot bring the note back
    scheduleRender();
  } else if (ev.kind === KINDS.REACTION) {
    const a = ev.tags.find((x) => x[0] === 'a')?.[1];
    const v = ev.content === '+' ? 1 : ev.content === '-' ? -1 : 0;
    if (!a || !v || !hasPow(ev, POW_VOTE)) return;
    if (!votes.has(a)) votes.set(a, new Map());
    const cur = votes.get(a).get(ev.pubkey);
    if (cur && cur.at >= ev.created_at) return;
    votes.get(a).set(ev.pubkey, { v, at: ev.created_at });
    scheduleRender();
  } else if (ev.kind === KINDS.REPORT) {
    const a = ev.tags.find((x) => x[0] === 'a')?.[1];
    if (!a || !hasPow(ev, POW_VOTE)) return;
    if (!reports.has(a)) reports.set(a, new Map());
    reports.get(a).set(ev.pubkey, ev.created_at);
    scheduleRender();
  }
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 60);
}

// ---- scoring & visibility ----

const isBlocked = (pk) => blocks?.isBlocked(pk);

function score(address) {
  let s = 0;
  for (const [voter, { v }] of votes.get(address) || []) if (!isBlocked(voter)) s += v;
  return s;
}

function reportCount(address) {
  let n = 0;
  for (const reporter of (reports.get(address) || new Map()).keys()) if (!isBlocked(reporter) && reporter !== identity.pk) n++;
  return n + ((reports.get(address) || new Map()).has(identity.pk) ? 1 : 0);
}

/** Live, allowed notes with the reason they are collapsed (if any). */
function visiblePosts() {
  const live = [...posts.values()].filter((p) => !p.deleted && p.expires > now() && !isBlocked(p.pubkey));
  // Three live notes per person: the newest ones count.
  const byKey = new Map();
  for (const p of live.sort((a, b) => b.created_at - a.created_at)) {
    const list = byKey.get(p.pubkey) || [];
    list.push(p);
    byKey.set(p.pubkey, list);
  }
  return live.map((p) => {
    const rank = byKey.get(p.pubkey).indexOf(p);
    const s = score(p.address);
    const r = reportCount(p.address);
    const collapsed = rank >= LIMITS.perKey ? 'cap' : r >= COLLAPSE_REPORTS ? 'reports' : s <= COLLAPSE_SCORE ? 'score' : null;
    return { ...p, score: s, reports: r, collapsed: p.pubkey === identity.pk ? null : collapsed };
  });
}

const saved = () => new Set(prefs?.get('saved', []) || []);

/** What the settings prefill and how the board behaves; kept in the account. */
const defaults = () => ({
  type: prefs?.get('type') === 'available' ? 'available' : 'hiring',
  contact: String(prefs?.get('contact') || '').slice(0, LIMITS.contact),
  days: DURATIONS.includes(Number(prefs?.get('days'))) ? Number(prefs.get('days')) : 7,
  showCollapsed: Boolean(prefs?.get('showCollapsed')),
});

// ---- render ----

function render() {
  const main = $('#main');
  const wanted = location.hash.startsWith('#/settings') ? 'settings' : 'board';
  if (main.dataset.view !== wanted) {
    delete main.dataset.ready;
    main.dataset.view = wanted;
  }
  if (wanted === 'settings') {
    if (!main.dataset.ready) {
      main.dataset.ready = '1';
      renderSettings(main);
    }
    return;
  }
  const all = visiblePosts();
  const q = query.trim().toLowerCase();
  const items = all
    .filter((p) => {
      if (filter === 'saved') return saved().has(p.address);
      if (filter === 'friends') return people.isFriend(p.pubkey);
      if (filter !== 'all' && p.data.type !== filter) return false;
      if (q && !`${p.data.title} ${p.data.text} ${p.data.tags.join(' ')} ${p.data.rate}`.toLowerCase().includes(q)) return false;
      for (const tf of tagFilters) if (!p.data.tags.some((x) => x.toLowerCase() === tf)) return false;
      return true;
    })
    .sort((a, b) => (a.collapsed ? 1 : 0) - (b.collapsed ? 1 : 0) || b.score - a.score || b.created_at - a.created_at);
  const tagCounts = new Map();
  for (const p of all) for (const x of p.data.tags) tagCounts.set(x.toLowerCase(), (tagCounts.get(x.toLowerCase()) || 0) + 1);
  const topTags = [...tagCounts].sort((a, b) => b[1] - a[1]).slice(0, 14);
  const mine = all.filter((p) => p.pubkey === identity.pk).length;

  if (!main.dataset.ready) {
    main.dataset.ready = '1';
    main.innerHTML = `
      <div class="toolbar">
        <input class="search" id="search" type="search" placeholder="${h(t('db.search'))}" aria-label="${h(t('db.search'))}" value="${h(query)}">
        <div class="seg" role="radiogroup">
          ${['all', 'hiring', 'available', 'saved', 'friends'].map((f) => `<label><input type="radio" name="filter" value="${f}" ${f === filter ? 'checked' : ''}><span>${h(t(`db.filter.${f}`))}</span></label>`).join('')}
        </div>
        <button type="button" class="btn btn-primary" id="postBtn">${icon('plus')}<span>${h(t('db.post'))}</span></button>
      </div>
      <div class="tagbar" id="tagbar"></div>
      <p class="stats" id="stats"></p>
      <div class="board" id="board"></div>
`;
    $('#footNote').textContent = t('db.footer');
  }
  $('#tagbar').innerHTML = topTags.map(([tag, n]) => `<button type="button" class="chip ${tagFilters.has(tag) ? 'on' : ''}" data-tag="${h(tag)}">${h(tag)} <span class="muted">${n}</span></button>`).join('');
  $('#stats').textContent = `${t('db.stats', { n: all.length })} · ${t('db.statsMatching', { n: items.length })}${mine ? ` · ${t('db.myNotes')}: ${mine}` : ''}`;
  const board = $('#board');
  board.innerHTML = items.length ? items.map(card).join('') : `<p class="empty">${h(all.length ? t('db.emptyFilter') : t('db.empty'))}</p>`;
}

/** DevBoard's own settings, on the settings view every app shares. */
function renderSettings(main) {
  const d = defaults();
  main.innerHTML = settingsView({
    identity,
    title: t('app.settings.title', { app: 'DevBoard' }),
    backLabel: t('db.settings.back'),
    cards: [
      `<div class="card">
        <h2>${icon('pencil')}${h(t('db.settings.defaults'))}</h2>
        <p class="muted small">${h(t('db.settings.defaultsText'))}</p>
        <form class="form" id="defaultsForm">
          <div class="seg" role="radiogroup" aria-label="${h(t('db.compose.iam'))}">
            <label><input type="radio" name="type" value="hiring" ${d.type === 'hiring' ? 'checked' : ''}><span>${h(t('db.compose.hiring'))}</span></label>
            <label><input type="radio" name="type" value="available" ${d.type === 'available' ? 'checked' : ''}><span>${h(t('db.compose.available'))}</span></label>
          </div>
          <label class="field">${h(t('db.compose.contact'))}<input name="contact" maxlength="${LIMITS.contact}" value="${h(d.contact)}" placeholder="${h(t('db.compose.contactPlaceholder'))}"></label>
          <label class="field">${h(t('db.compose.duration'))}<select name="days">${DURATIONS.map((n) => `<option value="${n}" ${n === d.days ? 'selected' : ''}>${h(t(`db.duration.${n}`))}</option>`).join('')}</select></label>
        </form>
      </div>`,
      `<div class="card">
        <h2>${icon('eye')}${h(t('db.settings.board'))}</h2>
        <label class="check-row"><input type="checkbox" id="showCollapsed" ${d.showCollapsed ? 'checked' : ''}><span>${h(t('db.settings.showCollapsed'))}</span></label>
      </div>`,
    ],
    how: [1, 2, 3, 4, 5].map((i) => t(`db.how.${i}`)),
  });
}

function card(p) {
  const mineNote = p.pubkey === identity.pk;
  const my = votes.get(p.address)?.get(identity.pk)?.v || 0;
  const collapsed = p.collapsed && !revealed.has(p.address) && !defaults().showCollapsed;
  const reason = { cap: 'db.collapsedCap', reports: 'db.collapsedReports', score: 'db.collapsedScore' }[p.collapsed];
  return `
    <article class="note ${p.data.type} ${mineNote ? 'mine' : ''} ${collapsed ? 'collapsed' : ''}" data-a="${h(p.address)}">
      ${p.collapsed ? `<div class="note-collapsed">${icon('eye')}<span>${h(t(reason))}</span>${collapsed ? `<button type="button" class="link-btn" data-act="reveal">${h(t('db.showAnyway'))}</button>` : ''}</div>` : ''}
      <div class="note-head">
        <span class="note-type">${h(t(`db.type.${p.data.type}`))}</span>
        <span class="spacer"></span>
        ${p.data.rate ? `<span class="muted small">${h(p.data.rate)}</span>` : ''}
        <button type="button" class="icon-btn" data-act="menu" aria-label="${h(t('db.more'))}">${icon('ellipsis')}</button>
      </div>
      <h3>${h(p.data.title)}</h3>
      ${p.data.text ? `<p>${h(p.data.text)}</p>` : ''}
      ${p.data.tags.length ? `<div class="note-tags">${p.data.tags.map((x) => `<button type="button" class="chip" data-tag="${h(x.toLowerCase())}">${h(x)}</button>`).join('')}</div>` : ''}
      <div class="note-meta">
        <span>${h(t('db.posted', { when: relTime(p.created_at * 1000) }))}</span>
        <span>${h(t('db.expires', { when: relTime(p.expires * 1000) }))}</span>
        <span>${h(t('db.by'))} <code title="${h(npub(p.pubkey))}">${mineNote ? h(t('db.you')) : h(people.nameOf(p.pubkey))}</code></span>
        ${!mineNote && people.isFriend(p.pubkey) ? `<span class="friend-tag">${icon('user-check')}${h(t('people.friend'))}</span>` : ''}
      </div>
      <div class="note-foot">
        <span class="votes">
          <button type="button" data-act="up" class="${my > 0 ? 'on' : ''}" ${mineNote ? `disabled title="${h(t('db.ownVote'))}"` : `aria-label="${h(t('db.up'))}"`}>▲</button>
          <span class="score">${p.score > 0 ? '+' : ''}${p.score}</span>
          <button type="button" data-act="down" class="${my < 0 ? 'on' : ''}" ${mineNote ? 'disabled' : `aria-label="${h(t('db.down'))}"`}>▼</button>
        </span>
        <button type="button" class="btn btn-sm ${saved().has(p.address) ? 'btn-primary' : 'btn-ghost'}" data-act="save">${icon(saved().has(p.address) ? 'pin' : 'pin-off')}<span>${h(saved().has(p.address) ? t('db.unsave') : t('db.save'))}</span></button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm" data-act="contact">${icon('user')}<span>${h(t('db.contact'))}</span></button>
      </div>
    </article>`;
}

// ---- events out ----

/** Mine in the shared workers (every core but one, or the device setting); onProgress gets seconds elapsed, signal cancels. */
const mine = (template, bits, onProgress, signal = null) => minePow(template, bits, { signal, onProgress: ({ ms }) => onProgress?.(Math.round(ms / 1000)) });

async function publishPost(data, { d = randomId(), days = 7, onProgress, signal = null } = {}) {
  if (!net.pool.online) throw new Error(t('db.compose.needRelay'));
  const created = stamp(`${KINDS.DEVBOARD_POST}:${identity.pk}:${d}`); // strictly increasing per note: an edit in the same second still wins
  const template = { kind: KINDS.DEVBOARD_POST, pubkey: identity.pk, created_at: created, tags: [['d', d], ['expiration', String(created + days * 86_400)], ...data.tags.map((x) => ['t', x.toLowerCase()])], content: JSON.stringify(data) };
  const mined = await mine(template, POW_POST, onProgress, signal);
  const event = sign(mined, identity.sk);
  await net.sync.publish(event, { wait: 'one' });
  return event;
}

async function deletePost(p) {
  const created = stamp(p.address);
  const template = { kind: KINDS.DEVBOARD_POST, pubkey: identity.pk, created_at: created, tags: [['d', p.address.split(':')[2]], ['expiration', String(created + 86_400)]], content: JSON.stringify({ del: 1 }) };
  const mined = await mine(template, POW_POST);
  await net.sync.publish(sign(mined, identity.sk));
}

async function vote(p, v) {
  if (p.pubkey === identity.pk) return toast(t('db.ownVote'), 'error');
  const t0 = Date.now();
  while (voteTimes.length && t0 - voteTimes[0] > VOTE_WINDOW) voteTimes.shift();
  if (voteTimes.length >= VOTE_MAX) return toast(t('db.voteLimit'), 'error');
  voteTimes.push(t0);
  const cur = votes.get(p.address)?.get(identity.pk)?.v || 0;
  const content = cur === v ? '' : v > 0 ? '+' : '-'; // voting the same way again takes the vote back
  if (!content) {
    // A reaction with empty content is "no vote" for us: record and publish a neutral one.
    const template = { kind: KINDS.REACTION, pubkey: identity.pk, created_at: stamp(`vote:${p.address}`), tags: [['e', p.id], ['p', p.pubkey], ['a', p.address], ['k', String(KINDS.DEVBOARD_POST)]], content: '' };
    votes.get(p.address)?.delete(identity.pk);
    render();
    return net.sync.publish(sign(await mine(template, POW_VOTE), identity.sk));
  }
  // Votes on one note get strictly increasing timestamps on this device, so changing a vote within a second replaces it everywhere.
  const template = { kind: KINDS.REACTION, pubkey: identity.pk, created_at: stamp(`vote:${p.address}`), tags: [['e', p.id], ['p', p.pubkey], ['a', p.address], ['k', String(KINDS.DEVBOARD_POST)]], content };
  const event = sign(await mine(template, POW_VOTE), identity.sk);
  receive(event);
  await net.sync.publish(event);
}

async function report(p, type, text) {
  const template = { kind: KINDS.REPORT, pubkey: identity.pk, created_at: now(), tags: [['p', p.pubkey, type], ['e', p.id, type], ['a', p.address], ['k', String(KINDS.DEVBOARD_POST)]], content: text.slice(0, 500) };
  const event = sign(await mine(template, POW_VOTE), identity.sk);
  receive(event);
  await net.sync.publish(event, { wait: 'one' });
}

// ---- dialogs ----

function composeDialog(existing = null) {
  const dflt = defaults();
  const d = existing?.data || { type: dflt.type, title: '', text: '', tags: [], rate: '', contact: dflt.contact };
  const mineLive = visiblePosts().filter((p) => p.pubkey === identity.pk).length;
  if (!existing && mineLive >= LIMITS.perKey) return toast(t('db.limit'), 'error', 5000);
  const cancel = new AbortController(); // closing the dialog stops the mining
  const m = modal({
    title: existing ? t('db.compose.editTitle') : t('db.compose.title'),
    wide: true,
    body: `
      <form class="form compose" id="compose">
        <div class="seg" role="radiogroup" aria-label="${h(t('db.compose.iam'))}">
          <label><input type="radio" name="type" value="hiring" ${d.type === 'hiring' ? 'checked' : ''}><span>${h(t('db.compose.hiring'))}</span></label>
          <label><input type="radio" name="type" value="available" ${d.type === 'available' ? 'checked' : ''}><span>${h(t('db.compose.available'))}</span></label>
        </div>
        <label class="field">${h(t('db.compose.titleLabel'))}<input name="title" required maxlength="${LIMITS.title}" value="${h(d.title)}" placeholder="${h(t('db.compose.titlePlaceholder'))}" autofocus></label>
        <label class="field">${h(t('db.compose.text'))}<textarea name="text" rows="3" maxlength="${LIMITS.text}" placeholder="${h(t('db.compose.textPlaceholder'))}">${h(d.text)}</textarea></label>
        <label class="field">${h(t('db.compose.tags'))}<input name="tags" maxlength="200" value="${h(d.tags.join(', '))}" placeholder="${h(t('db.compose.tagsPlaceholder'))}"></label>
        <div class="row">
          <label class="field">${h(t('db.compose.rate'))}<input name="rate" maxlength="${LIMITS.rate}" value="${h(d.rate)}" placeholder="${h(t('db.compose.ratePlaceholder'))}"></label>
          <label class="field">${h(t('db.compose.duration'))}<select name="days">${DURATIONS.map((n) => `<option value="${n}" ${n === dflt.days ? 'selected' : ''}>${h(t(`db.duration.${n}`))}</option>`).join('')}</select></label>
        </div>
        <label class="field">${h(t('db.compose.contact'))}<input name="contact" required maxlength="${LIMITS.contact}" value="${h(d.contact)}" placeholder="${h(t('db.compose.contactPlaceholder'))}"></label>
        <p class="hint">${h(t('db.compose.contactHint'))}</p>
        <p class="pow" id="pow" hidden><span class="spinner"></span><span id="powText"></span></p>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>${h(t('common.cancel'))}</button>
          <button class="btn btn-primary">${h(existing ? t('db.compose.save') : t('db.compose.submit'))}</button>
        </div>
      </form>`,
    onOpen: (el, close) => {
      el.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const data = {
          type: f.type.value,
          title: f.title.value.trim(),
          text: f.text.value.trim(),
          tags: f.tags.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, LIMITS.tags),
          rate: f.rate.value.trim(),
          contact: f.contact.value.trim(),
        };
        if (!data.title) return toast(t('db.compose.titleRequired'), 'error');
        if (!data.text) return toast(t('db.compose.textRequired'), 'error');
        if (!data.contact) return toast(t('db.compose.contactRequired'), 'error');
        const btn = f.querySelector('.btn-primary');
        btn.disabled = true;
        $('#pow', el).hidden = false;
        try {
          await publishPost(data, { d: existing ? existing.address.split(':')[2] : randomId(), days: Number(f.days.value), signal: cancel.signal, onProgress: (s) => ($('#powText', el).textContent = t('db.compose.pow', { s })) });
          close(true);
          toast(t('db.compose.published'), 'success');
        } catch (err) {
          if (err?.code === 'pow.cancelled') return;
          btn.disabled = false;
          $('#pow', el).hidden = true;
          toast(tErr(err), 'error', 6000);
        }
      });
    },
  });
  m.done.then(() => cancel.abort());
  return m.done;
}

function contactDialog(p) {
  modal({
    title: t('db.contactTitle', { title: p.data.title }),
    body: `<div class="contact">${h(p.data.contact)}</div><p class="modal-text">${h(t('db.contactNote'))}</p>
      <div class="modal-actions"><button type="button" class="btn" data-act="copy">${icon('copy')}<span>${h(t('common.copy'))}</span></button><button type="button" class="btn btn-primary" data-close>${h(t('common.close'))}</button></div>`,
    onOpen: (el) => {
      el.querySelector('[data-act=copy]').addEventListener('click', () => navigator.clipboard.writeText(p.data.contact).then(() => toast(t('common.copied', { what: t('db.contact') }), 'success')).catch(() => toast(t('common.copyFailed'), 'error')));
    },
  });
}

function reportDialog(p) {
  modal({
    title: t('db.reportTitle'),
    body: `<form class="form" id="reportForm">
      <p class="modal-text">${h(t('db.reportText'))}</p>
      <label class="field">${h(t('db.reportReason'))}<select name="type">${['spam', 'illegal', 'impersonation', 'other'].map((x) => `<option value="${x}">${h(t(`db.reason.${x}`))}</option>`).join('')}</select></label>
      <label class="field">${h(t('db.reportNote'))}<textarea name="text" rows="2" maxlength="500"></textarea></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>${h(t('common.cancel'))}</button><button class="btn btn-danger">${h(t('db.reportSend'))}</button></div></form>`,
    onOpen: (el, close) => {
      el.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('.btn-danger');
        btn.disabled = true;
        try {
          await report(p, REPORT_TYPES.includes(e.target.type.value) ? e.target.type.value : 'other', e.target.text.value);
          close(true);
          toast(t('db.reported'), 'success');
        } catch (err) {
          btn.disabled = false;
          toast(tErr(err), 'error');
        }
      });
    },
  });
}

function noteMenu(anchor, p) {
  const mineNote = p.pubkey === identity.pk;
  const items = mineNote
    ? [
        { label: t('db.edit'), icon: 'pencil', run: () => composeDialog(p) },
        { label: t('db.delete'), icon: 'trash-2', danger: true, run: async () => (await confirmDialog({ title: t('db.deleteConfirm'), confirm: t('common.delete'), danger: true })) && deletePost(p).catch((err) => toast(tErr(err), 'error')) },
      ]
    : [
        ...(people.isFriend(p.pubkey)
          ? []
          : [{ label: t('people.add'), icon: 'user-plus', run: () => people.request(p.pubkey).then((r) => toast(t(r === 'friends' ? 'people.friend' : 'people.requested'), 'success')).catch((err) => toast(tErr(err), 'error')) }]),
        { label: t('db.report'), icon: 'shield', run: () => reportDialog(p) },
        { label: t('db.block'), icon: 'x', danger: true, run: () => blocks.block(p.pubkey).then(() => toast(t('db.blocked'), 'success')).catch((err) => toast(tErr(err), 'error')) },
      ];
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items.map((it, i) => `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon)}<span>${h(it.label)}</span></button>`).join('');
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${r.bottom + window.scrollY + 6}px`;
  menu.style.left = `${Math.max(8, Math.min(r.right + window.scrollX - menu.offsetWidth, document.documentElement.clientWidth - menu.offsetWidth - 8))}px`;
  const closeMenu = () => {
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
  };
  const outside = (e) => !menu.contains(e.target) && closeMenu();
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    closeMenu();
    items[Number(b.dataset.i)].run();
  });
}

// ---- wiring ----

function onClick(e) {
  if (e.target.closest('#postBtn')) return composeDialog();
  const chip = e.target.closest('[data-tag]');
  if (chip) {
    const tag = chip.dataset.tag;
    if (tagFilters.has(tag)) tagFilters.delete(tag);
    else tagFilters.add(tag);
    return render();
  }
  const note = e.target.closest('.note');
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!note || !act) return;
  const p = visiblePosts().find((x) => x.address === note.dataset.a);
  if (!p) return;
  if (act === 'reveal') {
    revealed.add(p.address);
    render();
  }
  if (act === 'up') vote(p, 1).catch((err) => toast(tErr(err), 'error'));
  if (act === 'down') vote(p, -1).catch((err) => toast(tErr(err), 'error'));
  if (act === 'contact') contactDialog(p);
  if (act === 'menu') noteMenu(e.target.closest('[data-act]'), p);
  if (act === 'save') {
    const list = saved();
    if (list.has(p.address)) list.delete(p.address);
    else list.add(p.address);
    prefs.set({ saved: [...list] }).catch((err) => toast(tErr(err), 'error'));
    render();
  }
}

async function boot() {
  net.db = await LocalStore.open('wjs');
  net.pool = new RelayPool(savedRelays());
  net.sync = new Sync(net.pool, net.db);
  identity = loadIdentity();
  shell = await initAppShell({
    app: 'devboard',
    net,
    brand: { href: '#/' },
    right: () => statusPill({ href: '../settings.html#relays' }),
    account: { href: '#/settings' },
  });
  shell.onLanguage(() => {
    delete $('#main').dataset.ready;
    render();
  });
  blocks = shell.blocks;
  people = shell.people;
  blocks.onChange(render);
  people.onChange(render);
  prefs = await new AccountSettings(identity, net, 'devboard').start();
  prefs.onChange(render);
  const since = now() - LIMITS.maxDays * 86_400;
  const filters = [{ kinds: [KINDS.DEVBOARD_POST], since }, { kinds: [KINDS.REACTION, KINDS.REPORT], '#k': [String(KINDS.DEVBOARD_POST)], since }];
  for (const ev of await net.db.query(filters)) receive(ev);
  net.db.subscribe(receive);
  net.pool.subscribe(filters, { onevent: (ev) => net.db.put(ev) });
  net.sync.watch([identity.pk]);
  render();
  $('#main').addEventListener('click', onClick);
  $('#main').addEventListener('input', (e) => {
    if (e.target.id === 'search') {
      query = e.target.value;
      render();
    }
  });
  $('#main').addEventListener('change', (e) => {
    const form = e.target.closest('#defaultsForm');
    if (e.target.name === 'filter') {
      filter = e.target.value;
      render();
    } else if (form) {
      prefs
        .set({ type: form.type.value, contact: form.contact.value.trim().slice(0, LIMITS.contact), days: Number(form.days.value) })
        .then(() => toast(t('db.settings.saved'), 'success'))
        .catch((err) => toast(tErr(err), 'error'));
    } else if (e.target.id === 'showCollapsed') {
      prefs.set({ showCollapsed: e.target.checked }).catch((err) => toast(tErr(err), 'error'));
    }
  });
  window.addEventListener('hashchange', render);
  setInterval(render, 60_000); // "expires in …" and expired notes
}

boot().catch((err) => {
  console.error(err);
  toast(err.message, 'error');
});
