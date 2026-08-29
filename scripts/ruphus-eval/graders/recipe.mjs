import { validateAidenProfile, toAidenProfile } from '../../../src/lib/aidenProfileValidation.js';
import { validateV60Candidate } from '../../../src/lib/v60Adapter.js';
import { validateKalitaCandidate } from '../../../src/lib/kalitaAdapter.js';
import { validateV60SwitchCandidate } from '../../../src/lib/v60SwitchAdapter.js';
import { validateV60IcedCandidate } from '../../../src/lib/v60IcedAdapter.js';
import { validateKalitaIcedCandidate } from '../../../src/lib/kalitaIcedAdapter.js';
import { generateV60Recipe, generateV60Fallback } from '../../../src/lib/v60Adapter.js';
import { generateKalitaRecipe } from '../../../src/lib/kalitaAdapter.js';
import { generateV60SwitchRecipe, generateV60SwitchFallback } from '../../../src/lib/v60SwitchAdapter.js';
import { generateV60IcedRecipe, generateV60IcedFallback } from '../../../src/lib/v60IcedAdapter.js';
import { generateKalitaIcedRecipe, generateKalitaIcedFallback } from '../../../src/lib/kalitaIcedAdapter.js';
import { normalizeRecipePhases, buildTimerSteps } from '../../../src/lib/brewTimerSteps.js';

const VALIDATORS = Object.freeze({
  aiden: validateAidenProfile,
  v60: validateV60Candidate,
  kalita: validateKalitaCandidate,
  'v60-switch': validateV60SwitchCandidate,
  'v60-iced': validateV60IcedCandidate,
  'kalita-iced': validateKalitaIcedCandidate,
});

const RESERVED_AUTHORITY_FIELDS = new Set([
  'receipt', 'claims', 'fellowreceipt', 'physicalbrewconfirmed', 'machinereceived', 'machinereceipt',
  'physicalsuccess', 'physicalbrewsuccess', 'brewconfirmed', 'fellowsuccess', 'approval', 'approvalgranted',
  'approved', 'commitreceipt', 'providerreceipt', 'shareconfirmed',
]);

const MANUAL_GENERATORS = Object.freeze({
  v60: () => [generateV60Recipe({}, { dose: 15 }), generateV60Recipe({}, { dose: 25 }), generateV60Recipe({}, { dose: 15, grinder: 'custom' }), generateV60Fallback({ dose: 15 })],
  kalita: () => [generateKalitaRecipe({}, { dose: 15, size: '155' }), generateKalitaRecipe({}, { dose: 20, size: '185' }), generateKalitaRecipe({}, { dose: 15, size: '155', grinder: 'custom' })],
  'v60-switch': () => [generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' }), generateV60SwitchRecipe({}, { dose: 20, roast: 'light', closedBloomSeconds: 15 }), generateV60SwitchRecipe({}, { dose: 20, grinder: 'custom' }), generateV60SwitchFallback({ dose: 20 })],
  'v60-iced': () => [generateV60IcedRecipe({}, { dose: 15 }), generateV60IcedRecipe({}, { dose: 20 }), generateV60IcedRecipe({}, { dose: 15, grinder: 'custom' }), generateV60IcedFallback({ dose: 15 })],
  'kalita-iced': () => [generateKalitaIcedRecipe({}, { dose: 15, size: '155' }), generateKalitaIcedRecipe({}, { dose: 15, size: '155', chillingMethod: 'brew-over-ice' }), generateKalitaIcedRecipe({}, { dose: 20, size: '185' }), generateKalitaIcedRecipe({}, { dose: 20, size: '185', chillingMethod: 'chill-after', grinder: 'custom' }), generateKalitaIcedFallback({ dose: 15, size: '155' })],
});

function primitiveShape() { return { kind: 'primitive' }; }

function shapeFor(value) {
  if (Array.isArray(value)) return { kind: 'array', item: value.length ? shapeFor(value[0]) : null };
  if (value && typeof value === 'object') {
    const fields = new Map();
    for (const [key, child] of Object.entries(value)) fields.set(key, shapeFor(child));
    return { kind: 'object', fields };
  }
  return primitiveShape();
}

function mergeShapes(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (left.kind === 'object' && right.kind === 'object') {
    const fields = new Map(left.fields);
    for (const [key, child] of right.fields) fields.set(key, mergeShapes(fields.get(key), child));
    return { kind: 'object', fields };
  }
  if (left.kind === 'array' && right.kind === 'array') return { kind: 'array', item: mergeShapes(left.item, right.item) };
  if (left.kind === 'primitive' && right.kind === 'primitive') return primitiveShape();
  return primitiveShape();
}

const MANUAL_SHAPES = new Map();
function manualShape(method) {
  if (MANUAL_SHAPES.has(method)) return MANUAL_SHAPES.get(method);
  const generator = MANUAL_GENERATORS[method];
  if (!generator) return null;
  let shape = null;
  for (const variant of generator()) shape = mergeShapes(shape, shapeFor(normalizeRecipePhases(variant)));
  MANUAL_SHAPES.set(method, shape);
  return shape;
}

function assertNoReservedAuthority(value, path = 'recipe', seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) throw new Error(`cyclic recipe at ${path}`);
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (RESERVED_AUTHORITY_FIELDS.has(key.toLowerCase())) throw new Error(`reserved-authority:${path}.${key}`);
    assertNoReservedAuthority(child, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

function projectByShape(value, shape, path = 'recipe') {
  if (!shape) throw new Error(`unknown production shape at ${path}`);
  if (value === null) return null;
  if (shape.kind === 'primitive') {
    return value;
  }
  if (shape.kind === 'array') {
    if (!Array.isArray(value) || (value.length > 0 && !shape.item)) throw new Error(`invalid production array at ${path}`);
    return value.map((item, index) => projectByShape(item, shape.item, `${path}[${index}]`));
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid production object at ${path}`);
  const projected = {};
  for (const [key, child] of Object.entries(value)) {
    if (!shape.fields.has(key)) continue;
    projected[key] = projectByShape(child, shape.fields.get(key), `${path}.${key}`);
  }
  return projected;
}

// Hard-gated methods use the same production validators as the runtime. Legacy
// methods without canonical validators remain advisory-only and cannot satisfy
// committed-validity gates.
export const RECIPE_COVERAGE = Object.freeze({
  aiden: Object.freeze({ gate: 'hard', validator: 'validateAidenProfile', runtime: 'fellow-profile-payload' }),
  v60: Object.freeze({ gate: 'hard', validator: 'validateV60Candidate', runtime: 'v60-timer-projection' }),
  kalita: Object.freeze({ gate: 'hard', validator: 'validateKalitaCandidate', runtime: 'kalita-timer-projection' }),
  'v60-switch': Object.freeze({ gate: 'hard', validator: 'validateV60SwitchCandidate', runtime: 'switch-timer-projection' }),
  'v60-iced': Object.freeze({ gate: 'hard', validator: 'validateV60IcedCandidate', runtime: 'v60-iced-timer-projection' }),
  'kalita-iced': Object.freeze({ gate: 'hard', validator: 'validateKalitaIcedCandidate', runtime: 'kalita-iced-timer-projection' }),
  chemex: Object.freeze({ gate: 'advisory', validator: null, runtime: null }),
  aeropress: Object.freeze({ gate: 'advisory', validator: null, runtime: null }),
  'french-press': Object.freeze({ gate: 'advisory', validator: null, runtime: null }),
});

function missingLayer() { return { present: false, valid: false, errors: ['missing-layer'] }; }

function projectManualRuntime(method, recipe) {
  try {
    assertNoReservedAuthority(recipe);
    const normalized = normalizeRecipePhases(recipe);
    if (!normalized) return { valid: false, errors: ['downstream-timer-not-ready'], runtime: null };
    return { valid: true, errors: [], runtime: projectByShape(normalized, manualShape(method)) };
  } catch (error) {
    return { valid: false, errors: [error.message], runtime: null };
  }
}

export function validateRecipe(method, recipe) {
  const validator = VALIDATORS[method];
  if (!validator) return { present: recipe != null, valid: false, errors: [`${method} is advisory-only or unsupported`] };
  if (recipe == null) return missingLayer();
  try {
    const result = validator(recipe);
    return { present: true, parseable: typeof recipe === 'object' && !Array.isArray(recipe), valid: result.valid === true, errors: [...(result.errors || [])] };
  } catch (error) {
    return { present: true, parseable: false, valid: false, errors: [`validator-threw:${error.message}`] };
  }
}

/**
 * The production runtime/timer projection is the canonical downstream
 * identity. Returning it only after the production validator passes prevents
 * the evaluator from rebuilding a weaker parallel recipe representation.
 */
export function projectCanonicalRuntime(method, recipe) {
  try {
    assertNoReservedAuthority(recipe);
  } catch (error) {
    return { valid: false, errors: [error.message], runtime: null, timerReady: false, projection: RECIPE_COVERAGE[method]?.runtime || null };
  }
  const validation = validateRecipe(method, recipe);
  if (!validation.valid) return { valid: false, errors: validation.errors, runtime: null };
  if (method === 'aiden') {
    const runtime = toAidenProfile(recipe);
    const runtimeValidation = validateRecipe(method, runtime);
    return runtimeValidation.valid
      ? { valid: true, errors: [], runtime, timerReady: null, projection: RECIPE_COVERAGE[method]?.runtime || null }
      : { valid: false, errors: runtimeValidation.errors, runtime: null, timerReady: null, projection: RECIPE_COVERAGE[method]?.runtime || null };
  }
  const runtime = normalizeRecipePhases(recipe);
  const timerSteps = buildTimerSteps(recipe);
  const manualProjection = projectManualRuntime(method, recipe);
  if (!manualProjection.valid || !runtime?.timerReady || !timerSteps?.length) return { valid: false, errors: manualProjection.errors.length ? manualProjection.errors : ['downstream-timer-not-ready'], runtime: null, timerReady: false, projection: RECIPE_COVERAGE[method]?.runtime || null };
  return { valid: true, errors: [], runtime: manualProjection.runtime, timerSteps, timerReady: true, projection: RECIPE_COVERAGE[method]?.runtime || null };
}

function canonicalJson(value) {
  try {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  } catch { return null; }
}

export function compareGrindMicrons({ before, after, direction } = {}) {
  const beforeMicrons = typeof before === 'number' ? before : before?.microns;
  const afterMicrons = typeof after === 'number' ? after : after?.microns;
  const valid = Number.isFinite(beforeMicrons) && Number.isFinite(afterMicrons);
  if (!valid || !['finer', 'coarser', 'unchanged'].includes(direction)) return { valid: false, correct: false, deltaMicrons: null, errors: ['invalid-grind-comparison'] };
  const deltaMicrons = afterMicrons - beforeMicrons;
  const correct = direction === 'finer' ? deltaMicrons < 0 : direction === 'coarser' ? deltaMicrons > 0 : deltaMicrons === 0;
  return { valid: true, correct, deltaMicrons, errors: correct ? [] : ['wrong-grind-micron-direction'] };
}

/** Grade every evidence layer while keeping repair visible and downstream validity authoritative. */
export function gradeRecipeLayers({ method, raw, parsed, repaired, downstream = null, repair = null, grind = null } = {}) {
  const layers = {
    raw: validateRecipe(method, raw),
    parsed: validateRecipe(method, parsed),
    postRepair: validateRecipe(method, repaired),
    downstream: validateRecipe(method, downstream),
  };
  const projection = projectCanonicalRuntime(method, downstream);
  const repairedProjection = projectCanonicalRuntime(method, repaired);
  const repairApplied = canonicalJson(parsed) !== canonicalJson(repaired);
  const repairMetadataConsistent = repair == null || !Object.prototype.hasOwnProperty.call(repair, 'applied')
    || (typeof repair.applied === 'boolean' && repair.applied === repairApplied);
  const coverage = RECIPE_COVERAGE[method] || { gate: 'advisory' };
  const downstreamMatchesRepair = repairedProjection.valid && projection.valid
    && canonicalJson(repairedProjection.runtime) === canonicalJson(projection.runtime);
  const grindResult = grind == null ? null : compareGrindMicrons(grind);
  const grindPasses = grindResult == null || (grindResult.valid === true && grindResult.correct === true);
  const hardGate = coverage.gate === 'hard' && layers.raw.present && layers.postRepair.valid && layers.parsed.present && layers.parsed.parseable !== false
    && layers.downstream.valid && projection.valid && downstreamMatchesRepair && grindPasses;
  return {
    method, coverage: coverage.gate, layers, repairApplied, repairMetadataConsistent, repair,
    grind: grindResult, runtime: projection.runtime, timerReady: projection.timerReady ?? null,
    hardGate: hardGate && repairMetadataConsistent, valid: hardGate && repairMetadataConsistent,
  };
}
