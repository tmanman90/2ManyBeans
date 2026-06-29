// Intelligent-tasting-wizard DESIGN/FRAME audit (v4-audit). Proves the R12/R13 design-excellence
// bar programmatically and captures every wizard frame to sim/wizard/ for the codex visual review
// + human sign-off:
//   R12 design excellence — a signature canvas/shader moment (RadarLightSweep) is present; the
//       inputs are CUSTOM-built (role=slider, NOT stock <input type=range>); the primary CTA is
//       Liquid Glass (blur+tint+sheen); numbers use tabular-nums; no banned glow box-shadow
//       (large blur+spread) on cards.
//   R13 frame audit — screenshots of intro, an axis step (with the predict ghost), the gated
//       flavor step, and the reveal radar, written for inspection.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const PORT = 5199;
const URL = `http://localhost:${PORT}/wizard-harness.html`;
const OUT = 'sim/wizard';
let failed = false;
const fail = (m) => { failed = true; console.error('FAIL:', m); };
const ok = (m) => console.log('OK  ', m);

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

mkdirSync(OUT, { recursive: true });
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const cleanup = () => { try { vite.kill('SIGKILL'); } catch { /* noop */ } };
const PAUSE = 700;

try {
  await waitForServer(URL);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 402, height: 880 }, deviceScaleFactor: 2 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const footer = async (name) => { await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(PAUSE); };
  const slider = async () => { await page.getByRole('slider').last().click(); await page.waitForTimeout(160); };

  // open wizard → intro frame
  await page.getByText('Start guided tasting', { exact: false }).first().click();
  await page.waitForTimeout(PAUSE);
  await shot('01-intro');

  // R12 — primary CTA is Liquid Glass (blur + tint + sheen)
  const cta = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Let's taste it/i.test(x.textContent || ''));
    if (!b) return null;
    const s = getComputedStyle(b);
    return {
      blur: (s.backdropFilter || s.webkitBackdropFilter || '').includes('blur'),
      tint: (s.backgroundImage || '').includes('gradient'),
      sheen: !!b.querySelector('span[aria-hidden]'),
    };
  });
  if (!cta || !cta.blur || !cta.tint || !cta.sheen) fail('R12: primary CTA is not Liquid Glass: ' + JSON.stringify(cta));
  else ok('R12 primary CTA is Liquid Glass (blur+tint+sheen)');

  await footer("Let's taste it");
  await shot('02-smell');

  // R12 — inputs are CUSTOM, not stock <input type=range> anywhere in the flow
  const rangeInputs = await page.locator('input[type=range]').count();
  if (rangeInputs > 0) fail(`R12: stock <input type=range> present (${rangeInputs}) — controls must be custom`);
  else ok('R12 no stock range inputs (controls are custom)');
  const sliderRole = await page.getByRole('slider').count();
  if (sliderRole < 1) fail('R12: no custom role=slider control found on an axis step');
  else ok('R12 custom slider control present');

  // advance to an axis step (Acidity) → capture the predict ghost marker
  await page.getByRole('button', { name: 'Fruity', exact: true }).first().click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Berry', exact: true }).first().click();
  await slider();
  await footer('Next'); // → firstsip
  await page.getByRole('button', { name: 'Bright & light', exact: true }).first().click();
  await footer('Next'); // → acidity
  await shot('03-acidity-ghost');
  const ghost = await page.getByText('Ruphus', { exact: false }).first().isVisible().catch(() => false);
  if (!ghost) fail('R12/R2: predict ghost marker missing on axis slider');
  else ok('R12 axis slider shows the predict ghost marker');

  // R12 — signature shader canvas (RadarLightSweep) present
  const canvases = await page.locator('canvas').count();
  if (canvases < 1) fail('R12: signature RadarLightSweep canvas missing');
  else ok(`R12 signature canvas present (${canvases})`);

  // R12 — tabular-nums on numbers
  const tabular = await page.evaluate(() => [...document.querySelectorAll('*')].some(el => (getComputedStyle(el).fontVariantNumeric || '').includes('tabular-nums')));
  if (!tabular) fail('R12: no tabular-nums numbers in the wizard');
  else ok('R12 tabular-nums present on numbers');

  // R12 — no banned glow box-shadow (large blur + large spread) on card surfaces
  const glow = await page.evaluate(() => [...document.querySelectorAll('div')].some(d => {
    const s = getComputedStyle(d).boxShadow || '';
    const m = s.match(/(\d+)px\s+(\d+)px\s+(\d+)px\s+(\d+)px/); // offx offy blur spread
    return m && Number(m[3]) > 24 && Number(m[4]) > 10; // heavy blur + heavy spread = glow tell
  }));
  if (glow) fail('R12: a glow box-shadow (large blur+spread) survives on a surface');
  else ok('R12 no glow box-shadow tell');

  // walk to acidity..body..flavor (gated) → capture
  await slider(); await footer('Next'); // sweetness
  await slider(); await footer('Next'); // body
  await slider(); await footer('Next'); // flavor
  await shot('04-flavor-gated');

  // finish flow to reveal
  await page.getByRole('button', { name: 'Fruity', exact: true }).first().click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Berry', exact: true }).first().click();
  await slider(); await footer('Next'); // finish
  await slider(); await footer('Next'); // balance
  await slider(); await footer('See your cup'); // reveal
  await page.waitForTimeout(400);
  await shot('05-reveal');

  ok('R13 frames captured → ' + OUT);
  await browser.close();
} catch (e) {
  fail('audit threw: ' + e.message);
} finally {
  cleanup();
}

if (failed) { console.error('\naudit-wizard: FAILED'); process.exit(1); }
console.log('\naudit-wizard: PASSED');
process.exit(0);
