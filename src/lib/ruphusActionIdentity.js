import { canonicalHash } from './ruphus/contracts.js';

export function resolveRuphusActionRequest({ uid = null, mode, artifact, storage = null, idFactory = () => crypto.randomUUID() } = {}) {
  if (!mode || !artifact) return null;
  const identity = artifact.id || artifact.proposalId || artifact.attemptId || artifact.coffeeId;
  const identityKey = uid && identity ? `ruphus-action-identity:${uid}:${identity}:${mode}` : null;
  const read = (key) => {
    if (!storage || !key) return null;
    try { return storage.getItem(key); } catch { return null; }
  };
  let recoveredActionId = null;
  const stored = read(identityKey);
  if (stored) {
    try { recoveredActionId = JSON.parse(stored).actionId || stored; } catch { recoveredActionId = stored; }
  }
  if (!recoveredActionId && artifact.actionId && uid) {
    const pending = read(`ruphus-action-outbox:${uid}:${artifact.actionId}`);
    if (pending) {
      try { recoveredActionId = JSON.parse(pending).actionId || artifact.actionId; } catch { recoveredActionId = artifact.actionId; }
    }
  }
  const actionId = artifact.actionId && artifact.mode === mode ? artifact.actionId : recoveredActionId || idFactory();
  const request = { actionId, mode, coffeeId: artifact.coffeeId, slotKey: artifact.slotKey, proposalId: artifact.proposalId || (artifact.type === 'recipe_proposal' ? artifact.id : undefined), attemptId: artifact.attemptId, expectedRevisionId: artifact.sourceRevisionId || artifact.revisionId, expectedRevisionHash: artifact.sourceHash };
  if (identityKey && !recoveredActionId && storage) {
    try { storage.setItem(identityKey, JSON.stringify({ actionId, fingerprint: canonicalHash(request) })); } catch { /* best effort */ }
  }
  return { request, identityKey, outboxKey: uid ? `ruphus-action-outbox:${uid}:${actionId}` : null };
}
