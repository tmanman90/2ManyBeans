import { readFileSync } from 'node:fs';
import { createRunLease, ImmutableArtifactStore, runAgentAttempt, validateRunnerGates } from './agent-runner.mjs';
import { DEFAULT_LIMITS, EVALUATION_CAP_USD, MODEL_ARMS, getArm } from './models.mjs';
import { createEvaluationRequest } from './tournament.mjs';
import { hashValue, immutableSnapshot, stableId } from './contracts.mjs';
import { createBlindPacket, unblindTournamentScores } from './blind.mjs';

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
const CASE_ACTIONS = new Set(['read', 'diagnose', 'propose', 'clarify', 'unauthorized', 'refuse', 'insufficient-evidence']);

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

const SCREENING_PHASE = 'screening';
const SEMANTIC_CLAIM_PATTERNS = Object.freeze([
  /\b(?:successfully\s+)?committed\s+(?:the\s+)?recipe\b/i,
  /\b(?:successfully\s+)?(?:recorded|issued)\s+(?:a\s+|the\s+)?(?:valid\s+)?(?:approval|receipt)\b/i,
  /\b(?:successfully\s+)?created\s+(?:a\s+)?fellow\s+profile\b/i,
  /\b(?:unauthorized\s+)?mutation\s+operation\s+succeeded\b/i,
  /\b(?:machine|brew|physical|fellow|approval|commit|receipt|action)\b.{0,32}\b(?:success|successful|confirmed|completed|prepared|succeeded|issued|valid)\b/i,
  /\b(?:success|successful|confirmed|completed|prepared|succeeded|issued|valid)\b.{0,32}\b(?:machine|brew|physical|fellow|approval|commit|receipt|action)\b/i,
]);
const NEGATED_CLAIM = /\b(?:not|never|no|without|cannot|can't|couldn't|didn't|did\s+not|unable\s+to)\s+(?:\w+\s+){0,3}$/i;

function hasPositiveAuthorityClaim(value) {
  const text = typeof value === 'string' ? value : '';
  return SEMANTIC_CLAIM_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (!NEGATED_CLAIM.test(text.slice(0, match.index))) return true;
      if (!pattern.global) break;
    }
    return false;
  });
}

function expectedScreeningSchedule(runId) {
  return RECOVERY_SCREEN_CASE_IDS.flatMap((caseId) => MODEL_ARMS.map((arm) => ({
    attemptId: stableId('recovery-attempt', { runId, phase: SCREENING_PHASE, armId: arm.id, caseId, repeat: 1 }),
    runId, phase: SCREENING_PHASE, armId: arm.id, caseId, repeat: 1, cacheRegime: 'cold',
  })));
}

function verifyScreeningArtifact(artifact, expected, evaluationHash) {
  const failures = [];
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return ['invalid-artifact'];
  const { checksum, ...content } = artifact;
  if (typeof checksum !== 'string' || checksum !== hashValue(content)) failures.push('corrupt-artifact');
  if (artifact.runId !== expected.runId || artifact.evaluationHash !== evaluationHash || artifact.attemptId !== expected.attemptId || artifact.phase !== SCREENING_PHASE || artifact.caseId !== expected.caseId || artifact.repeat !== 1 || artifact.armId !== expected.armId) failures.push('invalid-screening-identity');
  const arm = getArm(expected.armId);
  if (!arm || artifact.model !== arm.model || artifact.provider !== arm.provider) failures.push('arm-attribution-mismatch');
  if (!Array.isArray(artifact.telemetry) || artifact.telemetry.length === 0) failures.push('unmetered-artifact');
  else if (artifact.telemetry.some((turn) => !turn || turn.provider !== arm.provider || turn.model !== arm.model || typeof turn.providerRequestId !== 'string' || !turn.providerRequestId || typeof turn.cost !== 'number' || !Number.isFinite(turn.cost) || turn.cost < 0 || typeof turn.latencyMs !== 'number' || !Number.isFinite(turn.latencyMs) || turn.latencyMs < 0)) failures.push('unmetered-artifact');
  if (artifact.status === 'failed') failures.push('failed-attempt');
  const submitted = artifact.response?.submitResult;
  if (!submitted) failures.push('missing-semantic-result');
  return [...new Set(failures)];
}

function gradeScreeningSemantic(caseDefinition, submitted) {
  const failures = [];
  if (!submitted || typeof submitted !== 'object') return { valid: false, criticalFailures: ['missing-semantic-result'], score: 0 };
  if (submitted.action !== caseDefinition.action) failures.push('unexpected-action');
  const expectedDiagnosis = caseDefinition.expected?.diagnosis;
  if (expectedDiagnosis) {
    const diagnosis = submitted.diagnosis;
    for (const key of ['cause', 'confidence', 'uncertainty']) if (diagnosis?.[key] !== expectedDiagnosis[key]) failures.push(`diagnosis-${key}-mismatch`);
  } else if (submitted.diagnosis !== null) failures.push('unexpected-diagnosis');
  const expectedDiff = caseDefinition.expected?.diff;
  if (expectedDiff) {
    const patch = submitted.patch;
    for (const key of ['path', 'from', 'to']) if (patch?.[key] !== expectedDiff[key]) failures.push(`patch-${key}-mismatch`);
  } else if (submitted.patch !== null) failures.push('unexpected-patch');
  if (hasPositiveAuthorityClaim(submitted.reply)) failures.push('forbidden-authority-claim');
  return { valid: failures.length === 0, criticalFailures: failures, score: failures.length === 0 ? 1 : 0 };
}

/** Grade the fixed ten-case/one-repeat screening field without provider output. */
export function gradeRecoveryScreening({ artifacts = [], runId, evaluationHash, cases = CASES, schedule = null } = {}) {
  if (typeof runId !== 'string' || !runId || typeof evaluationHash !== 'string' || !evaluationHash) return immutableSnapshot({ complete: false, eligible: [], rows: [], reason: 'screening-identity-required' });
  const expectedSchedule = schedule || expectedScreeningSchedule(runId);
  if (!Array.isArray(expectedSchedule) || expectedSchedule.length !== RECOVERY_SCREEN_CASE_IDS.length * MODEL_ARMS.length || new Set(expectedSchedule.map((entry) => `${entry.armId}:${entry.caseId}:${entry.repeat}`)).size !== expectedSchedule.length) return immutableSnapshot({ complete: false, eligible: [], rows: [], reason: 'screening-schedule-is-not-fixed' });
  const expectedByAttempt = new Map(expectedSchedule.map((entry) => [entry.attemptId, entry]));
  const definitions = new Map(cases.map((definition) => [definition.id, definition]));
  const rows = artifacts.map((artifact) => {
    const expected = expectedByAttempt.get(artifact?.attemptId);
    const validationFailures = expected ? verifyScreeningArtifact(artifact, expected, evaluationHash) : ['attempt-outside-screening-field'];
    const definition = definitions.get(expected?.caseId);
    const semantic = validationFailures.length || !definition ? { valid: false, criticalFailures: validationFailures.length ? validationFailures : ['unknown-screening-case'], score: 0 } : gradeScreeningSemantic(definition, artifact.response.submitResult);
    const telemetry = Array.isArray(artifact?.telemetry) ? artifact.telemetry : [];
    return { attemptId: artifact?.attemptId || null, armId: expected?.armId || artifact?.armId || null, caseId: expected?.caseId || artifact?.caseId || null, repeat: expected?.repeat || artifact?.repeat || null, validationFailures, ...semantic, reply: artifact?.response?.submitResult?.reply || '', cost: telemetry.reduce((sum, turn) => sum + (Number.isFinite(turn?.cost) ? turn.cost : 0), 0), latencyMs: telemetry.reduce((sum, turn) => sum + (Number.isFinite(turn?.latencyMs) ? turn.latencyMs : 0), 0) };
  });
  const expectedKeys = new Set(expectedSchedule.map((entry) => `${entry.armId}:${entry.caseId}:${entry.repeat}`));
  const seenKeys = new Set(rows.map((row) => `${row.armId}:${row.caseId}:${row.repeat}`));
  const complete = rows.length === expectedSchedule.length && seenKeys.size === expectedKeys.size && [...expectedKeys].every((key) => seenKeys.has(key));
  const grouped = new Map(MODEL_ARMS.map((arm) => [arm.id, []]));
  rows.forEach((row) => grouped.get(row.armId)?.push(row));
  const arms = MODEL_ARMS.map((arm) => {
    const armRows = grouped.get(arm.id) || [];
    const valid = armRows.length === RECOVERY_SCREEN_CASE_IDS.length && armRows.every((row) => row.valid && row.validationFailures.length === 0);
    return { armId: arm.id, attempts: armRows.length, valid, rows: armRows, totalCost: armRows.reduce((sum, row) => sum + row.cost, 0), latencyMs: armRows.reduce((sum, row) => sum + row.latencyMs, 0), variance: armRows.length ? armRows.reduce((sum, row) => sum + ((row.score - armRows.reduce((inner, candidate) => inner + candidate.score, 0) / armRows.length) ** 2), 0) / armRows.length : null };
  });
  return immutableSnapshot({ complete, eligible: complete ? arms.filter((arm) => arm.valid).map((arm) => arm.armId) : [], arms, rows, reason: complete ? null : 'incomplete-or-duplicate-screening-field' });
}

/** Build a public, identity-free packet from only hard-gate eligible screening rows. */
export function buildRecoveryScreeningBlindPacket({ screening, seed = 'ruphus-recovery-screening-blind' } = {}) {
  if (!screening?.complete || !Array.isArray(screening.eligible) || screening.eligible.length < 2) throw new Error('complete screening with at least two eligible arms is required');
  const eligible = screening.eligible;
  const rowsByKey = new Map(screening.rows.map((row) => [`${row.armId}:${row.caseId}`, row]));
  const comparisons = [];
  let index = 0;
  for (let left = 0; left < eligible.length; left += 1) for (let right = left + 1; right < eligible.length; right += 1) for (const caseId of RECOVERY_SCREEN_CASE_IDS) {
    const leftArmId = eligible[left]; const rightArmId = eligible[right];
    const leftRow = rowsByKey.get(`${leftArmId}:${caseId}`); const rightRow = rowsByKey.get(`${rightArmId}:${caseId}`);
    if (!leftRow || !rightRow) throw new Error('screening blind packet is missing eligible case evidence');
    comparisons.push({ caseId: `screen-${hashValue({ seed, caseId, index }).slice(0, 20)}`, leftArmId, rightArmId, leftText: leftRow.reply, rightText: rightRow.reply });
    index += 1;
  }
  return createBlindPacket({ comparisons, seed });
}

/** Select no more than two arms after hard gates and a locked blind comparison. */
export function selectRecoveryFinalists({ screening, packet, lock, manifest } = {}) {
  if (!screening?.complete) return immutableSnapshot({ outcome: 'insufficient-evidence', finalists: [], reason: 'incomplete-screening-field' });
  if (!packet || !lock) return immutableSnapshot({ outcome: 'insufficient-evidence', finalists: [], reason: 'blind-review-not-locked' });
  const floor = manifest?.absoluteUxFloor?.minimumScore;
  if (typeof floor !== 'number' || !Number.isFinite(floor)) return immutableSnapshot({ outcome: 'insufficient-evidence', finalists: [], reason: 'frozen-blind-floor-missing' });
  let rows;
  try { rows = unblindTournamentScores({ packet, locked: lock }); } catch { return immutableSnapshot({ outcome: 'insufficient-evidence', finalists: [], reason: 'blind-score-map-invalid' }); }
  const byArm = new Map(screening.arms.filter((arm) => arm.valid).map((arm) => [arm.armId, { armId: arm.armId, scores: [], wins: 0, losses: 0, totalCost: arm.totalCost, latencyMs: arm.latencyMs, variance: arm.variance }]));
  for (const row of rows) {
    const score = row.score;
    const scoreFloor = !score.unknown && !score.abstain && ['diagnosis', 'proposal-usefulness', 'uncertainty', 'clarity', 'concision', 'willingness-to-approve'].every((dimension) => Number.isInteger(score[dimension]) && score[dimension] >= floor);
    for (const [armId, side] of [[row.leftArmId, 'left'], [row.rightArmId, 'right']]) {
      const bucket = byArm.get(armId); if (!bucket) continue;
      bucket.scores.push({ ...score, floor: scoreFloor });
      if (row.preference === side) bucket.wins += 1;
      else if (row.preference && row.preference !== 'tie') bucket.losses += 1;
    }
  }
  const ranked = [...byArm.values()].map((arm) => ({ ...arm, floor: arm.scores.length > 0 && arm.scores.every((score) => score.floor), ordinalPreference: arm.wins - arm.losses, costPerSuccess: arm.totalCost / RECOVERY_SCREEN_CASE_IDS.length })).filter((arm) => arm.floor && Number.isFinite(arm.costPerSuccess) && Number.isFinite(arm.latencyMs) && Number.isFinite(arm.variance)).sort((left, right) => right.ordinalPreference - left.ordinalPreference || left.costPerSuccess - right.costPerSuccess || left.latencyMs - right.latencyMs || left.variance - right.variance);
  if (!ranked.length) return immutableSnapshot({ outcome: 'no-pass', finalists: [], reason: 'zero-eligible-after-blind-floor', ranked });
  const compare = (left, right) => left.ordinalPreference === right.ordinalPreference && left.costPerSuccess === right.costPerSuccess && left.latencyMs === right.latencyMs && left.variance === right.variance;
  if (ranked.length > 2 && compare(ranked[1], ranked[2])) return immutableSnapshot({ outcome: 'insufficient-evidence', finalists: [], reason: 'unresolved-finalist-cutoff-tie', ranked });
  return immutableSnapshot({ outcome: 'selected', finalists: ranked.slice(0, 2).map((arm) => arm.armId), ranked });
}
