import { canonicalHash, clone } from '../../src/lib/ruphus/contracts.js';
import { makeArtifact } from '../../src/lib/ruphus/artifactRegistry.js';
import { validateExecutableRecipe } from '../../src/lib/ruphus/legacyRecipeResolver.js';

export const RUPHUS_READ_TOOL_NAMES = Object.freeze(['read_coffee', 'read_recipe', 'read_tastings', 'read_attempts', 'propose_recipe_change']);
export const RUPHUS_FORBIDDEN_TOOL_NAMES = Object.freeze(['apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'prepare_attempt', 'undo_revision', 'promote_attempt', 'create_receipt', 'fellow_prepare', 'claim_physical_success']);
const RECIPE_PROPERTIES = Object.freeze({ method: { type: 'string' }, device: { type: 'string' }, mode: { type: 'string' }, variant: { type: 'string' }, v60Variant: { type: 'string' }, v60Size: { type: 'string' }, kalitaSize: { type: 'string' }, configurationKey: { type: 'string' }, coffeeGrams: { type: 'number' }, userCoffeeGrams: { type: 'number' }, dose: { type: 'number' }, waterGrams: { type: 'number' }, water: { type: 'number' }, ratio: { type: ['number', 'string'] }, isIced: { type: 'boolean' }, hotWaterGrams: { type: 'number' }, recipeIceGrams: { type: 'number' }, temperatureC: { type: 'number' }, grind: { type: 'string' }, technique: { type: 'string' }, steps: { type: 'array', items: { type: 'object', properties: {}, required: [], additionalProperties: false } }, prepSteps: { type: 'array', items: { type: 'object', properties: {}, required: [], additionalProperties: false } }, postBrewSteps: { type: 'array', items: { type: 'object', properties: {}, required: [], additionalProperties: false } }, waterTemp: { type: 'object', properties: {}, required: [], additionalProperties: false }, grindSize: { type: 'object', properties: {}, required: [], additionalProperties: false }, sourceLineage: { type: 'object', properties: {}, required: [], additionalProperties: false }, totalBrewTimeSeconds: { type: 'number' }, guideTargetSeconds: { type: 'number' }, guideRangeSeconds: { type: 'array', items: { type: 'number' } }, timerReady: { type: 'boolean' }, reasonCodes: { type: 'array', items: { type: 'string' } }, reasoning: { type: 'string' } });

function forbidOwner(args) {
  if (args?.uid || args?.ownerId || args?.userId) throw Object.assign(new Error('owner identity is server-bound'), { code: 'forged_owner' });
}
function requireCoffee(args, context) {
  forbidOwner(args);
  if (!args?.coffeeId || args.coffeeId !== context?.context?.coffeeId) throw Object.assign(new Error('coffee is outside bound context'), { code: 'cross_owner_or_context' });
}
function changedPaths(before, after, prefix = '') {
  if (Object.is(before, after)) return [];
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) return [prefix];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].flatMap((key) => changedPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key));
}

export function createRuphusTools({ uid, context, readers: _readers = {}, proposalStore }) {
  if (!uid || !context) throw new Error('tools require owner and context');
  const call = async (name, args = {}) => {
    if (!RUPHUS_READ_TOOL_NAMES.includes(name)) throw Object.assign(new Error(`tool unavailable: ${name}`), { code: 'tool_unavailable' });
    if (name === 'read_coffee') { requireCoffee(args, context); return { ok: true, data: clone(context.coffee) }; }
    if (name === 'read_recipe') { requireCoffee(args, context); return { ok: true, data: clone(context.recipe) }; }
    if (name === 'read_tastings') { requireCoffee(args, context); return { ok: true, data: clone(context.tastings) }; }
    if (name === 'read_attempts') { requireCoffee(args, context); return { ok: true, data: clone(context.attempts) }; }
    requireCoffee(args, context);
    if (!context.recipe || typeof context.recipe !== 'object') return { ok: false, code: 'data_gap', message: 'No executable recipe is bound to this context.' };
    if (!args.afterRecipe || typeof args.afterRecipe !== 'object' || Array.isArray(args.afterRecipe)) return { ok: false, code: 'invalid_proposal', message: 'A complete candidate recipe is required.' };
    const paths = changedPaths(context.recipe, args.afterRecipe).filter(Boolean);
    if (paths.length !== 1 || paths[0].startsWith('method') || paths[0].startsWith('device') || paths[0].startsWith('mode')) return { ok: false, code: 'one_change_required', message: 'A proposal must change exactly one supported control.' };
    const validation = validateExecutableRecipe(args.afterRecipe, context.context.slotKey);
    if (!validation.valid) return { ok: false, code: 'invalid_recipe', errors: validation.errors };
    const artifact = makeArtifact('recipe_proposal', { id: args.proposalId || `proposal-${canonicalHash({ uid, coffeeId: args.coffeeId, after: args.afterRecipe }).slice(0, 16)}`, status: 'proposed', coffeeId: args.coffeeId, slotKey: context.context.slotKey, before: clone(context.recipe), after: clone(args.afterRecipe), changedPaths: paths, actions: ['apply_proposal', 'brew_once', 'keep_current'], recipeHash: canonicalHash(args.afterRecipe), sourceHash: context.evidenceHash });
    let proposal = artifact;
    if (typeof proposalStore === 'function') proposal = await proposalStore({ uid, coffeeId: args.coffeeId, slotKey: context.context.slotKey, sessionId: context.context.sessionId, after: args.afterRecipe, proposalId: artifact.id });
    return { ok: true, proposal: clone(proposal), artifact: clone(artifact) };
  };
  const definitions = RUPHUS_READ_TOOL_NAMES.map((name) => ({ type: 'function', name, description: `Owner-scoped Coffee ${name.replaceAll('_', ' ')}`, strict: true, parameters: { type: 'object', properties: name === 'propose_recipe_change' ? { coffeeId: { type: 'string' }, afterRecipe: { type: 'object', properties: RECIPE_PROPERTIES, required: Object.keys(RECIPE_PROPERTIES), additionalProperties: false } } : { coffeeId: { type: 'string' } }, required: name === 'propose_recipe_change' ? ['coffeeId', 'afterRecipe'] : ['coffeeId'], additionalProperties: false } }));
  return Object.freeze({ names: RUPHUS_READ_TOOL_NAMES, definitions, call });
}
