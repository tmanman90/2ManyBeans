// Screenshots every paywall state from the real paywall components — the
// classic PaywallSheet AND the new PaywallRoast — driven through
// paywall-harness.jsx (?ui=classic|roast).
// Usage: node scripts/shot-paywall.mjs [classicOutDir] [roastOutDir]
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5197;
const BASE = `http://localhost:${PORT}/paywall-harness.html`;
const OUT_CLASSIC = process.argv[2] || 'sim/paywall';
const OUT_ROAST = process.argv[3] || 'sim/paywall-roast';

// ---------------------------------------------------------------------------
// Classic (PaywallSheet) shots — unchanged, 11 scenarios.
// ---------------------------------------------------------------------------
const SHOTS = [
  { name: '01-generic-3day', q: 'ui=classic&ctx=generic&trial=3day' },
  { name: '02-scan-cap', q: 'ui=classic&ctx=scan_cap&trial=3day' },
  { name: '03-taste-cap', q: 'ui=classic&ctx=taste_cap&trial=3day' },
  { name: '04-product-shot', q: 'ui=classic&ctx=product_shot&trial=3day' },
  { name: '05-aiden-ultra-preselected', q: 'ui=classic&ctx=aiden&promote=ultra&trial=3day' },
  { name: '06-onboarding', q: 'ui=classic&ctx=onboarding&trial=3day' },
  { name: '07-generic-7day', q: 'ui=classic&ctx=generic&trial=7day' },
  { name: '08-generic-no-trial', q: 'ui=classic&ctx=generic&trial=none' },
  { name: '09-loading', q: 'ui=classic&ctx=generic&slow=1', wait: 400 },
  { name: '10-offerings-empty', q: 'ui=classic&ctx=generic&offerings=empty' },
  { name: '11-ultra-monthly-selected', q: 'ui=classic&ctx=generic&trial=3day', click: 'Ultra' },
];

// ---------------------------------------------------------------------------
// Roast (PaywallRoast) shots — step 1 for all 7 triggers, step 2 default +
// promote=ultra, step 3, plus loading / offerings-error / web-not-native /
// purchasing states. `step=` lands directly on a step via PaywallRoast's
// `initialStep` harness prop — clicking through to step 3 in Playwright is
// flaky, the prop is deterministic.
// ---------------------------------------------------------------------------
const ROAST_SHOTS = [
  // Step 1 — one shot per trigger (the 7 PAYWALL_COPY keys in paywallCopy.js).
  { name: 'r01-step1-scan_cap', q: 'ui=roast&step=value&ctx=scan_cap&trial=3day' },
  { name: 'r02-step1-taste_cap', q: 'ui=roast&step=value&ctx=taste_cap&trial=3day' },
  { name: 'r03-step1-product_shot', q: 'ui=roast&step=value&ctx=product_shot&trial=3day' },
  { name: 'r04-step1-aiden', q: 'ui=roast&step=value&ctx=aiden&trial=3day' },
  { name: 'r05-step1-chat', q: 'ui=roast&step=value&ctx=chat&trial=3day' },
  { name: 'r06-step1-recipe', q: 'ui=roast&step=value&ctx=recipe&trial=3day' },
  { name: 'r07-step1-generic', q: 'ui=roast&step=value&ctx=generic&trial=3day' },

  // Step 2 — plans, default (Pro preselected) and promote=ultra (Ultra
  // preselected on open, per PaywallRoast's context.promote handling).
  { name: 'r08-step2-default', q: 'ui=roast&step=plans&ctx=generic&trial=3day' },
  { name: 'r09-step2-promote-ultra', q: 'ui=roast&step=plans&ctx=aiden&promote=ultra&trial=3day' },

  // Step 3 — compare matrix.
  { name: 'r10-step3-compare', q: 'ui=roast&step=compare&ctx=generic&trial=3day' },

  // Loading (offerings still in flight — held open via ?slow=1).
  { name: 'r11-step2-loading', q: 'ui=roast&step=plans&ctx=generic&slow=1', wait: 400 },

  // Offerings error (RC dashboard misconfig / zero packages).
  { name: 'r12-step2-offerings-error', q: 'ui=roast&step=plans&ctx=generic&offerings=empty' },

  // Web-not-native ("subscriptions are in the iOS app" message on step 2).
  { name: 'r13-step2-web-not-native', q: 'ui=roast&step=plans&ctx=generic&trial=3day&native=0' },

  // Purchasing (spinner + disabled CTA) — held open via ?purchase=slow. Pro
  // Annual is preselected on open, so a single CTA tap is enough to enter
  // (and, thanks to the slow mock, stay in) the purchasing state.
  { name: 'r14-step2-purchasing', q: 'ui=roast&step=plans&ctx=generic&trial=3day&purchase=slow', clickButton: 'Start my' },

  // MANDATORY: step 1 under reducedMotion — see the dedicated pass below.
  // Not listed here because it needs its own browser context, not just a
  // different URL (see REDUCED_MOTION_SHOT).
];

// Every entrance animation in this paywall is written visible-by-default,
// with the keyframe gated behind `prefers-reduced-motion: no-preference`
// (see src/styles/paywall.css's ".pw-in { opacity: 1; }" base rule and the
// `@media (prefers-reduced-motion: no-preference)` block that layers the
// opacity:0 -> 1 keyframe on top of it). Playwright and the iOS simulator
// BOTH default to `no-preference`, so every shot above always exercises the
// animated path and can never catch a regression where the base
// (no-animation) state is invisible — e.g. someone moves `opacity: 0` out of
// the media-query guard and onto the bare class. That exact class of bug has
// shipped twice in this app (see paywall.css's "Motion" section comment and
// lessons.md). This shot, taken in a `reducedMotion: 'reduce'` context, is
// the only automated proof that step 1 content is visible with the keyframes
// never running at all.
const REDUCED_MOTION_SHOT = { name: 'r15-step1-reduced-motion', q: 'ui=roast&step=value&ctx=generic&trial=3day' };

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

async function runShots(page, shots, outDir) {
  for (const s of shots) {
    await page.goto(`${BASE}?${s.q}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(s.wait ?? 900);
    if (s.click) {
      // Two-step tier-select flow (classic shots): click the tier name, then
      // the price row, to land on a specific SKU selection.
      await page.getByText(s.click, { exact: false }).first().click().catch(() => {});
      await page.waitForTimeout(200);
      await page.getByText('/mo', { exact: false }).last().click().catch(() => {});
      await page.waitForTimeout(500);
    }
    if (s.clickButton) {
      // Single button-text click (e.g. the CTA), no follow-up SKU click.
      await page.getByRole('button', { name: s.clickButton, exact: false }).first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: `${outDir}/${s.name}.png` });
    console.log('shot', s.name);
  }
}

mkdirSync(OUT_CLASSIC, { recursive: true });
mkdirSync(OUT_ROAST, { recursive: true });

const vite = spawn('npx', ['vite', '--config', 'vite.paywall-harness.config.mjs', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  await waitFor(BASE);
  const b = await chromium.launch();

  const p = await b.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => console.error('[page error]', e.message));
  await runShots(p, SHOTS, OUT_CLASSIC);
  await runShots(p, ROAST_SHOTS, OUT_ROAST);
  await p.close();

  // Mandatory reduced-motion pass — own context, see REDUCED_MOTION_SHOT above.
  const rmContext = await b.newContext({ reducedMotion: 'reduce', viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
  const rmPage = await rmContext.newPage();
  rmPage.on('pageerror', (e) => console.error('[page error]', e.message));
  await runShots(rmPage, [REDUCED_MOTION_SHOT], OUT_ROAST);
  await rmContext.close();

  await b.close();
  console.log('classic shots written to', OUT_CLASSIC);
  console.log('roast shots written to', OUT_ROAST);
} catch (e) {
  console.error('shot failed:', e.message);
  process.exitCode = 1;
} finally {
  try { vite.kill('SIGKILL'); } catch {}
}
