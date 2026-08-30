import { canonicalHash, clone, SLOT_KEYS } from '../../src/lib/ruphus/contracts.js';
import { makeArtifact } from '../../src/lib/ruphus/artifactRegistry.js';
import { validateExecutableRecipe } from '../../src/lib/ruphus/legacyRecipeResolver.js';
import { resolveCoffeeReference } from '../../src/lib/ruphus/referenceResolver.js';
import { resolveMethod } from '../../src/lib/ruphus/methodResolver.js';
import { appendLedger, ledgerEntryFromEvidence, MAX_LEDGER_BYTES, publicEvidence, readCoffeeEvidence } from './ruphusEvidence.js';

export const RUPHUS_READ_TOOL_NAMES = Object.freeze(['resolve_coffee', 'read_coffee_evidence', 'read_recipe', 'propose_recipe_change']);
export const RUPHUS_FORBIDDEN_TOOL_NAMES = Object.freeze(['apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'complete_attempt', 'prepare_attempt', 'undo_revision', 'promote_attempt', 'create_receipt', 'fellow_prepare', 'claim_physical_success']);
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const strictObject = (properties) => ({ type: 'object', properties: Object.fromEntries(Object.entries(properties).map(([key, schema]) => [key, nullable(schema)])), required: Object.keys(properties), additionalProperties: false });
const RECIPE_PROPERTIES = Object.freeze({ method: { type: 'string' }, device: { type: 'string' }, mode: { type: 'string' }, variant: { type: 'string' }, v60Variant: { type: 'string' }, v60Size: { type: 'string' }, kalitaSize: { type: 'string' }, configurationKey: { type: 'string' }, doseProfile: { type: 'string' }, coffeeGrams: { type: 'number' }, userCoffeeGrams: { type: 'number' }, dose: { type: 'number' }, waterGrams: { type: 'number' }, water: { type: 'number' }, ratio: { anyOf: [{ type: 'number' }, { type: 'string' }] }, isIced: { type: 'boolean' }, hotWaterGrams: { type: 'number' }, recipeIceGrams: { type: 'number' }, temperatureC: { type: 'number' }, grind: { type: 'string' }, technique: { type: 'string' }, techniqueLabel: { type: 'string' }, techniqueInstruction: { type: 'string' }, steps: { type: 'array' }, prepSteps: { type: 'array' }, postBrewSteps: { type: 'array' }, waterTemp: strictObject({ celsius: { type: 'number' }, fahrenheit: { type: 'number' } }), grindSize: strictObject({ setting: { anyOf: [{ type: 'number' }, { type: 'string' }] }, microns: { type: 'number' }, description: { type: 'string' }, grinderSpecific: { type: 'boolean' } }), totalBrewTimeSeconds: { type: 'number' }, totalBrewTime: { type: 'string' }, guideTargetSeconds: { type: 'number' }, guideRangeSeconds: { type: 'array' }, timerReady: { type: 'boolean' }, phaseContractVersion: { type: 'number' }, candidate: { type: 'boolean' }, doseTimingPolicy: { type: 'string' }, engineVersion: { type: 'string' }, rulesVersion: { type: 'string' }, sourceRegistryVersion: { type: 'string' }, reasonCodes: { type: 'array' }, fallback: { type: 'boolean' }, generationStatus: { type: 'string' }, reasoning: { type: 'string' }, tips: { type: 'string' }, title: { type: 'string' } });
const STRICT_RECIPE_PROPERTIES = Object.freeze(Object.fromEntries(Object.entries(RECIPE_PROPERTIES).map(([key, schema]) => [key, nullable(schema)])));
const cleanInventory = (coffee) => Object.fromEntries(['refKey', 'name', 'roaster', 'origin', 'region', 'process', 'status', 'jarSlot', 'recipes'].filter((key) => Object.hasOwn(coffee || {}, key)).map((key) => [key, clone(coffee[key])]));
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
function recipeValue(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return recipe;
  const value = clone(recipe); for (const key of ['selectedPath', 'selectedHash', 'sourceLineage']) delete value[key];
  const stack = [value]; while (stack.length) { const current = stack.pop(); if (!current || typeof current !== 'object') continue; for (const key of Object.keys(current)) { if (current[key] === null) delete current[key]; else if (typeof current[key] === 'object') stack.push(current[key]); } }
  return value;
}
function modelRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return null;
  const result = {};
  for (const key of Object.keys(RECIPE_PROPERTIES)) if (Object.hasOwn(recipe, key)) result[key] = clone(recipe[key]);
  return result;
}

export function createRuphusTools({ uid, context, readers = {}, proposalStore, canPropose = true } = {}) {
  if (!uid || !context) throw new Error('tools require owner and context');
  if (!(context.__ruphusResolvedTargets instanceof Map)) Object.defineProperty(context, '__ruphusResolvedTargets', { value: new Map(), enumerable: false, writable: true, configurable: true });
  const snapshot = context.__ruphusServerSnapshot || context.rotationSnapshot || { coffees: [], refs: {} };
  const refs = context.__ruphusRefs ? { ...context.__ruphusRefs } : { ...(snapshot.refs || {}) };
  const resolveId = (coffeeRef) => refs[coffeeRef] || null;
  const list = async () => {
    const coffees = typeof readers.listCoffees === 'function' ? await readers.listCoffees({ uid }) : snapshot.coffees || [];
    return Array.isArray(coffees) ? coffees : [];
  };
  const readRecipe = async (coffeeId, slotKey) => {
    if (!SLOT_KEYS.includes(slotKey)) return null;
    if (typeof readers.readRecipe === 'function') return readers.readRecipe({ uid, coffeeId, slotKey });
    return null;
  };
  const call = async (name, args = {}) => {
    if (!RUPHUS_READ_TOOL_NAMES.includes(name)) throw Object.assign(new Error(`tool unavailable: ${name}`), { code: 'tool_unavailable' });
    forbidOwner(args);
    if (name === 'resolve_coffee') {
      if (typeof args.reference !== 'string' || !args.reference.trim()) throw Object.assign(new Error('reference is required'), { code: 'invalid_tool_input' });
      const inventory = await list();
      const result = resolveCoffeeReference({ reference: args.reference, coffees: inventory, ledger: context.ledger });
      if (!result.ok) return { ok: false, reason: result.reason, candidates: (result.candidates || []).map((item) => cleanInventory(item.coffee)) };
      const resolvedRef = Object.entries(refs).find(([, id]) => id === result.coffee?.id)?.[0] || result.ref;
      if (result.coffee?.id && !refs[resolvedRef]) refs[resolvedRef] = result.coffee.id;
      if (context.launchCoffeeId && resolvedRef !== context.launchCoffeeId) context.__ruphusLaunchHintConsumed = true;
      return { ok: true, coffeeRef: resolvedRef, coffee: cleanInventory({ ...result.coffee, refKey: resolvedRef }), match: result.source };
    }
    requireRef(args);
    const coffeeId = resolveId(args.coffeeRef);
    if (!coffeeId) throw Object.assign(new Error('coffee reference is outside the current owner-scoped context'), { code: 'cross_owner_or_context' });
    if (name === 'read_coffee_evidence') {
      const launchItem = context.launchCoffeeId === args.coffeeRef && !context.__ruphusLaunchHintConsumed ? context.__ruphusLaunchContext?.launchItem || null : null;
      const trustedWiden = context.historyWidened === true || context.__ruphusHistoryWidened === true;
      const evidence = await readCoffeeEvidence({ uid, coffeeId, launchItem, readers, windowDays: trustedWiden ? null : args.windowDays, now: args.now, timeoutMs: args.timeoutMs });
      const snapshotCoffee = snapshot.coffees?.find((coffee) => coffee.refKey === args.coffeeRef);
      const methodCorrected = /\b(?:actually|no[, ]|correction|instead|i (?:meant|brewed|used)|it was)\b[\s\S]*\b(?:aiden|v60|kalita|hot|iced)\b/i.test(context.userText || '');
      if (methodCorrected) context.__ruphusLaunchHintConsumed = true;
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
        focusChanged: Boolean(context.launchCoffeeId && context.launchCoffeeId !== args.coffeeRef),
      });
      if (launchItem) context.__ruphusLaunchHintConsumed = true;
      context.ledger = appendLedger(context.ledger, ledgerEntryFromEvidence(evidence, { coffee: evidence.coffee?.coffee }), { maxBytes: Math.min(context.__ruphusEvidenceByteCap || MAX_LEDGER_BYTES, MAX_LEDGER_BYTES) });
      const target = evidence.recipe?.records?.find((item) => item?.slotKey || item?.slot || item?.method);
      if (target && context.__ruphusResolvedTargets instanceof Map) {
        const rawSlot = target.slotKey || target.slot || target.method;
        const slotKey = SLOT_KEYS.includes(rawSlot) ? rawSlot : ['v60', 'kalita'].includes(rawSlot) ? `${rawSlot}_${target.mode === 'iced' ? 'iced' : 'hot'}` : rawSlot;
        context.__ruphusResolvedTargets.set(`${args.coffeeRef}:${slotKey}`, { coffeeRef: args.coffeeRef, coffeeId, slotKey, before: recipeValue(target), sourceHash: target.selectedHash || canonicalHash(recipeValue(target)) });
        if (context.proposalState && !context.proposalState.target) context.proposalState.target = { coffeeRef: args.coffeeRef, slot: slotKey };
      }
      return { ...publicEvidence(evidence), method, coffeeRef: args.coffeeRef };
    }
    const slotKey = args.slot || args.slotKey;
    if (name === 'read_recipe') {
      if (!SLOT_KEYS.includes(slotKey)) throw Object.assign(new Error('resolved recipe slot is required'), { code: 'slot_required' });
      const recipe = await readRecipe(coffeeId, slotKey);
      if (!recipe || recipe.code) return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, displayName: displaySlot(slotKey), summary: missingRecipeSummary(slotKey, snapshot.coffees?.find((coffee) => coffee.refKey === args.coffeeRef)?.recipes || []), recipe: null };
      if (context.__ruphusResolvedTargets instanceof Map) context.__ruphusResolvedTargets.set(`${args.coffeeRef}:${slotKey}`, { coffeeRef: args.coffeeRef, coffeeId, slotKey, before: recipeValue(recipe), sourceHash: recipe.selectedHash || canonicalHash(recipeValue(recipe)) });
      return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, displayName: displaySlot(slotKey), summary: `${displaySlot(slotKey)} recipe: ${recipe.dose ?? recipe.coffeeGrams ?? '?'}g coffee to ${recipe.water ?? recipe.waterGrams ?? '?'}g water.`, recipe: modelRecipe(recipe) };
    }
    if (!canPropose) throw Object.assign(new Error('proposal is not yet earned'), { code: 'proposal_timing' });
    if (!args.afterRecipe || typeof args.afterRecipe !== 'object' || Array.isArray(args.afterRecipe)) return { ok: false, code: 'invalid_proposal', message: 'A complete candidate recipe is required.' };
    if (!SLOT_KEYS.includes(slotKey)) throw Object.assign(new Error('resolved recipe slot is required'), { code: 'slot_required' });
    const target = context.__ruphusResolvedTargets instanceof Map ? context.__ruphusResolvedTargets.get(`${args.coffeeRef}:${slotKey}`) : null;
    if (!target || target.coffeeId !== coffeeId || target.coffeeRef !== args.coffeeRef) return { ok: false, code: 'proposal_target_required', message: 'Read the exact coffee and recipe before suggesting a change.' };
    if (context.proposalState?.target && (context.proposalState.target.coffeeRef !== args.coffeeRef || context.proposalState.target.slot !== slotKey)) return { ok: false, code: 'proposal_target_mismatch', message: 'That suggestion is bound to a different coffee and recipe.' };
    const recipe = await readRecipe(coffeeId, slotKey);
    if (!recipe || recipe.code) return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, summary: missingRecipeSummary(slotKey, snapshot.coffees?.find((coffee) => coffee.refKey === args.coffeeRef)?.recipes || []), recipe: null };
    const before = clone(target.before); const after = recipeValue(args.afterRecipe); const paths = changedPaths(before, after).filter(Boolean);
    if ((recipe.selectedHash || canonicalHash(recipeValue(recipe))) !== target.sourceHash) return { ok: false, code: 'proposal_target_stale', message: 'That recipe changed; read it again before suggesting a change.' };
    if (paths.length !== 1 || paths[0].startsWith('method') || paths[0].startsWith('device') || paths[0].startsWith('mode')) return { ok: false, code: 'one_change_required', message: 'A proposal must change exactly one supported control.' };
    const validationRecipe = recipe.sourceLineage ? { ...after, sourceLineage: clone(recipe.sourceLineage) } : after;
    const validation = validateExecutableRecipe(validationRecipe, slotKey);
    if (!validation.valid) return { ok: false, code: 'invalid_recipe', errors: validation.errors };
    const artifact = makeArtifact('recipe_proposal', { id: args.proposalId || `proposal-${canonicalHash({ uid, coffeeId, slotKey, after }).slice(0, 16)}`, status: 'proposed', coffeeId, slotKey, before: clone(before), after: clone(after), changedPaths: paths, actions: [], recipeHash: canonicalHash(after), sourceHash: recipe.selectedHash || context.evidenceHash });
    const proposal = typeof proposalStore === 'function' ? await proposalStore({ uid, coffeeId, slotKey, sessionId: context.sessionId || context.launchContext?.sessionId || context.context?.sessionId || 'agent-session', after: validationRecipe, proposalId: artifact.id }) : artifact;
    if (context.proposalState) context.proposalState.proposalIssued = true;
    return { ok: true, proposal: clone(proposal), artifact: clone({ ...artifact, ...(proposal?.sourceRevisionId ? { sourceRevisionId: proposal.sourceRevisionId } : {}) }) };
  };
  const definitions = RUPHUS_READ_TOOL_NAMES.map((name) => {
    if (name === 'resolve_coffee') return { type: 'function', name, description: 'Resolve a coffee reference such as a jar, name, roaster, origin, or pronoun.', strict: true, parameters: { type: 'object', properties: { reference: { type: 'string' } }, required: ['reference'], additionalProperties: false } };
    if (name === 'read_coffee_evidence') return { type: 'function', name, description: 'Read recipe, recent brews, and tastings for one resolved coffee in parallel.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, windowDays: nullable({ type: 'number' }) }, required: ['coffeeRef', 'windowDays'], additionalProperties: false } };
    if (name === 'read_recipe') return { type: 'function', name, description: 'Read one resolved recipe slot using coffee language.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string' } }, required: ['coffeeRef', 'slot'], additionalProperties: false } };
    return { type: 'function', name, description: 'Propose one bounded recipe-control change after the user agrees.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string' }, afterRecipe: { type: 'object', properties: STRICT_RECIPE_PROPERTIES, required: Object.keys(STRICT_RECIPE_PROPERTIES), additionalProperties: false } }, required: ['coffeeRef', 'slot', 'afterRecipe'], additionalProperties: false } };
  });
  return Object.freeze({ names: RUPHUS_READ_TOOL_NAMES, definitions, call });
}
