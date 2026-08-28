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
  return Object.freeze({
    type: 'evidence', version: U3_CONTRACT_VERSION, source, trust,
    recordId: immutableSnapshot({ kind: recordId.kind, id: recordId.id }),
    data: immutableSnapshot(data),
  });
}

export function evidenceToolContent(evidence) {
  if (!evidence || evidence.type !== 'evidence') throw new LifecycleError('INVALID_EVIDENCE', 'tool content requires an evidence envelope');
  return Object.freeze({ role: 'tool', content: JSON.stringify(evidence) });
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
