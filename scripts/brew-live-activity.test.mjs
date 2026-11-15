import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generateKalitaRecipe } from '../src/lib/kalitaAdapter.js';
import { buildTimerSteps } from '../src/lib/brewTimerSteps.js';
import {
  brewActivityAttributes,
  buildBrewActivity,
  describeBrewSteps,
  endBrewActivity,
  publishBrewActivity,
} from '../src/lib/brewLiveActivity.js';

const recipe = generateKalitaRecipe({}, { size: '185', dose: 20, grinder: 'fellow-ode-gen2' });
const timerSteps = buildTimerSteps(recipe);
const totalMs = recipe.totalBrewTimeSeconds * 1000;
const now = 1_800_000_000_000;

// Step labels: cumulative water targets, bloom named, pours numbered.
const steps = describeBrewSteps(timerSteps);
assert.deepEqual(steps.map((step) => step.title), ['Bloom', 'Pour 1 of 2', 'Pour 2 of 2']);
assert.deepEqual(steps.map((step) => step.target), ['60g', '144g', '320g']);
assert.equal(steps[1].detail, 'Pour to 144 g');
assert.equal(steps[2].short, 'Pour 2 to 320 g');
assert.deepEqual(steps.map((step) => step.seconds), timerSteps.map((step) => step.durationSeconds));

const waitSteps = describeBrewSteps([
  { durationSeconds: 30, step: { name: 'Pour', waterTotal: 100 } },
  { durationSeconds: 60, step: { name: 'Drawdown', waterTotal: 100, action: 'Let it drain completely.' } },
  { openEnded: true, durationSeconds: null, step: { name: 'Finish', action: 'x'.repeat(200) } },
]);
assert.equal(waitSteps[0].title, 'Pour', 'a single pour is not numbered');
assert.equal(waitSteps[1].pour, false, 'no new water is a wait');
assert.equal(waitSteps[1].detail, 'Let it drain completely.');
assert.equal(waitSteps[2].seconds, null, 'open-ended steps wait for the user');
assert.ok(waitSteps[2].detail.length <= 90, 'long step text is clipped');

// Nothing shows before the 3-2-1 countdown ends.
for (const phase of ['idle', 'countdown']) {
  assert.equal(buildBrewActivity({ phase, stepIndex: 0, timerSteps, globalElapsedMs: 0, stepElapsedMs: 0, totalMs, nowMs: now }), null);
}

// Running: anchors are wall clock dates, alerts at each later step start.
const running = buildBrewActivity({
  phase: 'running', stepIndex: 1, timerSteps,
  globalElapsedMs: 50_000, stepElapsedMs: 10_000,
  currentStepDurationMs: 50_000, totalMs, nowMs: now,
});
assert.equal(running.state.phase, 'running');
assert.equal(running.state.autoAdvance, true);
assert.equal(running.state.stepStartedAt, now - 10_000);
assert.equal(running.state.brewStartedAt, now - 50_000);
assert.equal(running.state.totalSeconds, recipe.totalBrewTimeSeconds);
assert.deepEqual(running.alerts, [{ at: now + 40_000, title: 'Pour 2 of 2 · 1:30', body: 'Pour to 320 g' }]);

const skipped = buildBrewActivity({
  phase: 'running', stepIndex: 0, timerSteps,
  globalElapsedMs: 5_000, stepElapsedMs: 5_000,
  currentStepDurationMs: 40_000, totalMs, nowMs: now,
});
assert.deepEqual(skipped.alerts.map((alert) => alert.at), [now + 35_000, now + 85_000]);
assert.deepEqual(skipped.alerts.map((alert) => alert.title), ['Pour 1 of 2 · 0:40', 'Pour 2 of 2 · 1:30']);

// Paused: no live anchors, no alerts, frozen remaining time.
const paused = buildBrewActivity({
  phase: 'paused', stepIndex: 1, timerSteps,
  globalElapsedMs: 50_000, stepElapsedMs: 10_000,
  currentStepDurationMs: 50_000, totalMs, nowMs: now,
});
assert.equal(paused.state.phase, 'paused');
assert.equal(paused.state.stepRemainingSeconds, 40);
assert.equal(paused.state.stepStartedAt, undefined);
assert.deepEqual(paused.alerts, []);

// Done, and the iced chill step before it.
const doneArgs = {
  phase: 'done', stepIndex: 2, timerSteps, globalElapsedMs: 208_000, stepElapsedMs: 0,
  totalMs, completionElapsedMs: 208_400, completionAtMs: now - 1_000, nowMs: now,
};
const done = buildBrewActivity(doneArgs);
assert.equal(done.state.phase, 'done');
assert.equal(done.state.elapsedSeconds, 208.4);
const chill = buildBrewActivity({ ...doneArgs, iced: true, chilled: false, chillNote: 'Swirl over ice' });
assert.equal(chill.state.phase, 'chill');
assert.equal(chill.state.dueAt, now - 1_000);
assert.equal(chill.state.note, 'Swirl over ice');
assert.equal(buildBrewActivity({ ...doneArgs, iced: true, chilled: true }).state.phase, 'done');

// Source recipes that wait for a confirmation.
const sourceSteps = [
  { index: 0, startSeconds: 0, durationSeconds: null, openEnded: true, step: { name: 'Pour', action: 'Pour to 50 g', waterTotal: 50 } },
  { index: 1, startSeconds: 0, durationSeconds: null, openEnded: true, step: { name: 'Valve', action: 'Open the valve' } },
];
const yourTurn = buildBrewActivity({
  phase: 'running', stepIndex: 1, timerSteps: sourceSteps, globalElapsedMs: 125_000, stepElapsedMs: 0,
  currentStepDurationMs: 0, totalMs: 0, confirmedSource: true,
  sourceReadiness: { status: 'ready' }, sourceActive: false, nowMs: now,
});
assert.equal(yourTurn.state.phase, 'yourTurn');
assert.equal(yourTurn.state.dueAt, now);
assert.equal(yourTurn.state.autoAdvance, false);
const sourceCountdown = buildBrewActivity({
  phase: 'running', stepIndex: 1, timerSteps: sourceSteps, globalElapsedMs: 100_000, stepElapsedMs: 20_000,
  currentStepDurationMs: 30_000, totalMs: 0, confirmedSource: true,
  sourceReadiness: { status: 'countdown' }, sourceActive: false, nowMs: now,
});
assert.equal(sourceCountdown.state.phase, 'running');
assert.equal(sourceCountdown.state.steps[1].seconds, 30, 'the countdown the app shows');
assert.deepEqual(sourceCountdown.alerts, [{ at: now + 10_000, title: 'Your turn', body: 'Open the valve' }]);

// ActivityKit caps static plus dynamic data at 4 KB.
const longSteps = Array.from({ length: 12 }, (_, index) => ({
  index, startSeconds: index * 30, durationSeconds: 30,
  step: { name: `Step name that is fairly long ${index}`, action: 'A long instruction '.repeat(12), waterTotal: index % 2 ? 50 * index : null },
}));
const big = buildBrewActivity({ phase: 'running', stepIndex: 0, timerSteps: longSteps, globalElapsedMs: 0, stepElapsedMs: 0, currentStepDurationMs: 30_000, totalMs: 360_000, nowMs: now });
const attributes = brewActivityAttributes({ sessionId: 'session-1', beanName: 'A very long bean name from a roaster', methodLabel: 'Kalita Wave', doseGrams: 20, iced: true });
assert.equal(attributes.title, 'A very long bean name from a roaster · Iced Kalita Wave');
assert.equal(attributes.subtitle, 'Iced Kalita Wave · 20 g');
assert.ok(JSON.stringify({ attributes, state: big.state }).length < 4096, 'payload stays under 4 KB');

// Web and old binaries: no plugin, no throw.
publishBrewActivity(attributes, running);
endBrewActivity();

// configure-ios-variant rewrites the extension's bundle ID with the app's.
const root = resolve(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'brew-activity-variant-'));
try {
  for (const path of ['ios/App/App.xcodeproj/project.pbxproj', 'ios/App/App/Info.plist', 'ios/App/App/AppDelegate.swift',
    'config/firebase/GoogleService-Info.prod.plist', 'config/firebase/GoogleService-Info.dev.plist']) {
    mkdirSync(join(work, path, '..'), { recursive: true });
    copyFileSync(join(root, path), join(work, path));
  }
  writeFileSync(join(work, 'ios/App/App/capacitor.config.json'), '{}');
  for (const [variant, appId] of [['prod', 'com.talmeltzer.coffeehub'], ['dev', 'com.talmeltzer.coffeehub.dev']]) {
    execFileSync('node', [join(root, 'scripts/configure-ios-variant.mjs'), variant], { cwd: work, stdio: 'ignore' });
    const ids = [...readFileSync(join(work, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')
      .matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(ids)].sort(), [appId, `${appId}.BrewActivity`], `${variant} bundle IDs`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

// The widget's schedule walk (Swift). Needs swiftc, so it runs on a Mac only.
if (spawnSync('swiftc', ['--version'], { stdio: 'ignore' }).status === 0) {
  const out = execFileSync('node', [join(root, 'scripts/brew-activity-schedule.swift-test.mjs')], { encoding: 'utf8' });
  assert.match(out, /brew activity schedule passed/);
} else {
  console.log('brew activity schedule (Swift) skipped: swiftc not found');
}

console.log('brew live activity passed');
