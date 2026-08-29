import { runPreflight } from './capability-preflight.mjs';
import { createAgentRunner } from './agent-runner.mjs';
import { MODEL_ARMS } from './models.mjs';

/**
 * Entry point for the paid evaluation. Configuration is deliberately injected
 * by an attended, separately verified process; this module never reads or
 * prints credentials and has no production/Firebase route.
 */
export async function runEvaluation({ adapters = [], identity, expectedIdentity, env = process.env, retention, endpoint, endpoints = null, paidRun = false, manifest = null, runId, evaluationHash, artifactStore, schedule = null, dispatch = false, toolsFor = null, requestFor = null, retry = { maxAttempts: 1 } } = {}) {
  const preflight = await runPreflight({ adapters, identity, expectedIdentity, env });
  if (!preflight.ok) return { ok: false, classification: 'insufficient-evidence', stage: 'preflight', dispatched: false, errors: preflight.errors };
  if (!schedule) return { ok: false, classification: 'insufficient-evidence', stage: 'schedule', dispatched: false, errors: ['a sealed schedule is required before dispatch'] };
  const runner = createAgentRunner({ adapters: Object.fromEntries(MODEL_ARMS.map((arm) => [arm.provider, adapters.find((adapter) => adapter.provider === arm.provider)])), preflight, env, retention, endpoint, endpoints, paidRun, manifest, runId, evaluationHash, artifactStore });
  if (dispatch === true) return runner.runSchedule({ schedule, toolsFor, requestFor, retry });
  return { ok: true, classification: 'ready', dispatched: false, schedule, runner };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outcome = await runEvaluation();
  if (!outcome.ok) process.exitCode = 2;
}
