// End-to-end test for Loadout: several isolated browser contexts ("devices")
// talk through a local nostr relay.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import os from 'node:os';
import { run, device, until, sleep, root } from './env.mjs';

const step = (s) => console.log(`• ${s}`);
const texts = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.trim()));

// The site as GitHub Pages serves it: the hub (with the settings page) at the root, apps below.
const site = fs.mkdtempSync(path.join(os.tmpdir(), 'wjs-site-'));
fs.cpSync(path.join(root, 'hub'), site, { recursive: true });
for (const app of ['loadout', 'shared']) fs.cpSync(path.join(root, 'apps', app), path.join(site, app), { recursive: true });

await run('loadout', async (env) => {
  const APP = `${env.base}loadout/`;
  const SETTINGS = `${env.base}settings.html`;
  const init = (relay) => localStorage.setItem('wjs.relays', JSON.stringify([relay]));
  const dev = (name, options) => device(env, name, init, env.nostrUrl, options);

  async function open(page, url = APP) {
    await page.goto(url);
    await page.waitForSelector('.home, .board, .account', { timeout: 20000 });
  }

  async function newBoard(page, kind, title) {
    await page.click(`[data-new="${kind === 'note' ? 'note' : 'check'}"]`);
    await page.check(`#newBoard input[name=kind][value=${kind}]`, { force: true });
    await page.fill('#newBoard input[name=title]', title);
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

  step('A creates a grocery list');
  const A = await dev('A');
  await open(A);
  await newBoard(A, 'check', 'Groceries');
  await addItems(A, ['2x milk', 'Eggs', '# Produce', 'Apples x6']);
  await until(async () => (await texts(A, '#active .text')).join('|') === 'milk|Eggs|Produce|Apples', 'items in typed order');
  assert.deepEqual(await texts(A, '#active .qty'), ['×2', '×6']);
  const groceries = await A.evaluate(() => location.hash.split('/')[2]);
  assert.match(groceries, /^[0-9a-f]{64}$/);
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
  assert.match(links.edit, /#\/b\/[0-9a-f]{64}\?w=[0-9a-f]{64}$/);
  assert.match(links.view, /#\/b\/[0-9a-f]{64}\?k=[0-9a-f]{64}$/);

  step('B opens the edit link and edits; A sees it live');
  const B = await dev('B');
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

  step('C opens the view link: reads, cannot write; the relay rejects forgeries');
  const C = await dev('C');
  await open(C, links.view);
  await until(async () => (await texts(C, '#active .text')).includes('coffee'), 'items on C');
  assert.equal(await C.$('#addInput'), null, 'no add form for viewers');
  assert.ok(await C.$eval('#active .check input', (i) => i.disabled), 'checkboxes disabled for viewers');
  assert.ok((await C.textContent('#boardTags')).includes('View only'));
  const now = Math.floor(Date.now() / 1000);
  const forged = { ...finalizeEvent({ kind: 30702, created_at: now + 5, tags: [['d', 'forged']], content: 'FORGED' }, generateSecretKey()), pubkey: groceries };
  await assert.rejects(env.relayPublish(forged), /invalid/, 'an item not signed by the board key is rejected');
  const stranger = finalizeEvent({ kind: 30702, created_at: now + 5, tags: [['d', 'stranger']], content: 'STRANGER' }, generateSecretKey());
  await env.relayPublish(stranger); // valid event, but not the board's
  await sleep(800);
  assert.ok(!(await texts(A, '#active .text')).some((t) => /FORGED|STRANGER/.test(t)), 'nothing foreign shows up on the board');

  step('without a key the board is locked, and the relay only holds ciphertext');
  const D = await dev('D');
  await open(D, `${APP}#/b/${groceries}`);
  await until(async () => (await D.$('#unlock')) !== null, 'locked state');
  const raw = await env.relayEvents([{ authors: [groceries] }]);
  assert.ok(raw.length >= 6, `relay holds the board's events (${raw.length})`);
  assert.ok(raw.every((e) => /^[A-Za-z0-9_-]+$/.test(e.content)), 'every content is an opaque payload');
  assert.ok(!JSON.stringify(raw).match(/milk|Groceries|coffee/i), 'no plaintext on the relay');
  await D.fill('#unlock input', links.view);
  await D.click('#unlock button');
  await until(async () => (await texts(D, '#active .text')).includes('milk'), 'unlocked with the view link');

  step('note: markdown renders, scripts do not');
  await A.goto(APP);
  await A.waitForSelector('.home');
  await newBoard(A, 'note', 'Readme');
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
  await D.goto(noteLinks.view);
  await until(async () => (await D.$('#noteView h1')) !== null, 'note on D');
  const rendered = await D.$eval('#noteView', (el) => ({ html: el.innerHTML, xss: window.__xss, boxes: [...el.querySelectorAll('input')].map((i) => i.disabled) }));
  assert.equal(rendered.xss, undefined, 'no script ran');
  assert.ok(!/onerror|<script|javascript:/i.test(rendered.html), 'dangerous markup removed');
  assert.ok(rendered.html.includes('<table>') && rendered.html.includes('<strong>bold</strong>'));
  assert.deepEqual(rendered.boxes, [true, true], 'viewers can’t tick tasks');
  assert.ok(rendered.html.includes('rel="noopener noreferrer nofollow ugc"'));

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

  step('delete for everyone');
  await A.goto(APP);
  await A.waitForSelector('.home');
  await newBoard(A, 'check', 'Temp');
  await addItems(A, ['scratch']);
  const tempLinks = await shareLinks(A);
  await C.goto(tempLinks.view);
  await until(async () => (await texts(C, '#active .text')).includes('scratch'), 'temp list on C');
  await A.click('[data-act=menu]');
  await A.click('.menu button:has-text("Delete for everyone")');
  await A.click('dialog [data-ok]');
  await A.waitForSelector('.home');
  await until(async () => (await C.$('.board .state')) && (await C.textContent('.board .state')).includes('deleted'), 'deletion seen by viewer C');
  assert.ok(!(await texts(A, '.board-title')).includes('Temp'), 'deleted board left the wallet');

  step('A creates an account; E signs in and gets every board');
  const alias = `e2e${Date.now().toString(36)}`;
  const pass = 'correct horse battery staple';
  const signIn = async (page, expectOk = true) => {
    await page.goto(SETTINGS);
    await page.waitForSelector('#authForm');
    await page.fill('#authForm [name=alias]', alias);
    await page.fill('#authForm [name=pass]', pass);
    await page.click('#authBtn');
    if (!expectOk) return page.waitForSelector('#authError:not([hidden])', { timeout: 60000 }).then((el) => el.textContent());
    await until(async () => (await page.textContent('#accountBody')).includes(alias), 'signed in on the settings page', 60000);
    await page.goto(APP);
    await page.waitForSelector('.home');
  };
  await A.goto(SETTINGS);
  await A.waitForSelector('#authForm');
  await A.check('input[name=authTab][value=create]', { force: true });
  await A.fill('#authForm [name=alias]', alias);
  await A.fill('#authForm [name=pass]', pass);
  await A.fill('#authForm [name=pass2]', pass);
  await A.click('#authBtn');
  await until(async () => (await A.textContent('#accountBody')).includes(alias), 'account created', 60000);
  await A.goto(APP);
  await A.waitForSelector('.home');
  await until(async () => (await texts(A, '.board-title')).length === 3, 'A keeps its boards after creating the account');
  const E = await dev('E');
  await signIn(E);
  await until(async () => (await texts(E, '.board-title')).sort().join('|') === 'Groceries this week|Pantry|Readme', 'boards on E', 15000);
  await E.click('.board-card:has-text("Groceries")');
  await until(async () => (await texts(E, '#active .text')).includes('coffee'), 'board content on E');
  assert.ok(await E.$('#addInput'), 'E can edit (edit key came through the wallet)');

  step('a wrong password finds no account');
  const W = await dev('W');
  await W.goto(SETTINGS);
  await W.waitForSelector('#authForm');
  await W.fill('#authForm [name=alias]', alias);
  await W.fill('#authForm [name=pass]', 'correct horse battery stapler');
  await W.click('#authBtn');
  assert.match(await W.waitForSelector('#authError:not([hidden])', { timeout: 60000 }).then((el) => el.textContent()), /wrong username or password/i);
  await W.ctx.close();

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
  await until(async () => (await B.textContent('#sync')).includes('to sync'), 'outbox shown while offline');
  await B.ctx.setOffline(false);
  await A.goto(`${APP}#/b/${groceries}`);
  await until(async () => (await texts(A, '#active .text')).includes('offline item'), 'offline item reached A', 30000);
  await until(async () => (await texts(A, '#done .text')).includes('milk'), 'offline check reached A', 10000);

  step('backup → restore on a fresh device');
  await E.goto(SETTINGS);
  await E.waitForSelector('[data-act=backup]');
  await E.click('[data-act=backup]');
  await E.fill('#backupForm [name=pass]', 'backup passphrase 1');
  await E.fill('#backupForm [name=pass2]', 'backup passphrase 1');
  const [dl] = await Promise.all([E.waitForEvent('download', { timeout: 30000 }), E.click('#backupForm .btn-primary')]);
  const file = path.join(env.tmp, 'backup.json');
  await dl.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(backup.kind, 'wjs-backup');
  assert.ok(!fs.readFileSync(file, 'utf8').includes('coffee'), 'backup is encrypted');
  const restore = async (page, passphrase) => {
    await page.goto(SETTINGS);
    await page.waitForSelector('#restoreFile', { state: 'attached' });
    await page.setInputFiles('#restoreFile', file);
    await page.fill('#restoreForm [name=pass]', passphrase);
    await page.click('#restoreForm .btn-primary');
  };
  const F = await dev('F');
  await restore(F, 'wrong passphrase');
  await F.waitForSelector('#rsError:not([hidden])');
  await F.fill('#restoreForm [name=pass]', 'backup passphrase 1');
  await Promise.all([F.waitForEvent('load', { timeout: 40000 }), F.click('#restoreForm .btn-primary')]);
  await F.goto(APP);
  await F.waitForSelector('.home');
  await until(async () => (await texts(F, '.board-title')).sort().join('|') === 'Groceries this week|Pantry', 'boards restored on F');
  assert.equal(await F.evaluate(() => JSON.parse(localStorage.getItem('wjs.identity')).alias), alias);

  step('the relay loses everything: the backup file brings it all back');
  for (const p of [A, B, C, D, F]) await p.ctx.close();
  await E.close(); // E's browser storage stays, like a phone in a pocket
  await env.wipeNostr();
  const G = await dev('G');
  assert.match(await signIn(G, false), /wrong username or password|no relay/i, 'the account is gone from the relay');
  await G.ctx.close();
  const H = await dev('H');
  await H.goto(SETTINGS);
  await H.waitForSelector('#restoreFile', { state: 'attached' });
  await H.setInputFiles('#restoreFile', file);
  await H.fill('#restoreForm [name=pass]', 'backup passphrase 1');
  await Promise.all([H.waitForEvent('load', { timeout: 40000 }), H.click('#restoreForm .btn-primary')]);
  await H.goto(APP);
  await H.waitForSelector('.home');
  await until(async () => (await texts(H, '.board-title')).sort().join('|') === 'Groceries this week|Pantry', 'boards from the backup');
  await H.click('.board-card:has-text("Groceries")');
  await until(async () => (await texts(H, '#active .text')).includes('coffee'), 'content from the backup', 15000);
  const G1 = await dev('G1');
  await signIn(G1);
  await until(async () => (await texts(G1, '.board-title')).length === 2, 'the account event came back with the backup', 15000);
  await G1.ctx.close();
  await H.ctx.close();

  step('the relay loses everything again: a returning device heals it');
  await env.wipeNostr();
  const E2 = await E.ctx.newPage();
  E2.on('pageerror', (e) => env.errors.push(`E2: ${e.stack || e.message}`));
  await E2.goto(APP);
  await E2.waitForSelector('.home');
  await E2.evaluate(() => localStorage.removeItem('wjs.healed')); // as if the last check were hours ago
  await E2.reload();
  await E2.waitForSelector('.home');
  await until(async () => (await env.relayEvents([{ kinds: [30790] }])).length === 1, 'account event re-published by E', 20000);
  // Healing is paced to stay under relay rate limits: wait until everything E holds is back, not a fixed time.
  // E2 stays open while G2 checks: a device that heals keeps healing until it is closed.
  const G2 = await dev('G2');
  await signIn(G2);
  await until(async () => (await texts(G2, '.board-title')).sort().join('|') === 'Groceries this week|Pantry', 'boards after healing', 30000);
  await G2.click('.board-card:has-text("Pantry")');
  await until(async () => (await texts(G2, '#active .count')).join() === '4,0', 'pantry counts after healing', 30000);
  await G2.goto(`${APP}#/b/${groceries}`);
  await until(async () => (await texts(G2, '#active .text')).includes('coffee'), 'grocery items after healing', 30000);
  await E2.close();

  step('starters stay available, fill a board from their template, and can be hidden');
  await G2.goto(APP);
  await G2.waitForSelector('.starters-row');
  await G2.click('.starters-row [data-starter=pantry]');
  await G2.waitForSelector('#newBoard');
  assert.equal(await G2.inputValue('#newBoard input[name=title]'), 'Pantry');
  await G2.click('#newBoard [type=submit]');
  await G2.waitForSelector('#boardName', { timeout: 15000 });
  await until(async () => (await texts(G2, '#active .text')).includes('Rice'), 'template items in the new board');
  assert.deepEqual(await texts(G2, '#active .count'), ['3', '2', '6', '8', '12']);
  await G2.goto(APP);
  await G2.waitForSelector('.starters-row');
  await G2.click('.starters-row [data-act=hide-starters]');
  await until(async () => !(await G2.$('.starters-row')), 'starters hidden');
  await G2.waitForSelector('[data-act=show-starters]');
  // The choice is a synced setting: another device of the account sees it too.
  const G3 = await dev('G3');
  await signIn(G3);
  await until(async () => (await G3.$('[data-act=show-starters]')) !== null, 'G3 sees the hidden starters', 20000);
  await G3.click('[data-act=show-starters]');
  await until(async () => (await G2.$('.starters-row')) !== null, 'G2 sees them again', 15000);

  step('a dead relay in the list does not make changes look unsynced');
  const K = await device(env, 'K', (relays) => localStorage.setItem('wjs.relays', JSON.stringify(relays)), [env.nostrUrl, 'ws://127.0.0.1:9/']);
  await open(K);
  await until(async () => (await K.textContent('#sync .sync-text')) === '1/2', 'one of two relays connected', 15000);
  await newBoard(K, 'check', 'Half online');
  await addItems(K, ['bread']);
  await until(async () => (await texts(K, '#active .text')).includes('bread'), 'item added');
  await sleep(1200);
  assert.equal(await K.textContent('#sync .sync-text'), '1/2', 'nothing counts as unsynced while one relay has it');
  await K.goto(SETTINGS);
  await K.waitForSelector('#relayList li');
  await until(async () => (await texts(K, '#relayList li')).some((x) => /waiting/.test(x)), 'the dead relay shows what it is missing');
  await K.click('[data-act=sync-now]');
  await K.waitForSelector('.toast-success', { timeout: 20000 });
  await K.ctx.close();

  step('a German browser is asked in German and gets a German app; English stays English');
  const DE = await dev('DE', { locale: 'de-DE' });
  await open(DE);
  assert.equal(await DE.getAttribute('html', 'lang'), 'de');
  await DE.waitForSelector('#langBanner');
  const germanTitle = await DE.textContent('.home h1');
  assert.notEqual(germanTitle, 'Your boards', 'home title is translated');
  assert.equal(await DE.inputValue('#langPick'), 'de', 'the browser language is preselected');
  await DE.click('#langOk');
  await until(async () => !(await DE.$('#langBanner')), 'banner gone after confirming');
  assert.equal(await DE.evaluate(() => localStorage.getItem('wjs.lang')), '"de"');
  await DE.click('[data-new=check]');
  await DE.waitForSelector('#newBoard');
  assert.notEqual(await DE.textContent('#newBoard [type=submit]'), 'Create');
  await DE.press('#newBoard input[name=title]', 'Escape');
  // Switching back happens on the site's settings page and reaches Loadout.
  await DE.goto(SETTINGS);
  await DE.waitForSelector('#langSelect');
  await DE.selectOption('#langSelect', 'en');
  await until(async () => (await DE.getAttribute('html', 'lang')) === 'en', 'English after switching');
  await DE.goto(APP);
  await until(async () => (await DE.textContent('.home h1')) === 'Your boards', 'home in English');
  const US = await dev('US', { locale: 'en-US' });
  await open(US);
  assert.equal(await US.$('#langBanner'), null, 'English browsers are not asked');
  assert.equal(await US.textContent('.home h1'), 'Your boards');
}, { webRoot: site });
