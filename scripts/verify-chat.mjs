// Chat "Ruphus's study" gate (loop: chat-ruphus-study-100x). Proves the de-slop +
// character requirements over a committed harness:
//   R1 header de-slop (no "AI Chat" eyebrow, no gradient rule)
//   R2 Ruphus present (mascot avatar) + solid user bubble (no gradient)
//   R3 characterful canvas dot-matrix Ruphus-thinking indicator on loading
//   R4 tappable starter prompts (real buttons that send)
//   R6 solid send button (no gradient chrome)
//   R7-reduced-motion renders; zero console errors on the static render
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const PORT = 5194;
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const canListen = await canBindLocalPort();
const staticOutDir = `/tmp/coffee-chat-harness-${process.pid}`;
const URL = canListen
  ? `http://localhost:${PORT}/chat-harness.html`
  : pathToFileURL(`${staticOutDir}/chat-harness.html`).toString();

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try { const r = await fetch(url); if (r.ok) return resolve(); } catch { /* not up */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('vite did not start'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

const noGradient = () => [...document.querySelectorAll('*')].every(el => !(getComputedStyle(el).backgroundImage || '').includes('linear-gradient'));
const streamUrl = (params = '') => `${URL}?stream=1${params}${canListen ? '' : '&inline=1'}`;

function canBindLocalPort() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => res.end('ok'));
    server.once('error', () => resolve(false));
    server.listen(0, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function buildStaticHarness() {
  const configPath = `/tmp/vite-chat-harness-${process.pid}.config.mjs`;
  const root = process.cwd().replace(/\\/g, '/');
  writeFileSync(configPath, `import base from ${JSON.stringify(`${root}/vite.config.js`)};
export default {
  ...base,
  base: './',
  build: {
    ...base.build,
    outDir: ${JSON.stringify(staticOutDir)},
    emptyOutDir: false,
    rollupOptions: {
      ...(base.build?.rollupOptions || {}),
      input: ${JSON.stringify(`${root}/chat-harness.html`)},
    },
  },
};
`);
  execFileSync('npx', ['vite', 'build', '--config', configPath], { stdio: 'ignore' });
}

function killPortListeners(port) {
  try {
    const pids = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' })
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    for (const pid of pids) {
      try { process.kill(Number(pid), 'SIGKILL'); } catch { /* noop */ }
    }
  } catch { /* no listener */ }
}

function waitForPostServer(url, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try { const r = await fetch(url, { method: 'POST' }); if (r.ok) return resolve(); } catch { /* not up */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('stream mock did not start'));
      setTimeout(tick, 200);
    };
    tick();
  });
}

async function waitForStreamingDone(page) {
  await page.waitForFunction(() => !document.querySelector('[data-streaming-bubble="true"]'), null, { timeout: 8000 });
}

if (!canListen) buildStaticHarness();
if (canListen) killPortListeners(PORT);
const vite = canListen
  ? spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  : null;
let streamMock = null;
const cleanup = () => {
  try { vite?.kill('SIGKILL'); } catch { /* noop */ }
  try { streamMock?.kill('SIGKILL'); } catch { /* noop */ }
};

try {
  if (canListen) await waitForServer(URL);
  const browser = await chromium.launch();

  // ---- Pass 1: header + intro + starters + no gradient + no errors ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    // R1 — header: "Chat" title, NO "AI Chat" eyebrow, NO gradient rule (no linear-gradient anywhere).
    const titleOk = await page.getByText('Chat', { exact: true }).first().isVisible().catch(() => false);
    const eyebrow = await page.getByText('AI Chat', { exact: false }).count();
    const cleanGradient = await page.evaluate(noGradient);
    if (!titleOk) fail('R1: "Chat" title missing');
    if (eyebrow > 0) fail('R1: "AI Chat" eyebrow survives');
    if (!cleanGradient) fail('R1/R6: a linear-gradient survives in the chat (rule/bubble/send chrome)');
    if (titleOk && eyebrow === 0 && cleanGradient) console.log('OK  header de-slopped, no gradient chrome');

    // R2 — Ruphus present: the mascot avatar renders (intro).
    const avatar = await page.locator('img[alt="Professor Ruphus"], img[alt="Ruphus"]').count();
    if (avatar < 1) fail('R2: Ruphus mascot avatar missing');
    else console.log(`OK  Ruphus is present (${avatar} avatar)`);

    // R4 — starter prompts are real BUTTONS (tappable), not inert divs.
    const starter = await page.evaluate(() => {
      const el = [...document.querySelectorAll('button')].find(b => /Scan a bag/i.test(b.textContent || ''));
      return !!el;
    });
    if (!starter) fail('R4: starter prompts are not tappable buttons');
    else console.log('OK  tappable starter prompts');

    const rotationStarter = await page.evaluate(() =>
      [...document.querySelectorAll('button')].some(b => /Jar \d|open \d+ days/.test(b.textContent || ''))
    );
    if (!rotationStarter) fail('R4/R19: rotation-derived starter missing');
    else console.log('OK  rotation-aware starter prompt');

    await page.evaluate(() => {
      window.__FILE_INPUT_CLICKS__ = 0;
      document.addEventListener('click', (event) => {
        if (event.target?.matches?.('input[type="file"]')) window.__FILE_INPUT_CLICKS__ += 1;
      }, { capture: true, once: false });
    });
    await page.getByText('Scan a bag', { exact: true }).first().click();
    await page.waitForTimeout(100);
    const scanState = await page.evaluate(() => {
      const userBubbles = [...document.querySelectorAll('div')].filter(d => {
        const s = getComputedStyle(d);
        return (s.backgroundColor || '').replace(/\s/g, '') === 'rgb(162,99,47)' && !(s.backgroundImage || '').includes('gradient');
      }).length;
      return { clicks: window.__FILE_INPUT_CLICKS__ || 0, userBubbles };
    });
    if (scanState.clicks < 1) fail('R5: scan starter did not trigger file input');
    else if (scanState.userBubbles > 0) fail('R5: scan starter created a user bubble');
    else console.log('OK  scan starter opens picker without sending');

    if (errors.length) fail('console/page errors on render: ' + JSON.stringify(errors.slice(0, 6)));
    await page.close();
  }

  // ---- Pass 2: send → solid user bubble + Ruphus-thinking indicator (AI call expected to error) ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    // Hold the AI request open so `loading` stays true long enough to observe the indicator.
    await page.route('**/api/**', async route => { await new Promise(r => setTimeout(r, 2500)); route.abort(); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    // tap a text starter to send (reaches handleSend → optimistic user bubble + loading=true,
    // BEFORE the network await). The harness AI call 404s fast, so poll tightly for the
    // indicator + bubble during the brief loading window.
    let userBubbleSolid = false, thinking = false;
    await page.getByText('What should I brew today?', { exact: true }).first().click().catch(() => {});
    for (let i = 0; i < 60; i++) {
      const state = await page.evaluate(() => {
        const bubble = [...document.querySelectorAll('div')].some(d => {
          const s = getComputedStyle(d);
          return (s.backgroundColor || '').replace(/\s/g, '') === 'rgb(162,99,47)' && !(s.backgroundImage || '').includes('gradient');
        });
        const think = document.querySelector('[data-chat-typing="true"] [data-dot-matrix-loader="true"] canvas') != null;
        return { bubble, think };
      });
      if (state.bubble) userBubbleSolid = true;
      if (state.think) thinking = true;
      if (userBubbleSolid && thinking) break;
      await page.waitForTimeout(20);
    }
    if (!userBubbleSolid) fail('R2: solid (non-gradient) user bubble did not render after send');
    else if (!thinking) fail('R3: canvas dot-matrix Ruphus-thinking indicator did not render on loading');
    else console.log('OK  solid user bubble + canvas dot-matrix Ruphus-thinking indicator');
    await page.close();
  }

  // ---- Pass 3: reduced motion renders, no errors ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const intro = await page.getByText('Professor Ruphus', { exact: false }).first().isVisible().catch(() => false);
    if (!intro) fail('R7: reduced-motion — chat did not render');
    else console.log('OK  reduced-motion: chat renders');
    if (errors.length) fail('reduced-motion errors: ' + JSON.stringify(errors.slice(0, 4)));
    await page.close();
  }

  // ---- Pass 4: streaming UI, partial retry, reduced motion ----
  {
    if (canListen) {
      killPortListeners(5197);
      streamMock = spawn('node', ['scripts/stream-mock-server.mjs', '5197'], { stdio: 'ignore' });
      await waitForPostServer('http://localhost:5197/api/claude', 10000);
    }

    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(streamUrl(), { waitUntil: 'networkidle' });
    await page.getByText('What should I brew today?', { exact: true }).first().click();
    const thinking = await page.waitForSelector('[data-chat-typing="true"] [data-dot-matrix-loader="true"] canvas', { timeout: 2500 }).then(() => true).catch(() => false);
    if (!thinking) fail('Pass 4: thinking indicator did not appear before stream text');
    await page.waitForSelector('[data-streaming-bubble="true"]', { timeout: 4000 });
    const lengths = [];
    for (let i = 0; i < 4; i += 1) {
      lengths.push(await page.locator('[data-streaming-bubble="true"] .chat-streaming-text').innerText().then(t => t.length).catch(() => 0));
      await page.waitForTimeout(150);
    }
    const increases = lengths.slice(1).filter((len, idx) => len > lengths[idx]).length;
    if (increases < 2) fail(`Pass 4: streaming text did not progressively increase enough (${lengths.join(',')})`);
    await waitForStreamingDone(page);
    const finalKiawamururu = await page.getByText('Kiawamururu', { exact: false }).count();
    const assistantBubbles = await page.locator('img[alt="Professor Ruphus"]').count();
    if (assistantBubbles < 2 || finalKiawamururu < 1) fail('Pass 4: final streamed message was not committed');
    else console.log('OK  streaming: loader, progressive text, committed final message');
    await page.close();

    const errorPage = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    await errorPage.goto(streamUrl('&error=mid'), { waitUntil: 'networkidle' });
    await errorPage.getByText('What should I brew today?', { exact: true }).first().click();
    await errorPage.waitForSelector('[data-chat-errored="true"]', { timeout: 6000 });
    const partial = await errorPage.getByText('Kiawamururu', { exact: false }).count();
    const retry = await errorPage.getByText("Didn't finish — tap to retry", { exact: true }).count();
    if (partial < 1 || retry < 1) fail('Pass 4: mid-stream error did not keep partial text with retry affordance');
    else console.log('OK  streaming: mid-stream error keeps partial + retry');
    await errorPage.close();

    const reducePage = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    await reducePage.goto(streamUrl(), { waitUntil: 'networkidle' });
    await reducePage.getByText('What should I brew today?', { exact: true }).first().click();
    await reducePage.waitForSelector('[data-streaming-bubble="true"]', { timeout: 4000 });
    const reducedLengths = [];
    for (let i = 0; i < 4; i += 1) {
      reducedLengths.push(await reducePage.locator('[data-streaming-bubble="true"] .chat-streaming-text').innerText().then(t => t.length).catch(() => 0));
      await reducePage.waitForTimeout(150);
    }
    const reducedIncreases = reducedLengths.slice(1).filter((len, idx) => len > reducedLengths[idx]).length;
    if (reducedIncreases < 2) fail(`Pass 4: reduced-motion streaming did not progressively render (${reducedLengths.join(',')})`);
    else console.log('OK  streaming: reduced-motion still streams text');
    await reducePage.close();

    const recipePage = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    await recipePage.goto(streamUrl('&recipe=1'), { waitUntil: 'networkidle' });
    await recipePage.getByText('What should I brew today?', { exact: true }).first().click();
    await waitForStreamingDone(recipePage);
    const recipeTitle = await recipePage.getByText('Kiawamururu Morning Pour', { exact: true }).count();
    const gradientClean = await recipePage.evaluate(noGradient);
    const tabular = await recipePage.locator('[data-recipe-card="true"]').evaluate(el => getComputedStyle(el.querySelector('li') || el).fontVariantNumeric.includes('tabular-nums')).catch(() => false);
    if (recipeTitle < 1) fail('Pass 4: recipe card title did not render');
    if (!tabular) fail('Pass 4: recipe card numerals are not tabular');
    if (!gradientClean) fail('Pass 4: linear-gradient found after recipe card render');
    await recipePage.getByText('Save to bean notes', { exact: true }).click();
    const saving = await recipePage.getByText('Saving…', { exact: true }).isVisible().catch(() => false);
    if (!saving) fail('Pass 4: Save to bean notes did not show saving state');
    else console.log('OK  recipe card: title, tabular nums, no gradients, saving state');
    await recipePage.close();
  }

  // ---- Pass 6: persistence round-trip + New chat clear ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(streamUrl(), { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('chat_harness-user'));
    await page.reload({ waitUntil: 'networkidle' });

    await page.getByText('What should I brew today?', { exact: true }).first().click();
    await waitForStreamingDone(page);
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('chat_harness-user');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.messages) && parsed.messages.length === 2;
    }, null, { timeout: 4000 });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.innerText.includes('Kiawamururu'), null, { timeout: 4000 });
    const restoredOrder = await page.evaluate(() => {
      const body = document.body.innerText;
      return body.indexOf('What should I brew today?') >= 0
        && body.indexOf('Kiawamururu') > body.indexOf('What should I brew today?');
    });
    const introSuppressed = await page.getByText("Ask me anything about your rotation", { exact: false }).count();
    const starterSuppressed = await page.getByText('Scan a bag', { exact: true }).count();
    if (!restoredOrder) fail('Pass 6: persisted user/assistant messages did not restore in order');
    if (introSuppressed > 0 || starterSuppressed > 0) fail('Pass 6: intro card/starters were not suppressed after restore');

    await page.getByPlaceholder('Ask Professor Ruphus...').fill('How should I dial this next?');
    await page.keyboard.press('Enter');
    await waitForStreamingDone(page);
    const duplicateKeyErrors = errors.filter(error => /same key|Encountered two children/.test(error));
    if (duplicateKeyErrors.length) fail('Pass 6: duplicate React key console error after resume-then-send: ' + duplicateKeyErrors[0]);

    const newChatVisible = await page.getByText('New chat', { exact: true }).isVisible().catch(() => false);
    if (!newChatVisible) fail('Pass 6: New chat action missing after restore');
    page.on('dialog', dialog => dialog.accept());
    await page.getByText('New chat', { exact: true }).click();
    await page.waitForFunction(() => localStorage.getItem('chat_harness-user') === null, null, { timeout: 4000 });
    const introReturned = await page.getByText('Professor Ruphus', { exact: true }).isVisible().catch(() => false);
    const startersReturned = await page.getByText('Scan a bag', { exact: true }).isVisible().catch(() => false);
    if (!introReturned || !startersReturned) fail('Pass 6: New chat did not restore intro + starters');
    else console.log('OK  persistence: restore, resume send, New chat clears local session');
    if (errors.filter(error => !/same key|Encountered two children/.test(error)).length) {
      fail('Pass 6: console/page errors: ' + JSON.stringify(errors.slice(0, 6)));
    }
    await page.close();
  }

  // ---- Pass 7: search two-pass + sourced footer ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(streamUrl('&search=1'), { waitUntil: 'networkidle' });
    await page.getByText('What should I brew today?', { exact: true }).first().click();
    // RuphusThinking appends an ellipsis to every caption, so match on the
    // substring — the visible-query contract is the query text, not framing.
    const caption = await page.getByText('Searching the web: "best kenyan releases 2026"', { exact: false })
      .first()
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!caption) fail('Pass 7: search loader caption with visible query did not render');

    await page.waitForFunction(() => document.body.innerText.includes('washed Nyeri lot'), null, { timeout: 8000 });
    await waitForStreamingDone(page);
    const state = await page.evaluate(() => {
      const body = document.body.innerText;
      const sourceRows = [...document.querySelectorAll('[data-chat-sources="true"] button')];
      return {
        markerVisible: /NEEDS_SEARCH|END_SEARCH|---/.test(body),
        finalCount: (body.match(/washed Nyeri lot/g) || []).length,
        sourceRows: sourceRows.length,
        rowHeight: sourceRows[0]?.getBoundingClientRect?.().height || 0,
        rowTag: sourceRows[0]?.tagName || '',
        badSchemesVisible: /javascript:|someapp:/.test(body),
      };
    });
    if (state.markerVisible) fail('Pass 7: marker text became visible');
    if (state.finalCount !== 1) fail(`Pass 7: expected one final answer, saw ${state.finalCount}`);
    if (state.sourceRows !== 1) fail(`Pass 7: expected exactly one HTTPS source row, saw ${state.sourceRows}`);
    if (state.badSchemesVisible) fail('Pass 7: unsafe source schemes rendered');
    if (state.rowHeight < 44 || state.rowTag !== 'BUTTON') fail(`Pass 7: source row is not tappable enough (${state.rowTag}, ${state.rowHeight}px)`);
    else console.log('OK  search: two-pass answer, marker hidden, HTTPS source footer only');
    await page.close();
  }

  await browser.close();
} catch (e) {
  fail(e.message);
} finally {
  // The browser must die here too: a failure thrown before browser.close()
  // otherwise leaves Playwright's children holding the event loop open —
  // the script prints FAILED and then hangs forever (the 6-hour overnight
  // stall). Belt-and-suspenders: hard-exit after the verdict prints.
  try { await browser?.close(); } catch { /* noop */ }
  cleanup();
}

if (process.exitCode) console.error('verify-chat: FAILED');
else console.log('verify-chat: PASS');
process.exit(process.exitCode || 0);
