import { espressoSetupIdentity } from './espressoRecipes.js';

// Shared, compact context for a brewed cup. This is deliberately a snapshot
// seam, not a second brew log: callers may preserve it on a draft/tasting and
// the chat evidence formatter may describe it without guessing from today's
// preferences.

const METHODS = new Set(['espresso', 'aiden', 'v60_hot', 'v60_iced', 'kalita_hot', 'kalita_iced']);
const DRINKS = new Set(['straight', 'with_milk']);
// eslint-disable-next-line no-control-regex -- control characters are intentionally stripped from recorded cup context.
const text = (value, max = 120) => typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
const scalar = (value) => (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string' ? value : null;

export function normalizeTastingMethod(value) {
  const raw = text(value, 32).toLowerCase();
  const method = ({ handbrew: 'v60_hot', v60: 'v60_hot', kalita: 'kalita_hot' }[raw] || raw);
  return METHODS.has(method) ? method : null;
}

export function normalizeDrinkType(value) {
  const drink = text(value, 24).toLowerCase().replace(/[\s-]+/g, '_');
  return DRINKS.has(drink) ? drink : null;
}

function setupIdentity(setup = {}) {
  const identity = espressoSetupIdentity(setup);
  const equipment = {};
  for (const key of ['machine', 'machineName', 'basket', 'grinder', 'grinderModel', 'grinderCustomName']) {
    const value = text(identity[key], 100);
    if (value) equipment[key] = value;
  }
  if (typeof identity.basketDoseGrams === 'number' && Number.isFinite(identity.basketDoseGrams) && identity.basketDoseGrams > 0) equipment.basketDoseGrams = identity.basketDoseGrams;
  return equipment;
}

function recipeSnapshot(recipe, method) {
  if (!recipe || typeof recipe !== 'object' || method !== 'espresso') return null;
  const snapshot = {
    ...(recipe.schemaVersion != null ? { schemaVersion: recipe.schemaVersion } : {}),
    ...(recipe.recipeKind ? { recipeKind: text(recipe.recipeKind, 32) } : {}),
    ...(recipe.doseBasis ? { doseBasis: text(recipe.doseBasis, 32) } : {}),
    ...(recipe.fingerprint ? { fingerprint: text(recipe.fingerprint, 100) } : {}),
    ...(recipe.recipeHash ? { recipeHash: text(recipe.recipeHash, 100) } : {}),
    ...(scalar(recipe.doseGrams) != null ? { doseGrams: recipe.doseGrams } : {}),
    ...(scalar(recipe.yieldGrams) != null ? { yieldGrams: recipe.yieldGrams } : {}),
    ...(scalar(recipe.ratio) != null ? { ratio: recipe.ratio } : {}),
    ...(Array.isArray(recipe.timeRangeSeconds) ? { timeRangeSeconds: recipe.timeRangeSeconds.filter(Number.isFinite).slice(0, 2) } : {}),
    ...(recipe.timeBasis ? { timeBasis: text(recipe.timeBasis, 48) } : {}),
    ...(recipe.source ? { source: text(recipe.source, 40) } : {}),
    ...(recipe.grinderSetting && typeof recipe.grinderSetting === 'object' ? { grinderSetting: { ...(recipe.grinderSetting.grinder ? { grinder: text(recipe.grinderSetting.grinder, 40) } : {}), ...(recipe.grinderSetting.model ? { model: text(recipe.grinderSetting.model, 100) } : {}), ...(scalar(recipe.grinderSetting.value) != null ? { value: recipe.grinderSetting.value } : {}), ...(recipe.grinderSetting.unit ? { unit: text(recipe.grinderSetting.unit, 40) } : {}), ...(recipe.grinderSetting.source ? { source: text(recipe.grinderSetting.source, 40) } : {}) } } : {}),
    ...(recipe.temperature && typeof recipe.temperature === 'object' ? { temperature: { ...(recipe.temperature.mode ? { mode: text(recipe.temperature.mode, 40) } : {}), ...(Number.isInteger(recipe.temperature.offsetF) ? { offsetF: recipe.temperature.offsetF } : {}), ...(Array.isArray(recipe.temperature.supportedOffsetsF) ? { supportedOffsetsF: recipe.temperature.supportedOffsetsF.filter(Number.isInteger).slice(0, 5) } : {}), ...(recipe.temperature.unit ? { unit: text(recipe.temperature.unit, 12) } : {}), ...(recipe.temperature.source ? { source: text(recipe.temperature.source, 60) } : {}) } } : {}),
    ...(recipe.provenance && typeof recipe.provenance === 'object' ? { provenance: { ...(recipe.provenance.kind ? { kind: text(recipe.provenance.kind, 40) } : {}), ...(recipe.provenance.label ? { label: text(recipe.provenance.label, 100) } : {}), ...(recipe.provenance.url ? { url: text(recipe.provenance.url, 240) } : {}), ...(recipe.provenance.locator ? { locator: text(recipe.provenance.locator, 160) } : {}), ...(recipe.provenance.beanId ? { beanId: text(recipe.provenance.beanId, 120) } : {}), ...(recipe.provenance.setupKey ? { setupKey: text(recipe.provenance.setupKey, 120) } : {}) } } : {}),
    ...(recipe.originalProvenance && typeof recipe.originalProvenance === 'object' ? { originalProvenance: { ...(recipe.originalProvenance.kind ? { kind: text(recipe.originalProvenance.kind, 40) } : {}), ...(recipe.originalProvenance.label ? { label: text(recipe.originalProvenance.label, 100) } : {}), ...(recipe.originalProvenance.url ? { url: text(recipe.originalProvenance.url, 240) } : {}), ...(recipe.originalProvenance.locator ? { locator: text(recipe.originalProvenance.locator, 160) } : {}), ...(recipe.originalProvenance.beanId ? { beanId: text(recipe.originalProvenance.beanId, 120) } : {}), ...(recipe.originalProvenance.setupKey ? { setupKey: text(recipe.originalProvenance.setupKey, 120) } : {}) } } : {}),
  };
  return Object.keys(snapshot).length ? snapshot : null;
}

/** Resolve explicit launch context before preferences; no historical guessing. */
export function resolveBrewContext({ method = null, setup = null, preferences = null, recipe = null, tasting = null, explicit = null, drinkType = null } = {}) {
  const source = explicit && typeof explicit === 'object' ? explicit : {};
  const resolvedMethod = normalizeTastingMethod(source.method || source.brewMethod || method || tasting?.method || tasting?.brewMethod || recipe?.method || preferences?.brewMethod);
  const resolvedDrink = normalizeDrinkType(source.drinkType || drinkType || tasting?.drinkType) || (resolvedMethod === 'espresso' ? 'straight' : null);
  const resolvedSetup = source.setup || tasting?.cupContext?.setup || recipe?.setup || setup || (resolvedMethod ? preferences : null);
  const equipment = source.equipment || tasting?.cupContext?.equipment || setupIdentity(resolvedSetup || {});
  const rawSnapshot = source.recipeSnapshot || tasting?.cupContext?.recipeSnapshot || tasting?.recipeSnapshot || recipe || tasting?.espressoRecipe;
  const snapshot = resolvedMethod === 'espresso' ? recipeSnapshot(rawSnapshot, resolvedMethod) : null;
  const revisionId = text(source.recipeRevisionId || tasting?.cupContext?.recipeRevisionId || tasting?.recipeRevisionId, 120) || null;
  const context = {
    version: 1,
    method: resolvedMethod || 'unknown',
    ...(resolvedDrink ? { drinkType: resolvedDrink } : {}),
    // Equipment is already a canonical cup snapshot here, including when
    // only its grinder is known. Keep that distinct from general preferences.
    ...(equipment && Object.keys(equipment).length ? { equipment: setupIdentity({ ...equipment, machine: equipment.machine ?? null, basket: equipment.basket ?? null }) } : {}),
    ...(snapshot ? { recipeSnapshot: snapshot } : {}),
    ...(revisionId ? { recipeRevisionId: revisionId } : {}),
  };
  return context;
}

export function snapshotBrewContext(context = {}) {
  return resolveBrewContext({ explicit: context, method: context.method, drinkType: context.drinkType, setup: context.equipment, recipe: context.recipeSnapshot ? { method: context.method, ...context.recipeSnapshot } : null });
}

export function espressoTastingContext({ recipe = null, savedRecipe = null, setup = null, revisionId = null, drinkType = 'straight' } = {}) {
  const sameSavedRecipe = Boolean(recipe?.fingerprint && savedRecipe?.fingerprint && recipe.fingerprint === savedRecipe.fingerprint);
  const snapshot = recipeSnapshot(recipe, 'espresso');
  const honestSnapshot = snapshot && !sameSavedRecipe
    ? { ...snapshot, source: 'unsaved_target', provenance: { kind: 'unsaved_target', label: 'Unsaved target' } }
    : snapshot;
  return snapshotBrewContext({
    method: 'espresso',
    drinkType,
    setup,
    recipeSnapshot: honestSnapshot,
    ...(sameSavedRecipe && revisionId ? { recipeRevisionId: revisionId } : {}),
  });
}

export function isMilkDrink(context = {}) { return normalizeDrinkType(context.drinkType) === 'with_milk'; }
export function isEspressoContext(context = {}) { return normalizeTastingMethod(context.method) === 'espresso'; }

export function formatBrewContext(context = {}) {
  const method = normalizeTastingMethod(context.method);
  if (!method) return 'Cup context: unknown (no recorded brew method).';
  const label = method === 'espresso' ? 'espresso' : ({ aiden: 'Aiden', v60_hot: 'hot V60', v60_iced: 'iced V60', kalita_hot: 'hot Kalita', kalita_iced: 'iced Kalita' }[method] || method);
  const drink = method === 'espresso' && context.drinkType ? `, ${isMilkDrink(context) ? 'with milk' : 'straight'}` : '';
  const equipment = context.equipment || {};
  const equipmentParts = [equipment.machineName || equipment.machine, equipment.grinderModel || equipment.grinderCustomName || equipment.grinder, equipment.basket].filter(Boolean).map(item => text(item, 80));
  const recipe = context.recipeSnapshot || {};
  const targets = [recipe.doseGrams != null ? `${recipe.doseGrams}g in` : null, recipe.yieldGrams != null ? `${recipe.yieldGrams}g out` : null, recipe.ratio != null ? `1:${recipe.ratio}` : null].filter(Boolean).join(', ');
  const grinderValue = recipe.grinderSetting?.value;
  const grinder = recipe.grinderSetting && grinderValue != null && recipe.grinderSetting.source !== 'unreported' && (typeof grinderValue === 'number' || typeof grinderValue === 'string') ? `grind ${text(String(grinderValue), 80)}` : '';
  const temperature = recipe.temperature && Number.isInteger(recipe.temperature.offsetF) ? `machine default ${recipe.temperature.offsetF >= 0 ? '+' : ''}${recipe.temperature.offsetF}°F` : '';
  const source = recipe.provenance?.label || recipe.source === 'unsaved_target' ? (recipe.provenance?.label || 'unsaved target') : recipe.source === 'user_saved' ? 'saved recipe' : recipe.source === 'verified_roaster' ? 'verified roaster recipe' : recipe.source === 'app_baseline' ? 'app baseline' : '';
  const revision = context.recipeRevisionId ? `revision ${text(context.recipeRevisionId, 40)}` : '';
  return [`Cup context: ${label}${drink}`, equipmentParts.length ? `equipment ${equipmentParts.join(' · ')}` : '', targets ? `recipe snapshot ${targets}` : '', grinder, temperature, source, revision].filter(Boolean).join('; ');
}

export function tastingSnapshotFromContext(context = {}) {
  const snapshot = snapshotBrewContext(context);
  return { ...snapshot, ...(snapshot.method === 'unknown' ? { unknown: true } : {}) };
}

const ESPRESSO_STEP_COPY = Object.freeze({
  smell: { prompt: 'Smell the espresso as it cools slightly.', technique: 'Bring the cup close and notice the aroma before the first sip. Taste this drink as served, without a cupping delay.' },
  firstsip: { prompt: 'Stir gently, then take a small first sip.', technique: 'Give the espresso a gentle stir, then let it cool enough to taste safely. Notice your first impression of sweetness, sharpness, bitterness and texture.' },
  acidity: { prompt: 'Find the liveliness, if it is there.', technique: 'Notice brightness or sharpness without treating either as a verdict. Describe what the cup actually feels like.' },
  sweetness: { prompt: 'Look for sweetness as the cup settles.', technique: 'Taste again as it cools a little. For a milk drink, describe sweetness in the finished drink rather than assigning it to the bean alone.' },
  body: { prompt: 'Feel the texture and weight.', technique: 'Notice whether the espresso feels light, creamy, syrupy or drying. With milk, record the finished drink texture.' },
  flavor: { prompt: 'Name what comes through.', technique: 'Breathe out through your nose and name the flavors you actually find. They may differ from the bean notes or recipe description.' },
  finish: { prompt: 'Notice what remains after the sip.', technique: 'Swallow and notice whether the finish is clean, lingering, dry or quickly gone.' },
  balance: { prompt: 'Step back and judge the whole drink.', technique: 'Consider sweetness, acidity, texture and flavor together. A result you enjoy can be good even when it falls outside a target guide.' },
});

export function tastingStepCopy(step = {}, context = {}) {
  if (isEspressoContext(context)) return ESPRESSO_STEP_COPY[step.key] || { prompt: step.prompt || '', technique: step.technique || '' };
  return { prompt: step.prompt || '', technique: step.technique || '' };
}
