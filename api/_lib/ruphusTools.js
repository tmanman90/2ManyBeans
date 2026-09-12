import { canonicalHash, clone, hasManualSourceProjection, RECIPE_TECHNIQUE_EXPERIMENT_PROTOCOL_VERSION, SLOT_KEYS } from '../../src/lib/ruphus/contracts.js';
import { makeArtifact } from '../../src/lib/ruphus/artifactRegistry.js';
import { canonicalRecipeSnapshot, validateExecutableRecipe } from '../../src/lib/ruphus/legacyRecipeResolver.js';
import { absentRecipeSourceHash } from '../../src/lib/ruphus/recipeSourceState.js';
import { resolveCoffeeReference } from '../../src/lib/ruphus/referenceResolver.js';
import { equipmentClarificationAnswer, explicitMethodVariantFromText, resolveMethod } from '../../src/lib/ruphus/methodResolver.js';
import { generateV60Recipe } from '../../src/lib/v60Adapter.js';
import { generateV60SwitchRecipe } from '../../src/lib/v60SwitchAdapter.js';
import { generateV60IcedRecipe } from '../../src/lib/v60IcedAdapter.js';
import { generateKalitaRecipe } from '../../src/lib/kalitaAdapter.js';
import { generateKalitaIcedRecipe } from '../../src/lib/kalitaIcedAdapter.js';
import {
  generateManualSourceTechniqueOption,
  generateV60TechniqueOption,
  listManualSourceTechniqueOptions,
  listV60SwitchTechniqueReferences,
  listV60TechniqueOptions,
} from '../../src/lib/ruphus/techniqueOptions.js';
import { createRecipePreview, normalizePreviewGrind } from '../../src/lib/ruphus/recipePreview.js';
import { appendLedger, ledgerEntryFromEvidence, MAX_LEDGER_BYTES, publicEvidence, readCoffeeEvidence } from './ruphusEvidence.js';
import { answeredSensoryClarifier } from './ruphusSensoryAnswer.js';
import { isAlternativeRequest, sameRecipeReview } from '../../src/lib/ruphus/proposalContinuity.js';
import { isTechniqueExplorationRequest } from '../../src/lib/ruphus/conversationContract.js';
import { ODE_GEN2_STEPS, isOdeStep, grinderSettingToMicrons, descriptorForMicrons } from '../../src/lib/brewMethods.js';

export const RUPHUS_READ_TOOL_NAMES = Object.freeze(['resolve_coffee', 'read_coffee_evidence', 'read_recipe', 'read_technique_options', 'review_trial_recipe', 'propose_recipe_change']);
export const RUPHUS_FORBIDDEN_TOOL_NAMES = Object.freeze(['apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'complete_attempt', 'prepare_attempt', 'undo_revision', 'promote_attempt', 'create_receipt', 'fellow_prepare', 'claim_physical_success']);
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const strictObject = (properties) => ({ type: 'object', properties: Object.fromEntries(Object.entries(properties).map(([key, schema]) => [key, nullable(schema)])), required: Object.keys(properties), additionalProperties: false });
const RECIPE_STEP = strictObject({ time: { type: 'string' }, timeSeconds: { type: 'number' }, action: { type: 'string' }, waterTotal: { type: 'number' }, name: { type: 'string' }, phase: { type: 'string' }, untimed: { type: 'boolean' } });
const RECIPE_PROPERTIES = Object.freeze({ method: { type: 'string' }, device: { type: 'string' }, mode: { type: 'string' }, variant: { type: 'string' }, v60Variant: { type: 'string' }, v60Size: { type: 'string' }, kalitaSize: { type: 'string' }, configurationKey: { type: 'string' }, doseProfile: { type: 'string' }, coffeeGrams: { type: 'number' }, userCoffeeGrams: { type: 'number' }, dose: { type: 'number' }, waterGrams: { type: 'number' }, waterMilliliters: { type: 'number' }, water: { type: 'number' }, ratio: { anyOf: [{ type: 'number' }, { type: 'string' }] }, isIced: { type: 'boolean' }, hotWaterGrams: { type: 'number' }, recipeIceGrams: { type: 'number' }, iceGrams: { type: 'number' }, initialBrewIceGrams: { type: 'number' }, postBrewIceGrams: { type: 'number' }, finalBeverageWaterTargetGrams: { type: 'number' }, hotExtractionRatio: { anyOf: [{ type: 'number' }, { type: 'string' }] }, finalBeverageRatio: { anyOf: [{ type: 'number' }, { type: 'string' }] }, requiresCompleteMelt: { type: 'boolean' }, servingIceExcluded: { type: 'boolean' }, measuredMeltedIceGrams: { type: 'number' }, actualFinalBeverageMassGrams: { type: 'number' }, actualFinalTemperatureC: { type: 'number' }, icePlacement: { type: 'string' }, iceTiming: { type: 'string' }, temperature: { anyOf: [{ type: 'number' }, { type: 'object' }] }, temperatureC: { type: 'number' }, grind: { anyOf: [{ type: 'string' }, { type: 'object' }] }, technique: { type: 'string' }, techniqueLabel: { type: 'string' }, techniqueInstruction: { type: 'string' }, chillingMethod: { type: 'string' }, recommendedChillingMethod: { type: 'string' }, chillingMethodOverrideApplied: { type: 'boolean' }, steps: { type: 'array', items: RECIPE_STEP }, stages: { type: 'array', items: { type: 'object' } }, prepSteps: { type: 'array', items: RECIPE_STEP }, postBrewSteps: { type: 'array', items: RECIPE_STEP }, aftercare: { type: 'array', items: { type: 'string' } }, applicability: { type: 'object' }, finish: { type: 'object' }, sourceId: { type: 'string' }, sourceRevision: { type: 'number' }, sourceNativeWaterUnit: { type: 'string' }, sourceFormatVersion: { type: 'string' }, sourceConfiguration: { type: 'object' }, sourceLineage: { type: 'object' }, sourceProjection: { type: 'object' }, waterTemp: strictObject({ celsius: { type: 'number' }, fahrenheit: { type: 'number' } }), grindSize: strictObject({ setting: { anyOf: [{ type: 'number' }, { type: 'string' }] }, microns: { type: 'number' }, description: { type: 'string' }, grinderSpecific: { type: 'boolean' }, sourceExact: { type: 'boolean' } }), totalBrewTimeSeconds: { type: 'number' }, totalBrewTime: { type: 'string' }, guideTargetSeconds: { type: 'number' }, guideRangeSeconds: { type: 'array', items: { type: 'number' } }, timerReady: { type: 'boolean' }, phaseContractVersion: { type: 'number' }, candidate: { type: 'boolean' }, doseTimingPolicy: { type: 'string' }, timingProfile: { type: 'string' }, sourceRegistryVersion: { type: 'string' }, engineVersion: { type: 'string' }, rulesVersion: { type: 'string' }, reasonCodes: { type: 'array', items: { type: 'string' } }, fallback: { type: 'boolean' }, generationStatus: { type: 'string' }, reasoning: { type: 'string' }, tips: { type: 'string' }, title: { type: 'string' } });
const PROPOSAL_CONTROLS = Object.freeze(['dose', 'water', 'grind', 'temperature', 'ratio']);
const safeProposalExplanation = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > 280 || /[<>`]/.test(text)) return null;
  return text;
};
const cleanInventory = (coffee) => Object.fromEntries(['refKey', 'name', 'roaster', 'origin', 'region', 'process', 'status', 'jarSlot', 'recipes'].filter((key) => Object.hasOwn(coffee || {}, key)).map((key) => [key, clone(coffee[key])]));
const isCurrentCoffeeReference = (value) => /^(?:this|current)(?:\s+(?:coffee|bean|one))?$/i.test(String(value || '').trim());
const displaySlot = (slot) => ({ aiden: 'Aiden', v60_hot: 'hot V60', v60_iced: 'iced V60', kalita_hot: 'hot Kalita', kalita_iced: 'iced Kalita' }[slot] || slot);
const requestedKalitaSize = (text) => {
  const value = String(text || '');
  // Keep the recovery bound to an explicit size in this turn. The second
  // branch covers corrections such as “Actually I mean the 185”, where the
  // brewer name is carried by the prior turn rather than repeated here.
  return value.match(/\bkalita(?:\s+wave)?\s*(155|185)\b/i)?.[1]
    || value.match(/\b(?:actually|mean|meant|want|use|for)\b[\s\S]{0,30}\b(155|185)\b/i)?.[1]
    || value.match(/^\s*(155|185)[.!]?\s*$/)?.[1]
    || null;
};
const missingRecipeSummary = (slotKey, available = []) => {
  const otherSlots = available.filter((slot) => slot !== slotKey).map(displaySlot);
  const summary = `This coffee has no ${displaySlot(slotKey)} recipe${otherSlots.length ? `; it has ${otherSlots.join(' and ')}` : ''}.`;
  return `${summary} A new source-backed manual recipe can be prepared here in chat. Nothing was saved.`;
};

function forbidOwner(args) { if (args?.uid || args?.ownerId || args?.userId) throw Object.assign(new Error('owner identity is server-bound'), { code: 'forged_owner' }); }
function requireRef(args) { forbidOwner(args); if (!args?.coffeeRef || typeof args.coffeeRef !== 'string') throw Object.assign(new Error('coffee reference is required'), { code: 'coffee_required' }); }
function changedPaths(before, after, prefix = '') {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) || Array.isArray(after)) return Array.isArray(before) && Array.isArray(after) && canonicalHash(before) === canonicalHash(after) ? [] : [prefix];
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [prefix];
  const present = new Set(Object.keys(after));
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) => present.has(key) ? changedPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key) : []);
}
function recipeControl(path = '') {
  const root = String(path).split('.')[0];
  if (['coffeeGrams', 'userCoffeeGrams', 'dose'].includes(root)) return 'dose';
  if (['waterGrams', 'water'].includes(root)) return 'water';
  if (['grind', 'grindSize'].includes(root)) return 'grind';
  if (['temperature', 'temperatureC', 'waterTemp'].includes(root)) return 'temperature';
  return root;
}
function recipeSourceHash(recipe, slotKey) {
  if (!recipe) return absentRecipeSourceHash(slotKey);
  if (recipe?.selectedHash) return recipe.selectedHash;
  if (recipe?.recipeHash) return recipe.recipeHash;
  return canonicalRecipeSnapshot(recipe, slotKey).recipeHash;
}
function mergeRecipePatch(before, patch) {
  const result = clone(before);
  const merge = (target, source) => {
    for (const [key, value] of Object.entries(source || {})) {
      if (value == null) continue;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
        merge(target[key], value);
      } else target[key] = clone(value);
    }
  };
  merge(result, patch);
  return result;
}
function patchForChange(before, change) {
  const control = change?.control;
  const value = change?.value;
  if (!PROPOSAL_CONTROLS.includes(control) || !['string', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) return null;
  if (control === 'dose') return { [Object.hasOwn(before, 'coffeeGrams') ? 'coffeeGrams' : 'dose']: Number(value) };
  if (control === 'water') {
    const water = Number(value);
    if (!Number.isFinite(water) || water <= 0) return null;
    if (before.mode === 'hot' && before.isIced !== true) {
      const previousWater = Number(before.waterGrams ?? before.water);
      const dose = Number(before.coffeeGrams ?? before.dose);
      const patch = { [Object.hasOwn(before, 'waterGrams') ? 'waterGrams' : 'water']: water };
      for (const key of ['waterGrams', 'water']) if (Object.hasOwn(before, key)) patch[key] = water;
      if (Number.isFinite(dose) && dose > 0) {
        const ratio = Math.round(water / dose * 10) / 10;
        patch.ratio = typeof before.ratio === 'number' ? ratio : `1:${ratio}`;
      }
      // Reduce the final pour, not the bloom or earlier pulse schedule. Keep
      // cumulative-water instructions consistent with the timer's numbers.
      if (Array.isArray(before.steps)) patch.steps = before.steps.map((step) => step.waterTotal === previousWater ? {
        ...step,
        waterTotal: water,
        ...(typeof step.action === 'string' ? { action: step.action.replace(/\b(\d+(?:\.\d+)?)\s*g\b/gi, (match, amount) => Number(amount) === previousWater ? `${water}g` : match) } : {}),
      } : step);
      return patch;
    }
    const steps = Array.isArray(before.steps) && before.steps.length ? before.steps.map((step, index) => index === before.steps.length - 1 ? { ...step, waterTotal: water } : step) : undefined;
    return { [Object.hasOwn(before, 'waterGrams') ? 'waterGrams' : 'water']: water, ...(steps ? { steps } : {}) };
  }
  if (control === 'grind') {
    const setting = typeof value === 'string' ? value.match(/\d+(?:\.\d+)?/)?.[0] || value : value;
    return before.grindSize ? { grindSize: { setting } } : { grind: value };
  }
  if (control === 'temperature') {
    const celsius = Number(value);
    return before.waterTemp ? { waterTemp: { celsius, fahrenheit: Math.round(celsius * 9 / 5 + 32) } } : { temperature: celsius };
  }
  return { ratio: value };
}
function ratioNumber(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const match = String(value || '').match(/(?:1\s*[:/]\s*)?([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}
function doseRecipeIntent(before, dose) {
  const water = Number(before.waterGrams ?? before.water ?? before.finalBeverageWaterTargetGrams);
  const fixedWaterRatio = Number.isFinite(water) && water > 0 && Number.isFinite(dose) && dose > 0 ? water / dose : null;
  return {
    ...((fixedWaterRatio ?? ratioNumber(before.ratio)) != null ? { targetRatio: fixedWaterRatio ?? ratioNumber(before.ratio) } : {}),
    ...(Number.isFinite(before.waterTemp?.celsius) ? { targetTemperatureC: before.waterTemp.celsius } : {}),
  };
}
function v60DoseProfile(dose) {
  return dose <= 18 ? 'small-12-18' : dose <= 24 ? 'medium-19-24' : 'large-25-30';
}
function scaleBrewWaterCopy(value, scale) {
  return String(value || '').replace(/\b(\d+(?:\.\d+)?)\s*g\b/gi, (_match, amount) => `${Math.round(Number(amount) * scale)}g`);
}
function generatedDoseRecipe(before, slotKey, dose) {
  const intent = doseRecipeIntent(before, dose);
  const configuration = {
    dose,
    size: before.kalitaSize || before.size,
    kalitaSize: before.kalitaSize || before.size,
    roast: before.roast || 'medium',
    process: before.process || '',
    chillingMethod: before.chillingMethod || before.selectedChillingMethod,
  };
  let generated;
  try {
    generated = slotKey === 'v60_hot'
      ? (String(before.variant || before.v60Variant || '').toLowerCase() === 'switch' ? generateV60SwitchRecipe(intent, configuration) : generateV60Recipe(intent, configuration))
      : slotKey === 'v60_iced' ? generateV60IcedRecipe(intent, configuration)
        : slotKey === 'kalita_hot' ? generateKalitaRecipe(intent, configuration)
          : slotKey === 'kalita_iced' ? generateKalitaIcedRecipe(intent, configuration)
            : null;
  } catch {
    return null;
  }
  if (!generated) return null;
  const result = { ...clone(before), ...clone(generated) };
  // Dose is the only user-facing control. Preserve the existing grinder and
  // temperature choices while replacing every dose/water alias and generated
  // timed instruction from the canonical adapter output.
  for (const key of ['grind', 'grindSize', 'temperature', 'temperatureC', 'waterTemp', 'waterTemp2']) {
    if (Object.hasOwn(before, key)) result[key] = clone(before[key]);
  }
  for (const key of ['coffeeGrams', 'userCoffeeGrams', 'dose']) if (Object.hasOwn(before, key)) result[key] = dose;
  const waterAliases = {
    waterGrams: generated.waterGrams,
    water: generated.waterGrams,
    hotWaterGrams: generated.hotWaterGrams,
    recipeIceGrams: generated.recipeIceGrams,
    iceGrams: generated.iceGrams,
    initialBrewIceGrams: generated.initialBrewIceGrams,
    postBrewIceGrams: generated.postBrewIceGrams,
    finalBeverageWaterTargetGrams: generated.finalBeverageWaterTargetGrams,
  };
  for (const [key, value] of Object.entries(waterAliases)) if (Object.hasOwn(before, key) && value != null) result[key] = value;
  const fixedWater = Number(before.waterGrams ?? before.water);
  const generatedWater = Number(generated.waterGrams);
  if (Number.isFinite(fixedWater) && fixedWater > 0 && Number.isFinite(generatedWater) && generatedWater > 0 && !slotKey.endsWith('_iced')) {
    const waterScale = fixedWater / generatedWater;
    result.waterGrams = fixedWater;
    if (Object.hasOwn(before, 'water')) result.water = fixedWater;
    result.ratio = `1:${Math.round((fixedWater / dose) * 10) / 10}`;
    result.steps = (generated.steps || []).map((step, index, steps) => ({
      ...step,
      ...(Number.isFinite(step.waterTotal) ? { waterTotal: index === steps.length - 1 ? fixedWater : Math.round(step.waterTotal * waterScale) } : {}),
      ...(typeof step.action === 'string' ? { action: scaleBrewWaterCopy(step.action, waterScale) } : {}),
    }));
  }
  return result;
}
function completeDosePreview(before, preview, dose) {
  const result = { ...clone(before), ...clone(preview) };
  for (const key of ['coffeeGrams', 'userCoffeeGrams', 'dose']) if (Object.hasOwn(before, key)) result[key] = dose;
  const waterAliases = {
    waterGrams: preview.waterGrams,
    water: preview.waterGrams,
    hotWaterGrams: preview.hotWaterGrams,
    recipeIceGrams: preview.recipeIceGrams,
    iceGrams: preview.iceGrams,
    initialBrewIceGrams: preview.initialBrewIceGrams,
    postBrewIceGrams: preview.postBrewIceGrams,
    finalBeverageWaterTargetGrams: preview.finalBeverageWaterTargetGrams,
  };
  for (const [key, value] of Object.entries(waterAliases)) if (Object.hasOwn(before, key) && value != null) result[key] = value;
  return result;
}
function conditionalSensoryClarification(state) {
  const diagnosis = state?.diagnosis || {};
  const condition = [state?.conditionalOn, state?.diagnosisConditionalOn, diagnosis.conditionalOn, diagnosis.condition].filter(Boolean).join(' ');
  const pending = [state?.pendingSensoryClarification, diagnosis.pendingSensoryClarification, state?.pendingClarification, diagnosis.pendingClarification, state?.pendingQuestion, diagnosis.pendingQuestion].filter(Boolean);
  const pendingText = pending.map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join(' ');
  const sensory = state?.sensoryClarificationPending === true || diagnosis.sensoryClarificationPending === true || /sensory|taste|tasting|flavo[u]?r|cup/i.test(`${condition} ${pendingText}`);
  const conditional = state?.diagnosisConditional === true || diagnosis.conditional === true || diagnosis.status === 'conditional' || /conditional|pending|until|if/i.test(condition);
  return conditional && sensory && pending.length > 0;
}
function modelRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return null;
  const result = {};
  for (const key of Object.keys(RECIPE_PROPERTIES)) if (Object.hasOwn(recipe, key)) result[key] = clone(recipe[key]);
  return result;
}
function withoutMethodFocus(ledger) {
  if (!Array.isArray(ledger?.entries)) return ledger;
  return { ...ledger, entries: ledger.entries.filter((entry) => entry?.kind !== 'method_focus') };
}
function methodFocusForCoffee(ledger, snapshot, coffeeRef, verifiedCoffeeName = null) {
  const coffee = snapshot?.coffees?.find((item) => item.refKey === coffeeRef);
  const name = String(coffee?.name || verifiedCoffeeName || '').trim().toLocaleLowerCase();
  if (!name) return null;
  const entry = (Array.isArray(ledger?.entries) ? ledger.entries : []).slice().reverse().find((item) => item?.kind === 'method_focus' && item?.status === 'available' && Array.isArray(item.namedCoffees) && item.namedCoffees.some((value) => String(value).trim().toLocaleLowerCase() === name));
  return entry?.methodFocus?.displayName ? { displayName: entry.methodFocus.displayName } : null;
}
function recipeSlotKey(recipe) {
  const raw = recipe?.slotKey || recipe?.slot || recipe?.method;
  if (SLOT_KEYS.includes(raw)) return raw;
  const method = [raw, recipe?.method, recipe?.device].find((value) => value === 'v60' || value === 'kalita');
  if (method === 'v60' || method === 'kalita') return `${method}_${recipe?.mode === 'iced' ? 'iced' : 'hot'}`;
  return null;
}

function recipeRatio(recipe) {
  const value = recipe?.ratio ?? recipe?.finalBeverageRatio;
  if (Number.isFinite(Number(value))) return Number(value);
  const match = String(value || '').match(/(?:1\s*[:/]\s*)?([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function recipeWaterSummary(recipe = {}) {
  const native = recipe.sourceProjection?.water;
  if (native && ['g', 'mL'].includes(native.unit) && native.value != null) {
    const value = typeof native.value === 'object'
      ? `${native.value.min ?? '?'}–${native.value.max ?? '?'}`
      : native.value;
    return `${value}${native.unit}`;
  }
  if (Number.isFinite(recipe.waterMilliliters)) return `${recipe.waterMilliliters}mL`;
  const grams = recipe.waterGrams ?? recipe.water;
  return grams == null ? '?' : `${grams}g`;
}

function trialDisplaySlot(slotKey, recipe = {}) {
  const projection = recipe.sourceProjection;
  const configuration = projection?.sourceConfiguration || projection?.equipment || {};
  const size = configuration.size || recipe.v60Size || recipe.kalitaSize || null;
  const switchRecipe = configuration.brewer === 'switch'
    || (configuration.device === 'v60' && configuration.variant === 'switch')
    || recipe.variant === 'switch';
  if (switchRecipe) return `Switch${size ? ` ${size}` : ''}`;
  if (configuration.brewer === 'kalita' || recipe.device === 'kalita') return `Kalita${size ? ` ${size}` : ''}`;
  if (configuration.brewer === 'v60' || recipe.device === 'v60') return `V60${size ? ` ${size}` : ''}`;
  return displaySlot(slotKey);
}

function techniqueIdentity(recipe = {}) {
  return {
    currentFamilyId: recipe.sourceLineage?.familyId || recipe.sourceLineage?.technique || recipe.technique || null,
    currentTechniqueId: recipe.sourceLineage?.technique || recipe.technique || null,
    currentSourceId: recipe.sourceProjection?.sourceId || recipe.sourceLineage?.sourceIds?.[0] || recipe.sourceId || null,
  };
}

function techniqueKey(coffeeRef, slotKey) { return `${coffeeRef}:${slotKey}`; }

// The endpoint projects the current session's recipe-proposal artifacts before
// the tools resolve an off-rotation coffee. Once that coffee is owner-verified,
// merge only the matching bounded proposals into the in-memory selection map.
// This keeps the contextual "another one" gate target-bound without treating
// arbitrary prose as technique history.
function hydrateTechniqueSelection(context, { coffeeRef, coffeeId, slotKey } = {}) {
  if (!context || !coffeeRef || !coffeeId || !['v60_hot', 'kalita_hot'].includes(slotKey)) return null;
  if (!(context.__ruphusTechniqueSelections instanceof Map)) {
    Object.defineProperty(context, '__ruphusTechniqueSelections', { value: new Map(), enumerable: false, writable: true, configurable: true });
  }
  const key = techniqueKey(coffeeRef, slotKey);
  const prior = context.__ruphusTechniqueSelections.get(key) || { selectedIds: [], proposalIds: [] };
  const proposals = Array.isArray(context.__ruphusPriorProposals) ? context.__ruphusPriorProposals : [];
  const retained = proposals.filter((proposal) => proposal?.type === 'recipe_proposal'
    && proposal.coffeeId === coffeeId
    && proposal.slotKey === slotKey
    && ['v60_technique', 'manual_source_technique'].includes(proposal.techniqueExperiment?.kind));
  if (!retained.length) return prior;
  const selectedIds = [...new Set([
    ...(Array.isArray(prior.selectedIds) ? prior.selectedIds : []),
    ...retained.flatMap((proposal) => [
      proposal.techniqueExperiment?.techniqueId,
      proposal.techniqueExperiment?.familyId,
      proposal.techniqueExperiment?.sourceId,
    ]).filter(Boolean),
  ])];
  const proposalIds = [...new Set([
    ...(Array.isArray(prior.proposalIds) ? prior.proposalIds : []),
    ...retained.map((proposal) => typeof proposal.id === 'string' ? proposal.id.trim() : '').filter(Boolean),
  ])];
  const hydrated = { ...prior, selectedIds, proposalIds };
  context.__ruphusTechniqueSelections.set(key, hydrated);
  return hydrated;
}

function safeTechniqueAdaptation(value) {
  return String(value || '').replace(/\s+through\s+v60-dose-scaling-v1\.?/i, ' through the app’s supported dose range.');
}

function sourceConfigurationForRecipe(recipe = {}) {
  const projectionConfiguration = recipe.sourceProjection?.sourceConfiguration || recipe.sourceConfiguration || {};
  const configurationKey = String(recipe.configurationKey || '');
  const kalitaKey = configurationKey.match(/^kalita:(155|185):wave-paper:hot$/i);
  const switchKey = configurationKey.match(/^v60:(02|03):standard-paper:switch:hot$/i);
  const size = projectionConfiguration.size
    || recipe.v60Size
    || recipe.kalitaSize
    || recipe.size
    || kalitaKey?.[1]
    || switchKey?.[1];
  const defaults = recipe.device === 'kalita' && kalitaKey
    ? { model: 'Wave', filter: `wave-${kalitaKey[1]}` }
    : recipe.device === 'v60' && (recipe.variant || recipe.v60Variant) === 'switch' && switchKey
      ? { model: 'V60 Switch', filter: `v60-${switchKey[1]}-paper` }
      : {};
  return {
    ...projectionConfiguration,
    device: projectionConfiguration.device || recipe.device,
    variant: projectionConfiguration.variant || recipe.variant || recipe.v60Variant,
    mode: projectionConfiguration.mode || recipe.mode || (recipe.isIced ? 'iced' : 'hot'),
    size,
    ...(defaults.model && !projectionConfiguration.model && !recipe.model ? { model: defaults.model } : {}),
    ...(defaults.filter && !projectionConfiguration.filter && !recipe.filter ? { filter: defaults.filter } : {}),
    ...(Number.isFinite(recipe.coffeeGrams) ? { dose: recipe.coffeeGrams } : {}),
    ...(recipe.sourceProjection?.sourceRevision != null ? { sourceRevision: recipe.sourceProjection.sourceRevision } : {}),
  };
}

function sourceFormatSupported(context) {
  // Direct tool tests and internal callers predate the client capability field;
  // the authenticated endpoint installs an explicit boolean for every request.
  return context?.__ruphusSourceFormatCapability !== false;
}

export function isExplicitTechniqueReuseRequest(value = '') {
  const text = String(value || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  if (!text) return false;
  const reference = /\b(?:first|1st|second|2nd|third|3rd|last|that|those|kurasu|fuglen|foundation|vibrant|onyx|ozone|hario|matt)\b/i.test(text);
  const explicitVerb = /\b(?:use|try|brew|prepare|make|pick|choose|revisit|repeat)\b/i.test(text);
  const namedRepeat = /\bshow\b[\s\S]*\b(?:again|back|repeat)\b/i.test(text)
    && !/\b(?:first|1st|second|2nd|third|3rd|last|that|those)\b/i.test(text);
  return reference && (explicitVerb || namedRepeat);
}

const CONTEXTUAL_TECHNIQUE_FOLLOWUP = /^(?:show|give)\s+me\s+(?:another|a\s+different)\s+(?:one|option)[.!?]?$/i;

// A bare alternative request is actionable only when the authenticated
// session contains a delivered source-backed card for the exact target. This
// keeps "Show me another one" out of the global classifier while allowing a
// same-conversation continuation to reuse the target and choose a fresh
// option. The endpoint installs this map from owner-scoped session artifacts.
export function isContextualTechniqueFollowupRequest(value = '', context = {}, target = {}) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!CONTEXTUAL_TECHNIQUE_FOLLOWUP.test(text)) return false;
  const coffeeRef = target?.coffeeRef || target?.coffeeRefKey || context?.proposalState?.target?.coffeeRef || null;
  const slot = target?.slot || target?.slotKey || context?.proposalState?.target?.slot || context?.proposalState?.target?.slotKey || null;
  if (!coffeeRef || !['v60_hot', 'kalita_hot'].includes(slot)) return false;
  const selection = context?.__ruphusTechniqueSelections instanceof Map
    ? context.__ruphusTechniqueSelections.get(`${coffeeRef}:${slot}`)
    : null;
  return Array.isArray(selection?.selectedIds) && selection.selectedIds.length > 0
    && Array.isArray(selection?.proposalIds) && selection.proposalIds.length > 0;
}

function sourceRouteForRecipe(recipe = {}, slotKey) {
  if (!['v60_hot', 'kalita_hot'].includes(slotKey) || !recipe || typeof recipe !== 'object') return null;
  const configuration = sourceConfigurationForRecipe(recipe);
  const device = String(configuration.device || recipe.device || '').toLowerCase();
  const mode = String(configuration.mode || recipe.mode || (recipe.isIced ? 'iced' : 'hot')).toLowerCase();
  const variant = String(configuration.variant || recipe.variant || recipe.v60Variant || 'classic').toLowerCase();
  const size = String(configuration.size || '');
  const configurationKey = String(recipe.configurationKey || '');
  if (slotKey === 'kalita_hot' && device === 'kalita' && mode === 'hot' && recipe.isIced !== true) {
    const expectedKey = `kalita:${size}:wave-paper:hot`;
    const supportedSize = ['155', '185'].includes(size);
    const exactFilter = configuration.filter == null || configuration.filter === `wave-${size}`;
    const exactModel = configuration.model == null || configuration.model === 'Wave';
    const keyMatches = recipe.sourceProjection?.projectionVersion
      ? true
      : !configurationKey || configurationKey === expectedKey;
    return { kind: 'manual_source_technique', supported: supportedSize && exactFilter && exactModel && keyMatches, configuration, reason: supportedSize ? 'This saved Kalita recipe is not an exact Wave 155/185 configuration.' : 'Source alternatives are available only for an exact hot Kalita Wave 155 or 185 configuration.' };
  }
  if (slotKey === 'v60_hot' && device === 'v60' && variant === 'switch' && mode === 'hot' && recipe.isIced !== true) {
    const expectedKey = `v60:${size}:standard-paper:switch:hot`;
    const supportedSize = size === '03';
    const exactFilter = configuration.filter == null || configuration.filter === `v60-${size}-paper`;
    const exactModel = configuration.model == null || configuration.model === 'V60 Switch';
    const keyMatches = recipe.sourceProjection?.projectionVersion
      ? true
      : !configurationKey || configurationKey === expectedKey;
    return { kind: 'manual_source_technique', supported: supportedSize && exactFilter && exactModel && keyMatches, configuration, reason: supportedSize ? 'This saved Switch recipe is not an exact ribbed Switch 03 configuration.' : 'Source alternatives are available only for the exact ribbed Switch 03 configuration.' };
  }
  return null;
}

function capabilityGatedSourceOptions(options, supported) {
  if (supported) return options;
  return options.map((option) => ({
    ...option,
    executable: false,
    timerReady: false,
    referenceOnly: true,
    capabilityRequired: 'technique_experiment_v1',
    reason: [option.reason, 'Update the app before starting this source-backed schedule.'].filter(Boolean).join('; '),
  }));
}

const sourceReferenceOrdinal = (text) => {
  const value = String(text || '').toLowerCase();
  if (/\b(?:first|1st)\b/.test(value)) return 0;
  if (/\b(?:second|2nd)\b/.test(value)) return 1;
  if (/\b(?:third|3rd)\b/.test(value)) return 2;
  if (/\blast\b/.test(value)) return -1;
  return null;
};

// Ordinal inspection is a read-only history affordance. Keep it separate from
// explicit use/try/brew language, which may earn a fresh current-base proposal.
const TECHNIQUE_HISTORY_INSPECTION = /^(?:(?:show|give|tell|describe|inspect|review|open)\s+(?:me\s+)?)*(?:the\s+)?(?:first|1st|second|2nd|third|3rd|last)\s+(?:one|option|technique|method|card|recipe)(?:\s+(?:again|back|repeat))?[.!?]?$/i;

export function isHistoricalTechniqueInspectionRequest(value = '') {
  const text = String(value || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  return TECHNIQUE_HISTORY_INSPECTION.test(text);
}

const TECHNIQUE_REFERENCE_FILLERS = new Set(['a', 'an', 'the', 'try', 'use', 'brew', 'prepare', 'make', 'pick', 'choose', 'revisit', 'repeat', 'show', 'me', 'technique', 'method', 'recipe', 'source', 'for', 'with', 'on', 'using', 'switch', 'v60', 'kalita', 'hario', 'hot', 'iced', 'cold', 'full']);
const techniqueReferenceTokens = (value) => String(value || '').toLocaleLowerCase().match(/[a-z0-9]+/g) || [];
const reviewHasNamedTechniqueToken = (text, review) => {
  const requested = new Set(techniqueReferenceTokens(text));
  const reviewed = techniqueReferenceTokens([review?.name, review?.sourceId, review?.familyId].filter(Boolean).join(' '));
  return reviewed.some((token) => token.length > 2 && !TECHNIQUE_REFERENCE_FILLERS.has(token) && requested.has(token));
};
const hasUnmatchedTechniqueDescription = (text) => /\b(?:immersion|hybrid|bloom|pulse(?:s|d)?|continuous|steep(?:ing)?|batch|pour(?:s|ing)?|drain|release|valve)\b/i.test(text);

function explicitSourceReference(context, slotKey, coffeeRef = null) {
  const text = String(context?.userText || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  if (!text || !isExplicitTechniqueReuseRequest(text)) return null;
  const reviews = (Array.isArray(context?.proposalReviews) ? context.proposalReviews : [])
    .filter((review) => review?.slot === slotKey && typeof review?.sourceId === 'string' && review.sourceId);
  const ordinal = sourceReferenceOrdinal(text);
  const scopedReviews = coffeeRef ? reviews.filter((review) => review.coffeeRef === coffeeRef) : reviews;
  if (ordinal != null && !coffeeRef) {
    const reviewByCoffee = [...new Set(reviews.map((review) => review.coffeeRef).filter(Boolean))]
      .map((ref) => {
        const perCoffee = reviews.filter((review) => review.coffeeRef === ref);
        return ordinal === -1 ? perCoffee.at(-1) : perCoffee[ordinal];
      })
      .filter(Boolean);
    if (reviewByCoffee.length > 1) return { status: 'ambiguous', candidates: reviewByCoffee.map((review) => ({ coffeeRef: review.coffeeRef, name: review.name || review.sourceId, ordinal: review.ordinal })) };
  }
  const namedRepeat = /\b(?:again|back|repeat)\b/i.test(text);
  let candidates = ordinal == null
    ? scopedReviews.filter((review) => {
      const firstWord = String(review.name || '').trim().split(/\s+/)[0];
      const firstWordMatch = firstWord && new RegExp(`\\b${firstWord.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i').test(text);
      return reviewHasNamedTechniqueToken(text, review) || (namedRepeat && firstWordMatch);
    })
    : [ordinal === -1 ? scopedReviews.at(-1) : scopedReviews[ordinal]].filter(Boolean);
  candidates = candidates.filter((review) => review.coffeeRef && review.sourceId);
  const coffeeRefs = [...new Set(candidates.map((review) => review.coffeeRef))];
  if (coffeeRefs.length > 1) return { status: 'ambiguous', candidates: candidates.map((review) => ({ coffeeRef: review.coffeeRef, name: review.name || review.sourceId, ordinal: review.ordinal })) };
  const review = candidates.at(-1);
  // A descriptive technique name can identify a different catalog option even
  // when its vendor (for example HARIO) is also the first word of an earlier
  // delivered card. Let the current source-option reader handle that request;
  // ordinal and explicit repeat requests retain historical-card semantics.
  if (!review && ordinal == null && !namedRepeat && hasUnmatchedTechniqueDescription(text)) return null;
  return review ? {
    status: 'matched',
    sourceId: review.sourceId,
    sourceRevision: review.sourceRevision,
    familyId: review.familyId || review.techniqueExperiment?.familyId || null,
    proposalId: review.proposalId || review.artifactId || null,
    name: review.name || review.sourceId,
    coffeeRef: review.coffeeRef,
  } : { status: 'missing' };
}

function historicalInspectionArtifact(context, { coffeeRef, coffeeId, slotKey } = {}) {
  if (!isHistoricalTechniqueInspectionRequest(context?.userText)
    || !coffeeRef || !coffeeId || !['v60_hot', 'kalita_hot'].includes(slotKey)) return null;
  const reviews = (Array.isArray(context?.proposalReviews) ? context.proposalReviews : [])
    .filter((review) => review?.coffeeRef === coffeeRef
      && review?.slot === slotKey
      && (review?.sourceId || ['v60_technique', 'manual_source_technique'].includes(review?.techniqueExperiment?.kind))
      && (review?.proposalId || review?.artifactId));
  const ordinal = sourceReferenceOrdinal(context.userText);
  const review = ordinal === -1 ? reviews.at(-1) : ordinal == null ? null : reviews[ordinal];
  if (!review) return { status: 'missing' };
  const proposalId = review.proposalId || review.artifactId;
  const proposals = Array.isArray(context?.__ruphusPriorProposals) ? context.__ruphusPriorProposals : [];
  const artifact = proposals.find((candidate) => candidate?.type === 'recipe_proposal'
    && candidate.id === proposalId
    && candidate.coffeeId === coffeeId
    && candidate.slotKey === slotKey
    && ['v60_technique', 'manual_source_technique'].includes(candidate.techniqueExperiment?.kind)
    && ((candidate.sourceState === 'absent' && candidate.before === null) || (candidate.before && typeof candidate.before === 'object' && !Array.isArray(candidate.before)))
    && candidate.after && typeof candidate.after === 'object' && !Array.isArray(candidate.after));
  if (!artifact) return { status: 'missing' };
  const sourceIds = [
    artifact.techniqueExperiment?.sourceId,
    artifact.after?.sourceId,
    artifact.after?.sourceLineage?.sourceId,
    artifact.after?.sourceProjection?.sourceId,
  ].filter((value) => typeof value === 'string' && value);
  if (review.sourceId && !sourceIds.includes(review.sourceId)) return { status: 'missing' };
  return {
    status: 'matched',
    review,
    // Re-emit the authenticated original by ID, but make this copy inert so
    // the existing card renderer opens HistoricalRecipeInspector instead of a
    // mutable preview. The persisted source artifact remains untouched.
    artifact: { ...clone(artifact), status: 'superseded', historyOnly: true, actions: [] },
  };
}

export function diagnosticRecommendationReady(text = '', conversation = []) {
  const value = String(text || '');
  if (/\b(?:don't|do not|not yet|wait|instead|what if|explain|why)\b/i.test(value)) return false;
  const weakness = /\b(?:watery|weak|flat|hollow|thin|diluted|washed out)\b/i.test(value);
  const weaknessAnswer = /^\s*(?:it\s+(?:was|is)\s+)?(?:watery|weak|flat|hollow|thin|diluted|washed out)\s*[.!?]?\s*$/i.test(value);
  const sensory = /\b(?:sweet|clean|sour|sharp|muted|bitter|harsh|dry|astringent)\b/i.test(value);
  const directControl = /\b(?:dose|ratio|water|grind|temperature|heat)\b[^.!?]{0,60}\b(?:change|adjust|increase|decrease|try|test|use|move|raise|lower|more|less|finer|coarser)\b/i.test(value);
  const priorClarifier = [...(Array.isArray(conversation) ? conversation : [])].reverse().find((message) => message?.role === 'assistant')?.content || '';
  const reviewFollowup = /\b(?:show|view|open|prepare|update)\b[^.!?]{0,40}\brecipe\b/i.test(value)
    && /\b(?:finer|coarser|increase|decrease|reduce|raise|lower|change|try)\b/i.test(priorClarifier)
    && /\d/.test(priorClarifier);
  const extractionReport = /\b(?:sour|sharp|muted|bitter|harsh|dry|astringent)\b/i.test(value)
    && !/\?|\b(?:if|might|maybe|usually|sometimes)\b/i.test(value);
  const askedSensoryClarifier = /\?/.test(priorClarifier) && /\b(?:thin|sweet|clean|sour|sharp|muted|bitter|harsh|flat|watery|weak|hollow)\b/i.test(priorClarifier);
  return reviewFollowup || extractionReport || (weakness && sensory) || directControl || (weaknessAnswer && !sensory && askedSensoryClarifier) || answeredSensoryClarifier(value, conversation);
}

function setPreviewReadiness(context, { coffeeRef, slotKey, recipe } = {}) {
  if (!context?.proposalState || !recipe || !coffeeRef || !['v60_hot', 'kalita_hot'].includes(slotKey)) return;
  // Technique exploration is a separate typed experiment. Listing source
  // options must not masquerade as an ordinary diagnostic preview, because a
  // catalog with no selected option is not a card-ready proposal.
  if (diagnosticRecommendationReady(context.userText, context.conversation) && !isTechniqueExplorationRequest(context.userText)) {
    context.proposalState.previewReady = true;
    context.proposalState.diagnosisReady = true;
    context.proposalState.userAgreed = true;
    context.proposalState.target = context.proposalState.target || { coffeeRef, slot: slotKey };
  }
}

function setTechniqueReadiness(context, { coffeeRef, slotKey, recipe, sourceRecipe = recipe, configurationRequested = false, options = [], kind = 'v60_technique', intent = null } = {}) {
  // A source-backed preview is not a save. Let the model interpret ordinary
  // requests semantically; keep source/target validation here. Legacy callers
  // and trusted equipment continuations can still omit intent.
  if (intent === 'information') return;
  const techniqueIntent = intent === 'recipe_preview' || isTechniqueExplorationRequest(context?.userText)
    || Boolean(context?.equipmentAnswer?.slot === slotKey)
    || isExplicitTechniqueReuseRequest(context?.userText)
    || isContextualTechniqueFollowupRequest(context?.userText, context, { coffeeRef, slot: slotKey })
    || (configurationRequested && /\b(?:try|show|give|make|prepare|brew|use|instead|actually|mean|meant|want)\b|^\s*(?:155|185|0?[23])[.!]?\s*$/i.test(context?.userText || ''));
  if (!context?.proposalState || !recipe || !coffeeRef || !['v60_hot', 'kalita_hot'].includes(slotKey)
    || !techniqueIntent
    || !options.length) return;
  const sourceHash = recipeSourceHash(sourceRecipe, slotKey);
  const optionIds = options.flatMap((option) => [option.id, option.familyId, option.sourceId]).filter(Boolean);
  context.proposalState.techniqueReady = { coffeeRef, slot: slotKey, sourceHash, kind, optionIds: [...new Set(optionIds)] };
  context.proposalState.target = { coffeeRef, slot: slotKey };
}

// Equipment for the draft is not the saved recipe's lineage. A corrected
// brewer may use a complete audited source without rewriting the before-state.
function techniqueDraftRecipe(context, saved, slotKey, coffeeId) {
  const text = String(context.userText || '');
  const equipmentAnswer = context.equipmentAnswer || equipmentClarificationAnswer(text, context.conversation || []);
  const sizeAnswer = equipmentAnswer?.variant === 'switch';
  const prior = (context.__ruphusPriorProposals || []).filter(item => item.coffeeId === coffeeId && item.slotKey === slotKey && item.after && item.techniqueExperiment).at(-1)?.after;
  const followup = isAlternativeRequest(text) || isContextualTechniqueFollowupRequest(text, context, { slot: slotKey });
  const current = followup && prior ? prior : saved;
  const explicitDose = text.match(/\b(\d+(?:\.\d+)?)\s*(?:g|grams)\s+(?:of\s+)?coffee\b/i)?.[1];
  if (slotKey === 'kalita_hot') {
    const requestedSize = equipmentAnswer?.slot === 'kalita_hot' ? equipmentAnswer.size : requestedKalitaSize(text);
    const size = requestedSize || current?.kalitaSize || current?.size;
    if (!size) return { message: 'Which Kalita Wave are you using—the 155 or the 185?' };
    if (current && String(current.kalitaSize || current.size) === String(size)) return { recipe: current, configurationRequested: Boolean(requestedSize) };
    return { recipe: { device: 'kalita', method: 'kalita', mode: 'hot', isIced: false, kalitaSize: String(size), configurationKey: `kalita:${size}:wave-paper:hot`, ...(explicitDose ? { coffeeGrams: Number(explicitDose) } : {}) }, configurationRequested: Boolean(requestedSize) };
  }
  const requestedVariant = sizeAnswer ? 'switch' : explicitMethodVariantFromText(text);
  const variant = requestedVariant || (current?.variant === 'switch' || current?.v60Variant === 'switch' ? 'switch' : 'classic');
  const currentVariant = current?.variant === 'switch' || current?.v60Variant === 'switch' ? 'switch' : 'classic';
  const namedSize = sizeAnswer ? equipmentAnswer.size : text.match(/\b(?:switch|v60)\s*(0?[123])\b/i)?.[1];
  const size = namedSize ? namedSize.padStart(2, '0') : current && currentVariant === variant ? current.v60Size || '02' : variant === 'classic' ? '02' : null;
  if (!size) return { message: 'Which Switch size are you using—02 or 03? I can prepare the recipe here once I know.' };
  if (current && currentVariant === variant && String(current.v60Size || '02') === size) return { recipe: current, configurationRequested: Boolean(requestedVariant || namedSize) };
  return { recipe: { device: 'v60', method: 'v60', mode: 'hot', isIced: false, variant, v60Size: size, configurationKey: variant === 'switch' ? `v60:${size}:standard-paper:switch:hot` : `v60:${size}:standard-paper`, ...(explicitDose ? { coffeeGrams: Number(explicitDose) } : {}) }, configurationRequested: Boolean(requestedVariant || namedSize) };
}

function techniqueReadinessMatches(context, { coffeeRef, slotKey, target = null, kind = null } = {}) {
  const ready = context?.proposalState?.techniqueReady;
  return Boolean(ready?.coffeeRef === coffeeRef
    && ready?.slot === slotKey
    && (!kind || !ready.kind || ready.kind === kind)
    && (!target?.sourceHash || !ready.sourceHash || ready.sourceHash === target.sourceHash));
}

export function createRuphusTools({ uid, context, readers = {}, proposalStore, canPropose = true, proposalActions = [] } = {}) {
  if (!uid || !context) throw new Error('tools require owner and context');
  if (!(context.__ruphusResolvedTargets instanceof Map)) Object.defineProperty(context, '__ruphusResolvedTargets', { value: new Map(), enumerable: false, writable: true, configurable: true });
  const snapshot = context.__ruphusServerSnapshot || context.rotationSnapshot || { coffees: [], refs: {} };
  const refs = context.__ruphusRefs ? { ...context.__ruphusRefs } : { ...(snapshot.refs || {}) };
  const resolveId = (coffeeRef) => refs[coffeeRef] || null;
  const rememberTarget = (target) => {
    const key = `${target.coffeeRef}:${target.slotKey}`;
    const previous = context.__ruphusResolvedTargets.get(key);
    // Independent reads can complete in either order. Preserve enrichment
    // only for the identical owner-bound recipe snapshot, never across drift.
    const sameSource = previous?.coffeeId === target.coffeeId && previous?.sourceHash === target.sourceHash;
    context.__ruphusResolvedTargets.set(key, {
      ...target,
      ...(sameSource && previous.discoveryRecipe && !target.discoveryRecipe ? { discoveryRecipe: previous.discoveryRecipe } : {}),
      ...(sameSource && previous.techniqueOptions && !target.techniqueOptions
        ? { techniqueOptions: previous.techniqueOptions } : {}),
    });
  };
  const list = async () => {
    const coffees = typeof readers.listCoffees === 'function' ? await readers.listCoffees({ uid }) : snapshot.coffees || [];
    return Array.isArray(coffees) ? coffees : [];
  };
  const readRecipe = async (coffeeId, slotKey, coffeeRef) => {
    if (!SLOT_KEYS.includes(slotKey)) return null;
    const item = context.__ruphusLaunchContext?.launchItem;
    const launchItem = context.launchCoffeeId === coffeeRef
      && item?.kind === 'recipe'
      && item.method === slotKey
      ? item
      : null;
    if (typeof readers.readRecipe === 'function') return readers.readRecipe({ uid, coffeeId, slotKey, launchItem });
    return null;
  };
  const call = async (name, args = {}) => {
    if (!RUPHUS_READ_TOOL_NAMES.includes(name)) throw Object.assign(new Error(`tool unavailable: ${name}`), { code: 'tool_unavailable' });
    forbidOwner(args);
    if (name === 'resolve_coffee') {
      if (typeof args.reference !== 'string' || !args.reference.trim()) throw Object.assign(new Error('reference is required'), { code: 'invalid_tool_input' });
      const binding = context.__ruphusTurnBinding;
      if (binding?.status === 'locked' && binding.coffeeRef && binding.coffee?.id && refs[binding.coffeeRef] === binding.coffee.id) {
        const coffee = cleanInventory({ ...binding.coffee, refKey: binding.coffeeRef });
        return { ok: true, coffeeRef: binding.coffeeRef, coffee, match: 'turn_binding' };
      }
      if (binding?.status === 'ambiguous') {
        return { ok: false, reason: 'ambiguous', candidates: (binding.candidates || []).map((item) => ({ name: item.coffeeName, refKey: item.coffeeRef })) };
      }
      const inventory = await list();
      const lastNamedCoffee = Array.isArray(context.ledger?.namedCoffees) ? context.ledger.namedCoffees.at(-1) : null;
      const contextualReference = isCurrentCoffeeReference(args.reference)
        ? (typeof lastNamedCoffee === 'string' ? lastNamedCoffee : lastNamedCoffee?.name) || refs[context.launchCoffeeId] || context.launchCoffeeId
        : args.reference;
      const result = resolveCoffeeReference({ reference: contextualReference, coffees: inventory, ledger: context.ledger });
      if (!result.ok) return { ok: false, reason: result.reason, candidates: (result.candidates || []).map((item) => cleanInventory(item.coffee)) };
      const resolvedRef = Object.entries(refs).find(([, id]) => id === result.coffee?.id)?.[0] || result.ref;
      if (result.coffee?.id && !refs[resolvedRef]) refs[resolvedRef] = result.coffee.id;
      // A successful resolver call is authoritative focus evidence even when
      // the model answers without reading the composite evidence tool. Keep
      // only owner-inventory fields in the replay ledger so the next turn's
      // pronouns follow the latest confirmed coffee without persisting refs.
      const resolvedCoffee = cleanInventory({ ...result.coffee, refKey: resolvedRef });
      context.ledger = appendLedger(context.ledger, {
        kind: 'coffee_focus',
        status: 'available',
        namedCoffees: resolvedCoffee.name ? [resolvedCoffee.name] : [],
        ...(resolvedCoffee.name ? { coffee: resolvedCoffee } : {}),
      }, { maxBytes: Math.min(context.__ruphusEvidenceByteCap || MAX_LEDGER_BYTES, MAX_LEDGER_BYTES) });
      if (context.launchCoffeeId && resolvedRef !== context.launchCoffeeId) context.__ruphusLaunchHintConsumed = true;
      return { ok: true, coffeeRef: resolvedRef, coffee: resolvedCoffee, match: result.source };
    }
    requireRef(args);
    const coffeeId = resolveId(args.coffeeRef);
    if (!coffeeId) throw Object.assign(new Error('coffee reference is outside the current owner-scoped context'), { code: 'cross_owner_or_context' });
    if (name === 'read_coffee_evidence') {
      const verifiedLaunchItem = context.launchCoffeeId === args.coffeeRef ? context.__ruphusLaunchContext?.launchItem || null : null;
      const launchItem = context.__ruphusLaunchHintConsumed ? null : verifiedLaunchItem;
      const trustedWiden = context.historyWidened === true || context.__ruphusHistoryWidened === true;
      const evidence = await readCoffeeEvidence({ uid, coffeeId, launchItem: verifiedLaunchItem, readers, windowDays: trustedWiden ? null : args.windowDays, now: args.now, timeoutMs: args.timeoutMs });
      const snapshotCoffee = snapshot.coffees?.find((coffee) => coffee.refKey === args.coffeeRef);
      const methodCorrected = /\b(?:actually|no[, ]|correction|instead|i (?:meant|brewed|used)|it was)\b[\s\S]*\b(?:aiden|v60|kalita|hot|iced)\b/i.test(context.userText || '');
      if (methodCorrected) context.__ruphusLaunchHintConsumed = true;
      const methodFocus = methodFocusForCoffee(context.ledger, snapshot, args.coffeeRef, evidence.coffee?.coffee?.name);
      const method = resolveMethod({
        userText: context.userText || '',
        explicitSlot: context.equipmentAnswer?.slot,
        launchItem,
        launchCoffeeRef: context.launchCoffeeId,
        coffeeRef: args.coffeeRef,
        recipeSlots: snapshotCoffee?.recipes || [],
        recipes: evidence.recipe?.records || [],
        brews: evidence.brews?.records || [],
        tastings: evidence.tastings?.records || [],
        defaultMethod: snapshot.setup?.defaultMethod,
        now: args.now,
        historyDays: evidence.windowDays,
        launchHintConsumed: methodCorrected || context.__ruphusLaunchHintConsumed === true,
        methodCorrected,
        // Launch origin is not the previous conversational focus. A verified
        // same-coffee method memory survives subsequent turns after a switch.
        focusChanged: Boolean(!methodFocus && context.launchCoffeeId && context.launchCoffeeId !== args.coffeeRef),
        methodFocus,
        methodFocusCoffeeRef: methodFocus ? args.coffeeRef : null,
      });
      if (launchItem) context.__ruphusLaunchHintConsumed = true;
      const ledgerBytes = Math.min(context.__ruphusEvidenceByteCap || MAX_LEDGER_BYTES, MAX_LEDGER_BYTES);
      context.ledger = appendLedger(withoutMethodFocus(context.ledger), ledgerEntryFromEvidence(evidence, { coffee: evidence.coffee?.coffee }), { maxBytes: ledgerBytes });
      if (method?.slot && method?.displayName) {
        context.ledger = appendLedger(context.ledger, {
          kind: 'method_focus',
          status: 'available',
          namedCoffees: evidence.coffee?.coffee?.name ? [evidence.coffee.coffee.name] : snapshotCoffee?.name ? [snapshotCoffee.name] : [],
          methodFocus: { displayName: method.displayName },
        }, { maxBytes: ledgerBytes });
      }
      const target = method?.slot ? evidence.recipe?.records?.find((item) => recipeSlotKey(item) === method.slot) : null;
      if (target && context.__ruphusResolvedTargets instanceof Map) {
        const slotKey = recipeSlotKey(target);
        rememberTarget({ coffeeRef: args.coffeeRef, coffeeId, slotKey, before: modelRecipe(target), sourceHash: recipeSourceHash(target, slotKey) });
        if (context.proposalState && !context.proposalState.target) context.proposalState.target = { coffeeRef: args.coffeeRef, slot: slotKey };
        setPreviewReadiness(context, { coffeeRef: args.coffeeRef, slotKey, recipe: target });
      }
      // Diagnosis needs the same canonical numbers and pours as proposal creation.
      // Keep only the resolved brewer's allowlisted recipe in this ephemeral tool
      // result; raw records and source authority remain server-only, not in memory.
      return { ...publicEvidence(evidence), method, coffeeRef: args.coffeeRef, selectedRecipe: modelRecipe(target) };
    }
    const slotKey = args.slot || args.slotKey;
    if (name === 'read_technique_options') {
      if (args.intent != null && !['recipe_preview', 'information'].includes(args.intent)) return { ok: false, actionable: false, code: 'invalid_recipe_intent', message: 'I could not determine whether to explain this technique or prepare a recipe.' };
      if (!['v60_hot', 'kalita_hot'].includes(slotKey)) return { ok: false, actionable: false, code: 'unsupported_technique_brewer', message: 'Technique exploration is available for a saved hot V60, Kalita, or Switch recipe.' };
      const historical = historicalInspectionArtifact(context, { coffeeRef: args.coffeeRef, coffeeId, slotKey });
      if (historical?.status === 'matched') {
        return {
          ok: true,
          actionable: false,
          historical: true,
          sourceOptions: true,
          coffeeRef: args.coffeeRef,
          slot: slotKey,
          options: [],
          artifact: historical.artifact,
          message: `Here’s ${historical.review.name || 'that earlier technique'} as a read-only recipe.`,
        };
      }
      if (historical?.status === 'missing') {
        return {
          ok: true,
          actionable: false,
          historical: true,
          sourceOptions: true,
          coffeeRef: args.coffeeRef,
          slot: slotKey,
          options: [],
          message: 'I could not reopen that earlier technique from this conversation.',
        };
      }
      const read = await readRecipe(coffeeId, slotKey, args.coffeeRef);
      if (read?.code && read.code !== 'recipe_missing') return { ok: false, actionable: false, code: read.code, options: [], message: 'I could not verify the saved recipe right now. Nothing was changed.' };
      const savedRecipe = read?.code ? null : read;
      const draft = techniqueDraftRecipe(context, savedRecipe, slotKey, coffeeId);
      if (!draft.recipe) return { ok: true, actionable: false, sourceOptions: true, coffeeRef: args.coffeeRef, slot: slotKey, current: null, options: [], message: draft.message };
      const recipe = draft.recipe;
      hydrateTechniqueSelection(context, { coffeeRef: args.coffeeRef, coffeeId, slotKey });
      const requestedVariant = slotKey === 'v60_hot' ? explicitMethodVariantFromText(context.userText) : null;
      const savedVariant = String(recipe.variant || recipe.v60Variant || '').toLowerCase() === 'switch' ? 'switch' : 'classic';
      if (requestedVariant === 'switch' && /\b(?:iced|cold)\b/i.test(context.userText || '')) {
        return {
          ok: true,
          actionable: false,
          sourceOptions: true,
          current: { ...techniqueIdentity(recipe), variant: savedVariant, configuration: clone(sourceConfigurationForRecipe(recipe)) },
          options: [],
          references: listV60SwitchTechniqueReferences(),
          message: 'The saved Switch guidance is hot-only, so I will not turn this iced request into a hot experiment.',
        };
      }
      const sourceRoute = sourceRouteForRecipe(recipe, slotKey);
      const sourceProjection = recipe.sourceProjection?.projectionVersion ? recipe.sourceProjection : null;
      const sourceProjectionBrewer = sourceProjection?.equipment?.brewer;
      const projectedForSlot = sourceProjection
        && recipe.mode === 'hot'
        && recipe.isIced !== true
        && ((slotKey === 'kalita_hot' && sourceProjectionBrewer === 'kalita')
          || (slotKey === 'v60_hot' && sourceProjectionBrewer !== 'kalita' && recipe.device === 'v60'));
      const manualRoute = sourceRoute?.supported || projectedForSlot;
      if (sourceRoute && !sourceRoute.supported) {
        return { ok: true, actionable: false, sourceOptions: true, current: { ...techniqueIdentity(recipe), configuration: clone(sourceRoute.configuration) }, options: [], message: sourceRoute.reason };
      }
      if (slotKey === 'kalita_hot' && !manualRoute) {
        return { ok: true, actionable: false, sourceOptions: true, current: { ...techniqueIdentity(recipe), configuration: clone(sourceConfigurationForRecipe(recipe)) }, options: [], message: 'I can discuss source-backed hot Kalita techniques only for the saved recipe’s exact Wave 155 or 185 configuration.' };
      }
      // A selected versioned source owns its hardware, native units and
      // timing. Keep this path separate from the legacy V60 catalog so a
      // Switch 03 source cannot be replaced by the generic V60/Switch engine.
      if (manualRoute) {
        const key = techniqueKey(args.coffeeRef, slotKey);
        const prior = context.__ruphusTechniqueSelections?.get(key);
        const historical = explicitSourceReference(context, slotKey, args.coffeeRef);
        if (historical?.status === 'ambiguous') {
          return { ok: false, actionable: false, code: 'ambiguous_historical_technique', candidates: historical.candidates, message: 'Which coffee’s earlier technique do you want to use?' };
        }
        if (historical?.status === 'missing') {
          return { ok: false, actionable: false, code: 'historical_technique_not_found', options: [], message: 'I could not match that earlier technique to a delivered card in this chat.' };
        }
        const currentSourceId = sourceProjection?.sourceId || techniqueIdentity(recipe).currentSourceId;
        const historicalIds = historical?.status === 'matched'
          ? [historical.sourceId, historical.familyId].filter(Boolean)
          : [];
        const excludedIds = historical?.status === 'matched'
          ? (prior?.selectedIds || []).filter((id) => !historicalIds.includes(id))
          : (prior?.selectedIds || []);
        const listedOptions = listManualSourceTechniqueOptions({
          ...(sourceRoute?.configuration || sourceConfigurationForRecipe(recipe)),
          ...(historical?.status === 'matched' ? { currentSourceId: null } : { currentSourceId }),
          excludeIds: excludedIds,
        }, { includeReferenceOnly: true }).map((option) => ({ ...option, adaptation: safeTechniqueAdaptation(option.adaptation) }));
        const selectedOptions = historical?.status === 'matched'
          ? listedOptions.filter((option) => [option.id, option.familyId, option.sourceId].includes(historical.sourceId)
            && (historical.sourceRevision == null || Number(option.sourceRevision) === Number(historical.sourceRevision)))
          : listedOptions;
        const options = capabilityGatedSourceOptions(selectedOptions, sourceFormatSupported(context));
        if (!(context.__ruphusTechniqueSelections instanceof Map)) Object.defineProperty(context, '__ruphusTechniqueSelections', { value: new Map(), enumerable: false, writable: true, configurable: true });
        context.__ruphusTechniqueSelections.set(key, {
          current: techniqueIdentity(recipe),
          offeredIds: options.flatMap((option) => [option.id, option.familyId, option.sourceId]),
          selectedIds: prior?.selectedIds || [],
          proposalIds: prior?.proposalIds || [],
        });
        const executableOptions = options.filter((option) => option.executable === true);
        rememberTarget({ coffeeRef: args.coffeeRef, coffeeId, slotKey, before: modelRecipe(savedRecipe), discoveryRecipe: modelRecipe(recipe), sourceHash: recipeSourceHash(savedRecipe, slotKey), techniqueOptions: options });
        setTechniqueReadiness(context, { coffeeRef: args.coffeeRef, slotKey, recipe, sourceRecipe: savedRecipe, configurationRequested: draft.configurationRequested, options: executableOptions, kind: 'manual_source_technique', intent: args.intent });
        return {
          ok: true,
          actionable: executableOptions.length > 0,
          coffeeRef: args.coffeeRef,
          slot: slotKey,
          sourceState: savedRecipe ? 'present' : 'absent',
          savedConfiguration: savedRecipe ? clone(sourceConfigurationForRecipe(savedRecipe)) : null,
          preparingNewConfiguration: recipe !== savedRecipe,
          current: { ...techniqueIdentity(recipe), configuration: clone(sourceRoute?.configuration || sourceConfigurationForRecipe(recipe)), sourceProjection: clone(recipe.sourceProjection) },
          options,
          ...(slotKey === 'v60_hot' ? { references: listV60SwitchTechniqueReferences() } : {}),
          sourceOptions: true,
          sourceFormatCapability: 'technique_experiment_v1',
          sourceFormatSupported: sourceFormatSupported(context),
          ...(historical?.status === 'matched' ? { reusedProposalId: historical.proposalId, reusedSourceId: historical.sourceId } : {}),
          ...(executableOptions.length ? {} : { message: sourceFormatSupported(context) ? 'There is no other executable source-backed technique for this exact hardware configuration; reference-only research remains readable.' : 'These source schedules are readable, but this app version needs an update before a source-backed schedule can be started.' }),
        };
      }
      if (recipe.device !== 'v60' || recipe.mode !== 'hot' || recipe.isIced === true) {
        return { ok: true, actionable: false, current: null, options: [], message: 'Technique exploration needs the saved hot recipe for this exact brewer.' };
      }
      const variant = String(recipe.variant || recipe.v60Variant || '').toLowerCase();
      const nonStandard = variant === 'switch' || (recipe.v60Size != null && String(recipe.v60Size) !== '02') || (recipe.configurationKey != null && recipe.configurationKey !== 'v60:02:standard-paper');
      if (nonStandard) {
        return { ok: true, actionable: false, current: { technique: recipe.technique || null, variant: variant || null }, options: listV60TechniqueOptions().map((option) => ({ ...option, adaptation: safeTechniqueAdaptation(option.adaptation) })), message: 'I can discuss standard hot V60 techniques, but this saved recipe is a different unsupported configuration, so I will not prepare a timer-ready experiment from it.' };
      }
      const key = techniqueKey(args.coffeeRef, slotKey);
      const prior = context.__ruphusTechniqueSelections?.get(key);
      const options = listV60TechniqueOptions({ ...techniqueIdentity(recipe), excludeIds: prior?.selectedIds || [] }).map((option) => ({ ...option, adaptation: safeTechniqueAdaptation(option.adaptation) }));
      if (!(context.__ruphusTechniqueSelections instanceof Map)) Object.defineProperty(context, '__ruphusTechniqueSelections', { value: new Map(), enumerable: false, writable: true, configurable: true });
      context.__ruphusTechniqueSelections.set(key, {
        current: techniqueIdentity(recipe),
        offeredIds: options.flatMap((option) => [option.id, option.familyId, option.sourceId]),
        selectedIds: prior?.selectedIds || [],
        proposalIds: prior?.proposalIds || [],
      });
      rememberTarget({ coffeeRef: args.coffeeRef, coffeeId, slotKey, before: modelRecipe(savedRecipe), discoveryRecipe: modelRecipe(recipe), sourceHash: recipeSourceHash(savedRecipe, slotKey), techniqueOptions: options });
      setTechniqueReadiness(context, { coffeeRef: args.coffeeRef, slotKey, recipe, sourceRecipe: savedRecipe, configurationRequested: draft.configurationRequested, options, kind: 'v60_technique', intent: args.intent });
      return { ok: true, actionable: options.length > 0, coffeeRef: args.coffeeRef, slot: slotKey, sourceState: savedRecipe ? 'present' : 'absent', preparingNewConfiguration: recipe !== savedRecipe, current: { technique: recipe.technique || null, sourceLineage: clone(recipe.sourceLineage || null) }, options,
        ...(options.length ? {} : { message: 'There is no other supported source-backed hot V60 technique available for this recipe right now.' }) };
    }
    if (name === 'review_trial_recipe') {
      if (!SLOT_KEYS.includes(slotKey)) throw Object.assign(new Error('resolved recipe slot is required'), { code: 'slot_required' });
      if (typeof readers.readAttempts !== 'function' || typeof readers.readTrialReceipt !== 'function') return { ok: false, message: 'I could not check your trial recipe right now.' };
      const attempts = (await readers.readAttempts({ uid, coffeeId })).filter(item => item.ownerId === uid && item.coffeeId === coffeeId && item.slotKey === slotKey && item.proposalId && ['created', 'timer_started', 'profile_prepared', 'completed', 'tasted', 'promoted'].includes(item.status));
      const trialRef = item => `trial-${canonicalHash({ uid, id: item.id }).slice(0, 16)}`;
      const conversationReceipt = (context.__ruphusTrialReceipts || []).filter(item => item.coffeeId === coffeeId && item.slotKey === slotKey).at(-1);
      const selected = args.trialRef ? attempts.filter(item => trialRef(item) === args.trialRef)
        : conversationReceipt ? attempts.filter(item => item.id === conversationReceipt.attemptId) : attempts;
      if (selected.length !== 1) return { ok: false, candidates: attempts.map(item => ({ trialRef: trialRef(item), createdAt: item.createdAt || null, recipe: modelRecipe(item.snapshot) })), message: attempts.length ? 'Ask which of these trial dates or adjustments the user means, then call again with its trialRef. Do not choose for them.' : 'There is no unsaved trial for this coffee and brewer that I can recover.' };
      const attempt = selected[0];
      const wasPreviouslyPromoted = Boolean(attempt.promotedRevisionId);
      const savedReceipt = await readers.readTrialReceipt({ uid, attemptId: attempt.id });
      if (!args.trialRef && conversationReceipt && savedReceipt?.id !== conversationReceipt.id) return { ok: false, message: 'I could not verify the trial from this conversation.' };
      if (!savedReceipt || savedReceipt.ownerId !== uid || savedReceipt.mode !== 'brew_once' || savedReceipt.attemptId !== attempt.id || savedReceipt.coffeeId !== coffeeId || savedReceipt.slotKey !== slotKey) return { ok: false, message: 'I could not recover the confirmation for this trial.' };
      const coffeeName = snapshot.coffees?.find(item => item.refKey === args.coffeeRef)?.name || context.turnBinding?.coffeeName || 'This coffee';
      const artifact = makeArtifact('action_receipt', { id: savedReceipt.id, status: 'ready', mode: 'brew_once', actionId: savedReceipt.actionId, attemptId: attempt.id, proposalId: attempt.proposalId, coffeeId, slotKey, revisionId: attempt.revisionId, sourceHash: attempt.sourceHash, promoteAvailable: !wasPreviouslyPromoted && proposalActions.includes('apply_proposal'), title: `${coffeeName} · ${trialDisplaySlot(slotKey, attempt.snapshot)}`, message: wasPreviouslyPromoted ? 'This trial was previously saved. Review it below; recovering this card does not change your saved recipe.' : 'Review your trial recipe below. Recovering this card does not change your saved recipe.', recipe: modelRecipe(attempt.snapshot) });
      return { ok: true, summary: artifact.promoteAvailable ? 'Recovered the existing trial. The save button requires the user’s tap; no recipe was changed.' : 'Recovered the exact trial for review only. No save control is available and no recipe was changed.', artifact };
    }
    if (name === 'read_recipe') {
      if (!SLOT_KEYS.includes(slotKey)) throw Object.assign(new Error('resolved recipe slot is required'), { code: 'slot_required' });
      const recipe = await readRecipe(coffeeId, slotKey, args.coffeeRef);
      if (!recipe || recipe.code) return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, displayName: displaySlot(slotKey), summary: missingRecipeSummary(slotKey, snapshot.coffees?.find((coffee) => coffee.refKey === args.coffeeRef)?.recipes || []), recipe: null };
      rememberTarget({ coffeeRef: args.coffeeRef, coffeeId, slotKey, before: modelRecipe(recipe), sourceHash: recipeSourceHash(recipe, slotKey) });
      if (context.proposalState && !context.proposalState.target) context.proposalState.target = { coffeeRef: args.coffeeRef, slot: slotKey };
      setPreviewReadiness(context, { coffeeRef: args.coffeeRef, slotKey, recipe });
      return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, displayName: displaySlot(slotKey), summary: `${displaySlot(slotKey)} recipe: ${recipe.dose ?? recipe.coffeeGrams ?? '?'}g coffee to ${recipeWaterSummary(recipe)} water.`, recipe: modelRecipe(recipe) };
    }
    const experiment = args.experiment && typeof args.experiment === 'object' && !Array.isArray(args.experiment) ? args.experiment : null;
    const experimentHasSelection = Boolean(experiment?.techniqueId || experiment?.familyId || experiment?.sourceId);
    const techniqueExperiment = experiment?.kind === 'v60_technique' || experiment?.kind === 'manual_source_technique';
    const manualSourceExperiment = experiment?.kind === 'manual_source_technique';
    if (experimentHasSelection && !techniqueExperiment) return { ok: false, code: 'invalid_proposal_intent', message: 'Technique experiments must use a supported source-backed technique intent.' };
    if (techniqueExperiment && args.change) return { ok: false, code: 'invalid_proposal_intent', message: 'Choose either one recipe adjustment or one technique experiment, not both.' };
    if (!SLOT_KEYS.includes(slotKey)) throw Object.assign(new Error('resolved recipe slot is required'), { code: 'slot_required' });
    if (techniqueExperiment && (manualSourceExperiment ? !['v60_hot', 'kalita_hot'].includes(slotKey) : slotKey !== 'v60_hot')) return { ok: false, code: 'unsupported_technique_brewer', message: manualSourceExperiment ? 'Source-backed technique experiments support hot V60, Switch 03, and Kalita Wave.' : 'V60 technique experiments support hot V60.' };
    if (manualSourceExperiment && !sourceFormatSupported(context)) return { ok: false, code: 'source_format_unsupported', message: 'Update the app before starting a source-backed schedule; this version can still read the source details.' };
    const target = context.__ruphusResolvedTargets instanceof Map ? context.__ruphusResolvedTargets.get(`${args.coffeeRef}:${slotKey}`) : null;
    if (techniqueExperiment && !techniqueReadinessMatches(context, { coffeeRef: args.coffeeRef, slotKey, target, kind: manualSourceExperiment ? 'manual_source_technique' : 'v60_technique' })) {
      return { ok: false, code: 'technique_option_required', message: 'Choose one of the supported techniques I just showed you.' };
    }
    const typedPreview = args.intent === 'recipe_preview';
    const servingDose = args.servingDoseGrams;
    if (servingDose != null && (!Number.isFinite(servingDose) || servingDose <= 0)) {
      return { ok: false, code: 'invalid_serving_dose', message: 'The serving dose must be a positive number within this brewer’s supported range.' };
    }
    if (servingDose != null && args.change?.control === 'dose') {
      return { ok: false, code: 'invalid_proposal_intent', message: 'Use either the dose control or servingDoseGrams, not both.' };
    }
    if (!techniqueExperiment && args.intent === 'information') {
      throw Object.assign(new Error('information turns do not prepare recipe cards'), { code: 'proposal_timing' });
    }
    if (!target || target.coffeeId !== coffeeId || target.coffeeRef !== args.coffeeRef) return { ok: false, code: 'proposal_target_required', message: 'Read the exact coffee and recipe before suggesting a change.' };
    if (context.proposalState?.target && (context.proposalState.target.coffeeRef !== args.coffeeRef || context.proposalState.target.slot !== slotKey)) return { ok: false, code: 'proposal_target_mismatch', message: 'That suggestion is bound to a different coffee and recipe.' };
    if (!canPropose
      || (!techniqueExperiment && !typedPreview && context.proposalState && context.proposalState.previewReady !== true && (context.proposalState.diagnosisReady !== true || context.proposalState.userAgreed !== true))
      || (!techniqueExperiment && conditionalSensoryClarification(context.proposalState))) {
      throw Object.assign(new Error('proposal is not yet earned'), { code: 'proposal_timing' });
    }
    let experimentMetadata = null;
    let requestedPatch = args.change ? patchForChange(target.before || {}, args.change) : args.afterRecipe;
    if (servingDose != null && !techniqueExperiment && !['ratio', 'water', 'grind', 'temperature'].includes(args.change?.control)) {
      return { ok: false, code: 'invalid_proposal_intent', message: 'A serving dose can accompany one recipe control or technique experiment, not a second dose control.' };
    }
    if (args.change?.control === 'ratio') {
      try {
        const beforeRecipe = target.before || {};
        const dose = servingDose ?? Number(beforeRecipe.coffeeGrams ?? beforeRecipe.userCoffeeGrams ?? beforeRecipe.dose);
        requestedPatch = createRecipePreview({ recipe: beforeRecipe, dose, ratio: args.change.value, configuration: { grinder: snapshot.setup?.grinder }, allowIced: true });
      } catch (error) {
        return { ok: false, code: error.code || 'invalid_ratio_preview', message: error.message };
      }
    }
    if (servingDose != null && !techniqueExperiment && args.change?.control !== 'ratio') {
      try {
        // Resize the complete executable recipe first, then apply the one
        // requested diagnostic control to that derived serving. This keeps
        // pours, aliases, and timing coherent without treating serving size
        // as a second diagnostic control.
        const resized = createRecipePreview({ recipe: target.before || {}, dose: servingDose, configuration: { grinder: snapshot.setup?.grinder }, allowIced: true });
        requestedPatch = mergeRecipePatch(resized, patchForChange(resized, args.change));
      } catch (error) {
        return { ok: false, code: error.code || 'invalid_serving_dose', message: error.message };
      }
    }
    if (techniqueExperiment) {
      const selectedId = experiment.techniqueId || experiment.familyId || experiment.sourceId;
      const selected = context.proposalState?.techniqueReady?.optionIds?.includes(selectedId)
        ? (target.techniqueOptions || []).find((option) => [option.id, option.familyId, option.sourceId].includes(selectedId))
        : null;
      if (!selected) return { ok: false, code: 'technique_option_required', message: 'Choose one of the supported techniques I just showed you.' };
        const before = target.before || {};
        const discovery = target.discoveryRecipe || before;
        const dose = Number(discovery.coffeeGrams ?? discovery.userCoffeeGrams ?? discovery.dose ?? selected.sourceDoseGrams);
        const selectedDose = servingDose ?? (manualSourceExperiment && Number.isFinite(selected.targetDoseGrams) ? selected.targetDoseGrams : dose);
        try {
        // The first selection is a complete source-backed experiment. Do not
        // copy the current family's controls into it; later dose previews use
        // this selected recipe as their reviewed source of truth.
        const generated = manualSourceExperiment
          ? generateManualSourceTechniqueOption(selected.sourceId, {}, { ...(selected.sourceConfiguration || {}), sourceRevision: selected.sourceRevision, dose: selectedDose })
          : generateV60TechniqueOption(selected.id, {}, { dose: selectedDose, grinder: snapshot.setup?.grinder });
        generated.recipe.techniqueLabel = selected.name;
        const preview = manualSourceExperiment
          ? createRecipePreview({ recipe: generated.recipe, dose: selectedDose })
          : createRecipePreview({ recipe: generated.recipe, dose: selectedDose, ratio: recipeRatio(generated.recipe) });
        requestedPatch = preview;
        experimentMetadata = {
          protocolVersion: RECIPE_TECHNIQUE_EXPERIMENT_PROTOCOL_VERSION,
          kind: manualSourceExperiment ? 'manual_source_technique' : 'v60_technique', techniqueId: selected.id, familyId: selected.familyId, sourceId: selected.sourceId,
          name: selected.name, differences: clone(selected.differences), adaptation: safeTechniqueAdaptation(selected.adaptation),
          attribution: clone(selected.attribution), sourceRegistryVersion: selected.sourceRegistryVersion,
          ...(manualSourceExperiment ? { sourceRevision: selected.sourceRevision, sourceOptionsVersion: selected.sourceOptionsVersion, sourceNativeWaterUnit: selected.sourceWater?.unit || null, sourceDoseGrams: selected.sourceDoseGrams, targetDoseGrams: selectedDose } : {}),
          currentTechnique: before.technique || before.sourceLineage?.technique || null,
        };
      } catch (error) {
        return { ok: false, code: error.code || 'technique_generation_failed', message: error.message };
      }
    }
    if (!requestedPatch || typeof requestedPatch !== 'object' || Array.isArray(requestedPatch)) return { ok: false, code: 'invalid_proposal', message: 'Choose one recipe control and a concrete value.' };
    if (context.proposalState?.target && (context.proposalState.target.coffeeRef !== args.coffeeRef || context.proposalState.target.slot !== slotKey)) return { ok: false, code: 'proposal_target_mismatch', message: 'That suggestion is bound to a different coffee and recipe.' };
    const recipeRead = await readRecipe(coffeeId, slotKey, args.coffeeRef);
    const recipe = recipeRead?.code === 'recipe_missing' ? null : recipeRead;
    if ((!recipe || recipe.code) && !(techniqueExperiment && target.before === null && !recipe)) return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, summary: recipe?.code ? 'I could not verify the saved recipe right now. Nothing was changed.' : missingRecipeSummary(slotKey, snapshot.coffees?.find((coffee) => coffee.refKey === args.coffeeRef)?.recipes || []), recipe: null };
    const before = clone(target.before);
    if (hasManualSourceProjection(before) && !techniqueExperiment && args.change?.control !== 'dose') {
      return { ok: false, code: 'source_recipe_control_unsupported', message: 'Source-backed recipes keep their native schedule and units; only the supported dose guide can be changed.' };
    }
    // A source-selected experiment is a complete native recipe envelope. Do
    // not merge it into the legacy adapter snapshot: that would retain
    // incompatible water aliases (notably Switch mL plus old grams) and
    // would let the generic preview shape erase the source contract.
    let after = techniqueExperiment
      ? clone(requestedPatch)
      : mergeRecipePatch(before, requestedPatch);
    if (args.change?.control === 'dose') {
      try {
        const requestedDose = Number(args.change.value);
        const sourceDose = Number(before.coffeeGrams ?? before.userCoffeeGrams ?? before.dose);
        const v60ProfileChanged = slotKey === 'v60_hot'
          && String(before.variant || before.v60Variant || '').toLowerCase() !== 'switch'
          && v60DoseProfile(sourceDose) !== v60DoseProfile(requestedDose);
        after = hasManualSourceProjection(before)
          ? createRecipePreview({ recipe: before, dose: requestedDose })
          : v60ProfileChanged
            ? completeDosePreview(before, createRecipePreview({ recipe: before, dose: requestedDose, configuration: { grinder: snapshot.setup?.grinder } }), requestedDose)
            : generatedDoseRecipe(before, slotKey, requestedDose) || after;
      } catch (error) {
        return { ok: false, code: error.code || 'invalid_dose_preview', message: error.message };
      }
    }
    const grinder = snapshot.setup?.grinder;
    // An invalid setting supplied as the requested grind is a user control
    // error and must remain rejected. Normalize only inherited legacy values
    // on another control's derived preview.
    const explicitGrindRequest = args.change?.control === 'grind'
      || Object.hasOwn(args.afterRecipe || {}, 'grind')
      || Object.hasOwn(args.afterRecipe?.grindSize || {}, 'setting');
    const normalizedPreview = explicitGrindRequest
      ? { recipe: after, normalization: null }
      : normalizePreviewGrind(after, { grinder });
    after = normalizedPreview.recipe;
    if (normalizedPreview.normalization) {
      after.recipePreview = {
        ...(after.recipePreview || {}),
        grindNormalization: normalizedPreview.normalization,
      };
    }
    const previousGrind = before?.grindSize?.setting ?? before?.grind;
    const nextGrind = after.grindSize?.setting ?? after.grind;
    // A source-backed manual experiment owns its native grind descriptor. It
    // may be qualitative or expressed for another grinder, so it must not be
    // translated into the user's Ode setting or rejected as a non-click. Keep
    // the exception structural so a numeric app-Ode envelope cannot bypass
    // the physical-click check merely by declaring a manual experiment.
    const sourceNativeGrind = manualSourceExperiment
      && after.sourceProjection?.grind
      && typeof after.sourceProjection.grind === 'object'
      && !Array.isArray(after.sourceProjection.grind)
      && ['description', 'microns', 'native'].some((key) => Object.hasOwn(after.sourceProjection.grind, key));
    if (grinder === 'fellow-ode-gen2' && !sourceNativeGrind && String(previousGrind) !== String(nextGrind)) {
      if (!isOdeStep(nextGrind)) {
        const current = Number(previousGrind);
        const finer = ODE_GEN2_STEPS.filter(step => step < current).at(-1);
        const coarser = ODE_GEN2_STEPS.find(step => step > current);
        return { ok: false, code: 'physical_grind_required', message: 'The Ode has physical clicks labelled whole number, .2, .6. Choose a real click, not a decimal adjustment. Nothing was saved.', validNearbySettings: { finer, coarser } };
      }
      if (after.grindSize) {
        const microns = grinderSettingToMicrons(nextGrind, grinder);
        after.grindSize = { ...after.grindSize, setting: String(nextGrind), microns, description: descriptorForMicrons(microns) };
      }
    }
    if (canonicalHash(before) === canonicalHash(after)) return { ok: false, code: 'no_recipe_change', message: 'That is already the current recipe. Choose a genuinely different adjustment or explain why you would keep it.' };
    if (isAlternativeRequest(context.userText) && (context.__ruphusPriorProposals || []).some(item => item.coffeeId === coffeeId && item.slotKey === slotKey && sameRecipeReview(item.after, after))) {
      return { ok: false, code: 'duplicate_alternative', message: 'You already offered that recipe. Choose a genuinely different supported adjustment, or explain why no other supported option is appropriate. Do not present the same recipe as new.' };
    }
    const allPaths = changedPaths(before, after)
      .filter(Boolean)
      .filter(path => !path.startsWith('recipePreview') && !path.startsWith('ratioIntent'));
    const mechanicalPaths = allPaths.filter(path => ['grind', 'grindSize'].includes(String(path).split('.')[0]));
    const paths = args.change?.control === 'dose'
      ? [...new Set(['dose', ...mechanicalPaths])]
      : args.change?.control === 'ratio'
        ? [...new Set(['ratio', ...allPaths])]
        : allPaths;
    const controls = techniqueExperiment ? ['technique'] : args.change ? [args.change.control] : [...new Set(paths.map(recipeControl))];
    if (recipeSourceHash(recipe, slotKey) !== target.sourceHash) return { ok: false, code: 'proposal_target_stale', message: 'That recipe changed; read it again before suggesting a change.' };
    if (!techniqueExperiment && (controls.length !== 1 || ['method', 'device', 'mode'].includes(controls[0]))) return { ok: false, code: 'one_change_required', message: 'A proposal must change exactly one supported control.' };
    const validationRecipe = after.sourceLineage ? after : recipe?.sourceLineage ? { ...after, sourceLineage: clone(recipe.sourceLineage) } : after;
    const validation = validateExecutableRecipe(validationRecipe, slotKey);
    if (!validation.valid) return { ok: false, code: 'invalid_recipe', errors: validation.errors };
    const coffeeName = snapshot.coffees?.find((item) => item.refKey === args.coffeeRef)?.name
      || (context.turnBinding?.coffeeRef === args.coffeeRef ? context.turnBinding.coffeeName : null);
    const explanation = safeProposalExplanation(args.explanation);
    const artifact = makeArtifact('recipe_proposal', { id: args.proposalId || `proposal-${canonicalHash({ uid, coffeeId, slotKey, after, sessionId: context.sessionId || 'agent-session' }).slice(0, 16)}`, status: 'proposed', coffeeId, ...(coffeeName ? { coffeeName } : {}), slotKey, before: clone(before), after: clone(after), changedPaths: techniqueExperiment ? ['technique', ...paths] : paths, ...(experimentMetadata ? { techniqueExperiment: experimentMetadata } : {}), ...(explanation ? { explanation } : { explanation: null }), actions: [], recipeHash: canonicalHash(after), sourceHash: target.sourceHash });
    const proposal = typeof proposalStore === 'function' ? await proposalStore({ uid, coffeeId, slotKey, sessionId: context.sessionId || context.launchContext?.sessionId || context.context?.sessionId || 'agent-session', after: validationRecipe, proposalId: artifact.id }) : artifact;
    if (context.proposalState) {
      context.proposalState.proposalIssued = true;
      if (techniqueExperiment) {
        context.proposalState.previewReady = true;
        context.proposalState.diagnosisReady = true;
        context.proposalState.userAgreed = true;
      }
    }
    if (techniqueExperiment && context.__ruphusTechniqueSelections instanceof Map) {
      const state = context.__ruphusTechniqueSelections.get(techniqueKey(args.coffeeRef, slotKey));
      if (state) state.selectedIds = [...new Set([...(state.selectedIds || []), experimentMetadata.techniqueId, experimentMetadata.familyId, experimentMetadata.sourceId])];
    }
    const actions = typeof proposalStore === 'function' && proposal?.status === 'proposed' && (proposal?.sourceRevisionId || proposal?.sourceState === 'absent')
      ? ['apply_proposal', 'brew_once', 'keep_current'].filter((mode) => proposalActions.includes(mode))
      : [];
    return { ok: true, proposal: clone(proposal), artifact: clone({ ...artifact, actions, sourceState: proposal?.sourceState || (before ? 'present' : 'absent'), ...(proposal?.sourceHash ? { sourceHash: proposal.sourceHash } : {}), ...(proposal?.sourceRevisionId ? { sourceRevisionId: proposal.sourceRevisionId } : {}), ...(proposal?.sessionId ? { sessionId: proposal.sessionId } : {}) }) };
  };
  const definitions = RUPHUS_READ_TOOL_NAMES.filter((name) => name !== 'resolve_coffee' || context.turnBinding?.status !== 'locked').map((name) => {
    if (name === 'review_trial_recipe') return { type: 'function', name, description: 'Recover an existing Brew once trial when the user asks to keep it, make it permanent, or save that trial. This reads the actual trial and displays its save control; it never saves or requires tasting. Use instead of generating a new recipe from conversation prose. Use null trialRef initially; if several trials are returned, clarify using their dates or adjustments, then pass the chosen trialRef.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string', enum: SLOT_KEYS }, trialRef: nullable({ type: 'string' }) }, required: ['coffeeRef', 'slot', 'trialRef'], additionalProperties: false } };
    if (name === 'resolve_coffee') return { type: 'function', name, description: 'Resolve a coffee reference such as a jar, name, roaster, origin, or pronoun. Call once for a reference, then keep the returned coffeeRef for later tools in this turn.', strict: true, parameters: { type: 'object', properties: { reference: { type: 'string' } }, required: ['reference'], additionalProperties: false } };
    if (name === 'read_coffee_evidence') return { type: 'function', name, description: 'Read recipe, recent brews, and tastings for one resolved coffee in parallel.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, windowDays: nullable({ type: 'number' }) }, required: ['coffeeRef', 'windowDays'], additionalProperties: false } };
    if (name === 'read_recipe') return { type: 'function', name, description: 'Read one exact recipe slot when its source data is needed. read_coffee_evidence.selectedRecipe already supplies the resolved recipe numbers and full schedule; reuse it when present. If selectedRecipe is absent, read the requested slot before concluding its recipe is unavailable.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string', enum: SLOT_KEYS } }, required: ['coffeeRef', 'slot'], additionalProperties: false } };
    if (name === 'read_technique_options') return { type: 'function', name, description: 'Read source-backed hot V60, Kalita Wave, or ribbed Switch recipes for this coffee. Interpret the user’s conversational intent, not keywords: recipe_preview means they want something to brew, a recipe suggestion, an alternative, or a corrected-equipment recipe; information means explanation or comparison only. A preview does not save or start anything and needs no extra yes. For recipe_preview, select an exact executable option and call propose_recipe_change in this turn. Use the requested equipment; no matching saved recipe is required. Reference-only sources remain discussion-only.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string', enum: ['v60_hot', 'kalita_hot'] }, intent: { type: 'string', enum: ['recipe_preview', 'information'] } }, required: ['coffeeRef', 'slot', 'intent'], additionalProperties: false } };
    return { type: 'function', name, description: 'Prepare one review card: either one bounded recipe-control change, or one explicitly selected source-backed technique experiment. For an exact grounded diagnosis, set intent to recipe_preview after reading the exact recipe; this prepares a review card only and never saves or brews. If the user names a serving size together with a ratio or technique, put that positive numeric dose in servingDoseGrams rather than inventing a second change; the server validates the brewer bounds. Include a brief explanation only when it helps answer why a corrected method or technique fits; do not repeat card values. Use information for explanation or comparison, which must not create a card. These are proposals only; never claim a save or brew.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string', enum: SLOT_KEYS }, intent: nullable({ type: 'string', enum: ['recipe_preview', 'information'] }), change: nullable({ type: 'object', properties: { control: { type: 'string', enum: PROPOSAL_CONTROLS }, value: { anyOf: [{ type: 'number' }, { type: 'string' }] } }, required: ['control', 'value'], additionalProperties: false }), servingDoseGrams: nullable({ type: 'number' }), experiment: nullable(strictObject({ kind: { type: 'string', enum: ['v60_technique', 'manual_source_technique'] }, techniqueId: { type: 'string' }, familyId: { type: 'string' }, sourceId: { type: 'string' } })), explanation: nullable({ type: 'string' }) }, required: ['coffeeRef', 'slot', 'intent', 'change', 'servingDoseGrams', 'experiment', 'explanation'], additionalProperties: false } };
  });
  return Object.freeze({ names: RUPHUS_READ_TOOL_NAMES, definitions, call });
}
