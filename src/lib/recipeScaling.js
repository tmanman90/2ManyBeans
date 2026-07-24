// Pure helpers for rescaling a hand-brew recipe when the user adjusts the
// coffee dose. No React, no Firestore, no side effects — fully testable.
//
// The stored recipe from GPT is treated as pristine. We never mutate the
// original object; `scaleRecipeForDose` returns a shallow-cloned recipe with
// rescaled numbers for display. The BrewTimer and HandBrewModal both render
// from this derived recipe so they stay in sync.

// Extract the numeric divisor from a ratio string.
// Accepts:
//   "1:16"             → 16
//   "1:15.75"          → 15.75
//   "1:15.5 to 1:16"   → 15.5  (first numeric)
//   "1:15.5-1:16"      → 15.5  (first numeric)
//   "1: 15.5"          → 15.5
// Rejects (returns null):
//   null, undefined, "", "garbage", "15:75" (no leading "1:")
export function parseRatioDivisor(ratioStr) {
  if (ratioStr == null) return null;
  const s = String(ratioStr).trim();
  if (!s) return null;
  // Match "1:<number>" — the coffee part must be exactly "1" to avoid
  // misparsing "15:75" or similar.
  const match = s.match(/(?<!\d)1\s*:\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const divisor = parseFloat(match[1]);
  if (isNaN(divisor) || divisor <= 0) return null;
  return divisor;
}

// Scale positive integer or decimal quantities followed by a whole gram-unit
// token. Preserve the generated copy's original whitespace and unit spelling.
function scaleActionGrams(action, scaleFactor) {
  if (typeof action !== 'string') return action;
  return action.replace(
    /(?<![\w.])(\d+(?:\.\d+)?)(\s*)(grams?|g)\b/gi,
    (match, quantity, spacing, unit, offset, source) => {
      if (
        source[offset - 1] === '-'
        && !/(?:^|[^\w.-])\d+(?:\.\d+)?\s*(?:grams?|g)$/i.test(source.slice(0, offset - 1))
      ) {
        return match;
      }
      const grams = Number(quantity);
      if (grams <= 0) return match;
      return `${Math.round(grams * scaleFactor)}${spacing}${unit}`;
    }
  );
}

// Return a new recipe object with coffeeGrams / waterGrams /
// steps[n].waterTotal and explicit gram quantities in step actions scaled for
// `newDose`. Everything else (steps[n].time, grind, temp, technique,
// totalBrewTime, totalBrewTimeSeconds, timerReady) is copied through unchanged.
//
// Rounding: nearest whole gram for water and every step's waterTotal.
// Fractional grams never escape this function.
//
// Idempotent fallback: if `newDose` is null/undefined or equal to the current
// dose, or if the ratio can't be parsed, returns the recipe unchanged.
// Never throws.
export function scaleRecipeForDose(recipe, newDose) {
  if (!recipe) return recipe;
  if (newDose == null) return recipe;
  if (typeof newDose !== 'number' || !isFinite(newDose) || newDose <= 0) return recipe;

  const originalDose = recipe.coffeeGrams;
  if (typeof originalDose !== 'number' || originalDose <= 0) return recipe;
  if (newDose === originalDose) return recipe;

  const divisor = parseRatioDivisor(recipe.ratio);
  if (divisor == null) return recipe;

  const scaleFactor = newDose / originalDose;
  const newWaterGrams = Math.round(newDose * divisor);

  const newSteps = Array.isArray(recipe.steps)
    ? recipe.steps.map((step) => {
        if (step == null) return step;
        const scaledStep = { ...step };
        if (typeof step.action === 'string') {
          scaledStep.action = scaleActionGrams(step.action, scaleFactor);
        }
        if (typeof step.waterTotal === 'number') {
          scaledStep.waterTotal = Math.round(step.waterTotal * scaleFactor);
        }
        return scaledStep;
      })
    : recipe.steps;

  return {
    ...recipe,
    coffeeGrams: newDose,
    waterGrams: newWaterGrams,
    steps: newSteps,
    iceGrams: typeof recipe.iceGrams === 'number'
      ? Math.round(recipe.iceGrams * scaleFactor)
      : undefined,
  };
}
