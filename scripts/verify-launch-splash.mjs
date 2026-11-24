// The native launch splash ends when the first screen is ready, not on a fixed
// timer, and the native auto-hide stays on as the cap so it can never hang.
// Runs the real app (signed out) on the iOS code path. SplashScreen is reached
// the way the native bridge exposes plugins: a PluginHeaders entry plus
// nativePromise, which Capacitor core routes header-listed methods to.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const config = readFileSync(new URL('../capacitor.config.ts', import.meta.url), 'utf8');
const showDuration = Number(config.match(/launchShowDuration: (\d+)/)?.[1]);
assert.match(config, /launchAutoHide: true/, 'the native auto-hide is the safety cap; never turn it off');
assert.ok(showDuration >= 2000 && showDuration <= 5000, `launchShowDuration ${showDuration} must stay a short cap`);

const port = 5176;
const url = `http://127.0.0.1:${port}/`;
const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'ignore',
  env: {
    ...process.env,
    VITE_FIREBASE_API_KEY: 'test-only-not-a-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'test.invalid',
    VITE_FIREBASE_PROJECT_ID: 'test-only',
    VITE_FIREBASE_APP_ID: 'test-only',
  },
});

async function waitForApp() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      if ((await (await fetch(url)).text()).includes('<div id="root">')) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`port ${port} is not serving this app`);
}

async function launch(browser, { hideFails }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => { if (/SplashScreen|splash/i.test(error.message)) errors.push(error.message); });
  await page.addInitScript(({ hideFails }) => {
    const t0 = performance.now();
    window.__splash = { hideCalls: [], signInAt: null };
    window.CapacitorCustomPlatform = { name: 'ios', plugins: {} };
    window.Capacitor = {
      PluginHeaders: [{ name: 'SplashScreen', methods: [{ name: 'hide', rtype: 'promise' }, { name: 'show', rtype: 'promise' }] }],
      nativePromise: async (plugin, method) => {
        if (plugin !== 'SplashScreen') throw new Error(`not implemented: ${plugin}.${method}`);
        if (method === 'hide') {
          window.__splash.hideCalls.push({
            at: performance.now() - t0,
            signInVisible: Boolean(document.body?.innerText.includes('Explore without an account')),
          });
          if (hideFails) throw new Error('simulated: SplashScreen plugin missing');
        }
      },
    };
  }, { hideFails });
  await page.goto(url);
  await page.getByText('Explore without an account').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const state = await page.evaluate(() => window.__splash);
  await page.close();
  return { ...state, errors };
}

let browser;
try {
  await waitForApp();
  browser = await chromium.launch({ headless: true });
  // Warm Vite's dependency optimizer so the measured launch is the app, not the dev server.
  const warm = await browser.newPage();
  await warm.goto(url);
  await warm.getByText('Explore without an account').waitFor({ timeout: 30000 });
  await warm.close();

  const ready = await launch(browser, { hideFails: false });
  assert.equal(ready.hideCalls.length, 1, `hide() must run exactly once, ran ${ready.hideCalls.length}`);
  assert.ok(ready.hideCalls[0].signInVisible, 'hide() must wait for the sign-in screen to be on the page');
  assert.ok(ready.hideCalls[0].at < showDuration, `hide() at ${Math.round(ready.hideCalls[0].at)} ms must beat the ${showDuration} ms cap`);

  // A binary without the plugin (or a failing call) must not break the app; the cap ends the splash.
  const failing = await launch(browser, { hideFails: true });
  assert.equal(failing.hideCalls.length, 1);
  assert.deepEqual(failing.errors, [], 'a failed hide() must be caught');

  console.log(`Launch splash: hide() at ${Math.round(ready.hideCalls[0].at)} ms from launch, with the sign-in screen already on the page; cap ${showDuration} ms`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  process.exit(process.exitCode || 0);
}
