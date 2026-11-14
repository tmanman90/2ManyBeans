import { manualSourceDisplay, validateManualSourceProjection } from './manualSourceProjection.js';
import { validateManualBrewState } from './ruphus/sourceTimerState.js';

export const PHASE_CONTRACT_VERSION = 1;

const WATER_ACTION = /\b(?:bloom|pour|pouring|water|hot water|pulse|finish)\b/i;
const PREP_ACTION = /\b(?:rinse|preheat|load|add\s+\d+(?:\.\d+)?\s*g\s*coffee|level the bed|server ice|brew ice|discard rinse)\b/i;
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const sourceProjectionFor = (recipe) => recipe?.sourceProjection && typeof recipe.sourceProjection === 'object'
  ? recipe.sourceProjection
  : null;

export function sourceTimerMode(recipe) {
  const projection = sourceProjectionFor(recipe);
  const record = projection?.sourceExecution;
  if (projection?.timerReady !== true || !record || !Array.isArray(record.stages) || record.stages.length === 0) return null;
  if (projection.projectionVersion && !validateManualSourceProjection(projection).valid) return null;
  const automatic = record.clock?.origin === 'first-water'
    && record.stages.every((stage) => stage?.trigger?.type === 'elapsed' && Number.isFinite(stage.trigger.seconds));
  return automatic ? 'automatic' : 'confirmed';
}

export function sourceTimerTotalSeconds(recipe) {
  const projection = sourceProjectionFor(recipe);
  const maxSeconds = projection?.finish?.maxSeconds;
  return Number.isFinite(maxSeconds) && maxSeconds > 0 ? maxSeconds : null;
}

export function sourceTimerDisplayStages(recipe) {
  const projection = sourceProjectionFor(recipe);
  return projection ? manualSourceDisplay(projection).stages : [];
}

export function resumeSourceTimerState(state, resumedAtMs) {
  const pausedAtMs = state?.sharedTimerPauseStartedAtMs;
  if (!state || !Number.isFinite(pausedAtMs) || !Number.isFinite(resumedAtMs) || resumedAtMs < pausedAtMs) return null;
  const pausedForMs = resumedAtMs - pausedAtMs;
  const shifted = {
    ...state,
    events: Object.fromEntries(Object.entries(state.events || {}).map(([name, atMs]) => [name, atMs + pausedForMs])),
    corrections: (state.corrections || []).map((correction) => ({
      ...correction,
      withdrawnAtMs: correction.withdrawnAtMs + pausedForMs,
      correctedAtMs: correction.correctedAtMs + pausedForMs,
    })),
  };
  delete shifted.sharedTimerPauseStartedAtMs;
  return shifted;
}

export function sourceRestoreStartedAt(recipe, sourceTimerState, sourceTimerBinding = null) {
  const projection = recipe?.sourceProjection;
  const record = projection?.sourceExecution;
  if (sourceTimerMode(recipe) !== 'automatic' || !record || !sourceTimerState) return null;
  const binding = {
    sourceId: projection.sourceId,
    sourceRevision: projection.sourceRevision,
    sourceConfiguration: projection.sourceConfiguration,
    configurationKey: projection.configurationKey,
    fingerprint: projection.sourceFingerprint || null,
    dose: projection.coffeeGrams,
    ...(sourceTimerBinding || {}),
  };
  const validation = validateManualBrewState(record, sourceTimerState, binding);
  const firstWater = sourceTimerState.events?.['first-water'];
  if (!validation.valid || !Number.isFinite(firstWater)
    || Number.isFinite(sourceTimerState.events?.['extraction:complete'])) return null;
  return firstWater;
}

export async function saveBrewTimingEvent(onSaveTimingEvent, event) {
  if (typeof onSaveTimingEvent !== 'function') return 'ephemeral';
  try {
    const result = await onSaveTimingEvent(event);
    return result?.status || 'ephemeral';
  } catch {
    return 'failed';
  }
}

function buildSourceTimerSteps(recipe) {
  if (sourceTimerMode(recipe) !== 'automatic') return null;
  const stages = sourceTimerDisplayStages(recipe);
  const total = sourceTimerTotalSeconds(recipe);
  const out = [];
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const start = stage?.trigger?.seconds;
    const nextStart = index + 1 < stages.length ? stages[index + 1]?.trigger?.seconds : total;
    if (!Number.isFinite(start) || start < 0 || (index > 0 && start <= out[index - 1].startSeconds)) return null;
    if (index + 1 < stages.length && (!Number.isFinite(nextStart) || nextStart <= start)) return null;
    if (index + 1 === stages.length && Number.isFinite(nextStart)
      && (nextStart < start || (nextStart === start && stage.kind !== 'finish'))) return null;
    const water = stage?.water && Number.isFinite(stage.water.value)
      ? stage.water
      : Number.isFinite(stage?.waterToGrams)
        ? { value: stage.waterToGrams, unit: 'g' }
        : Number.isFinite(stage?.waterToMilliliters)
          ? { value: stage.waterToMilliliters, unit: 'mL' }
          : null;
    out.push({
      index,
      startSeconds: start,
      durationSeconds: Number.isFinite(nextStart) && nextStart > start ? nextStart - start : null,
      openEnded: !Number.isFinite(nextStart) || nextStart === start,
      step: {
        ...stage,
        name: stage.kind === 'pour' ? 'Pour' : stage.kind === 'valve' ? 'Valve' : 'Step',
        action: stage.label,
        ...(water ? { water, waterTotal: water.value, waterUnit: water.unit } : {}),
      },
    });
  }
  return out;
}

// Read-time phase interpretation. It never mutates or persists legacy data.
// Ambiguous records remain viewable but are deliberately timer-disabled.
export function normalizeRecipePhases(recipe) {
  if (!recipe || typeof recipe !== 'object') return null;
  if (recipe.phaseContractVersion === PHASE_CONTRACT_VERSION) {
    return {
      ...recipe,
      prepSteps: Array.isArray(recipe.prepSteps) ? recipe.prepSteps : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps : [],
      postBrewSteps: Array.isArray(recipe.postBrewSteps) ? recipe.postBrewSteps : [],
      phaseContractStatus: 'versioned',
    };
  }
  const rawSteps = Array.isArray(recipe.steps) ? recipe.steps : [];
  if (!rawSteps.length) return { ...recipe, prepSteps: [], postBrewSteps: [], phaseContractStatus: 'ambiguous', timerReady: false };
  // An unambiguous coffee-load step is preparation, even when legacy records
  // stored it at 0:00. Only water-bearing steps belong on the brew clock.
  const firstWaterIndex = rawSteps.findIndex((step) => WATER_ACTION.test(String(step?.action || '')) && Number.isFinite(step?.timeSeconds));
  if (firstWaterIndex < 0) return { ...recipe, prepSteps: [], postBrewSteps: [], phaseContractStatus: 'ambiguous', timerReady: false };
  const firstWaterTime = rawSteps[firstWaterIndex].timeSeconds;
  const prepSteps = rawSteps.slice(0, firstWaterIndex).filter((step) => PREP_ACTION.test(String(step?.action || '')) || !WATER_ACTION.test(String(step?.action || '')));
  const steps = rawSteps.slice(firstWaterIndex).map((step) => {
    const timeSeconds = Math.max(0, step.timeSeconds - firstWaterTime);
    const normalized = {
      ...step,
      timeSeconds,
      time: formatTime(timeSeconds),
      phase: 'brew',
    };
    // Keep downstream identity contracts intact: the timer owns normalized
    // anchors, while consumers still receive the exact stored step object.
    Object.defineProperty(normalized, '__sourceStep', { value: step, enumerable: false });
    return normalized;
  });
  // Legacy records do not declare whether their guide includes setup. Preserve
  // the stored guide by default; only an explicit phase marker authorizes a
  // subtraction. This protects the manual-finish/overtime contract from the
  // historical 4:42-vs-5:10 premature-end failure.
  const total = Number.isFinite(recipe.totalBrewTimeSeconds)
    ? (recipe.legacyTimingIncludesPrep === true
      ? Math.max(1, recipe.totalBrewTimeSeconds - firstWaterTime)
      : recipe.totalBrewTimeSeconds)
    : recipe.totalBrewTimeSeconds;
  const timerReady = recipe.timerReady === true && steps.length > 0 && steps.every((step, index) => index === 0 || step.timeSeconds > steps[index - 1].timeSeconds) && total > steps.at(-1).timeSeconds;
  return {
    ...recipe,
    prepSteps,
    steps,
    postBrewSteps: Array.isArray(recipe.postBrewSteps) ? recipe.postBrewSteps : [],
    totalBrewTimeSeconds: total,
    totalBrewTime: Number.isFinite(total) ? formatTime(total) : recipe.totalBrewTime,
    phaseContractStatus: 'legacy-normalized',
    phaseContractVersion: undefined,
    timerReady,
  };
}

// Pure timer gate shared by the React hook and offline recipe-contract tests.
// A timer may only start when every step has a strict interval and the total
// duration follows the final instruction.
export function buildTimerSteps(recipe) {
  if (sourceProjectionFor(recipe)) return buildSourceTimerSteps(recipe);
  const effective = normalizeRecipePhases(recipe);
  if (!effective?.timerReady) return null;
  const steps = Array.isArray(effective.steps) ? effective.steps : [];
  if (steps.length === 0) return null;
  const total = effective.totalBrewTimeSeconds;
  if (typeof total !== 'number' || total <= 0) return null;
  const out = [];
  for (let i = 0; i < steps.length; i++) {
    const start = steps[i].timeSeconds;
    if (typeof start !== 'number') return null;
    const nextStart = i + 1 < steps.length ? steps[i + 1].timeSeconds : total;
    if (typeof nextStart !== 'number' || nextStart <= start) return null;
    out.push({ index: i, startSeconds: start, durationSeconds: nextStart - start, step: steps[i].__sourceStep || steps[i] });
  }
  return out;
}

// Move a step's wall-clock anchor across one completed active interval.
// Paused time belongs on the anchor too: once the per-step pause accumulator is
// cleared, omitting it here would make the next step appear already elapsed.
export function advanceStepClock(stepStartedAtMs, durationMs, pausedMs = 0) {
  return stepStartedAtMs + durationMs + pausedMs;
}

export function resolveGuideState(globalElapsedMs, totalMs) {
  const safeGlobalElapsedMs = Number.isFinite(globalElapsedMs) ? Math.max(0, globalElapsedMs) : 0;
  const safeTotalMs = Number.isFinite(totalMs) ? Math.max(0, totalMs) : 0;
  return {
    reached: safeTotalMs > 0 && safeGlobalElapsedMs >= safeTotalMs,
    remainingMs: Math.max(0, safeTotalMs - safeGlobalElapsedMs),
    overtimeMs: Math.max(0, safeGlobalElapsedMs - safeTotalMs),
  };
}

// Manual navigation can enter the final instruction before its scheduled
// start. Keep that instruction's remaining time and progress ring anchored to
// the global guide instead of the shortened relative step chain.
export function resolveStepTiming({
  isFinalStep,
  nominalDurationMs,
  totalMs,
  globalElapsedMs,
  stepElapsedMs,
}) {
  const safeStepElapsedMs = Number.isFinite(stepElapsedMs) ? Math.max(0, stepElapsedMs) : 0;
  if (!isFinalStep) {
    const durationMs = Number.isFinite(nominalDurationMs) ? Math.max(1, nominalDurationMs) : 1;
    return {
      durationMs,
      remainingMs: Math.max(0, durationMs - safeStepElapsedMs),
    };
  }
  const { remainingMs } = resolveGuideState(globalElapsedMs, totalMs);
  return {
    durationMs: Math.max(1, safeStepElapsedMs + remainingMs),
    remainingMs,
  };
}
