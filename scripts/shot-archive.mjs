// One-off: screenshot the redesigned Archive from the committed harness for human review.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5197;
const URL = `http://localhost:${PORT}/archive-harness.html`;
const OUT = process.argv[2] || '/tmp';

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

try {
  await waitForServer(URL);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);

  // 1) Archive screen (masthead + cups carousel + timeline)
  await page.screenshot({ path: `${OUT}/archive-1-screen.png` });

  // 2) Tap the featured 5★ cup → trading card front (let the morph settle)
  await page.getByText('Kotowa Estate', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/archive-2-card-front.png` });

  // 3) Flip to the stat sheet (back), scroll to the Your Tastings panel (rating + words)
  await page.getByText('VIEW STAT SHEET', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/archive-3-card-back.png` });
  // scroll the back panel to the tasting section
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].filter(d => d.scrollHeight > d.clientHeight + 40).sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (el) el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/archive-4-tastings.png` });

  await browser.close();
  console.log('shots written to', OUT);
} catch (e) {
  console.error('shot failed:', e.message);
  process.exitCode = 1;
} finally {
  cleanup();
}
