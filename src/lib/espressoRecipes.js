import { canonicalHash, clone } from './ruphus/contracts.js';

export const ESPRESSO_RECIPE_SCHEMA_VERSION = 1;
export const ESPRESSO_SLOT_KEY = 'espresso';
export const ESPRESSO_RECIPE_ENGINE = 'espresso-baseline-2026-10-12';
export const ESPRESSO_TIME_BASIS = 'machine_start_to_stop';
export const ESPRESSO_TEMPERATURE_OFFSETS_F = Object.freeze([-4, -2, 0, 2, 4]);

const SUPPORTED_MACHINE = 'breville-barista-express';
const SUPPORTED_BASKET = 'stock-double-single-wall';
const MACHINE_LABELS = {
  [SUPPORTED_MACHINE]: 'Breville Barista Express',
};
const BASKET_LABELS = {
  [SUPPORTED_BASKET]: 'Stock double · single-wall',
};
const ROAST_TARGETS = {
  light: { doseGrams: 17, ratio: 2.2, timeRangeSeconds: [25, 30] },
  medium: { doseGrams: 18, ratio: 2, timeRangeSeconds: [25, 30] },
  dark: { doseGrams: 18, ratio: 1.8, timeRangeSeconds: [25, 30] },
  unknown: { doseGrams: 18, ratio: 2, timeRangeSeconds: [25, 30] },
};

const number = (value) => typeof value === 'number' && Number.isFinite(value);
const rounded = (value, places = 1) => {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

export function normalizeRoastLevel(bean = {}) {
  const value = bean.roastLevel ?? bean.beanResearch?.roastLevel ?? bean.research?.roastLevel;
  return ['light', 'medium', 'dark'].includes(String(value).toLowerCase())
    ? String(value).toLowerCase()
    : 'unknown';
}

export function espressoSetupIdentity(setup = {}) {
  // Short aliases belong to canonical recipe.setup, never general brew preferences.
  const canonicalIdentity = Object.hasOwn(setup, 'machine') || Object.hasOwn(setup, 'basket');
  const selected = (preference, alias) => Object.hasOwn(setup, preference) ? setup[preference] : canonicalIdentity ? setup[alias] : null;
  const normalizedChoice = (value) => value === 'unknown' ? null : value || null;
  const machine = normalizedChoice(selected('espressoMachine', 'machine'));
  const basket = normalizedChoice(selected('espressoBasket', 'basket'));
  const grinder = normalizedChoice(selected('espressoGrinder', 'grinder'));
  const grinderModel = grinder === 'external' ? (selected('espressoGrinderModel', 'grinderModel') ?? null) : null;
  const customName = grinder === 'custom' ? (selected('espressoGrinderCustomName', 'grinderCustomName') ?? null) : null;
  return {
    machine,
    basket,
    grinder,
    grinderModel: typeof grinderModel === 'string' ? grinderModel.trim() || null : grinderModel,
    grinderCustomName: typeof customName === 'string' ? customName.trim() || null : customName,
    ...(selected('espressoMachineName', 'machineName')?.trim?.() ? { machineName: selected('espressoMachineName', 'machineName').trim() } : {}),
    ...(number(selected('espressoBasketDoseGrams', 'basketDoseGrams')) && selected('espressoBasketDoseGrams', 'basketDoseGrams') > 0 ? { basketDoseGrams: selected('espressoBasketDoseGrams', 'basketDoseGrams') } : {}),
  };
}

export function espressoSetupKey(setup = {}) {
  return canonicalHash(espressoSetupIdentity(setup));
}

export function isSupportedEspressoSetup(setup = {}) {
  const identity = espressoSetupIdentity(setup);
  return setup.espressoSetupConfirmed === true
    && identity.machine === SUPPORTED_MACHINE
    && identity.basket === SUPPORTED_BASKET
    && ['integrated', 'external', 'custom'].includes(identity.grinder)
    && (identity.grinder !== 'external' || identity.grinderModel == null || typeof identity.grinderModel === 'string')
    && (identity.grinder !== 'custom' || identity.grinderCustomName == null || typeof identity.grinderCustomName === 'string');
}

function espressoSetupLabels(setup = {}) {
  const identity = espressoSetupIdentity(setup);
  return {
    machine: MACHINE_LABELS[identity.machine] || identity.machineName || (identity.machine === 'other' ? 'Other espresso machine' : null),
    basket: BASKET_LABELS[identity.basket] || (identity.basket === 'dual-wall' ? 'Dual-wall basket' : identity.basket === 'different' ? 'Different basket' : null),
    grinder: identity.grinder === 'integrated'
      ? (identity.machine === SUPPORTED_MACHINE ? 'Barista Express built-in grinder' : 'Built-in grinder')
      : identity.grinder === 'external'
        ? `External grinder${identity.grinderModel ? ` · ${identity.grinderModel}` : ''}`
        : identity.grinder === 'custom' ? `Custom grinder${identity.grinderCustomName ? ` · ${identity.grinderCustomName}` : ''}`
          : identity.grinder === 'preground' ? 'Preground coffee' : null,
  };
}

export function espressoSetupDescription(setup = {}) {
  const labels = espressoSetupLabels(setup);
  return `${labels.machine || 'Machine not set'} · ${labels.basket || 'Basket not set'} · ${labels.grinder || 'Grinder not set'}`;
}

/** Only the parts of the setup that are known, for display. */
export function espressoSetupSummary(setup = {}) {
  return Object.values(espressoSetupLabels(setup)).filter(Boolean).join(' · ');
}

const isStockBasket = (setup) => {
  const identity = espressoSetupIdentity(setup);
  return identity.machine === SUPPORTED_MACHINE && identity.basket === SUPPORTED_BASKET;
};
const isStockFreshSetup = (setup) => isStockBasket(setup)
  && ['integrated', 'external', 'custom'].includes(espressoSetupIdentity(setup).grinder);

function explicitRoasterRecipe(bean = {}) {
  const candidates = [bean.espressoRecipeSource, bean.verifiedEspressoRecipe, bean.beanResearch?.espressoRecipe];
  return candidates.find((candidate) => candidate && typeof candidate === 'object'
    && candidate.kind === 'roaster'
    && candidate.beanId === bean.id
    && candidate.method === 'espresso'
    && candidate.units === 'g'
    && candidate.setupKey
    && number(candidate.doseGrams)
    && number(candidate.yieldGrams)) || null;
}

function sourceLabel(source) {
  if (source === 'user_saved') return 'Saved recipe';
  if (source === 'verified_roaster') return 'Verified roaster recipe';
  if (source === 'generic_framework') return 'General espresso starting point';
  return 'App baseline';
}

function provenance(source, candidate = null) {
  return {
    kind: source,
    label: sourceLabel(source),
    ...(source === 'verified_roaster' ? {
      url: candidate?.url || null,
      locator: candidate?.locator || null,
      method: candidate?.method || 'espresso',
      units: candidate?.units || 'g',
      beanId: candidate?.beanId || null,
      setupKey: candidate?.setupKey || null,
      accessedAt: candidate?.accessedAt || null,
    } : {}),
  };
}

function grinderGuidance(setup) {
  const identity = espressoSetupIdentity(setup);
  if (identity.grinder === 'preground' || identity.basket === 'dual-wall') return 'Follow your machine’s basket and dose guidance for this coffee.';
  if (!identity.grinder) return 'Choose a grinder when you want guidance for its espresso settings.';
  if (identity.grinder === 'integrated' && isSupportedEspressoSetup(setup)) return 'Start near the Barista Express grinder default and adjust by taste after a measured shot.';
  return 'Use your grinder’s own espresso guidance and adjust by taste after a measured shot. No cross-grinder conversion is applied.';
}

export function buildEspressoRecipe({ bean = {}, setup = {}, source = 'app_baseline', sourceCandidate = null, doseGrams, yieldGrams, userAdjustedFields = [] } = {}) {
  const preset = isSupportedEspressoSetup(setup);
  const roast = normalizeRoastLevel(bean);
  const target = preset ? ROAST_TARGETS[roast] : { ratio: 2, timeRangeSeconds: [25, 30] };
  const identity = espressoSetupIdentity(setup);
  const chosenDose = doseGrams ?? (preset ? target.doseGrams : identity.basketDoseGrams);
  const dose = chosenDose == null ? null : rounded(chosenDose, 1);
  const output = dose == null ? null : rounded(yieldGrams ?? dose * target.ratio, 1);
  const recipeSource = !preset && source === 'app_baseline' ? 'generic_framework' : source;
  const recipe = {
    schemaVersion: ESPRESSO_RECIPE_SCHEMA_VERSION,
    engine: ESPRESSO_RECIPE_ENGINE,
    method: 'espresso', device: 'espresso', mode: 'hot', slotKey: ESPRESSO_SLOT_KEY,
    coffeeId: bean.id || null,
    setup: identity, setupKey: espressoSetupKey(setup), setupDescription: espressoSetupDescription(setup),
    recipeKind: preset ? 'machine_preset' : 'generic',
    doseBasis: source === 'verified_roaster' ? 'verified_roaster' : doseGrams != null ? 'user_selected' : preset ? 'app_baseline' : identity.basketDoseGrams ? 'basket_guidance' : 'unselected',
    doseGrams: dose, yieldGrams: output, ratio: dose == null ? target.ratio : rounded(output / dose, 2),
    timeRangeSeconds: [...target.timeRangeSeconds], timeBasis: ESPRESSO_TIME_BASIS,
    grindGuidance: grinderGuidance(setup),
    grinderSetting: { grinder: identity.grinder || 'unknown', model: identity.grinderModel || identity.grinderCustomName || null, value: null, unit: 'machine_setting', source: 'unreported' },
    temperature: preset ? { mode: 'machine_default', offsetF: 0, supportedOffsetsF: [...ESPRESSO_TEMPERATURE_OFFSETS_F], unit: 'F', source: 'breville-manual' }
      : { mode: 'unreported', offsetF: null, supportedOffsetsF: [], unit: null, source: 'unreported' },
    preparation: identity.grinder === 'preground' || identity.basket === 'dual-wall'
      ? ['Warm the machine and prepare your basket.', 'Follow your machine’s basket and dose guidance.', 'Weigh the espresso as it brews; stop near your target and taste.']
      : ['Warm the machine and prepare your basket.', 'Distribute the grounds evenly and tamp level.', 'Weigh the espresso as it brews; stop near your target and taste.'],
    roastLevel: roast, source: recipeSource, provenance: provenance(recipeSource, sourceCandidate),
    userAdjustedFields: [...new Set(userAdjustedFields)], generatedAt: new Date().toISOString(),
  };
  recipe.fingerprint = espressoRecipeFingerprint(recipe);
  const validation = validateEspressoRecipe(recipe, { allowIncomplete: true });
  return validation.valid ? { ok: true, recipe } : { ok: false, code: 'invalid_espresso_recipe', errors: validation.errors };
}

export function validateEspressoRecipe(recipe, { setup = null, coffeeId = null, allowIncomplete = false } = {}) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return { valid: false, errors: ['espresso recipe must be an object'] };
  if (recipe.schemaVersion !== ESPRESSO_RECIPE_SCHEMA_VERSION) errors.push('unsupported espresso recipe schema');
  if (recipe.method !== 'espresso' || recipe.device !== 'espresso' || recipe.mode !== 'hot' || recipe.slotKey !== ESPRESSO_SLOT_KEY) errors.push('espresso recipe identity is invalid');
  if (coffeeId != null && recipe.coffeeId !== coffeeId) errors.push('espresso recipe bean mismatch');
  if (setup && recipe.setupKey !== espressoSetupKey(setup)) errors.push('espresso recipe setup mismatch');
  if (!recipe.setup || typeof recipe.setup !== 'object' || Array.isArray(recipe.setup)) errors.push('espresso setup identity is required');
  else if (recipe.setupKey !== espressoSetupKey(recipe.setup)) errors.push('espresso setup fingerprint is inconsistent');
  const incomplete = allowIncomplete && recipe.recipeKind === 'generic' && recipe.doseGrams === null && recipe.yieldGrams === null;
  if (!incomplete && (!number(recipe.doseGrams) || recipe.doseGrams <= 0 || rounded(recipe.doseGrams, 1) !== recipe.doseGrams)) errors.push('espresso dose must be positive in 0.1g increments');
  if (isStockBasket(recipe.setup) && (!number(recipe.doseGrams) || recipe.doseGrams < 16 || recipe.doseGrams > 19) && !incomplete) errors.push('stock double espresso dose must be 16–19g');
  if (!incomplete && (!number(recipe.yieldGrams) || recipe.yieldGrams <= 0)) errors.push('espresso output mass must be positive');
  if (recipe.recipeKind != null && !['generic', 'machine_preset'].includes(recipe.recipeKind)) errors.push('espresso recipe kind is invalid');
  if (recipe.doseBasis != null && !['unselected', 'user_selected', 'basket_guidance', 'app_baseline', 'verified_roaster'].includes(recipe.doseBasis)) errors.push('espresso dose basis is invalid');
  if (!number(recipe.ratio) || recipe.ratio < 1 || recipe.ratio > 4) errors.push('espresso ratio must be between 1:1 and 1:4');
  if (number(recipe.doseGrams) && number(recipe.yieldGrams) && rounded(recipe.yieldGrams / recipe.doseGrams, 2) !== recipe.ratio) errors.push('espresso ratio must equal output mass divided by dose');
  if (!Array.isArray(recipe.timeRangeSeconds) || recipe.timeRangeSeconds.length !== 2 || recipe.timeRangeSeconds.some((value) => !Number.isInteger(value) || value <= 0) || recipe.timeRangeSeconds[0] > recipe.timeRangeSeconds[1]) errors.push('espresso timing range is invalid');
  if (recipe.timeBasis !== ESPRESSO_TIME_BASIS) errors.push('espresso timing basis is required');
  if (!['app_baseline', 'generic_framework', 'verified_roaster', 'user_saved'].includes(recipe.source)) errors.push('espresso provenance source is invalid');
  if (recipe.source === 'verified_roaster' && (!recipe.provenance?.url || recipe.provenance?.kind !== 'verified_roaster')) errors.push('verified roaster provenance is incomplete');
  if (recipe.source === 'verified_roaster' && (recipe.provenance?.beanId !== recipe.coffeeId || recipe.provenance?.method !== 'espresso' || recipe.provenance?.units !== 'g' || recipe.provenance?.setupKey !== recipe.setupKey)) errors.push('verified roaster provenance must bind exact bean, mass units, and setup');
  const setupIdentity = espressoSetupIdentity(recipe.setup || {});
  const grinder = recipe.grinderSetting;
  if (!grinder || typeof grinder !== 'object' || Array.isArray(grinder) || !['integrated', 'external', 'custom', 'unknown', 'preground'].includes(grinder.grinder)) {
    errors.push('espresso grinder setting identity is required');
  } else {
    if (grinder.grinder !== (setupIdentity.grinder || 'unknown')) errors.push('espresso grinder setting must bind the selected setup');
    const expectedModel = setupIdentity.grinder === 'external' ? setupIdentity.grinderModel : setupIdentity.grinder === 'custom' ? setupIdentity.grinderCustomName : null;
    if ((grinder.model || null) !== expectedModel) errors.push('espresso grinder setting model must bind the selected setup');
    if (grinder.unit !== 'machine_setting') errors.push('espresso grinder setting unit is invalid');
    if (!['unreported', 'user_saved', 'machine_manual'].includes(grinder.source)) errors.push('espresso grinder setting source is invalid');
    if (grinder.value != null && (typeof grinder.value === 'object' || typeof grinder.value === 'boolean' || (typeof grinder.value !== 'string' && !number(grinder.value)))) errors.push('espresso grinder setting must be a scalar machine setting');
    if (setupIdentity.grinder !== 'integrated' && expectedModel == null && grinder.value != null) errors.push('an external or custom grinder model is required before saving a calibrated setting');
    if ((!setupIdentity.grinder || setupIdentity.grinder === 'preground' || setupIdentity.basket === 'dual-wall') && grinder.value != null) errors.push('this espresso setup does not support a grinder setting');
    if (setupIdentity.grinder === 'integrated' && setupIdentity.machine !== SUPPORTED_MACHINE && !setupIdentity.machineName && grinder.value != null) errors.push('identify the machine before saving its built-in grinder setting');
    if (setupIdentity.grinder === 'integrated' && setupIdentity.machine === SUPPORTED_MACHINE && grinder.value != null && (!Number.isInteger(grinder.value) || grinder.value < 1 || grinder.value > 16)) errors.push('integrated grinder setting must be an integer from 1 to 16');
    if (typeof grinder.value === 'string' && (grinder.value.trim().length === 0 || grinder.value.length > 80)) errors.push('espresso grinder setting text is invalid');
    const grinderKeys = Object.keys(grinder);
    if (grinderKeys.some((key) => !['grinder', 'model', 'value', 'unit', 'source'].includes(key))) errors.push('unsupported espresso grinder setting field');
  }
  const temperature = recipe.temperature;
  if (!temperature || typeof temperature !== 'object' || Array.isArray(temperature)) errors.push('espresso temperature guidance is required');
  else {
    if (recipe.recipeKind === 'generic') {
      if (temperature.mode !== 'unreported' || temperature.unit !== null || temperature.source !== 'unreported' || temperature.offsetF !== null || !Array.isArray(temperature.supportedOffsetsF) || temperature.supportedOffsetsF.length !== 0) errors.push('generic espresso temperature must remain unreported');
    } else {
      if (!isStockFreshSetup(recipe.setup)) errors.push('Breville temperature controls require the researched machine and basket');
      if (temperature.mode !== 'machine_default' || temperature.unit !== 'F' || temperature.source !== 'breville-manual') errors.push('espresso temperature must use the machine default and manual offsets');
      if (!Number.isInteger(temperature.offsetF) || !ESPRESSO_TEMPERATURE_OFFSETS_F.includes(temperature.offsetF)) errors.push('espresso temperature offset must be -4, -2, 0, +2, or +4F');
      if (!Array.isArray(temperature.supportedOffsetsF) || canonicalHash(temperature.supportedOffsetsF) !== canonicalHash(ESPRESSO_TEMPERATURE_OFFSETS_F)) errors.push('espresso temperature offset choices are invalid');
    }
    if (Object.keys(temperature).some((key) => !['mode', 'offsetF', 'supportedOffsetsF', 'unit', 'source'].includes(key))) errors.push('unsupported espresso temperature field');
  }
  const allowedKeys = new Set(['schemaVersion', 'engine', 'method', 'device', 'mode', 'slotKey', 'coffeeId', 'setup', 'setupKey', 'setupDescription', 'recipeKind', 'doseBasis', 'doseGrams', 'yieldGrams', 'ratio', 'timeRangeSeconds', 'timeBasis', 'grindGuidance', 'grinderSetting', 'temperature', 'preparation', 'roastLevel', 'source', 'provenance', 'originalProvenance', 'userAdjustedFields', 'generatedAt', 'fingerprint', 'recipeHash']);
  Object.keys(recipe).filter((key) => !allowedKeys.has(key)).forEach((key) => errors.push(`unsupported espresso recipe field: ${key}`));
  if (Object.hasOwn(recipe, 'waterGrams') || Object.hasOwn(recipe, 'waterMilliliters') || Object.hasOwn(recipe, 'water')) errors.push('espresso recipe cannot use brew-water fields');
  return { valid: errors.length === 0, errors };
}

export function resolveEspressoRecipe({ bean = {}, setup = {}, forceRegenerate = false } = {}) {
  const saved = bean.espressoRecipe;
  const setupSaved = bean.espressoRecipesBySetup?.[espressoSetupKey(setup)];
  if (setupSaved?.source === 'user_saved' && validateEspressoRecipe(setupSaved, { setup, coffeeId: bean.id }).valid) return { ok: true, recipe: clone(setupSaved), source: 'user_saved', cached: true };
  if (saved?.source === 'user_saved' && validateEspressoRecipe(saved, { setup, coffeeId: bean.id }).valid) return { ok: true, recipe: clone(saved), source: 'user_saved', cached: true };
  const previousRecipe = saved?.source === 'user_saved' && saved.setupKey !== espressoSetupKey(setup) && validateEspressoRecipe(saved, { coffeeId: bean.id }).valid ? clone(saved) : null;
  const roaster = explicitRoasterRecipe(bean);
  if (!forceRegenerate && roaster) {
    const generated = buildEspressoRecipe({ bean, setup, source: 'verified_roaster', sourceCandidate: roaster, doseGrams: roaster.doseGrams, yieldGrams: roaster.yieldGrams });
    if (generated.ok && validateEspressoRecipe(generated.recipe, { setup, coffeeId: bean.id }).valid) return { ok: true, recipe: generated.recipe, source: 'verified_roaster', cached: false, ...(previousRecipe ? { setupMismatch: true, previousRecipe } : {}) };
  }
  const generated = buildEspressoRecipe({ bean, setup, source: 'app_baseline' });
  return generated.ok ? { ok: true, recipe: generated.recipe, source: generated.recipe.source, cached: false, ...(previousRecipe ? { setupMismatch: true, previousRecipe } : {}) } : generated;
}

export function editEspressoRecipe(recipe, patch = {}) {
  if (['doseGrams', 'yieldGrams'].some((key) => patch[key] != null && !number(patch[key]))) return { ok: false, code: 'invalid_espresso_recipe', errors: ['espresso mass edits must be finite numbers'] };
  const dose = patch.doseGrams == null ? recipe.doseGrams : rounded(patch.doseGrams, 1);
  const output = patch.yieldGrams == null
    ? (patch.doseGrams == null ? recipe.yieldGrams : rounded(dose * recipe.ratio, 1))
    : rounded(patch.yieldGrams, 1);
  const next = { ...clone(recipe), doseGrams: dose, yieldGrams: output, ratio: dose == null ? recipe.ratio : rounded(output / dose, 2), ...(patch.doseGrams == null ? {} : { doseBasis: 'user_selected' }), source: 'user_saved', originalProvenance: recipe.originalProvenance || recipe.provenance || null, provenance: provenance('user_saved'), userAdjustedFields: [...new Set([...(recipe.userAdjustedFields || []), ...(patch.doseGrams == null ? [] : ['doseGrams']), ...(patch.yieldGrams == null ? [] : ['yieldGrams'])])] };
  next.fingerprint = espressoRecipeFingerprint(next);
  const validation = validateEspressoRecipe(next);
  if (!validation.valid) return { ok: false, code: 'invalid_espresso_recipe', errors: validation.errors };
  return { ok: true, recipe: next };
}

export function espressoRecipeFingerprint(recipe) {
  return canonicalHash({ ...recipe, generatedAt: undefined, fingerprint: undefined });
}
