// Diagnostic probe of the real ChatTab, not the isolated artifact showcase.
// All storage is injected; external traffic and non-GET requests are blocked.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

Object.assign(process.env, {
  TMB_APP_VARIANT: 'dev',
  VITE_FIREBASE_API_KEY: 'local-probe-not-a-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'local-probe.invalid',
  VITE_FIREBASE_PROJECT_ID: 'local-probe',
  VITE_FIREBASE_STORAGE_BUCKET: 'local-probe.invalid',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:local-probe',
});

const server = await createServer({
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'silent',
  plugins: [{
    name: 'delayed-chat-storage-probe',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/chat-harness.jsx')) return;
      assert.ok(source.includes('loadRemote: async () => loadHarnessSession(),'));
      return source
        .replace('loadRemote: async () => loadHarnessSession(),',
          'loadRemote: () => new Promise(resolve => { window.releaseChatHistory = () => resolve(loadHarnessSession()); }),')
        .replace('loadLocal: async () => loadHarnessSession(),', 'loadLocal: async () => null,');
    },
  }],
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const writes = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const request = route.request();
    if (request.method() !== 'GET') writes.push(request.method());
    return request.url().startsWith(origin) && request.method() === 'GET'
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('chat_harness-user', JSON.stringify({ messages:
      Array.from({ length: 16 }, (_, i) => ({ id: `probe-${i}`,
        role: i % 2 ? 'assistant' : 'user', createdAt: Date.now(),
        text: `Saved turn ${i}. ` + 'This is a local scrolling test. '.repeat(8),
      })),
    }));
  });
  await page.goto(`${origin}/chat-harness.html`, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '#root { height: 650px; display: flex; flex-direction: column; }' });
  await page.waitForSelector('[data-chat-hydration="loading"]');
  const prematureWelcome = await page.locator('[data-ruphus-opening]').count() > 0;
  assert.equal(prematureWelcome, false, 'Do not show a fresh-chat greeting before saved history is known');
  await page.getByRole('status').filter({ hasText: 'Restoring your conversation' }).waitFor();
  await page.screenshot({ path: '/tmp/ruphus-chat-restoring.png' });
  await page.evaluate(() => window.releaseChatHistory());
  await page.waitForSelector('[data-chat-hydration="hydrated"]');
  await page.getByText(/Saved turn 15/).waitFor();
  const log = page.getByRole('log');
  const before = await log.evaluate(el => ({ top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight }));
  assert.ok(before.height > before.client, 'Real Chat log must overflow for this test');
  await log.hover();
  await page.mouse.wheel(0, -before.height);
  await page.waitForFunction(() => document.querySelector('[role="log"]').scrollTop === 0);
  const firstVisible = await page.getByText(/Saved turn 0\./).isVisible();
  assert.ok(firstVisible);
  await page.screenshot({ path: '/tmp/ruphus-real-chat-scroll-top.png' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-chat-hydration="loading"]');
  await page.evaluate(() => {
    localStorage.removeItem('chat_harness-user');
    window.releaseChatHistory();
  });
  await page.waitForSelector('[data-chat-hydration="hydrated"]');
  await page.locator('[data-ruphus-opening]').waitFor();
  assert.equal(await page.getByRole('status').filter({ hasText: 'Restoring your conversation' }).count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log(JSON.stringify({ prematureWelcomeWhileHistoryLoading: prematureWelcome,
    realChatBrowserScroll: 'passed', hydratedSavedTurns: 16, emptyHistoryWelcome: 'passed', networkWrites: 0,
    nativeScrollProven: false }));
} finally {
  await browser?.close();
  await server.close();
}
