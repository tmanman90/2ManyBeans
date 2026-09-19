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
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === baseUrl && route.request().method() === 'GET' ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${baseUrl}/scripts/ruphus-source-timer-ui-fixture.html`, { waitUntil: 'domcontentloaded' });
  await page.getByText('HARIO Switch 03 Matt Winton bloom hybrid', { exact: true }).waitFor();
  assert.match(await page.locator('body').innerText(), /50g/);
  assert.match(await page.locator('body').innerText(), /360mL/);
  assert.match(await page.locator('body').innerText(), /Valve open/);
  const sourceGuideButton = page.locator('button[aria-label="Start source brew guide"]');
  await sourceGuideButton.waitFor({ state: 'attached' });
  await sourceGuideButton.scrollIntoViewIfNeeded();
  assert.equal(await sourceGuideButton.count(), 1);
  await sourceGuideButton.click();
  await page.getByRole('heading', { name: 'HARIO Switch 03 Matt Winton bloom hybrid' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Start first pour' }).count(), 1);
  await page.getByRole('button', { name: 'Start first pour' }).click();
  await page.getByRole('button', { name: 'Pour finished' }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-source-events]')?.textContent.includes('first-water'));
  assert.match(await page.locator('[data-source-events]').innerText(), /first-water/);
  assert.match(await page.locator('[data-source-events]').innerText(), /bloom:start/);
  await page.getByRole('button', { name: 'Pour finished' }).click();
  await page.getByText('At 0:30 from the first water', { exact: true }).waitFor();
  assert.match(await page.locator('body').innerText(), /source checkpoint/);
  await page.waitForTimeout(80);
  const events = await page.locator('[data-source-events]').innerText();
  assert.match(events, /bloom:complete/);
  assert.doesNotMatch(events, /close:start/);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: '/tmp/ruphus-source-timer-mobile.png', fullPage: false });

  const onyxPage = await context.newPage();
  const onyxErrors = [];
  onyxPage.on('pageerror', (error) => onyxErrors.push(error.message));
  onyxPage.on('console', (message) => { if (message.type() === 'error') onyxErrors.push(message.text()); });
  await onyxPage.goto(`${baseUrl}/scripts/ruphus-source-timer-ui-fixture.html?onyx23`, { waitUntil: 'domcontentloaded' });
  await onyxPage.getByText('Onyx Monarch Wave 185', { exact: true }).waitFor();
  const onyxPreview = await onyxPage.locator('body').innerText();
  assert.match(onyxPreview, /23g/);
  assert.match(onyxPreview, /368g/);
  assert.match(onyxPreview, /Ode Gen 2:\s*4\.6/);
  assert.match(onyxPreview, /Approximate starting point from the source micron note/);
  assert.match(onyxPreview, /3:30/);
  assert.doesNotMatch(onyxPreview, /147\.2g/);
  const onyxTargets = ['46g', '147g', '202g', '258g', '313g', '368g'];
  onyxTargets.forEach((target) => assert.match(onyxPreview, new RegExp(`\\b${target}\\b`)));
  const onyxSourceGuideButton = onyxPage.locator('button[aria-label="Start source brew guide"]');
  await onyxSourceGuideButton.waitFor({ state: 'attached' });
  await onyxSourceGuideButton.scrollIntoViewIfNeeded();
  assert.equal(await onyxSourceGuideButton.count(), 1);
  await onyxSourceGuideButton.click();
  await onyxPage.getByRole('heading', { name: 'Onyx Monarch Wave 185' }).waitFor();
  const onyxTimer = await onyxPage.locator('body').innerText();
  onyxTargets.forEach((target) => assert.match(onyxTimer, new RegExp(`\\b${target}\\b`)));
  assert.match(onyxTimer, /3:30/);
  assert.doesNotMatch(onyxTimer, /147\.2g/);
  assert.deepEqual(onyxErrors, []);
  await onyxPage.screenshot({ path: '/tmp/ruphus-source-timer-onyx23-mobile.png', fullPage: false });
  await onyxPage.close();

  const unsupportedPage = await context.newPage();
  const unsupportedErrors = [];
  unsupportedPage.on('pageerror', (error) => unsupportedErrors.push(error.message));
  unsupportedPage.on('console', (message) => { if (message.type() === 'error') unsupportedErrors.push(message.text()); });
  await unsupportedPage.goto(`${baseUrl}/scripts/ruphus-source-timer-ui-fixture.html?unsupported`, { waitUntil: 'domcontentloaded' });
  await unsupportedPage.getByText('HARIO Switch 03 Matt Winton bloom hybrid', { exact: true }).waitFor();
  assert.match(await unsupportedPage.locator('body').innerText(), /guided execution is unavailable/);
  assert.equal(await unsupportedPage.locator('button[aria-label="Start source brew guide"]').count(), 0);
  assert.deepEqual(unsupportedErrors, []);
  await unsupportedPage.close();
  console.log(JSON.stringify({ flow: 'passed', source: 'HARIO Switch 03 Matt Winton bloom hybrid', nativeUnits: ['50g', '360mL'], automaticEvents: false, unsupportedReadableNoStart: true, onyx23: { source: 'Onyx Monarch Wave 185', dose: '23g', targets: onyxTargets, previewAndTimerMatch: true, grind: 'Ode Gen 2: 4.6 (approximate)', finish: '3:30', screenshot: '/tmp/ruphus-source-timer-onyx23-mobile.png' }, errors, screenshot: '/tmp/ruphus-source-timer-mobile.png' }));
  await context.close();
} finally {
  await browser.close();
  if (!child.killed) { child.kill('SIGTERM'); await once(child, 'exit').catch(() => {}); }
}
