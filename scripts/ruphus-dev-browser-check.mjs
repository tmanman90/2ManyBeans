import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Real app/providers, standard Firebase SDK login, isolated fixture only.
// This entry check deliberately forbids model and recipe command dispatches.
export async function checkAuthenticatedDevEntry({ config, customToken, fixtureUid }) {
  assert.equal(config.VITE_FIREBASE_PROJECT_ID, 'twomanybeans-ruphus-dev');
  const previous = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  const previousVariant = process.env.TMB_APP_VARIANT;
  Object.assign(process.env, config, { TMB_APP_VARIANT: 'dev' });
  let server;
  let browser;
  let page;
  let stage = 'start_server';
  try {
    server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
    await server.listen();
    const address = server.httpServer.address();
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    page = await context.newPage();
    const errors = [];
    const blockedApiPaths = [];
    page.on('pageerror', () => errors.push('page_runtime_error'));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '2manybeans.vercel.app' || url.pathname.startsWith('/api/')) {
        blockedApiPaths.push(url.pathname);
        return route.abort();
      }
      return route.continue();
    });
    stage = 'load_app';
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    const firebaseModule = await server.transformRequest('/src/firebase.js');
    const authModule = firebaseModule.code.match(/from\s+["']([^"']*firebase_auth[^"']*)["']/)?.[1];
    assert.ok(authModule, 'Vite Firebase auth module must be resolved');
    stage = 'firebase_sign_in';
    await page.evaluate(async ({ authModule, customToken, fixtureUid }) => {
      const { auth } = await import('/src/firebase.js');
      const { setPersistence, inMemoryPersistence, signInWithCustomToken } = await import(authModule);
      await setPersistence(auth, inMemoryPersistence);
      const result = await signInWithCustomToken(auth, customToken);
      if (result.user.uid !== fixtureUid) throw new Error('Wrong fixture identity');
    }, { authModule, customToken, fixtureUid });
    stage = 'fixture_data_consent';
    const consent = page.getByRole('button', { name: 'I Understand and Agree', exact: true });
    await page.getByRole('button', { name: /^(I Understand and Agree|Chat)$/ }).first().waitFor();
    if (await consent.isVisible()) await consent.click();
    stage = 'open_chat';
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    stage = 'verify_agent_entry';
    await page.locator('[data-ruphus-agent-enabled="true"]').waitFor();
    const text = await page.locator('body').innerText();
    assert.match(text, /Professor Ruphus|Your rotation, your taste/i);
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    assert.deepEqual(errors, []);
    assert.equal(blockedApiPaths.length, 0, 'Entry must not dispatch model or command requests');
    const screenshot = '/tmp/ruphus-authenticated-chat.png';
    await page.screenshot({ path: screenshot, fullPage: false });
    return { passed: true, authenticated: true, agentEnabled: true, entry: 'Rotation → Chat', viewport: '390×844', screenshot, modelDispatches: 0, nativeUiTest: false };
  } catch (error) {
    const screenshot = '/tmp/ruphus-authenticated-entry-failure.png';
    if (page) await page.screenshot({ path: screenshot, fullPage: false }).catch(() => {});
    // Do not print Playwright evaluation arguments, auth objects, or error stacks.
    console.log(JSON.stringify({ browserStage: stage, screenshot, timedOut: error.name === 'TimeoutError' }));
    throw new Error(`Dev browser entry failed at ${stage}`);
  } finally {
    await browser?.close();
    await server?.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (previousVariant === undefined) delete process.env.TMB_APP_VARIANT; else process.env.TMB_APP_VARIANT = previousVariant;
  }
}
