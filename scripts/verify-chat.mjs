// Chat "Ruphus's study" gate (loop: chat-ruphus-study-100x). Proves the de-slop +
// character requirements over a committed harness:
//   R1 header de-slop (no "AI Chat" eyebrow, no gradient rule)
//   R2 Ruphus present (mascot avatar) + solid user bubble (no gradient)
//   R3 characterful canvas dot-matrix Ruphus-thinking indicator on loading
//   R4 tappable starter prompts (real buttons that send)
//   R6 solid send button (no gradient chrome)
//   R7-reduced-motion renders; zero console errors on the static render
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5194;
const URL = `http://localhost:${PORT}/chat-harness.html`;
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };

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

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const cleanup = () => { try { vite.kill('SIGKILL'); } catch { /* noop */ } };

try {
  await waitForServer(URL);
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
    // tap a starter to send (reaches handleSend → optimistic user bubble + loading=true,
    // BEFORE the network await). The harness AI call 404s fast, so poll tightly for the
    // indicator + bubble during the brief loading window.
    let userBubbleSolid = false, thinking = false;
    await page.getByText('Scan a bag', { exact: false }).first().click().catch(() => {});
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

  await browser.close();
} catch (e) {
  fail(e.message);
} finally {
  cleanup();
}

if (process.exitCode) console.error('verify-chat: FAILED');
else console.log('verify-chat: PASS');
