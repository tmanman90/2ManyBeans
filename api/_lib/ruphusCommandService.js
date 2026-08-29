import { canonicalHash, clone } from '../../src/lib/ruphus/contracts.js';
import { resolveLegacyRecipe, validateExecutableRecipe } from '../../src/lib/ruphus/legacyRecipeResolver.js';

export const MUTATION_MODES = Object.freeze(['apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'complete_attempt', 'prepare_attempt', 'promote_attempt', 'undo_revision']);
export const ORDINARY_MODES = Object.freeze(['replace_active_recipe', 'set_dose', 'set_aiden_grind', 'set_aiden_link']);

const id = (prefix, actionId) => `${prefix}_${String(actionId || Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48)}`;
const fail = (code, message, details = {}) => { throw Object.assign(new Error(message), { code, details }); };
const slotMethod = (slotKey) => slotKey === 'aiden' ? 'aiden' : slotKey?.startsWith('kalita') ? 'kalita' : 'v60';
const slotMode = (slotKey) => slotKey?.endsWith('iced') ? 'iced' : 'hot';
const projection = (bean, slotKey, recipe) => {
  const next = { ...bean };
  if (slotKey === 'aiden') next.aidenRecipe = clone(recipe);
  else {
    const mapKey = slotMethod(slotKey) === 'kalita' ? 'kalita' : 'v60';
    const mapName = slotMode(slotKey) === 'iced' ? 'handBrewIcedRecipes' : 'handBrewRecipes';
    next[mapName] = { ...(next[mapName] || {}), [mapKey]: clone(recipe) };
    if (mapName === 'handBrewRecipes' && next.handBrewRecipe?.device === recipe.device) next.handBrewRecipe = clone(recipe);
  }
  next.activeRevisionIds = { ...(next.activeRevisionIds || {}) };
  return next;
};
const stableProjectionHash = (recipe, slotKey) => {
  const value = clone(recipe || {});
  value.method = slotMethod(slotKey);
  value.device = slotMethod(slotKey);
  value.mode = slotMode(slotKey);
  delete value.userCoffeeGrams;
  delete value.aidenGrind;
  delete value.recipeHash;
  return canonicalHash(value);
};
const exactProjectionHash = (recipe, slotKey) => {
  const value = clone(recipe || {});
  value.method = slotMethod(slotKey); value.device = slotMethod(slotKey); value.mode = slotMode(slotKey);
  delete value.recipeHash;
  return canonicalHash(value);
};
const revisionFor = (state, bean, coffeeId, slotKey) => {
  const revisionId = bean.activeRevisionIds?.[slotKey];
  if (revisionId && state.revisions.has(revisionId)) {
    const current = state.revisions.get(revisionId);
    const live = resolveLegacyRecipe({ ...bean, id: coffeeId }, slotKey);
    if (!live.ok) fail('source_drift', 'The saved recipe is missing or ambiguous outside the command boundary; refresh before trying this action.');
    const strict = ['apply_proposal', 'brew_once', 'keep_current', 'undo_revision', 'promote_attempt'].includes(state.commandMode);
    const liveHash = strict ? exactProjectionHash(live.recipe, slotKey) : stableProjectionHash(live.recipe, slotKey);
    const currentHash = strict ? exactProjectionHash(current.snapshot, slotKey) : stableProjectionHash(current.snapshot, slotKey);
    if (liveHash !== currentHash) fail('source_drift', 'The saved recipe changed outside the command boundary; refresh before trying this action.');
    return current;
  }
  const resolved = resolveLegacyRecipe({ ...bean, id: coffeeId }, slotKey);
  if (!resolved.ok) fail(resolved.code, 'No valid recipe is available for this slot.');
  const initial = { id: id('revision', `${coffeeId}-${slotKey}-initial`), ownerId: state.uid, coffeeId, slotKey, parentId: null, snapshot: clone(resolved.recipe), snapshotHash: canonicalHash(resolved.recipe), source: 'initial', status: 'active', createdAt: state.now() };
  state.revisions.set(initial.id, initial);
  bean.activeRevisionIds = { ...(bean.activeRevisionIds || {}), [slotKey]: initial.id };
  state.beans.set(coffeeId, bean);
  return initial;
};
const checkExpected = (current, command) => {
  if (command.expectedRevisionId && command.expectedRevisionId !== current.id) fail('stale', 'The recipe is stale; it changed since this action was prepared.', { currentRevisionId: current.id });
  if (command.expectedRevisionHash && command.expectedRevisionHash !== current.snapshotHash) fail('stale', 'The recipe is stale; it changed since this action was prepared.', { currentRevisionHash: current.snapshotHash });
};
const assertLinkPatch = (patch) => {
  if (!patch) return;
  const allowed = new Set(['aidenLink', 'aidenIcedLink', 'aidenUsedRelay', 'aidenIcedUsedRelay']);
  if (Object.keys(patch).some((key) => !allowed.has(key))) fail('invalid_action', 'Only Aiden link state may be updated by this command.');
};
const applyBeanPatch = (target, patch = {}) => {
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split('.');
    let cursor = target;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) cursor[key] = clone(value);
      else cursor = cursor[key] = { ...(cursor[key] || {}) };
    });
  }
};
const assertRecipePatch = (patch) => {
  if (!patch) return;
  const allowed = new Set(['aidenRecipe', 'aidenGrind', 'aidenLink', 'aidenUsedRelay', 'aidenIcedLink', 'aidenIcedUsedRelay', 'handBrewRecipes', 'handBrewIcedRecipes', 'handBrewRecipe']);
  if (Object.keys(patch).some((key) => !allowed.has(key) && !key.startsWith('handBrewRecipes.') && !key.startsWith('handBrewIcedRecipes.') && !key.startsWith('handBrewRecipe.'))) fail('invalid_action', 'Only recipe projection fields may be updated by this command.');
};
const receipt = ({ actionId, mode, status = 'succeeded', ...fields }) => ({ id: id('receipt', actionId), actionId, mode, status, ...fields, createdAt: new Date().toISOString() });

export function createMemoryCommandStore({ uid = 'user-1', clock = () => Date.now() } = {}) {
  const state = { uid, now: clock, beans: new Map(), revisions: new Map(), proposals: new Map(), attempts: new Map(), actions: new Map(), receipts: new Map() };
  const execute = (command = {}) => {
    if (!command.actionId) fail('invalid_action', 'actionId is required');
    if (!command.coffeeId) fail('invalid_action', 'coffeeId is required');
    const fingerprint = canonicalHash({ ...command, uid: state.uid });
    const prior = state.actions.get(command.actionId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail('idempotency_conflict', 'Idempotency key was reused with different input.');
      return clone(prior.result);
    }
    const bean = state.beans.get(command.coffeeId);
    if (!bean || bean.ownerId && bean.ownerId !== state.uid) fail('not_found', 'Coffee is not available.');
    const slotKey = command.slotKey || (command.mode === 'set_aiden_grind' ? 'aiden' : command.mode === 'set_dose' ? 'v60_hot' : null);
    if (!slotKey) fail('invalid_action', 'slotKey is required');
    state.commandMode = command.mode;
    const current = revisionFor(state, bean, command.coffeeId, slotKey);
    checkExpected(current, command);
    const mode = command.mode;
    if (!MUTATION_MODES.includes(mode) && !ORDINARY_MODES.includes(mode)) fail('unsupported_mode', 'Unsupported recipe command.');
    let result;
    if (mode === 'replace_active_recipe') {
      if (!command.recipe) fail('invalid_recipe', 'Recipe is required.');
      assertRecipePatch(command.patch);
      const validation = validateExecutableRecipe(command.recipe, slotKey);
      if (!validation.valid) fail('invalid_recipe', validation.errors.join('; '), { errors: validation.errors });
      result = commitRevision(state, bean, current, command, command.recipe, 'replace');
      if (command.patch) applyBeanPatch(state.beans.get(command.coffeeId), command.patch);
    } else if (mode === 'set_dose') {
      if (!Number.isFinite(command.dose) || command.dose <= 0) fail('invalid_dose', 'Dose must be positive.');
      const next = projection(bean, slotKey, { ...current.snapshot, userCoffeeGrams: command.dose });
      state.beans.set(command.coffeeId, next);
      result = { ok: true, receipt: receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey, revisionId: current.id, status: 'succeeded' }), bean: next };
    } else if (mode === 'set_aiden_grind') {
      assertRecipePatch(command.patch);
      const next = { ...bean, aidenGrind: clone(command.grind) };
      applyBeanPatch(next, command.patch);
      state.beans.set(command.coffeeId, next);
      result = { ok: true, receipt: receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey, revisionId: current.id, status: 'succeeded' }), bean: next };
    } else if (mode === 'set_aiden_link') {
      assertLinkPatch(command.patch);
      const next = { ...bean, ...(command.link == null ? {} : { aidenLink: String(command.link) }), ...(command.icedLink == null ? {} : { aidenIcedLink: String(command.icedLink) }), ...clone(command.patch || {}) };
      state.beans.set(command.coffeeId, next);
      result = { ok: true, receipt: receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey, revisionId: current.id, status: 'succeeded' }), bean: next };
    } else if (mode === 'keep_current') {
      const proposal = getProposal(state, command);
      checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash });
      if (proposal.status === 'proposed') proposal.status = 'kept';
      result = { ok: true, proposal: clone(proposal), receipt: receipt({ actionId: command.actionId, mode, proposalId: proposal.id, coffeeId: command.coffeeId }) };
    } else if (mode === 'apply_proposal') {
      const proposal = getProposal(state, command);
      checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash });
      if (proposal.status !== 'proposed') fail('stale', 'This proposal is no longer available.');
      result = commitRevision(state, bean, current, command, proposal.after, 'apply', proposal);
      proposal.status = 'applied'; proposal.appliedRevisionId = result.revision.id;
    } else if (mode === 'brew_once') {
      const proposal = getProposal(state, command);
      checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash });
      if (proposal.status !== 'proposed') fail('stale', 'This proposal is no longer available.');
      const attempt = { id: id('attempt', command.actionId), ownerId: state.uid, coffeeId: command.coffeeId, slotKey, proposalId: proposal.id, revisionId: current.id, snapshot: clone(proposal.after), snapshotHash: canonicalHash(proposal.after), status: 'created', createdAt: new Date(state.now()).toISOString() };
      state.attempts.set(attempt.id, attempt); proposal.status = 'attempt_created'; proposal.attemptId = attempt.id;
      result = { ok: true, attempt: clone(attempt), proposal: clone(proposal), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, proposalId: proposal.id, coffeeId: command.coffeeId, slotKey, revisionId: current.id, physicalBrewConfirmed: false, tastingRequired: true }) };
    } else if (mode === 'start_attempt') {
      const attempt = createAttempt(state, command, current, null);
      result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, revisionId: current.id, physicalBrewConfirmed: false }) };
    } else if (mode === 'undo_revision') {
      if (!current.parentId) fail('nothing_to_undo', 'The initial recipe cannot be undone.');
      const parent = state.revisions.get(current.parentId);
      if (!parent) fail('not_found', 'The revision to restore is unavailable.');
      result = commitRevision(state, bean, current, command, parent.snapshot, 'undo', null, current.id);
      result.receipt = receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey, revisionId: result.revision.id, undoneRevisionId: current.id, restoredRevisionId: parent.id, physicalBrewConfirmed: false, undoAvailable: false });
    } else if (mode === 'promote_attempt') {
      const attempt = state.attempts.get(command.attemptId);
      if (!attempt || attempt.ownerId !== state.uid || attempt.coffeeId !== command.coffeeId) fail('not_found', 'Attempt is unavailable.');
      if (attempt.status !== 'tasted') fail('promote_requires_tasting', 'A tasted attempt is required before promotion.');
      checkExpected(current, command);
      if (attempt.snapshotHash === current.snapshotHash) result = { ok: true, revision: clone(current), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, revisionId: current.id, unchanged: true }) };
      else { result = commitRevision(state, bean, current, command, attempt.snapshot, 'promote', null); attempt.status = 'promoted'; attempt.promotedRevisionId = result.revision.id; result.attempt = clone(attempt); }
    } else if (mode === 'complete_attempt') {
      const attempt = state.attempts.get(command.attemptId);
      if (!attempt || attempt.ownerId !== state.uid || attempt.coffeeId !== command.coffeeId) fail('not_found', 'Attempt is unavailable.');
      if (!['created', 'preparing'].includes(attempt.status)) fail('invalid_attempt_state', 'Only an active attempt can be completed.');
      attempt.status = 'completed'; attempt.completedAt = new Date(state.now()).toISOString();
      result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, coffeeId: command.coffeeId, slotKey, physicalBrewConfirmed: true }) };
    } else {
      const attempt = state.attempts.get(command.attemptId);
      if (!attempt || attempt.ownerId !== state.uid) fail('not_found', 'Attempt is unavailable.');
      if (mode === 'prepare_attempt') { attempt.status = 'preparing'; result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, preparation: 'pending', physicalBrewConfirmed: false }) }; }
      else fail('unsupported_mode', 'Unsupported recipe command.');
    }
    const immutable = clone(result);
    if (immutable.receipt) state.receipts.set(immutable.receipt.id, clone({ ...immutable.receipt, ownerId: state.uid }));
    state.actions.set(command.actionId, { fingerprint, status: 'succeeded', result: immutable });
    return clone(immutable);
  };
  return {
    seedBean(coffeeId, bean) { state.beans.set(coffeeId, clone({ ...bean, id: coffeeId, ownerId: bean.ownerId || state.uid })); },
    seedProposal(proposal) { state.proposals.set(proposal.id, clone(proposal)); },
    seedAttempt(attempt) { state.attempts.set(attempt.id, clone(attempt)); },
    execute,
    getBean: (coffeeId) => clone(state.beans.get(coffeeId)),
    snapshot: () => ({ beans: [...state.beans.values()].map(clone), revisions: [...state.revisions.values()].map(clone), proposals: [...state.proposals.values()].map(clone), attempts: [...state.attempts.values()].map(clone), receipts: [...state.receipts.values()].map(clone), actions: [...state.actions.values()].map(clone) }),
  };
}

function getProposal(state, command) {
  const proposal = state.proposals.get(command.proposalId);
  if (!proposal || proposal.ownerId && proposal.ownerId !== state.uid || proposal.coffeeId !== command.coffeeId) fail('not_found', 'Proposal is unavailable.');
  return proposal;
}
function createAttempt(state, command, revision, proposalId) {
  const attempt = { id: id('attempt', command.actionId), ownerId: state.uid, coffeeId: command.coffeeId, slotKey: command.slotKey, proposalId, revisionId: revision.id, snapshot: clone(revision.snapshot), snapshotHash: revision.snapshotHash, status: 'created', createdAt: new Date(state.now()).toISOString() };
  state.attempts.set(attempt.id, attempt); return attempt;
}
function commitRevision(state, bean, current, command, recipe, source, proposal = null, undoneRevisionId = null) {
  const validation = validateExecutableRecipe(recipe, command.slotKey);
  if (!validation.valid) fail('invalid_recipe', validation.errors.join('; '), { errors: validation.errors });
  const revision = { id: id('revision', command.actionId), ownerId: state.uid, coffeeId: command.coffeeId, slotKey: command.slotKey, parentId: current.id, snapshot: clone(recipe), snapshotHash: canonicalHash(recipe), source, proposalId: proposal?.id || null, undoneRevisionId, status: 'active', createdAt: new Date(state.now()).toISOString() };
  state.revisions.set(revision.id, revision);
  const next = projection(bean, command.slotKey, recipe); next.activeRevisionIds[command.slotKey] = revision.id; state.beans.set(command.coffeeId, next);
  return { ok: true, revision: clone(revision), bean: clone(next), receipt: receipt({ actionId: command.actionId, mode: command.mode, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: revision.id, parentRevisionId: current.id, proposalId: proposal?.id || null, physicalBrewConfirmed: false, undoAvailable: source === 'apply' || source === 'promote' }) };
}

export async function executeRecipeCommand({ db, uid, ...command }) {
  if (!db?.runTransaction || !db?.collection) throw new Error('Firestore database is required');
  if (!uid) fail('owner_required', 'Authenticated owner is required.');
  return db.runTransaction(async (tx) => {
    const beanRef = db.collection('users').doc(uid).collection('beans').doc(command.coffeeId);
    const actionRef = db.collection('users').doc(uid).collection('actions').doc(command.actionId);
    const actionSnap = await tx.get(actionRef);
    if (actionSnap.exists) {
      const prior = actionSnap.data();
      if (prior.fingerprint !== canonicalHash({ ...command, uid })) fail('idempotency_conflict', 'Idempotency key was reused with different input.');
      return prior.result;
    }
    const beanSnap = await tx.get(beanRef);
    if (!beanSnap.exists) fail('not_found', 'Coffee is not available.');
    const bean = { id: command.coffeeId, ...beanSnap.data() };
    const slotKey = command.slotKey || (command.mode === 'set_aiden_grind' ? 'aiden' : command.mode === 'set_dose' ? 'v60_hot' : null);
    if (!slotKey) fail('invalid_action', 'slotKey is required');
    const currentId = bean.activeRevisionIds?.[slotKey];
    const refs = [];
    if (currentId) refs.push({ kind: 'revision', ref: db.collection('users').doc(uid).collection('recipeRevisions').doc(currentId) });
    if (command.proposalId) refs.push({ kind: 'proposal', ref: db.collection('users').doc(uid).collection('proposals').doc(command.proposalId) });
    if (command.attemptId) refs.push({ kind: 'attempt', ref: db.collection('users').doc(uid).collection('brewAttempts').doc(command.attemptId) });
    const snapshots = await Promise.all(refs.map(({ ref }) => tx.get(ref)));
    const state = { uid, now: () => Date.now(), commandMode: command.mode, beans: new Map([[command.coffeeId, bean]]), revisions: new Map(), proposals: new Map(), attempts: new Map(), actions: new Map(), receipts: new Map() };
    refs.forEach(({ kind }, index) => {
      const snap = snapshots[index];
      if (!snap.exists) return;
      const data = { id: snap.id, ...snap.data() };
      if (kind === 'revision') state.revisions.set(snap.id, data);
      if (kind === 'proposal') state.proposals.set(snap.id, data);
      if (kind === 'attempt') state.attempts.set(snap.id, data);
    });
    const loadedRevision = currentId ? state.revisions.get(currentId) : null;
    if (loadedRevision?.parentId) {
      const parentRef = db.collection('users').doc(uid).collection('recipeRevisions').doc(loadedRevision.parentId);
      const parentSnap = await tx.get(parentRef);
      if (parentSnap.exists) state.revisions.set(parentSnap.id, { id: parentSnap.id, ...parentSnap.data() });
    }
    const existingRevisionIds = new Set(state.revisions.keys());
    const beforeBean = clone(bean);
    const result = executeState(state, { ...command, slotKey });
    const changedBean = state.beans.get(command.coffeeId);
    const { id: _id, ownerId: _ownerId, ...beanUpdate } = changedBean;
    if (canonicalHash(beforeBean) !== canonicalHash(changedBean)) tx.update(beanRef, { ...beanUpdate, updatedAt: new Date().toISOString() });
    const revisions = db.collection('users').doc(uid).collection('recipeRevisions');
    if (command.proposalId && state.proposals.has(command.proposalId)) tx.set(db.collection('users').doc(uid).collection('proposals').doc(command.proposalId), clone(state.proposals.get(command.proposalId)), { merge: true });
    if (command.attemptId && state.attempts.has(command.attemptId)) tx.set(db.collection('users').doc(uid).collection('brewAttempts').doc(command.attemptId), clone(state.attempts.get(command.attemptId)), { merge: true });
    const createdAttempt = result.attempt?.id ? state.attempts.get(result.attempt.id) : null;
    if (createdAttempt) tx.create(db.collection('users').doc(uid).collection('brewAttempts').doc(createdAttempt.id), clone(createdAttempt));
    for (const revision of state.revisions.values()) if (!existingRevisionIds.has(revision.id)) tx.create(revisions.doc(revision.id), clone(revision));
    const immutable = clone(result);
    if (immutable.receipt) tx.create(db.collection('users').doc(uid).collection('receipts').doc(immutable.receipt.id), { ...clone(immutable.receipt), ownerId: uid });
    tx.create(actionRef, { actionId: command.actionId, fingerprint: canonicalHash({ ...command, uid }), status: 'succeeded', result: immutable, createdAt: new Date().toISOString() });
    return immutable;
  });
}

function executeState(state, command) {
  // Reuse the exact state machine used by the deterministic store, keeping
  // Firestore responsible only for read-check-write orchestration.
  return executeOnState(state, command);
}

function executeOnState(state, command) {
  const fingerprint = canonicalHash({ ...command, uid: state.uid });
  const bean = state.beans.get(command.coffeeId);
  if (!bean) fail('not_found', 'Coffee is not available.');
  state.commandMode = command.mode;
  const current = revisionFor(state, bean, command.coffeeId, command.slotKey);
  checkExpected(current, command);
  const mode = command.mode;
  let result;
  if (mode === 'replace_active_recipe') {
    const validation = validateExecutableRecipe(command.recipe, command.slotKey);
    if (!validation.valid) fail('invalid_recipe', validation.errors.join('; '), { errors: validation.errors });
    assertRecipePatch(command.patch);
    result = commitRevision(state, bean, current, command, command.recipe, 'replace');
    if (command.patch) applyBeanPatch(state.beans.get(command.coffeeId), command.patch);
  } else if (mode === 'set_dose') {
    if (!Number.isFinite(command.dose) || command.dose <= 0) fail('invalid_dose', 'Dose must be positive.');
    const next = projection(bean, command.slotKey, { ...current.snapshot, userCoffeeGrams: command.dose }); state.beans.set(command.coffeeId, next);
    result = { ok: true, receipt: receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id }) };
  } else if (mode === 'set_aiden_grind') {
    assertRecipePatch(command.patch);
    const next = { ...bean, aidenGrind: clone(command.grind) }; applyBeanPatch(next, command.patch); state.beans.set(command.coffeeId, next);
    result = { ok: true, receipt: receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id }) };
  } else if (mode === 'set_aiden_link') {
    assertLinkPatch(command.patch);
    state.beans.set(command.coffeeId, { ...bean, ...(command.link == null ? {} : { aidenLink: String(command.link) }), ...(command.icedLink == null ? {} : { aidenIcedLink: String(command.icedLink) }), ...clone(command.patch || {}) });
    result = { ok: true, receipt: receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id }) };
  } else if (mode === 'keep_current') {
    const proposal = state.proposals.get(command.proposalId); if (!proposal) fail('not_found', 'Proposal is unavailable.'); checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash }); proposal.status = 'kept'; result = { ok: true, proposal: clone(proposal), receipt: receipt({ actionId: command.actionId, mode, proposalId: proposal.id, coffeeId: command.coffeeId, slotKey: command.slotKey }) };
  } else if (mode === 'apply_proposal') {
    const proposal = state.proposals.get(command.proposalId); if (!proposal || proposal.status !== 'proposed') fail('stale', 'This proposal is no longer available.'); checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash }); result = commitRevision(state, bean, current, command, proposal.after, 'apply', proposal); proposal.status = 'applied'; proposal.appliedRevisionId = result.revision.id;
  } else if (mode === 'brew_once') {
    const proposal = state.proposals.get(command.proposalId); if (!proposal || proposal.status !== 'proposed') fail('stale', 'This proposal is no longer available.'); checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash }); const attempt = { id: id('attempt', command.actionId), ownerId: state.uid, coffeeId: command.coffeeId, slotKey: command.slotKey, proposalId: proposal.id, revisionId: current.id, snapshot: clone(proposal.after), snapshotHash: canonicalHash(proposal.after), status: 'created', createdAt: new Date().toISOString() }; state.attempts.set(attempt.id, attempt); proposal.status = 'attempt_created'; proposal.attemptId = attempt.id; result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, proposalId: proposal.id, coffeeId: command.coffeeId, slotKey: command.slotKey, physicalBrewConfirmed: false, tastingRequired: true }) };
  } else if (mode === 'start_attempt') {
    const attempt = { id: id('attempt', command.actionId), ownerId: state.uid, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id, snapshot: clone(current.snapshot), snapshotHash: current.snapshotHash, status: 'created', createdAt: new Date().toISOString() }; state.attempts.set(attempt.id, attempt); result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, revisionId: current.id, physicalBrewConfirmed: false }) };
  } else if (mode === 'undo_revision') {
    if (!current.parentId) fail('nothing_to_undo', 'The initial recipe cannot be undone.'); const parent = state.revisions.get(current.parentId); if (!parent) fail('not_found', 'The revision to restore is unavailable.'); result = commitRevision(state, bean, current, command, parent.snapshot, 'undo', null, current.id); result.receipt = receipt({ actionId: command.actionId, mode, revisionId: result.revision.id, undoneRevisionId: current.id, restoredRevisionId: parent.id });
  } else if (mode === 'promote_attempt') {
    const attempt = state.attempts.get(command.attemptId); if (!attempt || attempt.ownerId !== state.uid || attempt.coffeeId !== command.coffeeId || attempt.status !== 'tasted') fail('promote_requires_tasting', 'A tasted attempt is required before promotion.'); if (attempt.snapshotHash === current.snapshotHash) result = { ok: true, revision: clone(current), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id, unchanged: true }) }; else { result = commitRevision(state, bean, current, command, attempt.snapshot, 'promote'); attempt.status = 'promoted'; attempt.promotedRevisionId = result.revision.id; }
  } else if (mode === 'complete_attempt') {
    const attempt = state.attempts.get(command.attemptId); if (!attempt || attempt.ownerId !== state.uid || attempt.coffeeId !== command.coffeeId) fail('not_found', 'Attempt is unavailable.'); if (!['created', 'preparing'].includes(attempt.status)) fail('invalid_attempt_state', 'Only an active attempt can be completed.'); attempt.status = 'completed'; attempt.completedAt = new Date().toISOString(); result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, coffeeId: command.coffeeId, slotKey: command.slotKey, physicalBrewConfirmed: true }) };
  } else if (mode === 'prepare_attempt') {
    const attempt = state.attempts.get(command.attemptId); if (!attempt) fail('not_found', 'Attempt is unavailable.'); attempt.status = 'preparing'; result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, preparation: 'pending', physicalBrewConfirmed: false }) };
  } else fail('unsupported_mode', 'Unsupported recipe command.');
  state.actions.set(command.actionId, { fingerprint, status: 'succeeded', result: clone(result) }); return clone(result);
}
