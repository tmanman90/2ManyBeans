import { hashValue, immutableSnapshot, stableId } from './contracts.mjs';
import { MODEL_ARMS, getArm } from './models.mjs';
import { gradeCase } from './cases.mjs';
import { lockTournamentScores, unblindTournamentScores } from './blind.mjs';

export const REPORT_VERSION = 'ruphus-u6-report-v1';
export const REPORT_OUTCOMES = Object.freeze(['selected', 'insufficient-evidence', 'pending-blind-review', 'no-pass']);
const SENSITIVE_KEYS = /^(?:prompt|userprompt|messages?|input|outputitems?|rawcontent|content|text|reasoning|thinking|headers?|authorization|secret|api[_-]?key|credential|token)$/i;
const ARM_IDS = Object.freeze(MODEL_ARMS.map((arm) => arm.id));

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }

function sanitizedValue(value, key = '') {
  if (SENSITIVE_KEYS.test(key)) return undefined;
  if (Array.isArray(value)) return value.map((child) => sanitizedValue(child)).filter((child) => child !== undefined);
  if (object(value)) {
    const result = {};
    for (const [childKey, child] of Object.entries(value)) {
      const safe = sanitizedValue(child, childKey);
      if (safe !== undefined) result[childKey] = safe;
    }
    return result;
  }
  if (typeof value === 'string' && value.length > 2000) return value.slice(0, 2000);
  return value;
}

function verifyChecksum(artifact) {
  if (!object(artifact)) return { ok: false, reason: 'invalid-artifact' };
  if (typeof artifact.checksum !== 'string' || !artifact.checksum) return { ok: false, reason: 'unverified-artifact' };
  const { checksum, ...content } = artifact;
  return checksum === hashValue(content) ? { ok: true, checksum } : { ok: false, reason: 'corrupt-artifact' };
}

function usageFor(artifact, arm) {
  if (!Array.isArray(artifact.telemetry) || artifact.telemetry.length === 0) return { ok: false, reason: 'unmetered-artifact' };
  const turns = [];
  for (const turn of artifact.telemetry) {
    if (!object(turn) || turn.provider !== arm.provider || turn.model !== arm.model || typeof turn.providerRequestId !== 'string' || !turn.providerRequestId || !object(turn.usage) || !finite(turn.usage.inputTokens) || !finite(turn.usage.outputTokens) || !finite(turn.cost) || turn.cost < 0 || !finite(turn.retryAttempts) || turn.retryAttempts < 1) return { ok: false, reason: 'unmetered-artifact' };
    turns.push({ phase: turn.phase, providerRequestId: turn.providerRequestId, responseId: turn.responseId || null, usage: sanitizedValue(turn.usage), cost: turn.cost, retryAttempts: turn.retryAttempts, retryHistory: sanitizedValue(turn.retryHistory || []), responseHash: turn.responseHash, artifactChecksum: turn.artifactChecksum });
  }
  return { ok: true, turns, totalCost: turns.reduce((sum, turn) => sum + turn.cost, 0), retryCount: turns.reduce((sum, turn) => sum + turn.retryAttempts - 1, 0) };
}

function expectedKeys(manifest) {
  const cases = manifest?.partitions?.qualification;
  const repeats = manifest?.schedule?.qualificationRepeats;
  if (!Array.isArray(cases) || !Number.isInteger(repeats) || repeats < 1) return null;
  return new Set(ARM_IDS.flatMap((armId) => cases.flatMap((caseId) => Array.from({ length: repeats }, (_, index) => `${armId}:${caseId}:${index + 1}`))));
}

function withScheduleIdentity(artifact, schedule = []) {
  if (!object(artifact) || !Array.isArray(schedule)) return artifact;
  const direct = schedule.find((entry) => entry?.attemptId === artifact.attemptId);
  const derived = direct || schedule.find((entry) => entry?.armId === artifact.armId && stableId('u5-attempt', { runId: artifact.runId, evaluationHash: artifact.evaluationHash, armId: entry.armId, caseId: entry.caseId, repeat: entry.repeat }) === artifact.attemptId);
  if (!derived) return artifact;
  return { ...derived, ...artifact, phase: artifact.phase || derived.phase, caseId: artifact.caseId || derived.caseId, repeat: artifact.repeat || derived.repeat };
}

function actualFrom(artifact) {
  return artifact?.actual || artifact?.grading || artifact?.evidence || artifact?.response?.actual || null;
}

export function validateAttemptArtifact(artifact, { manifest = null, schedule = [] } = {}) {
  artifact = withScheduleIdentity(artifact, schedule);
  const failures = [];
  const checksum = verifyChecksum(artifact);
  if (!checksum.ok) failures.push(checksum.reason);
  if (!object(artifact) || typeof artifact.attemptId !== 'string' || !artifact.attemptId || typeof artifact.runId !== 'string' || !artifact.runId || typeof artifact.evaluationHash !== 'string' || !artifact.evaluationHash || typeof artifact.armId !== 'string' || !getArm(artifact.armId) || typeof artifact.caseId !== 'string' || !artifact.caseId || !Number.isInteger(artifact.repeat) || artifact.repeat < 1 || artifact.phase !== 'qualification') failures.push('invalid-attempt-identity');
  const manifestHash = manifest?.evaluationHash || manifest?.hashes?.evaluationHash;
  if (manifestHash && artifact.evaluationHash !== manifestHash) failures.push('evaluation-hash-mismatch');
  const arm = getArm(artifact?.armId);
  if (arm && (artifact.model !== arm.model || artifact.provider !== arm.provider)) failures.push('arm-attribution-mismatch');
  const expected = expectedKeys(manifest);
  if (expected && !expected.has(`${artifact.armId}:${artifact.caseId}:${artifact.repeat}`)) failures.push('attempt-outside-frozen-denominator');
  const usage = object(artifact) && getArm(artifact.armId) ? usageFor(artifact, getArm(artifact.armId)) : { ok: false, reason: 'unmetered-artifact' };
  if (!usage.ok) failures.push(usage.reason);
  if (object(artifact) && artifact.status === 'failed') failures.push('failed-attempt');
  return immutableSnapshot({ valid: failures.length === 0, failures: [...new Set(failures)], checksum: checksum.checksum || null, usage: usage.ok ? usage : null });
}

export function gradeAttempt(artifact, { cases = [], manifest = null, schedule = [] } = {}) {
  artifact = withScheduleIdentity(artifact, schedule);
  const validation = validateAttemptArtifact(artifact, { manifest, schedule });
  const definition = cases.find((candidate) => candidate.id === artifact?.caseId);
  const actual = actualFrom(artifact);
  // Some adapters retain the canonical recall record under `record`, while
  // case graders consume its fields directly. Preserve both representations
  // and grade the same deterministic evidence.
  const gradeActual = object(actual?.record) ? { ...actual, ...actual.record } : actual;
  const grade = definition && actual ? gradeCase(definition, gradeActual) : { valid: false, hardGate: false, criticalFailures: ['missing-grading-evidence'], score: 0, caseId: artifact?.caseId || null };
  const failures = [...validation.failures, ...(grade.criticalFailures || [])];
  return immutableSnapshot({ attemptId: artifact?.attemptId || null, armId: artifact?.armId || null, caseId: artifact?.caseId || null, repeat: artifact?.repeat ?? null, validation, grade, eligible: validation.valid && grade.valid, criticalFailure: failures.length > 0, cost: validation.usage?.totalCost ?? null, evidenceTier: artifact?.evidenceTier || 'real-provider' });
}

function blindMetrics({ packet, locked } = {}) {
  if (!packet || !locked) return { status: 'pending-blind-review', rows: [], byArm: new Map() };
  let rows;
  try { rows = unblindTournamentScores({ packet, locked }); } catch { return { status: 'pending-blind-review', rows: [], byArm: new Map() }; }
  const byArm = new Map();
  for (const row of rows) {
    for (const [armId, side] of [[row.leftArmId, 'left'], [row.rightArmId, 'right']]) {
      if (!armId || !getArm(armId)) continue;
      const bucket = byArm.get(armId) || { scores: [], wins: 0, losses: 0, unknown: false };
      bucket.scores.push(row.score);
      bucket.unknown ||= row.score.unknown === true || row.score.abstain === true;
      const preference = row.score.preference;
      if (preference === side) bucket.wins += 1;
      else if (preference && preference !== 'tie' && preference !== side) bucket.losses += 1;
      byArm.set(armId, bucket);
    }
  }
  return { status: 'locked', rows, byArm };
}

function scoreSummary(bucket, minimumScore) {
  const dimensions = ['diagnosis', 'proposal-usefulness', 'uncertainty', 'clarity', 'concision', 'willingness-to-approve'];
  if (!bucket || !bucket.scores.length || bucket.unknown) return { floor: false, average: null, wins: bucket?.wins || 0, losses: bucket?.losses || 0, variance: null };
  const means = Object.fromEntries(dimensions.map((dimension) => [dimension, bucket.scores.reduce((sum, score) => sum + score[dimension], 0) / bucket.scores.length]));
  const values = bucket.scores.map((score) => dimensions.reduce((sum, dimension) => sum + score[dimension], 0) / dimensions.length);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length;
  return { floor: dimensions.every((dimension) => means[dimension] >= minimumScore), average, wins: bucket.wins, losses: bucket.losses, variance };
}

function compareSummary(left, right) {
  for (const field of ['wins', 'average']) if (left[field] !== right[field]) return right[field] - left[field];
  // Lower variance is the preregistered repeat-quality tie-break.
  if (left.variance !== right.variance) return left.variance - right.variance;
  return 0;
}

/** Build the deterministic U6 report. No report can rank a partial field. */
export function buildTournamentReport({ artifacts = [], cases = [], manifest, schedule = [], blindPacket = null, blindLock = null, baseline = null } = {}) {
  if (!manifest || manifest.status !== 'calibrated-sealed') return immutableSnapshot({ version: REPORT_VERSION, outcome: 'insufficient-evidence', reason: 'sealed-manifest-required', finalists: [], arms: [], artifacts: [] });
  const expected = expectedKeys(manifest);
  const graded = Array.isArray(artifacts) ? artifacts.map((artifact) => gradeAttempt(artifact, { cases, manifest, schedule })) : [];
  const seen = new Set(graded.map((item) => `${item.armId}:${item.caseId}:${item.repeat}`));
  const fieldComplete = expected && seen.size === expected.size && [...expected].every((key) => seen.has(key)) && graded.length === expected.size;
  const grouped = new Map(ARM_IDS.map((id) => [id, []]));
  graded.forEach((item) => grouped.get(item.armId)?.push(item));
  const arms = ARM_IDS.map((armId) => {
    const rows = grouped.get(armId) || [];
    const criticalFailures = [...new Set(rows.flatMap((row) => row.grade.criticalFailures || row.validation.failures || []))];
    const totalCost = rows.every((row) => finite(row.cost)) ? rows.reduce((sum, row) => sum + row.cost, 0) : null;
    const scores = rows.filter((row) => row.grade.valid).map((row) => row.grade.score);
    const averageScore = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
    const variance = scores.length ? scores.reduce((sum, score) => sum + ((score - averageScore) ** 2), 0) / scores.length : null;
    const tiers = [...new Set(rows.map((row) => row.evidenceTier))];
    return { armId, attempts: rows.length, allHardGates: rows.length > 0 && rows.every((row) => row.eligible), criticalFailures, totalCost, averageScore, variance, evidenceTier: tiers.length === 1 ? tiers[0] : tiers.length ? 'mixed' : 'missing' };
  });
  if (!fieldComplete) return immutableSnapshot({ version: REPORT_VERSION, outcome: 'insufficient-evidence', reason: 'incomplete-or-invalid-six-arm-field', finalists: [], arms, graded, baseline: baseline ? { ...baseline, rankingEligible: false } : null });
  if (graded.some((row) => row.validation.failures.length > 0)) return immutableSnapshot({ version: REPORT_VERSION, outcome: 'insufficient-evidence', reason: 'invalid-or-unmetered-artifact', finalists: [], arms, graded, baseline: baseline ? { ...baseline, rankingEligible: false } : null });
  if (arms.some((arm) => arm.criticalFailures.length || !arm.allHardGates || arm.totalCost == null)) return immutableSnapshot({ version: REPORT_VERSION, outcome: 'no-pass', reason: 'critical-failure-or-hard-gate-veto', finalists: [], arms, graded, baseline: baseline ? { ...baseline, rankingEligible: false } : null });
  const blind = blindMetrics({ packet: blindPacket, locked: blindLock });
  if (blind.status !== 'locked') return immutableSnapshot({ version: REPORT_VERSION, outcome: 'pending-blind-review', reason: 'blind-scores-not-locked', finalists: [], arms, graded, baseline: baseline ? { ...baseline, rankingEligible: false } : null });
  const floor = manifest.absoluteUxFloor?.minimumScore;
  if (!finite(floor)) return immutableSnapshot({ version: REPORT_VERSION, outcome: 'insufficient-evidence', reason: 'frozen-blind-floor-missing', finalists: [], arms, graded });
  const ranked = arms.map((arm) => ({ ...arm, blind: scoreSummary(blind.byArm.get(arm.armId), floor) }));
  const eligible = ranked.filter((arm) => arm.blind.floor);
  if (!eligible.length) return immutableSnapshot({ version: REPORT_VERSION, outcome: 'no-pass', reason: 'zero-eligible-after-blind-floor', finalists: [], arms: ranked, graded });
  eligible.sort((left, right) => compareSummary(left.blind, right.blind) || ((left.totalCost / left.attempts) - (right.totalCost / right.attempts)) || ((left.armId > right.armId) - (left.armId < right.armId)));
  if (eligible.length > 2 && compareSummary(eligible[1].blind, eligible[2].blind) === 0 && eligible[1].totalCost / eligible[1].attempts === eligible[2].totalCost / eligible[2].attempts) return immutableSnapshot({ version: REPORT_VERSION, outcome: 'insufficient-evidence', reason: 'unresolved-finalist-cutoff-tie', finalists: [], arms: ranked, graded });
  const finalists = eligible.slice(0, 2).map((arm) => arm.armId);
  return immutableSnapshot({ version: REPORT_VERSION, outcome: 'selected', reason: 'gate-first-selection', finalists, arms: ranked, graded, blind: { status: 'locked', rows: blind.rows }, baseline: baseline ? { ...baseline, rankingEligible: false } : null });
}

/** Produce the committed JSONL-safe projection; provider content never enters it. */
export function sanitizeAttemptArtifact(artifact, { grade = null, schedule = [] } = {}) {
  artifact = withScheduleIdentity(artifact, schedule);
  const validation = validateAttemptArtifact(artifact, { schedule });
  if (!validation.checksum) throw new Error('sanitization requires a checksum-verified artifact');
  const usage = validation.usage;
  const safe = {
    type: 'sanitized-attempt', version: 1,
    attemptId: artifact.attemptId, runId: artifact.runId, evaluationHash: artifact.evaluationHash,
    armId: artifact.armId, model: artifact.model, provider: artifact.provider,
    phase: artifact.phase, caseId: artifact.caseId, repeat: artifact.repeat,
    evidenceTier: artifact.evidenceTier || 'real-provider',
    status: artifact.status || 'completed', outcome: grade?.grade?.valid === true ? 'valid' : grade?.grade?.criticalFailures?.length ? 'excluded' : 'ungraded',
    gradingInput: sanitizedValue(artifact.gradingInput || artifact.actual || artifact.grading || null),
    state: sanitizedValue(artifact.state || artifact.canonicalState || null),
    toolTrace: sanitizedValue(artifact.toolTrace || artifact.toolRequests || []),
    usage: usage ? { turns: usage.turns, totalCost: usage.totalCost, retryCount: usage.retryCount } : null,
    grade: grade ? { valid: grade.grade.valid, hardGate: grade.grade.hardGate, criticalFailures: grade.grade.criticalFailures || [], score: grade.grade.score ?? null } : null,
    rawChecksum: validation.checksum,
  };
  return immutableSnapshot({ ...safe, sanitizedChecksum: hashValue(safe) });
}

export function rebuildSanitizedProjection({ artifacts = [], cases = [], manifest, schedule = [] } = {}) {
  const graded = artifacts.map((artifact) => gradeAttempt(artifact, { cases, manifest, schedule }));
  const byId = new Map(artifacts.map((artifact) => [artifact.attemptId, artifact]));
  const rows = graded.map((grade) => sanitizeAttemptArtifact(withScheduleIdentity(byId.get(grade.attemptId), schedule), { grade, schedule })).sort((left, right) => left.attemptId.localeCompare(right.attemptId));
  return immutableSnapshot({ version: 1, evaluationHash: manifest?.evaluationHash || manifest?.hashes?.evaluationHash || null, rows, projectionHash: hashValue(rows), jsonl: rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '') });
}

export const buildReport = buildTournamentReport;
export const sanitizeAttempt = sanitizeAttemptArtifact;
export const rebuildReport = rebuildSanitizedProjection;
export const sanitizeAttempts = rebuildSanitizedProjection;
export const buildU6Report = buildTournamentReport;
export const selectFinalists = buildTournamentReport;
