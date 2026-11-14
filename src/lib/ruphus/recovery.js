export function recoveryForAgentFrame(frame) {
  if (!frame || !['turn_failed', 'turn_interrupted'].includes(frame.type)) return null;
  return { turnId: frame.turnId || null, reason: frame.type === 'turn_interrupted' ? 'interrupted' : 'failed', ...(frame.code ? { code: frame.code } : {}) };
}

// Keep machine codes available for retry/stale-state logic, not as UI copy.
// Preparing a preview cannot save a recipe, so this reassurance is safe even
// when the preview response was lost. Command outcomes have different rules.
export function recipePreviewErrorMessage(error) {
  if (error?.code === 'stale') return 'Your saved recipe changed. Ask Ruphus for a fresh preview.';
  if (error?.code === 'idempotency_conflict') return 'This preview changed while it was being prepared. Reopen the recipe and try again.';
  if (error?.code === 'not_found') return 'This recipe preview is no longer available. Ask Ruphus for a fresh one.';
  if (error?.status === 401 || error?.status === 403) return 'Your session could not be verified. Try again; if it continues, check that you’re signed in.';
  if (error?.status === 429) return 'Recipe previews are temporarily busy. Wait a moment and try again.';
  if (error?.code === 'network_error') return 'The recipe service could not be reached. Your saved recipe is unchanged. Try again.';
  return 'This recipe preview could not be prepared. Your saved recipe is unchanged. Try reopening it, or ask Ruphus for a fresh preview.';
}
