import { compareGrindMicrons, validateRecipe } from './graders/recipe.mjs';
import { LifecycleError, evidenceEnvelope, evidenceToolContent, immutableSnapshot, stableId } from './contracts.mjs';

const TOOL_NAMES = Object.freeze([
  'readCoffee', 'readRecipe', 'readTastings', 'compareGrind', 'proposeRecipe',
  'applyProposal', 'prepareBrew', 'undoRevision', 'completeTurn',
]);

function resultEvidence(source, trust, recordId, data) {
  return evidenceToolContent(evidenceEnvelope({ source, trust, recordId, data }));
}

function coffeeEvidence(result) {
  const { id, userId, ...embedded } = result.coffee;
  return {
    safeData: { ...result, coffee: { id, userId } },
    evidence: [
      resultEvidence('coffee-state', 'canonical', { kind: 'coffee', id }, { id, userId }),
      resultEvidence('coffee-state', 'untrusted', { kind: 'coffee-embedded', id }, embedded),
    ],
  };
}

const COMPLETION_OUTCOMES = new Set(['complete', 'clarification', 'refusal', 'insufficient-evidence', 'error']);

/** Provider-neutral model tools. Approval is intentionally out of band. */
export function createEvaluationTools(store) {
  if (!store || typeof store.recordToolRequest !== 'function') throw new LifecycleError('INVALID_TOOL_STORE', 'tools require a staging store');
  const handlers = {
    readCoffee: async (args = {}) => {
      const result = store.readCoffee(args);
      const coffee = coffeeEvidence(result);
      return {
        ok: true,
        data: coffee.safeData,
        evidence: coffee.evidence,
      };
    },
    readRecipe: async (args = {}) => {
      const result = store.readRecipe(args);
      const coffee = coffeeEvidence(result);
      return { ok: true, data: coffee.safeData, evidence: [...coffee.evidence, evidenceToolContent(result.evidence)] };
    },
    readTastings: async (args = {}) => {
      const result = store.readTastings(args);
      const safeTastings = result.tastings.map(({ id, userId, coffeeId, revisionId, createdAt }) => ({ id, userId, coffeeId, revisionId, createdAt }));
      return { ok: true, data: { tastings: safeTastings }, evidence: evidenceToolContent(result.evidence) };
    },
    compareGrind: async (args = {}) => {
      const comparison = compareGrindMicrons(args);
      return { ok: comparison.valid && comparison.correct, data: comparison, evidence: resultEvidence('tool-result', 'synthetic', { kind: 'grind-comparison', id: stableId('grind', args) }, comparison) };
    },
    proposeRecipe: async (args = {}) => {
      const result = store.proposeRecipe(args);
      return { ...result, evidence: resultEvidence('recipe', 'untrusted', { kind: 'proposal', id: result.proposal?.id || stableId('invalid-proposal', args) }, result.proposal || result.validation) };
    },
    applyProposal: async ({ userId, coffeeId, proposalId, expectedRevision, idempotencyKey } = {}) => {
      const result = store.applyProposal({ userId, coffeeId, proposalId, expectedRevision, idempotencyKey });
      return { ...result, evidence: resultEvidence('tool-result', 'synthetic', { kind: 'revision', id: result.revision.id }, result.receipt) };
    },
    prepareBrew: async (args = {}) => {
      const result = await store.prepareBrew(args);
      return { ...result, evidence: resultEvidence('tool-result', 'synthetic', { kind: 'brew', id: result.brew?.id || stableId('failed-brew', args) }, result.receipt) };
    },
    undoRevision: async ({ userId, coffeeId, expectedRevision, idempotencyKey } = {}) => {
      const result = store.undoRevision({ userId, coffeeId, expectedRevision, idempotencyKey });
      return { ...result, evidence: resultEvidence('tool-result', 'synthetic', { kind: 'revision', id: result.revision.id }, result.receipt) };
    },
    completeTurn: async ({ userId, sessionId, outcome } = {}) => {
      if (!COMPLETION_OUTCOMES.has(outcome)) throw new LifecycleError('INVALID_OUTCOME', 'model completion outcome is not allowed');
      const session = store.completeTurn({ userId, sessionId, outcome, receipt: null });
      return { ok: true, data: session, evidence: resultEvidence('tool-result', 'synthetic', { kind: 'session', id: session.id }, session) };
    },
  };

  return Object.freeze({
    definitions: Object.freeze(TOOL_NAMES.map((name) => Object.freeze({ name, providerNeutral: true }))),
    names: TOOL_NAMES,
    async call(name, args = {}) {
      if (!Object.prototype.hasOwnProperty.call(handlers, name)) throw new LifecycleError('TOOL_UNAVAILABLE', `model tool is unavailable: ${name}`);
      store.recordToolRequest(name, args);
      try {
        const result = await handlers[name](args);
        return immutableSnapshot(result);
      } catch (error) {
        if (typeof store._record === 'function') store._record('tool-failure', { name, code: error.code || 'TOOL_FAILURE', message: error.message });
        throw error;
      }
    },
  });
}

/**
 * Deliberately loud adapters used by isolation tests. No production adapter is
 * imported by U3 and every attempted external path fails before side effects.
 */
export function createForbiddenAdapter(name = 'external') {
  return new Proxy({}, {
    get() {
      return () => { throw new LifecycleError('FORBIDDEN_EXTERNAL_ADAPTER', `${name} adapter is forbidden in U3`); };
    },
  });
}

export const createForbiddenFirebaseAdapter = () => createForbiddenAdapter('Firebase');
export const createForbiddenFellowAdapter = () => createForbiddenAdapter('Fellow');
export const createForbiddenNetworkAdapter = () => createForbiddenAdapter('network');

export function listModelToolNames(tools) {
  return tools?.names ? [...tools.names] : [];
}

export { validateRecipe };
