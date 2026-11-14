import { useCallback, useRef, useState } from 'react';
import { executeRecipeCommand } from '../lib/recipeCommands';
import { canonicalHash } from '../lib/ruphus/contracts';
import { resolveRuphusActionRequest } from '../lib/ruphusActionIdentity';

export function useRuphusAction({ uid = null, onReceipt } = {}) {
  // Identity key: ruphus-action-identity is persisted before the request is sent.
  // Recovery reads localStorage.getItem(identityKey) through the pure identity seam.
  // Legacy outbox key shape: ruphus-action-outbox:${uid}:${artifact.actionId}.
  const [pending, setPending] = useState(null);
  const inflight = useRef(new Map());
  const run = useCallback(async ({ mode, artifact }) => {
    if (!mode || !artifact) return null;
    const identity = resolveRuphusActionRequest({ uid, mode, artifact, storage: typeof localStorage === 'undefined' ? null : localStorage });
    if (!identity) return null;
    const { request, outboxKey } = identity;
    const actionId = request.actionId;
    if (inflight.current.has(actionId)) return inflight.current.get(actionId);
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
