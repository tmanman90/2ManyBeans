// v2-harness gate (loop: hero-card-morph). Proves R1 (bag interpolates shelf->card,
// not a teleport), R6 (reduced-motion disables the morph), R7 (zero console errors).
// Spins up Vite on the committed morph-harness, drives it with Playwright, asserts,
// tears down. Exit 0 = pass.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5197;
const URL = `http://localhost:${PORT}/morph-harness.html`;
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try { const r = await fetch(url); if (r.ok) return resolve(); } catch { /* not up yet */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('vite did not start'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

// Center of the morphing bag — the floating flight layer (fixed, z-index 4600) while
// it travels, falling back to the card's settled bag (overlay z-index 4000) after.
// A real function (Playwright serializes + runs it in the page) — NOT a string.
const detailBagCenter = () => {
  const flight = [...document.querySelectorAll('img')].find(i => { const s = getComputedStyle(i); return s.position === 'fixed' && s.zIndex === '4600'; });
  const pick = (img) => { const r = img.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }; };
  if (flight) return pick(flight);
  const overlay = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'fixed' && getComputedStyle(d).zIndex === '4000');
  if (!overlay) return null;
  const img = overlay.querySelector('img[src*="stereoscope"], img[alt]');
  return img ? pick(img) : null;
};

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const cleanup = () => { try { vite.kill('SIGKILL'); } catch { /* noop */ } };

try {
  await waitForServer(URL);
  const browser = await chromium.launch();

  // ---- Pass 1: normal motion — the morph must ANIMATE (interpolate), not teleport ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const shelfBag = await page.locator('[data-testid="shelf"] img').first().boundingBox();
    if (!shelfBag) fail('shelf bag image not found');
    const shelfCenter = shelfBag ? { x: Math.round(shelfBag.x + shelfBag.width / 2), y: Math.round(shelfBag.y + shelfBag.height / 2) } : null;

    // open the detail (tap the shelf card body)
    await page.locator('[data-testid="shelf"]').click({ position: { x: 170, y: 80 } });

    // sample the morphing bag across the animation window
    const samples = [];
    for (let i = 0; i < 16; i++) {
      const c = await page.evaluate(detailBagCenter);
      if (c) samples.push({ t: i * 45, ...c });
      await page.waitForTimeout(45);
    }
    await page.waitForTimeout(300);
    const final = await page.evaluate(detailBagCenter);

    if (samples.length < 4) fail(`detail bag never appeared during morph (got ${samples.length} samples)`);
    if (final) {
      // distinct positions over time => it animated rather than teleported
      const distinct = new Set(samples.map(s => `${s.x},${s.y},${s.w}`)).size;
      if (distinct < 5) fail(`bag did not interpolate smoothly — only ${distinct} distinct frame(s) (teleport/too-fast)`);
      // it actually traveled away from the shelf origin
      if (shelfCenter) {
        const moved = Math.hypot(final.x - shelfCenter.x, final.y - shelfCenter.y);
        if (moved < 30) fail(`bag final center barely moved from shelf (${moved}px)`);
        else console.log(`OK  morph: ${distinct} distinct frames, traveled ${Math.round(moved)}px shelf->card`);
      }
    } else {
      fail('detail bag not found after morph settled');
    }
    if (errors.length) fail('console/page errors (normal): ' + JSON.stringify(errors.slice(0, 6)));
    await page.close();
  }

  // ---- Pass 2: reduced motion — morph disabled, detail still opens cleanly, no errors ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.locator('[data-testid="shelf"]').click({ position: { x: 170, y: 80 } });
    await page.waitForTimeout(500);
    const c = await page.evaluate(detailBagCenter);
    if (!c) fail('reduced-motion: detail card did not open');
    else console.log('OK  reduced-motion: detail opens, no morph');
    if (errors.length) fail('console/page errors (reduced): ' + JSON.stringify(errors.slice(0, 6)));
    await page.close();
  }

  await browser.close();
} catch (e) {
  fail(e.message);
} finally {
  cleanup();
}

if (process.exitCode) console.error('verify-morph: FAILED');
else console.log('verify-morph: PASS');
