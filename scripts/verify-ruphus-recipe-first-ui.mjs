import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';

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
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`); });
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
    await page.evaluate(() => {
      const body = [...document.querySelectorAll('div')]
        .filter((element) => (
          element.scrollHeight > element.clientHeight
          && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)
        ))
        .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];
      if (!body) throw new Error('Could not locate the scrollable recipe body');
      body.scrollTop = body.scrollHeight;
    });
    await page.screenshot({ path: screenshots.mobile, fullPage: false });
    await page.getByRole('button', { name: 'Start brew timer', exact: true }).click();
    assert.equal(await page.locator('[data-start-count]').innerText(), '1');
    assert.equal(await page.locator('[data-save-count]').innerText(), '0');
    assert.deepEqual(writes, []);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: screenshots.desktop, fullPage: false });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ flow: 'passed', ratio: '1:16 → 1:15', dose: '13g → 20g', water: '300g', startCount: 1, saveCount: 0, writes: 0, reducedMotion: true, screenshots }));
    await context.close();
  } finally { await browser.close(); }
} finally {
  if (child && !child.killed) { child.kill('SIGTERM'); await once(child, 'exit').catch(() => {}); }
}
