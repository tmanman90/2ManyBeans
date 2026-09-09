// Canonical, side-effect-free recipe projections for Ruphus previews.
//
// A preview is an executable recipe projection, not a saved-recipe mutation.
// The caller supplies the trusted base recipe and an explicit target dose;
// this module validates the source, derives every water quantity together,
// and fails closed when the route cannot preserve its timing contract.

import { generateKalitaRecipe } from '../kalitaAdapter.js';
import { generateV60SwitchRecipe } from '../v60SwitchAdapter.js';
import { generateV60IcedRecipe } from '../v60IcedAdapter.js';
import { generateKalitaIcedRecipe } from '../kalitaIcedAdapter.js';
import { kalitaDoseBounds } from '../../data/kalitaConfiguration.js';
import { V60_SWITCH_DOSE_BOUNDS, V60_SWITCH_WATER_CAP_GRAMS } from '../../data/v60SwitchConfiguration.js';

export const RECIPE_PREVIEW_VERSION = 'ruphus-recipe-preview-v1';
export const RECIPE_PREVIEW_TIMING_POLICY = 'preserve-source-timing-v1';

const V60_BOUNDS = Object.freeze({ minDose: 12, maxDose: 30 });

export class RecipePreviewError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RecipePreviewError';
    this.code = code;
    this.details = details;
  }
}

const finitePositive = (value) => Number.isFinite(value) && value > 0;
const roundGrams = (value) => Math.round(value);

function ratioNumber(value) {
  if (typeof value === 'number') return finitePositive(value) ? value : null;
  if (value == null) return null;
  const match = String(value).trim().match(/^(?:1\s*:\s*)?(\d+(?:\.\d+)?)(?:\s*(?:to|-|–)\s*\d+(?:\.\d+)?)?$/i);
  if (!match) return null;
  const ratio = Number(match[1]);
  return finitePositive(ratio) ? ratio : null;
}

function ratioLabel(value) {
  const ratio = ratioNumber(value);
  if (ratio == null) return null;
  return `1:${Math.round(ratio * 100) / 100}`;
}

function routeFor(recipe) {
  if (recipe?.device === 'kalita' && recipe?.mode === 'hot' && recipe?.isIced !== true) return 'kalita-hot';
  if (recipe?.device === 'v60' && recipe?.variant === 'switch' && recipe?.mode === 'hot' && recipe?.isIced !== true) return 'v60-switch-hot';
  if (recipe?.device === 'v60' && recipe?.mode === 'hot' && recipe?.isIced !== true) return 'v60-hot';
  if (recipe?.device === 'kalita' && recipe?.mode === 'iced' && recipe?.isIced === true) return 'kalita-iced';
  if (recipe?.device === 'v60' && recipe?.mode === 'iced' && recipe?.isIced === true) return 'v60-iced';
  return null;
}

function doseBounds(recipe, route) {
  if (route === 'kalita-hot' || route === 'kalita-iced') return kalitaDoseBounds(recipe.kalitaSize);
  if (route === 'v60-switch-hot') return V60_SWITCH_DOSE_BOUNDS;
  return V60_BOUNDS;
}

function profileFor(recipe, route, dose) {
  if (route === 'v60-hot') return dose <= 18 ? 'small-12-18' : dose <= 24 ? 'medium-19-24' : 'large-25-30';
  if (route === 'kalita-hot') return dose > 30 ? 'large-185' : recipe.kalitaSize === '155' ? (dose > 18 ? '155-extended' : '155-small') : dose <= 22 ? '185-standard' : '185-large';
  if (route === 'kalita-iced') return recipe.kalitaSize === '155' ? 'wave-155-12-20' : dose > 30 ? 'wave-185-31-36' : 'wave-185-15-30';
  if (route === 'v60-switch-hot') return 'switch-15-30';
  return 'v60-iced-12-30';
}

function actionGrams(action, doseFactor, waterFactor = doseFactor) {
  if (typeof action !== 'string') return action;
  return action.replace(/(?<![\w.])(\d+(?:\.\d+)?)(\s*)(grams?|g)\b/gi, (match, quantity, spacing, unit, offset, source) => {
    const grams = Number(quantity);
    if (!finitePositive(grams)) return match;
    const context = `${source.slice(Math.max(0, offset - 18), offset)} ${source.slice(offset + match.length, offset + match.length + 18)}`;
    const factor = /coffee|grounds?|dose/i.test(context) ? doseFactor : waterFactor;
    return `${roundGrams(grams * factor)}${spacing}${unit}`;
  });
}

function mapSteps(steps, waterFactor, doseFactor, finalWater) {
  return steps.map((step, index) => {
    if (!step || typeof step !== 'object') return step;
    const result = { ...step };
    if (typeof step.action === 'string') result.action = actionGrams(step.action, doseFactor, waterFactor);
    if (Number.isFinite(step.waterTotal)) {
      result.waterTotal = index === steps.length - 1 ? finalWater : roundGrams(step.waterTotal * waterFactor);
    }
    return result;
  });
}

function mapTextSteps(steps, doseFactor, waterFactor = doseFactor) {
  if (!Array.isArray(steps)) return steps;
  return steps.map((step) => {
    if (!step || typeof step !== 'object') return step;
    return typeof step.action === 'string' ? { ...step, action: actionGrams(step.action, doseFactor, waterFactor) } : { ...step };
  });
}

function validateSource(recipe, route) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object') errors.push('missing-recipe');
  if (!route) errors.push('unsupported-route');
  if (!finitePositive(recipe?.coffeeGrams)) errors.push('invalid-base-dose');
  if (ratioNumber(recipe?.ratio) == null && ratioNumber(recipe?.finalBeverageRatio) == null) errors.push('missing-ratio');
  if (recipe?.timerReady !== true) errors.push('not-timer-ready');
  if (!Array.isArray(recipe?.steps) || recipe.steps.length === 0) errors.push('missing-timed-steps');
  let lastTime = -1;
  let lastWater = -1;
  for (const step of recipe?.steps || []) {
    if (!finitePositive(step?.timeSeconds) && step?.timeSeconds !== 0) errors.push('invalid-step-time');
    if (Number.isFinite(step?.timeSeconds) && step.timeSeconds <= lastTime) errors.push('non-ascending-step-time');
    if (!finitePositive(step?.waterTotal) || step.waterTotal < lastWater) errors.push('invalid-step-water');
    lastTime = step?.timeSeconds;
    lastWater = step?.waterTotal;
  }
  const finalWater = route?.endsWith('iced') ? recipe?.hotWaterGrams : recipe?.waterGrams;
  if (!finitePositive(finalWater) || lastWater !== finalWater) errors.push('final-water-mismatch');
  const finish = recipe?.guideTargetSeconds ?? recipe?.totalBrewTimeSeconds;
  if (!finitePositive(finish) || finish <= lastTime) errors.push('invalid-guide-duration');
  if (route?.endsWith('iced')) {
    const ice = recipe?.initialBrewIceGrams ?? recipe?.recipeIceGrams ?? recipe?.iceGrams;
    if (!finitePositive(recipe?.hotWaterGrams) || !finitePositive(ice)) errors.push('incomplete-ice-accounting');
    if (recipe?.device === 'v60' && !finitePositive(recipe?.finalBeverageWaterTargetGrams)) errors.push('missing-final-beverage-target');
    if (recipe?.device === 'kalita' && recipe?.requiresCompleteMelt === true && !finitePositive(recipe?.finalBeverageWaterTargetGrams)) errors.push('missing-final-beverage-target');
  }
  return errors;
}

function baseRatio(recipe, route) {
  return ratioNumber(route.endsWith('iced') ? (recipe.finalBeverageRatio || recipe.ratio) : recipe.ratio);
}

function derivedIntent(recipe, route, options) {
  const supplied = options.intent && typeof options.intent === 'object' ? options.intent : {};
  const intent = { ...supplied };
  if (intent.targetRatio == null) intent.targetRatio = baseRatio(recipe, route);
  if (intent.targetTemperatureC == null && Number.isFinite(recipe?.waterTemp?.celsius)) intent.targetTemperatureC = recipe.waterTemp.celsius;
  if (intent.techniquePreference == null && route === 'kalita-hot' && typeof recipe.technique === 'string') intent.techniquePreference = recipe.technique;
  if (intent.reasonCodes == null && Array.isArray(recipe.reasonCodes)) intent.reasonCodes = [...recipe.reasonCodes];
  if (intent.confidence == null && recipe.confidence != null) intent.confidence = recipe.confidence;
  return intent;
}

function regeneratedPreview(recipe, route, dose, ratio, options) {
  const intent = derivedIntent(recipe, route, options);
  if (ratio != null) intent.targetRatio = ratio;
  const configuration = { ...(options.configuration || {}), dose };
  if (route === 'kalita-hot') {
    configuration.size = configuration.size || recipe.kalitaSize;
    const generated = generateKalitaRecipe(intent, configuration);
    if (generated.technique !== recipe.technique || generated.kalitaSize !== recipe.kalitaSize) {
      throw new RecipePreviewError('technique-conflict', 'This dose requires a different Kalita technique or size; review it explicitly before continuing.', { previousTechnique: recipe.technique, nextTechnique: generated.technique });
    }
    if (!options.configuration?.grinder && recipe.grindSize) generated.grindSize = structuredClone(recipe.grindSize);
    return generated;
  }
  if (route === 'v60-switch-hot') {
    configuration.roast = configuration.roast || recipe.roastPreset;
    configuration.process = configuration.process || recipe.process;
    const generated = generateV60SwitchRecipe(intent, configuration);
    if (generated.technique !== recipe.technique || generated.roastPreset !== recipe.roastPreset) {
      throw new RecipePreviewError('technique-conflict', 'This dose requires a different V60 Switch technique profile; review it explicitly before continuing.');
    }
    if (!options.configuration?.grinder && recipe.grindSize) generated.grindSize = structuredClone(recipe.grindSize);
    return generated;
  }
  if (route === 'v60-iced') return generateV60IcedRecipe(intent, configuration);
  if (route === 'kalita-iced') {
    configuration.size = configuration.size || recipe.kalitaSize;
    configuration.chillingMethod = configuration.chillingMethod || recipe.chillingMethod;
    return generateKalitaIcedRecipe(intent, configuration);
  }
  return null;
}

function annotate(recipe, base, dose, ratio, route, regenerated = false) {
  const baseRatioValue = baseRatio(base, route);
  return {
    ...recipe,
    ratioIntent: {
      targetRatio: ratio,
      baseRatio: baseRatioValue,
      source: ratio === baseRatioValue ? 'source-recipe' : 'requested',
      exampleDose: dose,
      exampleWaterGrams: route.endsWith('iced') ? recipe.finalBeverageWaterTargetGrams : recipe.waterGrams,
    },
    recipePreview: {
      version: RECIPE_PREVIEW_VERSION,
      timingPolicy: regenerated ? recipe.doseTimingPolicy || RECIPE_PREVIEW_TIMING_POLICY : RECIPE_PREVIEW_TIMING_POLICY,
      baseDose: base.coffeeGrams,
      requestedDose: dose,
      route,
      regenerated,
      sourceLineage: base.sourceLineage || null,
    },
  };
}

export function validateRecipePreview(recipe, options = {}) {
  const route = routeFor(recipe);
  const errors = validateSource(recipe, route);
  const requestedDose = options.dose ?? options.requestedDose;
  if (!finitePositive(Number(requestedDose))) errors.push('invalid-requested-dose');
  const dose = Number(requestedDose);
  const bounds = route ? doseBounds(recipe, route) : null;
  if (bounds && finitePositive(dose) && (dose < bounds.minDose || dose > bounds.maxDose)) errors.push('unsupported-dose');
  const suppliedRatio = options.targetRatio ?? options.ratio;
  const ratio = suppliedRatio == null ? baseRatio(recipe, route || '') : ratioNumber(suppliedRatio);
  if (ratio == null) errors.push('invalid-target-ratio');
  if (route === 'v60-switch-hot' && finitePositive(dose) && finitePositive(ratio) && dose * ratio > V60_SWITCH_WATER_CAP_GRAMS) errors.push('water-cap-conflict');
  return { valid: errors.length === 0, errors, route, dose, ratio, bounds };
}

export function createRecipePreview({ recipe, dose, requestedDose, ratio, targetRatio, intent = {}, configuration = {}, allowIced = true } = {}) {
  const requested = dose ?? requestedDose;
  const route = routeFor(recipe);
  if (!allowIced && route?.endsWith('iced')) throw new RecipePreviewError('iced-preview-disabled', 'This iced route is kept read-only until its complete water and ice contract is enabled.');
  const checked = validateRecipePreview(recipe, { dose: requested, ratio, targetRatio });
  if (!checked.valid) throw new RecipePreviewError(checked.errors[0], `Recipe preview is unavailable: ${checked.errors.join(', ')}.`, checked);
  const targetDose = checked.dose;
  const targetRatioValue = checked.ratio;
  const sourceProfile = profileFor(recipe, route, recipe.coffeeGrams);
  const targetProfile = profileFor(recipe, route, targetDose);
  const profileChanged = sourceProfile !== targetProfile;
  const canRegenerate = route === 'kalita-hot' || route === 'v60-switch-hot' || route.endsWith('iced');
  if (profileChanged && !canRegenerate) {
    throw new RecipePreviewError('unsupported-dose-profile', 'This dose crosses a source profile boundary; the app needs an explicit recipe configuration before it can prepare a safe preview.', { sourceProfile, targetProfile });
  }
  if (profileChanged || (canRegenerate && optionsRequireRegeneration({ intent, configuration }))) {
    const regenerated = regeneratedPreview(recipe, route, targetDose, targetRatioValue, { intent, configuration });
    return annotate(regenerated, recipe, targetDose, targetRatioValue, route, true);
  }
  const baseWater = route.endsWith('iced') ? recipe.hotWaterGrams : recipe.waterGrams;
  const targetTotalWater = roundGrams(targetDose * targetRatioValue);
  const doseFactor = targetDose / recipe.coffeeGrams;
  const sourceTotalWater = route.endsWith('iced')
    ? (recipe.finalBeverageWaterTargetGrams || recipe.hotWaterGrams + (recipe.initialBrewIceGrams ?? recipe.recipeIceGrams ?? recipe.iceGrams))
    : null;
  const targetHotWater = route.endsWith('iced')
    ? roundGrams(targetTotalWater * (recipe.hotWaterGrams / sourceTotalWater))
    : targetTotalWater;
  const waterFactor = targetHotWater / baseWater;
  if (!finitePositive(baseWater) || !finitePositive(waterFactor)) throw new RecipePreviewError('invalid-base-water', 'The source recipe has no executable water total.');
  let preview = {
    ...recipe,
    coffeeGrams: targetDose,
    waterGrams: targetHotWater,
    ratio: ratioLabel(targetRatioValue),
    prepSteps: mapTextSteps(recipe.prepSteps, doseFactor, waterFactor),
    steps: mapSteps(recipe.steps, waterFactor, doseFactor, targetHotWater),
  };
  if (route.endsWith('iced')) {
    const targetIce = targetTotalWater - preview.waterGrams;
    preview = {
      ...preview,
      hotWaterGrams: preview.waterGrams,
      initialBrewIceGrams: recipe.initialBrewIceGrams == null ? null : targetIce,
      recipeIceGrams: recipe.recipeIceGrams == null ? undefined : targetIce,
      iceGrams: targetIce,
      postBrewIceGrams: recipe.postBrewIceGrams == null ? null : targetIce,
      finalBeverageWaterTargetGrams: targetTotalWater,
      finalBeverageRatio: ratioLabel(targetRatioValue),
      hotExtractionRatio: `1:${Math.round((preview.waterGrams / targetDose) * 100) / 100}`,
      postBrewSteps: mapTextSteps(recipe.postBrewSteps, doseFactor, targetIce / (recipe.initialBrewIceGrams ?? recipe.recipeIceGrams ?? recipe.iceGrams)),
      _previewSourceTotalWater: sourceTotalWater,
    };
  }
  delete preview._previewSourceTotalWater;
  return annotate(preview, recipe, targetDose, targetRatioValue, route);
}

function optionsRequireRegeneration({ intent, configuration }) {
  return Boolean(configuration && Object.keys(configuration).some((key) => key !== 'dose') || intent && Object.keys(intent).some((key) => key !== 'targetRatio'));
}

export const projectRecipePreview = createRecipePreview;
export const previewRecipeAtDose = ({ recipe, dose, ...options } = {}) => createRecipePreview({ recipe, dose, ...options });
