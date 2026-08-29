import { hashValue } from '../contracts.mjs';

export const LIFECYCLE_REQUIRED_ATTEMPTS = 24;
export const LIFECYCLE_MINIMUM_SUCCESS = 23;
const SEALED_ATTEMPTS = new WeakSet();
const SEALED_BATCHES = new WeakSet();
const freezeSchedule = (entries) => Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));

export const LIFECYCLE_SCHEDULE = freezeSchedule(Array.from({ length: LIFECYCLE_REQUIRED_ATTEMPTS }, (_, index) => ({ caseId: `case-${index % 12}`, repeat: Math.floor(index / 12) + 1 })));

function validateRawAttempt(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('lifecycle attempt must be an object');
  if (typeof raw.caseId !== 'string' || !raw.caseId || !Number.isInteger(raw.repeat) || ![1, 2].includes(raw.repeat)) throw new Error('lifecycle case identity is invalid');
  if (typeof raw.sessionId !== 'string' || !raw.sessionId || typeof raw.revisionId !== 'string' || !raw.revisionId) throw new Error('lifecycle session/revision identity is required');
  if (typeof raw.userId !== 'string' || !raw.userId || typeof raw.coffeeId !== 'string' || !raw.coffeeId) throw new Error('lifecycle user/coffee identity is required');
  if (!raw.snapshot || typeof raw.snapshot !== 'object' || raw.snapshot.userId !== raw.userId || raw.snapshot.coffeeId !== raw.coffeeId || raw.snapshot.revisionId !== raw.revisionId || typeof raw.snapshot.recipeHash !== 'string' || !raw.snapshot.recipeHash) throw new Error('lifecycle snapshot identity is not canonical');
  if (!raw.ledger || typeof raw.ledger !== 'object' || raw.ledger.canonical !== true || raw.ledger.sessionId !== raw.sessionId || raw.ledger.revisionId !== raw.revisionId || !Array.isArray(raw.ledger.eventIds) || raw.ledger.eventIds.length === 0) throw new Error('lifecycle ledger is not canonical');
  if (!Array.isArray(raw.events) || raw.events.length !== raw.ledger.eventIds.length || raw.events.some((event, index) => !event || typeof event !== 'object' || typeof event.id !== 'string' || event.id !== raw.ledger.eventIds[index] || event.sequence !== index || event.sessionId !== raw.sessionId || event.revisionId !== raw.revisionId)) throw new Error('lifecycle event sequence is invalid');
  if (typeof raw.expectedTerminal !== 'string' || typeof raw.actualTerminal !== 'string' || raw.expectedTerminal !== raw.actualTerminal) throw new Error('lifecycle terminal state is invalid');
}

export function lifecycleAttemptChecksum(attempt) {
  if (!attempt || typeof attempt !== 'object') return null;
  const { ledgerChecksum, expectedLedgerChecksum, ...content } = attempt;
  return hashValue(content);
}

export function sealLifecycleAttempts(rawAttempts) {
  if (!Array.isArray(rawAttempts) || rawAttempts.length !== LIFECYCLE_REQUIRED_ATTEMPTS) throw new Error('lifecycle requires the frozen 12-case x2 schedule');
  const keys = rawAttempts.map((attempt) => `${attempt?.caseId}:${attempt?.repeat}`);
  const expectedKeys = LIFECYCLE_SCHEDULE.map((entry) => `${entry.caseId}:${entry.repeat}`);
  if (new Set(keys).size !== keys.length || keys.slice().sort().join('|') !== expectedKeys.slice().sort().join('|')) throw new Error('lifecycle attempts do not match the sealed schedule');
  const sealed = rawAttempts.map((raw) => {
    validateRawAttempt(raw);
    const copy = structuredClone(raw);
    delete copy.ledgerChecksum;
    delete copy.expectedLedgerChecksum;
    const checksum = lifecycleAttemptChecksum(copy);
    const attempt = Object.freeze({ ...copy, ledgerChecksum: checksum, expectedLedgerChecksum: checksum });
    SEALED_ATTEMPTS.add(attempt);
    return attempt;
  });
  const batch = Object.freeze(sealed);
  SEALED_BATCHES.add(batch);
  return batch;
}

export function gradeLifecycle(input = {}) {
  const failures = [];
  if (!input || typeof input !== 'object' || Object.hasOwn(input, 'expectedSchedule') || Object.hasOwn(input, 'requiredAttempts')) failures.push('caller-controlled-lifecycle-contract');
  const attempts = input?.attempts;
  if (!SEALED_BATCHES.has(attempts) || !Array.isArray(attempts) || attempts.length !== LIFECYCLE_REQUIRED_ATTEMPTS || attempts.some((attempt) => !SEALED_ATTEMPTS.has(attempt))) failures.push('unsealed-lifecycle-artifact');
  const values = Array.isArray(attempts) ? attempts : [];
  const expectedIds = values.map((attempt) => `${attempt?.caseId}:${attempt?.repeat}`);
  const expectedKeys = LIFECYCLE_SCHEDULE.map((entry) => `${entry.caseId}:${entry.repeat}`);
  if (new Set(expectedIds).size !== expectedIds.length || expectedIds.slice().sort().join('|') !== expectedKeys.slice().sort().join('|')) failures.push('schedule-lineage-mismatch');
  if (new Set(values.map((attempt) => attempt?.sessionId)).size !== values.length || new Set(values.map((attempt) => attempt?.revisionId)).size !== values.length) failures.push('duplicate-lineage-identity');
  const caseCounts = new Map();
  values.forEach((attempt) => { if (attempt?.caseId) caseCounts.set(attempt.caseId, (caseCounts.get(attempt.caseId) || 0) + 1); });
  if (caseCounts.size !== 12 || [...caseCounts.values()].some((count) => count !== 2)) failures.push('invalid-repeat-identity');
  if (values.some((attempt) => attempt.expectedTerminal !== attempt.actualTerminal)) failures.push('unexpected-terminal-state');
  if (values.some((attempt) => attempt.ledgerChecksum !== lifecycleAttemptChecksum(attempt) || attempt.expectedLedgerChecksum !== attempt.ledgerChecksum)) failures.push('unbound-ledger');
  const successes = values.filter((attempt) => attempt.valid === true && attempt.recall === true && attempt.criticalFailure !== true).length;
  if (successes < LIFECYCLE_MINIMUM_SUCCESS) failures.push('lifecycle-reliability-floor');
  if (values.some((attempt) => attempt.criticalFailure === true)) failures.push('critical-failure');
  if (values.some((attempt) => attempt.physicalBrewConfirmed === true)) failures.push('physical-claim-in-lifecycle');
  return { valid: failures.length === 0, hardGate: failures.length === 0, successes, attempts: values.length, criticalFailures: [...new Set(failures)], score: values.length ? successes / values.length : 0 };
}
