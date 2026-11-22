// Pure brew logic on top of scale weight samples: first-pour detection, flow,
// pour targets, and the summary saved with a brew. Samples are
// { atMs, grams } in arrival order, grams already net of the tare.

export const FIRST_POUR = { minGrams: 2, minGps: 1, windowMs: 300, originGrams: 0.5 };
export const TARGET_REACHED_G = 2;
export const TARGET_OVER_G = 5;
export const FLOW_WINDOW_MS = 1500;
export const FLOW_BAND = { low: 2.5, high: 6.5, idle: 0.3 };

const round1 = (value) => Math.round(value * 10) / 10;

// Water poured is armed by a tare. It starts the clock when the net weight is
// above 2 g and rising at 1 g/s or more over the last 300 ms, then back-dates
// the start to the first sample of that rise above 0.5 g. Returns that time,
// or null while still waiting.
export function detectFirstPour(samples) {
  const latest = samples[samples.length - 1];
  if (!latest || latest.grams <= FIRST_POUR.minGrams) return null;
  let beforeIndex = -1;
  for (let index = samples.length - 2; index >= 0; index -= 1) {
    if (samples[index].atMs <= latest.atMs - FIRST_POUR.windowMs) {
      beforeIndex = index;
      break;
    }
  }
  if (beforeIndex < 0) return null;
  // Sustained: every reading of the last 300 ms is already water, so a single
  // bump from setting down the kettle does not count.
  if (samples.slice(beforeIndex + 1).some((sample) => sample.grams <= FIRST_POUR.originGrams)) return null;
  const before = samples[beforeIndex];
  const gps = (latest.grams - before.grams) / ((latest.atMs - before.atMs) / 1000);
  if (gps < FIRST_POUR.minGps) return null;
  let origin = latest;
  for (let index = samples.length - 2; index >= 0 && samples[index].grams > FIRST_POUR.originGrams; index -= 1) {
    origin = samples[index];
  }
  return origin.atMs;
}

// Least-squares slope through the samples of the last 1.5 s, in g/s. Spikes
// from a bump are averaged out; a falling weight reads as 0.
export function flowRate(samples, nowMs = samples[samples.length - 1]?.atMs) {
  const recent = samples.filter((sample) => sample.atMs >= nowMs - FLOW_WINDOW_MS && sample.atMs <= nowMs);
  if (recent.length < 3) return 0;
  const meanT = recent.reduce((sum, sample) => sum + sample.atMs, 0) / recent.length;
  const meanG = recent.reduce((sum, sample) => sum + sample.grams, 0) / recent.length;
  let covariance = 0;
  let variance = 0;
  for (const sample of recent) {
    covariance += (sample.atMs - meanT) * (sample.grams - meanG);
    variance += (sample.atMs - meanT) ** 2;
  }
  if (variance <= 0) return 0;
  const gps = (covariance / variance) * 1000;
  return Math.min(20, Math.max(0, gps));
}

export function flowLabel(gps) {
  if (gps < FLOW_BAND.idle) return 'Idle';
  if (gps < FLOW_BAND.low) return 'Slow';
  if (gps > FLOW_BAND.high) return 'Fast';
  return 'Steady';
}

// Every timer step with a cumulative water target becomes a pour. mL counts
// as grams (water). Targets must rise; anything else is not a pour target.
export function pourTargets(timerSteps) {
  const targets = [];
  for (const entry of timerSteps || []) {
    const step = entry.step || {};
    const value = Number(step.waterTotal);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (step.waterUnit && !['g', 'mL', 'ml'].includes(step.waterUnit)) continue;
    if (targets.length && value <= targets[targets.length - 1].targetG) continue;
    targets.push({
      stepIndex: entry.index,
      startSeconds: entry.startSeconds,
      label: targets.length === 0 ? 'Bloom' : `Pour ${targets.length + 1}`,
      targetG: value,
    });
  }
  return targets;
}

// The pour the brewer is working on at `stepIndex`: the target of that step,
// or the last target already passed (drawdown and waits hold the last pour).
export function activePour(targets, stepIndex) {
  let active = null;
  for (const target of targets) {
    if (target.stepIndex <= stepIndex) active = target;
  }
  return active || targets[0] || null;
}

// A step marked waitForPour (the V60 Switch steep) starts only once the pour
// before it is done, so a slow pour never eats the steep: the timer holds that
// pour past its planned end while the scale is connected. The pour is done
// when it reaches its target, or when the water stopped within
// POUR_STALL.gapG of it for POUR_STALL.idleMs (the brewer stopped just short).
// A pour that never started keeps waiting; Skip still moves on.
export const POUR_STALL = { gapG: 15, idleMs: 5000 };

export function holdForPour({ timerSteps, stepIndex, target, reachedAtMs = {}, grams, idleMs = 0, connected }) {
  if (!connected || !timerSteps?.[stepIndex + 1]?.step?.waitForPour) return false;
  if (!target || target.stepIndex !== stepIndex || reachedAtMs[stepIndex]) return false;
  const stoppedShort = Number.isFinite(grams) && grams >= target.targetG - POUR_STALL.gapG && idleMs >= POUR_STALL.idleMs;
  return !stoppedShort;
}

// The named step the brewer is on once the last pour is behind them (the V60
// Switch Steep and Drain), or null while a pour is still ahead or under way.
export function stepAfterLastPour(timerSteps, targets, stepIndex) {
  const lastPour = targets?.[targets.length - 1];
  if (!lastPour || stepIndex <= lastPour.stepIndex) return null;
  return timerSteps?.[stepIndex]?.step?.name || null;
}

export function targetState(grams, targetG) {
  if (!Number.isFinite(targetG)) return 'pouring';
  if (grams > targetG + TARGET_OVER_G) return 'over';
  if (grams >= targetG - TARGET_REACHED_G) return 'reached';
  return 'pouring';
}

// Ring fill for the current pour, from the previous pour's target to this one.
export function pourProgress(grams, targets, target) {
  if (!target) return 0;
  const index = targets.indexOf(target);
  const from = index > 0 ? targets[index - 1].targetG : 0;
  const span = target.targetG - from;
  return span > 0 ? Math.min(1, Math.max(0, (grams - from) / span)) : 0;
}

// Weight at each whole second after `originMs`, carrying the last reading
// forward. 1 Hz keeps a four-minute brew around 240 numbers.
export function thinCurve(samples, originMs, endMs) {
  const seconds = Math.max(0, Math.floor((endMs - originMs) / 1000));
  const curve = [];
  let index = 0;
  let last = 0;
  for (let second = 0; second <= seconds; second += 1) {
    const atMs = originMs + second * 1000;
    while (index < samples.length && samples[index].atMs <= atMs) {
      last = samples[index].grams;
      index += 1;
    }
    curve.push(round1(Math.max(0, last)));
  }
  return curve;
}

// The record saved with a brew. Only this and the thinned curve are kept,
// never the raw stream.
export function buildScaleSummary({ samples, firstWaterAtMs, finishAtMs, targets, reachedAtMs = {}, model, protocol, doseGrams }) {
  const brewSamples = samples.filter((sample) => sample.atMs >= firstWaterAtMs && sample.atMs <= finishAtMs);
  if (!brewSamples.length || !Number.isFinite(firstWaterAtMs) || finishAtMs <= firstWaterAtMs) return null;
  const curve = thinCurve(brewSamples, firstWaterAtMs, finishAtMs);
  const finalWaterG = round1(Math.max(...brewSamples.map((sample) => sample.grams)));
  const flows = [];
  for (let atMs = firstWaterAtMs + 1000; atMs <= finishAtMs; atMs += 500) flows.push(flowRate(brewSamples, atMs));
  const pouring = flows.filter((gps) => gps >= FLOW_BAND.idle);
  const perStep = targets.map((target, index) => {
    const next = targets[index + 1];
    // A pour's water is what stood on the scale just before the next pour
    // was due (1 s early, so the next pour's first splash is not counted).
    const windowEnd = next ? firstWaterAtMs + next.startSeconds * 1000 - 1000 : finishAtMs;
    const inWindow = brewSamples.filter((sample) => sample.atMs <= windowEnd);
    const reached = reachedAtMs[target.stepIndex];
    // A pour that was never due before the brew ended has no measurement.
    const due = firstWaterAtMs + target.startSeconds * 1000 < finishAtMs;
    return {
      targetG: target.targetG,
      dueSec: target.startSeconds,
      actualG: due && inWindow.length ? round1(Math.max(...inWindow.map((sample) => sample.grams))) : null,
      reachedAtSec: Number.isFinite(reached) ? Math.round((reached - firstWaterAtMs) / 1000) : null,
    };
  });
  // Bloom lasts until the weight rises again past the bloom pour.
  const bloomEnd = targets.length > 1
    ? brewSamples.find((sample) => sample.atMs > (reachedAtMs[targets[0].stepIndex] ?? firstWaterAtMs) && sample.grams > perStep[0].actualG + 1)
    : null;
  return {
    model: String(model || 'Acaia scale').slice(0, 40),
    protocol,
    firstWaterAtMs: Math.round(firstWaterAtMs),
    perStep,
    finalWaterG,
    ratio: doseGrams > 0 ? round1(finalWaterG / doseGrams) : null,
    bloomSec: bloomEnd ? Math.round((bloomEnd.atMs - firstWaterAtMs) / 1000) : null,
    peakFlowGps: round1(Math.max(0, ...flows)),
    avgFlowGps: pouring.length ? round1(pouring.reduce((sum, gps) => sum + gps, 0) / pouring.length) : 0,
    curve,
  };
}

const PROTOCOLS = new Set(['acaia-old', 'acaia-new', 'fake']);
const finiteOrNull = (value) => (Number.isFinite(value) ? value : null);

// Persistence guard for a saved summary: anything malformed is dropped, not
// written. Firestore has no nested arrays, so the curve is a flat list.
export function normalizeScaleSummary(summary) {
  if (!summary || typeof summary !== 'object' || !PROTOCOLS.has(summary.protocol)) return null;
  if (!Array.isArray(summary.curve) || summary.curve.length > 1200 || !summary.curve.every(Number.isFinite)) return null;
  if (!Array.isArray(summary.perStep) || summary.perStep.length > 20) return null;
  if (!Number.isFinite(summary.finalWaterG)) return null;
  return {
    model: String(summary.model || 'Acaia scale').slice(0, 40),
    protocol: summary.protocol,
    firstWaterAtMs: finiteOrNull(summary.firstWaterAtMs),
    perStep: summary.perStep.map((step) => ({
      targetG: finiteOrNull(step?.targetG),
      dueSec: finiteOrNull(step?.dueSec),
      actualG: finiteOrNull(step?.actualG),
      reachedAtSec: finiteOrNull(step?.reachedAtSec),
    })),
    finalWaterG: summary.finalWaterG,
    ratio: finiteOrNull(summary.ratio),
    bloomSec: finiteOrNull(summary.bloomSec),
    peakFlowGps: finiteOrNull(summary.peakFlowGps),
    avgFlowGps: finiteOrNull(summary.avgFlowGps),
    curve: summary.curve.map(round1),
  };
}

// The pour curve of the most recent earlier brew of this bean on the same
// device that had a scale, for the dotted reference line.
export function lastScaleCurve(history, { device, mode, beforeMs } = {}) {
  const match = (Array.isArray(history) ? history : [])
    .filter((event) => event?.scaleSummary?.curve?.length && event.device === device && event.mode === mode
      && (event.scaleSummary.firstWaterAtMs ?? event.createdAt) < beforeMs)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  return match ? match.scaleSummary.curve : null;
}
