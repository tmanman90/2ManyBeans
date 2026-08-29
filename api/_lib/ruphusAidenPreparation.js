import { toAidenProfile, assertValidAidenProfile } from '../../src/lib/aidenProfileValidation.js';

/**
 * The external adapter is injected so this state machine can be verified
 * without contacting Fellow. Only the immutable attempt snapshot is projected
 * into the adapter; callers cannot supply a recipe or model metadata.
 */
export async function prepareRuphusAttempt({ attempt, bean, adapter, now = new Date().toISOString() }) {
  if (!attempt?.id || !attempt.snapshot || !['created', 'preparing', 'uncertain'].includes(attempt.status)) {
    throw Object.assign(new Error('Attempt is not available for preparation.'), { code: 'invalid_attempt_state' });
  }
  const profile = toAidenProfile(attempt.snapshot, bean);
  assertValidAidenProfile(profile);
  try {
    const external = await adapter(profile);
    return { attempt: { status: 'profile_prepared', preparedAt: now, externalId: external?.profileId || null, link: external?.link || null }, external };
  } catch (error) {
    const uncertain = error?.code === 'timeout' || error?.name === 'AbortError';
    return { attempt: { status: uncertain ? 'uncertain' : 'failed', updatedAt: now }, error };
  }
}

export async function reconcileRuphusAttempt({ attempt, adapter, now = new Date().toISOString() }) {
  if (!attempt?.id || attempt.status !== 'uncertain' || typeof adapter?.reconcile !== 'function') {
    throw Object.assign(new Error('Attempt is not available for reconciliation.'), { code: 'invalid_attempt_state' });
  }
  const observed = await adapter.reconcile({ attemptId: attempt.id, externalId: attempt.externalId || null });
  if (!observed) return { attempt: { status: 'uncertain', updatedAt: now }, external: null };
  return { attempt: { status: 'profile_prepared', preparedAt: now, externalId: observed.profileId || attempt.externalId || null, link: observed.link || attempt.link || null }, external: observed };
}
