import { generateV60Recipe, generateV60Fallback } from './v60Adapter.js';
import { generateV60IcedRecipe, generateV60IcedFallback } from './v60IcedAdapter.js';
import { generateV60SwitchRecipe, generateV60SwitchFallback } from './v60SwitchAdapter.js';

// Deterministic cutover boundary. Callers may inject generators in tests, but
// production never falls through to the legacy GPT generator after both paths
// fail.
//
// Variant routing: `variant` (or `configuration.variant`) selects the Switch
// adapter when 'switch'; anything else — including omission — keeps the
// classic V60 path byte-identical to before the Switch variant existed. This
// is the only change v60Generation.js makes for the Switch slice (U2); the
// classic adapter and its call signature (intent, configuration, evidence)
// are untouched.
export function generateV60HotWithFallback({
  intent = {}, configuration = {}, evidence = null, variant,
  candidateGenerator, fallbackGenerator,
} = {}) {
  const resolvedVariant = variant || configuration.variant || 'classic';
  const isSwitch = resolvedVariant === 'switch';
  const candidate = candidateGenerator || (isSwitch ? generateV60SwitchRecipe : generateV60Recipe);
  const fallback = fallbackGenerator || (isSwitch ? generateV60SwitchFallback : generateV60Fallback);
  try {
    const recipe = isSwitch ? candidate(intent, configuration) : candidate(intent, configuration, evidence);
    return { recipe, error: null, usedFallback: false };
  } catch (candidateError) {
    try {
      return { recipe: fallback(configuration, candidateError?.message || 'candidate-failed'), error: candidateError, usedFallback: true };
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

// Switch dose bounds (15-30g) differ from classic V60 (12-30g) — see
// docs/data/v60SwitchConfiguration.js. Callers routing a Switch request
// should clamp against this instead of v60DoseForRequest.
export function v60SwitchDoseForRequest(value, fallback = 20) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(15, Math.min(30, numeric));
}

export function isDeterministicV60Switch(recipe) {
  return recipe?.candidate === true && recipe?.device === 'v60' && recipe?.mode === 'hot' && recipe?.variant === 'switch';
}
