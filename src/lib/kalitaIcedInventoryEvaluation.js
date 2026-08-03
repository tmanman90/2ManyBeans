import { normalizeRecipeEvidence } from './recipeEvidence.js';
import { buildExtractionIntent } from './extractionIntent.js';
import { generateKalitaIcedRecipe, validateKalitaIcedCandidate } from './kalitaIcedAdapter.js';

export const KALITA_ICED_EVALUATION_CONFIGURATIONS = Object.freeze([
  Object.freeze({ size: '155', dose: 15, grinder: 'fellow-ode-gen2' }),
  Object.freeze({ size: '155', dose: 20, grinder: 'fellow-ode-gen2' }),
  Object.freeze({ size: '185', dose: 20, grinder: 'fellow-ode-gen2' }),
  Object.freeze({ size: '185', dose: 33, grinder: 'fellow-ode-gen2' }),
]);

export function evaluateKalitaIcedBean(bean = {}, configurations = KALITA_ICED_EVALUATION_CONFIGURATIONS) {
  const evidence = normalizeRecipeEvidence(bean, bean.beanResearch || null);
  const intent = buildExtractionIntent(evidence);
  return configurations.map((configuration) => {
    const recipe = generateKalitaIcedRecipe(intent, configuration);
    return {
      configuration: `${configuration.size}:${configuration.dose}g`,
      technique: recipe.technique,
      valid: validateKalitaIcedCandidate(recipe).valid,
      personalizationApplied: recipe.personalizationApplied,
      reasonCodes: recipe.reasonCodes,
    };
  });
}

export function evaluateAndRedactKalitaIcedInventory(beans = []) {
  if (!Array.isArray(beans)) throw new TypeError('beans must be an array');
  if (!beans.length) throw new Error('zero beans read; live inventory gate remains open');
  const evaluations = beans.flatMap((bean) => evaluateKalitaIcedBean(bean));
  const configurations = [...new Set(evaluations.map((entry) => entry.configuration))].sort();
  const techniques = [...new Set(evaluations.map((entry) => entry.technique))].sort();
  const requiredConfigurations = KALITA_ICED_EVALUATION_CONFIGURATIONS.map((configuration) => `${configuration.size}:${configuration.dose}g`).sort();
  if (requiredConfigurations.some((configuration) => !configurations.includes(configuration))) {
    throw new Error('inventory evaluation did not cover both Wave sizes and required doses');
  }
  return {
    beanCount: beans.length,
    recipeCount: evaluations.length,
    allValid: evaluations.every((entry) => entry.valid),
    configurations,
    techniques,
    personalizedRecipeCount: evaluations.filter((entry) => entry.personalizationApplied).length,
    reasonCodeCounts: evaluations.flatMap((entry) => entry.reasonCodes || []).reduce((counts, code) => ({ ...counts, [code]: (counts[code] || 0) + 1 }), {}),
  };
}
