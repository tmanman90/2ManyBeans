import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';

const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
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
  console.log(JSON.stringify({ flow: 'passed', source: 'HARIO Switch 03 Matt Winton bloom hybrid', nativeUnits: ['50g', '360mL'], automaticEvents: false, unsupportedReadableNoStart: true, errors, screenshot: '/tmp/ruphus-source-timer-mobile.png' }));
  await context.close();
} finally {
  await browser.close();
  if (!child.killed) { child.kill('SIGTERM'); await once(child, 'exit').catch(() => {}); }
}
