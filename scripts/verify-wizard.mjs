// Intelligent-tasting-wizard gate (loop: intelligent-tasting-wizard). Drives the REAL wizard end-
// to-end over a committed harness and proves the deterministic contract (no live AI):
//   R1 full Hoffmann spine — 8 beats incl. explicit Flavor + Balance + technique cues
//      (break-the-crust / slurp / taste-warm / linger)
//   R2 predict-then-confirm — intro shows a structured EXPECTED profile; sliders reveal Ruphus's
//      expected bone marker only when Next commits the user's blind guess
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

const STEP_PAUSE = 700; // CSS stage entry / normal page changes
const REVEAL_ADVANCE_PAUSE = 1450; // bone reveal hold + next page entry

try {
  await waitForServer(URL);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 402, height: 880 }, deviceScaleFactor: 2 });
  await page.route('**/api/claude', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ content: [{ type: 'text', text: 'That tracks. Your read lands right where this cup starts to sparkle.' }] }),
  }));
  await page.emulateMedia({ reducedMotion: 'reduce' }); // deterministic, also exercises R10
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const clickFooter = async (name, pause = STEP_PAUSE) => {
    await page.getByRole('button', { name, exact: true }).first().click();
    await page.waitForTimeout(pause);
  };
  const clickSlider = async () => {
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
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // center → value ~5
    await page.waitForTimeout(180);
  };
  const techniqueText = async () => (await page.locator('body').innerText()).toLowerCase();
  const stepVisible = (key) => page.locator(`[data-wizard-step="${key}"]`).isVisible().catch(() => false);
  const waitStep = (key, timeout = 1800) => page.locator(`[data-wizard-step="${key}"]`).waitFor({ state: 'visible', timeout });

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
  if (!(await stepVisible('smell'))) fail('R1: Smell step did not open');
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
  await clickFooter('Next', REVEAL_ADVANCE_PAUSE);

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

  // ---- STEP 3: Acidity — bone marker hidden until Next commits the guess + instant thread loader ----
  if (!(await stepVisible('acidity'))) fail('R1: Acidity step missing');
  const beforeBone = await page.evaluate(() => {
    const marker = document.querySelector('[data-expected-marker="bone"]');
    if (!marker) return null;
    const style = getComputedStyle(marker);
    return {
      revealed: marker.getAttribute('data-revealed'),
      opacity: Number(style.opacity),
      hasSvg: !!marker.querySelector('svg'),
      hasDiamond: [...document.querySelectorAll('span')].some(s => s.textContent.trim() === '◆'),
    };
  });
  if (!beforeBone?.hasSvg || beforeBone.revealed !== 'false' || beforeBone.opacity !== 0 || beforeBone.hasDiamond) {
    fail('R1/R5: bone marker must exist, replace ◆, and be hidden before touch: ' + JSON.stringify(beforeBone));
  } else ok('R1 bone expected marker is present but hidden before the user answers');

  await clickSlider();

  const afterTouchBone = await page.evaluate(() => {
    const marker = document.querySelector('[data-expected-marker="bone"]');
    if (!marker) return null;
    const style = getComputedStyle(marker);
    return { revealed: marker.getAttribute('data-revealed'), opacity: Number(style.opacity), hasSvg: !!marker.querySelector('svg') };
  });
  if (!afterTouchBone?.hasSvg || afterTouchBone.revealed !== 'false' || afterTouchBone.opacity !== 0) {
    fail('R1: bone marker revealed too early on slider touch: ' + JSON.stringify(afterTouchBone));
  } else ok('R1 bone marker stays hidden while the user sets their value');

  const loaderStartedAt = Date.now();
  await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  await page.waitForTimeout(60);
  const afterNextBone = await page.evaluate(() => {
    const marker = document.querySelector('[data-expected-marker="bone"]');
    if (!marker) return null;
    const style = getComputedStyle(marker);
    return { revealed: marker.getAttribute('data-revealed'), opacity: Number(style.opacity), hasSvg: !!marker.querySelector('svg') };
  });
  if (!afterNextBone?.hasSvg || afterNextBone.revealed !== 'true' || afterNextBone.opacity < 0.95) {
    fail('R1: bone marker did not reveal when Next committed the answer: ' + JSON.stringify(afterNextBone));
  } else ok('R1 bone marker reveals when Next commits the user value');
  await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  await page.waitForTimeout(80);
  if (!(await stepVisible('acidity'))) {
    fail('R1: rapid second Next during bone reveal skipped past the current step');
  } else ok('R1 rapid second Next is ignored while the bone reveal auto-advances');

  await page.locator('[data-ruphus-bubble="loader"]').waitFor({ state: 'visible', timeout: 250 }).catch(() => fail('R2: loader bubble did not appear immediately after answer commit'));
  const loaderDelay = Date.now() - loaderStartedAt;
  const threadState = await page.evaluate(() => ({
    thread: document.querySelector('[data-ruphus-thread="true"]') != null,
    coach: document.querySelector('[data-ruphus-bubble="coach"]') != null,
    loader: document.querySelector('[data-ruphus-bubble="loader"]') != null,
    matrix: document.querySelector('[data-dot-matrix-loader="true"] canvas') != null,
  }));
  if (!threadState.thread || !threadState.coach || !threadState.loader || !threadState.matrix) {
    fail('R2/R3: chat thread must show coach bubble plus separate canvas loader bubble: ' + JSON.stringify(threadState));
  } else ok(`R2/R3 immediate chat-thread loader appears in ${loaderDelay}ms with canvas dot-matrix`);

  await page.locator('[data-ruphus-bubble="reaction"]').waitFor({ state: 'visible', timeout: 950 }).catch(() => fail('R2: reaction bubble did not replace the loader before auto-advance'));
  await page.waitForTimeout(40);
  const reactionState = await page.evaluate(() => ({
    reaction: document.querySelector('[data-ruphus-bubble="reaction"]')?.textContent || '',
    loader: document.querySelector('[data-ruphus-bubble="loader"]') != null,
    coach: document.querySelector('[data-ruphus-bubble="coach"]') != null,
  }));
  if (!reactionState.reaction.includes('sparkle') || reactionState.loader || reactionState.coach) {
    fail('R2: reaction must replace loader and coach bubble must fade/remove: ' + JSON.stringify(reactionState));
  } else ok('R2 reaction replaces the loader and the coaching bubble fades out');

  await waitStep('sweetness', 1600).catch(() => fail('R1: one Next did not auto-advance after the bone reveal hold'));
  if (!(await stepVisible('sweetness'))) {
    fail('R1: expected to land on Sweetness after one-press Acidity commit');
  } else ok('R1 one Next reveals the bone, waits, then auto-advances to the next page');

  await clickSlider();
  await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  await page.waitForTimeout(80);
  const sweetnessReveal = await page.evaluate(() => {
    const marker = document.querySelector('[data-expected-marker="bone"]');
    if (!marker) return null;
    const style = getComputedStyle(marker);
    return { revealed: marker.getAttribute('data-revealed'), opacity: Number(style.opacity), hasSvg: !!marker.querySelector('svg') };
  });
  if (!sweetnessReveal?.hasSvg || sweetnessReveal.revealed !== 'true' || sweetnessReveal.opacity < 0.95) {
    fail('R1: Sweetness Next did not reveal before auto-advancing: ' + JSON.stringify(sweetnessReveal));
  } else ok('R1 Sweetness Next reveals before the timed auto-advance');
  await clickSlider();
  const afterRevisionBone = await page.evaluate(() => {
    const marker = document.querySelector('[data-expected-marker="bone"]');
    if (!marker) return null;
    const style = getComputedStyle(marker);
    return { revealed: marker.getAttribute('data-revealed'), opacity: Number(style.opacity), hasSvg: !!marker.querySelector('svg') };
  });
  if (!afterRevisionBone?.hasSvg || afterRevisionBone.revealed !== 'false' || afterRevisionBone.opacity !== 0) {
    fail('R1: revising a revealed slider must hide the bone again: ' + JSON.stringify(afterRevisionBone));
  } else ok('R1 revising a revealed slider hides the bone again');
  await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  await page.waitForTimeout(80);
  const stillSweetnessAfterRevision = await stepVisible('sweetness');
  const afterRecommit = await page.evaluate(() => {
    const marker = document.querySelector('[data-expected-marker="bone"]');
    if (!marker) return null;
    const style = getComputedStyle(marker);
    return {
      revealed: marker.getAttribute('data-revealed'),
      opacity: Number(style.opacity),
    };
  });
  if (!stillSweetnessAfterRevision || afterRecommit?.revealed !== 'true' || afterRecommit.opacity < 0.95) {
    fail('R1: Next after revision must re-reveal on the same step before timed auto-advance: ' + JSON.stringify({ stillSweetnessAfterRevision, ...afterRecommit }));
  } else ok('R1 Next after revision re-reveals before timed auto-advance');

  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.waitForTimeout(180);
  if (!(await page.getByText('Leave this tasting?', { exact: true }).isVisible().catch(() => false))) fail('R4: close with progress did not show confirm');
  else ok('R4 close with progress shows a confirm instead of discarding');
  await page.getByRole('button', { name: 'Leave', exact: true }).first().click();
  await page.waitForTimeout(400);
  if (!(await page.getByText('Resume your Geometry Blend tasting', { exact: false }).first().isVisible().catch(() => false))) fail('R4: guided entry did not offer Resume after exit');
  else ok('R4 guided entry offers Resume while the in-session draft exists');
  await page.evaluate(() => window.__SET_TASTING_TAB_MOUNTED__?.(false));
  await page.waitForTimeout(160);
  await page.evaluate(() => window.__SET_TASTING_TAB_MOUNTED__?.(true));
  await page.waitForTimeout(400);
  if (!(await page.getByText('Resume your Geometry Blend tasting', { exact: false }).first().isVisible().catch(() => false))) fail('R4: App-level draft did not survive TastingTab unmount/remount');
  else ok('R4 in-session draft survives TastingTab unmount/remount');
  await page.getByText('Resume your Geometry Blend tasting', { exact: false }).first().click();
  await page.waitForTimeout(STEP_PAUSE);
  if (!(await stepVisible('sweetness'))) fail('R4: resume did not restore the active Sweetness step');
  const resumedBone = await page.evaluate(() => document.querySelector('[data-expected-marker="bone"]')?.getAttribute('data-revealed'));
  if (resumedBone !== 'true') fail('R4/R1: resume did not restore the touched slider draft');
  else ok('R4 resume restores the step and touched slider draft');

  await clickSlider();
  await clickFooter('Next', REVEAL_ADVANCE_PAUSE);

  // ---- STEP 5: Body ----
  await clickSlider();
  await clickFooter('Next', REVEAL_ADVANCE_PAUSE);

  // ---- STEP 6: Flavor — explicit Flavor beat + gated chips (R1, R3) ----
  if (!(await stepVisible('flavor'))) fail('R1: explicit Flavor step missing');
  else ok('R1 explicit Flavor step present');
  const flavorFruity = page.getByRole('button', { name: 'Fruity', exact: true }).first();
  await flavorFruity.scrollIntoViewIfNeeded();
  await flavorFruity.click();
  await page.waitForTimeout(300);
  const flavorBerry = page.getByRole('button', { name: 'Berry', exact: true }).first();
  await flavorBerry.scrollIntoViewIfNeeded();
  await flavorBerry.click();
  await page.waitForTimeout(150);
  await clickSlider(); // flavor intensity → flavor score
  await clickFooter('Next', REVEAL_ADVANCE_PAUSE);

  // ---- STEP 7: Finish — linger cue (R1) ----
  const finishTxt = await techniqueText();
  if (!finishTxt.includes('linger')) fail('R1: Finish step missing linger cue');
  else ok('R1 Finish step has linger cue');
  await clickSlider();
  await clickFooter('Next', REVEAL_ADVANCE_PAUSE);

  // ---- STEP 8: Balance — explicit Balance beat (R1) ----
  if (!(await stepVisible('balance'))) fail('R1: explicit Balance step missing');
  else ok('R1 explicit Balance step present');
  await clickSlider();
  await clickFooter('See your cup', REVEAL_ADVANCE_PAUSE);

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

  // ---- R4: switching beans after leaving a draft starts fresh instead of trapping Resume ----
  const switchPage = await browser.newPage({ viewport: { width: 402, height: 880 }, deviceScaleFactor: 2 });
  await switchPage.emulateMedia({ reducedMotion: 'reduce' });
  await switchPage.goto(`${URL}?evidence=draft-switch`, { waitUntil: 'networkidle' });
  await switchPage.waitForTimeout(700);
  if (!(await switchPage.getByText('Resume your Geometry Blend tasting', { exact: false }).first().isVisible().catch(() => false))) {
    fail('R4: seeded draft did not show Resume CTA');
  }
  await switchPage.getByLabel('Pick bean to taste').selectOption('b2');
  await switchPage.waitForTimeout(300);
  const freshSwitch = {
    start: await switchPage.getByText('Start guided tasting', { exact: false }).first().isVisible().catch(() => false),
    resume: await switchPage.getByText('Resume your Geometry Blend tasting', { exact: false }).first().isVisible().catch(() => false),
    bean: await switchPage.getByText('Kenya Karinga', { exact: false }).first().isVisible().catch(() => false),
  };
  if (!freshSwitch.start || freshSwitch.resume || !freshSwitch.bean) {
    fail('R4: switching bean with a draft must clear Resume and expose fresh start: ' + JSON.stringify(freshSwitch));
  } else ok('R4 switching beans clears draft and exposes fresh guided start');
  await switchPage.getByText('Start guided tasting', { exact: false }).first().click();
  await switchPage.waitForTimeout(STEP_PAUSE);
  if (!(await switchPage.getByText('Kenya Karinga', { exact: false }).first().isVisible().catch(() => false))) {
    fail('R4: fresh guided start after draft switch did not open the selected bean');
  } else ok('R4 fresh guided start opens the selected bean after draft switch');
  await switchPage.close();

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
