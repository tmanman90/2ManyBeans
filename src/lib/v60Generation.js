import { generateV60Recipe, generateV60Fallback } from './v60Adapter.js';
import { generateV60IcedRecipe, generateV60IcedFallback } from './v60IcedAdapter.js';

// Deterministic cutover boundary. Callers may inject generators in tests, but
// production never falls through to the legacy GPT generator after both paths
// fail.
export function generateV60HotWithFallback({ intent = {}, configuration = {}, evidence = null, candidateGenerator = generateV60Recipe, fallbackGenerator = generateV60Fallback } = {}) {
  try {
    return { recipe: candidateGenerator(intent, configuration, evidence), error: null, usedFallback: false };
  } catch (candidateError) {
    try {
      return { recipe: fallbackGenerator(configuration, candidateError?.message || 'candidate-failed'), error: candidateError, usedFallback: true };
    } catch (fallbackError) {
      return { recipe: null, error: fallbackError, candidateError, usedFallback: true };
    }
  }
}

export function generateV60IcedWithFallback({ intent = {}, configuration = {}, candidateGenerator = generateV60IcedRecipe, fallbackGenerator = generateV60IcedFallback } = {}) {
  try {
    return { recipe: candidateGenerator(intent, configuration), error: null, usedFallback: false };
  } catch (candidateError) {
    try {
      return { recipe: fallbackGenerator(configuration, candidateError?.message || 'iced-candidate-failed'), error: candidateError, usedFallback: true };
    } catch (fallbackError) {
      return { recipe: null, error: fallbackError, candidateError, usedFallback: true };
    }
  }
}

export function v60DoseForRequest(value, fallback = 15) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(12, Math.min(30, numeric));
}

export function isDeterministicV60Hot(recipe) {
  return recipe?.candidate === true && recipe?.device === 'v60' && recipe?.mode === 'hot';
}
