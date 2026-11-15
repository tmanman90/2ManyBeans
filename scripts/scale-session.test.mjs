// Scale brew logic against recorded-style traces from the fake scale.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activePour, buildScaleSummary, detectFirstPour, flowLabel, flowRate, lastScaleCurve,
  normalizeScaleSummary, pourProgress, pourTargets, targetState, thinCurve,
} from '../src/lib/scale/scaleSession.js';
import { fakePourWeight, createFakeTransport } from '../src/lib/scale/fakeScale.js';
import { buildTimingEvent, mergeTimingEvent, timingContextFromRecipe } from '../src/lib/brewTimingMemory.js';

const PLAN = [{ atSec: 0, toG: 60 }, { atSec: 45, toG: 160 }, { atSec: 90, toG: 240 }, { atSec: 135, toG: 320 }];
// 10 Hz samples: `idleSec` of an empty, tared scale, then the plan poured.
function trace({ idleSec = 3, brewSec = 190, plan = PLAN, t0 = 1_000_000 } = {}) {
  const samples = [];
  for (let ms = 0; ms <= (idleSec + brewSec) * 1000; ms += 100) {
    const brewing = ms / 1000 - idleSec;
    samples.push({ atMs: t0 + ms, grams: brewing < 0 ? 0 : Math.round(fakePourWeight(plan, brewing) * 10) / 10 });
  }
  return samples;
}
const STEPS = [
  { index: 0, startSeconds: 0, step: { name: 'Bloom', waterTotal: 60, waterUnit: 'g' } },
  { index: 1, startSeconds: 45, step: { name: 'Pour 2', waterTotal: 160, waterUnit: 'g' } },
  { index: 2, startSeconds: 90, step: { name: 'Pour 3', waterTotal: 240, waterUnit: 'g' } },
  { index: 3, startSeconds: 135, step: { name: 'Pour 4', waterTotal: 320, waterUnit: 'g' } },
  { index: 4, startSeconds: 165, step: { name: 'Drawdown' } },
];

test('first pour starts the clock, back-dated to the first drop', () => {
  const samples = trace();
  let startedAt = null;
  for (let i = 1; i <= samples.length && startedAt == null; i += 1) startedAt = detectFirstPour(samples.slice(0, i));
  // The pour begins at 3.0 s; the first reading above 0.5 g is at 3.2 s.
  assert.equal(startedAt, 1_000_000 + 3200);
});

test('a bump or a slow drift does not start the clock', () => {
  const t0 = 0;
  const bump = [0, 0, 0, 3.4, 0.2, 0, 0].map((grams, i) => ({ atMs: t0 + i * 100, grams }));
  for (let i = 1; i <= bump.length; i += 1) assert.equal(detectFirstPour(bump.slice(0, i)), null);
  const drift = Array.from({ length: 60 }, (_, i) => ({ atMs: i * 100, grams: i * 0.05 }));
  for (let i = 1; i <= drift.length; i += 1) assert.equal(detectFirstPour(drift.slice(0, i)), null, 'about 0.5 g/s');
  assert.equal(detectFirstPour([]), null);
});

test('flow is smoothed and clamped', () => {
  const samples = trace();
  const midBloom = samples.find((s) => s.atMs === 1_000_000 + 8000).atMs;
  assert.ok(Math.abs(flowRate(samples, midBloom) - 5) < 0.3, 'pouring at 5 g/s');
  const resting = samples.find((s) => s.atMs === 1_000_000 + 30000).atMs;
  assert.equal(flowRate(samples, resting), 0);
  const falling = [10, 8, 6, 4].map((grams, i) => ({ atMs: i * 100, grams }));
  assert.equal(flowRate(falling), 0, 'lifting the dripper is not negative flow');
  assert.equal(flowLabel(0.1), 'Idle');
  assert.equal(flowLabel(1.5), 'Slow');
  assert.equal(flowLabel(4.1), 'Steady');
  assert.equal(flowLabel(7), 'Fast');
});

test('pour targets come from the cumulative water of each step', () => {
  const targets = pourTargets(STEPS);
  assert.deepEqual(targets.map((t) => [t.label, t.targetG, t.stepIndex]), [['Bloom', 60, 0], ['Pour 2', 160, 1], ['Pour 3', 240, 2], ['Pour 4', 320, 3]]);
  assert.equal(activePour(targets, 4).targetG, 320, 'drawdown holds the last pour');
  assert.equal(activePour(targets, 1).targetG, 160);
  assert.deepEqual(pourTargets([{ index: 0, step: { waterTotal: 4, waterUnit: 'oz' } }]), []);
  assert.equal(pourTargets([{ index: 0, startSeconds: 0, step: { waterTotal: 200, waterUnit: 'mL' } }])[0].targetG, 200);
});

test('target state: within 2 g reached, more than 5 g over', () => {
  assert.equal(targetState(57.9, 60), 'pouring');
  assert.equal(targetState(58, 60), 'reached');
  assert.equal(targetState(65, 60), 'reached');
  assert.equal(targetState(65.1, 60), 'over');
  const targets = pourTargets(STEPS);
  assert.ok(Math.abs(pourProgress(42.6, targets, targets[0]) - 0.71) < 1e-9);
  assert.equal(pourProgress(110, targets, targets[1]), 0.5, 'from the previous target');
  assert.equal(pourProgress(400, targets, targets[3]), 1);
});

test('summary: per pour, ratio, bloom, flow and a 1 Hz curve', () => {
  const samples = trace();
  const start = 1_000_000 + 3200;
  const targets = pourTargets(STEPS);
  const reachedAtMs = { 0: start + 11500, 1: start + 65000, 2: start + 106000, 3: start + 151000 };
  const summary = buildScaleSummary({ samples, firstWaterAtMs: start, finishAtMs: start + 180000, targets, reachedAtMs, model: 'Pearl S', protocol: 'acaia-new', doseGrams: 20 });
  assert.equal(summary.finalWaterG, 320);
  assert.equal(summary.ratio, 16);
  assert.deepEqual(summary.perStep.map((s) => s.actualG), [60, 160, 240, 320]);
  assert.deepEqual(summary.perStep.map((s) => s.reachedAtSec), [12, 65, 106, 151]);
  assert.equal(summary.bloomSec, 45);
  assert.ok(Math.abs(summary.peakFlowGps - 5) < 0.3);
  assert.equal(summary.curve.length, 181);
  assert.ok(summary.curve[0] <= 1, "starts at the first drop");
  assert.equal(summary.curve[180], 320);
  assert.equal(buildScaleSummary({ samples, firstWaterAtMs: start, finishAtMs: start - 1, targets }), null);
});

test('thin curve carries the last reading forward', () => {
  const samples = [{ atMs: 0, grams: 0 }, { atMs: 1500, grams: 10 }, { atMs: 3200, grams: 20 }];
  assert.deepEqual(thinCurve(samples, 0, 3500), [0, 0, 10, 10]);
});

test('saved summaries are validated and kept on the timing record', () => {
  const summary = buildScaleSummary({
    samples: trace(), firstWaterAtMs: 1_003_200, finishAtMs: 1_183_200, targets: pourTargets(STEPS), model: 'Pearl S', protocol: 'acaia-old', doseGrams: 20,
  });
  assert.deepEqual(normalizeScaleSummary(summary), summary);
  assert.equal(normalizeScaleSummary({ ...summary, protocol: 'other' }), null);
  assert.equal(normalizeScaleSummary({ ...summary, curve: [[0, 1]] }), null, 'Firestore has no nested arrays');
  assert.equal(normalizeScaleSummary(null), null);

  const recipe = { device: 'v60', coffeeGrams: 20, totalBrewTimeSeconds: 180, engineVersion: 'v60-v1', rulesVersion: 'r1', candidate: true };
  const context = timingContextFromRecipe({ beanId: 'kenya', recipe });
  const snapshot = { ...context, sessionId: 's1', completionKind: 'userFinished', actualElapsedMs: 180000, createdAt: 2_000_000, scaleSummary: summary };
  assert.deepEqual(buildTimingEvent(snapshot).scaleSummary, summary);
  assert.equal('scaleSummary' in buildTimingEvent({ ...snapshot, scaleSummary: { junk: true } }), false);
  const history = mergeTimingEvent([], snapshot);
  assert.deepEqual(lastScaleCurve(history, { device: 'v60', mode: 'hot', beforeMs: 2_000_000 }), summary.curve);
  assert.equal(lastScaleCurve(history, { device: 'v60', mode: 'hot', beforeMs: summary.firstWaterAtMs }), null, 'not the brew itself');
  assert.equal(lastScaleCurve(history, { device: 'kalita', mode: 'hot', beforeMs: 3_000_000 }), null);
});

test('fake scale reads gross weight until tare, then pours the plan', async () => {
  let clock = 0;
  const transport = createFakeTransport({ now: () => clock, firstPourDelayMs: 1000 });
  const messages = [];
  const link = await transport.connect({ deviceId: 'fake' }, { onMessage: (m) => messages.push(m), pourPlan: [{ atSec: 0, toG: 50 }] });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(messages[0].kind, 'settings');
  assert.ok(Math.abs(messages.at(-1).grams - 412.6) < 0.2);
  await link.tare();
  clock = 1000 + 4000;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(Math.abs(messages.at(-1).grams - 20) < 0.2, '4 s at 5 g/s');
  await link.disconnect();
  assert.equal(fakePourWeight([{ atSec: 0, toG: 60 }, { atSec: 45, toG: 160 }], 50), 85);
});
