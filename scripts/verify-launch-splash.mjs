// The native launch splash ends when the first screen is ready, not on a fixed
// timer and not before, and the native auto-hide stays on as the cap so it can
// never hang. Runs the real app on the iOS code path. SplashScreen is reached
// the way the native bridge exposes plugins: a PluginHeaders entry plus
// nativePromise, which Capacitor core routes header-listed methods to.
//
// To make "too early" visible, the launch starts with a stored signed-in user
// whose account check is held for HOLD_MS and then rejected: the app shows its
// loading screen for that long, then the sign-in screen. hide() must come after
// the sign-in screen is on the page, never during the hold.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

const HOLD_MS = 1500;
const API_KEY = 'test-only-not-a-key';

const config = readFileSync(new URL('../capacitor.config.ts', import.meta.url), 'utf8');
const showDuration = Number(config.match(/launchShowDuration: (\d+)/)?.[1]);
assert.match(config, /launchAutoHide: true/, 'the native auto-hide is the safety cap; never turn it off');
assert.ok(showDuration >= 2000 && showDuration <= 5000, `launchShowDuration ${showDuration} must stay a short cap`);

const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const { port: free } = probe.address(); probe.close(() => resolve(free)); });
});
const url = `http://127.0.0.1:${port}/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'ignore',
  env: {
    ...process.env,
    VITE_FIREBASE_API_KEY: API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: 'test.invalid',
    VITE_FIREBASE_PROJECT_ID: 'test-only',
    VITE_FIREBASE_APP_ID: 'test-only',
  },
});
process.on('exit', () => server.kill());

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
  // Hold Firebase's check of the stored user, then reject it (signs out).
  await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 400, message: 'USER_NOT_FOUND' } }) });
  });
  await page.route('**/securetoken.googleapis.com/**', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 400, message: 'TOKEN_EXPIRED' } }) }));
  await page.addInitScript(({ hideFails, apiKey }) => {
    const t0 = performance.now();
    const splash = { hideCalls: [], signInAt: null, loadingSeen: false };
    window.__splash = splash;
    try {
      localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
        uid: 'stored-user', email: 'stored@example.invalid', emailVerified: false, isAnonymous: false, providerData: [],
        stsTokenManager: { refreshToken: 'test-refresh', accessToken: 'test-access', expirationTime: Date.now() + 3600000 },
        createdAt: '1', lastLoginAt: '1', apiKey, appName: '[DEFAULT]',
      }));
    } catch { /* storage unavailable: the hold is skipped and the order check below fails loudly */ }
    window.CapacitorCustomPlatform = { name: 'ios', plugins: {} };
    window.Capacitor = {
      PluginHeaders: [{ name: 'SplashScreen', methods: [{ name: 'hide', rtype: 'promise' }, { name: 'show', rtype: 'promise' }] }],
      nativePromise: async (plugin, method) => {
        if (plugin !== 'SplashScreen') throw new Error(`not implemented: ${plugin}.${method}`);
        if (method === 'hide') {
          splash.hideCalls.push({ at: performance.now() - t0 });
          if (hideFails) throw new Error('simulated: SplashScreen plugin missing');
        }
      },
    };
    new MutationObserver(() => {
      const text = document.body?.innerText || '';
      if (splash.signInAt === null && text.includes('Explore without an account')) splash.signInAt = performance.now() - t0;
      if (splash.signInAt === null && document.getElementById('root')?.childElementCount) splash.loadingSeen = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }, { hideFails, apiKey: API_KEY });
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
  assert.ok(ready.loadingSeen, 'the held account check must keep the app on its loading screen first');
  assert.ok(ready.signInAt >= HOLD_MS, `the sign-in screen appeared at ${Math.round(ready.signInAt)} ms, before the ${HOLD_MS} ms hold ended`);
  assert.equal(ready.hideCalls.length, 1, `hide() must run exactly once, ran ${ready.hideCalls.length}`);
  const hideAt = ready.hideCalls[0].at;
  assert.ok(hideAt >= ready.signInAt, `hide() at ${Math.round(hideAt)} ms came before the sign-in screen (${Math.round(ready.signInAt)} ms): the splash would end on the loading screen`);
  assert.ok(hideAt < showDuration, `hide() at ${Math.round(hideAt)} ms must beat the ${showDuration} ms cap`);

  // A binary without the plugin (or a failing call) must not break the app; the cap ends the splash.
  const failing = await launch(browser, { hideFails: true });
  assert.equal(failing.hideCalls.length, 1);
  assert.deepEqual(failing.errors, [], 'a failed hide() must be caught');

  console.log(`Launch splash: sign-in screen at ${Math.round(ready.signInAt)} ms (account check held ${HOLD_MS} ms), hide() at ${Math.round(hideAt)} ms; cap ${showDuration} ms`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  process.exit(process.exitCode || 0);
}
