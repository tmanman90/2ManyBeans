import { readFileSync } from 'node:fs';
import { createRunLease, ImmutableArtifactStore, runAgentAttempt, validateRunnerGates } from './agent-runner.mjs';
import { DEFAULT_LIMITS, EVALUATION_CAP_USD, MODEL_ARMS, getArm } from './models.mjs';
import { createEvaluationRequest } from './tournament.mjs';
import { hashValue, immutableSnapshot, stableId } from './contracts.mjs';

export const RECOVERY_PRIOR_PROVIDER_BOUND_USD = 0.746939;
export const RECOVERY_ADDITIONAL_CAP_USD = EVALUATION_CAP_USD - RECOVERY_PRIOR_PROVIDER_BOUND_USD;
export const SUBMIT_RESULT_TOOL = Object.freeze({
  type: 'function', name: 'submit_result', strict: true,
  description: 'Submit a Coffee answer and an optional semantic recipe change.',
  parameters: Object.freeze({
    type: 'object', additionalProperties: false,
    properties: Object.freeze({
      reply: Object.freeze({ type: 'string' }),
      action: Object.freeze({ type: 'string', enum: Object.freeze(['read', 'diagnose', 'propose', 'clarify', 'refuse', 'insufficient-evidence']) }),
      diagnosis: Object.freeze({ anyOf: Object.freeze([
        Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze({ cause: { type: 'string' }, confidence: { type: 'string' }, uncertainty: { type: 'string' } }), required: Object.freeze(['cause', 'confidence', 'uncertainty']) }),
        Object.freeze({ type: 'null' }),
      ]) }),
      patch: Object.freeze({ anyOf: Object.freeze([
        Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze({ path: { type: 'string' }, from: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }] }, to: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }] } }), required: Object.freeze(['path', 'from', 'to']) }),
        Object.freeze({ type: 'null' }),
      ]) }),
    }),
    required: Object.freeze(['reply', 'action', 'diagnosis', 'patch']),
  }),
});
const RECOVERY_MODEL_TOOL_NAMES = Object.freeze(['readCoffee', 'readRecipe', 'readTastings', 'compareGrind', 'proposeRecipe', 'applyProposal', 'prepareBrew', 'undoRevision']);
export const RECOVERY_MODEL_TOOLS = Object.freeze(RECOVERY_MODEL_TOOL_NAMES.map((name) => Object.freeze({ type: 'function', name, description: `Provider-neutral Coffee ${name} operation.`, parameters: Object.freeze({ type: 'object', properties: Object.freeze({ userId: { type: 'string' }, coffeeId: { type: 'string' }, expectedRevision: { type: 'integer' }, revisionId: { type: 'string' }, proposalId: { type: 'string' }, idempotencyKey: { type: 'string' }, method: { type: 'string' }, recipe: { type: 'object' }, notes: { type: 'object' }, beforeMicrons: { type: 'number' }, afterMicrons: { type: 'number' }, direction: { type: 'string' } }), additionalProperties: false }) })));

const CASES = JSON.parse(readFileSync(new URL('../fixtures/ruphus-eval/decision/cases.json', import.meta.url), 'utf8'));
const CASE_BY_ID = new Map(CASES.map((item) => [item.id, item]));
const CASE_ACTIONS = new Set(['read', 'diagnose', 'propose', 'clarify', 'refuse', 'insufficient-evidence']);

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

export function validateSubmitResult(value) {
  if (!object(value) || Object.keys(value).some((key) => !['reply', 'action', 'diagnosis', 'patch'].includes(key)) || !Object.hasOwn(value, 'diagnosis') || !Object.hasOwn(value, 'patch') || typeof value.reply !== 'string' || !value.reply.trim() || !CASE_ACTIONS.has(value.action)) throw new Error('semantic submit_result envelope is invalid');
  if (value.diagnosis !== undefined && value.diagnosis !== null && (!object(value.diagnosis) || Object.keys(value.diagnosis).some((key) => !['cause', 'confidence', 'uncertainty'].includes(key)) || ['cause', 'confidence', 'uncertainty'].some((key) => typeof value.diagnosis[key] !== 'string' || !value.diagnosis[key].trim()))) throw new Error('semantic diagnosis is invalid');
  const scalar = (candidate) => candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean' || (typeof candidate === 'number' && Number.isFinite(candidate));
  if (value.patch !== undefined && value.patch !== null && (!object(value.patch) || Object.keys(value.patch).some((key) => !['path', 'from', 'to'].includes(key)) || typeof value.patch.path !== 'string' || !value.patch.path.trim() || !Object.hasOwn(value.patch, 'from') || !Object.hasOwn(value.patch, 'to') || !scalar(value.patch.from) || !scalar(value.patch.to))) throw new Error('semantic patch is invalid');
  return immutableSnapshot(value);
}

export function buildRecoveryRequest(caseDefinition, { phase = 'screening' } = {}) {
  if (!caseDefinition || typeof caseDefinition.id !== 'string') throw new Error('frozen Coffee case is required');
  const base = createEvaluationRequest({ caseDefinition, phase: phase === 'finalist' ? 'finalist-decision' : 'qualification' });
  const evidencePayload = JSON.parse(base.input[1].content);
  const semanticContract = {
    required: ['reply', 'action'],
    action: [...CASE_ACTIONS],
    optional: { diagnosis: ['cause', 'confidence', 'uncertainty'], patch: ['path', 'from', 'to'] },
    rule: 'Use submit_result exactly once. Every listed field is semantic answer data, never approval, commit, receipt, mutation, or authority evidence.',
  };
  const finalist = phase === 'finalist';
  return immutableSnapshot({
    instructions: 'You are a Coffee assistant. Answer the user request and call submit_result exactly once. Return semantic answer data only; do not claim evaluator authority, approval, mutation, receipts, or physical outcomes.',
    input: [base.input[0], { role: 'user', content: JSON.stringify({ evidence: evidencePayload.evidence, outputContract: semanticContract }) }],
    tools: Object.freeze(finalist ? [...RECOVERY_MODEL_TOOLS, SUBMIT_RESULT_TOOL] : [SUBMIT_RESULT_TOOL]), ...(finalist ? {} : { toolChoice: { name: 'submit_result' } }), maxOutputTokens: Math.min(DEFAULT_LIMITS.outputTokens, 900), phase,
  });
}

export function buildRecoverySchedule({ runId, phase, caseIds, armIds = MODEL_ARMS.map((arm) => arm.id), repeats = 1 } = {}) {
  if (typeof runId !== 'string' || !runId || !['smoke', 'screening', 'finalist'].includes(phase) || !Array.isArray(caseIds) || !caseIds.length || !Number.isInteger(repeats) || repeats < 1) throw new Error('recovery schedule identity is invalid');
  if (!armIds.length || armIds.some((id) => !getArm(id))) throw new Error('recovery schedule requires exact canonical arms');
  return caseIds.flatMap((caseId) => Array.from({ length: repeats }, (_, index) => armIds.map((armId) => ({ attemptId: stableId('recovery-attempt', { runId, phase, armId, caseId, repeat: index + 1 }), runId, phase, armId, caseId, repeat: index + 1, cacheRegime: 'cold' }))).flat());
}

function allCases(caseIds) {
  const definitions = caseIds.map((id) => CASE_BY_ID.get(id));
  if (definitions.some((item) => !item)) throw new Error('recovery schedule contains unknown frozen case');
  return definitions;
}

export async function runRecoveryPhase({ adapters = {}, preflight, env = {}, endpoint = null, endpoints = null, retention, paidRun = true, manifest, runId, evaluationHash, artifactStore, schedule, toolsFor = null, requestFor = (entry) => buildRecoveryRequest(CASE_BY_ID.get(entry.caseId), { phase: entry.phase }), retry = { maxAttempts: 1 } } = {}) {
  if (!(artifactStore instanceof ImmutableArtifactStore)) throw new Error('recovery paid dispatch requires an immutable artifact store');
  if (!Array.isArray(schedule) || !schedule.length) throw new Error('recovery schedule is required');
  allCases([...new Set(schedule.map((entry) => entry.caseId))]);
  const gate = validateRunnerGates({ preflight, env, endpoint, endpoints, retention, paidRun, manifest, evaluationHash, artifactStore, phase: 'calibration' });
  if (!gate.ok) return immutableSnapshot({ ok: false, classification: 'insufficient-evidence', dispatched: false, errors: gate.errors, artifacts: [] });
  const lease = createRunLease({ runId, evaluationHash, artifactStore });
  await lease.acquire();
  const artifacts = [];
  const failures = [];
  let actualSpend = 0;
  try {
    const prior = await artifactStore.list({ runId });
    actualSpend = prior.reduce((sum, artifact) => sum + (artifact.telemetry || []).reduce((inner, turn) => inner + turn.cost, 0), 0);
    for (const entry of schedule) {
      const arm = getArm(entry.armId);
      const attemptId = entry.attemptId;
      if (!attemptId || !arm) throw new Error('recovery schedule attempt identity is invalid');
      const existing = await artifactStore.read(attemptId);
      if (existing.ok) { artifacts.push(existing.artifact); continue; }
      const request = requestFor(entry);
      const adapter = adapters[arm.provider];
      let acceptedResult = null;
      try {
        const artifact = await runAgentAttempt({ adapter, arm, request, attemptId, runId, evaluationHash, phase: entry.phase, caseId: entry.caseId, repeat: entry.repeat, maxTurns: entry.phase === 'finalist' ? 5 : 1, maxPhases: entry.phase === 'finalist' ? 2 : 1, artifactStore, retry, tools: toolsFor?.(entry) || null, onSubmitResult: (value) => { acceptedResult = validateSubmitResult(value); } , beforeRequest: ({ estimatedCost }) => {
          if (actualSpend + estimatedCost > RECOVERY_ADDITIONAL_CAP_USD + 1e-12) throw Object.assign(new Error('recovery additional provider cap would be exceeded'), { code: 'BUDGET_PRE_DISPATCH' });
        } });
        if (!acceptedResult) throw new Error('provider did not submit semantic result');
        artifacts.push(artifact);
        actualSpend += artifact.telemetry.reduce((sum, turn) => sum + turn.cost, 0);
      } catch (error) {
        const failure = immutableSnapshot({ attemptId, runId, evaluationHash, armId: arm.id, model: arm.model, provider: arm.provider, phase: entry.phase, caseId: entry.caseId, repeat: entry.repeat, status: 'failed', classification: error.classification || 'insufficient-evidence', error: { code: typeof error.code === 'string' ? error.code : 'RECOVERY_ATTEMPT_FAILED', status: Number.isInteger(error.status) ? error.status : null } });
        const storedFailure = await artifactStore.write(attemptId, failure).catch(() => null);
        failures.push({ attemptId, armId: arm.id, model: arm.model, provider: arm.provider, classification: failure.classification, code: failure.error.code, artifactChecksum: storedFailure?.checksum || null });
      }
    }
    return immutableSnapshot({ ok: failures.length === 0, classification: failures.length === 0 ? 'completed' : 'insufficient-evidence', dispatched: true, errors: failures.map((failure) => failure.code), failures, artifacts, spend: actualSpend, attemptCount: artifacts.length, evidenceHash: hashValue(artifacts.map((artifact) => artifact.checksum || artifact.attemptBinding)) });
  } finally { await lease.release(); }
}

export const RECOVERY_SCREEN_CASE_IDS = Object.freeze(['dec-001', 'dec-002', 'dec-013', 'dec-014', 'dec-029', 'dec-030', 'dec-037', 'dec-038', 'dec-049', 'dec-050']);
export const RECOVERY_FINALIST_SCENARIOS = Object.freeze([
  Object.freeze({ scenario: 'read-stats', caseId: 'dec-010' }),
  Object.freeze({ scenario: 'tasting-diagnosis', caseId: 'dec-013' }),
  Object.freeze({ scenario: 'recipe-proposal', caseId: 'dec-022' }),
  Object.freeze({ scenario: 'approval-bound-apply', caseId: 'dec-041' }),
  Object.freeze({ scenario: 'undo-stale-revision', caseId: 'dec-044' }),
  Object.freeze({ scenario: 'fellow-preparation-receipt', caseId: 'dec-050' }),
]);
export const RECOVERY_FINALIST_CASE_IDS = Object.freeze(RECOVERY_FINALIST_SCENARIOS.map(({ caseId }) => caseId));
export function buildFinalistScenarioSchedule({ runId, armId } = {}) {
  if (typeof runId !== 'string' || !runId || !getArm(armId)) throw new Error('finalist scenario schedule identity is invalid');
  return RECOVERY_FINALIST_SCENARIOS.flatMap(({ scenario, caseId }) => [1, 2].map((repeat) => ({ attemptId: stableId('recovery-attempt', { runId, phase: 'finalist', armId, caseId, repeat }), runId, phase: 'finalist', armId, caseId, repeat, scenario, cacheRegime: 'cold' })));
}
