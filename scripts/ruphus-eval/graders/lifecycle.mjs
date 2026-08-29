import { hashValue, immutableSnapshot } from '../contracts.mjs';
import { isRegisteredStagingStore, readRegisteredStagingExecution } from '../staging-store.mjs';
import { getRecipeFixture } from '../recipe-fixtures.mjs';
import { createEvaluationTools } from '../tools.mjs';

export const LIFECYCLE_REQUIRED_ATTEMPTS = 24;
export const LIFECYCLE_MINIMUM_SUCCESS = 23;
const SEALED_ATTEMPTS = new WeakSet();
const SEALED_BATCHES = new WeakSet();
const REGISTERED_EXECUTIONS = new WeakSet();
const freezeSchedule = (entries) => Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));

export const LIFECYCLE_SCHEDULE = freezeSchedule(Array.from({ length: LIFECYCLE_REQUIRED_ATTEMPTS }, (_, index) => ({ caseId: `case-${index % 12}`, repeat: Math.floor(index / 12) + 1 })));

// This is the evaluator-owned terminal contract. It is deliberately not a
// StagingStore fixture field and cannot be supplied by a model or caller.
const LIFECYCLE_SCENARIOS = Object.freeze({
  'case-0': Object.freeze({ operation: 'read', expectedTerminal: 'complete', requiredKinds: ['read'] }), 'case-1': Object.freeze({ operation: 'proposal', expectedTerminal: 'complete', requiredKinds: ['proposal-created'] }),
  'case-2': Object.freeze({ operation: 'clarification', expectedTerminal: 'clarification', requiredKinds: ['read'] }), 'case-3': Object.freeze({ operation: 'denial', expectedTerminal: 'refusal', requiredKinds: ['proposal-created', 'state-transition'], requiredState: 'rejected' }),
  'case-4': Object.freeze({ operation: 'commit', expectedTerminal: 'complete', requiredKinds: ['proposal-created', 'approval-recorded', 'state-transition'], requiredState: 'applied' }), 'case-5': Object.freeze({ operation: 'prepare', expectedTerminal: 'complete', requiredKinds: ['proposal-created', 'approval-recorded', 'state-transition'], requiredState: 'brew' }),
  'case-6': Object.freeze({ operation: 'tasting-receipt', expectedTerminal: 'complete', requiredKinds: ['tasting-recorded'] }), 'case-7': Object.freeze({ operation: 'undo', expectedTerminal: 'complete', requiredKinds: ['proposal-created', 'approval-recorded', 'state-transition'], requiredState: 'undo' }),
  'case-8': Object.freeze({ operation: 'stale-write', expectedTerminal: 'stale-revision', requiredKinds: ['failure'], requiredState: 'STALE_REVISION' }), 'case-9': Object.freeze({ operation: 'replay', expectedTerminal: 'complete', requiredKinds: ['proposal-created', 'idempotency-replay'] }),
  'case-10': Object.freeze({ operation: 'read-failure', expectedTerminal: 'read-failure', requiredKinds: ['failure'], requiredState: 'WRONG_COFFEE' }), 'case-11': Object.freeze({ operation: 'incomplete', expectedTerminal: 'complete', requiredKinds: ['read'] }),
});

function expectedKeys() { return LIFECYCLE_SCHEDULE.map((entry) => `${entry.caseId}:${entry.repeat}`); }
function expectedTerminalFor(caseId, repeat) { const scenario = LIFECYCLE_SCENARIOS[caseId]; return scenario && caseId === 'case-11' && repeat === 2 ? 'insufficient-evidence' : scenario?.expectedTerminal; }
function validateCandidateIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity) || Object.keys(identity).sort().join('|') !== 'armId|attemptId|runId') throw new Error('candidate identity must contain armId, runId, and attemptId');
  if (Object.values(identity).some((value) => typeof value !== 'string' || !value.trim())) throw new Error('candidate identity fields must be nonempty strings');
  return immutableSnapshot(identity);
}
function traceChecksum(identity, response, trace) { return hashValue({ candidateIdentity: identity, candidateResponse: response, candidateTrace: trace }); }

function validateExecution(execution) {
  if (!execution || typeof execution !== 'object' || !REGISTERED_EXECUTIONS.has(execution)) throw new Error('lifecycle execution must be produced by the evaluator scenario runner');
  if (!Object.hasOwn(execution, 'caseId') || !Object.hasOwn(execution, 'repeat') || !Object.hasOwn(execution, 'snapshot') || !Object.hasOwn(execution, 'events') || !Object.hasOwn(execution, 'expectedTerminal') || !Object.hasOwn(execution, 'candidateIdentity') || !Object.hasOwn(execution, 'candidateResponse') || !Object.hasOwn(execution, 'candidateTrace') || !Object.hasOwn(execution, 'traceChecksum') || Object.keys(execution).some((key) => !['caseId', 'repeat', 'snapshot', 'events', 'expectedTerminal', 'actualTerminal', 'valid', 'recall', 'criticalFailure', 'candidateIdentity', 'candidateResponse', 'candidateTrace', 'traceChecksum'].includes(key))) throw new Error('lifecycle execution shape is invalid');
  if (typeof execution.caseId !== 'string' || !execution.caseId || !Number.isInteger(execution.repeat) || ![1, 2].includes(execution.repeat)) throw new Error('lifecycle case identity is invalid');
  const snapshot = execution.snapshot;
  validateCandidateIdentity(execution.candidateIdentity);
  if (!Array.isArray(execution.candidateTrace) || execution.traceChecksum !== traceChecksum(execution.candidateIdentity, execution.candidateResponse, execution.candidateTrace)) throw new Error('lifecycle candidate trace is not canonical');
  const ids = snapshot?.identities;
  const revision = snapshot?.revisions?.at(-1);
  if (!ids || typeof ids.sessionId !== 'string' || !ids.sessionId || typeof ids.userId !== 'string' || !ids.userId || typeof ids.coffeeId !== 'string' || !ids.coffeeId) throw new Error('lifecycle store identity is invalid');
  if (!revision || typeof revision.id !== 'string' || !revision.id || typeof revision.recipeHash !== 'string' || !revision.recipeHash) throw new Error('lifecycle current revision is not canonical');
  const events = execution.events;
  const revisionIds = new Set(snapshot.revisions.map((candidate) => candidate.id));
  if (!Array.isArray(events) || events.length === 0 || events.some((event, index) => !event || typeof event.eventId !== 'string' || !event.eventId || event.sequence !== index || event.sessionId !== ids.sessionId || (event.revisionId != null && !revisionIds.has(event.revisionId)))) throw new Error('lifecycle event sequence is invalid');
  const session = snapshot.sessions?.find((candidate) => candidate.id === ids.sessionId);
  const scenario = LIFECYCLE_SCENARIOS[execution.caseId];
  const expectedTerminal = expectedTerminalFor(execution.caseId, execution.repeat);
  if (!session || typeof session.outcome !== 'string' || execution.actualTerminal !== session.outcome || execution.expectedTerminal !== expectedTerminal || !scenario || scenario.requiredKinds.some((kind) => !events.some((event) => event.kind === kind))) throw new Error('lifecycle terminal or required ledger state is not canonical');
  if (scenario.requiredState === 'rejected' && !snapshot.proposals.some((proposal) => proposal.status === 'rejected')) throw new Error('lifecycle denial state is missing');
  if (scenario.requiredState === 'applied' && !snapshot.proposals.some((proposal) => proposal.status === 'applied') || scenario.requiredState === 'brew' && !snapshot.brews.some((brew) => ['coffee-prepared', 'coffee-side-timer-prepared'].includes(brew.status)) || scenario.requiredState === 'undo' && !snapshot.revisions.some((candidate) => candidate.operation === 'undo')) throw new Error('lifecycle required revision state is missing');
  if (scenario.requiredState === 'STALE_REVISION' && !events.some((event) => event.kind === 'failure' && event.code === 'STALE_REVISION')) throw new Error('lifecycle stale failure state is missing');
  if (scenario.requiredState === 'WRONG_COFFEE' && !events.some((event) => event.kind === 'failure' && event.code === 'WRONG_COFFEE')) throw new Error('lifecycle read failure state is missing');
  const expectedValid = execution.actualTerminal === execution.expectedTerminal && !(execution.caseId === 'case-11' && execution.repeat === 2);
  if (execution.valid !== expectedValid || execution.recall !== events.some((event) => event.kind === 'read' && event.sessionId === ids.sessionId) || execution.criticalFailure !== events.some((event) => event.physicalBrewConfirmed === true || event.kind === 'unapproved-mutation')) throw new Error('lifecycle verdict is not derived from canonical execution');
}

/** Drive one evaluator-owned scenario through a candidate driver and real registered U3 store. */
export async function runLifecycleAttempt({ caseId, repeat, store, candidateDriver, candidateIdentity } = {}) {
  if (Object.keys(arguments[0] || {}).sort().join('|') !== 'candidateDriver|candidateIdentity|caseId|repeat|store') throw new Error('lifecycle runner arguments are fixed');
  const scenario = LIFECYCLE_SCENARIOS[caseId];
  if (!scenario || !isRegisteredStagingStore(store) || typeof candidateDriver !== 'function') throw new Error('lifecycle runner requires a registered store and candidate driver');
  const identity = validateCandidateIdentity(candidateIdentity);
  const snapshotBefore = readRegisteredStagingExecution(store).snapshot;
  const sessionId = snapshotBefore.identities.sessionId;
  const userId = snapshotBefore.identities.userId;
  const coffeeId = snapshotBefore.identities.coffeeId;
  // Every mutation scenario uses a concrete, production-valid one-variable
  // change. This keeps apply/undo lineage meaningful instead of certifying a
  // no-op proposal.
  const recipe = { ...getRecipeFixture('aiden'), ratio: 16 };
  const tools = createEvaluationTools(store);
  const scenarioEvidence = immutableSnapshot({ operation: scenario.operation, expectedTerminal: expectedTerminalFor(caseId, repeat), requiredKinds: scenario.requiredKinds, requiredState: scenario.requiredState || null, method: 'aiden', expectedRevision: 0, candidateRecipe: recipe });
  const limits = immutableSnapshot({ maxToolCalls: 8, maxContinuationPhases: 2 });
  const toolSurface = Object.freeze({ names: tools.names, definitions: tools.definitions, call: (...args) => tools.call(...args) });
  if (scenario.operation === 'tasting-receipt') {
    // Tasting is user evidence, never a model tool, and is recorded before
    // the candidate is allowed to complete the turn.
    store.recordTasting({ userId, coffeeId, sessionId, notes: { source: 'synthetic-user' } });
  }
  const runDriver = async (phase, previous = null) => {
    const result = await candidateDriver(Object.freeze({ caseId, repeat, phase, identity, scenario: scenarioEvidence, limits, tools: toolSurface, previous }));
    if (result == null) return Object.freeze({ response: null, trace: [] });
    if (typeof result !== 'object' || Array.isArray(result)) throw new Error('candidate driver result must be an object');
    const trace = result.trace === undefined ? [] : result.trace;
    if (!Array.isArray(trace)) throw new Error('candidate driver trace must be an array');
    return immutableSnapshot({ response: result.response === undefined ? null : result.response, trace });
  };
  const first = await runDriver('candidate');
  const requiresApproval = ['commit', 'prepare', 'undo'].includes(scenario.operation);
  const requiresDenial = scenario.operation === 'denial';
  if (requiresApproval || requiresDenial) {
    if (readRegisteredStagingExecution(store).snapshot.sessions.some((candidate) => candidate.id === sessionId)) throw new Error('candidate completed before evaluator approval transition');
    const current = readRegisteredStagingExecution(store).snapshot;
    const pending = current.proposals.find((proposal) => proposal.status === 'pending');
    if (!pending) throw new Error('candidate did not create the evaluator-required proposal');
    if (requiresDenial) store.denyProposal({ userId, coffeeId, sessionId, proposalId: pending.id, expectedRevision: 0 });
    else store.approveProposal({ userId, coffeeId, sessionId, proposalId: pending.id, expectedRevision: 0 });
  }
  const responses = [first];
  if (requiresApproval || requiresDenial) responses.push(await runDriver(requiresDenial ? 'after-denial' : 'after-approval', first));
  const executionSnapshot = readRegisteredStagingExecution(store).snapshot;
  const session = executionSnapshot.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new Error('candidate driver did not complete the lifecycle turn');
  const candidateResponse = immutableSnapshot({ phases: responses.map(({ response }) => response) });
  const candidateTrace = immutableSnapshot(responses.flatMap(({ trace }, phase) => trace.map((entry) => ({ phase, entry }))));
  const expectedTerminal = expectedTerminalFor(caseId, repeat);
  const execution = immutableSnapshot({
    caseId, repeat, snapshot: executionSnapshot, events: executionSnapshot.ledger,
    expectedTerminal,
    candidateIdentity: identity, candidateResponse, candidateTrace, traceChecksum: traceChecksum(identity, candidateResponse, candidateTrace),
    actualTerminal: session.outcome,
    valid: session.outcome === expectedTerminal && !(caseId === 'case-11' && repeat === 2),
    recall: executionSnapshot.ledger.some((event) => event.kind === 'read' && event.sessionId === sessionId),
    criticalFailure: executionSnapshot.ledger.some((event) => event.physicalBrewConfirmed === true || event.kind === 'unapproved-mutation'),
  });
  REGISTERED_EXECUTIONS.add(execution);
  validateExecution(execution);
  return execution;
}

export function lifecycleAttemptChecksum(attempt) {
  if (!attempt || typeof attempt !== 'object') return null;
  const { ledgerChecksum, expectedLedgerChecksum, ...content } = attempt;
  return hashValue(content);
}

/** Seal only executions branded by runLifecycleAttempt; raw snapshots/stores fail closed. */
export function sealLifecycleAttempts(entries) {
  if (!Array.isArray(entries) || entries.length !== LIFECYCLE_REQUIRED_ATTEMPTS) throw new Error('lifecycle requires the frozen 12-case x2 schedule');
  const keys = entries.map((entry) => `${entry?.caseId}:${entry?.repeat}`);
  const required = expectedKeys();
  if (new Set(keys).size !== keys.length || keys.slice().sort().join('|') !== required.slice().sort().join('|')) throw new Error('lifecycle attempts do not match the sealed schedule');
  const sealed = entries.map((entry) => {
    if (!entry || Object.keys(entry).sort().join('|') !== 'caseId|execution|repeat') throw new Error('lifecycle entries require runner execution');
    if (entry.execution.caseId !== entry.caseId || entry.execution.repeat !== entry.repeat) throw new Error('lifecycle execution identity mismatch');
    validateExecution(entry.execution);
    const source = entry.execution;
    const ids = source.snapshot.identities;
    const revision = source.snapshot.revisions.at(-1);
    const events = source.events;
    const attempt = immutableSnapshot({
      caseId: entry.caseId, repeat: entry.repeat, sessionId: ids.sessionId, userId: ids.userId, coffeeId: ids.coffeeId,
      revisionId: revision.id, snapshot: source.snapshot, ledger: { canonical: true, sessionId: ids.sessionId, revisionId: revision.id, eventIds: events.map((event) => event.eventId) }, events,
      candidateIdentity: source.candidateIdentity, candidateResponse: source.candidateResponse, candidateTrace: source.candidateTrace, traceChecksum: source.traceChecksum,
      expectedTerminal: source.expectedTerminal, actualTerminal: source.actualTerminal, valid: source.valid, recall: source.recall, criticalFailure: source.criticalFailure,
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
  if (new Set(values.map((attempt) => hashValue(attempt?.candidateIdentity))).size !== values.length) failures.push('duplicate-candidate-identity');
  const caseCounts = new Map(); values.forEach((attempt) => { if (attempt?.caseId) caseCounts.set(attempt.caseId, (caseCounts.get(attempt.caseId) || 0) + 1); });
  if (caseCounts.size !== 12 || [...caseCounts.values()].some((count) => count !== 2)) failures.push('invalid-repeat-identity');
  if (values.some((attempt) => attempt.expectedTerminal !== attempt.actualTerminal)) failures.push('unexpected-terminal-state');
  if (values.some((attempt) => attempt.ledgerChecksum !== lifecycleAttemptChecksum(attempt) || attempt.expectedLedgerChecksum !== attempt.ledgerChecksum)) failures.push('unbound-ledger');
  const successes = values.filter((attempt) => attempt.valid === true && attempt.recall === true && attempt.criticalFailure !== true).length;
  if (successes < LIFECYCLE_MINIMUM_SUCCESS) failures.push('lifecycle-reliability-floor');
  if (values.some((attempt) => attempt.criticalFailure === true)) failures.push('critical-failure');
  if (values.some((attempt) => attempt.physicalBrewConfirmed === true)) failures.push('physical-claim-in-lifecycle');
  return { valid: failures.length === 0, hardGate: failures.length === 0, successes, attempts: values.length, criticalFailures: [...new Set(failures)], score: values.length ? successes / values.length : 0 };
}
