// chat-100x Phase B design-evidence capture: mid-stream bubble + recipe card.
import { spawn } from 'node:child_process';
import { webkit } from 'playwright';

const VITE_PORT = 5199;
const MOCK_PORT = 5197;
const URL_ = `http://localhost:${VITE_PORT}/chat-harness.html?stream=1&recipe=1`;

const vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], { stdio: 'ignore' });
const mock = spawn('node', ['scripts/stream-mock-server.mjs', String(MOCK_PORT)], { stdio: 'ignore' });
const kill = () => { try { vite.kill('SIGTERM'); mock.kill('SIGTERM'); } catch {} };
process.on('exit', kill);

await new Promise(r => setTimeout(r, 3500));
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 402, height: 900 }, deviceScaleFactor: 2 });
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// tap the evergreen starter to kick off a streamed turn
await page.getByText('What should I brew today?').first().click();
await page.waitForTimeout(600); // mid-stream (mock emits ~120ms/delta)
await page.screenshot({ path: 'sim/chat/phaseB-mid-stream.png' });
console.log('saved sim/chat/phaseB-mid-stream.png');

await page.waitForTimeout(2500); // completion + card render
await page.screenshot({ path: 'sim/chat/phaseB-recipe-card.png' });
console.log('saved sim/chat/phaseB-recipe-card.png');

await browser.close();
kill();
process.exit(0);
