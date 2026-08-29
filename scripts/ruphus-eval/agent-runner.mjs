import { link, mkdir, open, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { priceUsage } from '../../api/_lib/modelPricing.js';
import { checkEgress, checkEnvironment, validatePreflight } from './capability-preflight.mjs';
import { APPROVED_DISPATCH_RESERVATION_USD, DEFAULT_LIMITS, EVALUATION_CAP_USD, MODEL_ARMS, getArm, validateLimits } from './models.mjs';
import { hashValue, immutableSnapshot, stableId } from './contracts.mjs';

export const RETRYABLE_STATUS_CODES = Object.freeze(new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]));
export const RETRYABLE_ERROR_CODES = Object.freeze(new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT']));
const ACTIVE_LEASES = new Map();

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const EVALUATION_ENV_ALLOWLIST = /^(OPENAI_API_KEY|ANTHROPIC_API_KEY|RUPHUS_EVAL_[A-Z0-9_]+|NODE_ENV|PATH|TZ|LANG|LC_[A-Z_]+)$/;

export function validateEvaluationEnvironment(env = {}) {
  const base = checkEnvironment(env);
  const unexpected = Object.keys(env).filter((key) => !EVALUATION_ENV_ALLOWLIST.test(key));
  return { ok: base.ok && unexpected.length === 0, forbidden: [...base.forbidden, ...unexpected.filter((key) => !base.forbidden.includes(key))] };
}

export function sealCalibrationManifest({ manifest, calibrationArtifacts, sealedAt } = {}) {
  if (!isObject(manifest) || !Array.isArray(calibrationArtifacts) || calibrationArtifacts.length === 0 || typeof sealedAt !== 'string' || !sealedAt) throw new Error('accepted calibration and fixed seal time are required');
  if (calibrationArtifacts.some((artifact) => !isObject(artifact) || typeof artifact.caseId !== 'string' || !artifact.caseId.startsWith('cal-') || Object.keys(artifact).some((key) => key.toLowerCase().includes('decision')))) throw new Error('calibration seal cannot include decision-corpus output');
  const content = { ...manifest, status: 'calibrated-sealed', calibrationHash: hashValue(calibrationArtifacts), sealedAt, decisionEntryPoint: 'sealed-after-calibration' };
  return immutableSnapshot({ ...content, evaluationHash: hashValue(content) });
}

export function classifyProviderError(error = {}) {
  const status = Number.isInteger(error.status) ? error.status : Number.isInteger(error.statusCode) ? error.statusCode : null;
  const code = typeof error.code === 'string' ? error.code : null;
  if (status != null && RETRYABLE_STATUS_CODES.has(status) || code != null && RETRYABLE_ERROR_CODES.has(code)) return 'transient-provider';
  if (error.name === 'AbortError' || code === 'TIMEOUT') return 'transient-provider';
  if (error.semantic === true || error.code === 'INVALID_TOOL_INPUT' || error.code === 'TOOL_UNAVAILABLE') return 'semantic-candidate-failure';
  return 'provider-operational-failure';
}

export function createRunLease({ runId, evaluationHash, now = () => Date.now() } = {}) {
  if (typeof runId !== 'string' || !runId || typeof evaluationHash !== 'string' || !evaluationHash) throw new Error('run lease requires run and evaluation identities');
  let acquired = false;
  return Object.freeze({
    acquire() {
      const current = ACTIVE_LEASES.get(runId);
      if (current && current.evaluationHash !== evaluationHash) throw new Error('run lease is held by another evaluation hash');
      if (current) throw new Error('run lease is already held');
      ACTIVE_LEASES.set(runId, { evaluationHash, acquiredAt: now() }); acquired = true;
      return immutableSnapshot({ runId, evaluationHash, acquiredAt: ACTIVE_LEASES.get(runId).acquiredAt });
    },
    release() {
      if (!acquired) return false;
      const current = ACTIVE_LEASES.get(runId);
      if (current?.evaluationHash !== evaluationHash) throw new Error('run lease ownership changed');
      ACTIVE_LEASES.delete(runId); acquired = false; return true;
    },
  });
}

function artifactFilename(identity) {
  const key = typeof identity === 'string' ? identity : hashValue(identity);
  if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error('artifact identity is not path-safe');
  return `${key}.json`;
}

export class ImmutableArtifactStore {
  constructor({ directory } = {}) {
    if (typeof directory !== 'string' || !directory) throw new Error('artifact directory is required');
    this.directory = directory;
  }

  async init() { await mkdir(this.directory, { recursive: true, mode: 0o700 }); return this; }

  path(identity) { return join(this.directory, artifactFilename(identity)); }

  async write(identity, artifact) {
    if (!isObject(artifact)) throw new Error('artifact must be an object');
    await this.init();
    const path = this.path(identity);
    const content = immutableSnapshot(artifact);
    const checksum = hashValue(content);
    const stamped = immutableSnapshot({ ...content, checksum });
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(stamped));
      await handle.close();
      await link(temporary, path).catch((error) => {
        if (error.code === 'EEXIST') throw new Error('artifact overwrite is forbidden');
        throw error;
      });
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
    return stamped;
  }

  async read(identity) {
    try {
      const parsed = JSON.parse(await readFile(this.path(identity), 'utf8'));
      if (!isObject(parsed) || typeof parsed.checksum !== 'string') return { ok: false, reason: 'corrupt-artifact' };
      const { checksum, ...content } = parsed;
      if (checksum !== hashValue(content)) return { ok: false, reason: 'corrupt-artifact' };
      return { ok: true, artifact: immutableSnapshot(parsed) };
    } catch (error) {
      if (error.code === 'ENOENT') return { ok: false, reason: 'missing-artifact' };
      return { ok: false, reason: 'corrupt-artifact' };
    }
  }
}

export function validateColdSchedule(schedule, { requireAllArms = true } = {}) {
  if (!Array.isArray(schedule) || schedule.length === 0) throw new Error('evaluation schedule is required');
  const seen = new Set();
  for (const entry of schedule) {
    if (!isObject(entry) || typeof entry.armId !== 'string' || !getArm(entry.armId)) throw new Error('schedule contains an unknown exact arm');
    if ((entry.cacheRegime || getArm(entry.armId).cacheRegime) !== 'cold') throw new Error('U5 quality schedule must be cold-cache');
    const key = `${entry.armId}:${entry.caseId}:${entry.repeat}`;
    if (seen.has(key)) throw new Error('schedule contains duplicate attempt identity');
    seen.add(key);
  }
  if (requireAllArms && new Set(schedule.map((entry) => entry.armId)).size !== MODEL_ARMS.length) throw new Error('schedule must include all six exact arms');
  return true;
}

export function validateRunnerGates({ preflight, env = process.env, endpoint, endpoints = null, retention, paidRun = false, manifest = null, evaluationHash = null } = {}) {
  const checked = Array.isArray(preflight?.checks)
    ? { ...preflight, errors: preflight.ok === true && preflight.checks.every((check) => check.ok === true) ? [] : ['all six exact provider preflight checks must pass'] }
    : validatePreflight(preflight || {});
  const environment = validateEvaluationEnvironment(env);
  const egressTargets = Array.isArray(endpoints) ? endpoints : endpoint ? [endpoint] : [];
  const egressChecks = egressTargets.map((target) => checkEgress(target));
  const egress = egressChecks.length === 1 ? egressChecks[0] : { ok: egressChecks.length > 0 && egressChecks.every((check) => check.ok), hosts: egressChecks.map((check) => check.host) };
  const errors = [...checked.errors];
  if (!environment.ok) errors.push(`forbidden environment variables: ${environment.forbidden.join(', ')}`);
  if (!egress.ok) errors.push('provider-only HTTPS egress is required');
  if (!retention || retention.openaiStore !== false || retention.anthropicZdrVerified !== true) errors.push('verified non-persistent provider retention is required');
  if (!manifest || manifest.status !== 'calibrated-sealed' || typeof manifest.evaluationHash !== 'string' || !manifest.evaluationHash) errors.push('accepted calibration must seal the final manifest before dispatch');
  if (evaluationHash != null && (!manifest || evaluationHash !== manifest.evaluationHash)) errors.push('runner evaluation hash must match the sealed manifest');
  if (paidRun !== true) errors.push('explicit paid-run flag is required');
  return { ok: errors.length === 0, errors, preflight: checked, environment, egress };
}

function assertResponseAttribution(result, arm) {
  if (!isObject(result) || result.provider !== arm.provider || result.model !== arm.model || typeof result.requestId !== 'string' || !result.requestId.trim()) throw Object.assign(new Error('provider response attribution is incomplete'), { code: 'MISSING_PROVIDER_TELEMETRY' });
  if (!result.rawUsage || !result.usage || !Number.isFinite(result.usage.inputTokens) || !Number.isFinite(result.usage.outputTokens)) throw Object.assign(new Error('provider usage telemetry is incomplete'), { code: 'MISSING_PROVIDER_USAGE' });
}

function nextInput(provider, previous, toolResults) {
  if (provider === 'openai') return { previousOutputItems: previous.outputItems, input: toolResults.map((toolResult) => ({ type: 'function_call_output', call_id: toolResult.callId, output: JSON.stringify(toolResult.result) })) };
  return { messages: [...previous.messages, { role: 'assistant', content: previous.assistantContent }, { role: 'user', content: toolResults.map((toolResult) => ({ type: 'tool_result', tool_use_id: toolResult.callId, content: JSON.stringify(toolResult.result) })) }] };
}

export async function runAgentAttempt({ adapter, arm, request = {}, tools = null, attemptId, runId = null, evaluationHash = null, maxTurns = 5, maxPhases = 2, artifactStore = null, retry = { maxAttempts: 1 }, onTelemetry = null } = {}) {
  if (!adapter || typeof adapter.runTurn !== 'function') throw new Error('provider adapter is required');
  const resolvedArm = typeof arm === 'string' ? getArm(arm) : getArm(arm?.id);
  if (!resolvedArm) throw new Error('exact canonical model arm is required');
  if (resolvedArm.cacheRegime !== 'cold') throw new Error('U5 attempts must use cold-cache arms');
  if (!Number.isInteger(maxTurns) || maxTurns <= 0 || !Number.isInteger(maxPhases) || maxPhases <= 0) throw new Error('runner turn limits are invalid');
  if (typeof attemptId !== 'string' || !attemptId) throw new Error('attempt identity is required');
  if (!isObject(retry) || !Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1) throw new Error('retry policy must be a positive integer');
  const telemetry = [];
  let calls = 0;
  let phase = 0;
  let current = { outputItems: [], messages: Array.isArray(request.messages) ? request.messages : [], input: request.input || [] };
  let last = null;
  while (phase < maxPhases) {
    phase += 1;
    let result;
    let attempts = 0;
    const retryHistory = [];
    while (true) {
      attempts += 1;
      try {
        result = await adapter.runTurn({ ...request, ...current, model: resolvedArm.model, effort: resolvedArm.effort, thinking: resolvedArm.thinking, maxOutputTokens: request.maxOutputTokens || DEFAULT_LIMITS.outputTokens });
        break;
      } catch (error) {
        const classification = classifyProviderError(error);
        retryHistory.push({ attempt: attempts, classification, status: Number.isInteger(error.status) ? error.status : null, code: typeof error.code === 'string' ? error.code : null });
        if (classification !== 'transient-provider' || attempts >= retry.maxAttempts) throw Object.assign(error, { classification, attempts, telemetry });
      }
    }
    assertResponseAttribution(result, resolvedArm);
    const costRecord = priceUsage({ model: resolvedArm.model, provider: resolvedArm.provider, usage: result.rawUsage });
    if (!costRecord) throw Object.assign(new Error('provider usage could not be metered'), { code: 'UNMETERABLE_USAGE', classification: 'provider-operational-failure' });
    const responsePayload = result.outputItems || result.content || { text: result.text || '' };
    const providerEvidence = { armId: resolvedArm.id, model: result.model, provider: result.provider, runId, attemptId, phase, providerRequestId: result.requestId, responseHash: hashValue(responsePayload) };
    const record = immutableSnapshot({ attemptId, armId: resolvedArm.id, phase, retryAttempts: attempts, retryHistory, requestId: result.requestId, providerRequestId: result.requestId, model: result.model, provider: result.provider, responseHash: providerEvidence.responseHash, artifactChecksum: hashValue(providerEvidence), rawUsage: result.rawUsage, usage: result.usage, cost: costRecord.cost, outputItems: responsePayload, text: result.text || '', stopReason: result.stopReason || null });
    telemetry.push(record); onTelemetry?.(record);
    last = result;
    const callsForTurn = Array.isArray(result.toolCalls) ? result.toolCalls : [];
    if (callsForTurn.length === 0) break;
    const toolResults = [];
    for (const toolCall of callsForTurn) {
      calls += 1;
      if (calls > maxTurns) throw Object.assign(new Error('maximum tool calls exceeded'), { code: 'MAX_TOOL_CALLS', classification: 'semantic-candidate-failure', telemetry });
      if (!tools || typeof tools.call !== 'function' || typeof toolCall.name !== 'string' || !toolCall.callId) throw Object.assign(new Error('malformed or unauthorized model tool call'), { code: 'INVALID_TOOL_INPUT', semantic: true, classification: 'semantic-candidate-failure', telemetry });
      let args = toolCall.args;
      if (args == null && typeof toolCall.argumentsText === 'string') { try { args = JSON.parse(toolCall.argumentsText); } catch { args = null; } }
      if (!isObject(args)) throw Object.assign(new Error('malformed model tool input'), { code: 'INVALID_TOOL_INPUT', semantic: true, classification: 'semantic-candidate-failure', telemetry });
      let toolResult;
      try { toolResult = await tools.call(toolCall.name, args); } catch (error) { throw Object.assign(error, { classification: error.classification || 'semantic-candidate-failure', telemetry }); }
      toolResults.push({ callId: toolCall.callId, result: toolResult });
    }
    if (phase >= maxPhases) throw Object.assign(new Error('maximum continuation phases exceeded'), { code: 'MAX_CONTINUATION_PHASES', classification: 'semantic-candidate-failure', telemetry });
    current = nextInput(resolvedArm.provider, { outputItems: result.outputItems || [], messages: current.messages, assistantContent: result.content || result.outputItems || [] }, toolResults);
  }
  if (!last) throw Object.assign(new Error('provider produced no response'), { classification: 'provider-operational-failure' });
  const artifact = immutableSnapshot({ attemptId, runId, evaluationHash, armId: resolvedArm.id, model: resolvedArm.model, provider: resolvedArm.provider, telemetry, attemptBinding: hashValue({ runId, evaluationHash, armId: resolvedArm.id, attemptId, providerRequestIds: telemetry.map((turn) => turn.providerRequestId), phases: telemetry.map((turn) => turn.phase) }), response: { requestId: last.requestId, text: last.text || '', stopReason: last.stopReason || null } });
  if (artifactStore) await artifactStore.write(attemptId, artifact);
  return artifact;
}

export function createAgentRunner({ adapters = {}, artifactStore = null, runId, evaluationHash, preflight, env = process.env, endpoint = null, endpoints = null, retention = null, paidRun = false, manifest = null, reservationUsd = APPROVED_DISPATCH_RESERVATION_USD } = {}) {
  validateLimits(DEFAULT_LIMITS);
  if (typeof runId !== 'string' || !runId || typeof evaluationHash !== 'string' || !evaluationHash) throw new Error('runner identities are required');
  if (reservationUsd !== APPROVED_DISPATCH_RESERVATION_USD) throw new Error('runner must use the exact approved dispatch reservation');
  const lease = createRunLease({ runId, evaluationHash });
  return Object.freeze({
    runId, evaluationHash, reservationUsd,
    gates: () => validateRunnerGates({ preflight, env, endpoint, endpoints, retention, paidRun, manifest, evaluationHash }),
    async runAttempt(options = {}) {
      const gate = validateRunnerGates({ preflight, env, endpoint, endpoints, retention, paidRun, manifest, evaluationHash });
      if (!gate.ok) return immutableSnapshot({ ok: false, classification: 'insufficient-evidence', errors: gate.errors, dispatched: false });
      const arm = typeof options.arm === 'string' ? getArm(options.arm) : options.arm;
      const adapter = options.adapter || adapters[arm?.provider];
      lease.acquire();
      try {
        return immutableSnapshot({ ok: true, dispatched: true, artifact: await runAgentAttempt({ ...options, arm, adapter, runId, evaluationHash, artifactStore }) });
      } finally { lease.release(); }
    },
    async runSchedule({ schedule, toolsFor = null, requestFor = null, maxTurns = 5, maxPhases = 2, retry = { maxAttempts: 1 } } = {}) {
      const gate = validateRunnerGates({ preflight, env, endpoint, endpoints, retention, paidRun, manifest, evaluationHash });
      if (!gate.ok) return immutableSnapshot({ ok: false, classification: 'insufficient-evidence', dispatched: false, errors: gate.errors, artifacts: [] });
      validateColdSchedule(schedule);
      lease.acquire();
      const artifacts = [];
      let spend = 0;
      let retrySpend = 0;
      const retryPool = reservationUsd * DEFAULT_LIMITS.retryReserveRate;
      try {
        for (const entry of schedule) {
          const arm = getArm(entry.armId);
          const attemptId = entry.attemptId || stableId('u5-attempt', { runId, evaluationHash, armId: arm.id, caseId: entry.caseId, repeat: entry.repeat });
          if (artifactStore) {
            const existing = await artifactStore.read(attemptId);
            if (existing.ok) {
              if (existing.artifact.runId !== runId || existing.artifact.evaluationHash !== evaluationHash || existing.artifact.attemptId !== attemptId || existing.artifact.armId !== arm.id) return immutableSnapshot({ ok: false, classification: 'insufficient-evidence', dispatched: false, errors: [`artifact identity mismatch ${attemptId}`], artifacts });
              if (existing.artifact.status === 'failed') return immutableSnapshot({ ok: false, classification: existing.artifact.classification || 'insufficient-evidence', dispatched: false, errors: [existing.artifact.error?.code || 'prior-attempt-failed'], artifacts: [...artifacts, existing.artifact] });
              artifacts.push(existing.artifact); spend += existing.artifact.telemetry.reduce((sum, turn) => sum + turn.cost, 0); continue;
            }
            if (existing.reason === 'corrupt-artifact') return immutableSnapshot({ ok: false, classification: 'insufficient-evidence', dispatched: false, errors: [`corrupt artifact ${attemptId}`], artifacts });
          }
          const adapter = adapters[arm.provider];
          let artifact;
          try {
            artifact = await runAgentAttempt({ adapter, arm, attemptId, runId, evaluationHash, request: requestFor?.(entry) || entry.request || {}, tools: toolsFor?.(entry) || null, maxTurns, maxPhases, artifactStore, retry });
          } catch (error) {
            const failure = immutableSnapshot({ attemptId, runId, evaluationHash, armId: arm.id, model: arm.model, provider: arm.provider, status: 'failed', classification: error.classification || classifyProviderError(error), error: { code: typeof error.code === 'string' ? error.code : 'RUN_ATTEMPT_FAILED', status: Number.isInteger(error.status) ? error.status : null }, telemetry: error.telemetry || [] });
            if (artifactStore) await artifactStore.write(attemptId, failure).catch(() => {});
            return immutableSnapshot({ ok: false, classification: failure.classification, dispatched: true, errors: [failure.error.code], artifacts: [...artifacts, failure], spend, retrySpend });
          }
          const cost = artifact.telemetry.reduce((sum, turn) => sum + turn.cost, 0);
          spend += cost;
          retrySpend += artifact.telemetry.reduce((sum, turn) => sum + Math.max(0, turn.retryAttempts - 1) * turn.cost, 0);
          if (retrySpend > retryPool + 1e-12) return immutableSnapshot({ ok: false, classification: 'budget-stop', dispatched: true, errors: ['global retry cost pool exhausted'], artifacts: [...artifacts, artifact], spend, retrySpend });
          if (spend > reservationUsd + 1e-12) return immutableSnapshot({ ok: false, classification: 'budget-stop', dispatched: true, errors: ['approved dispatch reservation exceeded'], artifacts: [...artifacts, artifact], spend, retrySpend });
          artifacts.push(artifact);
        }
        return immutableSnapshot({ ok: true, classification: 'completed', dispatched: true, artifacts, spend, retrySpend });
      } finally { lease.release(); }
    },
  });
}

export const createEvaluationRunner = createAgentRunner;
