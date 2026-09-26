import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { MAX_BREW_TIMER_AGE_MS, restorableSourceTimerState, sourceRestoreStartedAt } from '../src/lib/brewTimerSteps.js';
import { KALITA_SOURCES } from '../src/data/manualSources/kalita.js';
import { projectManualSource } from '../src/lib/manualSourceProjection.js';
import { initialManualBrewState } from '../src/lib/ruphus/sourceTimerState.js';

const now = 200_000_000;
assert.ok(restorableSourceTimerState({ events: { 'first-water': now - 20_000 } }, now), 'recent source timer remains recoverable');
assert.equal(restorableSourceTimerState({ events: { 'first-water': now - MAX_BREW_TIMER_AGE_MS } }, now), null, 'stale source timer cannot reopen a brew');
assert.equal(restorableSourceTimerState({ events: { 'first-water': now + 1 } }, now), null, 'future source timer cannot reopen a brew');
const onyx = KALITA_SOURCES.find(source => source.id === 'onyx-monarch-wave-185');
const projection = projectManualSource(onyx, { device: 'kalita', size: '185', model: 'Wave', filter: 'wave-185', mode: 'hot', dose: 25 });
const sourceRecipe = { sourceProjection: projection };
const binding = {
  sourceId: projection.sourceId, sourceRevision: projection.sourceRevision,
  sourceConfiguration: projection.sourceConfiguration, configurationKey: projection.configurationKey,
  fingerprint: projection.sourceFingerprint || null, dose: projection.coffeeGrams,
};
const sourceState = initialManualBrewState(projection.sourceExecution, binding);
sourceState.events['first-water'] = now - 20_000;
assert.equal(sourceRestoreStartedAt(sourceRecipe, sourceState, binding, now), now - 20_000, 'recent Onyx source timer resumes');
sourceState.events['first-water'] = now - MAX_BREW_TIMER_AGE_MS;
assert.equal(sourceRestoreStartedAt(sourceRecipe, sourceState, binding, now), null, 'stale Onyx source timer starts fresh');

assert.match(readFileSync(new URL('../src/components/BrewTimer.jsx', import.meta.url), 'utf8'), /useBrewTimer\(recipe, attemptId, \{ sourceTimerState, sourceTimerBinding, restoredSession \}\)/);
assert.ok(/const handleConfirmClose = \(\) => \{\s*reset\(\);/.test(readFileSync(new URL('../src/components/BrewTimer.jsx', import.meta.url), 'utf8')), 'Stop clears the checkpoint before the attempt modal unmounts');
assert.match(readFileSync(new URL('../src/components/HandBrewModal.jsx', import.meta.url), 'utf8'), /key=\{attemptId \|\| \(sourceProjection \? `\$\{sourceProjection\.sourceId\}:\$\{sourceProjection\.sourceRevision\}` : 'standard-brew'\)\}/);

// Exercise the real hook across page/process lifetimes, not a replica of its
// clock arithmetic. This isolated page never loads Firebase or makes API calls.
const probe = `
import React from 'react';
import ReactDOM from 'react-dom/client';
import { useBrewTimer } from '/src/hooks/useBrewTimer.js';
const { useEffect } = React;
window.clock = Number(new URL(location.href).searchParams.get('now') || 100000);
Date.now = () => window.clock;
const recipe = {phaseContractVersion:1,timerReady:true,totalBrewTimeSeconds:120,steps:[{timeSeconds:0},{timeSeconds:30},{timeSeconds:60}]};
function Probe() {
  const timer = useBrewTimer(recipe, new URL(location.href).searchParams.get('attempt') || 'trial-one');
  window.timer = timer;
  useEffect(() => { if(timer.phase === 'idle' && !window.stopped) timer.start(); }, [timer.phase, timer.start]);
  return React.createElement('div', null, timer.phase + ':' + timer.globalElapsedMs);
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));
`;
const html = '<div id="root"></div><script type="module" src="/timer-recovery-probe.js"></script>';
let browser;
const server = await createServer({
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent',
  plugins: [{ name: 'timer-recovery-probe',
    resolveId(id) { if (id === '/timer-recovery-probe.js') return '\0timer-recovery-probe'; },
    load(id) { if (id === '\0timer-recovery-probe') return probe; },
    configureServer(vite) {
    vite.middlewares.use('/__timer-recovery', (_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(html);
    });
  } }],
});
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('request', request => assert.equal(request.method(), 'GET'));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  await page.goto(`${origin}/__timer-recovery`);
  await page.waitForFunction(() => window.timer?.phase === 'countdown').catch(error => { console.error(errors); throw error; });
  await page.evaluate(() => window.timer.beginRunning());
  await page.waitForFunction(() => window.timer.phase === 'running');
  await page.evaluate(() => { window.clock = 115000; });
  await page.waitForFunction(() => window.timer.globalElapsedMs === 15000);
  await page.goto(`${origin}/__timer-recovery?now=145000`);
  await page.waitForFunction(() => window.timer?.phase === 'running', null, { timeout: 5000 });
  await page.waitForFunction(() => window.timer.globalElapsedMs === 45000 && window.timer.stepIndex === 1);
  await page.evaluate(() => window.timer.pause());
  await page.waitForFunction(() => window.timer.phase === 'paused');
  await page.goto(`${origin}/__timer-recovery?now=175000`);
  await page.waitForFunction(() => window.timer?.phase === 'paused');
  assert.equal(await page.evaluate(() => window.timer.readGlobalMs()), 45000);
  await page.evaluate(() => window.timer.rewind());
  await page.waitForFunction(() => window.timer.stepIndex === 0);
  await page.reload();
  await page.waitForFunction(() => window.timer?.phase === 'paused' && window.timer.stepIndex === 0);
  assert.equal(await page.evaluate(() => window.timer.readGlobalMs()), 45000);
  await page.evaluate(() => window.timer.resume());
  await page.waitForFunction(() => window.timer.phase === 'running');
  await page.evaluate(() => { window.clock = 180000; });
  await page.waitForFunction(() => window.timer.globalElapsedMs === 50000);
  await page.evaluate(() => { window.stopped = true; window.timer.reset(); });
  await page.waitForFunction(() => window.timer.phase === 'idle');
  await page.reload();
  await page.waitForFunction(() => window.timer?.phase === 'countdown');
  await page.evaluate(() => window.timer.beginRunning());
  await page.waitForFunction(() => window.timer.phase === 'running');
  await page.goto(`${origin}/__timer-recovery?attempt=trial-two&now=200000`);
  await page.waitForFunction(() => window.timer?.phase === 'countdown');
  await page.evaluate(() => window.timer.beginRunning());
  await page.waitForFunction(() => window.timer.phase === 'running');
  await page.evaluate(() => window.timer.finish('userFinished'));
  await page.waitForFunction(() => window.timer.phase === 'done');
  await page.reload();
  await page.waitForFunction(() => window.timer?.phase === 'countdown');
  await page.evaluate(() => {
    const startedAt = 30000000 - 6 * 60 * 60 * 1000;
    localStorage.setItem('ruphus-timer-v1:trial-two', JSON.stringify({
      signature: JSON.stringify(window.timer.timerSteps.map(step => [step.startSeconds, step.durationSeconds])),
      phase: 'running', stepIndex: 2, startedAt, stepStartedAt: startedAt + 60000,
      pauseStartedAt: null, pausedAccumMs: 0, stepPausedAccumMs: 0,
    }));
  });
  await page.goto(`${origin}/__timer-recovery?attempt=trial-two&now=30000000`);
  await page.waitForFunction(() => window.timer?.phase === 'countdown');
  await page.evaluate(() => localStorage.setItem('ruphus-timer-v1:trial-two', '{broken'));
  await page.reload();
  await page.waitForFunction(() => window.timer?.phase === 'countdown');
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (key.startsWith('ruphus-timer-v1:')) throw new DOMException('Unavailable', 'SecurityError');
      return original.call(this, key);
    };
  });
  await page.reload();
  await page.waitForFunction(() => window.timer?.phase === 'countdown');
  assert.deepEqual(errors, []);
  console.log('Actual timer hook recovery passed: running, paused, rewind, resume, stop, finish, attempt isolation, unavailable/corrupt storage; no network writes.');
} finally {
  await browser?.close();
  await server.close();
}
