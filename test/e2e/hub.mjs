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

    step('the start page points to sign-in and shows the relay status');
    const A = await dev('A');
    await A.goto(env.base);
    await A.waitForSelector('#accountCta:not([hidden])');
    assert.equal(await A.textContent('#accountName'), 'Sign in');
    await until(async () => (await A.$$('#relayList li.up')).length === 1, 'the test relay is up', 15000);

    step('creating an account in the settings signs the whole suite in');
    await A.click('#accountLink');
    await A.waitForSelector('#authForm');
    await A.check('input[name=authTab][value=create]', { force: true });
    await A.fill('#authForm [name=alias]', alias);
    await A.fill('#authForm [name=pass]', pass);
    await A.fill('#authForm [name=pass2]', pass);
    await A.click('#authBtn');
    await until(async () => (await A.textContent('#accountBody')).includes(alias), 'signed in on the settings page', 60000);
    assert.equal(await A.evaluate(() => JSON.parse(localStorage.getItem('wjs.identity')).alias), alias);
    await A.goto(env.base);
    await A.waitForSelector('#accountLink .avatar');
    assert.equal(await A.textContent('#accountLink .avatar'), alias[0].toUpperCase());
    assert.ok((await A.getAttribute('#accountLink', 'title')).includes(alias));
    assert.equal(await A.$('#accountCta:not([hidden])'), null, 'no sign-in nudge once signed in');
    await A.goto(`${env.base}loadout/`);
    await A.waitForSelector('.home');
    await until(async () => (await A.getAttribute('#accountLink', 'title'))?.includes(alias), 'Loadout knows the account');
    await newBoard(A, 'Hub board');

    step('a device with boards of its own signs in on the hub and keeps them');
    const B = await dev('B');
    await B.goto(`${env.base}loadout/`);
    await B.waitForSelector('.home');
    await newBoard(B, 'Device board');
    await B.goto(`${env.base}settings.html`);
    await B.waitForSelector('#authForm');
    await B.fill('#authForm [name=alias]', alias);
    await B.fill('#authForm [name=pass]', pass);
    await B.click('#authBtn');
    await until(async () => (await B.textContent('#accountBody')).includes(alias), 'B signed in on the settings page', 60000);
    await B.goto(`${env.base}loadout/`);
    await B.waitForSelector('.home');
    await until(async () => (await texts(B, '.board-title')).sort().join('|') === 'Device board|Hub board', 'account boards plus the carried board', 20000);
    await A.goto(`${env.base}loadout/`);
    await A.waitForSelector('.home');
    await until(async () => (await texts(A, '.board-title')).sort().join('|') === 'Device board|Hub board', 'the carried board reaches A', 20000);

    step('theme, language and hidden apps are set once in the settings and apply everywhere');
    const SETTINGS = `${env.base}settings.html`;
    await A.goto(SETTINGS);
    await A.waitForSelector('#themeSeg');
    await A.check('#themeSeg input[value=dark]', { force: true });
    await A.selectOption('#langSelect', 'fr');
    await until(async () => (await A.getAttribute('html', 'lang')) === 'fr', 'settings page in French');
    await A.uncheck('#appToggles input[data-app=pongjs]', { force: true });
    await A.goto(env.base);
    await A.waitForSelector('#accountLink');
    assert.equal(await A.getAttribute('html', 'data-theme'), 'dark', 'the start page follows the theme');
    assert.equal(await A.getAttribute('html', 'lang'), 'fr', 'the start page follows the language');
    await until(async () => await A.$eval('li[data-app=pongjs]', (el) => el.hidden), 'hidden app gone from the start page');
    await A.goto(`${env.base}loadout/`);
    await A.waitForSelector('.home');
    assert.equal(await A.getAttribute('html', 'data-theme'), 'dark', 'Loadout follows the theme');
    assert.equal(await A.getAttribute('html', 'lang'), 'fr', 'Loadout follows the language');
    // Another device of the same account gets the same language and theme from the account.
    await until(async () => (await B.getAttribute('html', 'lang')) === 'fr', 'B follows the account language', 20000);
    await until(async () => (await B.getAttribute('html', 'data-theme')) === 'dark', 'B follows the account theme', 20000);
    await A.goto(SETTINGS);
    await A.waitForSelector('#langSelect');
    await A.selectOption('#langSelect', 'en');
    await A.check('#themeSeg input[value=system]', { force: true });
    await A.check('#appToggles input[data-app=pongjs]', { force: true });
    await until(async () => (await B.getAttribute('html', 'lang')) === 'en', 'B back to English', 20000);

    step('the app switcher reaches every page from every page, and the back button closes it');
    await A.goto(SETTINGS);
    await A.waitForSelector('#appToggles input[data-app=pongjs]');
    await A.uncheck('#appToggles input[data-app=pongjs]', { force: true });
    await A.goto(`${env.base}loadout/`);
    await A.waitForSelector('.home');
    await A.click('#switcher');
    await A.waitForSelector('.switcher.open .switcher-apps a');
    const links = await texts(A, '.switcher-apps a');
    assert.ok(links.some((x) => /Start page/.test(x)) && links.some((x) => /Settings/.test(x)) && links.some((x) => /Payload/.test(x)), `switcher lists the pages: ${links.join(', ')}`);
    assert.ok(!links.some((x) => /pongjs/.test(x)), 'hidden apps stay out of the switcher');
    await A.goBack();
    await until(async () => !(await A.$('.switcher.open')), 'the back button closes the sheet');
    assert.ok(A.url().endsWith('/loadout/') || A.url().includes('/loadout/#'), 'still in Loadout after closing');
    await A.click('#switcher');
    await A.waitForSelector('.switcher.open');
    await A.click('.switcher-apps a[href$="settings.html"]');
    await A.waitForSelector('#appToggles');
    assert.ok(A.url().endsWith('settings.html'), 'the switcher opened the settings page');
    await A.check('#appToggles input[data-app=pongjs]', { force: true });

    step('wiping a device forgets the key and the cached data');
    await B.goto(SETTINGS);
    await B.waitForSelector('[data-act=wipe]');
    B.removeAllListeners('dialog');
    B.on('dialog', (d) => d.accept());
    await Promise.all([B.waitForEvent('load', { timeout: 30000 }), B.click('[data-act=wipe]')]);
    await B.waitForSelector('#accountCta:not([hidden])', { timeout: 30000 });
    assert.equal(await B.textContent('#accountName'), 'Sign in');

    step('a wrong password shows the error inline');
    const C = await dev('C');
    await C.goto(`${env.base}settings.html`);
    await C.waitForSelector('#authForm');
    await C.fill('#authForm [name=alias]', alias);
    await C.fill('#authForm [name=pass]', 'definitely not it');
    await C.click('#authBtn');
    await C.waitForSelector('#authError:not([hidden])', { timeout: 60000 });
    assert.match(await C.textContent('#authError'), /wrong username or password/i);

    step('a German browser gets the hub in German');
    const D = await dev('D', { locale: 'de-DE' });
    await D.goto(env.base);
    await D.waitForSelector('#accountCta:not([hidden])');
    assert.equal(await D.getAttribute('html', 'lang'), 'de');
    await D.waitForSelector('#langBanner .lang-banner');
    const english = JSON.parse(fs.readFileSync(path.join(root, 'hub/locales/en.json'), 'utf8'));
    assert.notEqual(await D.textContent('.hero p'), english['hub.lead'], 'hero text is translated');
  },
  { webRoot: site },
);
