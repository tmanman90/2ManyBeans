// Screenshots every paywall state from the real PaywallSheet component.
// Usage: node scripts/shot-paywall.mjs [outDir]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5197;
const BASE = `http://localhost:${PORT}/paywall-harness.html`;
const OUT = process.argv[2] || 'sim/paywall';

const SHOTS = [
  { name: '01-generic-3day', q: 'ctx=generic&trial=3day' },
  { name: '02-scan-cap', q: 'ctx=scan_cap&trial=3day' },
  { name: '03-taste-cap', q: 'ctx=taste_cap&trial=3day' },
  { name: '04-product-shot', q: 'ctx=product_shot&trial=3day' },
  { name: '05-aiden-ultra-preselected', q: 'ctx=aiden&promote=ultra&trial=3day' },
  { name: '06-onboarding', q: 'ctx=onboarding&trial=3day' },
  { name: '07-generic-7day', q: 'ctx=generic&trial=7day' },
  { name: '08-generic-no-trial', q: 'ctx=generic&trial=none' },
  { name: '09-loading', q: 'ctx=generic&slow=1', wait: 400 },
  { name: '10-offerings-empty', q: 'ctx=generic&offerings=empty' },
  { name: '11-ultra-monthly-selected', q: 'ctx=generic&trial=3day', click: 'Ultra' },
];

function waitFor(url, t = 30000) {
  const s = Date.now();
  return new Promise((res, rej) => {
    const tick = async () => {
      try { const r = await fetch(url); if (r.ok) return res(); } catch {}
      if (Date.now() - s > t) return rej(new Error('vite never came up'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

const vite = spawn('npx', ['vite', '--config', 'vite.paywall-harness.config.mjs', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  await waitFor(BASE);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => console.error('[page error]', e.message));
  for (const s of SHOTS) {
    await p.goto(`${BASE}?${s.q}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(s.wait ?? 900);
    if (s.click) {
      await p.getByText(s.click, { exact: true }).first().click().catch(() => {});
      await p.waitForTimeout(200);
      await p.getByText('/mo', { exact: false }).last().click().catch(() => {});
      await p.waitForTimeout(500);
    }
    await p.screenshot({ path: `${OUT}/${s.name}.png` });
    console.log('shot', s.name);
  }
  await b.close();
  console.log('shots written to', OUT);
} catch (e) {
  console.error('shot failed:', e.message);
  process.exitCode = 1;
} finally {
  try { vite.kill('SIGKILL'); } catch {}
}
