// Server-owned Agent v3 proposal persistence. This slice intentionally does
// not expose mutation commands: proposals are non-authoritative suggestions.
import { canonicalHash, clone, validateProposal } from '../../src/lib/ruphus/contracts.js';
import { resolveLegacyRecipe, validateExecutableRecipe } from '../../src/lib/ruphus/legacyRecipeResolver.js';

export const OPEN_PROPOSAL_RETENTION = 8;

const nowIso = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const canonicalCandidate = (recipe, slotKey) => ({ ...clone(recipe), method: slotKey === 'aiden' ? 'aiden' : slotKey.startsWith('kalita') ? 'kalita' : 'v60', device: slotKey === 'aiden' ? 'aiden' : slotKey.startsWith('kalita') ? 'kalita' : 'v60', mode: slotKey.endsWith('iced') ? 'iced' : 'hot' });
const recipeIdentityHash = (recipe, slotKey = null) => {
  const identity = clone(recipe || {});
  if (slotKey) {
    const method = slotKey === 'aiden' ? 'aiden' : slotKey.startsWith('kalita') ? 'kalita' : 'v60';
    identity.method = method;
    identity.device = method;
    identity.mode = slotKey.endsWith('iced') ? 'iced' : 'hot';
  }
  delete identity.userCoffeeGrams;
  delete identity.aidenGrind;
  delete identity.recipeHash;
  return canonicalHash(identity);
};

function assertOwner(uid) {
  if (typeof uid !== 'string' || !uid.trim()) throw Object.assign(new Error('owner is required'), { code: 'owner_required' });
}

function buildProposal({ proposalId, uid, coffeeId, slotKey, sessionId, before, after, sourceRevisionId = null, sourceRevisionHash, sourceDose = null, sourceAidenGrind = null, createdAt }) {
  const proposal = {
    id: proposalId, ownerId: uid, coffeeId, slotKey, sessionId,
    sourceRevisionId, sourceHash: sourceRevisionHash || recipeIdentityHash(before, slotKey),
    ...(slotKey === 'aiden' ? { sourceAidenGrind: clone(sourceAidenGrind) } : { sourceDose }),
    before: clone(before), after: clone(after), recipeHash: canonicalHash(after),
    status: 'proposed', createdAt,
  };
  const result = validateProposal(proposal);
  if (!result.valid) throw Object.assign(new Error(result.errors.join('; ')), { code: 'invalid_proposal' });
  return proposal;
}

// A tiny deterministic store is used by endpoint/evaluator tests and by local
// development. Production passes an Admin SDK database into the same API.
export function createMemoryRuphusRepository({ clock = () => Date.now() } = {}) {
  const beans = new Map();
  const revisions = new Map();
  const proposals = new Map();

  const key = (uid, idValue) => `${uid}/${idValue}`;
  return {
    seedBean(uid, bean) { assertOwner(uid); beans.set(key(uid, bean.id), clone(bean)); return clone(bean); },
    getBean(uid, coffeeId) { assertOwner(uid); const bean = beans.get(key(uid, coffeeId)); if (!bean) throw Object.assign(new Error('coffee not found'), { code: 'not_found' }); return clone(bean); },
    getProposal(uid, proposalId) { assertOwner(uid); const proposal = proposals.get(key(uid, proposalId)); return proposal ? clone(proposal) : null; },
    listProposals(uid, { coffeeId, slotKey, sessionId } = {}) { return [...proposals.values()].filter((p) => p.ownerId === uid && (!coffeeId || p.coffeeId === coffeeId) && (!slotKey || p.slotKey === slotKey) && (!sessionId || p.sessionId === sessionId)).map(clone); },
    createProposal({ uid, coffeeId, slotKey, sessionId, after, proposalId = id('proposal') }) {
      assertOwner(uid);
      const bean = this.getBean(uid, coffeeId);
      const resolved = resolveLegacyRecipe(bean, slotKey);
      if (!resolved.ok) throw Object.assign(new Error(resolved.code), { code: resolved.code });
      const candidate = canonicalCandidate(after, slotKey);
      const validation = validateExecutableRecipe(candidate, slotKey);
      if (!validation.valid) throw Object.assign(new Error(validation.errors.join('; ')), { code: 'invalid_recipe' });
      const before = resolved.recipe;
      const activeRevisionId = bean.activeRevisionIds?.[slotKey] || null;
      const sourceHash = recipeIdentityHash(before, slotKey);
      const createdAt = new Date(clock()).toISOString();
      if (!activeRevisionId) {
        const baseId = id('revision');
        revisions.set(key(uid, baseId), { id: baseId, ownerId: uid, coffeeId, slotKey, snapshot: clone(before), snapshotHash: recipeIdentityHash(before, slotKey), status: 'active', createdAt, parentId: null });
        bean.activeRevisionIds = { ...(bean.activeRevisionIds || {}), [slotKey]: baseId };
        beans.set(key(uid, coffeeId), bean);
      }
      for (const existing of this.listProposals(uid, { coffeeId, slotKey, sessionId }).filter((p) => p.status === 'proposed')) {
        existing.status = 'superseded';
        existing.supersededAt = createdAt;
        proposals.set(key(uid, existing.id), existing);
      }
      const proposal = buildProposal({ proposalId, uid, coffeeId, slotKey, sessionId, before, after: candidate, sourceRevisionId: bean.activeRevisionIds?.[slotKey] || null, sourceRevisionHash: sourceHash, sourceDose: before.userCoffeeGrams ?? null, sourceAidenGrind: bean.aidenGrind ?? null, createdAt });
      proposals.set(key(uid, proposalId), proposal);
      const open = this.listProposals(uid, { sessionId }).filter((p) => p.status === 'proposed').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      while (open.length > OPEN_PROPOSAL_RETENTION) {
        const oldest = open.shift(); oldest.status = 'archived'; oldest.archivedAt = createdAt; proposals.set(key(uid, oldest.id), oldest);
      }
      return clone(proposal);
    },
    snapshot() { return { beans: [...beans.values()].map(clone), revisions: [...revisions.values()].map(clone), proposals: [...proposals.values()].map(clone) }; },
  };
}

function adminCollection(db, uid, collection) { return db.collection('users').doc(uid).collection(collection); }

/** Persist one validated proposal using an Admin SDK transaction. */
export async function persistProposal({ db, uid, coffeeId, slotKey, sessionId, after, proposalId = id('proposal'), now = nowIso }) {
  assertOwner(uid);
  if (!db?.runTransaction || !db?.collection) throw new Error('Firestore database is required');
  const beanRef = db.collection('users').doc(uid).collection('beans').doc(coffeeId);
  const proposalRef = adminCollection(db, uid, 'proposals').doc(proposalId);
  const revisions = adminCollection(db, uid, 'recipeRevisions');
  const proposals = adminCollection(db, uid, 'proposals');
  const createdAt = now();
  return db.runTransaction(async (tx) => {
    const beanSnap = await tx.get(beanRef);
    if (!beanSnap.exists) throw Object.assign(new Error('coffee not found'), { code: 'not_found' });
    const bean = beanSnap.data();
    let activeRevisionId = bean.activeRevisionIds?.[slotKey] || null;
    if (!sessionId) throw Object.assign(new Error('session is required'), { code: 'session_required' });
    const pairQuery = proposals.where('sessionId', '==', sessionId).where('coffeeId', '==', coffeeId).where('slotKey', '==', slotKey).where('status', '==', 'proposed');
    const sessionQuery = proposals.where('sessionId', '==', sessionId).where('status', '==', 'proposed');
    const [pairSnap, sessionSnap] = await Promise.all([tx.get(pairQuery), tx.get(sessionQuery)]);
    const activeRevisionSnap = activeRevisionId ? await tx.get(revisions.doc(activeRevisionId)) : null;
    if (activeRevisionId && (!activeRevisionSnap?.exists || activeRevisionSnap.data()?.coffeeId !== coffeeId || activeRevisionSnap.data()?.slotKey !== slotKey)) throw Object.assign(new Error('active revision is unavailable'), { code: 'active_revision_not_found' });
    const resolved = activeRevisionSnap?.exists
      ? { ok: true, recipe: clone(activeRevisionSnap.data()?.snapshot || {}) }
      : resolveLegacyRecipe({ ...bean, id: coffeeId }, slotKey);
    if (!resolved.ok) throw Object.assign(new Error(resolved.code), { code: resolved.code });
    const candidate = canonicalCandidate(after, slotKey);
    const validation = validateExecutableRecipe(candidate, slotKey);
    if (!validation.valid) throw Object.assign(new Error(validation.errors.join('; ')), { code: 'invalid_recipe' });
    if (!activeRevisionId) {
      activeRevisionId = id('revision');
      tx.set(revisions.doc(activeRevisionId), { id: activeRevisionId, ownerId: uid, coffeeId, slotKey, snapshot: clone(resolved.recipe), snapshotHash: recipeIdentityHash(resolved.recipe, slotKey), ...(slotKey === 'aiden' ? { aidenGrind: clone(bean.aidenGrind ?? null) } : {}), status: 'active', parentId: null, createdAt });
      tx.update(beanRef, { activeRevisionIds: { ...(bean.activeRevisionIds || {}), [slotKey]: activeRevisionId } });
    }
    pairSnap.docs.forEach((doc) => tx.update(doc.ref, { status: 'superseded', supersededAt: createdAt }));
    const proposal = buildProposal({ proposalId, uid, coffeeId, slotKey, sessionId, before: resolved.recipe, after: candidate, sourceRevisionId: activeRevisionId, sourceRevisionHash: recipeIdentityHash(resolved.recipe, slotKey), sourceDose: resolved.recipe.userCoffeeGrams ?? null, sourceAidenGrind: bean.aidenGrind ?? null, createdAt });
    tx.create(proposalRef, proposal);
    const open = [...sessionSnap.docs.filter((doc) => !pairSnap.docs.some((pair) => pair.id === doc.id)), { id: proposalId, data: () => proposal }].sort((a, b) => String(a.data().createdAt).localeCompare(String(b.data().createdAt)));
    while (open.length > OPEN_PROPOSAL_RETENTION) { const oldest = open.shift(); if (oldest.id !== proposalId) tx.update(oldest.ref, { status: 'archived', archivedAt: createdAt }); }
    return proposal;
  });
}

export { buildProposal };
