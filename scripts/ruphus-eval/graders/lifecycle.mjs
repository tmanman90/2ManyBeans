import { hashValue, immutableSnapshot } from '../contracts.mjs';
import { isRegisteredStagingStore, readRegisteredStagingExecution } from '../staging-store.mjs';

export const LIFECYCLE_REQUIRED_ATTEMPTS = 24;
export const LIFECYCLE_MINIMUM_SUCCESS = 23;
const SEALED_ATTEMPTS = new WeakSet();
const SEALED_BATCHES = new WeakSet();
const freezeSchedule = (entries) => Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));

export const LIFECYCLE_SCHEDULE = freezeSchedule(Array.from({ length: LIFECYCLE_REQUIRED_ATTEMPTS }, (_, index) => ({ caseId: `case-${index % 12}`, repeat: Math.floor(index / 12) + 1 })));

function expectedKeys() { return LIFECYCLE_SCHEDULE.map((entry) => `${entry.caseId}:${entry.repeat}`); }

function validateStoreExecution(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('lifecycle entry must be an object');
  if (Object.keys(entry).sort().join('|') !== 'caseId|repeat|store') throw new Error('lifecycle entries may contain only caseId, repeat, and store');
  if (typeof entry.caseId !== 'string' || !entry.caseId || !Number.isInteger(entry.repeat) || ![1, 2].includes(entry.repeat)) throw new Error('lifecycle case identity is invalid');
  if (!isRegisteredStagingStore(entry.store)) throw new Error('lifecycle execution must be a registered staging store');
  const execution = readRegisteredStagingExecution(entry.store);
  const snapshot = execution.snapshot;
  const ids = snapshot.identities;
  const revision = snapshot.revisions?.at(-1);
  if (!ids || typeof ids.sessionId !== 'string' || !ids.sessionId || typeof ids.userId !== 'string' || !ids.userId || typeof ids.coffeeId !== 'string' || !ids.coffeeId) throw new Error('lifecycle store identity is invalid');
  if (!revision || typeof revision.id !== 'string' || !revision.id || typeof revision.recipeHash !== 'string' || !revision.recipeHash) throw new Error('lifecycle current revision is not canonical');
  const events = execution.events;
  const revisionIds = new Set(snapshot.revisions.map((candidate) => candidate.id));
  if (!Array.isArray(events) || events.length === 0 || events.some((event, index) => !event || typeof event.eventId !== 'string' || !event.eventId || event.sequence !== index || event.sessionId !== ids.sessionId || (event.revisionId != null && !revisionIds.has(event.revisionId)))) throw new Error('lifecycle event sequence is invalid');
  const lifecycle = execution.lifecycle;
  if (!lifecycle || typeof lifecycle.terminal !== 'string' || !lifecycle.terminal || typeof lifecycle.valid !== 'boolean' || typeof lifecycle.recall !== 'boolean' || typeof lifecycle.criticalFailure !== 'boolean') throw new Error('lifecycle terminal evidence is invalid');
  return { snapshot, events, lifecycle, ids, revision };
}

export function lifecycleAttemptChecksum(attempt) {
  if (!attempt || typeof attempt !== 'object') return null;
  const { ledgerChecksum, expectedLedgerChecksum, ...content } = attempt;
  return hashValue(content);
}

/** Seal only actual executions of the U3 synthetic StagingStore. */
export function sealLifecycleAttempts(entries) {
  if (!Array.isArray(entries) || entries.length !== LIFECYCLE_REQUIRED_ATTEMPTS) throw new Error('lifecycle requires the frozen 12-case x2 schedule');
  const keys = entries.map((entry) => `${entry?.caseId}:${entry?.repeat}`);
  const required = expectedKeys();
  if (new Set(keys).size !== keys.length || keys.slice().sort().join('|') !== required.slice().sort().join('|')) throw new Error('lifecycle attempts do not match the sealed schedule');
  const sealed = entries.map((entry) => {
    const { snapshot, events, lifecycle, ids, revision } = validateStoreExecution(entry);
    const attempt = immutableSnapshot({
      caseId: entry.caseId, repeat: entry.repeat,
      sessionId: ids.sessionId, userId: ids.userId, coffeeId: ids.coffeeId,
      revisionId: revision.id, snapshot, ledger: { canonical: true, sessionId: ids.sessionId, revisionId: revision.id, eventIds: events.map((event) => event.eventId) },
      events, expectedTerminal: lifecycle.terminal, actualTerminal: lifecycle.terminal,
      valid: lifecycle.valid, recall: lifecycle.recall, criticalFailure: lifecycle.criticalFailure,
    });
    const checksum = lifecycleAttemptChecksum(attempt);
    const stamped = immutableSnapshot({ ...attempt, ledgerChecksum: checksum, expectedLedgerChecksum: checksum });
    SEALED_ATTEMPTS.add(stamped);
    return stamped;
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
  const ids = values.map((attempt) => `${attempt?.caseId}:${attempt?.repeat}`);
  const required = expectedKeys();
  if (new Set(ids).size !== ids.length || ids.slice().sort().join('|') !== required.slice().sort().join('|')) failures.push('schedule-lineage-mismatch');
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
