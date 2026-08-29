import { canonicalHash, clone } from '../../src/lib/ruphus/contracts.js';
import { makeArtifact } from '../../src/lib/ruphus/artifactRegistry.js';
import { validateExecutableRecipe } from '../../src/lib/ruphus/legacyRecipeResolver.js';

export const RUPHUS_READ_TOOL_NAMES = Object.freeze(['read_coffee', 'read_recipe', 'read_tastings', 'read_attempts', 'propose_recipe_change']);
export const RUPHUS_FORBIDDEN_TOOL_NAMES = Object.freeze(['apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'prepare_attempt', 'undo_revision', 'promote_attempt', 'create_receipt', 'fellow_prepare', 'claim_physical_success']);
// Responses strict schemas cannot express optional object properties. Every
// canonical field is therefore required but nullable, so a real V60/Aiden
// recipe can carry only its method-valid controls while remaining strict.
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const strictObject = (properties) => ({ type: 'object', properties: Object.fromEntries(Object.entries(properties).map(([key, schema]) => [key, nullable(schema)])), required: Object.keys(properties), additionalProperties: false });
const STEP_PROPERTIES = { timeSeconds: { type: 'number' }, time: { type: 'string' }, waterTotal: { type: 'number' }, action: { type: 'string' }, name: { type: 'string' }, phase: { type: 'string' } };
const WATER_TEMP_PROPERTIES = { celsius: { type: 'number' }, fahrenheit: { type: 'number' } };
const GRIND_SIZE_PROPERTIES = { setting: { anyOf: [{ type: 'number' }, { type: 'string' }] }, microns: { type: 'number' }, description: { type: 'string' }, grinderSpecific: { type: 'boolean' } };
const RECIPE_PROPERTIES = Object.freeze({ method: { type: 'string' }, device: { type: 'string' }, mode: { type: 'string' }, variant: { type: 'string' }, v60Variant: { type: 'string' }, v60Size: { type: 'string' }, kalitaSize: { type: 'string' }, configurationKey: { type: 'string' }, doseProfile: { type: 'string' }, coffeeGrams: { type: 'number' }, userCoffeeGrams: { type: 'number' }, dose: { type: 'number' }, waterGrams: { type: 'number' }, water: { type: 'number' }, ratio: { anyOf: [{ type: 'number' }, { type: 'string' }] }, isIced: { type: 'boolean' }, hotWaterGrams: { type: 'number' }, recipeIceGrams: { type: 'number' }, temperatureC: { type: 'number' }, grind: { type: 'string' }, technique: { type: 'string' }, techniqueLabel: { type: 'string' }, techniqueInstruction: { type: 'string' }, steps: { type: 'array', items: strictObject(STEP_PROPERTIES) }, prepSteps: { type: 'array', items: strictObject({ action: { type: 'string' }, phase: { type: 'string' } }) }, postBrewSteps: { type: 'array', items: strictObject({ action: { type: 'string' }, phase: { type: 'string' } }) }, waterTemp: strictObject(WATER_TEMP_PROPERTIES), grindSize: strictObject(GRIND_SIZE_PROPERTIES), totalBrewTimeSeconds: { type: 'number' }, totalBrewTime: { type: 'string' }, guideTargetSeconds: { type: 'number' }, guideRangeSeconds: { type: 'array', items: { type: 'number' } }, timerReady: { type: 'boolean' }, phaseContractVersion: { type: 'number' }, candidate: { type: 'boolean' }, doseTimingPolicy: { type: 'string' }, engineVersion: { type: 'string' }, rulesVersion: { type: 'string' }, sourceRegistryVersion: { type: 'string' }, reasonCodes: { type: 'array', items: { type: 'string' } }, fallback: { type: 'boolean' }, generationStatus: { type: 'string' }, reasoning: { type: 'string' }, tips: { type: 'string' }, title: { type: 'string' } });
const STRICT_RECIPE_PROPERTIES = Object.freeze(Object.fromEntries(Object.entries(RECIPE_PROPERTIES).map(([key, schema]) => [key, nullable(schema)])));

function forbidOwner(args) {
  if (args?.uid || args?.ownerId || args?.userId) throw Object.assign(new Error('owner identity is server-bound'), { code: 'forged_owner' });
}
function requireCoffee(args, context) {
  forbidOwner(args);
  if (!args?.coffeeId || args.coffeeId !== context?.context?.coffeeId) throw Object.assign(new Error('coffee is outside bound context'), { code: 'cross_owner_or_context' });
}
function changedPaths(before, after, prefix = '') {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) || Array.isArray(after)) return Array.isArray(before) && Array.isArray(after) && canonicalHash(before) === canonicalHash(after) ? [] : [prefix];
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [prefix];
  // Strict Responses schemas represent absent optional controls as null. After
  // canonicalization those keys are omitted; omission is not a recipe change.
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const presentAfter = new Set(Object.keys(after));
  return [...keys].flatMap((key) => presentAfter.has(key) ? changedPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key) : []);
}

function recipeValue(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return recipe;
  const value = clone(recipe);
  delete value.selectedPath;
  delete value.selectedHash;
  // Resolver lineage is evidence metadata, not a production recipe control.
  delete value.sourceLineage;
  const work = [value];
  while (work.length) {
    const current = work.pop();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      current.forEach((item) => { if (item && typeof item === 'object') work.push(item); });
      continue;
    }
    Object.keys(current).forEach((key) => {
      if (current[key] === null) delete current[key];
      else if (current[key] && typeof current[key] === 'object') work.push(current[key]);
    });
  }
  return value;
}

export function createRuphusTools({ uid, context, readers: _readers = {}, proposalStore }) {
  if (!uid || !context) throw new Error('tools require owner and context');
  const call = async (name, args = {}) => {
    if (!RUPHUS_READ_TOOL_NAMES.includes(name)) throw Object.assign(new Error(`tool unavailable: ${name}`), { code: 'tool_unavailable' });
    if (name === 'read_coffee') {
      requireCoffee(args, context);
      return { ok: true, data: clone(context.coffee), artifact: makeArtifact('coffee_context', { id: `coffee-context-${context.context.coffeeId}`, coffee: clone(context.coffee), context: clone(context.context) }) };
    }
    if (name === 'read_recipe') {
      requireCoffee(args, context);
      if (!context.recipe || typeof context.recipe !== 'object') return { ok: false, code: 'data_gap', artifact: makeArtifact('data_gap', { id: `recipe-gap-${context.context.coffeeId}`, title: 'No executable recipe found', options: [{ id: 'choose-method', label: 'Choose a brew method' }] }) };
      return { ok: true, data: clone(context.recipe), artifact: makeArtifact('current_recipe', { id: `current-recipe-${context.context.coffeeId}`, recipe: clone(recipeValue(context.recipe)) }) };
    }
    if (name === 'read_tastings') { requireCoffee(args, context); return { ok: true, data: clone(context.tastings) }; }
    if (name === 'read_attempts') { requireCoffee(args, context); return { ok: true, data: clone(context.attempts) }; }
    requireCoffee(args, context);
    if (!context.recipe || typeof context.recipe !== 'object') return { ok: false, code: 'data_gap', artifact: makeArtifact('data_gap', { id: `recipe-gap-${context.context.coffeeId}`, title: 'No executable recipe found', options: [{ id: 'choose-method', label: 'Choose a brew method' }] }) };
    if (!args.afterRecipe || typeof args.afterRecipe !== 'object' || Array.isArray(args.afterRecipe)) return { ok: false, code: 'invalid_proposal', message: 'A complete candidate recipe is required.' };
    const beforeRecipe = recipeValue(context.recipe);
    const afterRecipe = recipeValue(args.afterRecipe);
    const paths = changedPaths(beforeRecipe, afterRecipe).filter(Boolean);
    if (paths.length !== 1 || paths[0].startsWith('method') || paths[0].startsWith('device') || paths[0].startsWith('mode')) return { ok: false, code: 'one_change_required', message: 'A proposal must change exactly one supported control.' };
    // Provenance is server-bound evidence, never a model-controlled recipe
    // field. Reattach the bound lineage only for the production validator.
    const validationRecipe = context.recipe.sourceLineage ? { ...afterRecipe, sourceLineage: clone(context.recipe.sourceLineage) } : afterRecipe;
    const validation = validateExecutableRecipe(validationRecipe, context.context.slotKey);
    if (!validation.valid) return { ok: false, code: 'invalid_recipe', errors: validation.errors };
    const artifact = makeArtifact('recipe_proposal', { id: args.proposalId || `proposal-${canonicalHash({ uid, coffeeId: args.coffeeId, after: afterRecipe }).slice(0, 16)}`, status: 'proposed', coffeeId: args.coffeeId, slotKey: context.context.slotKey, before: clone(beforeRecipe), after: clone(afterRecipe), changedPaths: paths, actions: ['apply_proposal', 'brew_once', 'keep_current'], recipeHash: canonicalHash(afterRecipe), sourceHash: context.evidenceHash });
    let proposal = artifact;
    if (typeof proposalStore === 'function') proposal = await proposalStore({ uid, coffeeId: args.coffeeId, slotKey: context.context.slotKey, sessionId: context.context.sessionId, after: validationRecipe, proposalId: artifact.id });
    return { ok: true, proposal: clone(proposal), artifact: clone(artifact) };
  };
  const definitions = RUPHUS_READ_TOOL_NAMES.map((name) => ({ type: 'function', name, description: `Owner-scoped Coffee ${name.replaceAll('_', ' ')}`, strict: true, parameters: { type: 'object', properties: name === 'propose_recipe_change' ? { coffeeId: { type: 'string' }, afterRecipe: { type: 'object', properties: STRICT_RECIPE_PROPERTIES, required: Object.keys(STRICT_RECIPE_PROPERTIES), additionalProperties: false } } : { coffeeId: { type: 'string' } }, required: name === 'propose_recipe_change' ? ['coffeeId', 'afterRecipe'] : ['coffeeId'], additionalProperties: false } }));
  return Object.freeze({ names: RUPHUS_READ_TOOL_NAMES, definitions, call });
}
