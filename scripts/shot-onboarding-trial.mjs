// Evidence for the trial-copy fix: R12 timeline + R13 recap must render the
// REAL App Store Connect intro-offer length (3 days), follow a different offer
// if ASC ever changes, and promise nothing when no offer exists.
// Usage: node scripts/shot-onboarding-trial.mjs [outDir]
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5198;
const URL = `http://localhost:${PORT}/onboarding-harness.html`;
const OUT = process.argv[2] || 'sim/paywall';

const offering = (introPrice) => ({
  identifier: 'default',
  availablePackages: [
    { identifier: '$rc_monthly', product: { identifier: 'com.talmeltzer.coffeehub.pro.monthly', price: 4.99, priceString: '$4.99', introPrice } },
    { identifier: '$rc_annual', product: { identifier: 'com.talmeltzer.coffeehub.pro.annual', price: 49.99, priceString: '$49.99', introPrice } },
  ],
});
const freeFor = (n, unit) => ({ price: 0, priceString: '$0.00', periodNumberOfUnits: n, periodUnit: unit });

const CASES = [
  { name: 'asc-3day', intro: freeFor(3, 'DAY') },   // what App Store Connect actually has
  { name: 'asc-7day', intro: freeFor(7, 'DAY') },   // proves the copy follows ASC, not a constant
  { name: 'no-offer', intro: null },                // proves we promise no trial when none exists
];

function waitFor(url, t = 30000) {
  const s = Date.now();
  return new Promise((res, rej) => {
    const tick = async () => {
      try { const r = await fetch(url); if (r.ok) return res(); } catch {}
      if (Date.now() - s > t) return rej(new Error('vite did not start'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  await waitFor(URL);
  const b = await chromium.launch();
  for (const c of CASES) {
    for (const step of ['r12', 'r13']) {
      const page = await b.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
      await page.addInitScript(({ off, hasOffer }) => {
        window.__rcOfferingsCache = hasOffer
          ? { offerings: off, fetchedAt: Date.now() }
          : { offerings: off, fetchedAt: Date.now() };
        window.__ONBOARDING_TEST__ = { ...(window.__ONBOARDING_TEST__ || {}), paywall: { status: 'ready' } };
      }, { off: offering(c.intro), hasOffer: !!c.intro });
      await page.goto(`${URL}?step=${step}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1400);
      await page.screenshot({ path: `${OUT}/trial-${c.name}-${step}.png` });
      const text = await page.innerText('body');
      console.log(`[${c.name} ${step}]`, text.replace(/\s+/g, ' ').slice(0, 260));
      await page.close();
    }
  }
  await b.close();
  console.log('shots written to', OUT);
} catch (e) {
  console.error('shot failed:', e.message);
  process.exitCode = 1;
} finally {
  try { vite.kill('SIGKILL'); } catch {}
}
