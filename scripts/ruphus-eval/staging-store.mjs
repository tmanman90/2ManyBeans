import { projectCanonicalRuntime, validateRecipe } from './graders/recipe.mjs';
import {
  LifecycleError, createFixedClock,
  evidenceEnvelope, hashValue, identitySet, immutableSnapshot, stableId,
  validateProposalContract, validateReceiptContract,
} from './contracts.mjs';

export class FellowFailure extends Error {
  constructor(boundary, message = `injected Fellow ${boundary} failure`) {
    super(message);
    this.name = 'FellowFailure';
    this.boundary = boundary;
  }
}

const FELLOW_BOUNDARIES = Object.freeze(['auth', 'device', 'create', 'share', 'cleanup', 'timeout', 'interruption']);
const RECORDING_FELLOWS = new WeakSet();
const REGISTERED_STORES = new WeakSet();

/** A deterministic, recording fake. It has no network or credential path. */
export function createRecordingFellow({ failAt = null } = {}) {
  if (failAt != null && !FELLOW_BOUNDARIES.includes(failAt)) throw new LifecycleError('INVALID_FELLOW_FAILURE', `unknown Fellow failure boundary: ${failAt}`);
  const calls = [];
  const step = (boundary, result) => {
    calls.push(Object.freeze({ boundary }));
    if (failAt === boundary) throw new FellowFailure(boundary);
    return result;
  };
  const fake = {
    get calls() { return calls.map((call) => ({ ...call })); },
    async checkTimeout() { return step('timeout', { checked: true }); },
    async checkInterruption() { return step('interruption', { checked: true }); },
    async authenticate() { return step('auth', { token: 'synthetic-token' }); },
    async discoverDevice() { return step('device', { deviceId: 'synthetic-aiden' }); },
    async createProfile(profile) { return step('create', { profileId: stableId('fellow-profile', profile) }); },
    async shareProfile(profileId) { return step('share', { shareId: stableId('fellow-share', profileId), shareUrl: `https://fellow.invalid/evaluation/${profileId}` }); },
    async cleanupProfile(profileId) { return step('cleanup', { cleaned: true, profileId }); },
  };
  RECORDING_FELLOWS.add(fake);
  return Object.freeze(fake);
}

function clone(value) { return value === undefined ? undefined : structuredClone(value); }

function positiveInteger(value) { return Number.isInteger(value) && value >= 0; }

export class StagingStore {
  constructor({ clock = createFixedClock(), fellow = createRecordingFellow(), userId = 'user-eval-1' } = {}) {
    if (!RECORDING_FELLOWS.has(fellow)) throw new LifecycleError('FORBIDDEN_EXTERNAL_ADAPTER', 'staging store requires the synthetic recording Fellow');
    this.clock = clock;
    this.fellow = fellow;
    this.defaultUserId = userId;
    this.resetCount = 0;
    this.reset();
    REGISTERED_STORES.add(this);
  }

  reset({ userId = this.defaultUserId, coffeeId = 'coffee-eval-1', method = 'aiden', recipe = null, coffee = {}, entitlement = true, failures = {}, sessionId = null } = {}) {
    if (typeof userId !== 'string' || !userId || typeof coffeeId !== 'string' || !coffeeId) throw new LifecycleError('INVALID_FIXTURE', 'user and coffee identities are required');
    const initialRecipe = clone(recipe);
    const initialHash = hashValue(initialRecipe);
    this.resetCount += 1;
    const ids = identitySet({ userId, coffeeId, recipeId: stableId('recipe', { coffeeId, recipeHash: initialHash }), sessionId: sessionId || stableId('session', { userId, coffeeId, attempt: this.resetCount }) });
    this.state = {
      ids,
      user: { id: userId },
      coffee: { ...clone(coffee), id: coffeeId, userId, name: coffee.name || 'Synthetic coffee' },
      method,
      entitlement: entitlement === true,
      failures: clone(failures) || {},
      revisions: [{ id: stableId('revision', { coffeeId, number: 0, initialHash }), recipeId: ids.recipeId, number: 0, parentRevisionId: null, recipe: initialRecipe, recipeHash: initialHash, operation: 'initial', createdAt: this.clock.now() }],
      proposals: new Map(), approvals: new Map(), idempotency: new Map(), brews: new Map(), tastings: new Map(), sessions: new Map(), ledger: [], sequence: 0,
    };
    this._record('reset', { userId, coffeeId, sessionId: ids.sessionId });
    return this.snapshot();
  }

  snapshot() {
    const s = this.state;
    return immutableSnapshot({
      identities: s.ids, user: s.user, coffee: s.coffee, method: s.method, entitlement: s.entitlement,
      revisions: s.revisions, proposals: [...s.proposals.values()], approvals: [...s.approvals.values()],
      brews: [...s.brews.values()], tastings: [...s.tastings.values()], sessions: [...s.sessions.values()], ledger: s.ledger,
    });
  }

  _record(kind, data = {}) {
    const event = immutableSnapshot({
      eventId: stableId('event', { sessionId: this.state.ids.sessionId, sequence: this.state.sequence, kind }),
      sequence: this.state.sequence++, timestamp: this.clock.now(), kind, ...clone(data),
      sessionId: this.state.ids.sessionId, revisionId: this._currentRevision()?.id || null,
    });
    this.state.ledger.push(event);
    return event;
  }

  recordToolRequest(name, args = {}, sessionId = this.state.ids.sessionId) {
    this._session(sessionId);
    this._record('tool-request', { name, argumentsHash: hashValue(args) });
  }

  _error(code, message, details = {}) {
    const error = new LifecycleError(code, message, details);
    this._record('failure', { code, message, details });
    throw error;
  }

  _auth(userId) {
    if (typeof userId !== 'string' || userId !== this.state.user.id) this._error('UNAUTHORIZED', 'user is not authorized for this evaluation state', { userId });
  }

  _session(sessionId) {
    if (typeof sessionId !== 'string' || sessionId !== this.state.ids.sessionId) {
      // A handle from a prior reset must not even append a failure event to the
      // new attempt; stale-generation rejection is intentionally side-effect free.
      throw new LifecycleError('STALE_SESSION', 'session identity is not the current attempt', { sessionId, currentSessionId: this.state.ids.sessionId });
    }
  }

  _cachedResult(key, fingerprint, operation) {
    const entry = this.state.idempotency.get(key);
    if (!entry) return null;
    if (entry.fingerprint !== fingerprint) this._error('IDEMPOTENCY_CONFLICT', `${operation} idempotency key was reused with different arguments`);
    this._record('idempotency-replay', { operation, idempotencyKey: key });
    return clone(entry.result);
  }

  _cacheResult(key, fingerprint, result) {
    this.state.idempotency.set(key, { fingerprint, result });
  }

  _assertProposal(proposal) {
    const validation = validateProposalContract(proposal);
    if (!validation.valid) this._error('INVALID_PROPOSAL_CONTRACT', 'proposal does not satisfy the immutable contract', { errors: validation.errors });
    return proposal;
  }

  _assertReceipt(receipt) {
    const validation = validateReceiptContract(receipt);
    if (!validation.valid) this._error('INVALID_RECEIPT_CONTRACT', 'receipt does not satisfy the immutable contract', { errors: validation.errors });
    return immutableSnapshot(receipt);
  }

  _storeProposal(proposal) {
    this._assertProposal(proposal);
    this.state.proposals.set(proposal.id, proposal);
  }

  _coffee(coffeeId) {
    if (typeof coffeeId !== 'string' || coffeeId !== this.state.coffee.id) this._error('WRONG_COFFEE', 'coffee identity does not match the session', { coffeeId });
  }

  _entitled() {
    if (!this.state.entitlement) this._error('ENTITLEMENT_DENIED', 'evaluation user is not entitled to mutate staging state');
  }

  _readGuard(userId, coffeeId) {
    this._auth(userId); this._coffee(coffeeId);
    if (this.state.failures.read) this._error('READ_FAILED', 'synthetic Coffee read failed');
  }

  _currentRevision() { return this.state.revisions.at(-1); }

  _revision(expectedRevision, revisionId = null) {
    const current = this._currentRevision();
    if (!positiveInteger(expectedRevision) || expectedRevision !== current.number) this._error('STALE_REVISION', 'expected revision is stale', { expectedRevision, currentRevision: current.number });
    if (revisionId != null && revisionId !== current.id) this._error('STALE_REVISION', 'revision identity is stale', { revisionId, currentRevisionId: current.id });
    return current;
  }

  readCoffee({ userId = this.state.user.id, coffeeId = this.state.coffee.id, sessionId = this.state.ids.sessionId } = {}) {
    this._session(sessionId);
    this._readGuard(userId, coffeeId);
    const revision = this._currentRevision();
    this._record('read', { userId, coffeeId, revision: revision.number });
    return immutableSnapshot({ coffee: this.state.coffee, revision: { ...revision, recipe: clone(revision.recipe) }, userId });
  }

  readRecipe({ userId = this.state.user.id, coffeeId = this.state.coffee.id, sessionId = this.state.ids.sessionId } = {}) {
    const result = this.readCoffee({ userId, coffeeId, sessionId });
    const evidence = evidenceEnvelope({ source: 'recipe', trust: 'canonical', recordId: { kind: 'revision', id: result.revision.id }, data: result.revision.recipe });
    return immutableSnapshot({ ...result, evidence });
  }

  readTastings({ userId = this.state.user.id, coffeeId = this.state.coffee.id, sessionId = this.state.ids.sessionId } = {}) {
    this._session(sessionId);
    this._readGuard(userId, coffeeId);
    const values = [...this.state.tastings.values()].filter((tasting) => tasting.coffeeId === coffeeId);
    this._record('read', { userId, coffeeId, collection: 'tastings', count: values.length });
    return immutableSnapshot({ tastings: values, evidence: evidenceEnvelope({ source: 'tasting', trust: 'user-provided', recordId: { kind: 'coffee', id: coffeeId }, data: values }) });
  }

  proposeRecipe({ userId = this.state.user.id, coffeeId = this.state.coffee.id, sessionId = this.state.ids.sessionId, expectedRevision, method = this.state.method, recipe, idempotencyKey } = {}) {
    this._session(sessionId);
    this._auth(userId); this._coffee(coffeeId); this._entitled();
    const current = this._revision(expectedRevision);
    if (method !== this.state.method) this._error('METHOD_MISMATCH', 'proposal method does not match this coffee state');
    if (typeof idempotencyKey !== 'string' || !idempotencyKey) this._error('INVALID_IDEMPOTENCY', 'proposal idempotency key is required');
    const key = `proposal:${idempotencyKey}`;
    const requestFingerprint = hashValue({ userId, coffeeId, expectedRevision, method, recipe });
    const cached = this._cachedResult(key, requestFingerprint, 'propose');
    if (cached) return cached;
    const validation = validateRecipe(method, recipe);
    const projection = projectCanonicalRuntime(method, recipe);
    const canonicalRecipe = projection.valid ? projection.runtime : null;
    const proposalValidation = projection.valid ? validation : { valid: false, errors: [...validation.errors, ...projection.errors] };
    this._record('validation', { operation: 'propose', method, valid: proposalValidation.valid, errors: proposalValidation.errors });
    if (!proposalValidation.valid) {
      const rejected = immutableSnapshot({ ok: false, proposal: null, validation: proposalValidation, receipt: this._assertReceipt({ ok: false, kind: 'invalid-recipe', facts: proposalValidation.errors, claims: ['no mutation'] }) });
      this._cacheResult(key, requestFingerprint, rejected);
      this._record('receipt', { operation: 'propose', receipt: rejected.receipt });
      return rejected;
    }
    const proposal = immutableSnapshot({
      id: stableId('proposal', { userId, coffeeId, expectedRevision, recipeHash: hashValue(canonicalRecipe), idempotencyKey }),
      userId, coffeeId, method, expectedRevision, expectedRevisionId: current.id,
      recipe: clone(canonicalRecipe), recipeHash: hashValue(canonicalRecipe), status: 'pending', createdAt: this.clock.now(),
    });
    this._storeProposal(proposal);
    const result = immutableSnapshot({ ok: true, proposal, validation: proposalValidation, receipt: this._assertReceipt({ ok: true, kind: 'proposal-created', facts: [`proposal ${proposal.id} created`], claims: ['proposal only; no mutation'] }) });
    this._cacheResult(key, requestFingerprint, result);
    this._record('proposal-created', { proposalId: proposal.id, userId, coffeeId, expectedRevision });
    this._record('receipt', { operation: 'propose', proposalId: proposal.id, receipt: result.receipt });
    return clone(result);
  }

  approveProposal({ userId = this.state.user.id, coffeeId = this.state.coffee.id, sessionId = this.state.ids.sessionId, proposalId, expectedRevision } = {}) {
    this._session(sessionId);
    this._auth(userId); this._coffee(coffeeId); this._entitled();
    const proposal = this.state.proposals.get(proposalId);
    if (!proposal) this._error('PROPOSAL_NOT_FOUND', 'proposal does not exist');
    if (proposal.userId !== userId || proposal.coffeeId !== coffeeId) this._error('APPROVAL_BINDING_MISMATCH', 'approval identity does not match proposal');
    if (proposal.expectedRevision !== expectedRevision) this._error('STALE_REVISION', 'proposal expected revision does not match approval request');
    const existing = [...this.state.approvals.values()].find((approval) => approval.proposalId === proposalId);
    if (existing) {
      this._record('idempotency-replay', { operation: 'approve', proposalId });
      return clone(existing.result);
    }
    if (proposal.expectedRevisionId !== this._currentRevision().id) this._error('STALE_REVISION', 'proposal expected revision is stale');
    if (proposal.status !== 'pending') this._error('PROPOSAL_NOT_PENDING', 'proposal is no longer pending approval');
    const approval = immutableSnapshot({ id: stableId('approval', { userId, coffeeId, proposalId, proposalHash: proposal.recipeHash, expectedRevision }), userId, coffeeId, proposalId, proposalHash: proposal.recipeHash, expectedRevision, used: false, createdAt: this.clock.now() });
    const result = immutableSnapshot({ ok: true, approval, receipt: this._assertReceipt({ ok: true, kind: 'approval-recorded', facts: [`approval ${approval.id} bound to proposal ${proposal.id}`], claims: ['out-of-band approval; not a model tool'] }) });
    this.state.approvals.set(approval.id, { ...approval, result });
    this._record('approval-recorded', { approvalId: approval.id, proposalId, userId, coffeeId, expectedRevision });
    this._record('receipt', { operation: 'approve', approvalId: approval.id, receipt: result.receipt });
    return clone(result);
  }

  denyProposal({ userId = this.state.user.id, coffeeId = this.state.coffee.id, sessionId = this.state.ids.sessionId, proposalId, expectedRevision, reason = 'user-denied' } = {}) {
    this._session(sessionId);
    this._auth(userId); this._coffee(coffeeId); this._entitled();
    const proposal = this.state.proposals.get(proposalId);
    if (!proposal || proposal.userId !== userId || proposal.coffeeId !== coffeeId) this._error('PROPOSAL_NOT_FOUND', 'proposal is not bound to this user and coffee');
    if (proposal.expectedRevision !== expectedRevision || proposal.expectedRevisionId !== this._currentRevision().id) this._error('STALE_REVISION', 'proposal expected revision is stale');
    if (proposal.status === 'rejected') return clone(proposal.denialResult);
    if (proposal.status !== 'pending') this._error('PROPOSAL_NOT_PENDING', 'applied proposal cannot be denied');
    const result = immutableSnapshot({ ok: true, proposalId, receipt: this._assertReceipt({ ok: true, kind: 'proposal-denied', facts: [`proposal ${proposalId} denied`, `reason=${reason}`], claims: ['no Coffee mutation'] }) });
    this._storeProposal({ ...proposal, status: 'rejected', denialResult: result });
    this._record('state-transition', { operation: 'deny-proposal', proposalId, reason });
    this._record('receipt', { operation: 'deny-proposal', proposalId, receipt: result.receipt });
    return clone(result);
  }

  applyProposal({ userId = this.state.user.id, coffeeId = this.state.coffee.id, sessionId = this.state.ids.sessionId, proposalId, expectedRevision, idempotencyKey, deliverResponse = true } = {}) {
    this._session(sessionId);
    this._auth(userId); this._coffee(coffeeId); this._entitled();
    if (typeof idempotencyKey !== 'string' || !idempotencyKey) this._error('INVALID_IDEMPOTENCY', 'apply idempotency key is required');
    const key = `apply:${idempotencyKey}`;
    const requestFingerprint = hashValue({ userId, coffeeId, proposalId, expectedRevision });
    const cached = this._cachedResult(key, requestFingerprint, 'apply');
    if (cached) return cached;
    const current = this._revision(expectedRevision);
    const proposal = this.state.proposals.get(proposalId);
    if (!proposal || proposal.userId !== userId || proposal.coffeeId !== coffeeId) this._error('PROPOSAL_NOT_FOUND', 'proposal is not bound to this user and coffee');
    const approvalRecord = [...this.state.approvals.values()].find((approval) => approval.proposalId === proposalId);
    if (!approvalRecord || approvalRecord.used || approvalRecord.userId !== userId || approvalRecord.coffeeId !== coffeeId || approvalRecord.expectedRevision !== expectedRevision || approvalRecord.proposalHash !== proposal.recipeHash) this._error('APPROVAL_REQUIRED', 'single-use approval is missing, stale, used, or bound to another proposal');
    const validation = validateRecipe(proposal.method, proposal.recipe);
    this._record('validation', { operation: 'apply', proposalId, valid: validation.valid, errors: validation.errors });
    if (!validation.valid) this._error('INVALID_RECIPE', 'proposal recipe is invalid at commit', { errors: validation.errors });
    const revision = immutableSnapshot({ id: stableId('revision', { coffeeId, number: current.number + 1, parent: current.id, recipeHash: proposal.recipeHash }), recipeId: stableId('recipe', { coffeeId, recipeHash: proposal.recipeHash }), number: current.number + 1, parentRevisionId: current.id, recipe: clone(proposal.recipe), recipeHash: proposal.recipeHash, operation: 'apply-proposal', proposalId, createdAt: this.clock.now() });
    this.state.revisions.push(revision);
    this._storeProposal({ ...proposal, status: 'applied', appliedRevisionId: revision.id });
    this.state.approvals.set(approvalRecord.id, { ...approvalRecord, used: true });
    const result = immutableSnapshot({ ok: true, revision, receipt: this._assertReceipt({ ok: true, kind: 'coffee-commit-confirmed', facts: [`coffee ${coffeeId} committed revision ${revision.number}`, `revisionId=${revision.id}`], claims: ['Coffee state committed', 'physical brew not confirmed'] }) });
    this._cacheResult(key, requestFingerprint, result);
    this._record('state-transition', { operation: 'apply', proposalId, revisionId: revision.id, revision: revision.number });
    this._record('receipt', { operation: 'apply', proposalId, revisionId: revision.id, receipt: result.receipt });
    if (!deliverResponse) {
      const error = new LifecycleError('COMMIT_RESPONSE_LOST', 'commit succeeded but response delivery was interrupted', { revisionId: revision.id });
      error.result = clone(result);
      throw error;
    }
    return clone(result);
  }

  undoRevision({ userId = this.state.user.id, coffeeId = this.state.coffee.id, sessionId = this.state.ids.sessionId, expectedRevision, idempotencyKey } = {}) {
    this._session(sessionId);
    this._auth(userId); this._coffee(coffeeId); this._entitled();
    if (typeof idempotencyKey !== 'string' || !idempotencyKey) this._error('INVALID_IDEMPOTENCY', 'undo idempotency key is required');
    const key = `undo:${idempotencyKey}`;
    const requestFingerprint = hashValue({ userId, coffeeId, expectedRevision });
    const cached = this._cachedResult(key, requestFingerprint, 'undo');
    if (cached) return cached;
    const current = this._revision(expectedRevision);
    if (current.parentRevisionId == null) this._error('NOTHING_TO_UNDO', 'initial revision cannot be undone');
    const previous = this.state.revisions.find((revision) => revision.id === current.parentRevisionId);
    if (!previous) this._error('REVISION_NOT_FOUND', 'undo parent revision is missing');
    const revision = immutableSnapshot({ id: stableId('revision', { coffeeId, number: current.number + 1, parent: current.id, recipeHash: previous.recipeHash, operation: 'undo' }), recipeId: previous.recipeId, number: current.number + 1, parentRevisionId: current.id, recipe: clone(previous.recipe), recipeHash: previous.recipeHash, operation: 'undo', undoneRevisionId: current.id, createdAt: this.clock.now() });
    this.state.revisions.push(revision);
    const result = immutableSnapshot({ ok: true, revision, receipt: this._assertReceipt({ ok: true, kind: 'undo-committed', facts: [`undo created revision ${revision.number} from ${current.number}`], claims: ['Coffee state committed', 'physical brew not confirmed'] }) });
    this._cacheResult(key, requestFingerprint, result);
    this._record('state-transition', { operation: 'undo', revisionId: revision.id, undoneRevisionId: current.id });
    this._record('receipt', { operation: 'undo', revisionId: revision.id, receipt: result.receipt });
    return clone(result);
  }

  async prepareBrew({ userId = this.state.user.id, coffeeId = this.state.coffee.id, sessionId = this.state.ids.sessionId, expectedRevision, revisionId } = {}) {
    this._session(sessionId);
    this._auth(userId); this._coffee(coffeeId); this._entitled();
    const revision = this._revision(expectedRevision, revisionId);
    if (revision.operation !== 'apply-proposal' || !revision.proposalId) this._error('UNPREPARED_REVISION', 'only an applied proposal revision can be prepared');
    const proposal = this.state.proposals.get(revision.proposalId);
    const approval = proposal && [...this.state.approvals.values()].find((candidate) => candidate.proposalId === proposal.id);
    if (!proposal || proposal.status !== 'applied' || proposal.appliedRevisionId !== revision.id || !approval?.used || approval.proposalHash !== revision.recipeHash) {
      this._error('UNPREPARED_REVISION', 'revision is not backed by an applied approved proposal');
    }
    const validation = validateRecipe(this.state.method, revision.recipe);
    this._record('validation', { operation: 'prepare-brew', revisionId: revision.id, valid: validation.valid, errors: validation.errors });
    if (!validation.valid) this._error('INVALID_RECIPE', 'revision cannot be prepared', { errors: validation.errors });
    const brewId = stableId('brew', { coffeeId, revisionId: revision.id });
    let shared = null;
    let profileId = null;
    try {
      if (this.state.method !== 'aiden') {
        const brew = immutableSnapshot({ id: brewId, coffeeId, revisionId: revision.id, status: 'coffee-side-timer-prepared', createdAt: this.clock.now() });
        this.state.brews.set(brewId, brew);
        const result = immutableSnapshot({ ok: true, brew, receipt: this._assertReceipt({ ok: true, kind: 'coffee-side-preparation-confirmed', facts: [`revision ${revision.number} prepared in Coffee-side timer`], claims: ['Coffee-side timer preparation confirmed', 'Fellow not called', 'physical brew not confirmed'] }) });
        this._record('state-transition', { operation: 'prepare-brew', brewId, revisionId: revision.id, status: 'coffee-side-timer-prepared' });
        this._record('receipt', { operation: 'prepare-brew', brewId, receipt: result.receipt });
        return result;
      }
      if (typeof this.fellow.checkTimeout === 'function') await this.fellow.checkTimeout();
      if (typeof this.fellow.checkInterruption === 'function') await this.fellow.checkInterruption();
      const auth = await this.fellow.authenticate();
      const device = await this.fellow.discoverDevice(auth);
      const profile = await this.fellow.createProfile(revision.recipe, device);
      profileId = profile.profileId;
      shared = await this.fellow.shareProfile(profileId);
      const cleanup = await this.fellow.cleanupProfile(profileId);
      const brew = immutableSnapshot({ id: brewId, coffeeId, revisionId: revision.id, status: 'coffee-prepared', shareId: shared.shareId, cleanup, createdAt: this.clock.now() });
      this.state.brews.set(brewId, brew);
      const result = immutableSnapshot({ ok: true, brew, receipt: this._assertReceipt({ ok: true, kind: 'coffee-side-preparation-confirmed', facts: [`revision ${revision.number} prepared in Coffee-side fake`, `shareId=${shared.shareId}`], claims: ['Coffee-side preparation confirmed', 'machine receipt not confirmed', 'physical brew not confirmed'] }) });
      this._record('state-transition', { operation: 'prepare-brew', brewId, revisionId: revision.id, status: 'coffee-prepared' });
      this._record('receipt', { operation: 'prepare-brew', brewId, receipt: result.receipt });
      return result;
    } catch (error) {
      this._record('failure', { operation: 'prepare-brew', brewId, revisionId: revision.id, boundary: error.boundary || null, code: error.code || 'FELLOW_FAILURE' });
      const shareFact = shared ? `share ${shared.shareId} confirmed before failure` : null;
      const facts = [`Fellow fake failed at ${error.boundary || 'unknown boundary'}`, shareFact].filter(Boolean);
      const result = immutableSnapshot({ ok: false, brew: null, error: { code: error.code || 'FELLOW_FAILURE', boundary: error.boundary || null }, receipt: this._assertReceipt({ ok: false, kind: 'coffee-side-preparation-failed', facts, claims: [shared ? 'Coffee-side share confirmed' : 'Coffee-side share not confirmed', 'machine receipt not confirmed', 'physical brew not confirmed'] }) });
      this.state.brews.set(brewId, immutableSnapshot({ id: brewId, coffeeId, revisionId: revision.id, status: 'failed', shareId: shared?.shareId || null, profileId, failureBoundary: error.boundary || null, createdAt: this.clock.now() }));
      this._record('receipt', { operation: 'prepare-brew', brewId, receipt: result.receipt });
      return result;
    }
  }

  recordTasting({ userId = this.state.user.id, coffeeId = this.state.coffee.id, sessionId = this.state.ids.sessionId, revisionId = this._currentRevision().id, notes = {}, tastingId = null } = {}) {
    this._session(sessionId);
    this._auth(userId); this._coffee(coffeeId);
    if (!this.state.revisions.some((revision) => revision.id === revisionId)) this._error('REVISION_NOT_FOUND', 'tasting revision does not belong to this coffee');
    const id = tastingId || stableId('tasting', { userId, coffeeId, revisionId, notes });
    if (this.state.tastings.has(id)) return clone(this.state.tastings.get(id));
    const tasting = immutableSnapshot({ id, userId, coffeeId, revisionId, notes: clone(notes), createdAt: this.clock.now() });
    this.state.tastings.set(id, tasting);
    this._record('tasting-recorded', { tastingId: id, coffeeId, revisionId });
    return clone(tasting);
  }

  completeTurn({ userId = this.state.user.id, sessionId = this.state.ids.sessionId, outcome = 'complete', receipt = null } = {}) {
    this._auth(userId);
    if (typeof sessionId !== 'string' || !sessionId || sessionId !== this.state.ids.sessionId) this._error('INVALID_SESSION', 'session identity is not the current attempt');
    if (receipt != null) this._assertReceipt(receipt);
    const existing = this.state.sessions.get(sessionId);
    if (existing) return clone(existing);
    const session = immutableSnapshot({ id: sessionId, userId, outcome, receipt: clone(receipt), completedAt: this.clock.now() });
    this.state.sessions.set(sessionId, session);
    this._record('turn-completed', { sessionId, outcome });
    return clone(session);
  }
}

/** Narrow evaluator trust boundary: lifecycle grading may inspect only stores made by this module. */
export function isRegisteredStagingStore(value) { return Boolean(value && typeof value === 'object' && REGISTERED_STORES.has(value)); }

export function readRegisteredStagingExecution(store) {
  if (!isRegisteredStagingStore(store)) throw new LifecycleError('UNREGISTERED_STAGING_STORE', 'lifecycle execution must come from a registered staging store');
  const snapshot = store.snapshot();
  return immutableSnapshot({ snapshot, lifecycle: snapshot.lifecycle, events: snapshot.ledger });
}

export { FELLOW_BOUNDARIES };
