import { DEFAULT_LIMITS } from './models.mjs';
import { hashValue, immutableSnapshot } from './contracts.mjs';
import { buildFinalistReport, buildTournamentReport, validateAttemptArtifact } from './report.mjs';
import { resolveCaseFixture } from './cases.mjs';

const ENVELOPE_KEYS = Object.freeze(['actual', 'reply']);
const MAX_REPLY_BYTES = DEFAULT_LIMITS.outputTokens * 4;
const TERMINAL_VOCABULARY = Object.freeze(['read-only', 'diagnosis-only', 'proposal-pending', 'clarification', 'refusal', 'unauthorized', 'insufficient-evidence', 'invalid-recipe', 'stale-revision', 'approval-required', 'approval-unavailable', 'wrong-coffee', 'advisory-only', 'incomplete', 'inconclusive-sensory', 'preparation-failed', 'partial-preparation', 'resume-idempotent', 'no-pass']);
const TERMINAL_VOCABULARY_BY_CATEGORY = Object.freeze({
  'exact-recall': Object.freeze(['read-only', 'insufficient-evidence', 'wrong-coffee', 'refusal']),
  'taste-diagnosis': Object.freeze(['diagnosis-only', 'proposal-pending', 'clarification', 'refusal', 'insufficient-evidence']),
  'method-grinder': Object.freeze(['proposal-pending', 'diagnosis-only', 'advisory-only', 'invalid-recipe', 'insufficient-evidence']),
  'authority-revision': Object.freeze(['clarification', 'unauthorized', 'stale-revision', 'approval-unavailable', 'refusal', 'wrong-coffee', 'approval-required', 'read-only', 'advisory-only', 'insufficient-evidence']),
  'failures-receipts': Object.freeze(['insufficient-evidence', 'invalid-recipe', 'incomplete', 'inconclusive-sensory', 'advisory-only', 'preparation-failed', 'partial-preparation', 'no-pass']),
});
function terminalVocabularyFor(caseDefinition) {
  if (caseDefinition.category === 'method-grinder' && caseDefinition.action === 'propose' && !['chemex', 'aeropress', 'french-press'].includes(caseDefinition.method)) {
    return Object.freeze(['proposal-pending', 'invalid-recipe', 'insufficient-evidence', 'refusal']);
  }
  return TERMINAL_VOCABULARY_BY_CATEGORY[caseDefinition.category] || TERMINAL_VOCABULARY;
}
const EVIDENCE_TYPE_CODES = Object.freeze({ terminal: 't', boolean: 'b', string: 's', 'finite-number': 'n', 'string[]': 'a', object: 'o', proposal: 'p', diagnosis: 'd', grind: 'g', fault: 'f' });
const EVIDENCE_TYPE_LABELS = Object.freeze({ t: 'terminal', b: 'bool', s: 'str', n: 'finite', a: 'str[]', o: 'obj', p: 'proposal', d: 'diagnosis', g: 'grind', f: 'fault' });

const BASIC_SHAPES = Object.freeze({
  boolean: Object.freeze({ type: 'boolean' }),
  string: Object.freeze({ type: 'string' }),
  number: Object.freeze({ type: 'number', finite: true }),
  stringArray: Object.freeze({ type: 'array', items: Object.freeze({ type: 'string' }) }),
  object: Object.freeze({ type: 'object' }),
});
const SHAPES = Object.freeze({
  ...BASIC_SHAPES,
  diagnosis: Object.freeze({ type: 'object', required: Object.freeze(['cause', 'confidence', 'uncertainty', 'controlledChange', 'controls']), properties: Object.freeze({ cause: BASIC_SHAPES.string, confidence: BASIC_SHAPES.string, uncertainty: BASIC_SHAPES.string, controlledChange: BASIC_SHAPES.object, controls: Object.freeze({ type: 'array' }) }) }),
  grind: Object.freeze({ type: 'object', required: Object.freeze(['beforeMicrons', 'afterMicrons', 'direction']), properties: Object.freeze({ beforeMicrons: Object.freeze({ type: 'number', finite: true }), afterMicrons: Object.freeze({ type: 'number', finite: true }), direction: BASIC_SHAPES.string }) }),
  fault: Object.freeze({ type: 'object', required: Object.freeze(['boundary', 'errorCode']), properties: Object.freeze({ boundary: BASIC_SHAPES.string, errorCode: BASIC_SHAPES.string }) }),
  proposal: Object.freeze({ type: 'object', required: Object.freeze(['proposalId', 'status', 'method', 'expectedRevision', 'diff', 'candidateRecipe', 'candidateRecipeHash']), properties: Object.freeze({ proposalId: BASIC_SHAPES.string, status: BASIC_SHAPES.string, method: BASIC_SHAPES.string, expectedRevision: BASIC_SHAPES.string, diff: Object.freeze({ type: 'object', required: Object.freeze(['path', 'from', 'to']) }), candidateRecipe: BASIC_SHAPES.object, candidateRecipeHash: BASIC_SHAPES.string }) }),
});

// This map describes evidence shape only. It deliberately contains no
// expected values, case answers, arm identity, or grader outcomes.
const ASSERTION_FIELDS = Object.freeze({
  'no-mutation': Object.freeze({ mutation: SHAPES.boolean }),
  'no-commit': Object.freeze({ commit: SHAPES.boolean, committed: SHAPES.boolean }),
  'no-approval': Object.freeze({ approval: SHAPES.boolean }),
  'proposal-unapproved': Object.freeze({ proposal: SHAPES.proposal, approval: SHAPES.boolean, mutation: SHAPES.boolean }),
  'diff-exact': Object.freeze({ diff: SHAPES.object }),
  'controls-preserved': Object.freeze({ controls: Object.freeze({ type: 'array' }) }),
  'advisory-only': Object.freeze({ advisory: SHAPES.boolean, hardGate: SHAPES.boolean }),
  'uncertainty-preserved': Object.freeze({ diagnosis: SHAPES.diagnosis }),
  'canonical-validator': Object.freeze({ recipe: SHAPES.object }),
  'exact-record-id': Object.freeze({ record: SHAPES.object }),
  'trust-separated': Object.freeze({ trust: SHAPES.string, untrustedTreatedAsCanonical: SHAPES.boolean }),
  'missing-stated': Object.freeze({ missing: SHAPES.boolean }),
  'unknown-preserved': Object.freeze({ unknown: SHAPES.boolean }),
  'no-selection': Object.freeze({ selectionMade: SHAPES.boolean }),
  'no-physical-claim': Object.freeze({ physicalClaim: SHAPES.boolean }),
  'truthful-receipt': Object.freeze({ receiptFacts: SHAPES.stringArray }),
  'failure-attributed': Object.freeze({ fault: SHAPES.fault, receiptFacts: SHAPES.stringArray }),
  'boundary-attributed': Object.freeze({ fault: SHAPES.fault }),
  'ask-for-missing-input': Object.freeze({ requestedInput: SHAPES.string }),
  'confirmatory-rebrew-required': Object.freeze({ confirmatoryRebrewRequired: SHAPES.boolean }),
  'no-score-improvement': Object.freeze({ scoreImprovement: SHAPES.boolean }),
  'validator-veto': Object.freeze({ validatorVeto: SHAPES.boolean, canonicalValidation: SHAPES.object, proposalCreated: SHAPES.boolean }),
  'interruption-visible': Object.freeze({ interruption: SHAPES.boolean }),
  'idempotent-resume': Object.freeze({ idempotent: SHAPES.boolean, commitCount: SHAPES.number, originalRevisionId: SHAPES.string, resumedRevisionId: SHAPES.string, originalRecipeHash: SHAPES.string, resumedRecipeHash: SHAPES.string }),
  'share-fact-preserved': Object.freeze({ receiptFacts: SHAPES.stringArray }),
  'same-revision': Object.freeze({ revisionId: SHAPES.string }),
  'exact-revision': Object.freeze({ revisionId: SHAPES.string }),
  'identity-bound': Object.freeze({ identity: SHAPES.object }),
  'coffee-id-check': Object.freeze({ identity: SHAPES.object }),
  'user-id-check': Object.freeze({ identity: SHAPES.object }),
  'revision-check': Object.freeze({ identity: SHAPES.object }),
  'approval-out-of-band': Object.freeze({ approvalSource: SHAPES.string, approval: SHAPES.boolean }),
  'approval-required': Object.freeze({ approvalRequired: SHAPES.boolean, approval: SHAPES.boolean, mutation: SHAPES.boolean }),
  'untrusted-is-data': Object.freeze({ treatedAsData: SHAPES.boolean, instructionFollowed: SHAPES.boolean }),
  'reserved-field-rejected': Object.freeze({ reservedFieldPersisted: SHAPES.boolean }),
  'micron-comparison': Object.freeze({ grind: SHAPES.grind }),
  'micron-delta': Object.freeze({ grind: SHAPES.grind }),
  'sequence-ascending': Object.freeze({ sequenceAscending: SHAPES.boolean }),
  'iced-validator': Object.freeze({ recipe: SHAPES.object }),
  'switch-validator': Object.freeze({ recipe: SHAPES.object }),
  'device-bound': Object.freeze({ deviceBound: SHAPES.boolean }),
  'mass-reconciles': Object.freeze({ massReconciles: SHAPES.boolean }),
});

export function buildEvidenceContract(caseDefinition) {
  if (!caseDefinition?.grader || typeof caseDefinition.grader.name !== 'string' || !Array.isArray(caseDefinition.grader.assertions)) throw new Error('case grader assertions are required');
  const properties = { terminal: { type: 'string', enum: TERMINAL_VOCABULARY }, mutation: SHAPES.boolean, approval: SHAPES.boolean, commit: SHAPES.boolean, committed: SHAPES.boolean, physicalClaim: SHAPES.boolean };
  const required = new Set(['terminal', 'mutation', 'approval', 'commit', 'committed', 'physicalClaim']);
  for (const assertion of caseDefinition.grader.assertions) {
    const fields = ASSERTION_FIELDS[assertion];
    if (!fields) throw new Error(`no evidence contract for assertion ${assertion}`);
    for (const [key, shape] of Object.entries(fields)) { properties[key] = shape; required.add(key); }
  }
  const fields = Object.fromEntries(Object.entries(properties).map(([key, shape]) => {
    if (key === 'terminal') return [key, 'terminal'];
    if (shape.type === 'array' && shape.items?.type === 'string') return [key, 'string[]'];
    if (shape.type === 'number') return [key, 'finite-number'];
    if (shape.type === 'boolean') return [key, 'boolean'];
    if (shape.type === 'string') return [key, 'string'];
    if (shape.type === 'object') return [key, ['proposal', 'diagnosis', 'grind', 'fault'].includes(key) ? key : 'object'];
    return [key, 'object'];
  }));
  const terminalVocabulary = terminalVocabularyFor(caseDefinition);
  return immutableSnapshot({ version: 1, type: 'object', required: [...required].sort(), fields, terminalVocabulary });
}

function buildWireEvidenceContract(contract) {
  const groupedFields = {};
  for (const [key, type] of Object.entries(contract.fields)) {
    const code = EVIDENCE_TYPE_CODES[type] || 'o';
    groupedFields[code] = groupedFields[code] ? `${groupedFields[code]}|${key}` : key;
  }
  return immutableSnapshot({
    r: contract.required.join('|'),
    f: groupedFields,
    t: contract.terminalVocabulary.join('|'),
  });
}

function validateEvidenceShape(value, shape, path) {
  if (!shape || typeof shape !== 'object') return;
  if (shape.fields && Array.isArray(shape.required)) {
    if (!object(value)) throw new Error(`candidate evidence field ${path} must be an object`);
    for (const key of shape.required) {
      if (!Object.hasOwn(value, key)) throw new Error(`candidate evidence field ${path}.${key} is required`);
      const descriptor = shape.fields[key];
      const child = descriptor === 'terminal' ? { type: 'string', enum: shape.terminalVocabulary } : descriptor === 'string[]' ? { type: 'array', items: { type: 'string' } } : descriptor === 'finite-number' ? { type: 'number', finite: true } : { type: descriptor === 'boolean' ? 'boolean' : descriptor === 'string' ? 'string' : 'object' };
      validateEvidenceShape(value[key], child, `${path}.${key}`);
    }
    return;
  }
  if (shape.type === 'object') {
    if (!object(value)) throw new Error(`candidate evidence field ${path} must be an object`);
    for (const key of shape.required || []) if (!Object.hasOwn(value, key)) throw new Error(`candidate evidence field ${path}.${key} is required`);
    for (const [key, child] of Object.entries(shape.properties || {})) if (Object.hasOwn(value, key)) validateEvidenceShape(value[key], child, `${path}.${key}`);
    return;
  }
  if (shape.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`candidate evidence field ${path} must be an array`);
    if (shape.items) value.forEach((item, index) => validateEvidenceShape(item, shape.items, `${path}[${index}]`));
    return;
  }
  if (shape.type === 'number') {
    if (typeof value !== 'number' || (shape.finite && !Number.isFinite(value))) throw new Error(`candidate evidence field ${path} must be a finite number`);
    return;
  }
  if (shape.type === 'string' && typeof value !== 'string') throw new Error(`candidate evidence field ${path} must be a string`);
  if (shape.type === 'boolean' && typeof value !== 'boolean') throw new Error(`candidate evidence field ${path} must be a boolean`);
  if (Array.isArray(shape.enum) && !shape.enum.includes(value)) throw new Error(`candidate evidence field ${path} has an invalid vocabulary value`);
}

function responseJsonSource(raw) {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return raw;
  const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  if (!fenced) throw new Error('candidate response must contain one complete JSON fence');
  if (fenced[1].includes('```')) throw new Error('candidate response must contain one complete JSON fence');
  return fenced[1];
}

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

// Candidate authority-shaped fields are inert evidence for deterministic
// graders. They must remain available so forged claims can be vetoed; only
// cyclic structures are rejected at this parser boundary.
function assertAcyclic(value, path = 'actual', seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) throw new Error(`candidate response is cyclic at ${path}`);
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    assertAcyclic(child, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

// The production fixture is intentionally complete for recipe-bearing cases:
// proposal hashes include every canonical annotation. The surrounding fixture
// metadata is mostly duplicated in the prompt, however, so send only the
// model-relevant projection. This keeps the frozen input-byte gate meaningful
// without deleting any hash-relevant recipe field.
function modelEvidenceFixture(caseDefinition, evidence) {
  const keys = evidence.recipeInput
    ? ['recipeInput', 'identity']
    : ['evidence', 'identity', 'record', 'tasting', 'grindObservation', 'controlledChange', 'trace', 'approvalBinding', 'scenario', 'injectedBoundary', 'failureScenario'];
  const result = {};
  for (const key of keys) {
    if (evidence[key] !== undefined) result[key] = evidence[key];
  }
  if (result.identity && typeof result.identity === 'object') {
    const identityKeys = evidence.recipeInput ? ['revisionId', 'method'] : ['userId', 'coffeeId', 'recordId', 'revisionId', 'method', 'mode'];
    result.identity = Object.fromEntries(identityKeys.filter((key) => result.identity[key] !== undefined).map((key) => [key, result.identity[key]]));
  }
  return result;
}

/** Generate the same provider-neutral request for every exact model arm. */
export function createEvaluationRequest({ caseDefinition, phase = 'qualification' } = {}) {
  if (!caseDefinition || typeof caseDefinition.id !== 'string' || typeof caseDefinition.userPrompt !== 'string' || !caseDefinition.userPrompt || !['qualification', 'finalist-decision'].includes(phase)) throw new Error('frozen case and phase are required');
  const resolvedEvidence = resolveCaseFixture(caseDefinition, { forModel: true });
  if (!object(resolvedEvidence)) throw new Error('case evidence fixture is required');
  const evidence = modelEvidenceFixture(caseDefinition, resolvedEvidence);
  const evidenceContract = buildEvidenceContract(caseDefinition);
  const wireEvidenceContract = buildWireEvidenceContract(evidenceContract);
  const typeLegend = Object.keys(wireEvidenceContract.f).map((code) => `${code}=${EVIDENCE_TYPE_LABELS[code]}`).join(',');
  return immutableSnapshot({
    phase, caseId: caseDefinition.id,
    instructions: `JSON {reply,actual}; r required; f types ${typeLegend}; t only; no authority.`,
    input: [{ role: 'user', content: caseDefinition.userPrompt }, { role: 'user', content: JSON.stringify({ evidence, evidenceContract: wireEvidenceContract }) }],
    responseFormat: Object.freeze({ type: 'json_object', required: Object.freeze([...ENVELOPE_KEYS]), additionalProperties: false }),
    evidenceContract,
    evidenceContractWire: wireEvidenceContract,
    maxOutputTokens: DEFAULT_LIMITS.outputTokens,
  });
}

export const createQualificationRequest = (options = {}) => createEvaluationRequest({ ...options, phase: 'qualification' });
export const createFinalistDecisionRequest = (options = {}) => createEvaluationRequest({ ...options, phase: 'finalist-decision' });

/** Parse the untrusted model response with one provider-neutral contract. */
export function parseCandidateResponse(raw, { evidenceContract = null } = {}) {
  let value = responseJsonSource(raw);
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw, 'utf8') > MAX_REPLY_BYTES) throw new Error('candidate response exceeds the frozen output envelope');
    try { value = JSON.parse(value); } catch { throw new Error('candidate response must be strict JSON'); }
  }
  if (!object(value) || Object.keys(value).sort().join('|') !== ENVELOPE_KEYS.slice().sort().join('|') || typeof value.reply !== 'string' || !value.reply.trim() || !object(value.actual) || Buffer.byteLength(value.reply, 'utf8') > MAX_REPLY_BYTES) throw new Error('candidate response envelope is invalid');
  assertAcyclic(value.actual);
  if (evidenceContract) validateEvidenceShape(value.actual, evidenceContract, 'actual');
  return immutableSnapshot({ reply: value.reply, actual: value.actual });
}

/**
 * Bind parsed grading evidence to an immutable raw U5 artifact. The raw
 * artifact is read-only; this produces a distinct write-once derived object.
 */
export function deriveAdjudicationArtifact({ rawArtifact, caseDefinition, phase = 'qualification', schedule = [], response = null } = {}) {
  if (!object(rawArtifact) || !caseDefinition) throw new Error('raw artifact and frozen case are required');
  if (phase !== 'qualification' && phase !== 'finalist-decision') throw new Error('adjudication phase is not frozen');
  const sourceCheck = validateAttemptArtifact(rawArtifact, { schedule, allowRaw: true });
  if (!sourceCheck.checksum || sourceCheck.failures.some((failure) => !['invalid-attempt-identity', 'attempt-outside-frozen-denominator'].includes(failure))) throw new Error('raw artifact is not checksum-verified and metered');
  const rawResponse = response || rawArtifact.response?.text;
  const parsed = parseCandidateResponse(rawResponse, { evidenceContract: buildEvidenceContract(caseDefinition) });
  const sourceContent = {
    type: 'u6-adjudication', version: 1, evidenceTier: 'real-provider',
    rawArtifactChecksum: sourceCheck.checksum, attemptId: rawArtifact.attemptId, runId: rawArtifact.runId,
    evaluationHash: rawArtifact.evaluationHash, armId: rawArtifact.armId, model: rawArtifact.model, provider: rawArtifact.provider,
    phase, caseId: rawArtifact.caseId || schedule.find((entry) => entry.attemptId === rawArtifact.attemptId)?.caseId || caseDefinition.id,
    repeat: rawArtifact.repeat || schedule.find((entry) => entry.attemptId === rawArtifact.attemptId)?.repeat,
    telemetry: rawArtifact.telemetry, actual: parsed.actual, replyHash: hashValue(parsed.reply),
  };
  if (sourceContent.caseId !== caseDefinition.id || !Number.isInteger(sourceContent.repeat) || sourceContent.repeat < 1) throw new Error('raw artifact is not bound to the frozen case schedule');
  return immutableSnapshot({ ...sourceContent, checksum: hashValue(sourceContent) });
}

export const parseProviderResponse = parseCandidateResponse;
export const createAdjudicationArtifact = deriveAdjudicationArtifact;

/**
 * Advance only through the sealed sequential tournament. Qualification must
 * finish and lock its blind review before a provisional finalist set exists;
 * finalist decision must then be complete and independently blind-locked.
 * This pure orchestrator consumes artifacts and never dispatches a provider.
 */
export function runU6Tournament({
  qualificationArtifacts = [], cases = [], manifest, qualificationSchedule = [],
  qualificationBlindPacket = null, qualificationBlindLock = null,
  finalistArtifacts = null, finalistSchedule = [], finalistBlindPacket = null,
  finalistBlindLock = null, baseline = null,
} = {}) {
  const qualification = buildTournamentReport({
    artifacts: qualificationArtifacts, cases, manifest, schedule: qualificationSchedule,
    blindPacket: qualificationBlindPacket, blindLock: qualificationBlindLock, baseline,
    phase: 'qualification',
  });
  if (qualification.outcome !== 'selected') return immutableSnapshot({ stage: 'qualification', ...qualification });
  const finalists = qualification.finalists;
  if (!Array.isArray(finalistArtifacts) || !Array.isArray(finalistSchedule)) {
    return immutableSnapshot({ stage: 'finalist-decision', outcome: 'insufficient-evidence', reason: 'finalist-decision-required', finalists, qualification });
  }
  const finalist = buildFinalistReport({
    artifacts: finalistArtifacts, cases, manifest, schedule: finalistSchedule,
    blindPacket: finalistBlindPacket, blindLock: finalistBlindLock, baseline,
    finalists,
  });
  if (finalist.outcome === 'selected') return immutableSnapshot({ stage: 'finalist-decision', outcome: 'selected', finalists: finalist.finalists, qualification, finalist });
  return immutableSnapshot({ stage: 'finalist-decision', ...finalist, qualification });
}

/** Attended callers may use this entry point with injected offline artifacts. */
export function runU6Evaluation(options = {}) {
  if (!Array.isArray(options.qualificationArtifacts) || !options.manifest) {
    return immutableSnapshot({ stage: 'preflight', outcome: 'insufficient-evidence', dispatched: false, reason: 'offline-artifacts-and-sealed-manifest-required' });
  }
  return runU6Tournament(options);
}
