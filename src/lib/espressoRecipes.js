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
  const machine = setup.espressoMachine ?? setup.machine ?? null;
  const basket = setup.espressoBasket ?? setup.basket ?? null;
  const grinder = setup.espressoGrinder ?? setup.grinder ?? null;
  const grinderModel = grinder === 'external' ? (setup.espressoGrinderModel ?? setup.grinderModel ?? null) : null;
  const customName = grinder === 'custom' ? (setup.espressoGrinderCustomName ?? setup.grinderCustomName ?? null) : null;
  return {
    machine,
    basket,
    grinder,
    grinderModel: typeof grinderModel === 'string' ? grinderModel.trim() || null : grinderModel,
    grinderCustomName: typeof customName === 'string' ? customName.trim() || null : customName,
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

export function espressoSetupDescription(setup = {}) {
  const identity = espressoSetupIdentity(setup);
  const grinder = identity.grinder === 'integrated'
    ? 'Barista Express built-in grinder'
    : identity.grinder === 'external'
      ? `External grinder${identity.grinderModel ? ` · ${identity.grinderModel}` : ''}`
      : `Custom grinder${identity.grinderCustomName ? ` · ${identity.grinderCustomName}` : ''}`;
  return `${MACHINE_LABELS[identity.machine] || 'Unknown machine'} · ${BASKET_LABELS[identity.basket] || 'Unknown basket'} · ${grinder}`;
}

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
  if (espressoSetupIdentity(setup).grinder === 'integrated') return 'Start near the Barista Express grinder default and adjust by taste after a measured shot.';
  return 'Start at your grinder’s known espresso range and adjust by taste after a measured shot. No cross-grinder conversion is applied.';
}

export function buildEspressoRecipe({ bean = {}, setup = {}, source = 'app_baseline', sourceCandidate = null, doseGrams, yieldGrams, userAdjustedFields = [] } = {}) {
  if (!isSupportedEspressoSetup(setup)) return { ok: false, code: 'espresso_setup_unconfirmed', message: 'Confirm a Barista Express and stock double basket before using numeric espresso targets.' };
  const roast = normalizeRoastLevel(bean);
  const target = ROAST_TARGETS[roast];
  const dose = rounded(doseGrams ?? target.doseGrams, 1);
  const output = rounded(yieldGrams ?? dose * target.ratio, 1);
  const recipe = {
    schemaVersion: ESPRESSO_RECIPE_SCHEMA_VERSION,
    engine: ESPRESSO_RECIPE_ENGINE,
    method: 'espresso',
    device: 'espresso',
    mode: 'hot',
    slotKey: ESPRESSO_SLOT_KEY,
    coffeeId: bean.id || null,
    setup: espressoSetupIdentity(setup),
    setupKey: espressoSetupKey(setup),
    setupDescription: espressoSetupDescription(setup),
    doseGrams: dose,
    yieldGrams: output,
    ratio: rounded(output / dose, 2),
    timeRangeSeconds: [...target.timeRangeSeconds],
    timeBasis: ESPRESSO_TIME_BASIS,
    grindGuidance: grinderGuidance(setup),
    grinderSetting: { grinder: espressoSetupIdentity(setup).grinder, model: espressoSetupIdentity(setup).grinderModel || espressoSetupIdentity(setup).grinderCustomName || null, value: null, unit: 'machine_setting', source: 'unreported' },
    temperature: {
      mode: 'machine_default',
      offsetF: 0,
      supportedOffsetsF: [...ESPRESSO_TEMPERATURE_OFFSETS_F],
      unit: 'F',
      source: 'breville-manual',
    },
    preparation: ['Distribute the dose evenly.', 'Tamp level with consistent pressure.', 'Stop at the target output mass.'],
    roastLevel: roast,
    source,
    provenance: provenance(source, sourceCandidate),
    userAdjustedFields: [...new Set(userAdjustedFields)],
    generatedAt: new Date().toISOString(),
  };
  recipe.fingerprint = canonicalHash({ ...recipe, generatedAt: undefined, fingerprint: undefined });
  return { ok: true, recipe };
}

export function validateEspressoRecipe(recipe, { setup = null, coffeeId = null } = {}) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return { valid: false, errors: ['espresso recipe must be an object'] };
  if (recipe.schemaVersion !== ESPRESSO_RECIPE_SCHEMA_VERSION) errors.push('unsupported espresso recipe schema');
  if (recipe.method !== 'espresso' || recipe.device !== 'espresso' || recipe.mode !== 'hot' || recipe.slotKey !== ESPRESSO_SLOT_KEY) errors.push('espresso recipe identity is invalid');
  if (coffeeId != null && recipe.coffeeId !== coffeeId) errors.push('espresso recipe bean mismatch');
  if (setup && recipe.setupKey !== espressoSetupKey(setup)) errors.push('espresso recipe setup mismatch');
  if (!recipe.setup || typeof recipe.setup !== 'object') errors.push('espresso setup identity is required');
  if (!number(recipe.doseGrams) || recipe.doseGrams < 16 || recipe.doseGrams > 19 || rounded(recipe.doseGrams, 1) !== recipe.doseGrams) errors.push('espresso dose must be 16–19g in 0.1g increments');
  if (!number(recipe.yieldGrams) || recipe.yieldGrams <= 0) errors.push('espresso output mass must be positive');
  if (!number(recipe.ratio) || recipe.ratio < 1 || recipe.ratio > 4) errors.push('espresso ratio must be between 1:1 and 1:4');
  if (number(recipe.doseGrams) && number(recipe.yieldGrams) && rounded(recipe.yieldGrams / recipe.doseGrams, 2) !== recipe.ratio) errors.push('espresso ratio must equal output mass divided by dose');
  if (!Array.isArray(recipe.timeRangeSeconds) || recipe.timeRangeSeconds.length !== 2 || recipe.timeRangeSeconds.some((value) => !Number.isInteger(value) || value <= 0) || recipe.timeRangeSeconds[0] > recipe.timeRangeSeconds[1]) errors.push('espresso timing range is invalid');
  if (recipe.timeBasis !== ESPRESSO_TIME_BASIS) errors.push('espresso timing basis is required');
  if (!['app_baseline', 'verified_roaster', 'user_saved'].includes(recipe.source)) errors.push('espresso provenance source is invalid');
  if (recipe.source === 'verified_roaster' && (!recipe.provenance?.url || recipe.provenance?.kind !== 'verified_roaster')) errors.push('verified roaster provenance is incomplete');
  if (recipe.source === 'verified_roaster' && (recipe.provenance?.beanId !== recipe.coffeeId || recipe.provenance?.method !== 'espresso' || recipe.provenance?.units !== 'g' || recipe.provenance?.setupKey !== recipe.setupKey)) errors.push('verified roaster provenance must bind exact bean, mass units, and setup');
  const setupIdentity = espressoSetupIdentity(recipe.setup || {});
  const grinder = recipe.grinderSetting;
  if (!grinder || typeof grinder !== 'object' || Array.isArray(grinder) || !['integrated', 'external', 'custom'].includes(grinder.grinder)) {
    errors.push('espresso grinder setting identity is required');
  } else {
    if (grinder.grinder !== setupIdentity.grinder) errors.push('espresso grinder setting must bind the selected setup');
    const expectedModel = setupIdentity.grinder === 'external' ? setupIdentity.grinderModel : setupIdentity.grinder === 'custom' ? setupIdentity.grinderCustomName : null;
    if ((grinder.model || null) !== expectedModel) errors.push('espresso grinder setting model must bind the selected setup');
    if (grinder.unit !== 'machine_setting') errors.push('espresso grinder setting unit is invalid');
    if (!['unreported', 'user_saved', 'machine_manual'].includes(grinder.source)) errors.push('espresso grinder setting source is invalid');
    if (grinder.value != null && (typeof grinder.value === 'object' || typeof grinder.value === 'boolean' || (typeof grinder.value !== 'string' && !number(grinder.value)))) errors.push('espresso grinder setting must be a scalar machine setting');
    if (setupIdentity.grinder !== 'integrated' && expectedModel == null && grinder.value != null) errors.push('an external or custom grinder model is required before saving a calibrated setting');
    if (setupIdentity.grinder === 'integrated' && grinder.value != null && (!Number.isInteger(grinder.value) || grinder.value < 1 || grinder.value > 16)) errors.push('integrated grinder setting must be an integer from 1 to 16');
    if (typeof grinder.value === 'string' && (grinder.value.trim().length === 0 || grinder.value.length > 80)) errors.push('espresso grinder setting text is invalid');
    const grinderKeys = Object.keys(grinder);
    if (grinderKeys.some((key) => !['grinder', 'model', 'value', 'unit', 'source'].includes(key))) errors.push('unsupported espresso grinder setting field');
  }
  const temperature = recipe.temperature;
  if (!temperature || typeof temperature !== 'object' || Array.isArray(temperature)) errors.push('espresso temperature guidance is required');
  else {
    if (temperature.mode !== 'machine_default' || temperature.unit !== 'F' || temperature.source !== 'breville-manual') errors.push('espresso temperature must use the machine default and manual offsets');
    if (!Number.isInteger(temperature.offsetF) || !ESPRESSO_TEMPERATURE_OFFSETS_F.includes(temperature.offsetF)) errors.push('espresso temperature offset must be -4, -2, 0, +2, or +4F');
    if (!Array.isArray(temperature.supportedOffsetsF) || canonicalHash(temperature.supportedOffsetsF) !== canonicalHash(ESPRESSO_TEMPERATURE_OFFSETS_F)) errors.push('espresso temperature offset choices are invalid');
    if (Object.keys(temperature).some((key) => !['mode', 'offsetF', 'supportedOffsetsF', 'unit', 'source'].includes(key))) errors.push('unsupported espresso temperature field');
  }
  const allowedKeys = new Set(['schemaVersion', 'engine', 'method', 'device', 'mode', 'slotKey', 'coffeeId', 'setup', 'setupKey', 'setupDescription', 'doseGrams', 'yieldGrams', 'ratio', 'timeRangeSeconds', 'timeBasis', 'grindGuidance', 'grinderSetting', 'temperature', 'preparation', 'roastLevel', 'source', 'provenance', 'originalProvenance', 'userAdjustedFields', 'generatedAt', 'fingerprint', 'recipeHash']);
  Object.keys(recipe).filter((key) => !allowedKeys.has(key)).forEach((key) => errors.push(`unsupported espresso recipe field: ${key}`));
  if (Object.hasOwn(recipe, 'waterGrams') || Object.hasOwn(recipe, 'waterMilliliters') || Object.hasOwn(recipe, 'water')) errors.push('espresso recipe cannot use brew-water fields');
  return { valid: errors.length === 0, errors };
}

export function resolveEspressoRecipe({ bean = {}, setup = {}, forceRegenerate = false } = {}) {
  if (!isSupportedEspressoSetup(setup)) return { ok: false, code: 'espresso_setup_unconfirmed', message: 'Confirm your espresso machine, basket, and grinder first.' };
  const saved = bean.espressoRecipe;
  const setupSaved = bean.espressoRecipesBySetup?.[espressoSetupKey(setup)];
  if (setupSaved?.source === 'user_saved' && validateEspressoRecipe(setupSaved, { setup, coffeeId: bean.id }).valid) return { ok: true, recipe: clone(setupSaved), source: 'user_saved', cached: true };
  if (saved?.source === 'user_saved' && validateEspressoRecipe(saved, { setup, coffeeId: bean.id }).valid) return { ok: true, recipe: clone(saved), source: 'user_saved', cached: true };
  const roaster = explicitRoasterRecipe(bean);
  if (!forceRegenerate && roaster) {
    const generated = buildEspressoRecipe({ bean, setup, source: 'verified_roaster', sourceCandidate: roaster, doseGrams: roaster.doseGrams, yieldGrams: roaster.yieldGrams });
    if (generated.ok && validateEspressoRecipe(generated.recipe, { setup, coffeeId: bean.id }).valid) return { ok: true, recipe: generated.recipe, source: 'verified_roaster', cached: false };
  }
  const generated = buildEspressoRecipe({ bean, setup, source: 'app_baseline' });
  return generated.ok ? { ok: true, recipe: generated.recipe, source: 'app_baseline', cached: false } : generated;
}

export function editEspressoRecipe(recipe, patch = {}) {
  const dose = patch.doseGrams == null ? recipe.doseGrams : rounded(patch.doseGrams, 1);
  const output = patch.yieldGrams == null
    ? (patch.doseGrams == null ? recipe.yieldGrams : rounded(dose * recipe.ratio, 1))
    : rounded(patch.yieldGrams, 1);
  const next = { ...clone(recipe), doseGrams: dose, yieldGrams: output, ratio: rounded(output / dose, 2), source: 'user_saved', originalProvenance: recipe.originalProvenance || recipe.provenance || null, provenance: provenance('user_saved'), userAdjustedFields: [...new Set([...(recipe.userAdjustedFields || []), ...(patch.doseGrams == null ? [] : ['doseGrams']), ...(patch.yieldGrams == null ? [] : ['yieldGrams'])])] };
  next.fingerprint = espressoRecipeFingerprint(next);
  const validation = validateEspressoRecipe(next);
  if (!validation.valid) return { ok: false, code: 'invalid_espresso_recipe', errors: validation.errors };
  return { ok: true, recipe: next };
}

export function espressoRecipeFingerprint(recipe) {
  return canonicalHash({ ...recipe, generatedAt: undefined, fingerprint: undefined });
}
