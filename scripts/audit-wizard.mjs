// Tasting-polish-2 DESIGN/FRAME audit (v4-audit). Proves the new craft contract:
//   R1 bone marker is hidden before/while setting a slider and revealed when Next commits the guess.
//   R2 chat thread keeps coach + immediate loader, then reaction replaces loader.
//   R3 loader is a canvas dot-matrix in a static frosted-glass pill; no goo/mix-blend/CSS dots.
//   R5 custom controls, tabular numbers, and no glow tell regressions.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

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
const REVEAL_ADVANCE_PAUSE = 1450;

try {
  await waitForServer(URL);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 402, height: 880 }, deviceScaleFactor: 2 });
  await page.route('**/api/claude', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ content: [{ type: 'text', text: 'That tracks. Your read lands right where this cup starts to sparkle.' }] }),
  }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const footer = async (name, pause = PAUSE) => { await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(pause); };
  const footerNow = async (name) => page.getByRole('button', { name, exact: true }).first().click();
  const stepVisible = (key) => page.locator(`[data-wizard-step="${key}"]`).isVisible().catch(() => false);
  const waitStep = (key, timeout = 1800) => page.locator(`[data-wizard-step="${key}"]`).waitFor({ state: 'visible', timeout });
  const slider = async () => {
    const sliders = page.locator('[role="slider"]');
    const index = await sliders.evaluateAll(els => {
      const visible = els
        .map((el, i) => ({ el, i, rect: el.getBoundingClientRect(), style: getComputedStyle(el) }))
        .filter(({ rect, style }) => rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden');
      return visible.length ? visible[visible.length - 1].i : -1;
    });
    if (index < 0) throw new Error('No visible slider to click');
    const s = sliders.nth(index);
    await s.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.waitForTimeout(50);
    const box = await s.boundingBox();
    if (!box) throw new Error('Visible slider had no bounding box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(160);
  };

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

  // advance to an axis step (Acidity) → capture bone hidden/revealed-on-Next + loader
  await page.getByRole('button', { name: 'Fruity', exact: true }).first().click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Berry', exact: true }).first().click();
  await slider();
  await footer('Next', REVEAL_ADVANCE_PAUSE); // → firstsip after bone reveal hold
  await page.getByRole('button', { name: 'Bright & light', exact: true }).first().click();
  await footer('Next'); // → acidity
  await waitStep('acidity').catch(() => fail('R1: Acidity step did not open'));
  await shot('03-bone-hidden');
  const hiddenBone = await page.evaluate(() => {
    const marker = document.querySelector('[data-expected-marker="bone"]');
    return marker && marker.getAttribute('data-revealed') === 'false' && Number(getComputedStyle(marker).opacity) === 0 && !!marker.querySelector('svg');
  });
  if (!hiddenBone) fail('R1: bone marker is not hidden before touch');
  else ok('R1 bone marker hidden before touch');

  await slider();
  const stillHiddenAfterTouch = await page.evaluate(() => {
    const marker = document.querySelector('[data-expected-marker="bone"]');
    return marker && marker.getAttribute('data-revealed') === 'false' && Number(getComputedStyle(marker).opacity) === 0 && !!marker.querySelector('svg');
  });
  if (!stillHiddenAfterTouch) fail('R1: bone marker revealed too early on slider touch');
  else ok('R1 bone marker stays hidden after touch');

  await footerNow('Next');
  await page.waitForTimeout(60);
  await shot('04-bone-revealed');
  const revealedBone = await page.evaluate(() => {
    const marker = document.querySelector('[data-expected-marker="bone"]');
    return marker && marker.getAttribute('data-revealed') === 'true' && Number(getComputedStyle(marker).opacity) > 0.95 && !!marker.querySelector('svg');
  });
  if (!revealedBone) fail('R1: bone marker did not reveal after Next committed the answer');
  else ok('R1 bone marker revealed after Next commit');

  await page.locator('[data-ruphus-bubble="loader"]').waitFor({ state: 'visible', timeout: 250 }).catch(() => fail('R2: immediate loader bubble missing'));
  await shot('05-loader-matrix');
  const thread = await page.evaluate(() => ({
    coach: document.querySelector('[data-ruphus-bubble="coach"]') != null,
    loader: document.querySelector('[data-ruphus-bubble="loader"]') != null,
    canvas: document.querySelector('[data-dot-matrix-loader="true"] canvas') != null,
  }));
  if (!thread.coach || !thread.loader || !thread.canvas) fail('R2/R3: coach + separate canvas loader thread missing: ' + JSON.stringify(thread));
  else ok('R2/R3 chat thread shows coach plus separate canvas dot-matrix loader');

  await page.locator('[data-ruphus-bubble="reaction"]').waitFor({ state: 'visible', timeout: 950 }).catch(() => fail('R2: reaction bubble missing before auto-advance'));
  await page.waitForTimeout(40);
  const replaced = await page.evaluate(() => ({
    reaction: document.querySelector('[data-ruphus-bubble="reaction"]') != null,
    loader: document.querySelector('[data-ruphus-bubble="loader"]') != null,
    coach: document.querySelector('[data-ruphus-bubble="coach"]') != null,
  }));
  if (!replaced.reaction || replaced.loader || replaced.coach) fail('R2: reaction did not replace loader / coach: ' + JSON.stringify(replaced));
  else ok('R2 reaction replaces loader and coach bubble exits');
  await shot('06-thread-reaction');

  // R12 — signature shader canvas (RadarLightSweep) present
  const canvases = await page.locator('canvas').count();
  if (canvases < 1) fail('R5: signature RadarLightSweep canvas missing after loader resolves');
  else ok(`R5 signature RadarLightSweep canvas remains after loader resolves (${canvases})`);

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

  // close mid-tasting → confirm and resume affordance frame
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.waitForTimeout(180);
  await shot('07-exit-confirm');
  const confirm = await page.getByText('Leave this tasting?', { exact: true }).isVisible().catch(() => false);
  if (!confirm) fail('R4: exit confirm missing with progress');
  else ok('R4 exit confirm appears with progress');
  await page.getByRole('button', { name: 'Leave', exact: true }).first().click();
  await page.waitForTimeout(400);
  await shot('08-resume-entry');
  const resume = await page.getByText('Resume your Geometry Blend tasting', { exact: false }).first().isVisible().catch(() => false);
  if (!resume) fail('R4: resume entry missing after leaving wizard');
  else ok('R4 resume entry appears after leaving wizard');
  await page.getByText('Resume your Geometry Blend tasting', { exact: false }).first().click();
  await page.waitForTimeout(PAUSE);

  // walk to sweetness..body..flavor (gated) → capture
  const resumedAtAcidity = await stepVisible('acidity');
  const resumedAtSweetness = await stepVisible('sweetness');
  if (resumedAtAcidity) await footer('Next'); // revealed draft can move to sweetness immediately
  else if (!resumedAtSweetness) fail('R4: resume did not restore an expected slider step');
  await slider(); await footer('Next', REVEAL_ADVANCE_PAUSE); // sweetness → body
  await slider(); await footer('Next', REVEAL_ADVANCE_PAUSE); // body → flavor
  await waitStep('flavor').catch(() => fail('R1: Flavor step did not open after Body auto-advance'));
  await shot('09-flavor-gated');

  // finish flow to reveal
  const flavorFruity = page.getByRole('button', { name: 'Fruity', exact: true }).first();
  await flavorFruity.scrollIntoViewIfNeeded();
  await flavorFruity.click();
  await page.waitForTimeout(250);
  const flavorBerry = page.getByRole('button', { name: 'Berry', exact: true }).first();
  await flavorBerry.scrollIntoViewIfNeeded();
  await flavorBerry.click();
  await slider(); await footer('Next', REVEAL_ADVANCE_PAUSE); // finish
  await slider(); await footer('Next', REVEAL_ADVANCE_PAUSE); // balance
  await slider(); await footer('See your cup', REVEAL_ADVANCE_PAUSE); // reveal
  await page.waitForTimeout(400);
  await shot('10-reveal');

  // Source-level WKWebView guardrails for the loader.
  const source = [
    readFileSync('src/components/tasting/RuphusThinking.jsx', 'utf8'),
    readFileSync('src/styles/global.css', 'utf8'),
  ].join('\n');
  const bad = [
    ['SVG goo/feDisplacement', /feDisplacement|<filter/i],
    ['mix-blend-mode', /mix-blend-mode/i],
    ['old CSS breathing dots', /\.ruphus-dot\b|ruphusDotBreathe|ruphus-shimmer/i],
  ].filter(([, re]) => re.test(source)).map(([name]) => name);
  if (bad.length) fail('R3/R5 loader source contains banned patterns: ' + bad.join(', '));
  else ok('R3/R5 loader source has no goo filter, mix-blend, or CSS breathing dots');

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
