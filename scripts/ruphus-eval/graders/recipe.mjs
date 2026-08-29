import { validateAidenProfile, toAidenProfile } from '../../../src/lib/aidenProfileValidation.js';
import { validateV60Candidate } from '../../../src/lib/v60Adapter.js';
import { validateKalitaCandidate } from '../../../src/lib/kalitaAdapter.js';
import { validateV60SwitchCandidate } from '../../../src/lib/v60SwitchAdapter.js';
import { validateV60IcedCandidate } from '../../../src/lib/v60IcedAdapter.js';
import { validateKalitaIcedCandidate } from '../../../src/lib/kalitaIcedAdapter.js';
import { normalizeRecipePhases, buildTimerSteps } from '../../../src/lib/brewTimerSteps.js';

const VALIDATORS = Object.freeze({
  aiden: validateAidenProfile,
  v60: validateV60Candidate,
  kalita: validateKalitaCandidate,
  'v60-switch': validateV60SwitchCandidate,
  'v60-iced': validateV60IcedCandidate,
  'kalita-iced': validateKalitaIcedCandidate,
});

const MANUAL_RUNTIME_FIELDS = Object.freeze([
  'method', 'device', 'mode', 'isIced', 'v60Size', 'kalitaSize', 'configurationKey', 'doseProfile',
  'engineVersion', 'rulesVersion', 'sourceRegistryVersion', 'sourceLineage', 'candidate', 'fallback', 'generationStatus',
  'doseTimingPolicy', 'coffeeGrams', 'waterGrams', 'ratio', 'waterTemp', 'grindSize', 'technique', 'techniqueLabel',
  'techniqueInstruction', 'drawdownTarget', 'prepSteps', 'steps', 'postBrewSteps', 'phaseContractVersion',
  'phaseContractStatus', 'totalBrewTime', 'totalBrewTimeSeconds', 'guideTargetSeconds', 'guideRangeSeconds', 'timerReady',
  'timingProfile', 'reasonCodes', 'reasoning', 'tips', 'title', 'confidence', 'evidenceHash',
]);
const RESERVED_CLAIM_FIELDS = Object.freeze(['physicalBrewConfirmed', 'fellowReceipt', 'receipt', 'claims']);

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

function projectManualRuntime(recipe) {
  const forbidden = RESERVED_CLAIM_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(recipe, field));
  if (forbidden.length) return { valid: false, errors: forbidden.map((field) => `reserved-claim:${field}`), runtime: null };
  const normalized = normalizeRecipePhases(recipe);
  if (!normalized) return { valid: false, errors: ['downstream-timer-not-ready'], runtime: null };
  const runtime = Object.fromEntries(MANUAL_RUNTIME_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(normalized, field))
    .map((field) => [field, normalized[field]]));
  return { valid: true, errors: [], runtime };
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
  const manualProjection = projectManualRuntime(recipe);
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
