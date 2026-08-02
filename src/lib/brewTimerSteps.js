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
