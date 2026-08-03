import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 4176;
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'ignore',
});

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/scripts/fixtures/kalita-iced-harness.html`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Kalita iced UI harness did not start');
}

function assertWithinViewport(box, viewport, label) {
  assert.ok(box, `${label} must be visible`);
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${label} must fit in ${viewport.width}x${viewport.height}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  for (const config of [{ size: '155', dose: 15 }, { size: '185', dose: 20 }]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/scripts/fixtures/kalita-iced-harness.html?size=${config.size}&dose=${config.dose}`);
    await page.evaluate(() => document.documentElement.style.setProperty('-webkit-text-size-adjust', '200%'));
    const icedEntry = page.getByText(config.size === '155' ? 'Iced pour over this coffee' : 'Flash brew this coffee', { exact: true });
    await icedEntry.click();
    await page.getByText(`Wave ${config.size} · Iced`, { exact: true }).waitFor();
    if (config.size === '155') {
      await page.getByText(/glass after brewing/i).waitFor();
      assert.equal(await page.getByText(/server before brewing/i).count(), 0);
    } else {
      await page.getByText(/server before brewing/i).first().waitFor();
      await page.getByText(/complete melt is not assumed/i).waitFor();
    }
    await page.getByRole('button', { name: 'Start iced brew timer' }).click();
    await page.getByText('BREWING', { exact: true }).waitFor({ timeout: 12000 });
    const viewport = page.viewportSize();
    for (;;) {
      const action = page.locator('[role="status"][aria-atomic="true"]');
      assert.ok((await action.textContent())?.trim(), 'each timer step needs explicit action copy');
      assertWithinViewport(await action.boundingBox(), viewport, `Wave ${config.size} active instruction`);
      const next = page.getByRole('button', { name: 'Next step' });
      if (await next.isDisabled()) break;
      await next.click();
    }
    await page.getByRole('button', { name: 'Finish brew' }).click();
    await page.getByRole('heading', { name: 'Your drawdown is saved' }).waitFor();
    await page.getByText(/Chilling is untimed and does not change drawdown memory/).waitFor();
    await page.getByRole('button', { name: 'Coffee chilled' }).click();
    await page.getByText('Brew Complete', { exact: true }).waitFor();
    await context.close();
  }
  console.log('Kalita iced rendered timer flow passed at 320x568 with 200% text scaling');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
