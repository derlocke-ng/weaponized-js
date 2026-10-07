// Shared setup for the end-to-end tests: a local gun relay, a static server
// for apps/, and Chromium.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function until(fn, what, ms = 10000) {
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

export async function setup(name) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-e2e-`));
  const relayPort = 20000 + Math.floor(Math.random() * 20000);
  const webPort = relayPort + 1;
  let runs = 0;
  const startRelay = () =>
    spawn(process.execPath, [path.join(root, 'scripts/relay.cjs'), String(relayPort)], { env: { ...process.env, RADATA: path.join(tmp, `radata-${runs++}`) }, stdio: 'ignore' });
  let relay = startRelay();
  const web = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), path.join(root, 'apps'), String(webPort)], { stdio: 'ignore' });
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  // mDNS-obfuscated ICE candidates don't resolve in containers; real browsers are fine.
  // A UTF-8 locale keeps non-ASCII download names (minimal containers default to C).
  const browser = await chromium.launch({ executablePath, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'], env: { ...process.env, LANG: 'C.UTF-8' } });
  const env = {
    tmp,
    relayUrl: `http://localhost:${relayPort}/gun`,
    base: `http://localhost:${webPort}/`,
    browser,
    errors: [],
    async wipeRelay() {
      const old = relay;
      await new Promise((r) => {
        old.once('exit', r);
        old.kill();
      });
      relay = startRelay();
      await until(() => fetch(`http://localhost:${relayPort}/`).then(() => true), 'relay restart');
    },
    async close() {
      await browser.close().catch(() => {});
      relay.kill();
      web.kill();
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
  process.on('exit', () => {
    relay.kill();
    web.kill();
  });
  await until(() => fetch(env.base).then(() => true), 'web server');
  await until(() => fetch(`http://localhost:${relayPort}/`).then(() => true), 'relay');
  return env;
}

/** A fresh browser context ("device"); `init` runs before every page script. */
export async function device(env, name, init, arg) {
  const ctx = await env.browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true });
  if (init) await ctx.addInitScript(init, arg);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => env.errors.push(`${name}: ${e.stack || e.message}`));
  page.ctx = ctx;
  page.logs = [];
  page.on('console', (m) => page.logs.push(m.text()));
  return page;
}

export async function run(name, body) {
  const env = await setup(name);
  let failed = false;
  try {
    await body(env);
    if (env.errors.length) throw new Error(`page errors:\n  ${env.errors.join('\n  ')}`);
    console.log(`\nall ${name} checks passed`);
  } catch (err) {
    failed = true;
    console.error(`\n${name} FAILED:`, err.message);
  } finally {
    await env.close();
  }
  process.exit(failed ? 1 : 0);
}
