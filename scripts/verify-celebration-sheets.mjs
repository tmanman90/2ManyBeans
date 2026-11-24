// The celebration sheets close on the clip's clock (2.2 s after it starts
// playing, never more than 4 s after they open), and a reopened sheet never
// inherits the last one's timer: finishing a second bag must not close at once,
// and an X-closed celebration must not fire later. Mounts the real
// FinishBagPrompt and CelebrationSheet the way RotationTab does.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

const port = await freePort();
const url = `http://127.0.0.1:${port}/scripts/fixtures/celebration-harness.html`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'ignore',
  env: {
    ...process.env,
    VITE_FIREBASE_API_KEY: 'test-only-not-a-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'test.invalid',
    VITE_FIREBASE_PROJECT_ID: 'test-only',
    VITE_FIREBASE_APP_ID: 'test-only',
  },
});
process.on('exit', () => server.kill());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForServer() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { if ((await (await fetch(url)).text()).includes('celebration-harness.jsx')) return; } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('celebration harness did not start');
}

const logs = (page) => page.evaluate(() => window.__log.slice());
const closes = async (page) => (await logs(page)).filter((event) => event.type === 'close');

async function rateAndSave(page) {
  const quickSave = page.getByRole('button', { name: 'Quick Save' });
  await quickSave.waitFor({ timeout: 5000 });
  // The sheet's reset-on-open effect runs after its first frame (which can still
  // hold the last bag's rating). Two animation frames later it has run, as it
  // has for any real tap; then the prompt must be unrated.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Quick Save')?.disabled === true);
  await page.evaluate(() => {
    const stars = [...document.querySelectorAll('span')].filter((span) => span.style.cursor === 'pointer');
    stars[4].click();
  });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Quick Save')?.disabled === false);
  await quickSave.click();
  await page.getByText('Bag finished!').waitFor({ timeout: 5000 });
  return page.evaluate(() => Math.round(performance.now()));
}

async function waitForClose(page, count, timeout) {
  await page.waitForFunction((n) => window.__log.filter((e) => e.type === 'close').length >= n, count, { timeout });
  return (await closes(page))[count - 1];
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  // 1. Finish bag A, then bag B in the same tab (the reported bug).
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(url);
  await page.locator('#openA').click();
  const shownA = await rateAndSave(page);
  const closeA = await waitForClose(page, 1, 6000);
  assert.equal(closeA.msg, 'Saved & finished!');
  assert.ok(closeA.at - shownA <= 4300, `bag A celebration stayed ${closeA.at - shownA} ms (cap 4000)`);

  await sleep(300);
  await page.locator('#openB').click();
  await sleep(1000);
  const afterReopen = await closes(page);
  assert.equal(afterReopen.length, 1, `reopening for bag B closed the sheet at once: ${JSON.stringify(afterReopen.slice(1))}`);
  assert.ok(await page.getByText('Quick Save').isVisible(), 'bag B must show the rating prompt, not a stale celebration');

  const shownB = await rateAndSave(page);
  const closeB = await waitForClose(page, 2, 6000);
  assert.equal(closeB.bean, 'bean-b');
  assert.equal(closeB.msg, 'Saved & finished!');
  assert.ok(closeB.at - shownB >= 500, `bag B celebration closed after only ${closeB.at - shownB} ms`);
  const tastings = (await logs(page)).filter((event) => event.type === 'tasting').map((event) => event.bean);
  assert.deepEqual(tastings, ['bean-a', 'bean-b'], 'each bag saves exactly one tasting');

  // 2. A manual close during the celebration ends it: no later automatic close.
  await page.locator('#openA').click();
  await rateAndSave(page);
  await page.getByRole('button', { name: /close/i }).first().click();
  const manual = await waitForClose(page, 3, 2000);
  assert.equal(manual.msg, null, 'the X closes without the saved message');
  await sleep(4500);
  assert.equal((await closes(page)).length, 3, 'no second close after a manual close');
  await page.close();

  // 3. A clip that never loads cannot keep the sheet up: the 4 s cap closes it.
  const stuck = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await stuck.route('**/ruphus-fist-pump.mp4*', (route) => route.abort());
  await stuck.goto(url);
  await stuck.locator('#openA').click();
  const shownStuck = await rateAndSave(stuck);
  const capped = await waitForClose(stuck, 1, 7000);
  assert.equal(capped.msg, 'Saved & finished!');
  const cappedAfter = capped.at - shownStuck;
  assert.ok(cappedAfter >= 3500 && cappedAfter <= 4500, `with no clip the sheet closed after ${cappedAfter} ms, expected the 4000 ms cap`);
  await stuck.close();

  // 4. CelebrationSheet (bag finished from Rotation, first bean): same clock.
  const sheet = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await sheet.goto(url);
  const sheetEvents = async () => (await logs(sheet)).filter((event) => event.type.startsWith('sheet-'));
  const now = () => sheet.evaluate(() => Math.round(performance.now()));
  const openedA = await now();
  await sheet.locator('#celebrateA').click();
  await sheet.waitForFunction(() => window.__log.some((e) => e.type === 'sheet-done'), null, { timeout: 6000 });
  const doneA = (await sheetEvents())[0];
  assert.equal(doneA.bean, 'bean-a');
  assert.ok(doneA.at - openedA >= 1500 && doneA.at - openedA <= 4300, `sheet closed after ${doneA.at - openedA} ms`);

  // X during one celebration, then a new one right away: the first one's
  // timer must not close the second early or show a second toast.
  await sheet.locator('#celebrateB').click();
  await sheet.waitForFunction(() => !!document.querySelector('video') && !document.querySelector('video').paused, null, { timeout: 4000 });
  await sleep(300);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await sleep(100);
  const reopenedA = await now();
  await sheet.locator('#celebrateA').click();
  await sleep(4600);
  const events = (await sheetEvents()).slice(1);
  assert.deepEqual(events.map((event) => `${event.type}:${event.bean}`), ['sheet-close:bean-b', 'sheet-done:bean-a'], `got ${JSON.stringify(events)}`);
  const doneAgain = events[1].at - reopenedA;
  assert.ok(doneAgain >= 2000, `the reopened sheet closed after ${doneAgain} ms, the closed sheet's timer fired into it`);
  await sheet.close();

  const sheetStuck = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await sheetStuck.route('**/ruphus-fist-pump.mp4*', (route) => route.abort());
  await sheetStuck.goto(url);
  const openedStuck = await sheetStuck.evaluate(() => Math.round(performance.now()));
  await sheetStuck.locator('#celebrateA').click();
  await sheetStuck.waitForFunction(() => window.__log.some((e) => e.type === 'sheet-done'), null, { timeout: 7000 });
  const sheetCapped = (await logs(sheetStuck)).find((event) => event.type === 'sheet-done').at - openedStuck;
  assert.ok(sheetCapped >= 3500 && sheetCapped <= 4500, `with no clip the sheet closed after ${sheetCapped} ms, expected the 4000 ms cap`);
  await sheetStuck.close();

  console.log(`Celebration sheets passed: finish-bag A ${closeA.at - shownA} ms, B ${closeB.at - shownB} ms, no clip ${cappedAfter} ms; sheet ${doneA.at - openedA} ms, reopened ${doneAgain} ms, no clip ${sheetCapped} ms`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  process.exit(process.exitCode || 0);
}
