// Reconcile persisted recipe cards with their owner-scoped server proposals.
// The exact IDs come from the persisted chat, while the server remains the
// authority for session, coffee, slot, and source identity.
export async function reconcileProposalArtifacts({ session, loadBySession, loadById } = {}) {
  const byId = new Map();
  const sessionId = session?.contextRef?.sessionId;
  if (sessionId && typeof loadBySession === 'function') {
    const records = await loadBySession(sessionId);
    for (const item of records || []) if (item?.id) byId.set(item.id, item);
  }
  const artifactIds = new Set((session?.messages || []).flatMap(message => (message?.artifacts || [])
    .filter(artifact => artifact?.type === 'recipe_proposal' && typeof artifact.id === 'string')
    .map(artifact => artifact.id)));
  if (typeof loadById === 'function') {
    await Promise.all([...artifactIds].filter(id => !byId.has(id)).map(async (id) => {
      const item = await loadById(id);
      if (item?.id) byId.set(item.id, item);
    }));
  }
  return [...byId.values()];
}
