import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';

const firebaseEnv = {
  VITE_FIREBASE_API_KEY: 'ruphus-harness-not-a-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'ruphus-harness.invalid',
  VITE_FIREBASE_PROJECT_ID: 'ruphus-harness',
  VITE_FIREBASE_STORAGE_BUCKET: 'ruphus-harness.invalid',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:ruphus-harness',
};
const screenshots = {
  cardMobile: '/tmp/ruphus-recipe-first-preview-card-mobile.png',
  mobile: '/tmp/ruphus-recipe-first-preview-mobile.png',
  desktop: '/tmp/ruphus-recipe-first-preview-desktop.png',
  sourceCard320: '/tmp/ruphus-source-recipe-first-card-320-large-text.png',
  sourcePreview320: '/tmp/ruphus-source-recipe-first-preview-320-large-text.png',
  sourceHistorical320: '/tmp/ruphus-source-recipe-first-historical-320-large-text.png',
};
let server;
let output = '';
const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '0'], { env: { ...process.env, ...firebaseEnv, TMB_APP_VARIANT: 'dev' }, stdio: ['ignore', 'pipe', 'pipe'] });
const collect = (chunk) => { output += chunk.toString(); };
child.stdout.on('data', collect); child.stderr.on('data', collect);
try {
  const baseUrl = await new Promise((resolve, reject) => {
    const ready = () => { const match = output.match(/Local:\s+http:\/\/(127\.0\.0\.1:\d+)\//); if (match) resolve(`http://${match[1]}`); };
    child.stdout.on('data', ready); child.stderr.on('data', ready);
    child.once('exit', (code) => reject(new Error(`Vite exited before fixture startup (${code}): ${output}`)));
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const localOrigin = new URL(baseUrl).origin;
    const blockedRequests = [];
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== 'GET' || url.origin !== localOrigin) {
        blockedRequests.push(`${request.method()} ${request.url()}`);
        await route.abort();
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    const attachPageHealth = (target, targetErrors, targetWrites) => {
      target.on('pageerror', (error) => targetErrors.push(error.message));
      target.on('console', (message) => { if (message.type() === 'error') targetErrors.push(message.text()); });
      target.on('request', (request) => { if (request.method() !== 'GET') targetWrites.push(`${request.method()} ${request.url()}`); });
    };
    const waitForSettledModal = async (target) => {
      await target.waitForFunction(() => {
        const close = document.querySelector('button[aria-label="Close"]');
        if (!close) return false;
        let node = close;
        let fixedOverlay = false;
        while (node) {
          const style = getComputedStyle(node);
          if (style.opacity !== '1') return false;
          if (style.position === 'fixed' && style.zIndex === '1000') fixedOverlay = true;
          node = node.parentElement;
        }
        const sheet = close.parentElement?.parentElement;
        if (!sheet || !fixedOverlay) return false;
        const transform = getComputedStyle(sheet).transform;
        if (transform === 'none') return true;
        const values = transform.match(/^matrix(?:3d)?\(([^)]+)\)$/)?.[1].split(',').map(Number) || [];
        const translateY = values.length === 16 ? values[13] : values.length === 6 ? values[5] : Number.NaN;
        return Number.isFinite(translateY) && Math.abs(translateY) < 0.5;
      });
      return true;
    };
    const measureText = (target, scopeKind, specs) => target.evaluate(({ scopeKind: kind, specs: requested }) => {
      const roots = {
        card: document.querySelector('[data-preview-card]'),
        modal: document.querySelector('button[aria-label="Close"]')?.parentElement?.parentElement,
        historical: document.querySelector('[data-historical-inspection="true"]'),
      };
      const root = roots[kind];
      const metric = (element) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const number = (value) => Number.isFinite(Number.parseFloat(value)) ? Number.parseFloat(value) : null;
        return {
          text: (element.textContent || '').trim().slice(0, 80),
          fontSizePx: number(style.fontSize),
          lineHeightPx: number(style.lineHeight),
          boxHeightPx: rect.height,
          boxWidthPx: rect.width,
        };
      };
      return Object.fromEntries(requested.map(({ name, selector }) => [name, metric(root?.querySelector(selector))]));
    }, { scopeKind, specs });
    const markTextTargets = async (target, scopeKind, specs) => {
      const marked = await target.evaluate(({ scopeKind: kind, specs: requested }) => {
        const roots = {
          card: document.querySelector('[data-preview-card]'),
          modal: document.querySelector('button[aria-label="Close"]')?.parentElement?.parentElement,
          historical: document.querySelector('[data-historical-inspection="true"]'),
        };
        const root = roots[kind];
        return requested.map(({ name, selector }) => {
          const element = root?.querySelector(selector);
          if (!element) return false;
          element.dataset.largeTextTarget = `${kind}-${name}`;
          return true;
        });
      }, { scopeKind, specs });
      if (!marked.every(Boolean)) throw new Error(`Could not mark ${scopeKind} large-text metrics: ${JSON.stringify(marked)}`);
      return specs.map(({ name }) => ({ name, selector: `[data-large-text-target="${scopeKind}-${name}"]` }));
    };
    // Chromium does not emulate iOS text-size adjustment for fixed-pixel
    // inline React styles. This fallback intentionally changes only the
    // computed font and line-box sizes of text-bearing descendants in the
    // requested surface; it never applies page zoom, CSS zoom, or transforms.
    const applyTextOnlyLargeTextFallback = (target, scopeKind, scale) => target.evaluate(({ scopeKind: kind, scale: multiplier }) => {
      const roots = {
        card: document.querySelector('[data-preview-card]'),
        modal: document.querySelector('button[aria-label="Close"]')?.parentElement?.parentElement,
        historical: document.querySelector('[data-historical-inspection="true"]'),
      };
      const root = roots[kind];
      if (!root) return 0;
      const elements = [...root.querySelectorAll('div,p,span,strong,button,a,li,h1,h2,h3,h4,label,summary')]
        .filter((element) => (element.textContent || '').trim() && getComputedStyle(element).display !== 'none');
      const snapshots = elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          element,
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      });
      snapshots.forEach(({ element, fontSize, lineHeight }) => {
        if (Number.isFinite(fontSize)) element.style.setProperty('font-size', `${fontSize * multiplier}px`, 'important');
        if (Number.isFinite(lineHeight)) element.style.setProperty('line-height', `${lineHeight * multiplier}px`, 'important');
      });
      return snapshots.length;
    }, { scopeKind, scale });
    const textActuallyGrew = (baseline, candidate) => Object.keys(baseline).every((name) => {
      const before = baseline[name];
      const after = candidate[name];
      if (!before || !after || !Number.isFinite(before.fontSizePx) || !Number.isFinite(after.fontSizePx)) return false;
      if (after.fontSizePx < before.fontSizePx * 1.2) return false;
      if (Number.isFinite(before.lineHeightPx) && (!Number.isFinite(after.lineHeightPx) || after.lineHeightPx < before.lineHeightPx * 1.2)) return false;
      return true;
    });
    const textEvidence = (baseline, native, large, fallbackApplied) => ({
      requestedTextSizeAdjust: '200%',
      fallbackApplied,
      baseline,
      nativeTextSizeAdjust: native,
      measuredLargeText: large,
    });
    const cardTextSpecs = [
      { name: 'title', selector: ':scope > div:first-child' },
      { name: 'change', selector: ':scope [data-preview-change]' },
      { name: 'viewButton', selector: ':scope button[aria-label="View recipe"]' },
    ];
    attachPageHealth(page, errors, writes);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?aiden`, { waitUntil: 'networkidle' });
    assert.match(await page.locator('[data-profile-change="Ratio"]').innerText(), /1:16 → 1:15.5/);
    assert.equal(await page.locator('[data-profile-action]').innerText(), '');
    await page.getByText('View full Aiden profile', { exact: true }).click();
    assert.match(await page.locator('details').innerText(), /2 pulses · 20s interval · 96 → 95°C/);
    assert.match(await page.locator('details').innerText(), /Choose the serving size on Aiden/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/tmp/ruphus-aiden-profile-320.png', fullPage: true });
    for (const [label, mode] of [['Save profile', 'apply_proposal'], ['Prepare trial in Fellow', 'brew_once'], ['Leave unchanged', 'keep_current']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      assert.equal(await page.locator('[data-profile-action]').innerText(), mode);
    }
    await page.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?aiden&pending`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('button', { name: 'Save profile', exact: true }).isDisabled(), true);
    await page.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?aiden&historical`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('button', { name: 'Save profile', exact: true }).count(), 0);
    assert.deepEqual(writes, []);
    console.log('Aiden full profile review, ratio diff, explicit action dispatch, pending and historical safety passed at 320px; no external calls.');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.screenshot({ path: screenshots.cardMobile, fullPage: false });
    await page.getByRole('button', { name: 'View recipe', exact: true }).click();
    await page.getByRole('button', { name: 'Increase coffee dose', exact: true }).click();
    for (let dose = 15; dose <= 20; dose += 1) await page.getByRole('button', { name: 'Increase coffee dose', exact: true }).click();
    assert.match(await page.locator('body').innerText(), /20g/);
    assert.match(await page.locator('body').innerText(), /300g/);
    await page.locator('button[aria-label="Close"]').click();
    await page.waitForTimeout(900);
    assert.equal(await page.locator('[data-start-count]').innerText(), '0');
    assert.equal(await page.locator('[data-save-count]').innerText(), '0');
    assert.deepEqual(writes, []);
    await page.getByRole('button', { name: 'View recipe', exact: true }).click();
    assert.match(await page.locator('body').innerText(), /20g/);
    await page.getByText('Hand Brew Recipe', { exact: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(1000);
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.getByRole('button', { name: 'Start brew timer', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshots.mobile, fullPage: false });
    await page.getByRole('button', { name: 'Start brew timer', exact: true }).click();
    assert.equal(await page.locator('[data-start-count]').innerText(), '1');
    assert.equal(await page.locator('[data-save-count]').innerText(), '0');
    assert.deepEqual(writes, []);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: screenshots.desktop, fullPage: false });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ flow: 'passed', ratio: '1:16 → 1:15', dose: '13g → 20g', water: '300g', startCount: 1, saveCount: 0, writes: 0, reducedMotion: true, screenshots }));

    const errorPage = await context.newPage();
    await errorPage.setViewportSize({ width: 390, height: 844 });
    await errorPage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?start-stale=1`, { waitUntil: 'domcontentloaded' });
    await errorPage.getByRole('button', { name: 'View recipe', exact: true }).click();
    await errorPage.getByText('Hand Brew Recipe', { exact: true }).waitFor({ state: 'visible' });
    await errorPage.waitForTimeout(1000);
    await errorPage.getByRole('button', { name: 'Start brew timer', exact: true }).scrollIntoViewIfNeeded();
    const startButton = errorPage.getByRole('button', { name: 'Start brew timer', exact: true });
    const saveButton = errorPage.getByRole('button', { name: 'Save recipe', exact: true });
    const startBeforeError = await startButton.boundingBox();
    assert.ok(startBeforeError && startBeforeError.y < 844 && startBeforeError.y + startBeforeError.height > 0, 'Start action must be in the viewport before failure');
    await startButton.click({ force: true });
    const previewError = errorPage.getByRole('alert');
    await previewError.waitFor({ state: 'visible' });
    const errorBox = await previewError.boundingBox();
    const startBox = await startButton.boundingBox();
    const saveBox = await saveButton.boundingBox();
    assert.ok(errorBox && startBox && saveBox, 'Preview error and actions must render');
    assert.ok(errorBox.y < 844 && errorBox.y + errorBox.height > 0, 'Preview error must remain in the viewport after failure');
    assert.ok(errorBox.y + errorBox.height <= startBox.y + 1, 'Preview error must sit above Start action');
    assert.ok(startBox.y - (errorBox.y + errorBox.height) <= 12, 'Preview error must remain adjacent to preview actions');
    assert.ok(saveBox.y >= startBox.y + startBox.height - 1, 'Save action must remain below Start action');
    assert.equal(await startButton.isDisabled(), true, 'Stale preview cannot start a brew');
    assert.equal(await saveButton.isDisabled(), true, 'Stale preview cannot save a recipe');
    assert.equal(await errorPage.getByRole('alert').count(), 1);
    await errorPage.getByRole('button', { name: 'Back to chat', exact: true }).click();
    await errorPage.getByRole('button', { name: 'View recipe', exact: true }).waitFor({ state: 'visible' });
    await errorPage.close();
    const doseErrorPage = await context.newPage();
    await doseErrorPage.setViewportSize({ width: 390, height: 844 });
    await doseErrorPage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?dose-error=1`, { waitUntil: 'domcontentloaded' });
    await doseErrorPage.getByRole('button', { name: 'View recipe', exact: true }).click();
    const increaseDose = doseErrorPage.getByRole('button', { name: 'Increase coffee dose', exact: true });
    await increaseDose.click();
    const doseAlert = doseErrorPage.getByRole('alert');
    await doseAlert.waitFor({ state: 'visible' });
    const doseAlertBox = await doseAlert.boundingBox();
    const doseControlBox = await increaseDose.boundingBox();
    assert.ok(doseAlertBox && doseControlBox && doseAlertBox.y < 844, 'Dose feedback must be visible without scrolling');
    assert.ok(doseAlertBox.y >= doseControlBox.y && doseAlertBox.y - (doseControlBox.y + doseControlBox.height) < 100, 'Dose feedback belongs beside the dose controls, not below the instructions');
    assert.equal(await doseErrorPage.locator('[data-start-count]').innerText(), '0');
    assert.equal(await doseErrorPage.locator('[data-save-count]').innerText(), '0');
    await doseErrorPage.close();
    const grindPage = await context.newPage();
    await grindPage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?grind-normalization=1`, { waitUntil: 'domcontentloaded' });
    await grindPage.getByRole('button', { name: 'View recipe', exact: true }).click();
    await grindPage.locator('[data-grind-normalization]').waitFor({ state: 'visible' });
    assert.match(await grindPage.locator('[data-grind-normalization]').innerText(), /old setting 5\.9.*nearest Ode Gen 2 click, 6/s);
    await grindPage.close();
    const techniquePage = await context.newPage();
    await techniquePage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?technique=1`, { waitUntil: 'domcontentloaded' });
    await techniquePage.getByText('Tetsu Kasuya 4:6', { exact: true }).waitFor();
    assert.match(await techniquePage.locator('[data-preview-change]').innerText(), /Technique.*Tetsu Kasuya/);
    await techniquePage.screenshot({ path: '/tmp/ruphus-named-technique-mobile.png' });
    await techniquePage.getByRole('button', { name: 'View recipe', exact: true }).click();
    await techniquePage.getByText('Tetsu Kasuya 4:6 method', { exact: true }).waitFor();
    assert.equal(await techniquePage.locator('[data-start-count]').innerText(), '0');
    assert.equal(await techniquePage.locator('[data-save-count]').innerText(), '0');
    await techniquePage.close();
    const historyPage = await context.newPage();
    await historyPage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?technique=1&historical=1`, { waitUntil: 'domcontentloaded' });
    await historyPage.getByRole('button', { name: 'View recipe', exact: true }).click();
    await historyPage.locator('[data-inspected-id="changed-ratio-fixture"]').waitFor();
    assert.equal(await historyPage.getByText('Hand Brew Recipe', { exact: true }).count(), 0, 'Historical inspection must not regenerate an actionable preview');
    assert.equal(await historyPage.locator('[data-start-count]').innerText(), '0');
    assert.equal(await historyPage.locator('[data-save-count]').innerText(), '0');
    await historyPage.close();

    // Source-backed card -> preview and historical detail at the narrowest
    // mobile width under a large-text setting. The fixture uses the real
    // ArtifactRenderer, HandBrewModal and HistoricalRecipeInspector; only
    // local owner glue captures the originating control for this harness.
    const sourcePage = await context.newPage();
    const sourceErrors = [];
    const sourceWrites = [];
    attachPageHealth(sourcePage, sourceErrors, sourceWrites);
    await sourcePage.setViewportSize({ width: 320, height: 844 });
    await sourcePage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?source=1`, { waitUntil: 'domcontentloaded' });
    const sourceCardMetricSpecs = await markTextTargets(sourcePage, 'card', cardTextSpecs);
    const sourceTextBaseline = await measureText(sourcePage, 'card', sourceCardMetricSpecs);
    await sourcePage.evaluate(() => {
      localStorage.clear();
      document.documentElement.style.setProperty('-webkit-text-size-adjust', '200%');
    });
    const sourceTextNative = await measureText(sourcePage, 'card', sourceCardMetricSpecs);
    const sourceLargeTextFallback = !textActuallyGrew(sourceTextBaseline, sourceTextNative);
    if (sourceLargeTextFallback) await applyTextOnlyLargeTextFallback(sourcePage, 'card', 1.25);
    const sourceTextLarge = await measureText(sourcePage, 'card', sourceCardMetricSpecs);
    assert.equal(textActuallyGrew(sourceTextBaseline, sourceTextLarge), true, 'Source card text and line boxes must enlarge against an unscaled baseline');
    await sourcePage.locator('[data-preview-card]').waitFor({ state: 'visible' });
    const sourceResponsive = await sourcePage.evaluate(() => {
      const card = document.querySelector('[data-preview-card]');
      const button = card?.querySelector('button[aria-label="View recipe"]');
      const cardBox = card?.getBoundingClientRect();
      const buttonBox = button?.getBoundingClientRect();
      return {
        mediaReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        fixtureReducedMotion: document.querySelector('[data-reduced-motion]')?.dataset.reducedMotion,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        cardVisible: Boolean(cardBox && cardBox.top < window.innerHeight && cardBox.bottom > 0),
        cardWidth: cardBox?.width || 0,
        viewButtonVisible: Boolean(buttonBox && buttonBox.top < window.innerHeight && buttonBox.bottom > 0),
        viewButtonHeight: buttonBox?.height || 0,
      };
    });
    assert.equal(sourceResponsive.mediaReducedMotion, true);
    assert.equal(sourceResponsive.fixtureReducedMotion, 'true');
    assert.equal(sourceResponsive.viewportWidth, 320);
    assert.ok(sourceResponsive.documentWidth <= sourceResponsive.viewportWidth, 'Source card must not overflow the 320px viewport');
    assert.equal(sourceResponsive.cardVisible, true, 'Source card must be visible in the first viewport');
    assert.equal(sourceResponsive.viewButtonVisible, true, 'Source card View recipe action must be visible at large text');
    assert.ok(sourceResponsive.viewButtonHeight >= 44, 'Source card action must retain a 44px touch target');
    assert.match(await sourcePage.locator('[data-preview-card]').innerText(), /HARIO Switch 03 Matt Winton bloom hybrid/);
    assert.match(await sourcePage.locator('[data-preview-card]').innerText(), /360mL water/);
    await sourcePage.screenshot({ path: screenshots.sourceCard320, fullPage: false });
    // Re-open the modal from an unscaled document state so its baseline is
    // genuinely unscaled before the large-text setting is measured.
    await sourcePage.evaluate(() => document.documentElement.style.removeProperty('-webkit-text-size-adjust'));
    const sourceViewButton = sourcePage.getByRole('button', { name: 'View recipe', exact: true });
    await sourceViewButton.focus();
    await sourceViewButton.click();
    await sourcePage.getByText('Hand Brew Recipe', { exact: true }).waitFor({ state: 'visible' });
    const sourcePreviewSettled = await waitForSettledModal(sourcePage);
    const sourcePreviewMetricSpecs = await markTextTargets(sourcePage, 'modal', [
      { name: 'title', selector: 'div[style*="font-size: 24px"]' },
    ]);
    const sourcePreviewTextBaseline = await measureText(sourcePage, 'modal', sourcePreviewMetricSpecs);
    await sourcePage.evaluate(() => document.documentElement.style.setProperty('-webkit-text-size-adjust', '200%'));
    const sourcePreviewTextNative = await measureText(sourcePage, 'modal', sourcePreviewMetricSpecs);
    const sourcePreviewLargeTextFallback = !textActuallyGrew(sourcePreviewTextBaseline, sourcePreviewTextNative);
    if (sourcePreviewLargeTextFallback) await applyTextOnlyLargeTextFallback(sourcePage, 'modal', 1.25);
    const sourcePreviewTextLarge = await measureText(sourcePage, 'modal', sourcePreviewMetricSpecs);
    assert.equal(textActuallyGrew(sourcePreviewTextBaseline, sourcePreviewTextLarge), true, 'Source preview text and line boxes must enlarge against an unscaled baseline');
    assert.match(await sourcePage.locator('body').innerText(), /HARIO Switch 03 Matt Winton bloom hybrid/);
    assert.match(await sourcePage.locator('body').innerText(), /50g/);
    assert.match(await sourcePage.locator('body').innerText(), /360mL/);
    const sourceDoseDecrease = sourcePage.getByRole('button', { name: 'Decrease coffee dose', exact: true });
    const sourceStartButton = sourcePage.getByRole('button', { name: 'Start source brew guide', exact: true });
    const sourceSaveButton = sourcePage.getByRole('button', { name: 'Save recipe', exact: true });
    assert.equal(await sourceDoseDecrease.count(), 1, 'Source preview must expose the existing dose control');
    assert.equal(await sourceSaveButton.count(), 1, 'Source preview must expose Save recipe');
    assert.equal(await sourceStartButton.count(), 1, 'Source preview must keep an explicit Start action');
    await sourceDoseDecrease.click();
    await sourcePage.getByText('345mL', { exact: true }).waitFor({ state: 'visible' });
    await sourcePage.getByText(/47\.92g/).first().waitFor({ state: 'visible' });
    assert.match(await sourcePage.locator('body').innerText(), /23g/);
    assert.match(await sourcePage.locator('body').innerText(), /345mL/);
    assert.match(await sourcePage.locator('body').innerText(), /47.92g/);
    assert.match(await sourcePage.locator('body').innerText(), /Same setting as the source 02 recipe; very similar to a V60 grind/);
    assert.equal(await sourceSaveButton.isDisabled(), false, 'Ready source preview must allow Save recipe');
    await sourceSaveButton.click();
    await sourceStartButton.click();
    assert.equal(await sourcePage.locator('[data-save-count]').innerText(), '1');
    assert.equal(await sourcePage.locator('[data-start-count]').innerText(), '1');
    assert.ok(await sourcePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Source preview must not overflow the 320px viewport');
    await sourcePage.screenshot({ path: screenshots.sourcePreview320, fullPage: false });
    await sourcePage.getByRole('button', { name: 'Close', exact: true }).click();
    await sourcePage.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'View recipe');
    assert.equal(await sourcePage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'View recipe', 'Preview close must return focus to its originating source-card control');
    assert.deepEqual(sourceWrites, []);
    assert.deepEqual(sourceErrors, []);
    await sourcePage.close();

    const sourceOriginalPage = await context.newPage();
    const sourceOriginalErrors = [];
    const sourceOriginalWrites = [];
    attachPageHealth(sourceOriginalPage, sourceOriginalErrors, sourceOriginalWrites);
    await sourceOriginalPage.setViewportSize({ width: 320, height: 844 });
    await sourceOriginalPage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?source=1&source-original=1`, { waitUntil: 'domcontentloaded' });
    await sourceOriginalPage.getByRole('button', { name: 'View recipe', exact: true }).click();
    await sourceOriginalPage.getByText('Hand Brew Recipe', { exact: true }).waitFor({ state: 'visible' });
    assert.match(await sourceOriginalPage.locator('body').innerText(), /36g/);
    assert.match(await sourceOriginalPage.locator('body').innerText(), /440mL/);
    assert.match(await sourceOriginalPage.locator('body').innerText(), /Medium grind/);
    assert.match(await sourceOriginalPage.locator('body').innerText(), /Source setting: medium grind/);
    assert.equal(await sourceOriginalPage.getByRole('button', { name: 'Save recipe', exact: true }).isDisabled(), false, 'Supported original source dose must remain actionable');
    await sourceOriginalPage.getByRole('button', { name: 'Close', exact: true }).click();
    assert.deepEqual(sourceOriginalWrites, []);
    assert.deepEqual(sourceOriginalErrors, []);
    await sourceOriginalPage.close();

    const sourceAdaptedPage = await context.newPage();
    const sourceAdaptedErrors = [];
    const sourceAdaptedWrites = [];
    attachPageHealth(sourceAdaptedPage, sourceAdaptedErrors, sourceAdaptedWrites);
    await sourceAdaptedPage.setViewportSize({ width: 320, height: 844 });
    await sourceAdaptedPage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?source=1&source-immersion=1`, { waitUntil: 'domcontentloaded' });
    await sourceAdaptedPage.getByRole('button', { name: 'View recipe', exact: true }).click();
    await sourceAdaptedPage.getByText('Hand Brew Recipe', { exact: true }).waitFor({ state: 'visible' });
    assert.match(await sourceAdaptedPage.locator('body').innerText(), /15g/);
    assert.match(await sourceAdaptedPage.locator('body').innerText(), /183\.33mL/);
    const adaptedDoseIncrease = sourceAdaptedPage.getByRole('button', { name: 'Increase coffee dose', exact: true });
    assert.equal(await adaptedDoseIncrease.count(), 1, 'Adapted source preview must expose its dose control');
    await adaptedDoseIncrease.click();
    await sourceAdaptedPage.getByText('16g', { exact: true }).waitFor({ state: 'visible' });
    assert.match(await sourceAdaptedPage.locator('body').innerText(), /195\.56mL/);
    assert.equal(await sourceAdaptedPage.getByRole('button', { name: 'Start source brew guide', exact: true }).isDisabled(), false, 'Adapted source preview must remain startable');
    assert.equal(await sourceAdaptedPage.getByRole('button', { name: 'Save recipe', exact: true }).isDisabled(), false, 'Adapted source preview must remain saveable');
    await sourceAdaptedPage.screenshot({ path: '/tmp/ruphus-source-adapted-dose-mobile.png', fullPage: false });
    await sourceAdaptedPage.getByRole('button', { name: 'Close', exact: true }).click();
    assert.deepEqual(sourceAdaptedWrites, []);
    assert.deepEqual(sourceAdaptedErrors, []);
    await sourceAdaptedPage.close();

    const sourceHistoricalPage = await context.newPage();
    const sourceHistoricalErrors = [];
    const sourceHistoricalWrites = [];
    attachPageHealth(sourceHistoricalPage, sourceHistoricalErrors, sourceHistoricalWrites);
    await sourceHistoricalPage.setViewportSize({ width: 320, height: 844 });
    await sourceHistoricalPage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?source=1&historical=1`, { waitUntil: 'domcontentloaded' });
    const sourceHistoricalCardMetricSpecs = await markTextTargets(sourceHistoricalPage, 'card', cardTextSpecs);
    const sourceHistoricalTextBaseline = await measureText(sourceHistoricalPage, 'card', sourceHistoricalCardMetricSpecs);
    await sourceHistoricalPage.evaluate(() => {
      localStorage.clear();
      document.documentElement.style.setProperty('-webkit-text-size-adjust', '200%');
    });
    const sourceHistoricalTextNative = await measureText(sourceHistoricalPage, 'card', sourceHistoricalCardMetricSpecs);
    const sourceHistoricalCardLargeTextFallback = !textActuallyGrew(sourceHistoricalTextBaseline, sourceHistoricalTextNative);
    if (sourceHistoricalCardLargeTextFallback) await applyTextOnlyLargeTextFallback(sourceHistoricalPage, 'card', 1.25);
    const sourceHistoricalTextLarge = await measureText(sourceHistoricalPage, 'card', sourceHistoricalCardMetricSpecs);
    assert.equal(textActuallyGrew(sourceHistoricalTextBaseline, sourceHistoricalTextLarge), true, 'Historical source card text and line boxes must enlarge against an unscaled baseline');
    // As with the preview, remove the setting while mounting the detail so
    // the historical text comparison starts from a genuinely unscaled state.
    await sourceHistoricalPage.evaluate(() => document.documentElement.style.removeProperty('-webkit-text-size-adjust'));
    const sourceHistoricalViewButton = sourceHistoricalPage.getByRole('button', { name: 'View recipe', exact: true });
    await sourceHistoricalViewButton.focus();
    await sourceHistoricalViewButton.click();
    const sourceHistoricalDetail = sourceHistoricalPage.locator('[data-historical-inspection="true"]');
    await sourceHistoricalDetail.waitFor({ state: 'visible' });
    const historicalMetricSpecs = await markTextTargets(sourceHistoricalPage, 'historical', [
      { name: 'title', selector: ':scope > div:nth-child(2)' },
    ]);
    const historicalTextBaseline = await measureText(sourceHistoricalPage, 'historical', historicalMetricSpecs);
    await sourceHistoricalPage.evaluate(() => document.documentElement.style.setProperty('-webkit-text-size-adjust', '200%'));
    const historicalTextNative = await measureText(sourceHistoricalPage, 'historical', historicalMetricSpecs);
    const historicalLargeTextFallback = !textActuallyGrew(historicalTextBaseline, historicalTextNative);
    if (historicalLargeTextFallback) await applyTextOnlyLargeTextFallback(sourceHistoricalPage, 'historical', 1.25);
    const historicalTextLarge = await measureText(sourceHistoricalPage, 'historical', historicalMetricSpecs);
    assert.equal(textActuallyGrew(historicalTextBaseline, historicalTextLarge), true, 'Historical source detail text and line boxes must enlarge against an unscaled baseline');
    assert.match(await sourceHistoricalDetail.innerText(), /Historical recipe · read only/);
    assert.match(await sourceHistoricalDetail.innerText(), /HARIO Switch 03 Matt Winton bloom hybrid/);
    assert.match(await sourceHistoricalDetail.innerText(), /24g coffee/);
    assert.match(await sourceHistoricalDetail.innerText(), /360 mL water/);
    assert.equal(await sourceHistoricalPage.getByText('Hand Brew Recipe', { exact: true }).count(), 0, 'Historical source inspection must not open an actionable preview');
    assert.equal(await sourceHistoricalPage.evaluate(() => document.activeElement?.matches('[data-historical-inspection="true"]')), true, 'Historical detail must receive focus on open');
    assert.ok(await sourceHistoricalPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Historical source detail must not overflow the 320px viewport');
    await sourceHistoricalPage.screenshot({ path: screenshots.sourceHistorical320, fullPage: false });
    await sourceHistoricalPage.getByRole('button', { name: 'Close historical recipe', exact: true }).click();
    await sourceHistoricalPage.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'View recipe');
    assert.equal(await sourceHistoricalPage.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'View recipe', 'Historical close must return focus to its originating source-card control');
    assert.deepEqual(sourceHistoricalWrites, []);
    assert.deepEqual(sourceHistoricalErrors, []);
    await sourceHistoricalPage.close();
    const emptySlotPage = await context.newPage();
    await emptySlotPage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?technique=1&empty-slot=1`, { waitUntil: 'domcontentloaded' });
    await emptySlotPage.getByText('Try it first, or save it as your recipe.', { exact: true }).waitFor();
    await emptySlotPage.getByRole('button', { name: 'View recipe', exact: true }).click();
    await waitForSettledModal(emptySlotPage);
    assert.equal(await emptySlotPage.locator('[data-start-count]').innerText(), '0', 'An empty-slot draft opens review without starting a timer');
    await emptySlotPage.getByRole('button', { name: 'Close', exact: true }).click();
    await emptySlotPage.getByRole('button', { name: 'View recipe', exact: true }).waitFor();
    await emptySlotPage.close();
    for (const [mode, message] of [
      ['brew_once', 'Use this version for one brew. Nothing has been saved.'],
      ['undo_revision', 'The new recipe was removed. No recipe is saved for this brewer.'],
    ]) {
      const receiptPage = await context.newPage();
      await receiptPage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?empty-receipt=${mode}`, { waitUntil: 'domcontentloaded' });
      await receiptPage.getByText(message, { exact: true }).waitFor();
      assert.equal(await receiptPage.getByText('Your previous recipe is restored.', { exact: true }).count(), 0);
      await receiptPage.close();
    }
    assert.deepEqual(blockedRequests, [], 'Rendered fixture must not request non-local or non-GET resources');
    console.log(JSON.stringify({
      sourceResponsive,
      sourcePreviewSettled,
      sourceTextEvidence: {
        card: textEvidence(sourceTextBaseline, sourceTextNative, sourceTextLarge, sourceLargeTextFallback),
        preview: textEvidence(sourcePreviewTextBaseline, sourcePreviewTextNative, sourcePreviewTextLarge, sourcePreviewLargeTextFallback),
        historicalCard: textEvidence(sourceHistoricalTextBaseline, sourceHistoricalTextNative, sourceHistoricalTextLarge, sourceHistoricalCardLargeTextFallback),
        historicalDetail: textEvidence(historicalTextBaseline, historicalTextNative, historicalTextLarge, historicalLargeTextFallback),
      },
      sourceHistorical: { width: 320, reducedMotion: true, focusReturn: true },
      blockedRequests: blockedRequests.length,
      sourceWrites: 0,
    }));

    // Real deterministic orchestration output rendered through the actual card:
    // provider transport is injected; no live model or account is involved.
    const userText = 'What’s an interesting different V60 technique to try with Jar #1?';
    const turnContext = {
      userText, conversation: [], sessionId: 'rendered-technique-turn',
      rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'Jar #1 coffee', recipes: ['v60_hot'] }], refs: { c1: 'fixture-coffee' } },
      __ruphusRefs: { c1: 'fixture-coffee' },
      proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
    };
    const tools = createRuphusTools({ uid: 'rendered-fixture', context: turnContext, readers: { readRecipe: async () => generateV60Recipe({}, { dose: 20 }) } });
    const frames = [];
    let calls = 0;
    const turn = await runRuphusTurn({ turnId: 'rendered-technique', context: turnContext, userText, tools, emit: frame => frames.push(frame), provider: { runTurn: async ({ toolResult }) => {
      calls += 1;
      if (calls === 1) return { toolCalls: [{ callId: 'read', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      if (calls === 2) return { text: 'Here is a different approach for your coffee.' };
      const option = toolResult.results.find(item => item.name === 'read_technique_options').result.options[0];
      return { toolCalls: [{ callId: 'prepare', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', change: null, experiment: { kind: 'v60_technique', techniqueId: option.id } } }] };
    } } });
    assert.equal(turn.ok, true);
    assert.equal(turn.artifacts.length, 1);
    const runtimePage = await context.newPage();
    attachPageHealth(runtimePage, errors, writes);
    await runtimePage.addInitScript(data => { window.__ruphusTechniqueTurn = data; }, { userText, frames });
    await runtimePage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?technique=1`, { waitUntil: 'domcontentloaded' });
    assert.equal(await runtimePage.locator('[data-artifact="recipe_proposal"]').count(), 0);
    await runtimePage.getByRole('button', { name: 'Send technique request', exact: true }).click();
    await runtimePage.getByRole('button', { name: 'View recipe', exact: true }).waitFor();
    assert.equal(await runtimePage.locator('[data-artifact="recipe_proposal"]').count(), 1);
    assert.ok((await runtimePage.locator('[data-runtime-reply]').innerText()).trim());
    assert.equal(await runtimePage.locator('vite-error-overlay').count(), 0);
    await runtimePage.screenshot({ path: '/tmp/ruphus-same-turn-technique-mobile.png' });
    assert.deepEqual(errors, []);
    console.log('Same-turn deterministic response renders one native recipe card after one user request; live provider/native app not claimed.');
    await runtimePage.close();
    await context.close();
  } finally { await browser.close(); }
} finally {
  if (child && !child.killed) { child.kill('SIGTERM'); await once(child, 'exit').catch(() => {}); }
}
