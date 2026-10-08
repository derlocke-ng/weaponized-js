import { Room, createGun, randomSecret, relaysUp, b64url, sha256, DEFAULT_RELAYS } from '../shared/p2p.js';
import { qrSvg } from '../shared/qr.js';
import { CHUNK, chunkLength, hashBlob, rootOf, fingerprint, formatBytes, Meter } from './transfer.js';
import { initAppShell } from '../shared/appshell.js';

// The suite's top bar (switcher, theme, language) before anything else draws.
await initAppShell({
  current: 'payload',
  sprite: '../icons.svg',
  brand: { href: './', name: 'Payload', mark: '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8"/><path d="M9 16h12m-5-5 5 5-5 5"/></svg>' },
  right: '<span class="relays" id="relays" title="Relays used to find each other"><span class="dot"></span><span id="relayText">…</span></span>',
});

const $ = (sel, root = document) => root.querySelector(sel);
const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const main = $('#main');

function setting(key) {
  try {
    return JSON.parse(localStorage.getItem(`payload.${key}`));
  } catch {
    return null;
  }
}
const relayList = setting('relays') || DEFAULT_RELAYS;
const forceRelay = new URLSearchParams(location.search).has('relay') || setting('forceRelay') === true;
const gun = createGun(relayList);

function deviceName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

/** One fingerprint for a set of files, so both sides can compare a single code. */
async function setFingerprint(roots) {
  return fingerprint(b64url(await sha256(new TextEncoder().encode(roots.join('.')))));
}

const pct = (a, b) => (b ? Math.min(100, Math.floor((a / b) * 100)) : 100);
const kindLabel = (kind) => (kind === 'direct' ? 'Direct P2P' : 'Via gun relays');

function relayStatus() {
  const up = relaysUp(gun);
  const el = $('#relays');
  el.dataset.state = up ? 'on' : 'off';
  $('#relayText').textContent = `${up}/${relayList.length}`;
  el.title = up ? `Connected to ${up} of ${relayList.length} relays` : 'No relay reachable — you can’t find each other right now';
}
setInterval(relayStatus, 1500);
relayStatus();

// ---------------------------------------------------------------- sending

function sendView() {
  document.title = 'Payload — browser-to-browser file transfer';
  main.innerHTML = `
    <section class="intro">
      <h1>Send files straight to another browser.</h1>
      <p>Both of you keep this page open. Files go directly between the two browsers when the network allows — otherwise encrypted through gun relays — and every 64 KB piece is checked with SHA-256 on arrival.</p>
    </section>
    <label class="drop" id="drop">
      <input type="file" id="files" multiple hidden>
      <svg class="drop-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m-5 5 5-5 5 5M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>
      <strong>Drop files here</strong>
      <span>or click to choose · nothing is uploaded until someone opens your link</span>
    </label>
    <form class="open-link" id="openLink">
      <input name="link" placeholder="Got a link? Paste it here" autocomplete="off" spellcheck="false" aria-label="Payload link">
      <button class="btn">Receive</button>
    </form>`;
  const drop = $('#drop');
  $('#files').addEventListener('change', (e) => e.target.files.length && startSending(e.target.files));
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer.files.length) startSending(e.dataTransfer.files);
  });
  $('#openLink').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.target.link.value.trim();
    const secret = v.includes('#') ? v.slice(v.indexOf('#') + 1) : v;
    if (/^[\w-]{22}$/.test(secret)) location.hash = secret;
  });
}

async function startSending(fileList) {
  const files = [...fileList];
  const total = files.reduce((s, f) => s + f.size, 0);
  main.innerHTML = `
    <section class="card">
      <h2>Fingerprinting…</h2>
      <p class="muted">Hashing ${files.length === 1 ? h(files[0].name) : `${files.length} files`} (${formatBytes(total)}) so the other side can check every piece.</p>
      <div class="bar"><span id="prep"></span></div>
    </section>`;
  const prepared = [];
  let done = 0;
  for (const file of files) {
    const { hashes, root } = await hashBlob(file, (p) => ($('#prep').style.width = `${pct(done + p * file.size, total)}%`));
    done += file.size;
    prepared.push({ file, name: file.name, size: file.size, type: file.type || 'application/octet-stream', chunks: hashes.length, hashes, root });
  }
  const secret = randomSecret(16);
  const room = new Room(gun, { secret, role: 'sender', name: deviceName(), forceRelay });
  await room.join();
  const link = `${location.href.split('#')[0]}#${secret}`;
  const fp = await setFingerprint(prepared.map((f) => f.root));
  const manifest = { t: 'manifest', name: room.name, chunk: CHUNK, files: prepared.map(({ name, size, type, chunks, root }) => ({ name, size, type, chunks, root })) };
  const receivers = new Map();
  let wake = null;
  navigator.wakeLock?.request('screen').then((w) => (wake = w)).catch(() => {});

  main.innerHTML = `
    <section class="card">
      <h2>Ready to send</h2>
      ${fileListHtml(prepared)}
      <div class="copy-field">
        <input id="link" readonly value="${h(link)}" aria-label="Link for the receiver" spellcheck="false">
        <button type="button" class="btn btn-primary" id="copy">Copy link</button>
      </div>
      <div class="row">
        ${navigator.share ? '<button type="button" class="btn" id="share">Share…</button>' : ''}
        <button type="button" class="btn" id="showQr">QR code</button>
      </div>
      <div class="qr-box" id="qrBox" hidden>${qrSvg(link)}</div>
      <p class="fp">Fingerprint <code>${h(fp)}</code> — the receiver sees the same code.</p>
      <p class="note">Keep this tab open until they’re done: files go straight from here to them. Anyone with the link can download the files while you share.</p>
    </section>
    <section class="card">
      <h2>Receivers</h2>
      <ul class="receivers" id="receivers"><li class="muted">Nobody yet — send them the link.</li></ul>
      <button type="button" class="btn btn-danger" id="stop">Stop sharing</button>
    </section>`;
  $('#link').addEventListener('focus', (e) => e.target.select());
  $('#copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(link).catch(() => {});
    $('#copy').textContent = 'Copied';
    setTimeout(() => ($('#copy').textContent = 'Copy link'), 1500);
  });
  $('#share')?.addEventListener('click', () => navigator.share({ title: 'Payload', url: link }).catch(() => {}));
  $('#showQr').addEventListener('click', () => ($('#qrBox').hidden = !$('#qrBox').hidden));
  $('#stop').addEventListener('click', () => {
    room.leave();
    wake?.release().catch(() => {});
    sendView();
  });

  const drawReceivers = () => {
    const ul = $('#receivers');
    if (!ul) return;
    if (!receivers.size) return;
    ul.innerHTML = [...receivers.values()]
      .map((r) => {
        const state = r.state === 'done' ? '✓ Received and verified' : r.state === 'gone' ? 'Disconnected' : r.got ? `${formatBytes(r.got)} of ${formatBytes(total)} · ${formatBytes(r.meter.rate())}/s` : 'Connected';
        return `<li>
          <div class="rcv-line"><b>${h(r.name)}</b><span class="tag">${kindLabel(r.kind)}</span><span class="rcv-state">${h(state)}</span></div>
          <div class="bar ${r.state === 'done' ? 'ok' : ''}"><span style-width="${pct(r.got, total)}"></span></div>
        </li>`;
      })
      .join('');
    ul.querySelectorAll('[style-width]').forEach((el) => (el.style.width = `${el.getAttribute('style-width')}%`));
  };
  setInterval(drawReceivers, 1000);

  room.on('channel', (ch) => {
    const r = { name: ch.peerInfo.name || 'Receiver', kind: ch.kind, got: 0, state: 'connected', meter: new Meter() };
    receivers.set(ch.cid, r);
    drawReceivers();
    let corrupted = false;
    ch.on('message', async (msg) => {
      if (msg.t === 'hello') {
        r.name = String(msg.name || r.name).slice(0, 60);
        ch.send(manifest);
      } else if (msg.t === 'get') {
        const f = prepared[msg.f];
        const len = f ? chunkLength(f.size, msg.i) : -1;
        if (len < 0) return ch.send({ t: 'error', message: 'No such piece' });
        let bytes = new Uint8Array(await f.file.slice(msg.i * CHUNK, msg.i * CHUNK + len).arrayBuffer());
        // Test hook: corrupt the first piece once to prove receivers catch it.
        if (globalThis.__payloadTest?.corruptFirstChunk && !corrupted && msg.i === 0 && bytes.length) {
          corrupted = true;
          bytes = bytes.slice();
          bytes[0] ^= 0xff;
        }
        await ch.drain();
        ch.send({ t: 'chunk', f: msg.f, i: msg.i, h: b64url(f.hashes[msg.i]) }, bytes);
      } else if (msg.t === 'progress') {
        const got = Math.max(0, Math.min(total, Number(msg.got) || 0));
        r.meter.add(Math.max(0, got - r.got));
        r.got = got;
        r.state = 'receiving';
      } else if (msg.t === 'done') {
        r.got = total;
        r.state = 'done';
        drawReceivers();
      }
    });
    ch.on('close', () => {
      if (r.state !== 'done') r.state = 'gone';
      drawReceivers();
    });
  });
}

function fileListHtml(files) {
  return `<ul class="files">${files
    .map(
      (f, i) => `<li data-file="${i}">
        <span class="file-name">${h(f.name)}</span>
        <span class="file-size">${formatBytes(f.size)}</span>
        <span class="file-state"></span>
      </li>`,
    )
    .join('')}</ul>`;
}

// ---------------------------------------------------------------- receiving

async function receiveView(secret) {
  document.title = 'Receiving · Payload';
  main.innerHTML = `
    <section class="card" id="recv">
      <div class="state"><span class="spinner"></span><p id="status">Looking for the sender…</p></div>
    </section>`;
  const status = (text) => {
    const el = $('#status');
    if (el) el.textContent = text;
  };
  const room = new Room(gun, { secret, role: 'receiver', name: deviceName(), forceRelay });
  await room.join();

  const ctx = { ch: null, manifest: null, parts: [], hashes: [], got: 0, meter: new Meter(), handler: null, started: false, finished: false };

  /** Find the sender, connect and get the manifest; again after a lost connection. */
  async function connectToSender() {
    let waiting = setTimeout(() => status('Waiting for the sender. Their Payload tab has to be open — files go straight from their browser to yours.'), 8000);
    const sender = await new Promise((resolve) => {
      const find = () => [...room.peers.values()].find((p) => p.role === 'sender');
      const found = find();
      if (found) return resolve(found);
      const off = room.on('peer', () => {
        const p = find();
        if (p) {
          off();
          resolve(p);
        }
      });
    });
    clearTimeout(waiting);
    status(`Connecting to ${sender.name || 'the sender'}…`);
    const ch = await room.connect(sender.id);
    const manifest = await new Promise((resolve, reject) => {
      const off = ch.on('message', (msg) => {
        if (msg.t === 'manifest') {
          off();
          clearInterval(again);
          resolve(msg);
        }
      });
      const hello = () => ch.send({ t: 'hello', name: room.name });
      hello();
      const again = setInterval(hello, 3000); // relay channels are best effort
      ch.on('close', () => {
        clearInterval(again);
        reject(new Error('The connection closed'));
      });
    });
    ch.on('message', (msg, bytes) => {
      if (msg.t === 'chunk') ctx.handler?.(msg, bytes);
      if (msg.t === 'error') console.warn('sender:', msg.message);
    });
    ch.on('close', () => {
      if (ctx.finished) return;
      ctx.ch = null;
      if (ctx.started) status('Connection lost — reconnecting…');
      reconnect();
    });
    ctx.ch = ch;
    ctx.sender = sender;
    return manifest;
  }

  async function reconnect() {
    for (;;) {
      try {
        const manifest = await connectToSender();
        if (ctx.manifest && manifest.files.map((f) => f.root).join() !== ctx.manifest.files.map((f) => f.root).join()) {
          return fail('The sender is sharing different files now. Ask for a new link.');
        }
        ctx.manifest ||= manifest;
        drawReady();
        ctx.resume?.();
        return;
      } catch (err) {
        console.info('payload: reconnecting', err.message);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  function fail(message) {
    ctx.finished = true;
    const el = $('#error');
    if (el) {
      el.hidden = false;
      el.textContent = message;
    } else status(message);
  }

  async function drawReady() {
    const m = ctx.manifest;
    const total = m.files.reduce((s, f) => s + f.size, 0);
    ctx.total = total;
    if ($('#ready')) {
      $('#peerKind').textContent = kindLabel(ctx.ch.kind);
      return;
    }
    const fp = await setFingerprint(m.files.map((f) => f.root));
    $('#recv').innerHTML = `
      <div id="ready">
        <p class="from">From <b>${h(m.name || ctx.sender.name || 'the sender')}</b> <span class="tag" id="peerKind">${kindLabel(ctx.ch.kind)}</span></p>
        ${fileListHtml(m.files)}
        <p class="fp">Fingerprint <code>${h(fp)}</code> — ask the sender if theirs matches.</p>
        <div class="bar" id="totalBar"><span></span></div>
        <p class="muted" id="rate"></p>
        <p class="error" id="error" hidden></p>
        <button type="button" class="btn btn-primary" id="go">Download ${m.files.length === 1 ? '' : `${m.files.length} files `}(${formatBytes(total)})</button>
      </div>`;
    $('#go').addEventListener('click', start);
  }

  async function start() {
    if (ctx.started) return;
    ctx.started = true;
    $('#go').hidden = true;
    const m = ctx.manifest;
    const tick = setInterval(() => {
      $('#totalBar span').style.width = `${pct(ctx.got, ctx.total)}%`;
      $('#rate').textContent = `${formatBytes(ctx.got)} of ${formatBytes(ctx.total)} · ${formatBytes(ctx.meter.rate())}/s · ${kindLabel(ctx.ch?.kind)}`;
      ctx.ch?.send({ t: 'progress', got: ctx.got });
    }, 500);
    try {
      for (let fi = 0; fi < m.files.length; fi++) {
        const row = $(`[data-file="${fi}"] .file-state`);
        row.textContent = 'receiving…';
        const blob = await fetchFile(fi, m.files[fi]);
        row.innerHTML = '<span class="ok">✓ verified</span> <button type="button" class="link-btn">save again</button>';
        const url = URL.createObjectURL(blob);
        const save = () => {
          const a = Object.assign(document.createElement('a'), { href: url, download: m.files[fi].name });
          document.body.append(a);
          a.click();
          a.remove();
        };
        row.querySelector('button').addEventListener('click', save);
        save();
      }
      ctx.finished = true;
      ctx.ch?.send({ t: 'progress', got: ctx.total });
      ctx.ch?.send({ t: 'done' });
      $('#totalBar').classList.add('ok');
      $('#rate').textContent = `All ${m.files.length === 1 ? 'done' : `${m.files.length} files done`} — every piece matched its SHA-256 hash.`;
    } catch (err) {
      fail(err.message);
    } finally {
      clearInterval(tick);
      $('#totalBar span') && ($('#totalBar span').style.width = `${pct(ctx.got, ctx.total)}%`);
    }
    setTimeout(() => room.leave(), 3000);
  }

  /** Pull one file in pieces, checking each against its hash, then the root. */
  function fetchFile(fi, meta) {
    const n = meta.chunks;
    const parts = (ctx.parts[fi] ||= new Array(n));
    const hashes = (ctx.hashes[fi] ||= new Array(n));
    const inflight = new Map(); // i -> { at, tries }
    let have = parts.filter(Boolean).length;
    let next = 0;
    let bad = 0;
    return new Promise((resolve, reject) => {
      const windowSize = () => (ctx.ch?.kind === 'direct' ? 32 : 8);
      const wait = () => (ctx.ch?.kind === 'direct' ? 10_000 : 25_000);
      const request = (i) => {
        const tries = (inflight.get(i)?.tries || 0) + 1;
        if (tries > 12) return finish(new Error(`Piece ${i + 1} of “${meta.name}” never arrived intact.`));
        inflight.set(i, { at: Date.now(), tries });
        ctx.ch?.send({ t: 'get', f: fi, i });
      };
      const pump = () => {
        while (inflight.size < windowSize() && next < n) {
          if (!parts[next]) request(next);
          next++;
        }
        if (have === n) finish();
      };
      ctx.handler = async (msg, bytes) => {
        if (msg.f !== fi || parts[msg.i] || !inflight.has(msg.i)) return;
        const data = bytes || new Uint8Array(0);
        const digest = await sha256(data);
        if (data.length !== chunkLength(meta.size, msg.i) || b64url(digest) !== msg.h) {
          bad++;
          console.warn(`payload: piece ${msg.i} failed its hash check, asking again`);
          return request(msg.i);
        }
        if (parts[msg.i]) return;
        parts[msg.i] = data;
        hashes[msg.i] = digest;
        inflight.delete(msg.i);
        have++;
        ctx.got += data.length;
        ctx.meter.add(data.length);
        pump();
      };
      ctx.resume = () => {
        for (const v of inflight.values()) v.at = 0;
      };
      const timer = setInterval(() => {
        if (!ctx.ch) return;
        for (const [i, v] of inflight) if (Date.now() - v.at > wait()) request(i);
      }, 1000);
      let ended = false;
      const finish = async (err) => {
        if (ended) return;
        ended = true;
        clearInterval(timer);
        ctx.handler = null;
        if (err) return reject(err);
        const root = await rootOf(hashes);
        if (root !== meta.root) return reject(new Error(`“${meta.name}” failed verification. Nothing was saved.`));
        if (bad) console.info(`payload: ${bad} damaged piece(s) were fetched again`);
        resolve(new Blob(parts, { type: meta.type || 'application/octet-stream' }));
      };
      pump();
    });
  }

  await reconnect();
}

// ---------------------------------------------------------------- start

const secret = location.hash.slice(1);
if (/^[\w-]{22}$/.test(secret)) receiveView(secret);
else sendView();
addEventListener('hashchange', () => location.reload());
