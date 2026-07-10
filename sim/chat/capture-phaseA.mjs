// chat-100x Phase A design-evidence capture: renders the chat harness in
// WebKit at device size and screenshots the intro/starters surface.
import { spawn } from 'node:child_process';
import { webkit } from 'playwright';

const PORT = 5199;
const URL = `http://localhost:${PORT}/chat-harness.html`;
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const kill = () => { try { vite.kill('SIGTERM'); } catch {} };
process.on('exit', kill);

await new Promise(r => setTimeout(r, 3500));
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'sim/chat/phaseA-intro-starters.png' });
console.log('saved sim/chat/phaseA-intro-starters.png');
await browser.close();
kill();
process.exit(0);
