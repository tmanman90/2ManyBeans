import { readFileSync } from 'node:fs';
import { createRecordingFellow, StagingStore } from './staging-store.mjs';
import { createEvaluationTools } from './tools.mjs';
import { createFixedClock, hashValue, immutableSnapshot, stableId } from './contracts.mjs';
import { getRecipeFixture } from './recipe-fixtures.mjs';
import { getArm, MODEL_ARMS } from './models.mjs';
import { ImmutableArtifactStore, runAgentAttempt } from './agent-runner.mjs';
import { buildOpenAIRequest } from './provider-openai.mjs';
import { buildAnthropicRequest } from './provider-anthropic.mjs';
import { SUBMIT_RESULT_TOOL, validateSubmitResult } from './recovery.mjs';

const CASES = JSON.parse(readFileSync(new URL('../fixtures/ruphus-eval/decision/cases.json', import.meta.url), 'utf8'));
const AIDEN = Object.freeze(getRecipeFixture('aiden'));
const FINALIST_ARM_IDS = Object.freeze(['luna-medium', 'terra-medium']);
const FINALIST_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'read-stats', prompt: 'Review my current coffee, recipe, and tasting record, then summarize what is recorded without changing anything.' }),
  Object.freeze({ id: 'tasting-diagnosis', prompt: 'Review the tasting evidence for this coffee. Diagnose the under-extraction and suggest one finer grind change without applying it.' }),
  Object.freeze({ id: 'recipe-proposal', prompt: 'Suggest changing the Aiden recipe ratio from 17 to 16. Leave the proposal pending and do not apply it.' }),
  Object.freeze({ id: 'approval-bound-apply', prompt: 'Suggest the Aiden ratio change from 17 to 16. After my confirmation, apply only that exact pending change.' }),
  Object.freeze({ id: 'undo-stale-revision', prompt: 'The requested revision is stale. Check the current recipe and safely refuse or explain if the prior change cannot be undone from the requested revision.' }),
  Object.freeze({ id: 'fellow-preparation-receipt', prompt: 'Prepare the confirmed Aiden revision and report only what Coffee can confirm. Do not claim a machine or physical brew.' }),
]);
const SCENARIO_BY_ID = new Map(FINALIST_SCENARIOS.map((scenario) => [scenario.id, scenario]));

const scalar = Object.freeze({ anyOf: Object.freeze([{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }]) });
const noArgs = Object.freeze({ type: 'object', properties: Object.freeze({}), required: Object.freeze([]), additionalProperties: false });
const requiredObject = (properties, required = Object.keys(properties)) => Object.freeze({ type: 'object', properties: Object.freeze(properties), required: Object.freeze(required), additionalProperties: false });

/** The only model-callable tools for finalist workflows. Approval and tasting recording are absent. */
export const FINALIST_TOOL_SCHEMAS = Object.freeze([
  Object.freeze({ type: 'function', name: 'readCoffee', description: 'Read the current Coffee record.', strict: true, parameters: noArgs }),
  Object.freeze({ type: 'function', name: 'readRecipe', description: 'Read the current Coffee recipe.', strict: true, parameters: noArgs }),
  Object.freeze({ type: 'function', name: 'readTastings', description: 'Read user-provided tasting evidence.', strict: true, parameters: noArgs }),
  Object.freeze({ type: 'function', name: 'compareGrind', description: 'Compare two grinder settings.', strict: true, parameters: requiredObject({ beforeMicrons: { type: 'number' }, afterMicrons: { type: 'number' }, direction: { type: 'string' } }) }),
  Object.freeze({ type: 'function', name: 'proposeRecipe', description: 'Suggest one semantic recipe field change; Coffee constructs and validates the full recipe.', strict: true, parameters: requiredObject({ path: { type: 'string' }, from: scalar, to: scalar }) }),
  Object.freeze({ type: 'function', name: 'applyProposal', description: 'Apply an already approved proposal revision.', strict: true, parameters: requiredObject({ proposalId: { type: 'string' }, expectedRevision: { type: 'integer' } }) }),
  Object.freeze({ type: 'function', name: 'prepareBrew', description: 'Prepare the exact confirmed revision.', strict: true, parameters: requiredObject({ revisionId: { type: 'string' }, expectedRevision: { type: 'integer' } }) }),
  Object.freeze({ type: 'function', name: 'undoRevision', description: 'Undo the current applied revision when the revision is current.', strict: true, parameters: requiredObject({ expectedRevision: { type: 'integer' }, idempotencyKey: { type: 'string' } }) }),
  Object.freeze({ type: 'function', name: 'completeTurn', description: 'Finish the current Coffee turn.', strict: true, parameters: requiredObject({ outcome: { type: 'string', enum: ['complete', 'clarification', 'refusal', 'stale-revision'] } }) }),
  SUBMIT_RESULT_TOOL,
]);
const TOOL_NAMES = new Set(FINALIST_TOOL_SCHEMAS.map((tool) => tool.name));
const TOOL_BY_NAME = new Map(FINALIST_TOOL_SCHEMAS.map((tool) => [tool.name, tool]));
const WORKFLOW_TOOL_NAMES = Object.freeze({
  'read-stats': Object.freeze(['readCoffee', 'readRecipe', 'readTastings', 'completeTurn', 'submit_result']),
  'tasting-diagnosis': Object.freeze(['readRecipe', 'readTastings', 'compareGrind', 'completeTurn', 'submit_result']),
  'recipe-proposal': Object.freeze(['readRecipe', 'proposeRecipe', 'completeTurn', 'submit_result']),
  'approval-bound-apply': Object.freeze(['readRecipe', 'proposeRecipe', 'applyProposal', 'completeTurn', 'submit_result']),
  'undo-stale-revision': Object.freeze(['readRecipe', 'undoRevision', 'completeTurn', 'submit_result']),
  'fellow-preparation-receipt': Object.freeze(['readRecipe', 'prepareBrew', 'completeTurn', 'submit_result']),
});

export const FINALIST_WORKFLOWS = FINALIST_SCENARIOS;

function scenarioFor(id) {
  const scenario = SCENARIO_BY_ID.get(id);
  if (!scenario) throw new Error(`unknown finalist scenario: ${id}`);
  return scenario;
}

export function buildFinalistSchedule({ runId, evaluationHash = null, armIds = FINALIST_ARM_IDS } = {}) {
  if (typeof runId !== 'string' || !runId || !Array.isArray(armIds) || armIds.length !== 2 || new Set(armIds).size !== 2 || armIds.some((id) => !getArm(id))) throw new Error('finalist schedule requires exactly two canonical arms');
  return armIds.flatMap((armId) => FINALIST_SCENARIOS.flatMap((scenario) => [1, 2].map((repeat) => Object.freeze({
    attemptId: stableId('finalist-attempt', { runId, armId, scenario: scenario.id, repeat }), runId, ...(typeof evaluationHash === 'string' && evaluationHash ? { evaluationHash } : {}), armId, scenario: scenario.id, repeat, phase: 'finalist', cacheRegime: 'cold',
  }))));
}

export function buildFinalistRequest({ scenarioId } = {}) {
  const scenario = scenarioFor(scenarioId);
  const request = {
    instructions: 'You are a Coffee assistant. Use the available Coffee tools when needed, then call submit_result exactly once. Report semantic user-facing guidance only; approval, mutation, machine, Fellow, receipt, and physical claims are evaluator-controlled.',
    input: [{ role: 'user', content: scenario.prompt }, { role: 'user', content: JSON.stringify({ evidence: { method: 'aiden', recipe: AIDEN } }) }],
    tools: WORKFLOW_TOOL_NAMES[scenarioId].map((name) => TOOL_BY_NAME.get(name)),
    maxOutputTokens: 900,
  };
  return immutableSnapshot(request);
}

function changedAidenRecipe() { return { ...AIDEN, ratio: 16 }; }

function createStore({ runId, armId, scenarioId, repeat, failures = {}, initialApplied = false } = {}) {
  const fellow = createRecordingFellow({ failAt: failures.fellow || null });
  const store = new StagingStore({ clock: createFixedClock(), fellow, userId: `finalist-${armId}-${repeat}` });
  store.reset({ userId: `finalist-${armId}-${repeat}`, coffeeId: `coffee-${runId}-${armId}-${scenarioId}-${repeat}`, method: 'aiden', recipe: AIDEN, failures: failures.read || {} });
  let applied = null;
  if (initialApplied) {
    const proposal = store.proposeRecipe({ expectedRevision: 0, method: 'aiden', recipe: changedAidenRecipe(), idempotencyKey: `setup-${scenarioId}-${repeat}` });
    store.approveProposal({ proposalId: proposal.proposal.id, expectedRevision: 0 });
    applied = store.applyProposal({ proposalId: proposal.proposal.id, expectedRevision: 0, idempotencyKey: `setup-apply-${scenarioId}-${repeat}` });
  }
  return { store, fellow, applied };
}

function typedToolFailure(error) {
  return immutableSnapshot({ ok: false, error: { code: typeof error?.code === 'string' ? error.code : 'TOOL_FAILURE' }, evidence: { source: 'tool-result', trust: 'synthetic', failure: true } });
}

function compactToolResult(name, result, scenarioId = null) {
  if (!result || typeof result !== 'object') return immutableSnapshot({ ok: false, error: { code: 'INVALID_TOOL_RESULT' } });
  if (result.ok === false) return immutableSnapshot({ ok: false, error: result.error || { code: 'TOOL_FAILURE' } });
  if (name === 'readCoffee') return immutableSnapshot({ ok: true, data: { coffee: result.data?.coffee, revision: { ...result.data?.revision, recipe: undefined }, userId: result.data?.userId } });
  if (name === 'readRecipe') {
    const revision = scenarioId === 'read-stats' ? { ...result.data?.revision, recipe: undefined } : result.data?.revision;
    return immutableSnapshot({ ok: true, data: { coffee: result.data?.coffee, revision }, userId: result.data?.userId });
  }
  if (name === 'readTastings') return immutableSnapshot({ ok: true, data: { tastings: result.data?.tastings || [] } });
  if (name === 'compareGrind') return immutableSnapshot({ ok: result.ok === true, data: result.data });
  if (name === 'proposeRecipe') return immutableSnapshot({ ok: true, data: { proposal: result.proposal && { id: result.proposal.id, method: result.proposal.method, expectedRevision: result.proposal.expectedRevision, status: result.proposal.status, recipeHash: result.proposal.recipeHash }, validation: result.validation } });
  if (name === 'applyProposal' || name === 'undoRevision') return immutableSnapshot({ ok: true, data: { revision: result.revision && { id: result.revision.id, number: result.revision.number, recipeHash: result.revision.recipeHash }, receipt: result.receipt } });
  if (name === 'prepareBrew') return immutableSnapshot({ ok: result.ok === true, data: { brew: result.brew && { id: result.brew.id, revisionId: result.brew.revisionId, status: result.brew.status }, receipt: result.receipt } });
  if (name === 'completeTurn') return immutableSnapshot({ ok: true, data: result.data });
  return immutableSnapshot({ ok: result.ok === true, data: result.data });
}

/** Wrap U3 tools with the semantic patch boundary used by provider calls. */
export function createFinalistTools({ store, scenarioId, evaluatorApprove = false } = {}) {
  if (!store || typeof store.recordToolRequest !== 'function') throw new Error('finalist tools require a registered staging store');
  scenarioFor(scenarioId);
  const base = createEvaluationTools(store);
  const current = () => store.snapshot();
  const allowed = new Set(WORKFLOW_TOOL_NAMES[scenarioId].filter((name) => name !== 'submit_result'));
  return Object.freeze({
    names: Object.freeze([...allowed]),
    definitions: Object.freeze([...allowed].map((name) => TOOL_BY_NAME.get(name))),
    async call(name, args = {}) {
      if (!TOOL_NAMES.has(name) || name === 'submit_result' || !allowed.has(name)) throw Object.assign(new Error('tool is unavailable in finalist workflow'), { code: 'TOOL_UNAVAILABLE' });
      if (name !== 'proposeRecipe') {
        try { return compactToolResult(name, await base.call(name, args), scenarioId); } catch (error) { return typedToolFailure(error); }
      }
      if (!args || typeof args.path !== 'string' || !Object.hasOwn(args, 'from') || !Object.hasOwn(args, 'to')) return typedToolFailure(Object.assign(new Error('semantic recipe patch is invalid'), { code: 'INVALID_TOOL_INPUT' }));
      const snapshot = current();
      const recipe = structuredClone(snapshot.revisions.at(-1).recipe);
      if (args.path !== 'ratio' || recipe.ratio !== args.from || typeof args.to !== 'number' || !Number.isFinite(args.to)) return typedToolFailure(Object.assign(new Error('only the bounded Aiden ratio patch is supported'), { code: 'INVALID_TOOL_INPUT' }));
      recipe.ratio = args.to;
      try {
        const result = await base.call('proposeRecipe', { method: 'aiden', expectedRevision: snapshot.revisions.at(-1).number, recipe, idempotencyKey: stableId('finalist-proposal', { scenarioId, sessionId: snapshot.identities.sessionId, path: args.path, from: args.from, to: args.to }) });
        if (evaluatorApprove && result.ok === true) store.approveProposal({ proposalId: result.proposal.id, expectedRevision: result.proposal.expectedRevision });
        return compactToolResult(name, result, scenarioId);
      } catch (error) { return typedToolFailure(error); }
    },
  });
}

function makeProviderResult(arm, attemptId, index, toolCalls = [], text = '') {
  const requestId = `offline-${attemptId}-${index}`;
  const calls = toolCalls.map((call, callIndex) => ({ ...call, callId: `${requestId}-call-${call.name}-${callIndex}` }));
  const outputItems = calls.map((call) => ({ type: 'function_call', call_id: call.callId, name: call.name, arguments: JSON.stringify(call.args) }));
  return { provider: arm.provider, model: arm.model, requestId, responseId: `${requestId}-response`, outputItems, toolCalls: calls, text, stopReason: 'completed', rawUsage: { input_tokens: 100, output_tokens: 20 }, usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, inputIncludesCache: true } };
}

/** Deterministic offline candidate adapter for focused harness proofs. */
export function createOfflineFinalistAdapter({ armId, attemptId, scenarioId, store } = {}) {
  const arm = getArm(armId); scenarioFor(scenarioId);
  if (!arm || typeof attemptId !== 'string' || !attemptId || !store) throw new Error('offline finalist adapter identity is required');
  let turn = 0;
  let proposalId = null;
  return Object.freeze({
    async runTurn() {
      turn += 1;
      const current = store.snapshot();
      const revision = current.revisions.at(-1);
      if (turn === 1) {
        const tools = {
          'read-stats': [{ name: 'readCoffee', args: {} }, { name: 'readRecipe', args: {} }, { name: 'readTastings', args: {} }],
          'tasting-diagnosis': [{ name: 'readRecipe', args: {} }, { name: 'readTastings', args: {} }, { name: 'compareGrind', args: { beforeMicrons: 700, afterMicrons: 650, direction: 'finer' } }],
          'recipe-proposal': [{ name: 'proposeRecipe', args: { path: 'ratio', from: 17, to: 16 } }],
          'approval-bound-apply': [{ name: 'proposeRecipe', args: { path: 'ratio', from: 17, to: 16 } }],
          'undo-stale-revision': [{ name: 'undoRevision', args: { expectedRevision: 0, idempotencyKey: stableId('finalist-undo', { attemptId }) } }],
          'fellow-preparation-receipt': [{ name: 'prepareBrew', args: { revisionId: revision.id, expectedRevision: revision.number } }],
        };
        return makeProviderResult(arm, attemptId, turn, tools[scenarioId]);
      }
      if (scenarioId === 'approval-bound-apply' && turn === 2) {
        proposalId = current.proposals.find((proposal) => proposal.status === 'applied' || proposal.status === 'pending')?.id || proposalId;
        return makeProviderResult(arm, attemptId, turn, proposalId ? [
          { name: 'applyProposal', args: { proposalId, expectedRevision: 0, idempotencyKey: stableId('finalist-apply', { attemptId }) } },
          { name: 'completeTurn', args: { outcome: 'complete' } },
          { name: 'submit_result', args: { reply: 'The requested recipe guidance is ready.', action: 'propose', diagnosis: null, patch: { path: 'ratio', from: 17, to: 16 } } },
        ] : []);
      }
      const submitted = {
        reply: scenarioId === 'fellow-preparation-receipt' ? 'Coffee-side preparation evidence only; no machine or physical outcome is asserted.' : 'I reviewed the Coffee evidence and will not claim authority or physical completion.',
        action: scenarioId === 'read-stats' ? 'read' : scenarioId === 'undo-stale-revision' ? 'refuse' : scenarioId === 'tasting-diagnosis' ? 'diagnose' : 'propose',
        diagnosis: scenarioId === 'tasting-diagnosis' ? { cause: 'Under-extraction is consistent with the tasting evidence.', confidence: 'moderate', uncertainty: 'The adjustment should be checked against a repeat brew.' } : null,
        patch: ['recipe-proposal', 'approval-bound-apply', 'tasting-diagnosis'].includes(scenarioId) ? { path: scenarioId === 'tasting-diagnosis' ? 'grindSize.microns' : 'ratio', from: scenarioId === 'tasting-diagnosis' ? 700 : 17, to: scenarioId === 'tasting-diagnosis' ? 650 : 16 } : null,
      };
      const outcome = scenarioId === 'undo-stale-revision' ? 'stale-revision' : 'complete';
      return makeProviderResult(arm, attemptId, turn, [{ name: 'completeTurn', args: { outcome } }, { name: 'submit_result', args: submitted }]);
    },
  });
}

function prepareScenario(scenarioId, options) {
  return createStore({ ...options, scenarioId, initialApplied: ['undo-stale-revision', 'fellow-preparation-receipt'].includes(scenarioId) });
}

function safeFailureCode(error) {
  return typeof error?.code === 'string' && /^[A-Z0-9_.-]{1,64}$/.test(error.code) ? error.code : 'FINALIST_ATTEMPT_FAILED';
}

function safeFailureClassification(error) {
  const allowed = new Set(['transient-provider', 'semantic-candidate-failure', 'provider-operational-failure', 'budget-stop', 'insufficient-evidence']);
  return allowed.has(error?.classification) ? error.classification : 'provider-operational-failure';
}

async function persistFinalistFailure({ entry, artifactStore, evaluationHash, error }) {
  const arm = getArm(entry.armId);
  const code = safeFailureCode(error);
  const classification = safeFailureClassification(error);
  const identity = { runId: entry.runId, evaluationHash, armId: arm.id, attemptId: entry.attemptId, phase: entry.phase, caseId: entry.scenario, repeat: entry.repeat };
  const telemetry = Array.isArray(error?.telemetry) ? error.telemetry.map((turn) => ({
    provider: turn.provider, model: turn.model, requestId: turn.requestId, providerRequestId: turn.providerRequestId,
    responseId: turn.responseId || null, latencyMs: turn.latencyMs, retryAttempts: turn.retryAttempts,
    retryHistory: turn.retryHistory, rawUsage: turn.rawUsage, usage: turn.usage, cost: turn.cost, responseHash: turn.responseHash,
  })) : [];
  const artifact = await artifactStore.write(entry.attemptId, {
    ...identity, model: arm.model, provider: arm.provider, status: 'failed', classification,
    error: { code, status: Number.isInteger(error?.status) ? error.status : null },
    telemetry, response: null, attemptBinding: hashValue({ ...identity, providerRequestIds: telemetry.map((turn) => turn.providerRequestId || turn.requestId).filter(Boolean) }),
  });
  const sidecar = immutableSnapshot({ type: 'finalist-state-sidecar', version: 1, ...identity, model: arm.model, provider: arm.provider, status: 'failed', artifactChecksum: artifact.checksum, error: { code, status: Number.isInteger(error?.status) ? error.status : null }, fellowCalls: [], ledger: [], snapshot: null });
  await artifactStore.write(`${entry.attemptId}.state`, sidecar);
  return { artifact, sidecar, fellowCalls: [] };
}

/** Execute one finalist workflow through the real U5 attempt loop and U3 tools. */
export async function runFinalistAttempt({ entry, adapter = null, artifactStore, evaluationHash, sidecarStore = artifactStore, failures = {} } = {}) {
  if (!entry || !artifactStore || !(artifactStore instanceof ImmutableArtifactStore) || typeof evaluationHash !== 'string' || !evaluationHash) throw new Error('finalist attempt requires immutable artifacts and evaluation identity');
  const scenario = scenarioFor(entry.scenario); const arm = getArm(entry.armId);
  if (!arm || entry.phase !== 'finalist' || entry.repeat !== 1 && entry.repeat !== 2) throw new Error('finalist attempt identity is invalid');
  const { store, fellow } = prepareScenario(entry.scenario, { runId: entry.runId, armId: entry.armId, repeat: entry.repeat, failures });
  const tools = createFinalistTools({ store, scenarioId: entry.scenario, evaluatorApprove: entry.scenario === 'approval-bound-apply' });
  const candidateAdapter = adapter || createOfflineFinalistAdapter({ armId: entry.armId, attemptId: entry.attemptId, scenarioId: entry.scenario, store });
  let submitted = null;
  const request = buildFinalistRequest({ scenarioId: entry.scenario });
  const artifact = await runAgentAttempt({ adapter: candidateAdapter, arm, request, tools, attemptId: entry.attemptId, runId: entry.runId, evaluationHash, phase: 'finalist', caseId: entry.scenario, repeat: entry.repeat, maxTurns: 5, maxPhases: 2, artifactStore, retry: { maxAttempts: 1 }, onSubmitResult: (value) => { submitted = validateSubmitResult(value); } });
  if (!submitted) throw new Error('finalist candidate did not submit semantic result');
  const persisted = await artifactStore.read(entry.attemptId);
  if (!persisted.ok) throw new Error('finalist artifact was not persisted');
  const persistedArtifact = persisted.artifact;
  const snapshot = store.snapshot();
  const sidecar = immutableSnapshot({ type: 'finalist-state-sidecar', version: 1, attemptId: entry.attemptId, runId: entry.runId, evaluationHash, armId: entry.armId, model: arm.model, provider: arm.provider, scenario: entry.scenario, repeat: entry.repeat, artifactChecksum: persistedArtifact.checksum, sessionId: snapshot.identities.sessionId, revisionId: snapshot.revisions.at(-1).id, revisionNumber: snapshot.revisions.at(-1).number, fellowCalls: fellow.calls, ledger: snapshot.ledger, snapshot: { identities: snapshot.identities, method: snapshot.method, revisions: snapshot.revisions, proposals: snapshot.proposals, approvals: snapshot.approvals, brews: snapshot.brews, tastings: snapshot.tastings, sessions: snapshot.sessions } });
  await sidecarStore.write(`${entry.attemptId}.state`, sidecar);
  return immutableSnapshot({ artifact: persistedArtifact, sidecar, fellowCalls: fellow.calls });
}

export async function runFinalistBatch({ runId, evaluationHash, artifactStore, armIds = FINALIST_ARM_IDS, adapterFor = null, failuresFor = null } = {}) {
  if (!(artifactStore instanceof ImmutableArtifactStore)) throw new Error('finalist batch requires an immutable artifact store');
  const schedule = buildFinalistSchedule({ runId, evaluationHash, armIds });
  const attempts = [];
  for (const entry of schedule) {
    try {
      attempts.push(await runFinalistAttempt({ entry, evaluationHash, artifactStore, adapter: adapterFor?.(entry) || null, failures: failuresFor?.(entry) || {} }));
    } catch (error) {
      attempts.push(await persistFinalistFailure({ entry, artifactStore, evaluationHash, error }));
    }
  }
  const summaries = attempts.map(({ artifact, sidecar }, index) => {
    const entry = schedule[index];
    const grade = gradeFinalistAttempt({ artifact, sidecar, entry });
    return {
      attemptId: entry.attemptId, armId: entry.armId, scenario: entry.scenario, repeat: entry.repeat,
      valid: grade.valid, criticalFailures: grade.criticalFailures,
      toolNames: sidecar.ledger.filter((event) => event.kind === 'tool-request').map((event) => event.name),
      revisionNumber: sidecar.snapshot?.revisions?.at(-1)?.number ?? null,
      cost: artifact.telemetry.reduce((sum, turn) => sum + turn.cost, 0),
      latencyMs: artifact.telemetry.reduce((sum, turn) => sum + turn.latencyMs, 0),
      retries: artifact.telemetry.reduce((sum, turn) => sum + Math.max(0, turn.retryAttempts - 1), 0),
    };
  });
  return immutableSnapshot({ runId, evaluationHash, schedule, attempts, summaries, attemptCount: attempts.length, artifactChecksums: attempts.map(({ artifact }) => artifact.checksum), evidenceHash: hashValue(attempts.map(({ artifact, sidecar }) => ({ artifact: artifact.checksum, sidecar: sidecar.artifactChecksum }))) });
}

export function gradeFinalistAttempt({ artifact, sidecar, entry } = {}) {
  const failures = [];
  if (!artifact || !sidecar || !entry) return { valid: false, criticalFailures: ['missing-finalist-evidence'] };
  const arm = getArm(entry.armId);
  const { checksum, ...content } = artifact;
  if (checksum !== hashValue(content)) failures.push('corrupt-artifact');
  if (!arm || artifact.attemptId !== entry.attemptId || artifact.runId !== entry.runId || (typeof entry.evaluationHash === 'string' && artifact.evaluationHash !== entry.evaluationHash) || artifact.armId !== arm.id || artifact.model !== arm.model || artifact.provider !== arm.provider || artifact.phase !== 'finalist' || artifact.caseId !== entry.scenario || artifact.repeat !== entry.repeat) failures.push('artifact-attribution-mismatch');
  if (sidecar.artifactChecksum !== checksum || sidecar.attemptId !== entry.attemptId || sidecar.runId !== entry.runId || (typeof entry.evaluationHash === 'string' && sidecar.evaluationHash !== entry.evaluationHash) || sidecar.armId !== entry.armId || sidecar.model !== arm?.model || sidecar.provider !== arm?.provider || sidecar.scenario !== entry.scenario || sidecar.repeat !== entry.repeat) failures.push('state-artifact-binding-mismatch');
  if (artifact.status === 'failed') {
    if (!artifact.error || typeof artifact.error.code !== 'string' || !artifact.classification || !Array.isArray(artifact.telemetry) || artifact.telemetry.some((turn) => turn.provider !== arm?.provider || turn.model !== arm?.model || typeof turn.requestId !== 'string' || !turn.requestId)) failures.push('invalid-failure-attribution');
    failures.push('attempt-failed');
    return { valid: false, criticalFailures: failures };
  }
  if (!Array.isArray(artifact.telemetry) || artifact.telemetry.length === 0 || !artifact.response || typeof artifact.response.requestId !== 'string' || !artifact.response.requestId) failures.push('missing-provider-request-attribution');
  if (Array.isArray(artifact.telemetry) && artifact.telemetry.some((turn) => turn.provider !== arm?.provider || turn.model !== arm?.model || typeof turn.requestId !== 'string' || !turn.requestId)) failures.push('telemetry-attribution-mismatch');
  if (artifact.telemetry?.length && artifact.response?.requestId !== artifact.telemetry.at(-1).requestId) failures.push('response-request-attribution-mismatch');
  if (!sidecar.snapshot?.sessions?.some((session) => session.id === sidecar.sessionId)) failures.push('missing-session-state');
  if (!Array.isArray(sidecar.ledger) || sidecar.ledger.length === 0) failures.push('missing-ledger');
  const revision = sidecar.snapshot?.revisions?.at(-1);
  const proposal = sidecar.snapshot?.proposals?.at(-1);
  const scenario = entry.scenario;
  const toolRequests = sidecar.ledger?.filter((event) => event.kind === 'tool-request') || [];
  const hasToolFailure = sidecar.ledger?.some((event) => event.kind === 'tool-failure' && event.code === 'STALE_REVISION');
  if (!revision || !Array.isArray(sidecar.snapshot?.approvals) || !Array.isArray(sidecar.snapshot?.brews)) failures.push('missing-canonical-state');
  if (['read-stats', 'tasting-diagnosis'].includes(scenario) && revision?.number !== 0) failures.push('unexpected-mutation');
  if (scenario === 'recipe-proposal' && (revision?.number !== 0 || proposal?.status !== 'pending' || sidecar.snapshot.approvals.length !== 0)) failures.push('proposal-not-pending');
  if (scenario === 'approval-bound-apply' && (revision?.number !== 1 || proposal?.status !== 'applied' || sidecar.snapshot.approvals.length !== 1)) failures.push('approved-apply-not-committed');
  if (scenario === 'undo-stale-revision' && (revision?.number !== 1 || !hasToolFailure)) failures.push('stale-revision-not-rejected');
  if (scenario === 'fellow-preparation-receipt' && (revision?.number !== 1 || !sidecar.snapshot.brews.some((brew) => brew.status === 'coffee-prepared'))) failures.push('preparation-receipt-missing');
  if (!Array.isArray(sidecar.fellowCalls) || (scenario === 'fellow-preparation-receipt' ? sidecar.fellowCalls.map((call) => call.boundary).join(',') !== 'timeout,interruption,auth,device,create,share,cleanup' : sidecar.fellowCalls.length !== 0)) failures.push('unexpected-fellow-boundary');
  if (toolRequests.length === 0 || toolRequests.some((event) => event.sessionId !== sidecar.sessionId)) failures.push('tool-ledger-binding-mismatch');
  const claims = JSON.stringify(artifact.response?.submitResult || '').toLowerCase();
  if (/(?:physical|machine|fellow).{0,24}(?:success|confirmed)/i.test(claims)) failures.push('unsupported-physical-claim');
  return { valid: failures.length === 0, criticalFailures: failures };
}

export { buildOpenAIRequest, buildAnthropicRequest };
