import { generateKalitaIcedFallback, generateKalitaIcedRecipe } from './kalitaIcedAdapter.js';

export function generateKalitaIcedWithFallback({
  intent = {},
  configuration = {},
  candidateGenerator = generateKalitaIcedRecipe,
  fallbackGenerator = generateKalitaIcedFallback,
} = {}) {
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
