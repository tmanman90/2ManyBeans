// TEMP scratch screenshot runner — Opus inner-loop only. Truth = iOS sim. Delete before commit.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = process.env.URL || 'http://localhost:5173';
const OUT = process.env.OUT || './_shots';
const TAG = process.env.TAG || 'base';
const ONLY = process.env.ONLY; // optional single tab
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE.ERR:', m.text().slice(0, 160)); });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(800);

try {
  await page.getByText('Explore without an account', { exact: false }).click({ timeout: 8000 });
} catch (e) { console.log('demo button not found:', e.message); }
await page.waitForTimeout(1600);

const tabs = ['Rotation', 'Inventory', 'Tasting', 'Chat', 'Archive'];
await page.screenshot({ path: `${OUT}/${TAG}-01-Rotation.png` });
for (let i = 1; i < tabs.length; i++) {
  if (ONLY && tabs[i] !== ONLY) continue;
  try {
    await page.getByRole('button', { name: tabs[i], exact: true }).click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${TAG}-0${i + 1}-${tabs[i]}.png` });
  } catch (e) { console.log(`tab ${tabs[i]} failed:`, e.message); }
}
console.log('done ->', OUT);
await browser.close();
