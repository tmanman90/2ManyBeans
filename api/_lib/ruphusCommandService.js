import { canonicalHash, clone, recipeSourceHash } from '../../src/lib/ruphus/contracts.js';
import { validateExecutableRecipe } from '../../src/lib/ruphus/legacyRecipeResolver.js';
import { absentRecipeSourceHash, resolveRecipeSource } from '../../src/lib/ruphus/recipeSourceState.js';
import { normalizeClientVersion } from './ruphusRollout.js';
import { aidenProfileHash } from '../../src/lib/ruphus/aidenProfilePreview.js';

export const MUTATION_MODES = Object.freeze(['apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'timer_started', 'complete_attempt', 'prepare_attempt', 'promote_attempt', 'undo_revision']);
export const ORDINARY_MODES = Object.freeze(['replace_active_recipe', 'set_dose', 'set_aiden_grind', 'set_aiden_link']);

const id = (prefix, actionId) => `${prefix}_${String(actionId || Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48)}`;
const fail = (code, message, details = {}) => { throw Object.assign(new Error(message), { code, details }); };
const slotMethod = (slotKey) => slotKey === 'aiden' ? 'aiden' : slotKey?.startsWith('kalita') ? 'kalita' : 'v60';
const slotMode = (slotKey) => slotKey?.endsWith('iced') ? 'iced' : 'hot';
const projection = (bean, slotKey, recipe) => {
  const next = { ...bean };
  if (slotKey === 'aiden') {
    // Bind legacy links before changing the profile. Retain the link so Undo
    // can reuse it, but never present it as a link to different settings.
    for (const key of ['aidenLink', 'aidenIcedLink']) {
      if (bean[key] && !bean[`${key}ProfileHash`] && bean.aidenRecipe) next[`${key}ProfileHash`] = aidenProfileHash(bean.aidenRecipe);
    }
    next.aidenRecipe = clone(recipe);
  }
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
  return recipeSourceHash(recipe, slotKey);
};
const absentRevision = (state, bean, coffeeId, slotKey) => ({
  id: null,
  ownerId: state.uid,
  coffeeId,
  slotKey,
  parentId: null,
  snapshot: null,
  snapshotHash: absentRecipeSourceHash(slotKey),
  sourceState: 'absent',
  source: 'absent',
  status: 'absent',
});
const revisionFor = (state, bean, coffeeId, slotKey, replacement = null, command = {}) => {
  const revisionId = bean.activeRevisionIds?.[slotKey];
  if (revisionId && state.revisions.has(revisionId)) {
    const current = state.revisions.get(revisionId);
    const live = resolveRecipeSource({ ...bean, id: coffeeId }, slotKey);
    if (!live.ok || live.sourceState !== 'present') fail('source_drift', 'The saved recipe is missing or ambiguous outside the command boundary; refresh before trying this action.');
    const liveHash = live.hash;
    const currentHash = stableProjectionHash(current.snapshot, slotKey);
    if (liveHash !== currentHash) fail('source_drift', 'The saved recipe changed outside the command boundary; refresh before trying this action.');
    return current;
  }
  const resolved = resolveRecipeSource({ ...bean, id: coffeeId }, slotKey);
  if (!resolved.ok && state.commandMode === 'replace_active_recipe' && replacement) {
    const initial = { id: id('revision', `${coffeeId}-${slotKey}-initial`), ownerId: state.uid, coffeeId, slotKey, parentId: null, snapshot: clone(replacement), snapshotHash: stableProjectionHash(replacement, slotKey), ...(slotKey === 'aiden' ? { aidenGrind: clone(bean.aidenGrind || null) } : {}), source: 'initial', status: 'active', createdAt: state.now() };
    state.revisions.set(initial.id, initial);
    bean.activeRevisionIds = { ...(bean.activeRevisionIds || {}), [slotKey]: initial.id };
    state.beans.set(coffeeId, bean);
    return initial;
  }
  if (!resolved.ok) fail(resolved.code, 'No valid recipe is available for this slot.');
  if (resolved.sourceState === 'absent') {
    if (!['apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'timer_started', 'complete_attempt', 'prepare_attempt', 'promote_attempt', 'undo_revision', 'replace_active_recipe'].includes(state.commandMode)) {
      fail('recipe_missing', 'No saved recipe is available for this slot.');
    }
    return absentRevision(state, bean, coffeeId, slotKey);
  }
  // Do not materialize a baseline while checking a proposal that was prepared
  // from an explicitly absent slot. If a saved recipe appeared meanwhile,
  // proposal binding must fail stale without leaving a memory-store write (the
  // Firestore transaction would roll it back on the same failure).
  const proposal = command.proposalId ? state.proposals.get(command.proposalId) : null;
  const attempt = command.attemptId ? state.attempts.get(command.attemptId) : null;
  if ((proposal?.sourceState === 'absent' || attempt?.sourceState === 'absent')
    && ['apply_proposal', 'brew_once', 'keep_current', 'start_attempt', 'timer_started', 'complete_attempt', 'prepare_attempt', 'promote_attempt'].includes(state.commandMode)) return absentRevision(state, bean, coffeeId, slotKey);
  const initial = { id: id('revision', `${coffeeId}-${slotKey}-initial`), ownerId: state.uid, coffeeId, slotKey, parentId: null, snapshot: clone(resolved.recipe), snapshotHash: stableProjectionHash(resolved.recipe, slotKey), ...(slotKey === 'aiden' ? { aidenGrind: clone(bean.aidenGrind || null) } : {}), source: 'initial', status: 'active', createdAt: state.now() };
  state.revisions.set(initial.id, initial);
  bean.activeRevisionIds = { ...(bean.activeRevisionIds || {}), [slotKey]: initial.id };
  state.beans.set(coffeeId, bean);
  return initial;
};
const checkExpected = (current, command) => {
  if (command.expectedRevisionId && command.expectedRevisionId !== current.id) fail('stale', 'The recipe is stale; it changed since this action was prepared.', { currentRevisionId: current.id });
  if (command.expectedRevisionHash && command.expectedRevisionHash !== current.snapshotHash) fail('stale', 'The recipe is stale; it changed since this action was prepared.', { currentRevisionHash: current.snapshotHash });
};
const checkCommandExpected = (state, current, command) => {
  const attempt = state.attempts.get(command.attemptId);
  if (['timer_started', 'complete_attempt'].includes(command.mode) && attempt?.ownerId === state.uid && attempt.coffeeId === command.coffeeId && attempt.slotKey === command.slotKey && attempt.promotedRevisionId === current.id && (!command.expectedRevisionId || command.expectedRevisionId === attempt.revisionId) && (!command.expectedRevisionHash || command.expectedRevisionHash === attempt.sourceHash)) return;
  checkExpected(current, command);
};
const checkProposalBinding = (bean, proposal) => {
  const live = resolveRecipeSource({ ...bean, id: proposal.coffeeId }, proposal.slotKey);
  const proposalSourceState = proposal.sourceState || 'present';
  if (!live.ok || live.sourceState !== proposalSourceState || live.hash !== proposal.sourceHash) fail('stale', 'The recipe changed since this proposal was prepared.');
  if (proposalSourceState === 'absent') return;
  if (proposal.slotKey === 'aiden') {
    if (canonicalHash(bean.aidenGrind ?? null) !== canonicalHash(proposal.sourceAidenGrind ?? null)) fail('stale', 'The Aiden grind changed since this proposal was prepared.');
  } else if (canonicalHash(live.recipe.userCoffeeGrams ?? null) !== canonicalHash(proposal.sourceDose ?? proposal.before?.userCoffeeGrams ?? null)) {
    fail('stale', 'The dose changed since this proposal was prepared.');
  }
};
const checkAttemptBinding = (bean, attempt) => {
  const live = resolveRecipeSource({ ...bean, id: attempt.coffeeId }, attempt.slotKey);
  const boundRecipeHash = attempt.sourceHash || attempt.snapshotHash;
  const attemptSourceState = attempt.sourceState || 'present';
  if (!live.ok || live.sourceState !== attemptSourceState || live.hash !== boundRecipeHash) fail('stale', 'The attempt recipe changed before promotion.');
  if (attemptSourceState === 'absent') return;
  if (attempt.slotKey === 'aiden' && canonicalHash(bean.aidenGrind ?? null) !== canonicalHash(attempt.aidenGrind ?? null)) fail('stale', 'The Aiden grind changed before promotion.');
  if (attempt.slotKey !== 'aiden' && canonicalHash(live.recipe.userCoffeeGrams ?? null) !== canonicalHash(attempt.dose ?? null)) fail('stale', 'The dose changed before promotion.');
};
const assertLinkPatch = (patch) => {
  if (!patch) return;
  const allowed = new Set(['aidenLink', 'aidenIcedLink', 'aidenUsedRelay', 'aidenIcedUsedRelay']);
  if (Object.keys(patch).some((key) => !allowed.has(key))) fail('invalid_action', 'Only Aiden link state may be updated by this command.');
};
const linkProjection = (bean, command) => {
  const patch = { ...(command.link == null ? {} : { aidenLink: String(command.link) }), ...(command.icedLink == null ? {} : { aidenIcedLink: String(command.icedLink) }), ...clone(command.patch || {}) };
  const next = { ...bean, ...patch };
  for (const key of ['aidenLink', 'aidenIcedLink']) {
    if (Object.hasOwn(patch, key)) next[`${key}ProfileHash`] = patch[key] && bean.aidenRecipe ? aidenProfileHash(bean.aidenRecipe) : null;
  }
  return next;
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
const assertRecipePatch = (patch, slotKey, recipe = null) => {
  if (!patch) return;
  const allowed = new Set(['aidenGrind', 'aidenLink', 'aidenUsedRelay', 'aidenIcedLink', 'aidenIcedUsedRelay']);
  const method = slotMethod(slotKey); const iced = slotMode(slotKey) === 'iced';
  const recipeRoot = `${iced ? 'handBrewIcedRecipes' : 'handBrewRecipes'}.${method}`;
  for (const key of Object.keys(patch)) {
    if (allowed.has(key) && (slotKey === 'aiden' || key !== 'aidenGrind')) continue;
    if (slotKey === 'aiden' && key === 'aidenRecipe') continue;
    if (key === recipeRoot || key.startsWith(`${recipeRoot}.`)) continue;
    if (key === (iced ? 'handBrewIcedRecipes' : 'handBrewRecipes')) {
      const value = patch[key];
      if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((entry) => entry === method)) continue;
    }
    if (key === 'handBrewRecipe' || key.startsWith('handBrewRecipe.')) {
      if (slotKey !== 'aiden' && !iced && key === 'handBrewRecipe' && valueMatchesSelected(patch[key], recipe, slotKey)) continue;
    }
    fail('invalid_action', 'Only the selected slot projection may be updated by this command.');
  }
};
const valueMatchesSelected = (mirror, recipe, slotKey) => Boolean(mirror && recipe && (!mirror.device || mirror.device === slotMethod(slotKey)) && (!mirror.method || mirror.method === recipe.method || mirror.device === slotMethod(slotKey)) && stableProjectionHash(mirror, slotKey) === stableProjectionHash(recipe, slotKey));
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
    const current = revisionFor(state, bean, command.coffeeId, slotKey, command.recipe, command);
    checkCommandExpected(state, current, command);
    const mode = command.mode;
    if (!MUTATION_MODES.includes(mode) && !ORDINARY_MODES.includes(mode)) fail('unsupported_mode', 'Unsupported recipe command.');
    let result;
    if (mode === 'replace_active_recipe') {
      if (!command.recipe) fail('invalid_recipe', 'Recipe is required.');
      assertRecipePatch(command.patch, slotKey, command.recipe);
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
      assertRecipePatch(command.patch, slotKey);
      const next = { ...bean, aidenGrind: clone(command.grind) };
      applyBeanPatch(next, command.patch);
      state.beans.set(command.coffeeId, next);
      result = { ok: true, receipt: receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey, revisionId: current.id, status: 'succeeded' }), bean: next };
    } else if (mode === 'set_aiden_link') {
      assertLinkPatch(command.patch);
      const next = linkProjection(bean, command);
      state.beans.set(command.coffeeId, next);
      result = { ok: true, receipt: receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey, revisionId: current.id, status: 'succeeded' }), bean: next };
    } else if (mode === 'keep_current') {
      const proposal = getProposal(state, command);
      checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash });
      checkProposalBinding(bean, proposal);
      if (proposal.status === 'proposed') proposal.status = 'kept';
      result = { ok: true, proposal: clone(proposal), receipt: receipt({ actionId: command.actionId, mode, proposalId: proposal.id, coffeeId: command.coffeeId }) };
    } else if (mode === 'apply_proposal') {
      const proposal = getProposal(state, command);
      checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash });
      if (proposal.status !== 'proposed') fail('stale', 'This proposal is no longer available.');
      checkProposalBinding(bean, proposal);
      result = commitRevision(state, bean, current, command, proposal.after, 'apply', proposal);
      result.receipt.executionAvailable = true;
      proposal.status = 'applied'; proposal.appliedRevisionId = result.revision.id;
    } else if (mode === 'brew_once') {
      const proposal = getProposal(state, command);
      checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash });
      checkProposalBinding(bean, proposal);
      if (proposal.status !== 'proposed') fail('stale', 'This proposal is no longer available.');
      const liveDose = slotKey === 'aiden' || current.sourceState === 'absent' ? null : (resolveRecipeSource({ ...bean, id: command.coffeeId }, slotKey).recipe?.userCoffeeGrams ?? null);
      const attempt = { id: id('attempt', command.actionId), ownerId: state.uid, coffeeId: command.coffeeId, slotKey, proposalId: proposal.id, revisionId: current.id, revisionSource: current.source || null, sourceState: current.sourceState || 'present', sourceHash: current.snapshotHash, snapshot: clone(proposal.after), snapshotHash: stableProjectionHash(proposal.after, slotKey), dose: liveDose, aidenGrind: slotKey === 'aiden' ? clone(bean.aidenGrind ?? null) : null, status: 'created', createdAt: new Date(state.now()).toISOString() };
      state.attempts.set(attempt.id, attempt); proposal.status = 'attempt_created'; proposal.attemptId = attempt.id;
      result = { ok: true, attempt: clone(attempt), proposal: clone(proposal), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, proposalId: proposal.id, coffeeId: command.coffeeId, slotKey, revisionId: current.id, sourceState: attempt.sourceState || 'present', physicalBrewConfirmed: false, tastingRequired: true }) };
    } else if (mode === 'start_attempt') {
      const attempt = createAttempt(state, command, current, null);
      result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, coffeeId: command.coffeeId, slotKey, revisionId: current.id, sourceState: attempt.sourceState || 'present', physicalBrewConfirmed: false }) };
    } else if (mode === 'timer_started') {
      const attempt = state.attempts.get(command.attemptId);
      if (!attempt || attempt.ownerId !== state.uid || attempt.coffeeId !== command.coffeeId) fail('not_found', 'Attempt is unavailable.');
      if (!['created', 'timer_started'].includes(attempt.status)) fail('invalid_attempt_state', 'Timer cannot start for this attempt.');
      attempt.status = 'timer_started'; attempt.timerStartedAt = new Date(state.now()).toISOString();
      result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, coffeeId: command.coffeeId, slotKey, sourceState: attempt.sourceState || 'present', timerStarted: true, physicalBrewConfirmed: false }) };
    } else if (mode === 'undo_revision') {
      if (!current.parentId && current.parentSourceState !== 'absent') fail('nothing_to_undo', 'The initial recipe cannot be undone.');
      if (current.parentSourceState === 'absent') {
        result = commitAbsenceRevision(state, bean, current, command);
        result.receipt = receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey, revisionId: result.revision.id, undoneRevisionId: current.id, restoredRevisionId: null, restoredSourceState: 'absent', sourceState: 'absent', physicalBrewConfirmed: false, undoAvailable: false });
      } else {
        const parent = state.revisions.get(current.parentId);
        if (!parent) fail('not_found', 'The revision to restore is unavailable.');
        result = commitRevision(state, bean, current, command, parent.snapshot, 'undo', null, current.id);
        result.receipt = receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey, revisionId: result.revision.id, undoneRevisionId: current.id, restoredRevisionId: parent.id, physicalBrewConfirmed: false, undoAvailable: false });
      }
    } else if (mode === 'promote_attempt') {
      result = saveAttemptRecipe(state, bean, current, command);
    } else if (mode === 'complete_attempt') {
      const attempt = state.attempts.get(command.attemptId);
      if (!attempt || attempt.ownerId !== state.uid || attempt.coffeeId !== command.coffeeId) fail('not_found', 'Attempt is unavailable.');
      const legalPredecessor = command.slotKey === 'aiden' ? attempt.status === 'profile_prepared' : attempt.status === 'timer_started';
      if (!legalPredecessor) fail('invalid_attempt_state', command.slotKey === 'aiden' ? 'Aiden must be profile-prepared before starting tasting.' : 'The timer must be started before completing this brew.');
      attempt.status = 'completed'; attempt.completedAt = new Date(state.now()).toISOString();
      result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, coffeeId: command.coffeeId, slotKey, sourceState: attempt.sourceState || 'present', timerCompleted: true, physicalBrewConfirmed: false }) };
    } else {
      const attempt = state.attempts.get(command.attemptId);
      if (!attempt || attempt.ownerId !== state.uid) fail('not_found', 'Attempt is unavailable.');
      if (mode === 'prepare_attempt') { attempt.status = 'preparing'; result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, preparation: 'pending', physicalBrewConfirmed: false }) }; }
      else fail('unsupported_mode', 'Unsupported recipe command.');
    }
    if (mode === 'brew_once') Object.assign(result.receipt, { promoteAvailable: true, revisionId: current.id, sourceHash: current.snapshotHash, sourceState: current.sourceState || 'present' });
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
  const live = revision.sourceState === 'absent' ? liveAbsentSource(command.slotKey) : resolveRecipeSource({ ...state.beans.get(command.coffeeId), id: command.coffeeId }, command.slotKey);
  const attempt = { id: id('attempt', command.actionId), ownerId: state.uid, coffeeId: command.coffeeId, slotKey: command.slotKey, proposalId, revisionId: revision.id, revisionSource: revision.source || null, sourceState: revision.sourceState || 'present', sourceHash: revision.snapshotHash, snapshot: clone(revision.snapshot), snapshotHash: stableProjectionHash(revision.snapshot, command.slotKey), ...(command.slotKey === 'aiden' ? { aidenGrind: clone(state.beans.get(command.coffeeId)?.aidenGrind ?? null) } : { dose: live.sourceState === 'present' ? (live.recipe.userCoffeeGrams ?? null) : null }), status: 'created', createdAt: new Date(state.now()).toISOString() };
  state.attempts.set(attempt.id, attempt); return attempt;
}
function commitRevision(state, bean, current, command, recipe, source, proposal = null, undoneRevisionId = null) {
  const validation = validateExecutableRecipe(recipe, command.slotKey);
  if (!validation.valid) fail('invalid_recipe', validation.errors.join('; '), { errors: validation.errors });
  const revision = { id: id('revision', command.actionId), ownerId: state.uid, coffeeId: command.coffeeId, slotKey: command.slotKey, parentId: current.sourceState === 'absent' ? null : current.id, parentSourceState: current.sourceState || 'present', snapshot: clone(recipe), snapshotHash: stableProjectionHash(recipe, command.slotKey), sourceState: 'present', ...(command.slotKey === 'aiden' ? { aidenGrind: clone(command.patch?.aidenGrind ?? bean.aidenGrind ?? null) } : {}), source, proposalId: proposal?.id || null, undoneRevisionId, status: 'active', createdAt: new Date(state.now()).toISOString() };
  state.revisions.set(revision.id, revision);
  const next = projection(bean, command.slotKey, recipe); next.activeRevisionIds[command.slotKey] = revision.id;
  const recipeProvenance = { ...(next.recipeProvenance || {}) };
  if (source === 'apply' || source === 'promote') recipeProvenance[command.slotKey] = { source, revisionId: revision.id, slotKey: command.slotKey };
  if (source === 'replace' || source === 'undo') delete recipeProvenance[command.slotKey];
  next.recipeProvenance = recipeProvenance;
  state.beans.set(command.coffeeId, next);
  return { ok: true, revision: clone(revision), bean: clone(next), receipt: receipt({ actionId: command.actionId, mode: command.mode, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: revision.id, parentRevisionId: current.sourceState === 'absent' ? null : current.id, parentSourceState: current.sourceState || 'present', sourceState: 'present', createdFirstSavedRecipe: current.sourceState === 'absent', proposalId: proposal?.id || null, physicalBrewConfirmed: false, undoAvailable: source === 'apply' || source === 'promote' }) };
}

function liveAbsentSource(slotKey) {
  return { ok: true, sourceState: 'absent', recipe: null, slotKey, hash: absentRecipeSourceHash(slotKey) };
}

function absenceProjection(bean, slotKey) {
  const next = { ...bean };
  if (slotKey === 'aiden') delete next.aidenRecipe;
  else {
    const mapKey = slotMethod(slotKey) === 'kalita' ? 'kalita' : 'v60';
    const mapName = slotMode(slotKey) === 'iced' ? 'handBrewIcedRecipes' : 'handBrewRecipes';
    if (next[mapName] && typeof next[mapName] === 'object') {
      next[mapName] = { ...next[mapName] };
      delete next[mapName][mapKey];
      if (!Object.keys(next[mapName]).length) delete next[mapName];
    }
    const flat = next.handBrewRecipe;
    if (flat && (flat.device === slotMethod(slotKey) || flat.method === slotMethod(slotKey)) && (slotMode(slotKey) === 'iced' ? flat.mode === 'iced' || flat.isIced === true : flat.mode !== 'iced' && flat.isIced !== true)) delete next.handBrewRecipe;
  }
  next.activeRevisionIds = { ...(next.activeRevisionIds || {}) };
  delete next.activeRevisionIds[slotKey];
  if (!Object.keys(next.activeRevisionIds).length) delete next.activeRevisionIds;
  const recipeProvenance = { ...(next.recipeProvenance || {}) };
  delete recipeProvenance[slotKey];
  if (Object.keys(recipeProvenance).length) next.recipeProvenance = recipeProvenance;
  else delete next.recipeProvenance;
  return next;
}

function commitAbsenceRevision(state, bean, current, command) {
  const revision = {
    id: id('revision', command.actionId), ownerId: state.uid, coffeeId: command.coffeeId,
    slotKey: command.slotKey, parentId: current.id || null, parentSourceState: current.sourceState || 'present',
    snapshot: null, snapshotHash: absentRecipeSourceHash(command.slotKey), sourceState: 'absent',
    source: 'undo', proposalId: null, undoneRevisionId: current.id || null, status: 'active',
    createdAt: new Date(state.now()).toISOString(),
  };
  state.revisions.set(revision.id, revision);
  const next = absenceProjection(bean, command.slotKey);
  state.beans.set(command.coffeeId, next);
  return { ok: true, revision: clone(revision), bean: clone(next) };
}

function saveAttemptRecipe(state, bean, current, command) {
  const attempt = state.attempts.get(command.attemptId);
  if (!attempt || attempt.ownerId !== state.uid || attempt.coffeeId !== command.coffeeId || attempt.slotKey !== command.slotKey) fail('not_found', 'This trial is not available for this recipe.');
  if (!['created', 'timer_started', 'profile_prepared', 'completed', 'tasted', 'promoted'].includes(attempt.status)) fail('invalid_attempt_state', 'This trial is not ready to save.');
  if (attempt.promotedRevisionId) {
    if (attempt.promotedRevisionId !== current.id) fail('stale', 'The saved recipe changed after this trial was saved.');
    return { ok: true, revision: clone(current), receipt: receipt({ actionId: command.actionId, mode: command.mode, attemptId: attempt.id, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id, unchanged: true, physicalBrewConfirmed: false }) };
  }
  checkExpected(current, { expectedRevisionId: attempt.revisionId, expectedRevisionHash: attempt.sourceHash });
  checkAttemptBinding(bean, attempt);
  const result = attempt.snapshotHash === current.snapshotHash
    ? { ok: true, revision: clone(current), receipt: receipt({ actionId: command.actionId, mode: command.mode, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id, unchanged: true, physicalBrewConfirmed: false }) }
    : commitRevision(state, bean, current, command, attempt.snapshot, 'promote');
  // Saving is independent of execution: do not turn an active timer into a
  // completed/tasted brew or prevent its subsequent tasting handoff.
  attempt.promotedRevisionId = result.revision.id;
  result.receipt.attemptId = attempt.id;
  result.receipt.proposalId = attempt.proposalId || null;
  return result;
}

export async function executeRecipeCommand({ db, uid, clientVersion = null, ...command }) {
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
    const { id: _id, ...beanUpdate } = changedBean;
    if (canonicalHash(beforeBean) !== canonicalHash(changedBean)) {
      const observedAt = new Date().toISOString();
      const deletedFields = Object.keys(beforeBean).filter((field) => !Object.hasOwn(changedBean, field));
      const update = {
        ...beanUpdate,
        clientVersion: normalizeClientVersion(clientVersion),
        clientVersionUpdatedAt: observedAt,
        updatedAt: observedAt,
      };
      // `update` merges omitted fields in Firestore. Use a full transaction
      // replacement when Undo removes a top-level projection so an absent
      // slot cannot leave the promoted recipe behind in the owner bean.
      if (deletedFields.length) tx.set(beanRef, update);
      else tx.update(beanRef, update);
    }
    const revisions = db.collection('users').doc(uid).collection('recipeRevisions');
    if (command.proposalId && state.proposals.has(command.proposalId)) tx.set(db.collection('users').doc(uid).collection('proposals').doc(command.proposalId), clone(state.proposals.get(command.proposalId)), { merge: true });
    if (command.attemptId && state.attempts.has(command.attemptId)) tx.set(db.collection('users').doc(uid).collection('brewAttempts').doc(command.attemptId), clone(state.attempts.get(command.attemptId)), { merge: true });
    const createdAttempt = result.attempt?.id ? state.attempts.get(result.attempt.id) : null;
    if (createdAttempt && createdAttempt.id !== command.attemptId) tx.create(db.collection('users').doc(uid).collection('brewAttempts').doc(createdAttempt.id), clone(createdAttempt));
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
  const current = revisionFor(state, bean, command.coffeeId, command.slotKey, command.recipe, command);
  checkCommandExpected(state, current, command);
  const mode = command.mode;
  if (['apply_proposal', 'brew_once', 'keep_current'].includes(mode) && command.proposalId) {
    const boundProposal = state.proposals.get(command.proposalId);
    if (boundProposal) checkProposalBinding(bean, boundProposal);
  }
  let result;
  if (mode === 'replace_active_recipe') {
    const validation = validateExecutableRecipe(command.recipe, command.slotKey);
    if (!validation.valid) fail('invalid_recipe', validation.errors.join('; '), { errors: validation.errors });
    assertRecipePatch(command.patch, command.slotKey, command.recipe);
    result = commitRevision(state, bean, current, command, command.recipe, 'replace');
    if (command.patch) applyBeanPatch(state.beans.get(command.coffeeId), command.patch);
  } else if (mode === 'set_dose') {
    if (!Number.isFinite(command.dose) || command.dose <= 0) fail('invalid_dose', 'Dose must be positive.');
    const next = projection(bean, command.slotKey, { ...current.snapshot, userCoffeeGrams: command.dose }); state.beans.set(command.coffeeId, next);
    result = { ok: true, receipt: receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id }) };
  } else if (mode === 'set_aiden_grind') {
    assertRecipePatch(command.patch, command.slotKey);
    const next = { ...bean, aidenGrind: clone(command.grind) }; applyBeanPatch(next, command.patch); state.beans.set(command.coffeeId, next);
    result = { ok: true, receipt: receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id }) };
  } else if (mode === 'set_aiden_link') {
    assertLinkPatch(command.patch);
    state.beans.set(command.coffeeId, linkProjection(bean, command));
    result = { ok: true, receipt: receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id }) };
  } else if (mode === 'keep_current') {
    const proposal = state.proposals.get(command.proposalId); if (!proposal) fail('not_found', 'Proposal is unavailable.'); checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash }); checkProposalBinding(bean, proposal); proposal.status = 'kept'; result = { ok: true, proposal: clone(proposal), receipt: receipt({ actionId: command.actionId, mode, proposalId: proposal.id, coffeeId: command.coffeeId, slotKey: command.slotKey }) };
  } else if (mode === 'apply_proposal') {
    const proposal = state.proposals.get(command.proposalId); if (!proposal || proposal.status !== 'proposed') fail('stale', 'This proposal is no longer available.'); checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash }); checkProposalBinding(bean, proposal); result = commitRevision(state, bean, current, command, proposal.after, 'apply', proposal); result.receipt.executionAvailable = true; proposal.status = 'applied'; proposal.appliedRevisionId = result.revision.id;
  } else if (mode === 'brew_once') {
    const proposal = state.proposals.get(command.proposalId); if (!proposal || proposal.status !== 'proposed') fail('stale', 'This proposal is no longer available.'); checkExpected(current, { expectedRevisionId: proposal.sourceRevisionId, expectedRevisionHash: proposal.sourceHash }); const liveBrew = current.sourceState === 'absent' ? liveAbsentSource(command.slotKey) : resolveRecipeSource({ ...bean, id: command.coffeeId }, command.slotKey); const attempt = { id: id('attempt', command.actionId), ownerId: state.uid, coffeeId: command.coffeeId, slotKey: command.slotKey, proposalId: proposal.id, revisionId: current.id, revisionSource: current.source || null, sourceState: current.sourceState || 'present', sourceHash: current.snapshotHash, snapshot: clone(proposal.after), snapshotHash: stableProjectionHash(proposal.after, command.slotKey), ...(command.slotKey === 'aiden' ? { aidenGrind: clone(bean.aidenGrind ?? null) } : { dose: liveBrew.sourceState === 'present' ? (liveBrew.recipe.userCoffeeGrams ?? null) : null }), status: 'created', createdAt: new Date().toISOString() }; state.attempts.set(attempt.id, attempt); proposal.status = 'attempt_created'; proposal.attemptId = attempt.id; result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, proposalId: proposal.id, coffeeId: command.coffeeId, slotKey: command.slotKey, sourceState: attempt.sourceState, physicalBrewConfirmed: false, tastingRequired: true }) };
  } else if (mode === 'start_attempt') {
    const liveStart = current.sourceState === 'absent' ? liveAbsentSource(command.slotKey) : resolveRecipeSource({ ...bean, id: command.coffeeId }, command.slotKey);
    const attempt = { id: id('attempt', command.actionId), ownerId: state.uid, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id, revisionSource: current.source || null, sourceState: current.sourceState || 'present', sourceHash: current.snapshotHash, snapshot: clone(current.snapshot), snapshotHash: stableProjectionHash(current.snapshot, command.slotKey), ...(command.slotKey === 'aiden' ? { aidenGrind: clone(bean.aidenGrind ?? null) } : { dose: liveStart.sourceState === 'present' ? (liveStart.recipe.userCoffeeGrams ?? null) : null }), status: 'created', createdAt: new Date().toISOString() }; state.attempts.set(attempt.id, attempt); result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: current.id, sourceState: attempt.sourceState, physicalBrewConfirmed: false }) };
  } else if (mode === 'timer_started') {
    const attempt = state.attempts.get(command.attemptId); if (!attempt || attempt.ownerId !== state.uid || attempt.coffeeId !== command.coffeeId) fail('not_found', 'Attempt is unavailable.'); if (!['created', 'timer_started'].includes(attempt.status)) fail('invalid_attempt_state', 'Timer cannot start for this attempt.'); attempt.status = 'timer_started'; attempt.timerStartedAt = new Date(state.now()).toISOString(); result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, coffeeId: command.coffeeId, slotKey: command.slotKey, sourceState: attempt.sourceState || 'present', timerStarted: true, physicalBrewConfirmed: false }) };
  } else if (mode === 'undo_revision') {
    if (!current.parentId && current.parentSourceState !== 'absent') fail('nothing_to_undo', 'The initial recipe cannot be undone.'); if (current.parentSourceState === 'absent') { result = commitAbsenceRevision(state, bean, current, command); result.receipt = receipt({ actionId: command.actionId, mode, coffeeId: command.coffeeId, slotKey: command.slotKey, revisionId: result.revision.id, undoneRevisionId: current.id, restoredRevisionId: null, restoredSourceState: 'absent', sourceState: 'absent', physicalBrewConfirmed: false, undoAvailable: false }); } else { const parent = state.revisions.get(current.parentId); if (!parent) fail('not_found', 'The revision to restore is unavailable.'); result = commitRevision(state, bean, current, command, parent.snapshot, 'undo', null, current.id); result.receipt = receipt({ actionId: command.actionId, mode, revisionId: result.revision.id, undoneRevisionId: current.id, restoredRevisionId: parent.id }); }
  } else if (mode === 'promote_attempt') {
    result = saveAttemptRecipe(state, bean, current, command);
  } else if (mode === 'complete_attempt') {
    const attempt = state.attempts.get(command.attemptId); if (!attempt || attempt.ownerId !== state.uid || attempt.coffeeId !== command.coffeeId) fail('not_found', 'Attempt is unavailable.'); const legalPredecessor = command.slotKey === 'aiden' ? attempt.status === 'profile_prepared' : attempt.status === 'timer_started'; if (!legalPredecessor) fail('invalid_attempt_state', command.slotKey === 'aiden' ? 'Aiden must be profile-prepared before starting tasting.' : 'The timer must be started before completing this brew.'); attempt.status = 'completed'; attempt.completedAt = new Date().toISOString(); result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, coffeeId: command.coffeeId, slotKey: command.slotKey, sourceState: attempt.sourceState || 'present', timerCompleted: true, physicalBrewConfirmed: false }) };
  } else if (mode === 'prepare_attempt') {
    const attempt = state.attempts.get(command.attemptId); if (!attempt) fail('not_found', 'Attempt is unavailable.'); attempt.status = 'preparing'; result = { ok: true, attempt: clone(attempt), receipt: receipt({ actionId: command.actionId, mode, attemptId: attempt.id, preparation: 'pending', physicalBrewConfirmed: false }) };
  } else fail('unsupported_mode', 'Unsupported recipe command.');
  if (result?.attempt?.id) {
    const attempt = state.attempts.get(result.attempt.id);
    if (attempt) {
      const liveAttempt = attempt.sourceState === 'absent' ? liveAbsentSource(attempt.slotKey) : resolveRecipeSource({ ...bean, id: attempt.coffeeId }, attempt.slotKey);
      attempt.revisionSource = attempt.revisionSource || current.source || null;
      attempt.sourceHash = attempt.sourceHash || current.snapshotHash;
      attempt.sourceState = attempt.sourceState || current.sourceState || 'present';
      attempt.snapshotHash = stableProjectionHash(attempt.snapshot, attempt.slotKey);
      if (attempt.slotKey === 'aiden') attempt.aidenGrind = clone(attempt.aidenGrind ?? bean.aidenGrind ?? null);
      else if (attempt.dose === undefined) attempt.dose = liveAttempt.sourceState === 'present' ? (liveAttempt.recipe.userCoffeeGrams ?? null) : null;
      result.attempt = clone(attempt);
    }
  }
  if (mode === 'brew_once') Object.assign(result.receipt, { promoteAvailable: true, revisionId: current.id, sourceHash: current.snapshotHash, sourceState: current.sourceState || 'present' });
  state.actions.set(command.actionId, { fingerprint, status: 'succeeded', result: clone(result) }); return clone(result);
}
