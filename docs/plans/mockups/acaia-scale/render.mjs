// Renders mockups.html to PNGs next to it: one per phone screen plus the full board.
// Usage (from the repo root): node docs/plans/mockups/acaia-scale/render.mjs
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const names = {
  s1: '01-pair-scale',
  s2: '02-tare',
  s3: '03-listening-for-bloom',
  s4: '04-bloom-pour-live',
  s5: '05-target-reached',
  s6: '06-brew-summary',
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 2200 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(join(here, 'mockups.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
for (const [id, name] of Object.entries(names)) {
  await page.locator(`#${id}`).screenshot({ path: join(here, `${name}.png`) });
}
await page.locator('#board').screenshot({ path: join(here, '00-overview.png') });
await browser.close();
console.log('rendered', Object.keys(names).length + 1, 'PNGs');
