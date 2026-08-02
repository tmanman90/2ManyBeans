import { normalizeRecipeEvidence } from './recipeEvidence.js';
import { buildExtractionIntent } from './extractionIntent.js';
import { generateV60Recipe, validateV60Candidate } from './v60Adapter.js';
import { generateV60IcedRecipe, validateV60IcedCandidate } from './v60IcedAdapter.js';

export const DEFAULT_V60_DOSE_GRAMS = 15;
export const DEFAULT_V60_GRINDER = 'fellow-ode-gen2';

export function resolveV60Configuration(bean = {}) {
  const saved = bean.handBrewRecipes?.v60 || bean.handBrewRecipe || {};
  const rawDose = bean.userCoffeeGrams ?? saved.userCoffeeGrams ?? bean.v60Dose;
  const parsedDose = Number(rawDose);
  const dose = Number.isFinite(parsedDose) && parsedDose >= 12 && parsedDose <= 30
    ? parsedDose
    : DEFAULT_V60_DOSE_GRAMS;
  const grinder = bean.grinder || saved.grinder || bean.v60Grinder || DEFAULT_V60_GRINDER;
  return { dose, grinder: String(grinder || DEFAULT_V60_GRINDER), configurationKey: 'v60:02:standard-paper' };
}

export function evaluateV60Bean(bean = {}) {
  const configuration = resolveV60Configuration(bean);
  const evidence = normalizeRecipeEvidence(bean, bean.beanResearch || null);
  const intent = buildExtractionIntent(evidence);
  const hot = generateV60Recipe(intent, configuration, evidence);
  const iced = generateV60IcedRecipe(intent, configuration);
  return {
    dose: configuration.dose,
    grinder: configuration.grinder,
    hot: { technique: hot.technique, valid: validateV60Candidate(hot).valid, reasonCodes: hot.reasonCodes },
    iced: { technique: iced.technique, valid: validateV60IcedCandidate(iced).valid, reasonCodes: iced.reasonCodes },
  };
}

export function redactV60Evaluation(result = {}) {
  return {
    dose: result.dose,
    grinder: result.grinder,
    hot: result.hot ? { technique: result.hot.technique, valid: result.hot.valid, reasonCodes: result.hot.reasonCodes } : null,
    iced: result.iced ? { technique: result.iced.technique, valid: result.iced.valid, reasonCodes: result.iced.reasonCodes } : null,
  };
}

export function evaluateAndRedactBeans(beans = []) {
  if (!Array.isArray(beans)) throw new TypeError('beans must be an array');
  return beans.map((bean) => redactV60Evaluation(evaluateV60Bean(bean)));
}
