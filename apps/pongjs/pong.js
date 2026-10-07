// PONG.JS — two browsers find each other over gun (a link, a QR code or the
// open-games lobby) and play over a direct WebRTC data channel, or through
// gun when no direct path exists. The host runs the game; the guest sends its
// paddle and draws the host's snapshots, predicting the ball in between.

import { Room, createGun, randomSecret, relaysUp, DEFAULT_RELAYS } from '../shared/p2p.js';
import { qrSvg } from '../shared/qr.js';
import { W, H, PW, PH, PX, BALL, WIN, PADDLE_SPEED, clampPaddle, newGame, step, cpuMove, snapshot, extrapolate } from './game.js';

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('../sw.js').catch(() => {});

const $ = (id) => document.getElementById(id);
const LOBBY = 'wjs-pong-lobby-1';
const DT = 1 / 120;

function setting(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(`pong.${key}`)) ?? fallback;
  } catch {
    return fallback;
  }
}
const save = (key, value) => {
  try {
    localStorage.setItem(`pong.${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

const relayList = setting('relays') || DEFAULT_RELAYS;
const forceRelay = new URLSearchParams(location.search).has('relay') || setting('forceRelay') === true;
const gun = createGun(relayList);

// ------------------------------------------------------------- screens

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  document.body.dataset.screen = id;
}

const nameInput = $('name');
nameInput.value = setting('name', '') || '';
nameInput.addEventListener('input', () => save('name', nameInput.value.trim().toUpperCase()));
const myName = () => (nameInput.value.trim().toUpperCase() || 'PLAYER').slice(0, 12);
const clean = (s, fallback) => (String(s || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().toUpperCase() || fallback).slice(0, 12);

setInterval(() => {
  const up = relaysUp(gun);
  $('relays').textContent = `RELAYS ${up}/${relayList.length}`;
  $('relays').className = up ? '' : 'dim';
}, 1500);

// ------------------------------------------------------------- sound

let audio = null;
let muted = setting('mute', false);
function beep(freq, ms = 60, vol = 0.05) {
  if (muted) return;
  try {
    audio ||= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch {
    /* no audio */
  }
}
function drawMute() {
  $('muteBtn').textContent = muted ? '[SOUND OFF]' : '[SOUND ON]';
}
$('muteBtn').addEventListener('click', () => {
  muted = !muted;
  save('mute', muted);
  drawMute();
});
drawMute();

// ------------------------------------------------------------- input

const input = { up: false, down: false, target: null };
const KEYS = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (KEYS[e.key] && session) {
    e.preventDefault();
    input[KEYS[e.key]] = true;
    input.target = null;
  }
  if (e.key === 'm' || e.key === 'M') $('muteBtn').click();
});
addEventListener('keyup', (e) => {
  if (KEYS[e.key]) input[KEYS[e.key]] = false;
});
addEventListener('blur', () => (input.up = input.down = false));

const canvas = $('pong');
function pointerTarget(e) {
  const r = canvas.getBoundingClientRect();
  input.target = clampPaddle(((e.clientY - r.top) / r.height) * H - PH / 2);
}
canvas.addEventListener('pointermove', (e) => (e.pointerType === 'mouse' || e.buttons) && pointerTarget(e));
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointerTarget(e);
});
for (const [id, key] of [
  ['upBtn', 'up'],
  ['downBtn', 'down'],
]) {
  const b = $(id);
  const on = (e) => {
    e.preventDefault();
    input[key] = true;
    input.target = null;
  };
  const off = () => (input[key] = false);
  b.addEventListener('pointerdown', on);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, off);
}

/** Move the local paddle: keys at paddle speed, pointer a bit faster but not instantly. */
function steer(y, dt) {
  if (input.up || input.down) return clampPaddle(y + ((input.down ? 1 : 0) - (input.up ? 1 : 0)) * PADDLE_SPEED * dt);
  if (input.target == null) return y;
  const max = PADDLE_SPEED * 2.2 * dt;
  return clampPaddle(y + Math.max(-max, Math.min(max, input.target - y)));
}

// ------------------------------------------------------------- session

/**
 * mode: 'cpu' | 'host' | 'guest'. The local player is left for cpu/host and
 * right for the guest.
 */
let session = null;
let room = null;
let lobbyTimer = null;

function begin(mode, opts = {}) {
  session = {
    mode,
    side: mode === 'guest' ? 'r' : 'l',
    s: newGame(),
    names: opts.names,
    ch: opts.ch || null,
    remoteY: (H - PH) / 2,
    snap: null,
    snapAt: 0,
    lastSend: 0,
    lastY: null,
    seq: 0,
    rtt: null,
    counters: { h: 0, k: 0, p: 0 },
    acc: 0,
  };
  input.target = null;
  if (globalThis.__pongTest) globalThis.__pongTest.session = session; // read-only view for the e2e test
  $('leftName').textContent = session.names.l;
  $('rightName').textContent = session.names.r;
  $('overlay').hidden = true;
  show('game');
  drawNet();
}

function end() {
  if (session?.ch) {
    clearInterval(session.pinger);
    session.ch.close('left');
  }
  session = null;
  stopLobby();
  room?.leave();
  room = null;
  history.replaceState(null, '', location.pathname + location.search);
  show('menu');
}

function drawNet() {
  if (!session) return;
  const el = $('netInfo');
  if (session.mode === 'cpu') el.textContent = 'PRACTICE';
  else el.textContent = `${session.ch?.kind === 'direct' ? 'DIRECT' : 'VIA RELAY'}${session.rtt != null ? ` · ${session.rtt} MS` : ''}`;
}

function overlay(html, buttons) {
  const o = $('overlay');
  o.innerHTML = `<div>${html}</div><div class="buttons">${buttons.map(([id, label]) => `<button type="button" data-act="${id}">${label}</button>`).join('')}</div>`;
  o.hidden = false;
}

$('overlay').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'rematch') rematch();
  if (act === 'menu') end();
  if (act === 'wait') waitAgain();
});
$('menuBtn').addEventListener('click', end);

function rematch() {
  if (!session) return;
  $('overlay').hidden = true;
  if (session.mode === 'guest') session.ch?.send({ t: 'rematch' });
  else {
    session.s = newGame();
    session.counters = { h: 0, k: 0, p: 0 };
  }
}

// ------------------------------------------------------------- networking

function wire(ch) {
  session.ch = ch;
  ch.on('message', onMessage);
  ch.on('close', () => {
    if (!session || session.ch !== ch) return;
    clearInterval(session.pinger);
    session.ch = null;
    beep(110, 300);
    overlay(
      '<h2>OPPONENT LEFT</h2>',
      session.mode === 'host'
        ? [
            ['wait', '[WAIT FOR A NEW PLAYER]'],
            ['menu', '[MENU]'],
          ]
        : [['menu', '[MENU]']],
    );
  });
  session.pinger = setInterval(() => ch.send({ t: 'ping', ts: performance.now() }), 2000);
}

function onMessage(msg) {
  if (!session) return;
  if (msg.t === 'ping') return session.ch?.send({ t: 'pong', ts: msg.ts });
  if (msg.t === 'pong') {
    session.rtt = Math.round(performance.now() - msg.ts);
    return drawNet();
  }
  if (session.mode === 'host') {
    if (msg.t === 'p') session.remoteY = clampPaddle(Number(msg.y) || 0);
    else if (msg.t === 'rematch' && session.s.ph === 'over') rematch();
    else if (msg.t === 'hello') session.ch?.send({ t: 'start', name: myName() });
  } else if (msg.t === 's' && msg.n > (session.snap?.n ?? -1)) {
    session.snap = msg;
    session.snapAt = performance.now();
  }
}

// Host: open a room, show the link, wait for a guest.
async function hostGame() {
  room?.leave();
  const secret = randomSecret(16);
  room = new Room(gun, { secret, role: 'host', name: myName(), forceRelay, channel: { ordered: true } });
  await room.join();
  room.secret = secret;
  const link = `${location.href.split('#')[0]}#${secret}`;
  $('link').value = link;
  $('qr').innerHTML = qrSvg(link);
  show('wait');
  publishLobby();
  room.on('channel', (ch) => {
    if (session?.ch?.open) {
      ch.send({ t: 'full' });
      setTimeout(() => ch.close('full'), 500);
      return;
    }
    const off = ch.on('message', (msg) => {
      if (msg.t !== 'hello' || (session?.ch?.open && session.ch !== ch)) return;
      off();
      stopLobby();
      const guest = clean(msg.name, 'PLAYER 2');
      ch.send({ t: 'start', name: myName() });
      if (session?.mode === 'host') {
        // A new player after the last one left: keep the session, reset the game.
        session.names.r = guest;
        $('rightName').textContent = guest;
        session.s = newGame();
        $('overlay').hidden = true;
      } else begin('host', { names: { l: myName(), r: guest } });
      wire(ch);
      drawNet();
      beep(660, 120);
    });
  });
}

function waitAgain() {
  $('overlay').hidden = true;
  if (!room) return end();
  overlay('<h2>WAITING FOR A NEW PLAYER<span class="blink">_</span></h2><p class="dim">SAME LINK AS BEFORE</p>', [['menu', '[MENU]']]);
  if ($('listPublic').checked) publishLobby();
}

function publishLobby() {
  stopLobby();
  const put = () => {
    if (!room || !$('listPublic').checked) return;
    gun.get(LOBBY).get(room.peerId).put(JSON.stringify({ name: myName(), secret: room.secret, t: Date.now() }));
  };
  put();
  lobbyTimer = setInterval(put, 4000);
}

function stopLobby() {
  clearInterval(lobbyTimer);
  lobbyTimer = null;
  if (room?.peerId) gun.get(LOBBY).get(room.peerId).put(null);
}

$('listPublic').checked = setting('listPublic', false);
$('listPublic').addEventListener('change', () => {
  save('listPublic', $('listPublic').checked);
  if ($('listPublic').checked) publishLobby();
  else stopLobby();
});

// Guest: find the host of a link and connect.
async function joinGame(secret) {
  room?.leave();
  show('joining');
  const status = (t) => ($('joinStatus').textContent = t);
  status('LOOKING FOR THE HOST…');
  room = new Room(gun, { secret, role: 'guest', name: myName(), forceRelay, channel: { ordered: true } });
  const mine = room;
  await room.join();
  const slow = setTimeout(() => status('WAITING FOR THE HOST — THEIR GAME HAS TO BE OPEN.'), 8000);
  const host = await new Promise((resolve) => {
    const find = () => [...mine.peers.values()].find((p) => p.role === 'host');
    if (find()) return resolve(find());
    const off = mine.on('peer', () => find() && (off(), resolve(find())));
  });
  clearTimeout(slow);
  if (room !== mine) return;
  status(`CONNECTING TO ${clean(host.name, 'HOST')}…`);
  const ch = await mine.connect(host.id);
  if (room !== mine) return ch.close();
  const hello = () => ch.send({ t: 'hello', name: myName() });
  hello();
  const again = setInterval(hello, 2000);
  ch.on('message', function first(msg) {
    if (msg.t === 'full') {
      clearInterval(again);
      status('THIS GAME IS ALREADY FULL.');
    }
    if (msg.t !== 'start' || session) return;
    clearInterval(again);
    begin('guest', { names: { l: clean(msg.name, 'HOST'), r: myName() } });
    wire(ch);
    beep(660, 120);
  });
  ch.on('close', () => clearInterval(again));
}

$('hostBtn').addEventListener('click', () => hostGame());
$('cpuBtn').addEventListener('click', () => begin('cpu', { names: { l: myName(), r: 'CPU' } }));
$('cancelWait').addEventListener('click', end);
$('cancelJoin').addEventListener('click', end);
$('copyLink').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('link').value).catch(() => {});
  $('copyLink').textContent = '[COPIED]';
  setTimeout(() => ($('copyLink').textContent = '[COPY]'), 1500);
});
$('link').addEventListener('focus', (e) => e.target.select());
$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = e.target.code.value.trim();
  const secret = v.includes('#') ? v.slice(v.indexOf('#') + 1) : v;
  if (/^[\w-]{22}$/.test(secret)) location.hash = secret;
  else e.target.code.value = '';
});

// Open games: hosts who chose to be listed, seen in the last few seconds.
const lobby = new Map();
gun
  .get(LOBBY)
  .map()
  .on((v, k) => {
    if (v == null) return lobby.delete(k);
    try {
      const g = JSON.parse(v);
      if (/^[\w-]{22}$/.test(g.secret)) lobby.set(k, { name: clean(g.name, 'HOST'), secret: g.secret, t: Number(g.t) || 0 });
    } catch {
      /* not a game */
    }
  });
setInterval(() => {
  const ul = $('lobby');
  const fresh = [...lobby.values()].filter((g) => Date.now() - g.t < 12_000 && g.secret !== room?.secret);
  ul.innerHTML = fresh.length ? '' : '<li class="dim">NONE RIGHT NOW</li>';
  for (const g of fresh) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `▶ ${g.name}`;
    b.addEventListener('click', () => (location.hash = g.secret));
    li.append(b);
    ul.append(li);
  }
}, 1500);

// ------------------------------------------------------------- loop & drawing

const ctx = canvas.getContext('2d');
const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = W * dpr;
canvas.height = H * dpr;
ctx.scale(dpr, dpr);
const GREEN = '#33ff33';

function sounds(c) {
  const before = session.counters;
  if (c.h > before.h) beep(520);
  if (c.k > before.k) beep(300, 40);
  if (c.p > before.p) beep(180, 250);
  session.counters = c;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (session) tick(dt, now);
  draw(now);
  requestAnimationFrame(frame);
}

function tick(dt, now) {
  const S = session;
  const s = S.s;
  if (S.mode === 'guest') {
    s.r = steer(s.r, dt);
    const every = S.ch?.kind === 'direct' ? 33 : 80;
    if (S.ch && now - S.lastSend > every && s.r !== S.lastY) {
      S.ch.send({ t: 'p', y: Math.round(s.r * 10) / 10 });
      S.lastSend = now;
      S.lastY = s.r;
    }
    const snap = S.snap;
    if (snap) {
      s.l += (snap.l - s.l) * Math.min(1, dt * 18);
      s.ls = snap.ls;
      s.rs = snap.rs;
      s.ph = snap.ph;
      s.w = snap.w;
      sounds({ h: snap.h, k: snap.k, p: snap.p });
      Object.assign(s, extrapolate(snap, now - S.snapAt));
    }
    return showEnd();
  }
  // cpu / host: the authoritative simulation
  S.acc += dt;
  while (S.acc >= DT) {
    s.l = steer(s.l, DT);
    if (S.mode === 'cpu') cpuMove(s, DT);
    else s.r += (S.remoteY - s.r) * Math.min(1, DT * 30);
    step(s, DT);
    S.acc -= DT;
  }
  sounds({ h: s.hits, k: s.walls, p: s.points });
  if (S.mode === 'host' && S.ch) {
    const every = S.ch.kind === 'direct' ? 33 : 80;
    if (now - S.lastSend > every) {
      S.ch.send(snapshot(s, ++S.seq));
      S.lastSend = now;
    }
  }
  showEnd();
}

function showEnd() {
  const S = session;
  if (S.s.ph !== 'over') {
    S.shownEnd = false;
    return;
  }
  if (S.shownEnd || !$('overlay').hidden) return;
  S.shownEnd = true;
  const mine = S.s.w === S.side;
  beep(mine ? 880 : 140, 400);
  const name = S.s.w === 'l' ? S.names.l : S.names.r;
  overlay(`<h2>${mine ? 'YOU WIN' : `${name} WINS`}</h2><p>${S.s.ls} : ${S.s.rs}</p>`, [
    ['rematch', S.mode === 'guest' ? '[ASK FOR REMATCH]' : '[REMATCH]'],
    ['menu', '[MENU]'],
  ]);
}

function draw(now) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = GREEN;
  ctx.shadowColor = GREEN;
  for (let y = 8; y < H; y += 26) ctx.fillRect(W / 2 - 2, y, 4, 14);
  const s = session?.s;
  if (!s) return;
  ctx.font = 'bold 64px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(s.ls), W / 4, 76);
  ctx.fillText(String(s.rs), (3 * W) / 4, 76);
  ctx.shadowBlur = 12;
  ctx.fillRect(PX, s.l, PW, PH);
  ctx.fillRect(W - PX - PW, s.r, PW, PH);
  if (s.ph === 'play' || Math.floor(now / 250) % 2) ctx.fillRect(s.bx, s.by, BALL, BALL);
  ctx.shadowBlur = 0;
  // Mark your own paddle.
  ctx.fillRect(session.side === 'l' ? PX - 8 : W - PX + 4, (session.side === 'l' ? s.l : s.r) + PH / 2 - 3, 4, 6);
  if (s.ph === 'serve' && s.ls + s.rs === 0) {
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillText(`FIRST TO ${WIN}`, W / 2, H - 40);
  }
}
requestAnimationFrame(frame);

// ------------------------------------------------------------- start

function route() {
  const secret = location.hash.slice(1);
  if (/^[\w-]{22}$/.test(secret)) {
    if (session) end();
    joinGame(secret);
  }
}
addEventListener('hashchange', route);
show('menu');
route();
