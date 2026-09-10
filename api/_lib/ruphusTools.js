import { canonicalHash, clone, RECIPE_TECHNIQUE_EXPERIMENT_PROTOCOL_VERSION, SLOT_KEYS } from '../../src/lib/ruphus/contracts.js';
import { makeArtifact } from '../../src/lib/ruphus/artifactRegistry.js';
import { canonicalRecipeSnapshot, validateExecutableRecipe } from '../../src/lib/ruphus/legacyRecipeResolver.js';
import { resolveCoffeeReference } from '../../src/lib/ruphus/referenceResolver.js';
import { resolveMethod } from '../../src/lib/ruphus/methodResolver.js';
import { generateV60Recipe } from '../../src/lib/v60Adapter.js';
import { generateV60SwitchRecipe } from '../../src/lib/v60SwitchAdapter.js';
import { generateV60IcedRecipe } from '../../src/lib/v60IcedAdapter.js';
import { generateKalitaRecipe } from '../../src/lib/kalitaAdapter.js';
import { generateKalitaIcedRecipe } from '../../src/lib/kalitaIcedAdapter.js';
import { generateV60TechniqueOption, listV60TechniqueOptions } from '../../src/lib/ruphus/techniqueOptions.js';
import { createRecipePreview } from '../../src/lib/ruphus/recipePreview.js';
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
const RECIPE_PROPERTIES = Object.freeze({ method: { type: 'string' }, device: { type: 'string' }, mode: { type: 'string' }, variant: { type: 'string' }, v60Variant: { type: 'string' }, v60Size: { type: 'string' }, kalitaSize: { type: 'string' }, configurationKey: { type: 'string' }, doseProfile: { type: 'string' }, coffeeGrams: { type: 'number' }, userCoffeeGrams: { type: 'number' }, dose: { type: 'number' }, waterGrams: { type: 'number' }, water: { type: 'number' }, ratio: { anyOf: [{ type: 'number' }, { type: 'string' }] }, isIced: { type: 'boolean' }, hotWaterGrams: { type: 'number' }, recipeIceGrams: { type: 'number' }, iceGrams: { type: 'number' }, initialBrewIceGrams: { type: 'number' }, postBrewIceGrams: { type: 'number' }, finalBeverageWaterTargetGrams: { type: 'number' }, hotExtractionRatio: { anyOf: [{ type: 'number' }, { type: 'string' }] }, finalBeverageRatio: { anyOf: [{ type: 'number' }, { type: 'string' }] }, requiresCompleteMelt: { type: 'boolean' }, servingIceExcluded: { type: 'boolean' }, measuredMeltedIceGrams: { type: 'number' }, actualFinalBeverageMassGrams: { type: 'number' }, actualFinalTemperatureC: { type: 'number' }, icePlacement: { type: 'string' }, iceTiming: { type: 'string' }, temperature: { type: 'number' }, temperatureC: { type: 'number' }, grind: { type: 'string' }, technique: { type: 'string' }, techniqueLabel: { type: 'string' }, techniqueInstruction: { type: 'string' }, chillingMethod: { type: 'string' }, recommendedChillingMethod: { type: 'string' }, chillingMethodOverrideApplied: { type: 'boolean' }, steps: { type: 'array', items: RECIPE_STEP }, prepSteps: { type: 'array', items: RECIPE_STEP }, postBrewSteps: { type: 'array', items: RECIPE_STEP }, waterTemp: strictObject({ celsius: { type: 'number' }, fahrenheit: { type: 'number' } }), grindSize: strictObject({ setting: { anyOf: [{ type: 'number' }, { type: 'string' }] }, microns: { type: 'number' }, description: { type: 'string' }, grinderSpecific: { type: 'boolean' }, sourceExact: { type: 'boolean' } }), totalBrewTimeSeconds: { type: 'number' }, totalBrewTime: { type: 'string' }, guideTargetSeconds: { type: 'number' }, guideRangeSeconds: { type: 'array', items: { type: 'number' } }, timerReady: { type: 'boolean' }, phaseContractVersion: { type: 'number' }, candidate: { type: 'boolean' }, doseTimingPolicy: { type: 'string' }, timingProfile: { type: 'string' }, engineVersion: { type: 'string' }, rulesVersion: { type: 'string' }, sourceRegistryVersion: { type: 'string' }, reasonCodes: { type: 'array', items: { type: 'string' } }, fallback: { type: 'boolean' }, generationStatus: { type: 'string' }, reasoning: { type: 'string' }, tips: { type: 'string' }, title: { type: 'string' } });
const PROPOSAL_CONTROLS = Object.freeze(['dose', 'water', 'grind', 'temperature', 'ratio']);
const cleanInventory = (coffee) => Object.fromEntries(['refKey', 'name', 'roaster', 'origin', 'region', 'process', 'status', 'jarSlot', 'recipes'].filter((key) => Object.hasOwn(coffee || {}, key)).map((key) => [key, clone(coffee[key])]));
const isCurrentCoffeeReference = (value) => /^(?:this|current)(?:\s+(?:coffee|bean|one))?$/i.test(String(value || '').trim());
const displaySlot = (slot) => ({ aiden: 'Aiden', v60_hot: 'hot V60', v60_iced: 'iced V60', kalita_hot: 'hot Kalita', kalita_iced: 'iced Kalita' }[slot] || slot);
const missingRecipeSummary = (slotKey, available = []) => {
  const otherSlots = available.filter((slot) => slot !== slotKey).map(displaySlot);
  return `This coffee has no ${displaySlot(slotKey)} recipe${otherSlots.length ? `; it has ${otherSlots.join(' and ')}` : ''}.`;
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
function methodFocusForCoffee(ledger, snapshot, coffeeRef) {
  const coffee = snapshot?.coffees?.find((item) => item.refKey === coffeeRef);
  const name = String(coffee?.name || '').trim().toLocaleLowerCase();
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

function techniqueIdentity(recipe = {}) {
  return {
    currentFamilyId: recipe.sourceLineage?.familyId || recipe.sourceLineage?.technique || recipe.technique || null,
    currentTechniqueId: recipe.sourceLineage?.technique || recipe.technique || null,
    currentSourceId: recipe.sourceLineage?.sourceIds?.[0] || recipe.sourceId || null,
  };
}

function techniqueKey(coffeeRef, slotKey) { return `${coffeeRef}:${slotKey}`; }

function safeTechniqueAdaptation(value) {
  return String(value || '').replace(/\s+through\s+v60-dose-scaling-v1\.?/i, ' through the app’s supported dose range.');
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

function setTechniqueReadiness(context, { coffeeRef, slotKey, recipe, options = [] } = {}) {
  if (!context?.proposalState || !recipe || !coffeeRef || slotKey !== 'v60_hot' || !isTechniqueExplorationRequest(context.userText) || !options.length) return;
  const sourceHash = recipeSourceHash(recipe, slotKey);
  const optionIds = options.flatMap((option) => [option.id, option.familyId, option.sourceId]).filter(Boolean);
  context.proposalState.techniqueReady = { coffeeRef, slot: slotKey, sourceHash, optionIds: [...new Set(optionIds)] };
  context.proposalState.target = context.proposalState.target || { coffeeRef, slot: slotKey };
}

function techniqueReadinessMatches(context, { coffeeRef, slotKey, target = null } = {}) {
  const ready = context?.proposalState?.techniqueReady;
  return Boolean(ready?.coffeeRef === coffeeRef
    && ready?.slot === slotKey
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
      const methodFocus = methodFocusForCoffee(context.ledger, snapshot, args.coffeeRef);
      const method = resolveMethod({
        userText: context.userText || '',
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
      return { ...publicEvidence(evidence), method, coffeeRef: args.coffeeRef };
    }
    const slotKey = args.slot || args.slotKey;
    if (name === 'read_technique_options') {
      if (slotKey !== 'v60_hot') return { ok: false, actionable: false, code: 'unsupported_technique_brewer', message: 'Technique exploration is available for a saved hot V60 recipe only.' };
      const recipe = await readRecipe(coffeeId, slotKey, args.coffeeRef);
      if (!recipe || recipe.code || recipe.device !== 'v60' || recipe.mode !== 'hot' || recipe.isIced === true) {
        return { ok: true, actionable: false, current: null, options: listV60TechniqueOptions().map((option) => ({ ...option, adaptation: safeTechniqueAdaptation(option.adaptation) })), message: 'I can compare these source-backed hot V60 techniques, but I need a saved hot V60 recipe before I can prepare an executable experiment.' };
      }
      const variant = String(recipe.variant || recipe.v60Variant || '').toLowerCase();
      const nonStandard = variant === 'switch' || (recipe.v60Size != null && String(recipe.v60Size) !== '02') || (recipe.configurationKey != null && recipe.configurationKey !== 'v60:02:standard-paper');
      if (nonStandard) {
        return { ok: true, actionable: false, current: { technique: recipe.technique || null, variant: variant || null }, options: listV60TechniqueOptions().map((option) => ({ ...option, adaptation: safeTechniqueAdaptation(option.adaptation) })), message: 'I can discuss standard hot V60 techniques, but this saved recipe is a different V60 configuration, so I will not prepare a timer-ready experiment from it.' };
      }
      const key = techniqueKey(args.coffeeRef, slotKey);
      const prior = context.__ruphusTechniqueSelections?.get(key);
      const options = listV60TechniqueOptions({ ...techniqueIdentity(recipe), excludeIds: prior?.selectedIds || [] }).map((option) => ({ ...option, adaptation: safeTechniqueAdaptation(option.adaptation) }));
      if (!(context.__ruphusTechniqueSelections instanceof Map)) Object.defineProperty(context, '__ruphusTechniqueSelections', { value: new Map(), enumerable: false, writable: true, configurable: true });
      context.__ruphusTechniqueSelections.set(key, {
        current: techniqueIdentity(recipe),
        offeredIds: options.flatMap((option) => [option.id, option.familyId, option.sourceId]),
        selectedIds: prior?.selectedIds || [],
      });
      rememberTarget({ coffeeRef: args.coffeeRef, coffeeId, slotKey, before: modelRecipe(recipe), sourceHash: recipeSourceHash(recipe, slotKey), techniqueOptions: options });
      setTechniqueReadiness(context, { coffeeRef: args.coffeeRef, slotKey, recipe, options });
      return { ok: true, actionable: options.length > 0, coffeeRef: args.coffeeRef, slot: slotKey, current: { technique: recipe.technique || null, sourceLineage: clone(recipe.sourceLineage || null) }, options,
        ...(options.length ? {} : { message: 'There is no other supported source-backed hot V60 technique available for this recipe right now.' }) };
    }
    if (name === 'review_trial_recipe') {
      if (!SLOT_KEYS.includes(slotKey)) throw Object.assign(new Error('resolved recipe slot is required'), { code: 'slot_required' });
      if (typeof readers.readAttempts !== 'function' || typeof readers.readTrialReceipt !== 'function') return { ok: false, message: 'I could not check your trial recipe right now.' };
      const attempts = (await readers.readAttempts({ uid, coffeeId })).filter(item => item.ownerId === uid && item.coffeeId === coffeeId && item.slotKey === slotKey && item.proposalId && !item.promotedRevisionId && ['created', 'timer_started', 'profile_prepared', 'completed', 'tasted'].includes(item.status));
      const trialRef = item => `trial-${canonicalHash({ uid, id: item.id }).slice(0, 16)}`;
      const conversationReceipt = (context.__ruphusTrialReceipts || []).filter(item => item.coffeeId === coffeeId && item.slotKey === slotKey).at(-1);
      const selected = args.trialRef ? attempts.filter(item => trialRef(item) === args.trialRef)
        : conversationReceipt ? attempts.filter(item => item.id === conversationReceipt.attemptId) : attempts;
      if (selected.length !== 1) return { ok: false, candidates: attempts.map(item => ({ trialRef: trialRef(item), createdAt: item.createdAt || null, recipe: modelRecipe(item.snapshot) })), message: attempts.length ? 'Ask which of these trial dates or adjustments the user means, then call again with its trialRef. Do not choose for them.' : 'There is no unsaved trial for this coffee and brewer that I can recover.' };
      const attempt = selected[0];
      const savedReceipt = await readers.readTrialReceipt({ uid, attemptId: attempt.id });
      if (!args.trialRef && conversationReceipt && savedReceipt?.id !== conversationReceipt.id) return { ok: false, message: 'I could not verify the trial from this conversation.' };
      if (!savedReceipt || savedReceipt.ownerId !== uid || savedReceipt.mode !== 'brew_once' || savedReceipt.attemptId !== attempt.id || savedReceipt.coffeeId !== coffeeId || savedReceipt.slotKey !== slotKey) return { ok: false, message: 'I could not recover the confirmation for this trial.' };
      const coffeeName = snapshot.coffees?.find(item => item.refKey === args.coffeeRef)?.name || context.turnBinding?.coffeeName || 'This coffee';
      const artifact = makeArtifact('action_receipt', { id: savedReceipt.id, status: 'ready', mode: 'brew_once', actionId: savedReceipt.actionId, attemptId: attempt.id, proposalId: attempt.proposalId, coffeeId, slotKey, revisionId: attempt.revisionId, sourceHash: attempt.sourceHash, promoteAvailable: proposalActions.includes('apply_proposal'), title: `${coffeeName} · ${displaySlot(slotKey)}`, message: 'Review your trial recipe below. Recovering this card does not change your saved recipe.', recipe: modelRecipe(attempt.snapshot) });
      return { ok: true, summary: 'Recovered the existing trial. The save button requires the user’s tap; no recipe was changed.', artifact };
    }
    if (name === 'read_recipe') {
      if (!SLOT_KEYS.includes(slotKey)) throw Object.assign(new Error('resolved recipe slot is required'), { code: 'slot_required' });
      const recipe = await readRecipe(coffeeId, slotKey, args.coffeeRef);
      if (!recipe || recipe.code) return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, displayName: displaySlot(slotKey), summary: missingRecipeSummary(slotKey, snapshot.coffees?.find((coffee) => coffee.refKey === args.coffeeRef)?.recipes || []), recipe: null };
      rememberTarget({ coffeeRef: args.coffeeRef, coffeeId, slotKey, before: modelRecipe(recipe), sourceHash: recipeSourceHash(recipe, slotKey) });
      if (context.proposalState && !context.proposalState.target) context.proposalState.target = { coffeeRef: args.coffeeRef, slot: slotKey };
      setPreviewReadiness(context, { coffeeRef: args.coffeeRef, slotKey, recipe });
      return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, displayName: displaySlot(slotKey), summary: `${displaySlot(slotKey)} recipe: ${recipe.dose ?? recipe.coffeeGrams ?? '?'}g coffee to ${recipe.water ?? recipe.waterGrams ?? '?'}g water.`, recipe: modelRecipe(recipe) };
    }
    const experiment = args.experiment && typeof args.experiment === 'object' && !Array.isArray(args.experiment) ? args.experiment : null;
    const experimentHasSelection = Boolean(experiment?.techniqueId || experiment?.familyId || experiment?.sourceId);
    const techniqueExperiment = experiment?.kind === 'v60_technique';
    if (experimentHasSelection && !techniqueExperiment) return { ok: false, code: 'invalid_proposal_intent', message: 'Technique experiments must use the supported V60 technique intent.' };
    if (techniqueExperiment && args.change) return { ok: false, code: 'invalid_proposal_intent', message: 'Choose either one recipe adjustment or one technique experiment, not both.' };
    if (!SLOT_KEYS.includes(slotKey)) throw Object.assign(new Error('resolved recipe slot is required'), { code: 'slot_required' });
    if (techniqueExperiment && slotKey !== 'v60_hot') return { ok: false, code: 'unsupported_technique_brewer', message: 'Technique experiments require a saved hot V60 recipe.' };
    const target = context.__ruphusResolvedTargets instanceof Map ? context.__ruphusResolvedTargets.get(`${args.coffeeRef}:${slotKey}`) : null;
    if (techniqueExperiment && !techniqueReadinessMatches(context, { coffeeRef: args.coffeeRef, slotKey, target })) {
      return { ok: false, code: 'technique_option_required', message: 'Choose one of the supported techniques I just showed you.' };
    }
    if (!canPropose
      || (!techniqueExperiment && context.proposalState && context.proposalState.previewReady !== true && (context.proposalState.diagnosisReady !== true || context.proposalState.userAgreed !== true))
      || (!techniqueExperiment && conditionalSensoryClarification(context.proposalState))) {
      throw Object.assign(new Error('proposal is not yet earned'), { code: 'proposal_timing' });
    }
    if (!target || target.coffeeId !== coffeeId || target.coffeeRef !== args.coffeeRef) return { ok: false, code: 'proposal_target_required', message: 'Read the exact coffee and recipe before suggesting a change.' };
    let experimentMetadata = null;
    let requestedPatch = args.change ? patchForChange(target.before || {}, args.change) : args.afterRecipe;
    if (args.change?.control === 'ratio') {
      try {
        const beforeRecipe = target.before || {};
        const dose = Number(beforeRecipe.coffeeGrams ?? beforeRecipe.userCoffeeGrams ?? beforeRecipe.dose);
        requestedPatch = createRecipePreview({ recipe: beforeRecipe, dose, ratio: args.change.value, allowIced: true });
      } catch (error) {
        return { ok: false, code: error.code || 'invalid_ratio_preview', message: error.message };
      }
    }
    if (techniqueExperiment) {
      const selectedId = experiment.techniqueId || experiment.familyId || experiment.sourceId;
      const selected = context.proposalState?.techniqueReady?.optionIds?.includes(selectedId)
        ? (target.techniqueOptions || []).find((option) => [option.id, option.familyId, option.sourceId].includes(selectedId))
        : null;
      if (!selected) return { ok: false, code: 'technique_option_required', message: 'Choose one of the supported techniques I just showed you.' };
      const before = target.before || {};
      const dose = Number(before.coffeeGrams ?? before.userCoffeeGrams ?? before.dose);
      try {
        // The first selection is a complete source-backed experiment. Do not
        // copy the current family's controls into it; later dose previews use
        // this selected recipe as their reviewed source of truth.
        const generated = generateV60TechniqueOption(selected.id, {}, { dose, grinder: snapshot.setup?.grinder });
        generated.recipe.techniqueLabel = selected.name;
        const preview = createRecipePreview({ recipe: generated.recipe, dose, ratio: recipeRatio(generated.recipe) });
        requestedPatch = preview;
        experimentMetadata = {
          protocolVersion: RECIPE_TECHNIQUE_EXPERIMENT_PROTOCOL_VERSION,
          kind: 'v60_technique', techniqueId: selected.id, familyId: selected.familyId, sourceId: selected.sourceId,
          name: selected.name, differences: clone(selected.differences), adaptation: safeTechniqueAdaptation(selected.adaptation),
          attribution: clone(selected.attribution), sourceRegistryVersion: selected.sourceRegistryVersion,
          currentTechnique: before.technique || before.sourceLineage?.technique || null,
        };
        const state = context.__ruphusTechniqueSelections?.get(techniqueKey(args.coffeeRef, slotKey));
        if (state) state.selectedIds = [...new Set([...(state.selectedIds || []), selected.id, selected.familyId, selected.sourceId])];
      } catch (error) {
        return { ok: false, code: error.code || 'technique_generation_failed', message: error.message };
      }
    }
    if (!requestedPatch || typeof requestedPatch !== 'object' || Array.isArray(requestedPatch)) return { ok: false, code: 'invalid_proposal', message: 'Choose one recipe control and a concrete value.' };
    if (context.proposalState?.target && (context.proposalState.target.coffeeRef !== args.coffeeRef || context.proposalState.target.slot !== slotKey)) return { ok: false, code: 'proposal_target_mismatch', message: 'That suggestion is bound to a different coffee and recipe.' };
    const recipe = await readRecipe(coffeeId, slotKey, args.coffeeRef);
    if (!recipe || recipe.code) return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, summary: missingRecipeSummary(slotKey, snapshot.coffees?.find((coffee) => coffee.refKey === args.coffeeRef)?.recipes || []), recipe: null };
    const before = clone(target.before);
    let after = mergeRecipePatch(before, requestedPatch);
    if (args.change?.control === 'dose') after = generatedDoseRecipe(before, slotKey, Number(args.change.value)) || after;
    const grinder = snapshot.setup?.grinder;
    const previousGrind = before.grindSize?.setting ?? before.grind;
    const nextGrind = after.grindSize?.setting ?? after.grind;
    if (grinder === 'fellow-ode-gen2' && String(previousGrind) !== String(nextGrind)) {
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
    const paths = args.change?.control === 'dose' ? ['dose'] : changedPaths(before, after).filter(Boolean);
    const controls = techniqueExperiment ? ['technique'] : args.change ? [args.change.control] : [...new Set(paths.map(recipeControl))];
    if (recipeSourceHash(recipe, slotKey) !== target.sourceHash) return { ok: false, code: 'proposal_target_stale', message: 'That recipe changed; read it again before suggesting a change.' };
    if (!techniqueExperiment && (controls.length !== 1 || ['method', 'device', 'mode'].includes(controls[0]))) return { ok: false, code: 'one_change_required', message: 'A proposal must change exactly one supported control.' };
    const validationRecipe = after.sourceLineage ? after : recipe.sourceLineage ? { ...after, sourceLineage: clone(recipe.sourceLineage) } : after;
    const validation = validateExecutableRecipe(validationRecipe, slotKey);
    if (!validation.valid) return { ok: false, code: 'invalid_recipe', errors: validation.errors };
    const coffeeName = snapshot.coffees?.find((item) => item.refKey === args.coffeeRef)?.name
      || (context.turnBinding?.coffeeRef === args.coffeeRef ? context.turnBinding.coffeeName : null);
    const artifact = makeArtifact('recipe_proposal', { id: args.proposalId || `proposal-${canonicalHash({ uid, coffeeId, slotKey, after, sessionId: context.sessionId || 'agent-session' }).slice(0, 16)}`, status: 'proposed', coffeeId, ...(coffeeName ? { coffeeName } : {}), slotKey, before: clone(before), after: clone(after), changedPaths: techniqueExperiment ? ['technique', ...paths] : paths, ...(experimentMetadata ? { techniqueExperiment: experimentMetadata } : {}), actions: [], recipeHash: canonicalHash(after), sourceHash: target.sourceHash });
    const proposal = typeof proposalStore === 'function' ? await proposalStore({ uid, coffeeId, slotKey, sessionId: context.sessionId || context.launchContext?.sessionId || context.context?.sessionId || 'agent-session', after: validationRecipe, proposalId: artifact.id }) : artifact;
    if (context.proposalState) {
      context.proposalState.proposalIssued = true;
      if (techniqueExperiment) {
        context.proposalState.previewReady = true;
        context.proposalState.diagnosisReady = true;
        context.proposalState.userAgreed = true;
      }
    }
    const actions = typeof proposalStore === 'function' && proposal?.status === 'proposed' && proposal?.sourceRevisionId
      ? ['apply_proposal', 'brew_once', 'keep_current'].filter((mode) => proposalActions.includes(mode))
      : [];
    return { ok: true, proposal: clone(proposal), artifact: clone({ ...artifact, actions, ...(proposal?.sourceRevisionId ? { sourceRevisionId: proposal.sourceRevisionId } : {}), ...(proposal?.sessionId ? { sessionId: proposal.sessionId } : {}) }) };
  };
  const definitions = RUPHUS_READ_TOOL_NAMES.filter((name) => name !== 'resolve_coffee' || context.turnBinding?.status !== 'locked').map((name) => {
    if (name === 'review_trial_recipe') return { type: 'function', name, description: 'Recover an existing Brew once trial when the user asks to keep it, make it permanent, or save that trial. This reads the actual trial and displays its save control; it never saves or requires tasting. Use instead of generating a new recipe from conversation prose. Use null trialRef initially; if several trials are returned, clarify using their dates or adjustments, then pass the chosen trialRef.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string', enum: SLOT_KEYS }, trialRef: nullable({ type: 'string' }) }, required: ['coffeeRef', 'slot', 'trialRef'], additionalProperties: false } };
    if (name === 'resolve_coffee') return { type: 'function', name, description: 'Resolve a coffee reference such as a jar, name, roaster, origin, or pronoun. Call once for a reference, then keep the returned coffeeRef for later tools in this turn.', strict: true, parameters: { type: 'object', properties: { reference: { type: 'string' } }, required: ['reference'], additionalProperties: false } };
    if (name === 'read_coffee_evidence') return { type: 'function', name, description: 'Read recipe, recent brews, and tastings for one resolved coffee in parallel.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, windowDays: nullable({ type: 'number' }) }, required: ['coffeeRef', 'windowDays'], additionalProperties: false } };
    if (name === 'read_recipe') return { type: 'function', name, description: 'When a bounded recommendation or selected technique needs exact source data, read one exact recipe slot once immediately before a proposal. Do not use this during diagnosis because read_coffee_evidence already includes the recipe.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string', enum: SLOT_KEYS } }, required: ['coffeeRef', 'slot'], additionalProperties: false } };
    if (name === 'read_technique_options') return { type: 'function', name, description: 'For an explicit request for a different hot V60 technique, read eligible source-backed alternatives for this coffee. The returned options are safe to discuss; choose one exact option before requesting an experiment.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string', enum: ['v60_hot'] } }, required: ['coffeeRef', 'slot'], additionalProperties: false } };
    return { type: 'function', name, description: 'Prepare one review card: either one bounded recipe-control change, or one explicitly selected source-backed V60 technique experiment. These are proposals only; never claim a save or brew.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string', enum: SLOT_KEYS }, change: nullable({ type: 'object', properties: { control: { type: 'string', enum: PROPOSAL_CONTROLS }, value: { anyOf: [{ type: 'number' }, { type: 'string' }] } }, required: ['control', 'value'], additionalProperties: false }), experiment: nullable(strictObject({ kind: { type: 'string', enum: ['v60_technique'] }, techniqueId: { type: 'string' }, familyId: { type: 'string' }, sourceId: { type: 'string' } })) }, required: ['coffeeRef', 'slot', 'change', 'experiment'], additionalProperties: false } };
  });
  return Object.freeze({ names: RUPHUS_READ_TOOL_NAMES, definitions, call });
}
