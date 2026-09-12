import { validateLaunchContext, LAUNCH_SURFACES, LAUNCH_ITEM_KINDS, RECIPE_SLOTS } from './conversationContract.js';
import { MANUAL_SOURCE_PROJECTION_VERSION, validateManualSourceProjection } from '../manualSourceProjection.js';

// Browser/server-neutral contracts for the Agent v3 boundary.  This module is
// intentionally free of Firebase, React, provider SDKs, and evaluator code.

export const RUPHUS_PROTOCOL_VERSION = 'ruphus-agent-v3';
export const RUPHUS_CONTRACT_VERSION = 1;
export const RECIPE_PREVIEW_PROTOCOL_VERSION = 1;
export const RECIPE_TECHNIQUE_EXPERIMENT_PROTOCOL_VERSION = 1;

export const LIFECYCLE_TYPES = Object.freeze([
  'turn_accepted', 'context_loading', 'text_delta', 'tool_started', 'tool_result',
  'artifact_ready', 'awaiting_approval', 'turn_completed', 'turn_interrupted',
  'turn_cancelled', 'turn_failed',
]);

export const ARTIFACT_TYPES = Object.freeze([
  'current_recipe', 'recipe_proposal', 'brew_comparison',
  'brew_history_chart', 'action_receipt', 'fellow_handoff_result',
  'undo_receipt', 'recipe_provenance',
]);

export const SLOT_KEYS = Object.freeze([
  'aiden', 'v60_hot', 'v60_iced', 'kalita_hot', 'kalita_iced',
]);

export const SUPPORTED_METHODS = Object.freeze(['aiden', 'v60', 'kalita']);

export const ACTION_STATES = Object.freeze([
  'checking', 'proposed', 'applying', 'applied', 'brewing', 'attempt_tasted',
  'promoted', 'prepared', 'stale', 'superseded', 'validation_rejected',
  'interrupted', 'failed', 'undone', 'unavailable',
]);

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = Infinity) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export function canonicalJson(value) {
  // Iterative canonicalization keeps hostile deep/circular evidence from
  // overflowing the JavaScript call stack while preserving the historical
  // sorted-key representation used for recipe identities.
  const output = [];
  const active = new WeakSet();
  const work = [{ kind: 'value', value }];
  while (work.length) {
    const item = work.pop();
    if (item.kind === 'text') { output.push(item.text); continue; }
    if (item.kind === 'leave') { active.delete(item.value); continue; }
    const current = item.value;
    if (current === undefined) { output.push('undefined'); continue; }
    if (current === null || typeof current !== 'object') { output.push(JSON.stringify(current)); continue; }
    if (active.has(current)) { output.push(JSON.stringify('[Circular]')); continue; }
    active.add(current);
    if (Array.isArray(current)) {
      output.push('[');
      work.push({ kind: 'leave', value: current });
      work.push({ kind: 'text', text: ']' });
      for (let index = current.length - 1; index >= 0; index -= 1) {
        work.push({ kind: 'value', value: current[index] });
        if (index > 0) work.push({ kind: 'text', text: ',' });
      }
      continue;
    }
    const keys = Object.keys(current).sort();
    output.push('{');
    work.push({ kind: 'leave', value: current });
    work.push({ kind: 'text', text: '}' });
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      work.push({ kind: 'value', value: current[key] });
      work.push({ kind: 'text', text: ':' });
      work.push({ kind: 'text', text: JSON.stringify(key) });
      if (index > 0) work.push({ kind: 'text', text: ',' });
    }
  }
  return output.join('');
}

// A deterministic, browser-safe digest. It is an identity/checksum, not a
// secret; callers must use a cryptographic primitive for authentication.
export function canonicalHash(value) {
  const input = canonicalJson(value);
  let first = 2166136261;
  let second = 16777619;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619) >>> 0;
    second = Math.imul(second ^ (code + index), 2246822519) >>> 0;
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

export function clone(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

// Recipe identity is the source lineage checksum, not a recipe value to be
// executed.  Dose preferences and Aiden grind projections are intentionally
// excluded because they are owner-controlled projections over the same saved
// source.  A missing slot has its own canonical identity so absence can be
// compared and made stale without fabricating a baseline recipe.
export function recipeSourceHash(recipe, slotKey = null) {
  if (recipe == null) return canonicalHash({ slotKey: slotKey || null, absent: true });
  const identity = clone(recipe);
  if (slotKey) {
    const method = slotKey === 'aiden' ? 'aiden' : slotKey.startsWith('kalita') ? 'kalita' : 'v60';
    identity.method = method;
    identity.device = method;
    identity.mode = slotKey.endsWith('iced') ? 'iced' : 'hot';
  }
  delete identity.userCoffeeGrams;
  delete identity.aidenGrind;
  delete identity.recipeHash;
  return canonicalHash(identity);
}

export function validateContextRef(value) {
  return validateLaunchContext(value);
}

export { validateLaunchContext, LAUNCH_SURFACES, LAUNCH_ITEM_KINDS, RECIPE_SLOTS };

export function isManualSourceRecipe(value) {
  return object(value) && object(value.sourceProjection)
    && value.sourceProjection.projectionVersion === MANUAL_SOURCE_PROJECTION_VERSION;
}

export function hasManualSourceProjection(value) {
  return object(value) && object(value.sourceProjection);
}

function sourceWaterFromExecution(execution) {
  const water = execution?.water || {};
  if (water.brewGrams != null) return { value: water.brewGrams, unit: 'g' };
  if (water.brewMilliliters != null) return { value: water.brewMilliliters, unit: 'mL' };
  return null;
}

function sourceRecipeSize(value, projection) {
  const equipment = projection?.equipment || {};
  if (equipment.brewer === 'kalita') return value.kalitaSize ?? value.size ?? null;
  return value.v60Size ?? value.size ?? null;
}

/**
 * Validate the versioned source envelope before the legacy recipe contract.
 * The nested projection remains the only source of native units and timing;
 * mass aliases are deliberately not accepted for a volume-native source.
 */
export function validateManualSourceRecipeSnapshot(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['source recipe must be an object'] };
  const projection = value.sourceProjection;
  const projectionResult = validateManualSourceProjection(projection);
  if (!projectionResult.valid) errors.push(...projectionResult.errors.map((error) => `source-projection:${error}`));
  if (projection?.projectionVersion !== MANUAL_SOURCE_PROJECTION_VERSION) errors.push('source-projection-version-required');
  const equipment = projection?.equipment || {};
  const expectedDevice = equipment.brewer === 'kalita' ? 'kalita' : 'v60';
  if (value.method !== expectedDevice || value.device !== expectedDevice) errors.push('source-device-mismatch');
  if (value.mode !== projection?.mode) errors.push('source-mode-mismatch');
  const expectedVariant = equipment.brewer === 'switch' ? 'switch' : equipment.brewer === 'v60' ? 'classic' : 'wave';
  if (value.variant !== expectedVariant) errors.push('source-variant-mismatch');
  const expectedSize = projection?.sourceConfiguration?.size ?? equipment.size;
  const declaredSize = sourceRecipeSize(value, projection);
  if (expectedSize && expectedSize !== 'any' && String(declaredSize) !== String(expectedSize)) errors.push('source-size-mismatch');
  if (value.sourceId !== projection?.sourceId || Number(value.sourceRevision) !== Number(projection?.sourceRevision)) errors.push('source-lineage-mismatch');
  if (value.coffeeGrams !== projection?.coffeeGrams || !Number.isFinite(value.coffeeGrams) || value.coffeeGrams <= 0) errors.push('source-dose-mismatch');
  const expectedWater = sourceWaterFromExecution(projection?.sourceExecution);
  if (!expectedWater || canonicalJson(projection?.water) !== canonicalJson(expectedWater)) errors.push('source-water-projection-mismatch');
  if (!['g', 'mL'].includes(projection?.water?.unit) || !Number.isFinite(projection?.water?.value) || projection.water.value <= 0) errors.push('source-water-unit-invalid');
  if (projection?.water?.unit === 'mL') {
    if (own(value, 'waterGrams') || own(value, 'water') || own(value, 'ratio') || own(value, 'finalBeverageRatio') || own(value, 'hotExtractionRatio')) errors.push('volume-source-mass-alias');
    if (!Number.isFinite(value.waterMilliliters) || value.waterMilliliters !== projection.water.value) errors.push('source-volume-mismatch');
  } else {
    if (own(value, 'waterMilliliters')) errors.push('mass-source-volume-alias');
    if (!Number.isFinite(value.waterGrams) || value.waterGrams !== projection.water.value) errors.push('source-mass-mismatch');
  }
  if (value.sourceNativeWaterUnit != null && value.sourceNativeWaterUnit !== projection.water?.unit) errors.push('source-native-unit-mismatch');
  if (value.timerReady !== projection?.timerReady || value.timerReady !== true) errors.push('source-not-timer-ready');
  const sourceIds = projection?.sourceLineage?.sourceId ? [projection.sourceLineage.sourceId] : [];
  if (JSON.stringify(value.sourceLineage?.sourceIds || []) !== JSON.stringify(sourceIds)) errors.push('source-lineage-ids-mismatch');
  if (value.sourceLineage?.sourceRevision !== projection?.sourceRevision) errors.push('source-lineage-revision-mismatch');
  if (!Array.isArray(value.stages) || canonicalJson(value.stages) !== canonicalJson(projection?.stages)) errors.push('source-stages-mismatch');
  if (value.sourceFormatVersion != null && value.sourceFormatVersion !== projection?.projectionVersion) errors.push('source-format-version-mismatch');
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export function validateRecipeSnapshot(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['recipe must be an object'] };
  if (object(value.sourceProjection)) return validateManualSourceRecipeSnapshot(value);
  if (!text(value.method, 80) || !SUPPORTED_METHODS.includes(value.method)) errors.push('unsupported recipe method');
  if (!text(value.device, 80)) errors.push('recipe device is required');
  if (!['hot', 'iced'].includes(value.mode)) errors.push('recipe mode must be hot or iced');
  if (value.method !== 'aiden' && !Number.isFinite(value.coffeeGrams) && !Number.isFinite(value.dose)) errors.push('recipe dose is required');
  if (value.method !== 'aiden' && !Number.isFinite(value.waterGrams) && !Number.isFinite(value.water)) errors.push('recipe water is required');
  if (value.steps != null && (!Array.isArray(value.steps) || value.steps.length > 40)) errors.push('invalid recipe steps');
  if (Array.isArray(value.steps)) value.steps.forEach((step, index) => {
    if (!object(step) || !Number.isFinite(step.timeSeconds) || !Number.isFinite(step.waterTotal)) errors.push(`invalid step ${index}`);
  });
  return { valid: errors.length === 0, errors };
}

export function validateProposal(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['proposal must be an object'] };
  for (const key of ['id', 'coffeeId', 'slotKey', 'sessionId', 'sourceHash', 'recipeHash']) if (!text(value[key], 180)) errors.push(`${key} is required`);
  if (value.slotKey && !SLOT_KEYS.includes(value.slotKey)) errors.push('unsupported slotKey');
  const sourceState = value.sourceState || 'present';
  if (!['present', 'absent'].includes(sourceState)) errors.push('invalid sourceState');
  if (sourceState === 'absent') {
    if (value.before !== null) errors.push('absent source requires before:null');
    if (value.sourceRevisionId != null) errors.push('absent source cannot have a source revision');
    if (value.slotKey && value.sourceHash !== recipeSourceHash(null, value.slotKey)) errors.push('absent source hash mismatch');
  } else {
    const result = validateRecipeSnapshot(value.before);
    if (!result.valid) errors.push(`before: ${result.errors.join(', ')}`);
  }
  const after = validateRecipeSnapshot(value.after);
  if (!after.valid) errors.push(`after: ${after.errors.join(', ')}`);
  if (!['proposed', 'applied', 'kept', 'attempt_created', 'stale', 'superseded', 'archived', 'unavailable'].includes(value.status)) errors.push('invalid proposal status');
  if (Object.keys(value).some((key) => key.startsWith('action') || key === 'receipt')) errors.push('proposal cannot contain authority fields');
  return { valid: errors.length === 0, errors };
}

export function validateArtifact(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['artifact must be an object'] };
  if (!text(value.id, 180) || !text(value.type, 80)) errors.push('artifact id and type are required');
  if (value.type && !ARTIFACT_TYPES.includes(value.type)) errors.push('unregistered artifact type');
  if (value.status != null && !ACTION_STATES.includes(value.status) && !['ready', 'choice'].includes(value.status)) errors.push('invalid artifact status');
  if (value.actions != null && (!Array.isArray(value.actions) || value.actions.some((action) => !text(action, 80))) ) errors.push('invalid artifact actions');
  for (const key of ['receipt', 'fellow_handoff_result', 'undo_receipt']) if (own(value, key)) errors.push(`${key} is authority-only`);
  return { valid: errors.length === 0, errors };
}

export function validateLifecycleFrame(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['frame must be an object'] };
  if (value.version !== RUPHUS_CONTRACT_VERSION) errors.push('unsupported protocol version');
  if (!text(value.turnId, 180) || !text(value.type, 80)) errors.push('turnId and type are required');
  if (value.type && !LIFECYCLE_TYPES.includes(value.type)) errors.push('unknown lifecycle frame');
  if (value.type === 'text_delta' && typeof value.text !== 'string') errors.push('text_delta requires text');
  if (value.type === 'artifact_ready') {
    const artifact = validateArtifact(value.artifact);
    if (!artifact.valid) errors.push(...artifact.errors);
  }
  return { valid: errors.length === 0, errors };
}

export function createLifecycleFrame(type, turnId, fields = {}) {
  const frame = { version: RUPHUS_CONTRACT_VERSION, protocol: RUPHUS_PROTOCOL_VERSION, type, turnId, ...clone(fields) };
  const result = validateLifecycleFrame(frame);
  if (!result.valid) throw new Error(`Invalid lifecycle frame: ${result.errors.join('; ')}`);
  return Object.freeze(frame);
}

export function validateCommandRequest(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['command must be an object'] };
  if (!text(value.actionId, 180) || !text(value.mode, 80) || !text(value.coffeeId, 180)) errors.push('actionId, mode, and coffeeId are required');
  if (value.mode && !['replace_active_recipe', 'apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'timer_started', 'complete_attempt', 'prepare_attempt', 'promote_attempt', 'set_dose', 'set_aiden_grind', 'set_aiden_link', 'undo_revision'].includes(value.mode)) errors.push('unsupported command mode');
  if (own(value, 'uid') || own(value, 'ownerId')) errors.push('owner identity is server-bound');
  return { valid: errors.length === 0, errors };
}

// Preview preparation is deliberately distinct from command authority. A
// request identifies an owner-scoped recipe slot and target configuration; it
// never carries a client-selected recipe snapshot or owner identity.
export function validateRecipePreviewRequest(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['preview request must be an object'] };
  for (const key of ['requestId', 'proposalId', 'coffeeId', 'slotKey', 'sessionId']) if (!text(value[key], 180)) errors.push(`${key} is required`);
  if (value.slotKey && !SLOT_KEYS.includes(value.slotKey)) errors.push('unsupported slotKey');
  if (!Number.isFinite(value.dose) || value.dose <= 0) errors.push('dose must be positive');
  if (own(value, 'sourceId') && !text(value.sourceId, 180)) errors.push('sourceId must be a non-empty string');
  if (own(value, 'sourceRevision') && (!Number.isInteger(value.sourceRevision) || value.sourceRevision < 1)) errors.push('sourceRevision must be a positive integer');
  if (own(value, 'sourceConfiguration') && !object(value.sourceConfiguration)) errors.push('sourceConfiguration must be an object');
  if (own(value, 'ratio') || own(value, 'targetRatio')) errors.push('ratio is immutable in the source proposal');
  if (own(value, 'intent')) errors.push('intent is immutable in the source proposal');
  if (value.configuration != null && !object(value.configuration)) errors.push('configuration must be an object');
  for (const key of ['uid', 'ownerId', 'userId', 'recipe', 'after', 'snapshot', 'sourceProjection']) if (own(value, key)) errors.push(`${key} is server-bound`);
  return { valid: errors.length === 0, errors };
}

export function validateReceipt(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['receipt must be an object'] };
  if (!text(value.id, 180) || !text(value.kind, 80) || !text(value.status, 40)) errors.push('receipt identity/status required');
  if (value.claims != null && (!Array.isArray(value.claims) || value.claims.some((claim) => !text(claim, 300)))) errors.push('invalid receipt claims');
  return { valid: errors.length === 0, errors };
}
