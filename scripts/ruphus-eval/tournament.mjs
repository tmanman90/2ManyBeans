import { DEFAULT_LIMITS } from './models.mjs';
import { hashValue, immutableSnapshot } from './contracts.mjs';
import { buildFinalistReport, buildTournamentReport, validateAttemptArtifact } from './report.mjs';

const ENVELOPE_KEYS = Object.freeze(['actual', 'reply']);
const MAX_REPLY_BYTES = DEFAULT_LIMITS.outputTokens * 4;

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

/** Generate the same provider-neutral request for every exact model arm. */
export function createEvaluationRequest({ caseDefinition, phase = 'qualification' } = {}) {
  if (!caseDefinition || typeof caseDefinition.id !== 'string' || typeof caseDefinition.userPrompt !== 'string' || !caseDefinition.userPrompt || !['qualification', 'finalist-decision'].includes(phase)) throw new Error('frozen case and phase are required');
  const evidence = caseDefinition.fixture;
  if (!object(evidence)) throw new Error('case evidence fixture is required');
  return immutableSnapshot({
    phase, caseId: caseDefinition.id,
    instructions: 'Return exactly one JSON object with keys reply and actual. Do not claim approvals, commits, machine, Fellow, or physical results; report only the structured Coffee evidence available in tool results.',
    input: [{ role: 'user', content: caseDefinition.userPrompt }, { role: 'user', content: JSON.stringify({ evidence }) }],
    responseFormat: Object.freeze({ type: 'json_object', required: Object.freeze([...ENVELOPE_KEYS]), additionalProperties: false }),
    maxOutputTokens: DEFAULT_LIMITS.outputTokens,
  });
}

export const createQualificationRequest = (options = {}) => createEvaluationRequest({ ...options, phase: 'qualification' });
export const createFinalistDecisionRequest = (options = {}) => createEvaluationRequest({ ...options, phase: 'finalist-decision' });

/** Parse the untrusted model response with one provider-neutral contract. */
export function parseCandidateResponse(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw, 'utf8') > MAX_REPLY_BYTES) throw new Error('candidate response exceeds the frozen output envelope');
    try { value = JSON.parse(raw); } catch { throw new Error('candidate response must be strict JSON'); }
  }
  if (!object(value) || Object.keys(value).sort().join('|') !== ENVELOPE_KEYS.slice().sort().join('|') || typeof value.reply !== 'string' || !value.reply.trim() || !object(value.actual) || Buffer.byteLength(value.reply, 'utf8') > MAX_REPLY_BYTES) throw new Error('candidate response envelope is invalid');
  assertAcyclic(value.actual);
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
  const parsed = parseCandidateResponse(rawResponse);
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
