// Server-owned Agent v3 proposal persistence. This slice intentionally does
// not expose mutation commands: proposals are non-authoritative suggestions.
import { canonicalHash, clone, validateProposal } from '../../src/lib/ruphus/contracts.js';
import { resolveLegacyRecipe, validateExecutableRecipe } from '../../src/lib/ruphus/legacyRecipeResolver.js';

export const OPEN_PROPOSAL_RETENTION = 8;
export const RECIPE_PREVIEW_VERSION = 'ruphus-recipe-preview-v1';

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

function buildProposal({ proposalId, uid, coffeeId, slotKey, sessionId, before, after, sourceRevisionId = null, sourceRevisionHash, sourceDose = null, sourceAidenGrind = null, createdAt, preview = null }) {
  const proposal = {
    id: proposalId, ownerId: uid, coffeeId, slotKey, sessionId,
    sourceRevisionId, sourceHash: sourceRevisionHash || recipeIdentityHash(before, slotKey),
    ...(slotKey === 'aiden' ? { sourceAidenGrind: clone(sourceAidenGrind) } : { sourceDose }),
    before: clone(before), after: clone(after), recipeHash: canonicalHash(after),
    status: 'proposed', createdAt,
    ...(preview ? { preview: clone(preview), previewVersion: RECIPE_PREVIEW_VERSION } : {}),
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
    createPreview({ uid, coffeeId, slotKey, sessionId, after, previewKey, previewDose, previewRatio, previewConfiguration, sourceRevisionId, sourceHash, sourceProposalId, requestId, proposalId = id('preview') }) {
      assertOwner(uid);
      if (!sessionId) throw Object.assign(new Error('session is required'), { code: 'session_required' });
      if (!previewKey) throw Object.assign(new Error('preview key is required'), { code: 'preview_key_required' });
      if (!sourceProposalId) throw Object.assign(new Error('source proposal is required'), { code: 'proposal_required' });
      const bean = this.getBean(uid, coffeeId);
      const sourceProposal = proposals.get(key(uid, sourceProposalId));
      if (!sourceProposal || sourceProposal.ownerId !== uid || sourceProposal.coffeeId !== coffeeId || sourceProposal.slotKey !== slotKey || sourceProposal.sessionId !== sessionId) throw Object.assign(new Error('proposal is not bound to this coffee, slot, or session'), { code: 'proposal_binding_invalid' });
      if (sourceProposal.status !== 'proposed') throw Object.assign(new Error('proposal is no longer available'), { code: 'stale' });
      const resolved = resolveLegacyRecipe(bean, slotKey);
      if (!resolved.ok) throw Object.assign(new Error(resolved.code), { code: resolved.code });
      // The reviewed proposal's `after` is the immutable intent to project;
      // lineage still points at the active canonical recipe.
      const before = resolved.recipe;
      const activeRevisionId = bean.activeRevisionIds?.[slotKey] || null;
      const currentHash = recipeIdentityHash(resolved.recipe, slotKey);
      if (sourceProposal.sourceRevisionId !== activeRevisionId || sourceProposal.sourceHash !== currentHash || (sourceRevisionId && sourceRevisionId !== activeRevisionId) || (sourceHash && sourceHash !== currentHash)) {
        throw Object.assign(new Error('The saved recipe changed since this preview was prepared.'), { code: 'stale' });
      }
      const existing = this.listProposals(uid, { coffeeId, slotKey, sessionId }).find((proposal) => proposal.status === 'proposed' && proposal.preview?.key === previewKey);
      const identityConflict = this.listProposals(uid, { coffeeId, slotKey, sessionId }).find((proposal) => proposal.status === 'proposed' && proposal.preview?.requestId === requestId && proposal.preview?.key !== previewKey);
      if (identityConflict) throw Object.assign(new Error('Preview request id was reused with different input.'), { code: 'idempotency_conflict' });
      if (existing) return clone(existing);
      const createdAt = new Date(clock()).toISOString();
      for (const proposal of this.listProposals(uid, { coffeeId, slotKey, sessionId }).filter((item) => item.status === 'proposed' && item.preview)) {
        proposal.status = 'superseded'; proposal.supersededAt = createdAt; proposals.set(key(uid, proposal.id), proposal);
      }
      const candidate = canonicalCandidate(after, slotKey);
      const validation = validateExecutableRecipe(candidate, slotKey);
      if (!validation.valid) throw Object.assign(new Error(validation.errors.join('; ')), { code: 'invalid_recipe' });
      const proposal = buildProposal({ proposalId, uid, coffeeId, slotKey, sessionId, before, after: candidate, sourceRevisionId: activeRevisionId, sourceRevisionHash: currentHash, sourceDose: resolved.recipe.userCoffeeGrams ?? null, sourceAidenGrind: bean.aidenGrind ?? null, createdAt, preview: { key: previewKey, requestId, dose: previewDose, ratio: previewRatio, configuration: previewConfiguration, sourceProposalId } });
      proposals.set(key(uid, proposal.id), proposal);
      return clone(proposal);
    },
    snapshot() { return { beans: [...beans.values()].map(clone), revisions: [...revisions.values()].map(clone), proposals: [...proposals.values()].map(clone) }; },
  };
}

function adminCollection(db, uid, collection) { return db.collection('users').doc(uid).collection(collection); }

/** Read the owner-scoped base used by preview preparation. */
export async function readRecipeForPreview({ db, uid, coffeeId, slotKey, proposalId, sessionId } = {}) {
  assertOwner(uid);
  if (!db?.collection) throw new Error('Firestore database is required');
  const beanSnap = await db.collection('users').doc(uid).collection('beans').doc(coffeeId).get();
  if (!beanSnap?.exists) throw Object.assign(new Error('coffee not found'), { code: 'not_found' });
  const bean = { id: coffeeId, ...beanSnap.data() };
  if (!proposalId) throw Object.assign(new Error('source proposal is required'), { code: 'proposal_required' });
  const proposalSnap = await adminCollection(db, uid, 'proposals').doc(proposalId).get();
  if (!proposalSnap?.exists) throw Object.assign(new Error('proposal not found'), { code: 'not_found' });
  const sourceProposal = { id: proposalSnap.id, ...proposalSnap.data() };
  if (sourceProposal.ownerId !== uid || sourceProposal.coffeeId !== coffeeId || sourceProposal.slotKey !== slotKey || (sessionId && sourceProposal.sessionId !== sessionId)) throw Object.assign(new Error('proposal is not bound to this coffee, slot, or session'), { code: 'proposal_binding_invalid' });
  if (sourceProposal.status !== 'proposed') throw Object.assign(new Error('proposal is no longer available'), { code: 'stale' });
  const revisionId = bean.activeRevisionIds?.[slotKey] || null;
  if (revisionId) {
    const revisionSnap = await adminCollection(db, uid, 'recipeRevisions').doc(revisionId).get();
    if (!revisionSnap?.exists || revisionSnap.data()?.coffeeId !== coffeeId || revisionSnap.data()?.slotKey !== slotKey) throw Object.assign(new Error('active revision is unavailable'), { code: 'active_revision_not_found' });
    const revision = revisionSnap.data() || {};
    const sourceHash = revision.snapshotHash || recipeIdentityHash(revision.snapshot, slotKey);
    if (sourceProposal.sourceRevisionId !== revisionId || sourceProposal.sourceHash !== sourceHash) throw Object.assign(new Error('proposal source is stale'), { code: 'stale' });
    return { bean, recipe: clone(sourceProposal.after || {}), sourceProposal, revisionId, sourceHash };
  }
  const resolved = resolveLegacyRecipe(bean, slotKey);
  if (!resolved.ok) throw Object.assign(new Error(resolved.code), { code: resolved.code });
  const sourceHash = recipeIdentityHash(resolved.recipe, slotKey);
  if (sourceProposal.sourceRevisionId || sourceProposal.sourceHash !== sourceHash) throw Object.assign(new Error('proposal source is stale'), { code: 'stale' });
  return { bean, recipe: clone(sourceProposal.after || {}), sourceProposal, revisionId: null, sourceHash };
}

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

/**
 * Persist a server-derived preview version. The transaction re-resolves the
 * owner-scoped active revision and source hash before writing, so a client
 * cannot turn arbitrary recipe JSON into an actionable proposal.
 */
export async function persistRecipePreview({ db, uid, coffeeId, slotKey, sessionId, after, previewKey, previewDose, previewRatio, previewConfiguration = {}, sourceRevisionId = null, sourceHash = null, sourceProposalId, requestId, proposalId = id('preview'), now = nowIso }) {
  assertOwner(uid);
  if (!db?.runTransaction || !db?.collection) throw new Error('Firestore database is required');
  if (!sessionId) throw Object.assign(new Error('session is required'), { code: 'session_required' });
  if (!previewKey) throw Object.assign(new Error('preview key is required'), { code: 'preview_key_required' });
  const beanRef = db.collection('users').doc(uid).collection('beans').doc(coffeeId);
  const proposalCollection = adminCollection(db, uid, 'proposals');
  const proposalRef = proposalCollection.doc(proposalId);
  const revisions = adminCollection(db, uid, 'recipeRevisions');
  const createdAt = now();
  return db.runTransaction(async (tx) => {
    const beanSnap = await tx.get(beanRef);
    if (!beanSnap.exists) throw Object.assign(new Error('coffee not found'), { code: 'not_found' });
    const bean = { id: coffeeId, ...beanSnap.data() };
    if (!sourceProposalId) throw Object.assign(new Error('source proposal is required'), { code: 'proposal_required' });
    const sourceProposalRef = proposalCollection.doc(sourceProposalId);
    const sourceProposalSnap = await tx.get(sourceProposalRef);
    if (!sourceProposalSnap.exists) throw Object.assign(new Error('proposal not found'), { code: 'not_found' });
    const sourceProposal = { id: sourceProposalSnap.id, ...sourceProposalSnap.data() };
    if (sourceProposal.ownerId !== uid || sourceProposal.coffeeId !== coffeeId || sourceProposal.slotKey !== slotKey || sourceProposal.sessionId !== sessionId) throw Object.assign(new Error('proposal is not bound to this coffee, slot, or session'), { code: 'proposal_binding_invalid' });
    if (sourceProposal.status !== 'proposed') throw Object.assign(new Error('proposal is no longer available'), { code: 'stale' });
    let activeRevisionId = bean.activeRevisionIds?.[slotKey] || null;
    const activeRevisionSnap = activeRevisionId ? await tx.get(revisions.doc(activeRevisionId)) : null;
    if (activeRevisionId && (!activeRevisionSnap?.exists || activeRevisionSnap.data()?.coffeeId !== coffeeId || activeRevisionSnap.data()?.slotKey !== slotKey)) throw Object.assign(new Error('active revision is unavailable'), { code: 'active_revision_not_found' });
    const resolved = activeRevisionSnap?.exists ? { ok: true, recipe: clone(activeRevisionSnap.data()?.snapshot || {}) } : resolveLegacyRecipe(bean, slotKey);
    if (!resolved.ok) throw Object.assign(new Error(resolved.code), { code: resolved.code });
    // Project from the reviewed proposal intent, while retaining the active
    // canonical recipe as the derived proposal's lineage anchor.
    const before = resolved.recipe;
    const resolvedHash = recipeIdentityHash(resolved.recipe, slotKey);
    if (sourceProposal.sourceRevisionId !== activeRevisionId || sourceProposal.sourceHash !== resolvedHash || (sourceRevisionId && sourceRevisionId !== activeRevisionId) || (sourceHash && sourceHash !== resolvedHash)) throw Object.assign(new Error('The proposal source changed since this preview was prepared.'), { code: 'stale' });
    const pairQuery = proposalCollection.where('sessionId', '==', sessionId).where('coffeeId', '==', coffeeId).where('slotKey', '==', slotKey).where('status', '==', 'proposed');
    const pairSnap = await tx.get(pairQuery);
    const existing = pairSnap.docs.find((doc) => doc.data()?.preview?.key === previewKey);
    const identityConflict = pairSnap.docs.find((doc) => doc.data()?.preview?.requestId === requestId && doc.data()?.preview?.key !== previewKey);
    if (identityConflict) throw Object.assign(new Error('Preview request id was reused with different input.'), { code: 'idempotency_conflict' });
    if (existing) return { id: existing.id, ...existing.data() };
    const candidate = canonicalCandidate(after, slotKey);
    const validation = validateExecutableRecipe(candidate, slotKey);
    if (!validation.valid) throw Object.assign(new Error(validation.errors.join('; ')), { code: 'invalid_recipe' });
    if (!activeRevisionId) {
      activeRevisionId = id('revision');
      tx.set(revisions.doc(activeRevisionId), { id: activeRevisionId, ownerId: uid, coffeeId, slotKey, snapshot: clone(before), snapshotHash: resolvedHash, status: 'active', parentId: null, createdAt });
      tx.update(beanRef, { activeRevisionIds: { ...(bean.activeRevisionIds || {}), [slotKey]: activeRevisionId } });
    }
    const superseded = pairSnap.docs.filter((doc) => doc.data()?.preview);
    superseded.forEach((doc) => tx.update(doc.ref, { status: 'superseded', supersededAt: createdAt }));
    const proposal = buildProposal({ proposalId, uid, coffeeId, slotKey, sessionId, before, after: candidate, sourceRevisionId: activeRevisionId, sourceRevisionHash: resolvedHash, sourceDose: resolved.recipe.userCoffeeGrams ?? null, sourceAidenGrind: bean.aidenGrind ?? null, createdAt, preview: { key: previewKey, requestId, dose: previewDose, ratio: previewRatio, configuration: previewConfiguration, sourceProposalId } });
    tx.create(proposalRef, proposal);
    return proposal;
  });
}

export { buildProposal };
