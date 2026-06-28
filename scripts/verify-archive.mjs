// Archive trophy-redesign gate (loop: archive-trophy-redesign). Proves the de-slop +
// structure-kept + morph requirements over a committed archive-harness:
//   R1 masthead de-slop (no header radial-glow orb, title + tabular-nums stat line)
//   R2 Unforgettable Cups trophy carousel on top, scrollable, NO Sparkles icon
//   R3 year-grouped chronological timeline
//   R4 tap → trading-card hero morph (flight frames)
//   R7 search filters the list
//   R9 reduced-motion: card opens, no morph flight
//   R7-render zero console/page errors
// Spins Vite on the committed archive-harness, drives Playwright, asserts, tears down.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5199;
const URL = `http://localhost:${PORT}/archive-harness.html`;
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

const flightCenter = () => {
  const f = [...document.querySelectorAll('img')].find(i => { const s = getComputedStyle(i); return s.position === 'fixed' && s.zIndex === '4600'; });
  if (f) { const r = f.getBoundingClientRect(); return { y: Math.round(r.y), w: Math.round(r.width) }; }
  const ov = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'fixed' && getComputedStyle(d).zIndex === '4000');
  return ov ? { y: -1, w: -1 } : null;
};

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const cleanup = () => { try { vite.kill('SIGKILL'); } catch { /* noop */ } };

try {
  await waitForServer(URL);
  const browser = await chromium.launch();

  // ---- Pass 1: structure (masthead de-slop, cups carousel, timeline) + no errors ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    // R1 — masthead: "Archive" title + a tabular-nums stat line; NO radial-glow anywhere.
    const titleOk = await page.getByText('Archive', { exact: true }).first().isVisible().catch(() => false);
    if (!titleOk) fail('masthead "Archive" title missing');
    // The banned tell is a header glow orb specifically — scope to the masthead.
    const glow = await page.evaluate(() => {
      const m = document.querySelector('[data-masthead]');
      if (!m) return true; // masthead missing is itself a fail
      return [m, ...m.querySelectorAll('*')].some(el => (getComputedStyle(el).backgroundImage || '').includes('radial-gradient'));
    });
    if (glow) fail('R1: a header radial-glow orb survives (slop tell)');
    const statTabular = await page.evaluate(() => {
      const els = [...document.querySelectorAll('*')];
      return els.some(el => /\bbeans\b/.test(el.textContent || '') && /\btastings\b/.test(el.textContent || '') && getComputedStyle(el).fontVariantNumeric.includes('tabular-nums'));
    });
    if (!statTabular) fail('R1: masthead stat line is not tabular-nums');
    if (!glow && titleOk && statTabular) console.log('OK  masthead de-slopped (title + tabular stat, no glow)');

    // R2 — Unforgettable Cups: present, horizontally scrollable, NO Sparkles icon.
    const sparkles = await page.evaluate(() => !!document.querySelector('.lucide-sparkles, .lucide-sparkle'));
    if (sparkles) fail('R2: a Sparkles icon survives (slop tell)');
    const cupsHeader = await page.getByText('Unforgettable Cups', { exact: false }).first().isVisible().catch(() => false);
    if (!cupsHeader) fail('R2: Unforgettable Cups strip missing');
    const rails = await page.evaluate(() => [...document.querySelectorAll('.hide-scrollbar')].map(r => ({ sw: Math.round(r.scrollWidth), cw: Math.round(r.clientWidth), btns: r.querySelectorAll('button').length })));
    const cupsRail = rails.find(r => r.btns >= 3);
    if (!cupsRail) fail('R2: cups carousel has no card buttons: ' + JSON.stringify(rails));
    else if (cupsRail.sw <= cupsRail.cw + 20) fail('R2: cups carousel is not horizontally scrollable: ' + JSON.stringify(cupsRail));
    else if (!sparkles && cupsHeader) console.log(`OK  trophy carousel (${cupsRail.btns} cups, scrollable, no Sparkles)`);

    // R3 — timeline year-grouped + chronological (2026 above 2025 on default Recent sort).
    const y2026 = await page.getByText('2026', { exact: true }).first().boundingBox().catch(() => null);
    const y2025 = await page.getByText('2025', { exact: true }).first().boundingBox().catch(() => null);
    if (!y2026 || !y2025) fail('R3: year headers missing (2026/2025)');
    else if (!(y2026.y < y2025.y)) fail('R3: years not chronological (recent first)');
    else console.log('OK  timeline year-grouped + chronological');

    // R4 — tap a cup card (has photo) → trading card flies open (morph interpolates).
    await page.locator('.hide-scrollbar button[data-bag], .hide-scrollbar button:has([data-bag])').first().click().catch(() => {});
    const samples = [];
    for (let i = 0; i < 16; i++) { const c = await page.evaluate(flightCenter); if (c) samples.push(c); await page.waitForTimeout(40); }
    const distinct = new Set(samples.filter(s => s.w > 0).map(s => `${s.y},${s.w}`)).size;
    if (!samples.length) fail('R4: tap did not open the trading card');
    else if (distinct < 3) fail(`R4: morph did not interpolate (only ${distinct} flight frames)`);
    else console.log(`OK  tap → hero morph (${distinct} flight frames)`);

    if (errors.length) fail('console/page errors: ' + JSON.stringify(errors.slice(0, 6)));
    await page.close();
  }

  // ---- Pass 2: search filters the timeline ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const before = await page.locator('[data-bag]').count();
    await page.locator('input[aria-label="Search archive"]').fill('Kotowa');
    await page.waitForTimeout(350);
    const after = await page.locator('[data-bag]').count();
    if (!(before >= 6 && after > 0 && after < before)) fail(`R7: search did not filter (before ${before}, after ${after})`);
    else console.log(`OK  search filters (${before} → ${after})`);
    await page.close();
  }

  // ---- Pass 3: reduced motion — card opens, no morph flight, no errors ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.locator('.hide-scrollbar button[data-bag], .hide-scrollbar button:has([data-bag])').first().click().catch(() => {});
    await page.waitForTimeout(450);
    const flight = await page.evaluate(() => [...document.querySelectorAll('img')].some(i => { const s = getComputedStyle(i); return s.position === 'fixed' && s.zIndex === '4600'; }));
    const overlay = await page.evaluate(() => [...document.querySelectorAll('div')].some(d => getComputedStyle(d).position === 'fixed' && getComputedStyle(d).zIndex === '4000'));
    if (!overlay) fail('R9: reduced-motion — trading card did not open');
    else if (flight) fail('R9: reduced-motion — morph flight ran (should be disabled)');
    else console.log('OK  reduced-motion: card opens, no morph');
    if (errors.length) fail('reduced-motion errors: ' + JSON.stringify(errors.slice(0, 4)));
    await page.close();
  }

  await browser.close();
} catch (e) {
  fail(e.message);
} finally {
  cleanup();
}

if (process.exitCode) console.error('verify-archive: FAILED');
else console.log('verify-archive: PASS');
