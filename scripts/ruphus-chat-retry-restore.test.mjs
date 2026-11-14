import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Browser plugin is not available in this checkout; this uses the existing
// local ChatTab harness and regular Playwright against the Agent path.
Object.assign(process.env, {
  TMB_APP_VARIANT: 'dev',
  VITE_FIREBASE_API_KEY: 'local-retry-probe-not-a-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'local-retry-probe.invalid',
  VITE_FIREBASE_PROJECT_ID: 'local-retry-probe',
  VITE_FIREBASE_STORAGE_BUCKET: 'local-retry-probe.invalid',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:local-retry-probe',
});

const responseBodyFor = (turnId) => [
  { version: 1, turnId, type: 'turn_accepted' },
  { version: 1, turnId, type: 'context_loading' },
  { version: 1, turnId, type: 'text_delta', text: 'RETRIED AGENT RESPONSE' },
  { version: 1, turnId, type: 'turn_completed', text: 'RETRIED AGENT RESPONSE' },
  { type: 'usage', usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' },
].map(frame => JSON.stringify(frame)).join('\n') + '\n';
const failureBodyFor = (turnId) => [
  { version: 1, turnId, type: 'turn_accepted' },
  { version: 1, turnId, type: 'context_loading' },
  { version: 1, turnId, type: 'turn_failed' },
].map(frame => JSON.stringify(frame)).join('\n') + '\n';

const server = await createServer({
  // Model an auth failure where cloud history never received the failed turn.
  // Exercise the real hydration hook with a stale remote, not one shared cache
  // pretending to be both local storage and Firestore.
  plugins: [{ name: 'stale-remote-chat', enforce: 'pre', transform(source, id) {
    if (!id.endsWith('/chat-harness.jsx')) return null;
    const seam = 'loadRemote: async () => loadHarnessSession(),';
    assert.ok(source.includes(seam));
    return source.replace(seam, 'loadRemote: async () => JSON.parse(localStorage.getItem("remote_chat_harness")),');
  } }],
  server: { host: '127.0.0.1', port: 0 },
  // Pin the compile-time Agent gate for this local-only harness.
  define: { __APP_VARIANT__: JSON.stringify('dev') },
  logLevel: 'silent',
});
await server.listen();
const address = server.httpServer.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
let requestCount = 0;

try {
  const page = await browser.newPage({ viewport: { width: 402, height: 900 } });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname !== '/api/ruphus-agent') return route.continue();
    const attempt = ++requestCount;
    const body = JSON.parse(route.request().postData() || '{}');
    if (attempt <= 2) {
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: failureBodyFor(body.turnId) });
    }
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: responseBodyFor(body.turnId) });
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem('chat_harness-user')) {
      localStorage.setItem('chat_harness-user', JSON.stringify({
        protocolVersion: 1,
        messages: [],
        turns: [],
        contextRef: { sessionId: 'te07-retry-session', surface: 'chat' },
        boundaryIndex: 0,
      }));
    }
    if (!localStorage.getItem('remote_chat_harness')) localStorage.setItem('remote_chat_harness', localStorage.getItem('chat_harness-user'));
  });
  await page.goto(`${origin}/chat-harness.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ruphus-agent-enabled="true"]').waitFor();
  const starter = page.locator('[data-ruphus-opening="true"] button').filter({ hasText: 'What should I brew today?' });
  await starter.click();
  await page.locator('[data-chat-errored="true"]').waitFor();
  assert.equal(requestCount, 1, 'first Agent request must fail through the local transport');

  const persisted = JSON.parse(await page.evaluate(() => localStorage.getItem('chat_harness-user')));
  const failed = persisted.messages.find(message => message.errored);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('remote_chat_harness'))).messages.length, 0, 'remote remains stale after failed transport');
  assert.ok(failed, 'failed Agent message must be persisted explicitly');
  assert.deepEqual(failed.retry, {
    kind: 'agent',
    text: 'What should I brew today?',
    contextRef: { sessionId: 'te07-retry-session', surface: 'chat' },
  });
  assert.equal('retryTurn' in failed, false, 'persisted retry must not contain runtime request state');
  assert.equal('apiMsg' in failed, false, 'persisted retry must not contain the request body');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-ruphus-agent-enabled="true"]').waitFor();
  const restoredError = page.locator('[data-chat-errored="true"]');
  await restoredError.waitFor();
  assert.match(await restoredError.innerText(), /Didn't finish.*tap to retry/);
  // Persist the restored error again alongside a separate failed turn. This
  // catches restore paths that rebuild only the runtime retryTurn and then
  // silently lose the safe descriptor on the next session write.
  const input = page.getByPlaceholder('Ask Professor Ruphus...');
  await input.fill('Please try that again another way.');
  await input.press('Enter');
  await page.locator('[data-chat-errored="true"]').nth(1).waitFor();
  assert.equal(requestCount, 2, 'a second failed Agent turn must persist the restored error again');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-ruphus-agent-enabled="true"]').waitFor();
  const rehydratedErrors = page.locator('[data-chat-errored="true"]');
  await rehydratedErrors.nth(1).waitFor();
  assert.equal(await rehydratedErrors.count(), 2, 'both explicit retry records must survive the second reload');
  await rehydratedErrors.first().click();
  await page.locator('[data-ruphus-message="agent-v3"]').filter({ hasText: 'RETRIED AGENT RESPONSE' }).waitFor();
  assert.equal(requestCount, 3, 'restored retry must issue exactly one new Agent request');
  console.log(JSON.stringify({ failedTurnPersisted: true, retryAffordanceRestored: true, retrySurvivedRepersist: true, retryCompleted: true, requestCount: 3 }));
} finally {
  await browser.close();
  await server.close();
}
