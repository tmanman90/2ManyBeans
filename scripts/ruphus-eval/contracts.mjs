import { createHash } from 'node:crypto';

export const U3_CONTRACT_VERSION = 'ruphus-u3-v1';
export const EVIDENCE_SOURCES = Object.freeze(['coffee-state', 'recipe', 'tasting', 'tool-result', 'provider-response']);
export const TRUST_CLASSES = Object.freeze(['canonical', 'user-provided', 'untrusted', 'synthetic']);

export class LifecycleError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LifecycleError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function canonicalJson(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function hashValue(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function stableId(kind, value) {
  if (typeof kind !== 'string' || !kind.trim()) throw new LifecycleError('INVALID_IDENTITY', 'identity kind is required');
  return `${kind.trim()}_${hashValue(value).slice(0, 24)}`;
}

export function createFixedClock(startMs = Date.parse('2026-08-28T00:00:00.000Z')) {
  if (!Number.isFinite(startMs)) throw new LifecycleError('INVALID_CLOCK', 'clock start must be finite');
  let current = Math.round(startMs);
  return Object.freeze({
    now: () => current,
    tick: (ms = 1) => {
      if (!Number.isFinite(ms) || ms < 0) throw new LifecycleError('INVALID_CLOCK', 'clock tick must be non-negative');
      current += Math.round(ms);
      return current;
    },
    iso: () => new Date(current).toISOString(),
  });
}

export function identitySet({ userId = 'user-eval-1', coffeeId = 'coffee-eval-1', recipeId = 'recipe-eval-1', brewId = 'brew-eval-1', tastingId = 'tasting-eval-1', proposalId = 'proposal-eval-1', revisionId = 'revision-eval-0', approvalId = 'approval-eval-1', sessionId = 'session-eval-1' } = {}) {
  const values = { userId, coffeeId, recipeId, brewId, tastingId, proposalId, revisionId, approvalId, sessionId };
  for (const [kind, value] of Object.entries(values)) {
    if (typeof value !== 'string' || !value.trim()) throw new LifecycleError('INVALID_IDENTITY', `${kind} must be a non-empty string`);
  }
  return Object.freeze({ ...values });
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function evidenceEnvelope({ source, trust, recordId, data }) {
  if (!EVIDENCE_SOURCES.includes(source)) throw new LifecycleError('INVALID_EVIDENCE', `unknown evidence source: ${source}`);
  if (!TRUST_CLASSES.includes(trust)) throw new LifecycleError('INVALID_EVIDENCE', `unknown trust class: ${trust}`);
  if (!recordId || typeof recordId.kind !== 'string' || typeof recordId.id !== 'string' || !recordId.id
    || Object.keys(recordId).some((key) => !['kind', 'id'].includes(key))) {
    throw new LifecycleError('INVALID_EVIDENCE', 'evidence requires an immutable record identity');
  }
  const envelope = Object.freeze({
    type: 'evidence', version: U3_CONTRACT_VERSION, source, trust,
    recordId: immutableSnapshot({ kind: recordId.kind, id: recordId.id }),
    data: immutableSnapshot(data),
  });
  const validation = validateEvidenceContract(envelope);
  if (!validation.valid) throw new LifecycleError('INVALID_EVIDENCE', validation.errors.join(', '));
  return envelope;
}

export function evidenceToolContent(evidence) {
  if (!evidence || evidence.type !== 'evidence') throw new LifecycleError('INVALID_EVIDENCE', 'tool content requires an evidence envelope');
  const validation = validateEvidenceContract(evidence);
  if (!validation.valid) throw new LifecycleError('INVALID_EVIDENCE', validation.errors.join(', '));
  return Object.freeze({ role: 'tool', content: JSON.stringify(evidence) });
}

function contractResult(errors) { return { valid: errors.length === 0, errors }; }

function exactKeys(value, allowed, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  Object.keys(value).filter((key) => !allowed.includes(key)).forEach((key) => errors.push(`unexpected:${key}`));
  return true;
}

export function validateEvidenceContract(value) {
  const errors = [];
  if (!exactKeys(value, ['type', 'version', 'source', 'trust', 'recordId', 'data'], errors)) return contractResult(['evidence must be an object']);
  if (value.type !== 'evidence' || typeof value.version !== 'string' || !EVIDENCE_SOURCES.includes(value.source) || !TRUST_CLASSES.includes(value.trust)) errors.push('invalid evidence header');
  if (!exactKeys(value.recordId, ['kind', 'id'], errors)) errors.push('recordId must be an object');
  else if (typeof value.recordId.kind !== 'string' || typeof value.recordId.id !== 'string' || !value.recordId.id) errors.push('invalid recordId');
  if (!Object.prototype.hasOwnProperty.call(value, 'data')) errors.push('data is required');
  return contractResult(errors);
}

export function validateProposalContract(value) {
  const errors = [];
  const allowed = ['id', 'userId', 'coffeeId', 'method', 'expectedRevision', 'expectedRevisionId', 'recipe', 'recipeHash', 'status', 'createdAt', 'appliedRevisionId', 'denialResult'];
  if (!exactKeys(value, allowed, errors)) return contractResult(['proposal must be an object']);
  for (const key of ['id', 'userId', 'coffeeId', 'method', 'expectedRevisionId', 'recipeHash']) if (typeof value[key] !== 'string' || !value[key]) errors.push(`invalid ${key}`);
  if (!Number.isInteger(value.expectedRevision) || value.expectedRevision < 0 || !Number.isInteger(value.createdAt) || value.createdAt < 0) errors.push('invalid proposal numbers');
  if (!value.recipe || typeof value.recipe !== 'object' || Array.isArray(value.recipe)) errors.push('invalid recipe');
  if (!['pending', 'applied', 'rejected'].includes(value.status)) errors.push('invalid status');
  if (Object.prototype.hasOwnProperty.call(value, 'appliedRevisionId') && (typeof value.appliedRevisionId !== 'string' || !value.appliedRevisionId)) errors.push('invalid appliedRevisionId');
  if (Object.prototype.hasOwnProperty.call(value, 'denialResult') && (!value.denialResult || typeof value.denialResult !== 'object' || Array.isArray(value.denialResult))) errors.push('invalid denialResult');
  if (value.status === 'pending' && (Object.prototype.hasOwnProperty.call(value, 'appliedRevisionId') || Object.prototype.hasOwnProperty.call(value, 'denialResult'))) errors.push('pending proposal has terminal fields');
  if (value.status === 'applied' && (typeof value.appliedRevisionId !== 'string' || !value.appliedRevisionId || Object.prototype.hasOwnProperty.call(value, 'denialResult'))) errors.push('applied proposal terminal fields are invalid');
  if (value.status === 'rejected' && (typeof value.denialResult !== 'object' || !value.denialResult || Object.prototype.hasOwnProperty.call(value, 'appliedRevisionId'))) errors.push('rejected proposal terminal fields are invalid');
  return contractResult(errors);
}

export function validateReceiptContract(value) {
  const errors = [];
  const kinds = ['invalid-recipe', 'proposal-created', 'approval-recorded', 'proposal-denied', 'coffee-commit-confirmed', 'undo-committed', 'coffee-side-preparation-confirmed', 'coffee-side-preparation-failed'];
  if (!exactKeys(value, ['ok', 'kind', 'facts', 'claims'], errors)) return contractResult(['receipt must be an object']);
  if (typeof value.ok !== 'boolean' || !kinds.includes(value.kind) || !Array.isArray(value.facts) || !Array.isArray(value.claims)
    || !value.facts.every((item) => typeof item === 'string') || !value.claims.every((item) => typeof item === 'string')) errors.push('invalid receipt fields');
  return contractResult(errors);
}

export function immutableSnapshot(value) {
  const copy = clone(value);
  const freeze = (item) => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
    Object.values(item).forEach(freeze);
    return Object.freeze(item);
  };
  return freeze(copy);
}

export function assertExactIdentity(actual, expected, label = 'identity') {
  if (typeof actual !== 'string' || typeof expected !== 'string' || actual !== expected) {
    throw new LifecycleError('IDENTITY_MISMATCH', `${label} does not match`, { actual, expected });
  }
  return true;
}
