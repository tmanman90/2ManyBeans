import { useCallback, useRef, useState } from 'react';
import { executeRecipeCommand } from '../lib/recipeCommands';

export function useRuphusAction({ onReceipt } = {}) {
  const [pending, setPending] = useState(null);
  const inflight = useRef(new Map());
  const run = useCallback(async ({ mode, artifact }) => {
    if (!mode || !artifact) return null;
    const actionId = artifact.actionId || crypto.randomUUID();
    if (inflight.current.has(actionId)) return inflight.current.get(actionId);
    const promise = (async () => {
      setPending(actionId);
      try {
        const result = await executeRecipeCommand({ actionId, mode, coffeeId: artifact.coffeeId, slotKey: artifact.slotKey, proposalId: artifact.proposalId || (artifact.type === 'recipe_proposal' ? artifact.id : undefined), attemptId: artifact.attemptId, expectedRevisionId: artifact.sourceRevisionId || artifact.revisionId, expectedRevisionHash: artifact.sourceHash });
        onReceipt?.(result);
        return result;
      } finally {
        inflight.current.delete(actionId);
        setPending(current => current === actionId ? null : current);
      }
    })();
    inflight.current.set(actionId, promise);
    return promise;
  }, [onReceipt]);
  return { pending, run };
}
