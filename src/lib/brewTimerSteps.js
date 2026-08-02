// Pure timer gate shared by the React hook and offline recipe-contract tests.
// A timer may only start when every step has a strict interval and the total
// duration follows the final instruction.
export function buildTimerSteps(recipe) {
  if (!recipe?.timerReady) return null;
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  if (steps.length === 0) return null;
  const total = recipe.totalBrewTimeSeconds;
  if (typeof total !== 'number' || total <= 0) return null;
  const out = [];
  for (let i = 0; i < steps.length; i++) {
    const start = steps[i].timeSeconds;
    if (typeof start !== 'number') return null;
    const nextStart = i + 1 < steps.length ? steps[i + 1].timeSeconds : total;
    if (typeof nextStart !== 'number' || nextStart <= start) return null;
    out.push({ index: i, startSeconds: start, durationSeconds: nextStart - start, step: steps[i] });
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
