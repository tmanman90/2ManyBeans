import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';

let server = null;
let baseUrl = process.env.RUPHUS_UI_BASE_URL;
const errors = [];
const requests = [];

async function startLocalServer() {
  // The DevRouter harness mounts before auth and data providers. Give Vite a
  // complete, non-secret Firebase-shaped config so module initialization does
  // not reject undefined credentials; the intentionally invalid project is
  // never contacted because the harness has no auth or data calls.
  const harnessFirebaseEnv = {
    VITE_FIREBASE_API_KEY: 'ruphus-harness-not-a-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'ruphus-harness.invalid',
    VITE_FIREBASE_PROJECT_ID: 'ruphus-harness',
    VITE_FIREBASE_STORAGE_BUCKET: 'ruphus-harness.invalid',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
    VITE_FIREBASE_APP_ID: '1:000000000000:web:ruphus-harness',
  };
  server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '0'], {
    env: { ...process.env, ...harnessFirebaseEnv, TMB_APP_VARIANT: 'dev' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const onData = chunk => { output += chunk.toString(); };
  server.stdout.on('data', onData);
  server.stderr.on('data', onData);
  await new Promise((resolve, reject) => {
    const onReady = () => {
      const match = output.match(/Local:\s+http:\/\/(127\.0\.0\.1:\d+)\//);
      if (match) { cleanup(); baseUrl = `http://${match[1]}/`; resolve(); }
    };
    const onExit = (_, signal) => { cleanup(); reject(new Error(`local Vite server exited (${signal || 'unknown'}): ${output}`)); };
    const cleanup = () => { server.stdout.off('data', onData); server.stderr.off('data', onData); server.stdout.off('data', onReady); server.stderr.off('data', onReady); server.off('exit', onExit); };
    server.stdout.on('data', onReady); server.stderr.on('data', onReady); server.once('exit', onExit);
    onReady();
  });
}

const browser = await chromium.launch({ headless: true, ...(process.env.RUPHUS_UI_BROWSER_PATH ? { executablePath: process.env.RUPHUS_UI_BROWSER_PATH } : {}) });
try {
  if (!baseUrl) await startLocalServer();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() !== 'GET') requests.push(`${request.method()} ${request.url()}`); });

  await page.goto(`${baseUrl}?ruphus-harness=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-ruphus-harness="true"]');
assert.match(await page.title(), /2manybeans|Coffee Hub|Vite/i);
assert.match(await page.locator('body').innerText(), /Ruphus browser harness/);
assert.equal(await page.locator('[data-ruphus-entry]').count(), 3);
assert.equal(await page.locator('[data-agent-enabled="true"]').count(), 1);
await page.locator('[data-ruphus-entry="bean-detail"]').click();
assert.match(await page.locator('[data-ruphus-opening]').innerText(), /House Blend/);
const capturedActivity = await page.locator('[data-ruphus-boundary-state]').getAttribute('data-ruphus-last-activity');
await page.locator('[data-ruphus-entry="direct"]').click();
assert.equal(await page.locator('[data-ruphus-boundary-state]').getAttribute('data-ruphus-last-activity'), capturedActivity);
assert.equal(await page.locator('[data-ruphus-hydration-toggle]').count(), 1);
await page.locator('[data-ruphus-make-stale]').click();
await page.waitForSelector('[data-ruphus-continue="true"]', { state: 'visible' });
assert.match(await page.locator('[data-ruphus-continue="true"]').innerText(), /Earlier conversation|Continue/);
await page.locator('[data-ruphus-continue="true"] button').click();
assert.equal(await page.locator('[data-ruphus-continue="true"]').count(), 0);
await page.locator('[data-ruphus-new-chat]').click();
assert.equal(await page.locator('[data-ruphus-stored-messages]').getAttribute('data-ruphus-stored-messages'), '1');
assert.equal(await page.locator('[data-ruphus-boundary-state]').getAttribute('data-ruphus-boundary-index'), '1');
await page.locator('[data-ruphus-stream]').click();
await page.waitForSelector('[data-ruphus-lifecycle-caption]', { state: 'visible' });
await page.waitForSelector('[data-ruphus-message="agent-v3"]', { state: 'visible' });
await page.waitForSelector('[data-artifact="recipe_proposal"]', { state: 'visible' });
assert.equal(await page.locator('[data-proposal-actions="true"] button').count(), 3);
const proposal = page.locator('[data-artifact="recipe_proposal"]');
assert.match(await proposal.innerText(), /El Vergel · Kalita 155/);
assert.match(await proposal.locator('[data-recipe-change="water"]').innerText(), /215 g → 205 g/);
assert.match(await proposal.innerText(), /saved recipe is unchanged/);
await proposal.locator('summary').click();
assert.match(await proposal.locator('ol').innerText(), /Finish at 205g total/);
await proposal.locator('summary').click();
await proposal.screenshot({ path: '/tmp/ruphus-proposal-mobile.png' });
await page.getByRole('button', { name: 'Update saved recipe', exact: true }).click();
assert.equal(await page.locator('[data-ruphus-harness]').getAttribute('data-write-count'), '1');
assert.equal(await page.locator('[data-ruphus-harness]').getAttribute('data-last-action'), 'apply_proposal');
const receipt = page.locator('[data-artifact="action_receipt"]');
assert.match(await receipt.innerText(), /Recipe updated/);
assert.match(await receipt.innerText(), /ready for your next brew/);
await receipt.screenshot({ path: '/tmp/ruphus-receipt-mobile.png' });
await page.getByRole('button', { name: 'Try for one brew', exact: true }).click();
assert.match(await receipt.innerText(), /saved recipe is unchanged/);
await page.locator('[data-proposal-pending-toggle]').click();
assert.equal(await receipt.locator('button:disabled').count(), 1);
await page.locator('[data-proposal-pending-toggle]').click();
await page.getByRole('button', { name: 'Make this my recipe', exact: true }).click();
assert.match(await receipt.innerText(), /This trial is now your saved recipe/);
assert.equal(await receipt.getByRole('button', { name: 'Make this my recipe', exact: true }).count(), 0);
await receipt.screenshot({ path: '/tmp/ruphus-trial-saved-mobile.png' });
await page.locator('[data-proposal-pending-toggle]').click();
assert.equal(await proposal.locator('button:disabled').count(), 3);
assert.match(await proposal.innerText(), /Working on your choice/);
await page.locator('[data-proposal-pending-toggle]').click();
await page.locator('[data-proposal-stale-toggle]').click();
assert.equal(await proposal.locator('button').count(), 0);
assert.match(await proposal.innerText(), /out of date/);
await page.locator('[data-proposal-stale-toggle]').click();
await page.locator('[data-keyboard-input]').focus();
assert.equal(await page.locator('[data-keyboard-visible="true"]').count(), 1);
  await page.screenshot({ path: '/tmp/ruphus-agent-v3-mobile.png', fullPage: false });
  await page.setViewportSize({ width: 1280, height: 900 });
  await proposal.screenshot({ path: '/tmp/ruphus-proposal-desktop.png' });

  const legacy = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await legacy.goto(`${baseUrl}?ruphus-harness=1&legacy=1`, { waitUntil: 'domcontentloaded' });
  await legacy.waitForSelector('[data-ruphus-harness="true"]');
assert.equal(await legacy.locator('[data-agent-enabled="false"]').count(), 1);
assert.equal(await legacy.locator('[data-legacy-route="true"]').count(), 1);
await legacy.screenshot({ path: '/tmp/ruphus-agent-v3-legacy.png', fullPage: false });
assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  console.log('Ruphus rendered browser harness passed: launch entries, context-free opening, hydration toggle, injected proposal actions, Agent frames/artifact, legacy route, keyboard padding, no network writes, mobile+desktop.');
} finally {
  await browser.close();
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await once(server, 'exit').catch(() => {});
  }
}
