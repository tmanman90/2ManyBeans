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
function recipeValue(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return recipe;
  const value = clone(recipe); for (const key of ['selectedPath', 'selectedHash', 'sourceLineage']) delete value[key];
  const stack = [value]; while (stack.length) { const current = stack.pop(); if (!current || typeof current !== 'object') continue; for (const key of Object.keys(current)) { if (current[key] === null) delete current[key]; else if (typeof current[key] === 'object') stack.push(current[key]); } }
  return value;
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
        context.__ruphusResolvedTargets.set(`${args.coffeeRef}:${slotKey}`, { coffeeRef: args.coffeeRef, coffeeId, slotKey, before: modelRecipe(target), sourceHash: target.selectedHash || canonicalHash(recipeValue(target)) });
        if (context.proposalState && !context.proposalState.target) context.proposalState.target = { coffeeRef: args.coffeeRef, slot: slotKey };
      }
      return { ...publicEvidence(evidence), method, coffeeRef: args.coffeeRef };
    }
    const slotKey = args.slot || args.slotKey;
    if (name === 'read_recipe') {
      if (!SLOT_KEYS.includes(slotKey)) throw Object.assign(new Error('resolved recipe slot is required'), { code: 'slot_required' });
      const recipe = await readRecipe(coffeeId, slotKey, args.coffeeRef);
      if (!recipe || recipe.code) return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, displayName: displaySlot(slotKey), summary: missingRecipeSummary(slotKey, snapshot.coffees?.find((coffee) => coffee.refKey === args.coffeeRef)?.recipes || []), recipe: null };
      if (context.__ruphusResolvedTargets instanceof Map) context.__ruphusResolvedTargets.set(`${args.coffeeRef}:${slotKey}`, { coffeeRef: args.coffeeRef, coffeeId, slotKey, before: modelRecipe(recipe), sourceHash: recipe.selectedHash || canonicalHash(recipeValue(recipe)) });
      if (context.proposalState && !context.proposalState.target) context.proposalState.target = { coffeeRef: args.coffeeRef, slot: slotKey };
      return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, displayName: displaySlot(slotKey), summary: `${displaySlot(slotKey)} recipe: ${recipe.dose ?? recipe.coffeeGrams ?? '?'}g coffee to ${recipe.water ?? recipe.waterGrams ?? '?'}g water.`, recipe: modelRecipe(recipe) };
    }
    if (!canPropose) throw Object.assign(new Error('proposal is not yet earned'), { code: 'proposal_timing' });
    if (!SLOT_KEYS.includes(slotKey)) throw Object.assign(new Error('resolved recipe slot is required'), { code: 'slot_required' });
    const target = context.__ruphusResolvedTargets instanceof Map ? context.__ruphusResolvedTargets.get(`${args.coffeeRef}:${slotKey}`) : null;
    if (!target || target.coffeeId !== coffeeId || target.coffeeRef !== args.coffeeRef) return { ok: false, code: 'proposal_target_required', message: 'Read the exact coffee and recipe before suggesting a change.' };
    const requestedPatch = args.change ? patchForChange(target.before || {}, args.change) : args.afterRecipe;
    if (!requestedPatch || typeof requestedPatch !== 'object' || Array.isArray(requestedPatch)) return { ok: false, code: 'invalid_proposal', message: 'Choose one recipe control and a concrete value.' };
    if (context.proposalState?.target && (context.proposalState.target.coffeeRef !== args.coffeeRef || context.proposalState.target.slot !== slotKey)) return { ok: false, code: 'proposal_target_mismatch', message: 'That suggestion is bound to a different coffee and recipe.' };
    const recipe = await readRecipe(coffeeId, slotKey, args.coffeeRef);
    if (!recipe || recipe.code) return { ok: true, coffeeRef: args.coffeeRef, slot: slotKey, summary: missingRecipeSummary(slotKey, snapshot.coffees?.find((coffee) => coffee.refKey === args.coffeeRef)?.recipes || []), recipe: null };
    const before = clone(target.before); const after = mergeRecipePatch(before, requestedPatch); const paths = changedPaths(before, after).filter(Boolean);
    const controls = args.change ? [args.change.control] : [...new Set(paths.map(recipeControl))];
    if ((recipe.selectedHash || canonicalHash(recipeValue(recipe))) !== target.sourceHash) return { ok: false, code: 'proposal_target_stale', message: 'That recipe changed; read it again before suggesting a change.' };
    if (controls.length !== 1 || ['method', 'device', 'mode'].includes(controls[0])) return { ok: false, code: 'one_change_required', message: 'A proposal must change exactly one supported control.' };
    const validationRecipe = recipe.sourceLineage ? { ...after, sourceLineage: clone(recipe.sourceLineage) } : after;
    const validation = validateExecutableRecipe(validationRecipe, slotKey);
    if (!validation.valid) return { ok: false, code: 'invalid_recipe', errors: validation.errors };
    const artifact = makeArtifact('recipe_proposal', { id: args.proposalId || `proposal-${canonicalHash({ uid, coffeeId, slotKey, after, sessionId: context.sessionId || 'agent-session' }).slice(0, 16)}`, status: 'proposed', coffeeId, slotKey, before: clone(before), after: clone(after), changedPaths: paths, actions: [], recipeHash: canonicalHash(after), sourceHash: recipe.selectedHash || context.evidenceHash });
    const proposal = typeof proposalStore === 'function' ? await proposalStore({ uid, coffeeId, slotKey, sessionId: context.sessionId || context.launchContext?.sessionId || context.context?.sessionId || 'agent-session', after: validationRecipe, proposalId: artifact.id }) : artifact;
    if (context.proposalState) context.proposalState.proposalIssued = true;
    return { ok: true, proposal: clone(proposal), artifact: clone({ ...artifact, ...(proposal?.sourceRevisionId ? { sourceRevisionId: proposal.sourceRevisionId } : {}) }) };
  };
  const definitions = RUPHUS_READ_TOOL_NAMES.map((name) => {
    if (name === 'resolve_coffee') return { type: 'function', name, description: 'Resolve a coffee reference such as a jar, name, roaster, origin, or pronoun. Call once for a reference, then keep the returned coffeeRef for later tools in this turn.', strict: true, parameters: { type: 'object', properties: { reference: { type: 'string' } }, required: ['reference'], additionalProperties: false } };
    if (name === 'read_coffee_evidence') return { type: 'function', name, description: 'Read recipe, recent brews, and tastings for one resolved coffee in parallel.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, windowDays: nullable({ type: 'number' }) }, required: ['coffeeRef', 'windowDays'], additionalProperties: false } };
    if (name === 'read_recipe') return { type: 'function', name, description: 'After explicit user agreement, read one exact recipe slot once immediately before a proposal. Do not use this during diagnosis because read_coffee_evidence already includes the recipe.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string', enum: SLOT_KEYS } }, required: ['coffeeRef', 'slot'], additionalProperties: false } };
    return { type: 'function', name, description: 'Propose one bounded recipe-control change after the user agrees. Choose exactly one control and give its concrete new value.', strict: true, parameters: { type: 'object', properties: { coffeeRef: { type: 'string' }, slot: { type: 'string', enum: SLOT_KEYS }, change: { type: 'object', properties: { control: { type: 'string', enum: PROPOSAL_CONTROLS }, value: { anyOf: [{ type: 'number' }, { type: 'string' }] } }, required: ['control', 'value'], additionalProperties: false } }, required: ['coffeeRef', 'slot', 'change'], additionalProperties: false } };
  });
  return Object.freeze({ names: RUPHUS_READ_TOOL_NAMES, definitions, call });
}
