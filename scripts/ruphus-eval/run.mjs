import { runPreflight } from './capability-preflight.mjs';
import { createAgentRunner, sealCalibrationManifest } from './agent-runner.mjs';
import { MODEL_ARMS } from './models.mjs';
import { parseCandidateResponse } from './tournament.mjs';

/**
 * Entry point for the paid evaluation. Configuration is deliberately injected
 * by an attended, separately verified process; this module never reads or
 * prints credentials and has no production/Firebase route.
 */
export async function runEvaluation({ adapters = [], identity, expectedIdentity, env = process.env, retention, endpoint, endpoints = null, paidRun = false, manifest = null, runId, evaluationHash, artifactStore, schedule = null, schedules = null, sealedAt = null, finalistArmIds = null, qualificationBlindLock = null, calibrationAcceptance = null, dispatch = false, toolsFor = null, requestFor = null, retry = { maxAttempts: 1 } } = {}) {
  const preflight = await runPreflight({ adapters, identity, expectedIdentity, env });
  if (!preflight.ok) return { ok: false, classification: 'insufficient-evidence', stage: 'preflight', dispatched: false, errors: preflight.errors };
  if (dispatch === true && schedules) return runFrozenEvaluation({ adapters, identity, expectedIdentity, env, retention, endpoint, endpoints, paidRun, manifest, runId, evaluationHash, artifactStore, schedules, sealedAt, finalistArmIds, qualificationBlindLock, calibrationAcceptance, toolsFor, requestFor, retry, preflight });
  if (!schedule) return { ok: false, classification: 'insufficient-evidence', stage: 'schedule', dispatched: false, errors: ['a sealed schedule is required before dispatch'] };
  const runner = createAgentRunner({ adapters: Object.fromEntries(MODEL_ARMS.map((arm) => [arm.provider, adapters.find((adapter) => adapter.provider === arm.provider)])), preflight, env, retention, endpoint, endpoints, paidRun, manifest, runId, evaluationHash, artifactStore });
  if (dispatch === true) return runner.runSchedule({ schedule, toolsFor, requestFor, retry });
  return { ok: true, classification: 'ready', dispatched: false, schedule, runner };
}

function phaseSchedule(manifest, phase, armIds = MODEL_ARMS.map((arm) => arm.id)) {
  const cases = manifest?.partitions?.[phase === 'finalist-decision' ? 'finalistDecision' : phase];
  const repeats = phase === 'calibration' || phase === 'tool-canary' ? 1 : manifest?.schedule?.[phase === 'finalist-decision' ? 'finalistDecisionRepeats' : 'qualificationRepeats'];
  if (!Array.isArray(cases) || !Number.isInteger(repeats) || repeats < 1) throw new Error(`frozen ${phase} partition is required`);
  return cases.flatMap((caseId) => Array.from({ length: repeats }, (_, index) => armIds.map((armId) => ({ armId, phase, caseId, repeat: index + 1, cacheRegime: 'cold' }))).flat());
}

/**
 * Execute the frozen paid phases in order using injected adapters and a real
 * immutable artifact store. The coordinator deliberately stops at each blind
 * review checkpoint; it never fabricates human scores or grading evidence.
 */
export async function runFrozenEvaluation({
  adapters = [], identity, expectedIdentity, env = process.env, retention,
  endpoint, endpoints = null, paidRun = false, manifest, runId, evaluationHash,
  artifactStore, schedules = null, sealedAt, finalistArmIds = null,
  qualificationBlindLock = null, toolsFor = null, requestFor = null,
  retry = { maxAttempts: 1 }, calibrationAcceptance = null, preflight = null,
} = {}) {
  if (!manifest || typeof sealedAt !== 'string' || !sealedAt) return { ok: false, classification: 'insufficient-evidence', stage: 'schedule', dispatched: false, errors: ['sealed manifest and fixed calibration seal time are required'] };
  const checkedPreflight = preflight || await runPreflight({ adapters, identity, expectedIdentity, env });
  if (!checkedPreflight.ok) return { ok: false, classification: 'insufficient-evidence', stage: 'preflight', dispatched: false, errors: checkedPreflight.errors };
  const adapterMap = Object.fromEntries(MODEL_ARMS.map((arm) => [arm.provider, adapters.find((adapter) => adapter.provider === arm.provider)]));
  const scheduleFor = (phase, armIds) => schedules?.[phase] || phaseSchedule(manifest, phase, armIds);
  const execute = async (phase, phaseManifest, phaseHash, schedule) => {
    const runner = createAgentRunner({ adapters: adapterMap, preflight: checkedPreflight, env, retention, endpoint, endpoints, paidRun, manifest: phaseManifest, runId, evaluationHash: phaseHash, artifactStore });
    return runner.runSchedule({ schedule, toolsFor, requestFor, retry });
  };
  const calibrationSchedule = scheduleFor('calibration');
  const calibration = await execute('calibration', manifest, evaluationHash || manifest.evaluationHash || manifest.hashes?.evaluationHash, calibrationSchedule);
  if (!calibration.ok) return { ok: false, classification: calibration.classification, stage: 'calibration', dispatched: calibration.dispatched, calibration, preflight: checkedPreflight };
  let calibrationAccepted = true;
  try {
    if (calibration.artifacts.length !== calibrationSchedule.length) calibrationAccepted = false;
    for (const artifact of calibration.artifacts) parseCandidateResponse(artifact.response?.text);
    if (calibrationAcceptance && calibrationAcceptance({ artifacts: calibration.artifacts, schedule: calibrationSchedule }) !== true) calibrationAccepted = false;
  } catch { calibrationAccepted = false; }
  if (!calibrationAccepted) return { ok: false, classification: 'insufficient-evidence', stage: 'calibration-acceptance', dispatched: true, errors: ['calibration response contract was not accepted; decision phases remain sealed'], calibration, preflight: checkedPreflight };
  const sealedCalibrationArtifacts = calibration.artifacts.map((artifact, index) => ({ ...artifact, phase: 'calibration', caseId: calibrationSchedule[index].caseId, repeat: calibrationSchedule[index].repeat }));
  const sealedManifest = sealCalibrationManifest({ manifest, calibrationArtifacts: sealedCalibrationArtifacts, sealedAt });
  const canarySchedule = scheduleFor('tool-canary');
  const canary = await execute('tool-canary', sealedManifest, sealedManifest.evaluationHash, canarySchedule);
  if (!canary.ok) return { ok: false, classification: canary.classification, stage: 'tool-canary', dispatched: canary.dispatched, calibration, sealedManifest, canary, preflight: checkedPreflight };
  const qualificationSchedule = scheduleFor('qualification');
  const qualification = await execute('qualification', sealedManifest, sealedManifest.evaluationHash, qualificationSchedule);
  const blindReview = { status: 'pending', phase: 'qualification', required: true, attemptIds: qualification.artifacts.map((artifact) => artifact.attemptId), resumable: true };
  if (!qualification.ok) return { ok: false, classification: qualification.classification, stage: 'qualification', dispatched: qualification.dispatched, calibration, sealedManifest, canary, qualification, blindReview, preflight: checkedPreflight };
  if (!Array.isArray(finalistArmIds) || finalistArmIds.length === 0 || !qualificationBlindLock) return { ok: true, classification: 'pending-blind-review', stage: 'qualification-blind-review', dispatched: true, calibration, sealedManifest, canary, qualification, blindReview, preflight: checkedPreflight };
  const finalistSchedule = scheduleFor('finalist-decision', finalistArmIds);
  const finalist = await execute('finalist-decision', sealedManifest, sealedManifest.evaluationHash, finalistSchedule);
  const finalistBlindReview = { status: 'pending', phase: 'finalist-decision', required: true, attemptIds: finalist.artifacts.map((artifact) => artifact.attemptId), resumable: true };
  return { ok: finalist.ok, classification: finalist.ok ? 'pending-blind-review' : finalist.classification, stage: 'finalist-blind-review', dispatched: finalist.dispatched, calibration, sealedManifest, canary, qualification, blindReview, finalist, finalistBlindReview, preflight: checkedPreflight };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outcome = await runEvaluation();
  if (!outcome.ok) process.exitCode = 2;
}
