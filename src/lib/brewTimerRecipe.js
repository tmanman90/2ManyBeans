import { scaleRecipeForDose } from './recipeScaling.js';

// A started attempt owns its immutable server snapshot. Ordinary recipe
// presentation may still use the saved bean dose, but an attempt must never
// rescale its timer back to that bean state.
export function timerRecipeForMode({ recipe, attemptId = null, effectiveDose } = {}) {
  return attemptId ? recipe : scaleRecipeForDose(recipe, effectiveDose);
}
