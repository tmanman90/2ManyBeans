// Owner-scoped local draft for the Ruphus recipe-page preview.
// This stores only the reviewed proposal identity and editable configuration;
// the server remains authoritative for the executable recipe and any action.

const keyFor = (uid, proposalId) => uid && proposalId
  ? `ruphus-recipe-preview:${uid}:${proposalId}`
  : null;

const storageFor = (storage) => storage || (typeof localStorage === 'undefined' ? null : localStorage);

export function readRecipePreviewDraft({ uid, proposalId, storage } = {}) {
  const key = keyFor(uid, proposalId);
  const target = storageFor(storage);
  if (!key || !target) return null;
  try {
    const value = JSON.parse(target.getItem(key) || 'null');
    if (!value || value.ownerUid !== uid || value.proposalId !== proposalId) return null;
    if (!value.coffeeId || !value.slotKey || !Number.isFinite(value.dose) || value.dose <= 0) return null;
    return value;
  } catch {
    return null;
  }
}

export function writeRecipePreviewDraft({ uid, proposalId, coffeeId, slotKey, dose, configuration = {}, sourceRevisionId = null, sourceHash = null, requestId = null, preparedProposalId = null, preparedSourceRevisionId = null, preparedSourceHash = null, pendingAction = null, actionId = null, storage } = {}) {
  const key = keyFor(uid, proposalId);
  const target = storageFor(storage);
  if (!key || !target || !coffeeId || !slotKey || !Number.isFinite(dose) || dose <= 0) return null;
  const value = {
    ownerUid: uid,
    proposalId,
    coffeeId,
    slotKey,
    dose,
    configuration: { ...configuration },
    sourceRevisionId: sourceRevisionId || null,
    sourceHash: sourceHash || null,
    ...(requestId ? { requestId } : {}),
    ...(preparedProposalId && pendingAction && actionId ? {
      preparedProposalId,
      preparedSourceRevisionId: preparedSourceRevisionId || sourceRevisionId || null,
      preparedSourceHash: preparedSourceHash || sourceHash || null,
      pendingAction,
      actionId,
    } : {}),
    updatedAt: Date.now(),
  };
  try {
    target.setItem(key, JSON.stringify(value));
  } catch {
    // The live preview remains usable when local recovery storage is full.
  }
  return value;
}

// Rebuild only the server-issued action identity after a response-loss
// relaunch. The executable recipe remains the local, already-reviewed
// projection; no preparation request is needed before the user retries.
export function restoreRecipePreviewAction({ draft, sourceArtifact, preview } = {}) {
  if (!draft?.preparedProposalId || !draft.pendingAction || !draft.actionId || !sourceArtifact?.coffeeId || !sourceArtifact?.slotKey) return null;
  return {
    ...sourceArtifact,
    id: draft.preparedProposalId,
    type: 'recipe_proposal',
    mode: draft.pendingAction,
    actionId: draft.actionId,
    sourceRevisionId: draft.preparedSourceRevisionId || sourceArtifact.sourceRevisionId || null,
    sourceHash: draft.preparedSourceHash || sourceArtifact.sourceHash || null,
    after: preview || sourceArtifact.after,
  };
}

export function clearRecipePreviewDraft({ uid, proposalId, storage } = {}) {
  const key = keyFor(uid, proposalId);
  const target = storageFor(storage);
  if (!key || !target) return;
  try { target.removeItem(key); } catch { /* best effort */ }
}

export { keyFor as recipePreviewDraftKey };
