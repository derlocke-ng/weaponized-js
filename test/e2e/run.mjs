// End-to-end test for Loadout: several isolated browser contexts ("devices")
// talk through a local gun relay.
//
//   npm install && npm run test:e2e
//
// Needs Chromium; set CHROMIUM_PATH if Playwright can't find one.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-e2e-'));
const RELAY_PORT = 18765 + Math.floor(Math.random() * 1000);
const WEB_PORT = RELAY_PORT + 1000;
const RELAY = `http://localhost:${RELAY_PORT}/gun`;
const APP = `http://localhost:${WEB_PORT}/loadout/`;

const procs = [
  spawn(process.execPath, [path.join(root, 'scripts/relay.cjs'), String(RELAY_PORT)], { env: { ...process.env, RADATA: path.join(tmp, 'radata') }, stdio: 'ignore' }),
  spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), path.join(root, 'apps'), String(WEB_PORT)], { stdio: 'ignore' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('exit', stop);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath });
const errors = [];

async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript((relay) => {
    if (!localStorage.getItem('loadout.relays')) localStorage.setItem('loadout.relays', JSON.stringify([relay]));
  }, RELAY);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.stack || e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/WebSocket|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text()) && errors.push(`${name} console: ${m.text()}`));
  page.on('dialog', (d) => d.dismiss());
  page.ctx = ctx;
  return page;
}

async function open(page, url = APP) {
  await page.goto(url);
  await page.waitForSelector('.home, .board, .account', { timeout: 20000 });
}

const texts = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.trim()));

async function until(fn, what, ms = 10000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${what} (last: ${last})`);
}

async function newBoard(page, kind, title, privacy = 'private') {
  await page.click(`[data-new="${kind === 'note' ? 'note' : 'check'}"]`);
  await page.check(`#newBoard input[name=kind][value=${kind}]`, { force: true });
  await page.fill('#newBoard input[name=title]', title);
  await page.check(`#newBoard input[name=privacy][value=${privacy}]`, { force: true });
  await page.click('#newBoard [type=submit]');
  await page.waitForSelector('#boardName', { timeout: 15000 });
  await until(async () => (await page.textContent('#boardName')) === title, 'board title');
}

async function addItems(page, lines) {
  for (const l of lines) {
    await page.fill('#addInput', l);
    await page.press('#addInput', 'Enter');
  }
}

async function shareLinks(page) {
  await page.click('[data-act=share]');
  await page.waitForSelector('#shareUrl');
  const links = {};
  const roles = await page.$$eval('input[name=role]', (els) => els.map((e) => e.value));
  if (!roles.length) links.view = await page.inputValue('#shareUrl');
  for (const role of roles) {
    await page.check(`input[name=role][value=${role}]`, { force: true });
    links[role] = await page.inputValue('#shareUrl');
  }
  await page.click('dialog [data-close]');
  return links;
}

const step = (name) => console.log(`• ${name}`);
let failed = false;

try {
  await until(async () => (await fetch(APP)).ok, 'web server');

  step('A creates a private grocery list');
  const A = await device('A');
  await open(A);
  await newBoard(A, 'check', 'Groceries');
  await addItems(A, ['2x milk', 'Eggs', '# Produce', 'Apples x6']);
  await until(async () => (await texts(A, '#active .text')).join('|') === 'milk|Eggs|Produce|Apples', 'items in typed order');
  assert.deepEqual(await texts(A, '#active .qty'), ['×2', '×6']);
  const groceries = await A.evaluate(() => location.hash.split('/')[2]);
  assert.ok(!(await A.evaluate(() => location.hash)).includes('?'), 'no secrets in the URL');

  step('pasting several lines adds them all');
  await A.focus('#addInput');
  await A.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '- [ ] bread\n- [x] butter\n\ncheese');
    document.querySelector('#addInput').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await until(async () => (await texts(A, '#active .text')).includes('cheese'), 'pasted items');
  assert.deepEqual(await texts(A, '#done .text'), ['butter']);

  const links = await shareLinks(A);
  assert.match(links.edit, /#\/b\/[\w-]+\.[\w-]+\?w=[\w-]{43}$/);
  assert.match(links.view, /#\/b\/[\w-]+\.[\w-]+\?k=[\w-]{43}$/);

  step('B opens the edit link and edits; A sees it live');
  const B = await device('B');
  await open(B, links.edit);
  await until(async () => (await texts(B, '#active .text')).includes('Apples'), 'items on B');
  assert.ok(!(await B.evaluate(() => location.hash)).includes('w='), 'edit key stripped from the address bar');
  await addItems(B, ['coffee']);
  await B.click('#active li:has-text("Eggs") .check input', { force: true });
  await until(async () => (await texts(A, '#active .text')).includes('coffee'), 'B’s item on A');
  await until(async () => (await texts(A, '#done .text')).includes('Eggs'), 'B’s check on A');

  step('A renames the board; B sees the new title');
  await A.click('#boardName');
  await A.fill('.title-input', 'Groceries this week');
  await A.press('.title-input', 'Enter');
  await until(async () => (await B.textContent('#boardName')) === 'Groceries this week', 'renamed on B');

  step('C opens the view link: reads, cannot write');
  const C = await device('C');
  await open(C, links.view);
  await until(async () => (await texts(C, '#active .text')).includes('coffee'), 'items on C');
  assert.equal(await C.$('#addInput'), null, 'no add form for viewers');
  assert.ok(await C.$eval('#active .check input', (i) => i.disabled), 'checkboxes disabled for viewers');
  assert.ok((await C.textContent('#boardTags')).includes('View only'));
  const forged = await C.evaluate(async (pub) => {
    const { gun } = await import('./js/net.js');
    return new Promise((resolve) => {
      gun.get(`~${pub}`).get('items').get('forged').put('{"t":"FORGED","d":0,"o":-5}', (ack) => resolve(ack.err || 'ok'));
      setTimeout(() => resolve('timeout'), 4000);
    });
  }, groceries);
  assert.notEqual(forged, 'ok', 'relay/peers must reject unsigned writes');
  await sleep(800);
  assert.ok(!(await texts(A, '#active .text')).includes('FORGED'), 'forged item not visible to editors');

  step('without a key the board is locked, and the relay only holds ciphertext');
  const D = await device('D');
  await open(D, `${APP}#/b/${groceries}`);
  await until(async () => (await D.$('#unlock')) !== null, 'locked state');
  const raw = await D.evaluate(async (pub) => {
    const { gun } = await import('./js/net.js');
    const out = [];
    await new Promise((r) => {
      gun.get(`~${pub}`).get('items').map().once((v) => out.push(v));
      gun.get(`~${pub}`).get('meta').get('info').once((v) => out.push(v));
      setTimeout(r, 2500);
    });
    return out;
  }, groceries);
  assert.ok(raw.length >= 5, `relay returned data (${raw.length})`);
  assert.ok(raw.every((v) => v == null || String(v).startsWith('SEA{')), 'everything is encrypted');
  assert.ok(!JSON.stringify(raw).match(/milk|Groceries|coffee/i), 'no plaintext on the wire');
  await D.fill('#unlock input', links.view);
  await D.click('#unlock button');
  await until(async () => (await texts(D, '#active .text')).includes('milk'), 'unlocked with the view link');

  step('public note: markdown renders, scripts do not');
  await A.goto(APP);
  await A.waitForSelector('.home');
  await newBoard(A, 'note', 'Readme', 'public');
  await A.waitForSelector('#md');
  const md = [
    '# Hello',
    '',
    'Some **bold** text and a [link](https://example.com).',
    '',
    '- [ ] task one',
    '- [x] task two',
    '',
    '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><a href="javascript:window.__xss=3">bad</a>',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
  ].join('\n');
  await A.fill('#md', md);
  await A.click('[data-act=done]');
  await A.waitForSelector('#noteView h1');
  const note = await A.evaluate(() => location.hash.split('/')[2]);
  const noteLinks = await shareLinks(A);
  assert.equal(noteLinks.view, `${APP}#/b/${note}`, 'public view link has no secret');
  await D.goto(`${APP}#/b/${note}`);
  await until(async () => (await D.$('#noteView h1')) !== null, 'note on D');
  const rendered = await D.$eval('#noteView', (el) => ({ html: el.innerHTML, xss: window.__xss, boxes: [...el.querySelectorAll('input')].map((i) => i.disabled) }));
  assert.equal(rendered.xss, undefined, 'no script ran');
  assert.ok(!/onerror|<script|javascript:/i.test(rendered.html), 'dangerous markup removed');
  assert.ok(rendered.html.includes('<table>') && rendered.html.includes('<strong>bold</strong>'));
  assert.deepEqual(rendered.boxes, [true, true], 'viewers can’t tick tasks');
  assert.ok(rendered.html.includes('rel="noopener noreferrer nofollow ugc"'));
  assert.ok(await D.$('[data-act=save]'), 'public view-only board offers Save');

  step('A ticks a task in the rendered note; D sees it');
  await A.click('#noteView input[data-task="0"]');
  await until(async () => (await D.$$eval('#noteView input', (els) => els[0].checked)) === true, 'task ticked on D');

  step('inventory counts');
  await A.goto(APP);
  await A.waitForSelector('.home');
  await newBoard(A, 'count', 'Pantry');
  await addItems(A, ['AA batteries: 4', 'Light bulbs']);
  await until(async () => (await texts(A, '#active .count')).join() === '4,1', 'counts');
  await A.click('#active li:has-text("Light bulbs") [data-step="-1"]');
  await until(async () => (await A.$('#active li.is-zero')) !== null, 'zero count marked');

  step('A creates an account; E signs in and gets every board');
  const alias = `e2e${Date.now().toString(36)}`;
  const pass = 'correct horse battery staple';
  await A.goto(`${APP}#/account`);
  await A.waitForSelector('#authForm');
  await A.check('input[name=authTab][value=create]', { force: true });
  await A.fill('#authForm [name=alias]', alias);
  await A.fill('#authForm [name=pass]', pass);
  await A.fill('#authForm [name=pass2]', pass);
  await Promise.all([A.waitForEvent('load', { timeout: 30000 }), A.click('#authBtn')]);
  await A.waitForSelector('.home');
  await until(async () => (await texts(A, '.board-title')).length === 3, 'A keeps its boards after creating the account');
  const E = await device('E');
  await open(E, `${APP}#/account`);
  await E.fill('#authForm [name=alias]', alias);
  await E.fill('#authForm [name=pass]', pass);
  await Promise.all([E.waitForEvent('load', { timeout: 30000 }), E.click('#authBtn')]);
  await E.waitForSelector('.home');
  await until(async () => (await texts(E, '.board-title')).sort().join('|') === 'Groceries this week|Pantry|Readme', 'boards on E', 15000);
  await E.click('.board-card:has-text("Groceries")');
  await until(async () => (await texts(E, '#active .text')).includes('coffee'), 'board content on E');
  assert.ok(await E.$('#addInput'), 'E can edit (edit key came through the wallet)');

  step('removing a board on E removes it on A');
  await E.goto(`${APP}#/b/${note}`);
  await E.waitForSelector('[data-act=menu]');
  await E.click('[data-act=menu]');
  await E.click('.menu button:has-text("Remove from my boards")');
  await E.click('dialog [data-ok]');
  await until(async () => !(await texts(A, '.board-title')).includes('Readme'), 'removal synced to A');

  step('offline edits sync when back online');
  await B.ctx.setOffline(true);
  await sleep(500);
  await B.click('#active li:has-text("milk") .check input', { force: true });
  await addItems(B, ['offline item']);
  await sleep(500);
  await B.ctx.setOffline(false);
  await A.goto(`${APP}#/b/${groceries}`);
  await until(async () => (await texts(A, '#active .text')).includes('offline item'), 'offline item reached A', 25000);
  await until(async () => (await texts(A, '#done .text')).includes('milk'), 'offline check reached A', 10000);

  step('backup → restore on a fresh device');
  await E.goto(`${APP}#/account`);
  await E.click('[data-act=backup]');
  await E.fill('dialog [name=pass]', 'backup passphrase 1');
  await E.fill('dialog [name=pass2]', 'backup passphrase 1');
  const [dl] = await Promise.all([E.waitForEvent('download', { timeout: 30000 }), E.click('dialog .btn-primary')]);
  const file = path.join(tmp, 'backup.json');
  await dl.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(backup.kind, 'loadout-backup');
  assert.ok(!fs.readFileSync(file, 'utf8').includes('coffee'), 'backup is encrypted');
  const F = await device('F');
  await open(F, `${APP}#/account`);
  await F.setInputFiles('#restoreFile', file);
  await F.fill('dialog [name=pass]', 'wrong passphrase');
  await F.click('dialog .btn-primary');
  await F.waitForSelector('.toast-error');
  await F.fill('dialog [name=pass]', 'backup passphrase 1');
  await Promise.all([F.waitForEvent('load', { timeout: 40000 }), F.click('dialog .btn-primary')]);
  await F.waitForSelector('.home');
  await until(async () => (await texts(F, '.board-title')).sort().join('|') === 'Groceries this week|Pantry', 'boards restored on F');
  assert.equal(await F.evaluate(() => JSON.parse(localStorage.getItem('loadout.identity')).alias), alias);

  step('delete for everyone');
  await F.goto(`${APP}#/b/${groceries}`);
  await F.waitForSelector('[data-act=menu]');
  await F.click('[data-act=menu]');
  await F.click('.menu button:has-text("Delete for everyone")');
  await F.click('dialog [data-ok]');
  await F.waitForSelector('.home');
  await until(async () => (await C.$('.board .state')) && (await C.textContent('.board .state')).includes('deleted'), 'deletion seen by viewer C');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('\nall end-to-end checks passed');
} catch (err) {
  failed = true;
  console.error('\nFAILED:', err.message);
  if (errors.length) console.error('page errors:\n ', errors.join('\n  '));
} finally {
  await browser.close();
  stop();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
