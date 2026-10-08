// End-to-end test for the hub: one account for the whole suite. The site is
// assembled the way GitHub Pages serves it (hub at the root, apps below).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { run, device, until, root } from './env.mjs';

const step = (s) => console.log(`• ${s}`);
const texts = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.trim()));

const site = fs.mkdtempSync(path.join(os.tmpdir(), 'wjs-site-'));
fs.cpSync(path.join(root, 'hub'), site, { recursive: true });
for (const app of ['loadout', 'shared']) fs.cpSync(path.join(root, 'apps', app), path.join(site, app), { recursive: true });

await run(
  'hub',
  async (env) => {
    const init = (relay) => localStorage.setItem('wjs.relays', JSON.stringify([relay]));
    const dev = (name, options) => device(env, name, init, env.nostrUrl, options);
    const alias = `hub${Date.now().toString(36)}`;
    const pass = 'a long enough password';

    async function newBoard(page, title) {
      await page.click('[data-new="check"]');
      await page.fill('#newBoard input[name=title]', title);
      await page.click('#newBoard [type=submit]');
      await page.waitForSelector('#boardName', { timeout: 15000 });
      await until(async () => (await page.textContent('#boardName')) === title, 'board title');
    }

    step('the hub shows the sign-in form and the relay status');
    const A = await dev('A');
    await A.goto(env.base);
    await A.waitForSelector('#authForm');
    assert.equal(await A.textContent('#accountName'), 'Sign in');
    await until(async () => (await A.$$('#relayList li.up')).length === 1, 'the test relay is up', 15000);

    step('creating an account on the hub signs the whole suite in');
    await A.check('input[name=authTab][value=create]', { force: true });
    await A.fill('#authForm [name=alias]', alias);
    await A.fill('#authForm [name=pass]', pass);
    await A.fill('#authForm [name=pass2]', pass);
    await A.click('#authBtn');
    await until(async () => (await A.textContent('#accountBody')).includes(alias), 'signed in on the hub', 60000);
    assert.equal(await A.textContent('#accountName'), alias);
    assert.equal(await A.evaluate(() => JSON.parse(localStorage.getItem('wjs.identity')).alias), alias);
    await A.goto(`${env.base}loadout/`);
    await A.waitForSelector('.home');
    await until(async () => (await A.getAttribute('#accountLink', 'title'))?.includes(alias), 'Loadout knows the account');
    await newBoard(A, 'Hub board');

    step('a device with boards of its own signs in on the hub and keeps them');
    const B = await dev('B');
    await B.goto(`${env.base}loadout/`);
    await B.waitForSelector('.home');
    await newBoard(B, 'Device board');
    await B.goto(env.base);
    await B.waitForSelector('#authForm');
    await B.fill('#authForm [name=alias]', alias);
    await B.fill('#authForm [name=pass]', pass);
    await B.click('#authBtn');
    await until(async () => (await B.textContent('#accountBody')).includes(alias), 'B signed in on the hub', 60000);
    await B.goto(`${env.base}loadout/`);
    await B.waitForSelector('.home');
    await until(async () => (await texts(B, '.board-title')).sort().join('|') === 'Device board|Hub board', 'account boards plus the carried board', 20000);
    await A.goto(`${env.base}loadout/`);
    await A.waitForSelector('.home');
    await until(async () => (await texts(A, '.board-title')).sort().join('|') === 'Device board|Hub board', 'the carried board reaches A', 20000);

    step('a wrong password shows the error inline');
    const C = await dev('C');
    await C.goto(env.base);
    await C.waitForSelector('#authForm');
    await C.fill('#authForm [name=alias]', alias);
    await C.fill('#authForm [name=pass]', 'definitely not it');
    await C.click('#authBtn');
    await C.waitForSelector('#authError:not([hidden])', { timeout: 60000 });
    assert.match(await C.textContent('#authError'), /wrong username or password/i);

    step('a German browser gets the hub in German');
    const D = await dev('D', { locale: 'de-DE' });
    await D.goto(env.base);
    await D.waitForSelector('#authForm');
    assert.equal(await D.getAttribute('html', 'lang'), 'de');
    await D.waitForSelector('#langBanner .lang-banner');
    const english = JSON.parse(fs.readFileSync(path.join(root, 'hub/locales/en.json'), 'utf8'));
    assert.notEqual(await D.textContent('.hero p'), english['hub.lead'], 'hero text is translated');
  },
  { webRoot: site },
);
