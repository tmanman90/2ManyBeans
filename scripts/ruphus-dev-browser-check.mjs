import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Real app/providers, standard Firebase SDK login, isolated fixture only.
// This entry check deliberately forbids model and recipe command dispatches.
export async function checkAuthenticatedDevEntry({ config, customToken, fixtureUid, savedAction = null, checkSessionBoundary = false, liveConversation = null, freshConversation = false }) {
  assert.equal(config.VITE_FIREBASE_PROJECT_ID, 'twomanybeans-ruphus-dev');
  const previous = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  const previousVariant = process.env.TMB_APP_VARIANT;
  Object.assign(process.env, config, { TMB_APP_VARIANT: 'dev' });
  let server;
  let browser;
  let page;
  let stage = 'start_server';
  const errors = [];
  const persistenceErrors = [];
  let completeDispatch;
  try {
    server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
    await server.listen();
    const address = server.httpServer.address();
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    page = await context.newPage();
    page.on('console', async message => {
      if (!message.text().startsWith('[ChatSession]')) return;
      const code = await message.args().at(-1)?.evaluate(value => typeof value?.code === 'string' && /^[a-z/-]+$/.test(value.code) ? value.code : null).catch(() => null);
      if (code) {
        persistenceErrors.push(code);
        console.log(JSON.stringify({ sessionPersistenceError: code }));
      }
    });
    await page.exposeFunction('reportFixtureProfile', value => console.log(JSON.stringify({ fixtureProfile: value })));
    const blockedApiPaths = [];
    page.on('pageerror', error => {
      // Emit only JS identifiers and local source locations, never arbitrary
      // exception text (which could contain request arguments or credentials).
      const identifier = error.message.match(/^([A-Za-z_$][\w$]*) is not defined$/)?.[1];
      const source = error.stack?.match(/\/src\/[A-Za-z0-9_./-]+\.(?:jsx?|tsx?)/)?.[0];
      const failure = { kind: error.name, ...(identifier ? { identifier } : {}), ...(source ? { source } : {}) };
      errors.push(failure);
      console.log(JSON.stringify({ browserRuntimeError: failure }));
    });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (liveConversation && url.origin === origin && url.pathname === '/api/ruphus-agent' && route.request().method() === 'POST') {
        try {
          const result = await liveConversation.dispatch(route.request().postDataJSON());
          await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: result.frames.map(frame => JSON.stringify(frame)).join('\n') + '\n' });
          completeDispatch?.(result);
          return;
        } catch {
          completeDispatch?.({ text: null });
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'dev_acceptance_turn_failed' }) });
        }
      }
      if (savedAction && url.origin === origin && url.pathname === '/api/recipe-command' && route.request().method() === 'POST') {
        try {
          const result = await savedAction.command(route.request().postDataJSON());
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
        } catch {
          return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'dev_acceptance_command_failed' }) });
        }
      }
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
    const firestoreModule = firebaseModule.code.match(/from\s+["']([^"']*firebase_firestore[^"']*)["']/)?.[1];
    assert.ok(firestoreModule);
    await page.evaluate(async ({ firestoreModule, fixtureUid }) => {
      const { db } = await import('/src/firebase.js');
      const { doc, onSnapshot } = await import(firestoreModule);
      onSnapshot(doc(db, 'users', fixtureUid), snapshot => {
        const data = snapshot.data();
        window.reportFixtureProfile({ exists: snapshot.exists(), consent: data?.aiDataConsent === true, pending: snapshot.metadata.hasPendingWrites, cache: snapshot.metadata.fromCache });
      }, () => window.reportFixtureProfile({ readError: true }));
    }, { firestoreModule, fixtureUid });
    stage = 'fixture_data_consent';
    const consent = page.getByRole('button', { name: 'I Understand and Agree', exact: true });
    await page.getByRole('button', { name: /^(I Understand and Agree|Chat)$/ }).first().waitFor();
    if (await consent.isVisible()) await consent.click();
    stage = 'open_chat';
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    // Auth/profile hydration can replace the initial navigation with the
    // consent gate. Wait for that real outcome rather than racing hydration.
    const agentEntry = page.locator('[data-ruphus-agent-enabled="true"]');
    await consent.or(agentEntry).first().waitFor();
    if (await consent.isVisible()) {
      stage = 'hydrated_fixture_data_consent';
      await consent.click();
      await consent.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Chat', exact: true }).click();
    }
    stage = 'verify_agent_entry';
    await agentEntry.waitFor();
    await page.locator('[data-ruphus-agent-enabled="true"][data-chat-hydration="hydrated"]').waitFor();
    if (freshConversation) {
      stage = 'fresh_owner_conversation';
      page.once('dialog', async dialog => {
        if (dialog.type() === 'confirm' && dialog.message() === 'Start a fresh conversation?') await dialog.accept();
        else await dialog.dismiss();
      });
      const newChat = page.getByRole('button', { name: 'New chat', exact: true });
      if (await newChat.isVisible()) await newChat.click();
      await page.getByRole('button', { name: 'What should I brew today?', exact: true }).waitFor();
    }
    if (liveConversation) {
      stage = 'typed_live_conversation';
      for (const message of liveConversation.turns.slice(0, liveConversation.trialJourney ? 3 : undefined)) {
        const input = page.getByPlaceholder('Ask Professor Ruphus...', { exact: true });
        let timeout;
        const dispatched = new Promise(resolve => {
          completeDispatch = resolve;
          timeout = setTimeout(() => resolve({ text: null }), 60000);
        });
        await input.fill(message);
        await input.press('Enter');
        const result = await dispatched;
        clearTimeout(timeout);
        assert.ok(result.text, 'Live dispatch must return a reply');
        await page.locator('[data-ruphus-message="agent-v3"]').filter({ hasText: result.text }).last().waitFor({ timeout: 60000 });
        await page.locator('[data-ruphus-agent-enabled="true"][aria-busy="false"]').waitFor({ timeout: 60000 });
      }
    }
    if (checkSessionBoundary) {
      stage = 'new_chat_boundary';
      page.once('dialog', async dialog => {
        if (dialog.type() === 'confirm' && dialog.message() === 'Start a fresh conversation?') await dialog.accept();
        else await dialog.dismiss();
      });
      await page.getByRole('button', { name: 'New chat', exact: true }).click();
      const boundary = await page.evaluate(async ({ firestoreModule, fixtureUid }) => {
        const { db } = await import('/src/firebase.js');
        const { doc, getDocFromServer, waitForPendingWrites, setDoc } = await import(firestoreModule);
        await waitForPendingWrites(db);
        const snapshot = await getDocFromServer(doc(db, 'users', fixtureUid, 'chatSessions', 'active'));
        const data = snapshot.data();
        const saved = data?.messages?.length > 0 && data.boundaryIndex === data.messages.length;
        if (!saved) {
          const { startNewChat } = await import('/src/lib/ruphus/session.js');
          try {
            await setDoc(doc(db, 'users', fixtureUid, 'chatSessions', 'active'), startNewChat(data));
            return { saved: false, directPayloadAccepted: true };
          } catch (error) {
            return { saved: false, directPayloadAccepted: false, permissionDenied: error.code === 'permission-denied' };
          }
        }
        return { saved };
      }, { firestoreModule, fixtureUid });
      console.log(JSON.stringify({ newChatBoundary: boundary }));
      assert.equal(boundary.saved, true, 'New chat must persist its boundary on the server');
    }
    if (savedAction) {
      stage = 'restored_proposal_card';
      const proposal = page.locator('[data-artifact="recipe_proposal"]');
      await proposal.or(consent).first().waitFor();
      if (await consent.isVisible()) {
        stage = 'proposal_consent_click';
        await consent.click();
        stage = 'proposal_consent_saved';
        await consent.waitFor({ state: 'hidden' });
        stage = 'proposal_chat_navigation';
        await page.getByRole('button', { name: 'Chat', exact: true }).click();
      }
      stage = 'proposal_visible';
      await proposal.waitFor();
      stage = 'proposal_screenshot';
      await proposal.screenshot({ path: '/tmp/ruphus-authenticated-proposal.png' });
      stage = 'update_saved_recipe';
      if (liveConversation?.trialJourney) {
        stage = 'try_once';
        await proposal.getByRole('button', { name: 'Try for one brew', exact: true }).click();
        // Brew once hands off to the timer, rather than leaving Chat visible.
        await page.getByRole('button', { name: 'Close brew timer', exact: true }).waitFor();
        await page.evaluate(async firestoreModule => { const { db } = await import('/src/firebase.js'); const { waitForPendingWrites } = await import(firestoreModule); await waitForPendingWrites(db); }, firestoreModule);
        const savedTranscript = await page.evaluate(async ({ firestoreModule, fixtureUid }) => {
          const { db } = await import('/src/firebase.js');
          const { doc, getDocFromServer } = await import(firestoreModule);
          const saved = (await getDocFromServer(doc(db, 'users', fixtureUid, 'chatSessions', 'active'))).data();
          return { messages: saved?.messages?.length || 0, artifacts: (saved?.messages || []).flatMap(item => item.artifacts || []).map(item => item.type) };
        }, { firestoreModule, fixtureUid });
        console.log(JSON.stringify({ savedTranscript }));
        stage = 'return_after_trial';
        await page.reload({ waitUntil: 'domcontentloaded' });
        // This operator check deliberately uses memory-only auth, so restore
        // the same fixture identity through the supported SDK after reload.
        await page.evaluate(async ({ authModule, customToken, fixtureUid }) => {
          const { auth } = await import('/src/firebase.js');
          const { signInWithCustomToken } = await import(authModule);
          const result = await signInWithCustomToken(auth, customToken);
          if (result.user.uid !== fixtureUid) throw new Error('Wrong fixture identity');
        }, { authModule, customToken, fixtureUid });
        // The unfinished attempt is deliberately restored on relaunch.
        await page.getByRole('button', { name: 'Close brew timer', exact: true }).click();
        await page.getByRole('button', { name: 'Stop', exact: true }).click();
        await page.getByText('Hand Brew Recipe', { exact: true }).locator('..').getByRole('button', { name: 'Close', exact: true }).click();
        await page.getByText('Your first bean!', { exact: true }).waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Chat', exact: true }).click();
        await page.locator('[data-artifact="action_receipt"]').waitFor();
        const input = page.getByPlaceholder('Ask Professor Ruphus...', { exact: true });
        await input.fill(liveConversation.turns[3]);
        await input.press('Enter');
        const recovered = page.locator('[data-artifact="action_receipt"][data-status="ready"]');
        await recovered.waitFor({ timeout: 60000 });
        await recovered.locator('summary').click();
        assert.match(await recovered.innerText(), /Trial recipe/);
        await recovered.screenshot({ path: '/tmp/ruphus-live-trial-review.png' });
        await recovered.getByRole('button', { name: 'Make this my recipe', exact: true }).click();
        await page.getByText('This trial is now your saved recipe.', { exact: true }).waitFor();
      } else await proposal.getByRole('button', { name: 'Update saved recipe', exact: true }).click();
      if (!liveConversation?.trialJourney) await page.locator('[data-artifact="action_receipt"][data-status="succeeded"]').waitFor();
      await savedAction.verify();
      await page.screenshot({ path: '/tmp/ruphus-authenticated-saved.png', fullPage: false });
      if (liveConversation) {
        stage = 'new_chat_after_live_turns';
        page.once('dialog', async dialog => {
          if (dialog.type() === 'confirm' && dialog.message() === 'Start a fresh conversation?') await dialog.accept();
          else await dialog.dismiss();
        });
        await page.getByRole('button', { name: 'New chat', exact: true }).click();
        const boundary = await page.evaluate(async ({ firestoreModule, fixtureUid }) => {
          const { db } = await import('/src/firebase.js');
          const { doc, getDocFromServer, waitForPendingWrites } = await import(firestoreModule);
          await waitForPendingWrites(db);
          const data = (await getDocFromServer(doc(db, 'users', fixtureUid, 'chatSessions', 'active'))).data();
          return { count: data.messages.length, boundaryIndex: data.boundaryIndex, evidenceCleared: data.ledger.entries.length === 0 };
        }, { firestoreModule, fixtureUid });
        assert.ok(boundary.count >= liveConversation.turns.length * 2, 'New chat must retain the conversation just completed, not only the initial hydration');
        assert.equal(boundary.boundaryIndex, boundary.count);
        assert.equal(boundary.evidenceCleared, true);
      }
    }
    const text = await page.locator('body').innerText();
    assert.match(text, /Professor Ruphus|Your rotation, your taste/i);
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    assert.deepEqual(errors, []);
    assert.equal(blockedApiPaths.length, 0, 'Entry must not dispatch model or command requests');
    const screenshot = '/tmp/ruphus-authenticated-chat.png';
    await page.evaluate(async firestoreModule => {
      const { db } = await import('/src/firebase.js');
      const { waitForPendingWrites } = await import(firestoreModule);
      await waitForPendingWrites(db);
    }, firestoreModule);
    assert.equal(persistenceErrors.length, 0, 'Chat persistence errors invalidate browser acceptance');
    if (liveConversation && !liveConversation.trialJourney) {
      const restored = await page.evaluate(async ({ firestoreModule, fixtureUid }) => {
        const { db } = await import('/src/firebase.js');
        const { doc, getDocFromServer } = await import(firestoreModule);
        const data = (await getDocFromServer(doc(db, 'users', fixtureUid, 'chatSessions', 'active'))).data();
        const active = (data?.messages || []).slice(data?.boundaryIndex || 0);
        return { userText: active.filter(message => message.role === 'user').at(-1)?.text, hasReply: active.at(-1)?.role === 'assistant' };
      }, { firestoreModule, fixtureUid });
      assert.equal(restored.userText, liveConversation.turns.at(-1), 'Latest typed turn must survive server restoration');
      assert.equal(restored.hasReply, true, 'Latest reply must survive server restoration');
    }
    console.log(JSON.stringify({ chatGeometry: await page.locator('[role="log"]').evaluate(node => ({ scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom, cards: node.querySelectorAll('[data-artifact="recipe_proposal"]').length })) }));
    await page.screenshot({ path: screenshot, fullPage: false });
    return { passed: true, authenticated: true, agentEnabled: true, entry: 'Rotation → Chat', savedAction: Boolean(savedAction), viewport: '390×844', screenshot, modelDispatches: liveConversation?.turns.length || 0, typedConversation: Boolean(liveConversation), nativeUiTest: false };
  } catch (error) {
    const screenshot = `/tmp/ruphus-authenticated-entry-failure-${Date.now()}.png`;
    const screenshotSaved = page ? await page.screenshot({ path: screenshot, fullPage: false }).then(() => true).catch(() => false) : false;
    const visible = page ? await page.evaluate(() => ({
      consent: [...document.querySelectorAll('button')].some(button => button.textContent === 'I Understand and Agree'),
      agent: Boolean(document.querySelector('[data-ruphus-agent-enabled="true"]')),
      proposals: document.querySelectorAll('[data-artifact="recipe_proposal"]').length,
      restoredReply: document.body.innerText.includes('Review this saved recipe proposal.'),
      continuePrevious: document.body.innerText.includes('Continue previous'),
    })).catch(() => null) : null;
    // Do not print Playwright evaluation arguments, auth objects, or error stacks.
    console.log(JSON.stringify({ browserStage: stage, screenshot: screenshotSaved ? screenshot : null, screenshotSaved, visible, timedOut: error.name === 'TimeoutError', strictLocator: error.message.includes('strict mode violation'), targetClosed: /Target.*closed/.test(error.message), errors }));
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
