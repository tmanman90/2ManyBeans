import { withCorsAuthPro, getDb } from './_lib/cors-auth.js';
import { canonicalHash, clone } from '../src/lib/ruphus/contracts.js';

const INVALID = (message) => Object.assign(new Error(message), { code: 'invalid_tasting' });

/**
 * Apply the only server-authoritative part of a Ruphus tasting: the attempt
 * and recipe snapshot that the client is not allowed to choose. Sensory notes
 * remain user evidence and are copied without granting them authority.
 */
export function applyRuphusTastingState({ attempt, tastingId, coffeeId, sensory, now = new Date().toISOString() }) {
  if (!attempt || attempt.coffeeId !== coffeeId) throw INVALID('Attempt does not belong to this coffee.');
  if (!tastingId || typeof tastingId !== 'string' || !sensory || typeof sensory !== 'object' || Array.isArray(sensory)) throw INVALID('A tasting id and sensory evidence are required.');
  if (!['created', 'preparing', 'completed', 'tasted'].includes(attempt.status)) throw INVALID('Attempt is not available for tasting.');
  const provenance = {
    attemptId: attempt.id,
    revisionId: attempt.revisionId || null,
    snapshotHash: attempt.snapshotHash || canonicalHash(attempt.snapshot),
    source: 'ruphus-agent-v3',
  };
  return {
    tasting: {
      ...clone(sensory),
      id: tastingId,
      beanId: coffeeId,
      attemptId: attempt.id,
      recipeRevisionId: provenance.revisionId,
      recipeSnapshotHash: provenance.snapshotHash,
      agentProvenance: provenance,
      updatedAt: now,
      createdAt: now,
    },
    attempt: { status: 'tasted', tastedAt: now, tastingId: tastingId },
  };
}

export default withCorsAuthPro(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  const { tastingId, attemptId, coffeeId, sensory } = req.body || {};
  if (!uid || !tastingId || !attemptId || !coffeeId) return res.status(400).json({ error: 'invalid_tasting' });
  if (Object.hasOwn(req.body || {}, 'ownerId') || Object.hasOwn(req.body || {}, 'uid')) return res.status(400).json({ error: 'owner_identity_is_server_bound' });
  try {
    const db = getDb();
    const user = db.collection('users').doc(uid);
    const attemptRef = user.collection('brewAttempts').doc(attemptId);
    const tastingRef = user.collection('tastings').doc(tastingId);
    const result = await db.runTransaction(async (tx) => {
      const [attemptSnap, tastingSnap] = await Promise.all([tx.get(attemptRef), tx.get(tastingRef)]);
      if (tastingSnap.exists) {
        const existing = tastingSnap.data();
        if (existing.attemptId !== attemptId || existing.beanId !== coffeeId) throw INVALID('Tasting id is already bound to another attempt.');
        return { ok: true, tasting: { id: tastingSnap.id, ...existing }, replay: true };
      }
      if (!attemptSnap.exists) throw Object.assign(new Error('Attempt is unavailable.'), { code: 'not_found' });
      const applied = applyRuphusTastingState({ attempt: { id: attemptSnap.id, ...attemptSnap.data() }, tastingId, coffeeId, sensory });
      tx.create(tastingRef, applied.tasting);
      tx.update(attemptRef, applied.attempt);
      return { ok: true, tasting: applied.tasting, replay: false };
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error.code === 'not_found' ? 404 : 400;
    return res.status(status).json({ error: error.code || 'invalid_tasting', message: error.message });
  }
});
