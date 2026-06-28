// Archive editorial-100x gate (loop: archive-editorial-100x). Proves tasting-as-hero +
// declutter + featured-on-top + chronological + motion over a committed harness:
//   R1 every entry leads with a ★ rating + a tasting pull-quote
//   R3 the "Show Details" expander and row flavor-tag chips are gone
//   R4 favourite cups featured on top (before the timeline)
//   R5 timeline year-grouped + chronological with pinning (position:sticky) headers
//   R6/R7 tap → hero morph (flight frames); R6 reduced-motion disables the flight
//   R8 search filters; R7-render zero console/page errors
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

  // ---- Pass 1: tasting-as-hero, declutter, featured-on-top, pinning + no errors ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // R1 — tasting is the hero: rating stars on multiple entries + a pull-quote present.
    const ratings = await page.locator('[role="img"][aria-label*="out of 5"]').count();
    if (ratings < 3) fail(`R1: ratings not led on entries (found ${ratings} star groups)`);
    // pull-quote from a tasting note (featured cup a1's note) should be on screen
    const quoteShown = await page.getByText('jammy cherry', { exact: false }).first().isVisible().catch(() => false);
    if (!quoteShown) fail('R1: tasting pull-quote not rendered on the entry');
    // graceful degrade: a rated-but-wordless bean (a7) shows its meta line, never an empty quote
    const emptyQuote = await page.evaluate(() => /[“"]\s*[”"]/.test(document.body.innerText || ''));
    if (emptyQuote) fail('R1: an empty/whitespace pull-quote rendered (no graceful fallback)');
    const metaFallback = await page.getByText('Kenya · Natural', { exact: false }).first().isVisible().catch(() => false);
    if (!metaFallback) fail('R1: rated-but-wordless bean did not degrade to a meta line');
    if (ratings >= 3 && quoteShown && !emptyQuote && metaFallback) console.log(`OK  tasting-as-hero (${ratings} ratings + pull-quote, graceful degrade)`);

    // R3 — declutter: no "Show details" control, no row flavor-tag chips (bagNotes "Apple…").
    const showDetails = await page.getByText('Show details', { exact: false }).count();
    if (showDetails > 0) fail('R3: a "Show details" control survives');
    const flavorTag = await page.getByText('Apple', { exact: false }).count(); // bagNotes flavor chip
    if (flavorTag > 0) fail('R3: a row flavor-tag chip survives (bagNotes rendered as chips)');
    if (showDetails === 0 && flavorTag === 0) console.log('OK  decluttered (no Show-details, no row flavor-tags)');

    // R4 — favourite cups featured on top: the featured cup precedes the first year header.
    const featuredY = await page.getByText('Kotowa Estate', { exact: false }).first().boundingBox().catch(() => null);
    const yearY = await page.getByText('2026', { exact: true }).first().boundingBox().catch(() => null);
    const cupsLabel = await page.getByText('Unforgettable Cups', { exact: false }).first().isVisible().catch(() => false);
    if (!featuredY || !yearY) fail('R4: featured cup or year header missing');
    else if (!(featuredY.y < yearY.y)) fail('R4: featured cup is not above the timeline');
    else if (!cupsLabel) fail('R4: Unforgettable Cups label missing');
    else console.log('OK  favourite cups featured on top');

    // R5 — timeline year-grouped + chronological, headers pin (position: sticky).
    const y2026 = await page.getByText('2026', { exact: true }).first().boundingBox().catch(() => null);
    const y2025 = await page.getByText('2025', { exact: true }).first().boundingBox().catch(() => null);
    if (!y2026 || !y2025) fail('R5: year headers missing');
    else if (!(y2026.y < y2025.y)) fail('R5: years not chronological (recent first)');
    const sticky = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(d => d.textContent && /^2026/.test(d.textContent.trim()) && getComputedStyle(d).position === 'sticky');
      return !!el;
    });
    if (!sticky) fail('R5: year header is not pinning (position: sticky)');
    if (y2026 && y2025 && y2026.y < y2025.y && sticky) console.log('OK  chronological year groups with pinning headers');

    // R7 — tap the featured cup (has a photo) → hero morph flies open.
    await page.getByText('Kotowa Estate', { exact: false }).first().click().catch(() => {});
    const samples = [];
    for (let i = 0; i < 16; i++) { const c = await page.evaluate(flightCenter); if (c) samples.push(c); await page.waitForTimeout(40); }
    const distinct = new Set(samples.filter(s => s.w > 0).map(s => `${s.y},${s.w}`)).size;
    if (!samples.length) fail('R7: tap did not open the trading card');
    else if (distinct < 3) fail(`R7: morph did not interpolate (only ${distinct} flight frames)`);
    else console.log(`OK  tap → hero morph (${distinct} flight frames)`);

    if (errors.length) fail('console/page errors: ' + JSON.stringify(errors.slice(0, 6)));
    await page.close();
  }

  // ---- Pass 2: search filters the entries ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const before = await page.locator('[data-bag]').count();
    await page.locator('input[aria-label="Search archive"]').fill('Ceremony');
    await page.waitForTimeout(350);
    const after = await page.locator('[data-bag]').count();
    if (!(before >= 6 && after > 0 && after < before)) fail(`R8: search did not filter (before ${before}, after ${after})`);
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
    await page.getByText('Kotowa Estate', { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(450);
    const flight = await page.evaluate(() => [...document.querySelectorAll('img')].some(i => { const s = getComputedStyle(i); return s.position === 'fixed' && s.zIndex === '4600'; }));
    const overlay = await page.evaluate(() => [...document.querySelectorAll('div')].some(d => getComputedStyle(d).position === 'fixed' && getComputedStyle(d).zIndex === '4000'));
    if (!overlay) fail('R6: reduced-motion — trading card did not open');
    else if (flight) fail('R6: reduced-motion — morph flight ran (should be disabled)');
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
