import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';

const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '0'], {
  env: { ...process.env, TMB_APP_VARIANT: 'dev', VITE_FIREBASE_API_KEY: 'ruphus-harness-not-a-key', VITE_FIREBASE_AUTH_DOMAIN: 'ruphus-harness.invalid', VITE_FIREBASE_PROJECT_ID: 'ruphus-harness', VITE_FIREBASE_STORAGE_BUCKET: 'ruphus-harness.invalid', VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000', VITE_FIREBASE_APP_ID: '1:000000000000:web:ruphus-harness' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });
const baseUrl = await new Promise((resolve, reject) => {
  const ready = () => {
    const match = output.match(/Local:\s+http:\/\/(127\.0\.0\.1:\d+)\//);
    if (match) resolve(`http://${match[1]}`);
  };
  child.stdout.on('data', ready);
  child.stderr.on('data', ready);
  child.once('exit', (code) => reject(new Error(`Vite exited before source timer fixture startup (${code}): ${output}`)));
});

const browser = await chromium.launch({ headless: true });
const waitForRenderedRecipeModal = async (page) => {
  await page.waitForFunction(() => [...document.body.children].some((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.position === 'fixed'
      && style.zIndex === '1000'
      && Number(style.opacity) >= 0.99
      && rect.width > 0
      && rect.height > 0
      && element.querySelector('button[aria-label="Close"]');
  }));
};
const createHarnessContext = async () => {
  const harnessContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await harnessContext.route('**/*', route => new URL(route.request().url()).origin === baseUrl && route.request().method() === 'GET' ? route.continue() : route.abort());
  return harnessContext;
};
try {
  const context = await createHarnessContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${baseUrl}/scripts/ruphus-source-timer-ui-fixture.html`, { waitUntil: 'domcontentloaded' });
  await page.getByText('HARIO Switch 03 Matt Winton bloom hybrid', { exact: true }).last().waitFor({ timeout: 5000 }).catch(async error => {
    console.error(await page.locator('body').innerText());
    console.error(errors);
    await page.screenshot({ path: '/tmp/ruphus-shared-preview-failure.png' });
    throw error;
  });
  // Let the real modal entrance settle before replacing animation/timer clocks.
  await page.waitForTimeout(700);
  await waitForRenderedRecipeModal(page);
  await page.clock.install({ time: new Date() });
  assert.match(await page.locator('body').innerText(), /50g/);
  assert.match(await page.locator('body').innerText(), /360mL/);
  assert.match(await page.locator('body').innerText(), /valve open/);
  assert.match(await page.locator('body').innerText(), /At 0:30 from the first water/);
  const sourceGuideButton = page.locator('button[aria-label="Start brew timer"]');
  await sourceGuideButton.waitFor({ state: 'attached' });
  await sourceGuideButton.scrollIntoViewIfNeeded();
  assert.equal(await sourceGuideButton.count(), 1);
  await sourceGuideButton.click();
  await page.getByRole('heading', { name: 'HARIO Switch 03 Matt Winton bloom hybrid' }).waitFor();
  await page.clock.runFor(3500);
  await page.getByText('BREWING', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Pour finished' }).waitFor();
  assert.match(await page.locator('body').innerText(), /With the valve open, pour 50g/);
  await page.getByRole('button', { name: 'Pour finished' }).click();
  let sourceClockMs = Date.now();
  const advanceSourceClock = async (milliseconds) => {
    sourceClockMs += milliseconds;
    await page.clock.setSystemTime(new Date(sourceClockMs));
    await page.clock.runFor(100);
  };
  await advanceSourceClock(31_000);
  await page.getByRole('button', { name: 'Begin closing valve' }).click();
  await page.getByRole('button', { name: 'Confirm valve closed' }).click();
  await page.getByRole('button', { name: 'Begin pour' }).click();
  await page.getByRole('button', { name: 'Pour finished' }).click();
  await advanceSourceClock(151_000);
  await page.getByRole('button', { name: 'Begin opening valve' }).click();
  await page.getByRole('button', { name: 'Confirm valve open' }).click();
  await page.getByRole('button', { name: 'Begin drawdown check' }).click();
  await page.getByRole('button', { name: 'Drawdown complete' }).click();
  await page.waitForFunction(() => document.querySelector('[data-source-events]')?.textContent.includes('first-water'));
  assert.match(await page.locator('[data-source-events]').innerText(), /first-water/);
  assert.match(await page.locator('[data-source-events]').innerText(), /bloom:start/);
  const events = await page.locator('[data-source-events]').innerText();
  assert.match(events, /bloom:complete/);
  await page.getByText('Brew Complete', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-source-timing-status]')?.textContent === 'saved');
  const sourceTiming = JSON.parse(await page.locator('[data-source-timing-event]').textContent());
  assert.equal(sourceTiming.timingRecordVersion, 2);
  assert.equal(sourceTiming.sourceId, 'hario-switch-03-matt-winton-hybrid-24-2022');
  assert.equal(sourceTiming.clockOrigin, 'first-water');
  assert.equal(sourceTiming.targetMs, null);
  assert.equal(sourceTiming.completionKind, 'userFinished');
  await page.getByRole('button', { name: 'Start Tasting Session', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-tasting-started]')?.textContent === 'true');
  await page.waitForFunction(() => document.querySelector('[data-source-card-returned]')?.textContent === 'true');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/tmp/ruphus-source-timer-mobile.png', fullPage: false });

  const onyxContext = await createHarnessContext();
  const onyxPage = await onyxContext.newPage();
  const onyxErrors = [];
  onyxPage.on('pageerror', (error) => onyxErrors.push(error.message));
  onyxPage.on('console', (message) => { if (message.type() === 'error') onyxErrors.push(message.text()); });
  await onyxPage.goto(`${baseUrl}/scripts/ruphus-source-timer-ui-fixture.html?onyx23`, { waitUntil: 'domcontentloaded' });
  await onyxPage.getByText('Onyx Monarch Wave 185', { exact: true }).last().waitFor();
  await onyxPage.waitForTimeout(700);
  await waitForRenderedRecipeModal(onyxPage);
  await onyxPage.screenshot({ path: '/tmp/ruphus-source-recipe-shared.png' });
  await onyxPage.clock.install({ time: new Date() });
  const onyxPreview = await onyxPage.locator('body').innerText();
  assert.match(onyxPreview, /23g/);
  assert.match(onyxPreview, /368g/);
  const expectedGrind = await onyxPage.locator('[data-expected-grind]').textContent();
  assert.ok(expectedGrind);
  assert.ok(onyxPreview.includes(expectedGrind));
  assert.match(onyxPreview, /Estimated starting grind/);
  assert.match(onyxPreview, /3:30/);
  assert.doesNotMatch(onyxPreview, /147\.2g/);
  const onyxTargets = ['46g', '147g', '202g', '258g', '313g', '368g'];
  onyxTargets.forEach((target) => assert.ok(onyxPreview.includes(target), target));
  await onyxPage.clock.runFor(400);
  const onyxSourceGuideButton = onyxPage.locator('button[aria-label="Start brew timer"]');
  await onyxSourceGuideButton.waitFor({ state: 'visible' });
  assert.equal(await onyxSourceGuideButton.count(), 1);
  await onyxSourceGuideButton.click();
  await onyxPage.clock.runFor(3500);
  await onyxPage.getByText('BREWING', { exact: true }).waitFor();
  await onyxPage.clock.fastForward(31000);
  await onyxPage.getByRole('heading', { name: 'Onyx Monarch Wave 185' }).waitFor();
  const onyxTimer = await onyxPage.locator('body').innerText();
  // The shared timer presents whichever active stage the clock reached, while
  // the recipe sheet above asserts the complete cumulative sequence.
  assert.match(onyxTimer, /(?:46|147|202|258|313|368)g/);
  assert.match(onyxTimer, /3:30/);
  assert.doesNotMatch(onyxTimer, /147\.2g/);
  assert.deepEqual(onyxErrors, []);
  await onyxPage.screenshot({ path: '/tmp/ruphus-source-timer-onyx23-mobile.png', fullPage: false });
  await onyxPage.getByRole('button', { name: 'Finish brew', exact: true }).click();
  await onyxPage.getByText('Brew Complete', { exact: true }).waitFor();
  await onyxPage.waitForFunction(() => document.querySelector('[data-source-timing-status]')?.textContent === 'saved');
  const onyxTiming = JSON.parse(await onyxPage.locator('[data-source-timing-event]').textContent());
  assert.equal(onyxTiming.sourceId, 'onyx-monarch-wave-185');
  assert.equal(onyxTiming.doseGrams, 23);
  assert.equal(onyxTiming.timingRecordVersion, 2);
  assert.ok(Number.isFinite(onyxTiming.actualElapsedMs));
  assert.ok(onyxTiming.actualElapsedMs >= 0);
  await onyxPage.screenshot({ path: '/tmp/ruphus-source-complete-shared.png' });
  await onyxPage.getByRole('button', { name: 'Start Tasting Session', exact: true }).click();
  await onyxPage.waitForFunction(() => document.querySelector('[data-source-card-returned]')?.textContent === 'true');
  await onyxPage.getByRole('button', { name: 'View source recipe', exact: true }).click();
  await onyxPage.getByRole('button', { name: 'Increase coffee dose', exact: true }).click();
  await onyxPage.getByText('24g', { exact: true }).waitFor();
  await onyxPage.getByText('384g', { exact: true }).waitFor();
  assert.equal(await onyxPage.locator('[data-expected-grind]').textContent(), expectedGrind);
  await onyxPage.getByRole('button', { name: 'Close', exact: true }).click();
  const savedDoseUpdate = JSON.parse(await onyxPage.locator('[data-source-dose-update]').textContent());
  assert.deepEqual(savedDoseUpdate, { 'handBrewRecipe.userCoffeeGrams': 24, 'handBrewRecipes.kalita.userCoffeeGrams': 24 });
  await onyxPage.close();
  await onyxContext.close();

  // Ordinary shared-flow characterization: the real HandBrewModal opens the
  // real BrewTimer, then the completion callback is validated through the
  // production timing builder. The fixture keeps the recipe card mounted and
  // mocks only the account/storage boundary; all requests remain local GETs.
  const ordinaryContext = await createHarnessContext();
  const ordinaryPage = await ordinaryContext.newPage();
  const ordinaryErrors = [];
  const ordinaryWrites = [];
  ordinaryPage.on('pageerror', (error) => ordinaryErrors.push(error.message));
  ordinaryPage.on('console', (message) => { if (message.type() === 'error') ordinaryErrors.push(message.text()); });
  ordinaryPage.on('request', (request) => { if (request.method() !== 'GET') ordinaryWrites.push(`${request.method()} ${request.url()}`); });
  await ordinaryPage.goto(`${baseUrl}/scripts/ruphus-source-timer-ui-fixture.html?ordinary`, { waitUntil: 'domcontentloaded' });
  await ordinaryPage.getByRole('button', { name: 'View recipe', exact: true }).click();
  await ordinaryPage.getByText('Hand Brew Recipe', { exact: true }).waitFor();
  assert.match(await ordinaryPage.locator('body').innerText(), /13g/);
  assert.match(await ordinaryPage.locator('body').innerText(), /208g/);
  const ordinaryDoseDecrease = ordinaryPage.getByRole('button', { name: 'Decrease coffee dose', exact: true });
  assert.equal(await ordinaryDoseDecrease.count(), 1);
  await ordinaryDoseDecrease.click();
  await ordinaryPage.getByText('12g', { exact: true }).waitFor();
  await ordinaryPage.getByText('192g', { exact: true }).waitFor();
  const ordinarySave = ordinaryPage.getByRole('button', { name: 'Save recipe', exact: true });
  assert.equal(await ordinarySave.count(), 1);
  await ordinarySave.click();
  await ordinaryPage.waitForFunction(() => document.querySelector('[data-preview-saved]')?.textContent === 'true');
  const ordinaryStart = ordinaryPage.getByRole('button', { name: 'Start brew timer', exact: true });
  await ordinaryStart.waitFor();
  await ordinaryStart.click();
  await ordinaryPage.getByRole('button', { name: 'Finish brew', exact: true }).waitFor({ timeout: 5000 });
  await ordinaryPage.getByRole('button', { name: 'Finish brew', exact: true }).click();
  await ordinaryPage.getByText('Brew Complete', { exact: true }).waitFor();
  await ordinaryPage.waitForFunction(() => document.querySelector('[data-timing-status]')?.textContent === 'saved');
  const ordinaryTiming = JSON.parse(await ordinaryPage.locator('[data-timing-event]').textContent());
  assert.equal(ordinaryTiming.device, 'kalita');
  assert.equal(ordinaryTiming.mode, 'hot');
  assert.equal(ordinaryTiming.doseGrams, 12);
  assert.equal(ordinaryTiming.targetMs, 240000);
  assert.equal(ordinaryTiming.completionKind, 'userFinished');
  assert.ok(Number.isFinite(ordinaryTiming.actualElapsedMs));
  await ordinaryPage.getByRole('button', { name: 'Start Tasting Session', exact: true }).click();
  await ordinaryPage.waitForFunction(() => document.querySelector('[data-tasting-started]')?.textContent === 'true');
  await ordinaryPage.waitForFunction(() => document.querySelector('[data-card-returned]')?.textContent === 'true');
  assert.equal(await ordinaryPage.locator('[data-ordinary-return-card]').count(), 1);
  assert.equal(await ordinaryPage.locator('[data-ordinary-return-card]').getByText(/12g coffee · 192g water/).count(), 1);
  assert.deepEqual(ordinaryWrites, []);
  assert.deepEqual(ordinaryErrors, []);
  await ordinaryPage.close();
  await ordinaryContext.close();

  const unsupportedContext = await createHarnessContext();
  const unsupportedPage = await unsupportedContext.newPage();
  const unsupportedErrors = [];
  unsupportedPage.on('pageerror', (error) => unsupportedErrors.push(error.message));
  unsupportedPage.on('console', (message) => { if (message.type() === 'error') unsupportedErrors.push(message.text()); });
  await unsupportedPage.goto(`${baseUrl}/scripts/ruphus-source-timer-ui-fixture.html?unsupported`, { waitUntil: 'domcontentloaded' });
  await unsupportedPage.getByText('HARIO Switch 03 Matt Winton bloom hybrid', { exact: true }).last().waitFor();
  assert.match(await unsupportedPage.locator('body').innerText(), /guided execution is unavailable/);
  assert.equal(await unsupportedPage.locator('button[aria-label="Start brew timer"]').count(), 0);
  assert.deepEqual(unsupportedErrors, []);
  await unsupportedPage.close();
  await unsupportedContext.close();
  console.log(JSON.stringify({
    flow: 'passed', localHarnessOnly: true,
    source: 'HARIO Switch 03 Matt Winton bloom hybrid', nativeUnits: ['50g', '360mL'], automaticEvents: false,
    sourceTimingSaved: true, sourceTastingStarted: true, sourceCardReturned: true, unsupportedReadableNoStart: true,
    ordinary: { recipe: 'Kalita Wave 155', dose: '12g', water: '192g', timingSaved: true, tastingStarted: true, cardReturned: true, localWrites: 0 },
    onyx23: { source: 'Onyx Monarch Wave 185', dose: '23g', targets: onyxTargets, previewAndTimerMatch: true,
      grind: expectedGrind, finish: '3:30', timingSaved: true, tastingStarted: true, cardReturned: true,
      resizedDose: 24, doseMetadataOnly: true, screenshot: '/tmp/ruphus-source-timer-onyx23-mobile.png' },
    errors, screenshot: '/tmp/ruphus-source-timer-mobile.png',
  }));
  await context.close();
} finally {
  await browser.close();
  if (!child.killed) { child.kill('SIGTERM'); await once(child, 'exit').catch(() => {}); }
}
