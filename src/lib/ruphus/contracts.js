// Browser/server-neutral contracts for the Agent v3 boundary.  This module is
// intentionally free of Firebase, React, provider SDKs, and evaluator code.

export const RUPHUS_PROTOCOL_VERSION = 'ruphus-agent-v3';
export const RUPHUS_CONTRACT_VERSION = 1;
export const MAX_TOOL_CALLS = 4;

export const LIFECYCLE_TYPES = Object.freeze([
  'turn_accepted', 'context_loading', 'text_delta', 'tool_started', 'tool_result',
  'artifact_ready', 'awaiting_approval', 'turn_completed', 'turn_interrupted',
  'turn_cancelled', 'turn_failed',
]);

export const ARTIFACT_TYPES = Object.freeze([
  'coffee_context', 'current_recipe', 'recipe_proposal', 'brew_comparison',
  'brew_history_chart', 'data_gap',
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

export function validateContextRef(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['context must be an object'] };
  if (!text(value.coffeeId, 160)) errors.push('coffeeId is required');
  for (const key of ['method', 'slotKey']) if (!text(value[key], 80)) errors.push(`${key} is required`);
  if (value.slotKey && !SLOT_KEYS.includes(value.slotKey)) errors.push('unsupported slotKey');
  if (value.attemptId != null && !text(value.attemptId, 160)) errors.push('invalid attemptId');
  if (value.tastingId != null && !text(value.tastingId, 160)) errors.push('invalid tastingId');
  return { valid: errors.length === 0, errors };
}

export function validateRecipeSnapshot(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['recipe must be an object'] };
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
  for (const key of ['before', 'after']) {
    const result = validateRecipeSnapshot(value[key]);
    if (!result.valid) errors.push(`${key}: ${result.errors.join(', ')}`);
  }
  if (!['proposed', 'applied', 'kept', 'stale', 'superseded', 'archived', 'unavailable'].includes(value.status)) errors.push('invalid proposal status');
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
  if (value.mode && !['replace_active_recipe', 'apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'prepare_attempt', 'promote_attempt', 'set_dose', 'set_aiden_grind', 'undo_revision'].includes(value.mode)) errors.push('unsupported command mode');
  if (own(value, 'uid') || own(value, 'ownerId')) errors.push('owner identity is server-bound');
  return { valid: errors.length === 0, errors };
}

export function validateReceipt(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['receipt must be an object'] };
  if (!text(value.id, 180) || !text(value.kind, 80) || !text(value.status, 40)) errors.push('receipt identity/status required');
  if (value.claims != null && (!Array.isArray(value.claims) || value.claims.some((claim) => !text(claim, 300)))) errors.push('invalid receipt claims');
  return { valid: errors.length === 0, errors };
}
