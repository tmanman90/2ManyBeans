import { canonicalHash, clone } from '../../src/lib/ruphus/contracts.js';
import { sanitizeEvidence } from '../../src/lib/ruphus/sanitizeEvidence.js';
import { resolveRequestedRecipe } from '../../src/lib/ruphus/legacyRecipeResolver.js';

export async function buildRuphusContext({ uid, contextRef, readers = {}, evidenceByteCap }) {
  if (!uid || typeof uid !== 'string') throw Object.assign(new Error('owner is required'), { code: 'owner_required' });
  if (contextRef?.uid || contextRef?.ownerId) throw Object.assign(new Error('owner identity is server-bound'), { code: 'forged_owner' });
  const coffeeId = contextRef?.coffeeId;
  if (!coffeeId) throw Object.assign(new Error('coffee context is required'), { code: 'context_required' });
  if (typeof readers.readCoffee !== 'function') throw new Error('readCoffee reader is required');
  const coffee = await readers.readCoffee({ uid, coffeeId });
  if (!coffee) throw Object.assign(new Error('coffee not found'), { code: 'not_found' });
  const recipe = contextRef.slotKey && typeof readers.readRecipe === 'function'
    ? await readers.readRecipe({ uid, coffeeId, slotKey: contextRef.slotKey }) : null;
  const tastings = typeof readers.readTastings === 'function' ? await readers.readTastings({ uid, coffeeId, attemptId: contextRef.attemptId }) : [];
  const attempts = typeof readers.readAttempts === 'function' ? await readers.readAttempts({ uid, coffeeId, attemptId: contextRef.attemptId }) : [];
  const safe = sanitizeEvidence({ coffee, recipe, tastings, attempts, context: contextRef }, { maxBytes: evidenceByteCap });
  return { version: 1, context: clone(contextRef), coffee: safe.value.coffee, recipe: safe.value.recipe, tastings: safe.value.tastings || [], attempts: safe.value.attempts || [], evidenceHash: canonicalHash(safe.value), truncated: safe.truncated };
}

export function resolveContextRecipe(bean, contextRef) {
  if (!contextRef?.slotKey) return { ok: false, code: 'slot_required' };
  return resolveRequestedRecipe(bean, contextRef);
}
