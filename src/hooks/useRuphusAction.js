import { useCallback, useRef, useState } from 'react';
import { executeRecipeCommand } from '../lib/recipeCommands';
import { canonicalHash } from '../lib/ruphus/contracts';

export function useRuphusAction({ uid = null, onReceipt } = {}) {
  const [pending, setPending] = useState(null);
  const inflight = useRef(new Map());
  const run = useCallback(async ({ mode, artifact }) => {
    if (!mode || !artifact) return null;
    const identityKey = uid ? `ruphus-action-identity:${uid}:${artifact.id || artifact.proposalId || artifact.attemptId || artifact.coffeeId}:${mode}` : null;
    let recoveredActionId = null;
    try {
      if (identityKey) {
        const stored = localStorage.getItem(identityKey);
        if (stored) {
          try { recoveredActionId = JSON.parse(stored).actionId || stored; } catch { recoveredActionId = stored; }
        }
      }
      if (!recoveredActionId && artifact.actionId && uid) {
        const pending = localStorage.getItem(`ruphus-action-outbox:${uid}:${artifact.actionId}`);
        if (pending) recoveredActionId = JSON.parse(pending).actionId || artifact.actionId;
      }
    } catch { /* best-effort recovery */ }
    const actionId = artifact.actionId && artifact.mode === mode ? artifact.actionId : recoveredActionId || crypto.randomUUID();
    try { if (identityKey && !recoveredActionId) localStorage.setItem(identityKey, JSON.stringify({ actionId, fingerprint: canonicalHash({ ...request, actionId }) })); } catch { /* request remains valid */ }
    if (inflight.current.has(actionId)) return inflight.current.get(actionId);
    const request = { actionId, mode, coffeeId: artifact.coffeeId, slotKey: artifact.slotKey, proposalId: artifact.proposalId || (artifact.type === 'recipe_proposal' ? artifact.id : undefined), attemptId: artifact.attemptId, expectedRevisionId: artifact.sourceRevisionId || artifact.revisionId, expectedRevisionHash: artifact.sourceHash };
    const outboxKey = uid ? `ruphus-action-outbox:${uid}:${actionId}` : null;
    const outboxRecord = { ...request, fingerprint: canonicalHash(request), ownerUid: uid };
    try { if (outboxKey) localStorage.setItem(outboxKey, JSON.stringify(outboxRecord)); } catch { /* request still reaches the server */ }
    const promise = (async () => {
      setPending(actionId);
      try {
        const result = await executeRecipeCommand(request);
        onReceipt?.(result);
        try { if (outboxKey) localStorage.removeItem(outboxKey); } catch { /* best-effort cleanup */ }
        return result;
      } finally {
        inflight.current.delete(actionId);
        setPending(current => current === actionId ? null : current);
      }
    })();
    inflight.current.set(actionId, promise);
    return promise;
  }, [onReceipt, uid]);
  return { pending, run };
}
