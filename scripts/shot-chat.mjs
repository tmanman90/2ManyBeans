import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const PORT = 5193;
const URL = `http://localhost:${PORT}/chat-harness.html`;
const OUT = process.argv[2] || '/tmp';
function waitFor(url, t = 20000) { const s = Date.now(); return new Promise((res, rej) => { const tick = async () => { try { const r = await fetch(url); if (r.ok) return res(); } catch {} if (Date.now() - s > t) return rej(new Error('no vite')); setTimeout(tick, 250); }; tick(); }); }
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  await waitFor(URL);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 402, height: 880 }, deviceScaleFactor: 2 });
  await p.route('**/api/**', async route => { await new Promise(r => setTimeout(r, 4000)); route.abort(); });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${OUT}/chat-1-intro.png` });
  await p.getByText('What should I brew today?', { exact: false }).first().click().catch(() => {});
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/chat-2-thinking.png` });
  await b.close();
  console.log('shots written to', OUT);
} catch (e) { console.error('shot failed:', e.message); process.exitCode = 1; } finally { try { vite.kill('SIGKILL'); } catch {} }
