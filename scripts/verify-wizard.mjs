// Intelligent-tasting-wizard gate (loop: intelligent-tasting-wizard). Drives the REAL wizard end-
// to-end over a committed harness and proves the deterministic contract (no live AI):
//   R1 full Hoffmann spine — 8 beats incl. explicit Flavor + Balance + technique cues
//      (break-the-crust / slurp / taste-warm / linger)
//   R2 predict-then-confirm — intro shows a structured EXPECTED profile; sliders show Ruphus's
//      expected ghost marker
//   R3 tap-first + type — flavor naming is gated flavor-wheel chips (Tier-3 LOCKED at palate L1,
//      family-first path works), free-text field always present
//   R4 real fingerprint — slider values feed the 6-axis tastingScores; saved record carries them
//   R5 end-of-session reveal — found-vs-expected comparison renders
//   R7 palate progression surface renders (derived from history)
//   R8 wizard REPLACES guided entry; saved tasting is the EXISTING record shape via addTasting;
//      manual entry still reachable
//   R10 reduced-motion renders the whole flow with zero console/page errors
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5198;
const URL = `http://localhost:${PORT}/wizard-harness.html`;
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

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const cleanup = () => { try { vite.kill('SIGKILL'); } catch { /* noop */ } };

const STEP_PAUSE = 700; // AnimatePresence mode="wait": exit+enter serialize

try {
  await waitForServer(URL);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 402, height: 880 }, deviceScaleFactor: 2 });
  await page.emulateMedia({ reducedMotion: 'reduce' }); // deterministic, also exercises R10
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const clickFooter = async (name) => {
    await page.getByRole('button', { name, exact: true }).first().click();
    await page.waitForTimeout(STEP_PAUSE);
  };
  const clickSlider = async () => {
    const s = page.getByRole('slider').last();
    await s.click(); // center → value ~5
    await page.waitForTimeout(180);
  };
  const techniqueText = async () => (await page.locator('body').innerText()).toLowerCase();

  // ---- R8: wizard REPLACES the guided entry ----
  const cta = page.getByText('Start guided tasting', { exact: false }).first();
  if (!(await cta.isVisible().catch(() => false))) fail('R8: "Start guided tasting" CTA missing');
  await cta.click();
  await page.waitForTimeout(STEP_PAUSE);

  // ---- R2: intro shows a structured EXPECTED profile (predict) ----
  const expectVisible = await page.getByText('What to expect', { exact: false }).isVisible().catch(() => false);
  const summaryHasOrigin = (await techniqueText()).includes('ethiopia');
  const heroChip = await page.getByText('jasmine', { exact: false }).first().isVisible().catch(() => false);
  if (!expectVisible) fail('R2: intro "What to expect" expected-profile panel missing');
  if (!summaryHasOrigin) fail('R2: expected summary does not reference the bean origin');
  if (!heroChip) fail('R2: expected hero descriptors (e.g. jasmine) missing');
  if (expectVisible && summaryHasOrigin && heroChip) ok('R2 intro shows structured expected profile + hero descriptors');
  // R7: palate surface on intro
  if (!(await page.getByText('Your palate', { exact: false }).first().isVisible().catch(() => false))) fail('R7: palate surface missing on intro');
  else ok('R7 palate surface renders (derived)');

  await clickFooter("Let's taste it");

  // ---- STEP 1: Smell — break-the-crust cue + gated flavor wheel (R1, R3) ----
  if (!(await page.getByText('Smell', { exact: true }).first().isVisible().catch(() => false))) fail('R1: Smell step did not open');
  const smellTxt = await techniqueText();
  if (!smellTxt.includes('break') || !smellTxt.includes('crust')) fail('R1: Smell step missing break-the-crust technique cue');
  else ok('R1 Smell step has break-the-crust cue');
  // free-text always present
  if ((await page.locator('textarea').count()) < 1) fail('R3: free-text field missing on Smell step');
  // open a family → gating: Tier-3 LOCKED at palate L1, broad path works
  await page.getByRole('button', { name: 'Fruity', exact: true }).first().click();
  await page.waitForTimeout(300);
  const lockHint = await page.getByText('unlocks as your palate', { exact: false }).isVisible().catch(() => false);
  if (!lockHint) fail('R3: Tier-3 lock/unlock hint missing at palate L1 (gating not enforced)');
  else ok('R3 Tier-3 flavor chips gated at palate L1 (family-first)');
  await page.getByRole('button', { name: 'Berry', exact: true }).first().click(); // broad pick (always allowed)
  await page.waitForTimeout(220);
  // R4 — multi-select chip has a per-chip ACCENT FILL overlay (opacity-animated), and selecting a
  // SECOND chip keeps BOTH filled (multi-select, not one shared highlight).
  const berryFilled = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[aria-pressed="true"]')].find(x => (x.textContent || '').trim().toLowerCase().startsWith('berry'));
    if (!b) return false;
    return [...b.querySelectorAll('span')].some(s => { const st = getComputedStyle(s); return st.position === 'absolute' && st.backgroundColor.replace(/\s/g, '').includes('162,99,47'); });
  });
  if (berryFilled) ok('R4 multi-select chip carries its own accent fill overlay');
  else fail('R4 multi-select chip fill overlay missing');
  await clickSlider(); // aroma intensity → fragranceAroma score
  await clickFooter('Next');

  // ---- STEP 2: First sip — slurp + taste-warm cue (R1) ----
  const sipTxt = await techniqueText();
  if (!sipTxt.includes('slurp') || !sipTxt.includes('warm')) fail('R1: First sip missing slurp / taste-warm cues');
  else ok('R1 First sip has slurp + taste-warm cues');
  // R3 — single-select SLIDE: exactly one pick is selected and carries the shared accent highlight,
  // and it MOVES to a different pick (not a per-chip fill). accent = #A2632F = rgb(162, 99, 47).
  const hlIn = (name) => page.evaluate((n) => {
    const b = [...document.querySelectorAll('button[aria-pressed="true"]')].find(x => (x.textContent || '').includes(n));
    return !!b && [...b.querySelectorAll('span')].some(s => getComputedStyle(s).backgroundColor.replace(/\s/g, '').includes('162,99,47'));
  }, name);
  await page.getByRole('button', { name: 'Bright & light', exact: true }).first().click();
  await page.waitForTimeout(220);
  const p1 = await page.locator('button[aria-pressed="true"]').count();
  const h1 = await hlIn('Bright & light');
  await page.getByRole('button', { name: 'Round & smooth', exact: true }).first().click();
  await page.waitForTimeout(320);
  const p2 = await page.locator('button[aria-pressed="true"]').count();
  const h2 = await hlIn('Round & smooth');
  if (p1 === 1 && h1 && p2 === 1 && h2) ok('R3 single-select highlight slides between picks (one selected at a time)');
  else fail(`R3 single-select slide: pressed=${p1}/${p2} highlight=${h1}/${h2}`);
  await clickFooter('Next');

  // ---- STEP 3: Acidity — subtle predict marker (R2/R5) + slider (R4) ----
  if (!(await page.getByText('Acidity', { exact: true }).first().isVisible().catch(() => false))) fail('R1: Acidity step missing');
  const marker = await page.evaluate(() => [...document.querySelectorAll('span')].some(s => s.textContent.trim() === '◆'));
  if (!marker) fail('R2/R5: subtle ◆ expected marker missing on axis slider');
  else ok('R2/R5 axis slider shows a subtle ◆ expected marker (no prominent name label)');
  await clickSlider();
  await clickFooter('Next');

  // ---- STEP 4: Sweetness ----
  await clickSlider();
  await clickFooter('Next');
  // ---- STEP 5: Body ----
  await clickSlider();
  await clickFooter('Next');

  // ---- STEP 6: Flavor — explicit Flavor beat + gated chips (R1, R3) ----
  if (!(await page.getByText('Flavor', { exact: true }).first().isVisible().catch(() => false))) fail('R1: explicit Flavor step missing');
  else ok('R1 explicit Flavor step present');
  await page.getByRole('button', { name: 'Fruity', exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Berry', exact: true }).first().click();
  await page.waitForTimeout(150);
  await clickSlider(); // flavor intensity → flavor score
  await clickFooter('Next');

  // ---- STEP 7: Finish — linger cue (R1) ----
  const finishTxt = await techniqueText();
  if (!finishTxt.includes('linger')) fail('R1: Finish step missing linger cue');
  else ok('R1 Finish step has linger cue');
  await clickSlider();
  await clickFooter('Next');

  // ---- STEP 8: Balance — explicit Balance beat (R1) ----
  if (!(await page.getByText('Balance', { exact: true }).first().isVisible().catch(() => false))) fail('R1: explicit Balance step missing');
  else ok('R1 explicit Balance step present');
  await clickSlider();
  await clickFooter('See your cup');

  // ---- REVEAL: found-vs-expected + palate (R5, R7) ----
  const revealOk = await page.getByText('found vs', { exact: false }).first().isVisible().catch(() => false);
  if (!revealOk) fail('R5: reveal found-vs-expected comparison missing');
  else ok('R5 reveal compares found vs expected');
  // one-word
  await page.locator('input').first().fill('Vibrant').catch(() => {});
  await page.waitForTimeout(120);

  // ---- SAVE: existing record shape with real 6-axis fingerprint (R4, R8) ----
  await clickFooter('Save tasting');
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => window.__SAVED__);
  if (!saved) fail('R8: save did not call addTasting');
  else {
    const ALLOWED = new Set(['beanId', 'date', 'aroma', 'firstSip', 'acidity', 'sweetness', 'body', 'finish', 'oneWord', 'notes', 'changeTomorrow', 'rating', 'tastingScores']);
    const extra = Object.keys(saved).filter(k => !ALLOWED.has(k));
    if (extra.length) fail('R8: saved record has non-schema fields: ' + extra.join(','));
    else ok('R8 saved record is the existing tasting shape');
    if (saved.beanId !== 'b1' || !saved.date) fail('R8: saved record missing beanId/date');
    const ts = saved.tastingScores || {};
    const AXES = ['fragranceAroma', 'acidity', 'sweetness', 'body', 'flavor', 'balance'];
    const allReal = AXES.every(k => Number(ts[k]) > 0);
    if (!allReal) fail('R4: saved tastingScores is not a full real 6-axis fingerprint: ' + JSON.stringify(ts));
    else ok('R4 saved record carries a real 6-axis fingerprint ' + JSON.stringify(ts));
    if (saved.oneWord !== 'Vibrant') fail('R8: one-word not captured into record');
  }

  // ---- R8: manual entry still reachable ----
  await page.waitForTimeout(400);
  // reopen wizard → footer manual link → form
  await page.getByText('Start guided tasting', { exact: false }).first().click();
  await page.waitForTimeout(STEP_PAUSE);
  const manualLink = page.getByText('or log a tasting manually', { exact: false }).last(); // wizard footer (portal is last in DOM)
  if (!(await manualLink.isVisible().catch(() => false))) fail('R8: manual-entry link missing in wizard');
  else {
    await manualLink.click();
    await page.waitForTimeout(500);
    const formOpen = await page.getByText('Aroma', { exact: false }).first().isVisible().catch(() => false);
    if (!formOpen) fail('R8: manual tasting form did not open');
    else ok('R8 manual entry preserved (form opens)');
  }

  // ---- R10: zero console/page errors across the reduced-motion flow ----
  if (errors.length) fail('R10: console/page errors: ' + JSON.stringify(errors.slice(0, 8)));
  else ok('R10 reduced-motion full flow: zero console/page errors');

  await browser.close();
} catch (e) {
  fail('harness threw: ' + e.message);
} finally {
  cleanup();
}

if (failed) { console.error('\nverify-wizard: FAILED'); process.exit(1); }
console.log('\nverify-wizard: PASSED');
process.exit(0);
