// With a scale, a V60 Switch steep starts only once pour 2 is done.
// Tal (2026-11-22): pour 2 finished at 2:10 and the app said "open the valve"
// straight away, because the clock had already passed the planned open time.
// Now the timer holds the pour until the scale says it reached its target,
// then runs the full steep before the drain cue.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { buildBrewActivity } from '../src/lib/brewLiveActivity.js';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';
import { holdForPour, POUR_STALL, pourTargets } from '../src/lib/scale/scaleSession.js';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';

const recipe = generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' });
const timerSteps = buildTimerSteps(recipe);
assert.deepEqual(timerSteps.map((step) => [step.startSeconds, step.durationSeconds]), [[0, 40], [40, 35], [75, 40], [115, 55]]);
const targets = pourTargets(timerSteps);
const pour2 = targets[1];
assert.equal(pour2.stepIndex, 1);

// --- When to hold ---------------------------------------------------------
const base = { timerSteps, stepIndex: 1, target: pour2, reachedAtMs: {}, grams: 220, idleMs: 0, connected: true };
assert.equal(holdForPour(base), true, 'pour 2 short of 300 g holds the steep');
assert.equal(holdForPour({ ...base, reachedAtMs: { 1: 1 } }), false, 'a reached pour lets the steep start');
assert.equal(holdForPour({ ...base, connected: false }), false, 'no hold without a connected scale');
assert.equal(holdForPour({ ...base, idleMs: 10 * 60 * 1000 }), true, 'a slow pour 2 is never cut off by the clock, however long it takes');
assert.equal(holdForPour({ ...base, grams: 129, idleMs: 60000 }), true, 'pour 2 not started yet: keep waiting');
assert.equal(holdForPour({ ...base, grams: 290, idleMs: POUR_STALL.idleMs }), false, 'stopped just short of 300 g: the steep starts');
assert.equal(holdForPour({ ...base, grams: 290, idleMs: POUR_STALL.idleMs - 1 }), true, 'a brief pause near the end still holds');
assert.equal(holdForPour({ ...base, stepIndex: 0, target: targets[0] }), false, 'pour 1 is not followed by a steep');
assert.equal(holdForPour({ ...base, stepIndex: 2 }), false, 'only the pour step itself is held');

// --- Live Activity: a held step does not auto-advance ----------------------
const held = buildBrewActivity({
  phase: 'running', stepIndex: 1, timerSteps, globalElapsedMs: 80000, stepElapsedMs: 40000,
  currentStepDurationMs: 35000, totalMs: 170000, holding: true, nowMs: 1_000_000,
});
assert.equal(held.state.steps[1].seconds, null);
assert.deepEqual(held.alerts, [], 'no "Steep" alert while pour 2 is still going');

// --- The real hook --------------------------------------------------------
const probe = `
import React from 'react';
import ReactDOM from 'react-dom/client';
import { useBrewTimer } from '/src/hooks/useBrewTimer.js';
window.clock = 100000;
Date.now = () => window.clock;
const recipe = ${JSON.stringify(recipe)};
const holdStepRef = { current: (index) => window.holdPour === true && index === 1 };
function Probe() {
  const timer = useBrewTimer(recipe, 'pour-hold', { holdStepRef });
  window.timer = timer;
  React.useEffect(() => { if (timer.phase === 'idle') timer.start(); }, [timer.phase, timer.start]);
  return null;
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));
`;
const server = await createServer({
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent',
  plugins: [{
    name: 'pour-hold-probe',
    resolveId(id) { if (id === '/pour-hold-probe.js') return '\0pour-hold-probe'; },
    load(id) { if (id === '\0pour-hold-probe') return probe; },
    configureServer(vite) {
      vite.middlewares.use('/__pour-hold', (_request, response) => {
        response.setHeader('Content-Type', 'text/html');
        response.end('<div id="root"></div><script type="module" src="/pour-hold-probe.js"></script>');
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__pour-hold`);
  const at = async (seconds) => page.evaluate((ms) => { window.clock = 100000 + ms; }, seconds * 1000);
  const waitFor = (fn, arg) => page.waitForFunction(fn, arg);

  await waitFor(() => window.timer?.phase === 'countdown');
  await page.evaluate(() => window.timer.beginRunning(100000));
  await at(50);
  await waitFor(() => window.timer.stepIndex === 1);

  // Pour 2 is still going when the steep is due: the timer holds it.
  await page.evaluate(() => { window.holdPour = true; });
  await at(80);
  await waitFor(() => window.timer.holding === true);
  await at(130);
  await waitFor(() => window.timer.globalElapsedMs === 130000);
  assert.equal(await page.evaluate(() => window.timer.stepIndex), 1, 'at 2:10 the app is still on pour 2, not "open the valve"');

  // The scale reaches 300 g at 2:10: the full 40 s steep starts then.
  await page.evaluate(() => { window.holdPour = false; });
  await waitFor(() => window.timer.stepIndex === 2 && window.timer.holding === false);
  assert.equal(await page.evaluate(() => window.timer.totalMs), 170000 + 55000, 'the guide grows by the 55 s held');
  await at(169);
  await waitFor(() => window.timer.globalElapsedMs === 169000);
  assert.equal(await page.evaluate(() => window.timer.stepIndex), 2, 'still steeping 39 s after pour 2');
  await at(170.2);
  await waitFor(() => window.timer.stepIndex === 3);

  // Control: no hold, so the steep starts on its planned time.
  await page.evaluate(() => { window.timer.reset(); });
  await waitFor(() => window.timer.phase === 'countdown');
  await at(0);
  await page.evaluate(() => window.timer.beginRunning(100000));
  await at(76);
  await waitFor(() => window.timer.stepIndex === 2);
  assert.equal(await page.evaluate(() => window.timer.totalMs), 170000);
  assert.deepEqual(errors, []);
  console.log('V60 Switch pour hold passed: the steep waits for pour 2 on the scale, then runs its full length');
} finally {
  await browser?.close();
  await server.close();
}
