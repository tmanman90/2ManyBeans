import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Exercise the production ChatTab in its local-only harness with a deliberately
// delayed Agent response. This does not authenticate or call a live provider.
Object.assign(process.env, {
  TMB_APP_VARIANT: 'dev',
  VITE_FIREBASE_API_KEY: 'local-cancellation-probe-not-a-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'local-cancellation-probe.invalid',
  VITE_FIREBASE_PROJECT_ID: 'local-cancellation-probe',
  VITE_FIREBASE_STORAGE_BUCKET: 'local-cancellation-probe.invalid',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:local-cancellation-probe',
});

const server = await createServer({
  server: { host: '127.0.0.1', port: 0 },
  // Pin the compile-time gate in this local-only harness; runtime env alone
  // must not accidentally turn this into a legacy-path test.
  define: { __APP_VARIANT__: JSON.stringify('dev') },
  logLevel: 'silent',
});
await server.listen();
const address = server.httpServer.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 402, height: 900 } });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    return route.continue();
  });
  await page.addInitScript(() => {
    localStorage.setItem('chat_harness-user', JSON.stringify({
      protocolVersion: 1,
      messages: [],
      turns: [],
      contextRef: { sessionId: 'te07-session', surface: 'chat' },
      boundaryIndex: 0,
    }));
  });
  await page.goto(`${origin}/chat-harness.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-ruphus-agent-enabled="true"]').waitFor();
  await page.getByText('What should I brew today?', { exact: true }).first().waitFor();

  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    const responseFor = (turnId, text, artifactText) => new Response(
      [
        { version: 1, turnId, type: 'turn_accepted' },
        { version: 1, turnId, type: 'context_loading' },
        { version: 1, turnId, type: 'artifact_ready', artifact: { id: `${text}-ARTIFACT`, type: 'current_recipe', status: 'ready', recipe: { coffeeGrams: 16, waterMilliliters: 195.56, steps: [{ action: artifactText }] } } },
        { version: 1, turnId, type: 'text_delta', text },
        { version: 1, turnId, type: 'turn_completed', text },
        { type: 'usage', usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' },
      ].map(frame => JSON.stringify(frame)).join('\n') + '\n',
      { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
    );
    window.__TE07 = { count: 0, signals: [], releaseOld: null };
    window.fetch = (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
      if (url.origin !== window.location.origin) return Promise.reject(new Error('non-local fetch blocked by TE07 harness'));
      if (url.pathname !== '/api/ruphus-agent') return originalFetch(input, init);
      const attempt = ++window.__TE07.count;
      window.__TE07.signals.push(Boolean(init.signal));
      const turnId = JSON.parse(init.body).turnId;
      if (attempt === 1) {
        return new Promise(resolve => { window.__TE07.releaseOld = () => resolve(responseFor(turnId, 'OLD AGENT RESPONSE', 'OLD ARTIFACT INSTRUCTIONS')); });
      }
      return Promise.resolve(responseFor(turnId, 'NEW AGENT RESPONSE', 'NEW ARTIFACT INSTRUCTIONS'));
    };
  });

  await page.getByText('What should I brew today?', { exact: true }).first().click();
  await page.waitForFunction(() => window.__TE07.count === 1);
  await page.getByRole('button', { name: 'New chat', exact: true }).waitFor();

  page.once('dialog', async dialog => {
    assert.equal(dialog.type(), 'confirm');
    assert.equal(dialog.message(), 'Start a fresh conversation?');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.getByText('What should I brew today?', { exact: true }).first().waitFor();

  await page.evaluate(() => window.__TE07.releaseOld());
  await page.waitForTimeout(250);
  const afterOldResponse = await page.locator('body').innerText();
  assert.equal(afterOldResponse.includes('OLD AGENT RESPONSE'), false, 'old Agent response must not repopulate the new chat');
  assert.equal(afterOldResponse.includes('OLD ARTIFACT INSTRUCTIONS'), false, 'old Agent artifact must not render in the new chat');
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('chat_harness-user') || '{}')).messages?.some(message => message.text === 'OLD AGENT RESPONSE'), false, 'old Agent response must not persist after New chat');

  // Target the fresh opening action itself. During the New-chat transition an
  // exiting old user bubble can still contain the same starter text, but it
  // is not actionable and clicking it would never issue the second Agent turn.
  const freshStarter = page.locator('[data-ruphus-opening="true"] button').filter({ hasText: 'What should I brew today?' });
  await freshStarter.click();
  await page.waitForFunction(() => window.__TE07.count === 2);
  await page.locator('[data-ruphus-message="agent-v3"]').filter({ hasText: 'NEW AGENT RESPONSE' }).waitFor();
  await page.getByText('NEW ARTIFACT INSTRUCTIONS', { exact: true }).waitFor({ timeout: 5000 });
  const transport = await page.evaluate(() => ({ count: window.__TE07.count, signals: window.__TE07.signals }));
  assert.deepEqual(transport, { count: 2, signals: [true, true] }, 'each turn must receive an abort signal and the new turn must remain usable');
  console.log(JSON.stringify({ oldAgentResponseIgnored: true, oldAgentArtifactIgnored: true, oldResponsePersisted: false, newAgentTurnCompleted: true, transport }));
} finally {
  await browser.close();
  await server.close();
}
