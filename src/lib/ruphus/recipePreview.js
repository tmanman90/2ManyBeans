// Canonical, side-effect-free recipe projections for Ruphus previews.
//
// A preview is an executable recipe projection, not a saved-recipe mutation.
// The caller supplies the trusted base recipe and an explicit target dose;
// this module validates the source, derives every water quantity together,
// and fails closed when the route cannot preserve its timing contract.

import { generateKalitaRecipe } from '../kalitaAdapter.js';
import { generateV60RecipeForTechnique } from '../v60Adapter.js';
import { generateV60SwitchRecipe } from '../v60SwitchAdapter.js';
import { generateV60IcedRecipe } from '../v60IcedAdapter.js';
import { generateKalitaIcedRecipe } from '../kalitaIcedAdapter.js';
import { kalitaDoseBounds } from '../../data/kalitaConfiguration.js';
import { V60_SWITCH_DOSE_BOUNDS, V60_SWITCH_WATER_CAP_GRAMS } from '../../data/v60SwitchConfiguration.js';
import { hasManualSourceProjection, isManualSourceRecipe, validateManualSourceRecipeSnapshot } from './contracts.js';
import { MANUAL_SOURCE_PROJECTION_VERSION } from '../manualSourceProjection.js';
import {
  MANUAL_SOURCE_DOSE_POLICY_VERSION,
  adaptedDoseBounds,
  projectManualSourceForApp,
  recipeFromManualSourceProjection,
} from './techniqueOptions.js';
import {
  descriptorForMicrons,
  grinderSettingToMicrons,
  isOdeStep,
  nearestOdeStep,
} from '../brewMethods.js';

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

// A legacy recipe can contain a decimal-looking Ode value that was accepted
// before the physical-click contract existed. Normalize that value only in
// the derived preview. The caller must supply the trusted grinder identity;
// a qualitative source grind or another grinder remains source-exact.
export function normalizePreviewGrind(recipe, { grinder = null } = {}) {
  const setting = recipe?.grindSize?.setting;
  const numericSetting = typeof setting === 'number'
    ? setting
    : typeof setting === 'string' && setting.trim() !== '' ? Number(setting) : NaN;
  if (grinder !== 'fellow-ode-gen2' || recipe?.grindSize?.sourceExact === true
    || !Number.isFinite(numericSetting) || numericSetting <= 0 || numericSetting > 11 || isOdeStep(setting)) {
    return { recipe, normalization: null };
  }
  const physicalSetting = nearestOdeStep(numericSetting);
  const microns = grinderSettingToMicrons(physicalSetting, grinder);
  return {
    recipe: {
      ...recipe,
      grindSize: {
        ...recipe.grindSize,
        setting: String(physicalSetting),
        microns,
        description: descriptorForMicrons(microns),
      },
    },
    normalization: {
      grinder,
      from: String(setting),
      to: String(physicalSetting),
      microns,
      reason: 'nearest physical Ode Gen 2 click',
    },
  };
}

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

function recognizedV60Source(recipe) {
  if (!recipe?.sourceLineage?.technique || !Array.isArray(recipe.sourceLineage.sourceIds) || !recipe.sourceLineage.sourceIds[0]) return null;
  const techniqueId = recipe.sourceLineage.technique;
  const sourceId = recipe.sourceLineage.sourceIds[0];
  if (recipe.sourceLineage.configurationKey !== recipe.configurationKey
    || recipe.sourceLineage.method !== 'v60'
    || recipe.sourceLineage.mode !== 'hot') return null;
  try {
    const generated = generateV60RecipeForTechnique(techniqueId, {
      targetRatio: ratioNumber(recipe.ratio),
    }, {
      dose: recipe.coffeeGrams,
      configurationKey: recipe.configurationKey,
      v60Size: recipe.v60Size,
    });
    const sameTimerContract = generated.timerReady === true
      && (!recipe.timingProfile || recipe.timingProfile === generated.timingProfile);
    if (generated.technique !== techniqueId
      || generated.configurationKey !== recipe.configurationKey
      || generated.v60Size !== recipe.v60Size
      || generated.sourceLineage?.sourceIds?.[0] !== sourceId
      || !sameTimerContract) return null;
    // A prior same-profile ratio/dose preview legitimately rewrites the gram
    // amounts in every step. Compare the executable shape and normalized
    // water distribution, not those expected scale effects, while still
    // rejecting a changed cadence, action, or materially different pour split.
    const actionShape = (value) => typeof value === 'string'
      ? value.replace(/\b\d+(?:\.\d+)?\s*(?:grams?|g)\b/gi, '<grams>')
      : value;
    const scheduleShape = (steps) => (Array.isArray(steps) ? steps : []).map((step) => ({
      timeSeconds: step?.timeSeconds,
      action: actionShape(step?.action),
      name: step?.name,
      phase: step?.phase,
    }));
    const scheduleWaterShape = (steps) => {
      const values = (Array.isArray(steps) ? steps : []).map((step) => Number(step?.waterTotal));
      const final = values.at(-1);
      return finitePositive(final) ? values.map((value) => value / final) : [];
    };
    const actualShape = scheduleShape(recipe.steps);
    const generatedShape = scheduleShape(generated.steps);
    const actualWaterShape = scheduleWaterShape(recipe.steps);
    const generatedWaterShape = scheduleWaterShape(generated.steps);
    const sameWaterShape = actualWaterShape.length === generatedWaterShape.length
      && actualWaterShape.length > 0
      && actualWaterShape.every((value, index) => Math.abs(value - generatedWaterShape[index]) <= 0.015);
    const customizedSchedule = JSON.stringify(actualShape) !== JSON.stringify(generatedShape) || !sameWaterShape;
    return { techniqueId, sourceId, customizedSchedule };
  } catch {
    return null;
  }
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

function reconcileGeneratedRatio(recipe, ratio) {
  const targetWater = roundGrams(recipe.coffeeGrams * ratio);
  if (targetWater === recipe.waterGrams) return recipe;
  const waterFactor = targetWater / recipe.waterGrams;
  return {
    ...recipe,
    waterGrams: targetWater,
    ratio: ratioLabel(ratio),
    steps: mapSteps(recipe.steps || [], waterFactor, 1, targetWater),
  };
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

function validateManualSourcePreview(recipe, options = {}) {
  const errors = [];
  const route = routeFor(recipe);
  const contract = validateManualSourceRecipeSnapshot(recipe);
  if (!contract.valid) errors.push(...contract.errors);
  if (!route) errors.push('unsupported-source-route');
  if (recipe?.sourceProjection?.projectionVersion !== MANUAL_SOURCE_PROJECTION_VERSION) errors.push('invalid-source-projection-version');
  if (recipe?.timerReady !== true) errors.push('not-timer-ready');
  const requestedDose = options.dose ?? options.requestedDose;
  if (!finitePositive(Number(requestedDose))) errors.push('invalid-requested-dose');
  const dose = Number(requestedDose);
  const sourceDose = recipe?.sourceProjection?.adaptation?.sourceDose;
  const bounds = adaptedDoseBounds(recipe?.sourceProjection?.sourceSnapshot);
  if (bounds && finitePositive(dose) && dose !== sourceDose && (dose < bounds[0] || dose > bounds[1])) errors.push('unsupported-dose-adaptation');
  if (options.targetRatio != null || options.ratio != null) errors.push('source-ratio-adaptation-unsupported');
  return { valid: errors.length === 0, errors: [...new Set(errors)], route, dose, ratio: null, bounds, sourceDose };
}

function sourceConfigurationFromRecipe(recipe) {
  const projection = recipe?.sourceProjection;
  return {
    ...(projection?.sourceConfiguration || {}),
    sourceRevision: projection?.sourceRevision,
  };
}

function createManualSourcePreview({ recipe, dose, ratio, targetRatio, configuration = {}, allowIced = true } = {}) {
  const checked = validateManualSourcePreview(recipe, { dose, ratio, targetRatio });
  if (!allowIced && checked.route?.endsWith('iced')) throw new RecipePreviewError('iced-preview-disabled', 'This iced source route is kept read-only until its complete water and ice contract is enabled.');
  if (!checked.valid) throw new RecipePreviewError(checked.errors[0], `Source recipe preview is unavailable: ${checked.errors.join(', ')}.`, checked);
  const projection = recipe.sourceProjection;
  const targetProjection = projectManualSourceForApp(projection.sourceId, {
    ...sourceConfigurationFromRecipe(recipe),
    ...configuration,
    dose: checked.dose,
  });
  const target = recipeFromManualSourceProjection(targetProjection, {
    techniqueId: recipe.technique || projection.sourceId,
    techniqueLabel: recipe.techniqueLabel || projection.sourceLineage?.title || projection.sourceId,
  });
  const result = {
    ...target,
    recipePreview: {
      version: RECIPE_PREVIEW_VERSION,
      timingPolicy: targetProjection.adaptation?.timingPolicy || MANUAL_SOURCE_DOSE_POLICY_VERSION,
      baseDose: projection.coffeeGrams,
      requestedDose: checked.dose,
      route: checked.route,
      regenerated: false,
      sourceLineage: target.sourceLineage || null,
    },
  };
  const resultContract = validateManualSourceRecipeSnapshot(result);
  if (!resultContract.valid) throw new RecipePreviewError('invalid-derived-source-recipe', `Derived source recipe preview is unavailable: ${resultContract.errors.join(', ')}.`, resultContract);
  return result;
}

function baseRatio(recipe, route) {
  return ratioNumber(route.endsWith('iced') ? (recipe.finalBeverageRatio || recipe.ratio) : recipe.ratio);
}

function derivedIntent(recipe, route, options) {
  const supplied = options.intent && typeof options.intent === 'object' ? options.intent : {};
  const intent = { ...supplied };
  if (intent.targetRatio == null) intent.targetRatio = baseRatio(recipe, route);
  if (intent.targetTemperatureC == null && Number.isFinite(recipe?.waterTemp?.celsius)) intent.targetTemperatureC = recipe.waterTemp.celsius;
  if (intent.reviewedGrindSize == null && recipe?.grindSize && typeof recipe.grindSize === 'object') intent.reviewedGrindSize = recipe.grindSize;
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
    return reconcileGeneratedRatio(generated, ratio);
  }
  if (route === 'v60-hot') {
    const techniqueId = recipe.sourceLineage?.technique || recipe.technique;
    if (!techniqueId) {
      throw new RecipePreviewError('technique-conflict', 'This dose crosses the selected V60 profile boundary; review an explicit supported technique before continuing.');
    }
    const generated = generateV60RecipeForTechnique(techniqueId, intent, { ...configuration, dose, grindSize: recipe.grindSize });
    if (generated.sourceLineage?.technique !== techniqueId) {
      throw new RecipePreviewError('technique-conflict', 'The selected V60 technique could not be preserved at this dose.');
    }
    return reconcileGeneratedRatio(generated, ratio);
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

function annotate(recipe, base, dose, ratio, route, regenerated = false, grindNormalization = null) {
  const baseRatioValue = baseRatio(base, route);
  const reasoning = route === 'v60-hot' && typeof recipe.reasoning === 'string' && dose !== base.coffeeGrams
    ? recipe.reasoning.replace(new RegExp(`\\b${base.coffeeGrams}g\\b`, 'i'), `${dose}g`)
    : recipe.reasoning;
  const sourceLineage = route === 'v60-hot' && recipe.sourceLineage && dose !== base.coffeeGrams
    ? {
      ...recipe.sourceLineage,
      ...(typeof recipe.sourceLineage.adaptation === 'string'
        ? { adaptation: recipe.sourceLineage.adaptation.replace(/\bscaled to \d+(?:\.\d+)?g\b/i, `scaled to ${dose}g`) }
        : {}),
    }
    : recipe.sourceLineage;
  return {
    ...recipe,
    ...(reasoning ? { reasoning } : {}),
    ...(sourceLineage ? { sourceLineage } : {}),
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
      ...(grindNormalization ? { grindNormalization } : {}),
    },
  };
}

export function validateRecipePreview(recipe, options = {}) {
  if (hasManualSourceProjection(recipe)) {
    if (!isManualSourceRecipe(recipe)) return { valid: false, errors: ['invalid-source-projection-version'], route: null, dose: Number(options.dose ?? options.requestedDose), ratio: null, bounds: null };
    return validateManualSourcePreview(recipe, options);
  }
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
  if (hasManualSourceProjection(recipe)) {
    if (!isManualSourceRecipe(recipe)) throw new RecipePreviewError('invalid-source-projection-version', 'Source recipe preview requires a supported projection version.');
    return createManualSourcePreview({ recipe, dose: requested, ratio, targetRatio, configuration, allowIced });
  }
  const route = routeFor(recipe);
  if (!allowIced && route?.endsWith('iced')) throw new RecipePreviewError('iced-preview-disabled', 'This iced route is kept read-only until its complete water and ice contract is enabled.');
  const sourceRecipe = recipe;
  const normalized = normalizePreviewGrind(sourceRecipe, { grinder: configuration?.grinder });
  recipe = normalized.recipe;
  const checked = validateRecipePreview(recipe, { dose: requested, ratio, targetRatio });
  if (!checked.valid) throw new RecipePreviewError(checked.errors[0], `Recipe preview is unavailable: ${checked.errors.join(', ')}.`, checked);
  const targetDose = checked.dose;
  const targetRatioValue = checked.ratio;
  const sourceProfile = profileFor(recipe, route, recipe.coffeeGrams);
  const targetProfile = profileFor(recipe, route, targetDose);
  const profileChanged = sourceProfile !== targetProfile;
  const recognizedSource = route === 'v60-hot' ? recognizedV60Source(sourceRecipe) : null;
  const ratioChanged = route === 'v60-hot' && recognizedSource
    && ratioNumber(targetRatioValue) !== ratioNumber(baseRatio(recipe, route));
  const canRegenerate = route === 'kalita-hot' || route === 'v60-switch-hot' || route.endsWith('iced')
    || (route === 'v60-hot' && (recipe.reasonCodes?.includes('EXPLICIT_TECHNIQUE_SELECTION') || recognizedSource));
  if (profileChanged && !canRegenerate) {
    throw new RecipePreviewError('unsupported-dose-profile', 'I cannot safely prepare that larger dose from this saved recipe yet. Choose the same source-backed V60 technique in recipe options, or keep the dose between 12 and 24g; nothing was saved.', { sourceProfile, targetProfile });
  }
  if (profileChanged || ratioChanged || (canRegenerate && optionsRequireRegeneration({ intent, configuration }))) {
    if (recognizedSource?.customizedSchedule) {
      throw new RecipePreviewError('technique-conflict', 'This saved V60 has customized pours, so I cannot safely resize it without replacing that schedule. Keep the current dose or choose the saved source-backed technique explicitly.');
    }
    const regenerated = regeneratedPreview(recipe, route, targetDose, targetRatioValue, { intent, configuration });
    const checkedGenerated = validateRecipePreview(regenerated, { dose: targetDose, targetRatio: targetRatioValue });
    if (!checkedGenerated.valid) throw new RecipePreviewError('invalid-derived-recipe', `Derived recipe preview is unavailable: ${checkedGenerated.errors.join(', ')}.`, checkedGenerated);
    if (recognizedSource && (regenerated.technique !== recognizedSource.techniqueId
      || regenerated.configurationKey !== sourceRecipe.configurationKey
      || regenerated.v60Size !== sourceRecipe.v60Size
      || regenerated.sourceLineage?.sourceIds?.[0] !== recognizedSource.sourceId
      || regenerated.timerReady !== true)) {
      throw new RecipePreviewError('technique-conflict', 'The selected V60 source could not be preserved at this dose.');
    }
    // A saved source may carry a user-facing technique label that is more
    // specific than the generator's family label. Preserve it only after the
    // recognized-source and regenerated identity checks above have established
    // that this is the same trusted source/technique. The label is display
    // metadata; it never selects a technique or grants save authority.
    const sourceTechniqueLabel = typeof sourceRecipe.techniqueLabel === 'string'
      ? sourceRecipe.techniqueLabel.trim()
      : '';
    const displayRecipe = recognizedSource && sourceTechniqueLabel
      ? { ...regenerated, techniqueLabel: sourceTechniqueLabel }
      : regenerated;
    return annotate(displayRecipe, sourceRecipe, targetDose, targetRatioValue, route, true, normalized.normalization);
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
  const checkedPreview = validateRecipePreview(preview, { dose: targetDose, targetRatio: targetRatioValue });
  if (!checkedPreview.valid) throw new RecipePreviewError('invalid-derived-recipe', `Derived recipe preview is unavailable: ${checkedPreview.errors.join(', ')}.`, checkedPreview);
  return annotate(preview, sourceRecipe, targetDose, targetRatioValue, route, false, normalized.normalization);
}

function optionsRequireRegeneration({ intent, configuration }) {
  // Grinder identity is display/physical-normalization context. It must not
  // by itself replace a same-profile source schedule with a new technique.
  return Boolean(configuration && Object.keys(configuration).some((key) => !['dose', 'grinder'].includes(key))
    || intent && Object.keys(intent).some((key) => key !== 'targetRatio'));
}

export const projectRecipePreview = createRecipePreview;
export const previewRecipeAtDose = ({ recipe, dose, ...options } = {}) => createRecipePreview({ recipe, dose, ...options });
