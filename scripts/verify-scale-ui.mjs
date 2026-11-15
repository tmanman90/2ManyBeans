// The scale brew flow end to end in a browser, against the fake scale:
// pair, tare, auto-start on the bloom pour, live target with "Stop pouring",
// finish, saved summary; then a reopen auto-connects the remembered scale.
// Set SCALE_SHOTS=<dir> to also save a screenshot of each screen.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 4177;
const shots = process.env.SCALE_SHOTS || null;
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'ignore',
  // Placeholders: src/firebase.js initializes at import and a fresh clone has
  // no env file. The harness never talks to Firebase.
  env: {
    ...process.env,
    VITE_FAKE_SCALE: '1',
    VITE_FIREBASE_API_KEY: 'test-only-not-a-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'test.invalid',
    VITE_FIREBASE_PROJECT_ID: 'test-only',
    VITE_FIREBASE_APP_ID: 'test-only',
  },
});
const url = `http://127.0.0.1:${port}/scripts/fixtures/scale-harness.html`;

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Scale UI harness did not start');
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: shots ? 2 : 1 });
  const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
  await page.goto(url);

  // No remembered scale: today's countdown starts, and the pill opens pairing.
  await page.getByRole('button', { name: 'Connect a scale' }).click();
  await page.getByRole('dialog', { name: 'Connect your scale' }).waitFor();
  await page.getByText('Acaia Lunar').waitFor();
  await shot('01-pair');
  await page.getByRole('button', { name: 'Connect', exact: true }).first().click();

  await page.getByText('Tare to start').waitFor();
  await page.getByText('412.', { exact: false }).waitFor();
  await shot('02-tare');
  await page.getByRole('button', { name: 'Tare', exact: true }).click();

  await page.getByText('Timer starts when you pour').waitFor();
  await shot('03-listening');

  // The fake pours 2.5 s after tare; the clock starts by itself.
  await page.getByText('Timer started on your first pour').waitFor({ timeout: 8000 });
  await page.getByText('Bloom pour').waitFor();
  await page.waitForTimeout(3000);
  await shot('04-pouring');
  await page.getByText('Stop pouring').waitFor({ timeout: 15000 });
  await page.getByText(/Next pour at 0:40/).waitFor();
  await shot('05-target');

  await page.getByRole('button', { name: 'Finish brew' }).click();
  await page.getByText('Brew saved').waitFor();
  await shot('06-summary');
  const saved = await page.evaluate(() => window.__saved);
  assert.equal(saved.length, 1);
  const summary = saved[0].scaleSummary;
  assert.equal(summary.protocol, 'fake');
  assert.equal(summary.model, 'Pearl S');
  assert.equal(summary.perStep.length, 3);
  assert.ok(Math.abs(summary.perStep[0].actualG - 60) <= 2, `bloom poured ${summary.perStep[0].actualG}`);
  assert.ok(Number.isFinite(summary.perStep[0].reachedAtSec));
  assert.ok(summary.curve.length >= 10 && summary.curve.every(Number.isFinite));
  assert.ok(await page.getByText('vs last brew').isVisible(), 'dotted reference to the earlier brew');

  // Reopen: the remembered scale connects without a countdown.
  await page.getByRole('button', { name: 'Done' }).click();
  await page.locator('#reopen').click();
  await page.getByText('Tare to start').waitFor({ timeout: 5000 });
  assert.equal(await page.getByText('BREWING').count(), 0);
  // Opting out falls back to the ordinary timer.
  await page.getByRole('button', { name: 'Start without the scale' }).click();
  await page.getByText('Brewing', { exact: false }).first().waitFor({ timeout: 6000 });
  console.log('Scale UI flow passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  process.exit(process.exitCode || 0);
}
