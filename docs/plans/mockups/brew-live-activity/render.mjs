// Renders mockups.html into one PNG per board (2x), next to this file.
// Run from the repo root: node docs/plans/mockups/brew-live-activity/render.mjs
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const boards = [
  ['compact', '01-compact.png'],
  ['minimal', '02-minimal.png'],
  ['expanded', '03-expanded.png'],
  ['lock', '04-lock-screen.png'],
  ['done', '05-done.png'],
  ['states', '06-paused-your-turn-iced.png'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1000, height: 1200 } });
await page.goto(pathToFileURL(path.join(dir, 'mockups.html')).href);
for (const [id, file] of boards) {
  await page.locator(`#${id}`).screenshot({ path: path.join(dir, file) });
  console.log('wrote', file);
}
await browser.close();
