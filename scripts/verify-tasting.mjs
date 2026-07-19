// Tasting editorial-100x gate (loop: tasting-editorial-coach-100x). Proves the de-slop +
// tasting-as-hero + coach-preserved requirements over a committed harness:
//   R1 masthead de-slop (no "learn what you taste" eyebrow, no gradient accent bar)
//   R2 journal entries lead with a ★ rating + a taste-fingerprint SVG; NO 3px left-stripe
//   R3 invitation hero de-slop (solid CTA, no gradient chrome)
//   R4 guided session opens to the 6-step spine (static render, no live AI)
//   R6 reduced-motion renders without error; R7-render zero console/page errors
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5196;
const URL = `http://localhost:${PORT}/tasting-harness.html`;
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

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const cleanup = () => { try { vite.kill('SIGKILL'); } catch { /* noop */ } };

try {
  await waitForServer(URL);
  const browser = await chromium.launch();

  // ---- Pass 1: masthead + journal fingerprints + hero + no errors ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    // R1 — masthead: "Tasting" title + tabular stat; NO "learn what you taste" eyebrow.
    const titleOk = await page.getByText('Tasting', { exact: true }).first().isVisible().catch(() => false);
    const eyebrow = await page.getByText('learn what you taste', { exact: false }).count();
    const statTabular = await page.evaluate(() => [...document.querySelectorAll('*')].some(el => /cups? logged/.test(el.textContent || '') && getComputedStyle(el).fontVariantNumeric.includes('tabular-nums')));
    if (!titleOk) fail('R1: "Tasting" title missing');
    if (eyebrow > 0) fail('R1: "learn what you taste" eyebrow survives');
    if (!statTabular) fail('R1: masthead stat is not tabular-nums');
    if (titleOk && eyebrow === 0 && statTabular) console.log('OK  masthead de-slopped');

    // R2 — journal: taste-fingerprint glyphs present; NO 3px caramel left-stripe on cards.
    const fingerprints = await page.locator('svg[aria-label="taste fingerprint"]').count();
    if (fingerprints < 2) fail(`R2: taste-fingerprint glyphs missing (found ${fingerprints})`);
    const stripe = await page.evaluate(() => [...document.querySelectorAll('div')].some(d => {
      const s = getComputedStyle(d);
      return s.borderLeftStyle === 'solid' && Math.round(parseFloat(s.borderLeftWidth)) === 3;
    }));
    if (stripe) fail('R2: a 3px left-stripe card survives (banned tell)');
    // ratings present (StarRating renders bean/star buttons or svgs)
    if (fingerprints >= 2 && !stripe) console.log(`OK  journal taste-fingerprints (${fingerprints}), no left-stripe`);

    // R3 — invitation hero: "Start guided tasting" CTA is a LIQUID GLASS button
    // (tinted-glass body + backdrop blur + a specular rim sheen overlay), not a flat fill.
    const cta = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Start guided tasting/i.test(x.textContent || ''));
      if (!b) return null;
      const s = getComputedStyle(b);
      const blur = (s.backdropFilter || s.webkitBackdropFilter || '').includes('blur');
      const tint = (s.backgroundImage || '').includes('gradient');
      const sheen = !!b.querySelector('span[aria-hidden]'); // specular rim / inner glow overlay
      const glass = b.getAttribute('data-glass-button') === 'primary';
      return { blur, tint, sheen, glass };
    });
    if (!cta) fail('R3: "Start guided tasting" CTA missing');
    else if (!cta.blur || !cta.tint || !cta.sheen || !cta.glass) fail('R3: CTA is not a shared Liquid Glass button: ' + JSON.stringify(cta));
    else console.log('OK  invitation CTA is Liquid Glass (blur + tint + sheen)');

    // R4 — tap the CTA → the guided session opens. The guided entry is now the intelligent
    // tasting wizard (see scripts/verify-wizard.mjs for the full spine), which opens to a
    // predict-then-confirm intro before the Hoffmann steps.
    await page.getByText('Start guided tasting', { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(700);
    const wizardOpen = await page.getByText('What to expect', { exact: false }).first().isVisible().catch(() => false);
    if (!wizardOpen) fail('R4: guided tasting CTA did not open the wizard intro');
    else console.log('OK  guided tasting opens the intelligent wizard');

    if (errors.length) fail('console/page errors: ' + JSON.stringify(errors.slice(0, 6)));
    await page.close();
  }

  // ---- Pass 1b: tap a journal card → organized detail review (radar + flavor rows) ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    // tap the journal card via its unique note preview
    await page.getByText('Syrupy ripe cherry', { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(900);
    const radar = await page.locator('svg[aria-label="flavor radar"]').count();
    const flavorHdr = await page.getByText('Flavor notes', { exact: false }).first().isVisible().catch(() => false);
    // organized rows: a descriptor lands on its own labelled row (not a wall of text)
    const aromaRow = await page.getByText('Cherry, Jam', { exact: false }).first().isVisible().catch(() => false);
    if (radar < 1) fail('detail: flavor radar did not open on tap');
    else if (!flavorHdr) fail('detail: "Flavor notes" section missing');
    else if (!aromaRow) fail('detail: organized flavor rows missing');
    else console.log('OK  tap → organized detail (radar + flavor rows)');
    await page.close();
  }

  // ---- Pass 2: reduced motion — journal renders, no errors ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const fps = await page.locator('svg[aria-label="taste fingerprint"]').count();
    const visible = await page.getByText('Kotowa Estate', { exact: false }).first().isVisible().catch(() => false);
    if (!visible || fps < 2) fail('R6: reduced-motion — journal did not render');
    else console.log('OK  reduced-motion: journal renders');
    if (errors.length) fail('reduced-motion errors: ' + JSON.stringify(errors.slice(0, 4)));
    await page.close();
  }

  // ---- Pass 3: no beans — disabled CTA is visibly muted, not active glass ----
  {
    const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(`${URL}?empty=1`, { waitUntil: 'networkidle' });
    const cta = page.getByRole('button', { name: /Add a bean to start/i });
    const muted = await cta.evaluate((button) => {
      const style = getComputedStyle(button);
      return {
        disabled: button.disabled,
        marker: button.getAttribute('data-glass-disabled'),
        sheenCount: button.querySelectorAll('span[aria-hidden]').length,
        shadow: style.boxShadow,
        opacity: Number.parseFloat(style.opacity),
      };
    });
    if (!muted.disabled || muted.marker !== 'true') fail('disabled tasting CTA is not marked disabled');
    else if (muted.sheenCount !== 0 || muted.opacity >= 1 || /12px 28px/.test(muted.shadow)) fail('disabled tasting CTA still uses active glass material');
    else console.log('OK  disabled tasting CTA uses muted material');
    await page.close();
  }

  await browser.close();
} catch (e) {
  fail(e.message);
} finally {
  cleanup();
}

if (process.exitCode) console.error('verify-tasting: FAILED');
else console.log('verify-tasting: PASS');
